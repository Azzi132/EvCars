// The whole booking scheduler in one file.
//
// What it does, end to end:
//   1. Mark any scheduled bookings whose end time has passed as "completed".
//   2. Pull the list of bookings that are still up for grabs (pending,
//      or scheduled but the start hasn't arrived so we can still move them).
//   3. Pull the list of bookings that are locked in (currently charging).
//      These block their charger but we don't touch them.
//   4. Greedy-assign: sort the up-for-grabs list by deadline (most urgent
//      first), then for each request walk the 15-minute slot grid on each
//      candidate charger and commit the lowest-cost slot that fits.
//   5. Persist the results, then promote any "scheduled" booking whose
//      start time has now arrived to "in_progress".
//
// The cost function is a weighted sum of two terms:
//   - priceTerm:  avg €/kWh over [start, end) × energyKWh   (real money)
//   - co2Term:    energyKWh × powerKW × CO2_FACTOR          (eco score)
//   - total = preferences.price * priceTerm + preferences.co2 * co2Term
//
// The deadline is a *hard* constraint (`deadlineMs = createdAt +
// maxWaitHours`). If no slot fits within it on any candidate charger,
// the booking goes infeasible — there's no "miss the deadline by a bit"
// here. That's a deliberate simplification from an earlier soft-penalty
// version: with a single duration knob the user already controls how
// flexible they're being.

const Booking = require("../models/Booking");
const { averagePriceOverInterval, co2ScoreForCharge } = require("./pricing");

// ---- Slot grid -----------------------------------------------------------

// Charging is allocated in 15-minute slots starting at :00, :15, :30, :45.
// Coarse enough to keep the search space small, fine enough that users
// don't lose much idle time, and it lines up with how time-of-use pricing
// is usually quoted.
const SLOT_MINUTES = 15;

// Round a moment up to the next slot boundary. Used to pick the earliest
// *legal* start time for a fresh assignment — we never schedule a slot
// starting in the middle of an ongoing minute.
function roundUpToSlot(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const extra = (SLOT_MINUTES - (mins % SLOT_MINUTES)) % SLOT_MINUTES;
  d.setMinutes(mins + extra);
  return d;
}

// Build a sorted list of busy intervals on one charger from a list of
// committed bookings. Plain millisecond ranges so the search loop can
// do cheap numeric comparisons.
function buildTimeline(chargerId, committedBookings) {
  return committedBookings
    .filter(
      (b) =>
        b.assignment &&
        b.assignment.chargerId === chargerId &&
        b.assignment.startTime &&
        b.assignment.endTime,
    )
    .map((b) => ({
      startMs: new Date(b.assignment.startTime).getTime(),
      endMs: new Date(b.assignment.endTime).getTime(),
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

// Does the half-open interval [startMs, endMs) clear every slot on the
// given timeline? Standard interval-overlap test.
function fitsInTimeline(timeline, startMs, endMs) {
  for (const slot of timeline) {
    if (startMs < slot.endMs && endMs > slot.startMs) return false;
  }
  return true;
}

// ---- Charging duration ---------------------------------------------------

// How long it takes to deliver `energyKWh` at a charger of `powerKW`.
// Returns Infinity for nonsense input so callers can skip the candidate.
function chargingDurationMinutes(energyKWh, powerKW) {
  if (!powerKW || powerKW <= 0) return Infinity;
  return (energyKWh / powerKW) * 60;
}

// ---- Cost & deadline -----------------------------------------------------

// The user's hard deadline, derived from when the booking was created
// and how long they said they'd wait. The scheduler will never assign a
// slot that ends after this.
function deadlineMsFor(request) {
  const created = new Date(request.createdAt).getTime();
  return created + request.maxWaitHours * 3600 * 1000;
}

// Score one (request, slot) pair. Lower = better.
//
// We split the cost into two named terms so the UI can show them and so
// tests can pin each behaviour independently.
function requestCost(request, candidate) {
  const start =
    candidate.startTime instanceof Date
      ? candidate.startTime
      : new Date(candidate.startTime);
  const end =
    candidate.endTime instanceof Date
      ? candidate.endTime
      : new Date(candidate.endTime);

  const avgPrice = averagePriceOverInterval(start, end);
  const priceTerm = avgPrice * request.energyDemandKWh;
  const co2Term = co2ScoreForCharge(request.energyDemandKWh, candidate.powerKW);

  const { price: wPrice, co2: wCo2 } = request.preferences;
  const total = wPrice * priceTerm + wCo2 * co2Term;

  return {
    total,
    estimatedCostEur: priceTerm,
    estimatedCo2Score: co2Term,
  };
}

// ---- Slot search ---------------------------------------------------------

// Walk every (candidate charger, slot) pair for `request` and return the
// lowest-cost slot that (a) fits the charger's existing timeline and
// (b) ends on or before the request's hard deadline. Returns null if
// nothing fits.
function findBestSlot(request, getTimeline, now) {
  const deadlineMs = deadlineMsFor(request);
  const earliestStart = roundUpToSlot(now);

  let best = null;

  for (const charger of request.candidateChargers) {
    const durationMin = chargingDurationMinutes(
      request.energyDemandKWh,
      charger.powerKW,
    );
    if (!isFinite(durationMin)) continue;
    const durationMs = durationMin * 60 * 1000;

    // A slot starting later than (deadline - duration) can't possibly
    // finish in time, so we cap the search there. This is what makes the
    // deadline a hard constraint rather than a soft preference.
    const lastStartMs = deadlineMs - durationMs;
    if (lastStartMs < earliestStart.getTime()) continue;

    const timeline = getTimeline(charger.id);

    for (
      let startMs = earliestStart.getTime();
      startMs <= lastStartMs;
      startMs += SLOT_MINUTES * 60 * 1000
    ) {
      const endMs = startMs + durationMs;
      if (!fitsInTimeline(timeline, startMs, endMs)) continue;

      const candidate = {
        chargerId: charger.id,
        chargerLabel: charger.label,
        powerKW: charger.powerKW,
        startTime: new Date(startMs),
        endTime: new Date(endMs),
      };

      const cost = requestCost(request, candidate);

      if (!best || cost.total < best._totalCost) {
        best = {
          ...candidate,
          estimatedCostEur: cost.estimatedCostEur,
          estimatedCo2Score: cost.estimatedCo2Score,
          _totalCost: cost.total,
        };
      }
    }
  }

  return best;
}

// ---- Greedy assignment ---------------------------------------------------

// Optimal multi-resource scheduling is NP-hard, so we don't try.
//
// Greedy intuition: sort requests by deadline (most urgent first), then
// for each request lock in its locally best slot. By the time a less
// urgent request is considered, the urgent ones already have their seats
// — so the urgent ones never get squeezed out.
//
// We tie-break on createdAt so two requests with the same deadline still
// have a stable order (older booking first — fairness).
function assign(requests, externalCommittedBookings, now) {
  // Per-charger busy timelines. Built lazily on first lookup so we only
  // pay for chargers we actually consider this run.
  const timelines = new Map();
  const getTimeline = (chargerId) => {
    if (!timelines.has(chargerId)) {
      timelines.set(
        chargerId,
        buildTimeline(chargerId, externalCommittedBookings),
      );
    }
    return timelines.get(chargerId);
  };

  const sorted = [...requests].sort((a, b) => {
    const dlA = deadlineMsFor(a);
    const dlB = deadlineMsFor(b);
    if (dlA !== dlB) return dlA - dlB;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const results = [];

  for (const req of sorted) {
    const best = findBestSlot(req, getTimeline, now);
    if (!best) {
      results.push({ requestId: String(req._id), status: "infeasible" });
      continue;
    }
    // Commit: the chosen slot now blocks this charger for later requests.
    getTimeline(best.chargerId).push({
      startMs: new Date(best.startTime).getTime(),
      endMs: new Date(best.endTime).getTime(),
    });
    getTimeline(best.chargerId).sort((a, b) => a.startMs - b.startMs);

    results.push({
      requestId: String(req._id),
      status: "scheduled",
      assignment: best,
    });
  }

  return results;
}

// ---- Top-level pass ------------------------------------------------------

async function runScheduler(now = new Date()) {
  const startedAt = Date.now();

  // 1. Anything whose slot has ended is done.
  await Booking.updateMany(
    {
      status: "scheduled",
      "assignment.endTime": { $lte: now },
    },
    { $set: { status: "completed" } },
  );

  // 2. Candidates the scheduler is allowed to (re)assign.
  //    A scheduled booking that hasn't started yet is fair game — we
  //    might find a better slot for it as new requests arrive.
  const reoptimizable = await Booking.find({
    $or: [
      { status: "pending" },
      {
        status: "scheduled",
        "assignment.startTime": { $gt: now },
      },
    ],
  }).lean();

  // 3. Currently-running bookings — they block their charger's timeline
  //    but we don't touch their assignments.
  const committed = await Booking.find({
    status: { $in: ["scheduled", "in_progress"] },
    "assignment.startTime": { $lte: now },
    "assignment.endTime": { $gt: now },
  }).lean();

  // 4. Greedy.
  const results = assign(reoptimizable, committed, now);

  // 5a. Persist. One updateOne per result; bulkWrite groups them into
  //     a single round-trip.
  const ops = results.map((r) => {
    if (r.status === "infeasible") {
      return {
        updateOne: {
          filter: { _id: r.requestId },
          update: { $set: { status: "infeasible", assignment: null } },
        },
      };
    }
    const a = r.assignment;
    return {
      updateOne: {
        filter: { _id: r.requestId },
        update: {
          $set: {
            status: "scheduled",
            assignment: {
              chargerId: a.chargerId,
              chargerLabel: a.chargerLabel,
              powerKW: a.powerKW,
              startTime: a.startTime,
              endTime: a.endTime,
              estimatedCostEur: a.estimatedCostEur,
              estimatedCo2Score: a.estimatedCo2Score,
              assignedAt: new Date(),
            },
          },
        },
      },
    };
  });

  if (ops.length > 0) {
    await Booking.bulkWrite(ops);
  }

  // 5b. Promote scheduled → in_progress for anything whose slot just
  //     started. Done as a separate updateMany so it picks up bookings
  //     we just wrote above as well as any that aged in naturally.
  await Booking.updateMany(
    {
      status: "scheduled",
      "assignment.startTime": { $lte: now },
      "assignment.endTime": { $gt: now },
    },
    { $set: { status: "in_progress" } },
  );

  const durationMs = Date.now() - startedAt;
  const scheduledCount = results.filter((r) => r.status === "scheduled").length;
  const infeasibleCount = results.filter(
    (r) => r.status === "infeasible",
  ).length;
  console.log(
    `[scheduler] tick: ${reoptimizable.length} candidates → ` +
      `${scheduledCount} scheduled, ${infeasibleCount} infeasible (${durationMs}ms)`,
  );

  return {
    scheduledCount,
    infeasibleCount,
    considered: reoptimizable.length,
  };
}

module.exports = {
  runScheduler,
  // Exported for tests:
  assign,
  requestCost,
  findBestSlot,
  chargingDurationMinutes,
  deadlineMsFor,
  SLOT_MINUTES,
  roundUpToSlot,
  buildTimeline,
  fitsInTimeline,
};
