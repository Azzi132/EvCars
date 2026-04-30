// Greedy + local-swap assignment strategy.
//
// Optimal multi-resource scheduling is NP-hard, so we don't try. Instead:
//
//   Pass 1 — Sort requests by urgency (most urgent first), break ties on
//   creation order. Walk that list and give each request its locally
//   best slot on its locally best candidate charger. Each placement
//   "commits" — its charger's timeline is updated so later requests
//   route around it.
//
//   Pass 2 — Try pairwise swaps. For every pair of requests already on
//   the *same* charger, see if swapping their slots lowers the combined
//   cost. Repeat up to MAX_SWAP_PASSES times or until no improvement.
//   Same-charger only because that's where the timeline-fit check is
//   straightforward; cross-charger swaps would need to model two
//   timelines simultaneously.
//
// The greedy step alone is good enough for most situations. The swap
// passes catch the cases where high-urgency requests grab slots that
// later turn out to be more useful to someone else.

const {
  chargingDurationMinutes,
  urgencyScore,
  requestCost,
} = require("../urgency");
const {
  SLOT_MINUTES,
  roundUpToSlot,
  buildTimeline,
  fitsInTimeline,
} = require("../resources");

const MAX_SWAP_PASSES = 3;

function assign(requests, externalCommittedBookings, now) {
  // Per-charger busy timelines. Lazily built on first lookup so we only
  // pay for the chargers we actually consider.
  const timelines = new Map();

  const requestsSorted = [...requests].sort((a, b) => {
    const ua = urgencyScore(a, now);
    const ub = urgencyScore(b, now);
    if (ub !== ua) return ub - ua;
    // Tie-break: older booking first, so users aren't perpetually
    // jumped by newer requests with the same urgency.
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const results = new Map();

  const getTimeline = (chargerId) => {
    if (!timelines.has(chargerId)) {
      timelines.set(chargerId, buildTimeline(chargerId, externalCommittedBookings));
    }
    return timelines.get(chargerId);
  };

  // Pass 1: greedy first-fit-by-cost.
  for (const req of requestsSorted) {
    const best = findBestAssignment(req, getTimeline, now);
    if (!best) {
      results.set(String(req._id), { requestId: String(req._id), status: "infeasible" });
      continue;
    }
    commit(getTimeline(best.chargerId), best, String(req._id));
    results.set(String(req._id), {
      requestId: String(req._id),
      status: "scheduled",
      assignment: best,
    });
  }

  // Pass 2: pairwise local swaps.
  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < requestsSorted.length; i++) {
      for (let j = i + 1; j < requestsSorted.length; j++) {
        const ri = requestsSorted[i];
        const rj = requestsSorted[j];
        const resI = results.get(String(ri._id));
        const resJ = results.get(String(rj._id));
        if (resI.status !== "scheduled" || resJ.status !== "scheduled") continue;

        const swapped = trySwap(ri, rj, resI.assignment, resJ.assignment, getTimeline, now);
        if (swapped) {
          results.set(String(ri._id), {
            requestId: String(ri._id),
            status: "scheduled",
            assignment: swapped.i,
          });
          results.set(String(rj._id), {
            requestId: String(rj._id),
            status: "scheduled",
            assignment: swapped.j,
          });
          improved = true;
        }
      }
    }
    // Early exit if a full pass produced no swaps — further passes
    // can't improve things.
    if (!improved) break;
  }

  return Array.from(results.values());
}

// Search every (candidate charger, slot) pair for `request` and return
// the one with the lowest cost. We search slots from "now rounded up to
// the next 15 min" out to 6 hours past the deadline — past the deadline
// is allowed but expensive (see DEADLINE_PENALTY in urgency.js), and
// occasionally the only feasible option.
function findBestAssignment(request, getTimeline, now) {
  const deadlineMs = new Date(request.deadline).getTime();
  const earliestStart = roundUpToSlot(now);
  const horizonMs = deadlineMs + 6 * 3600 * 1000;

  let best = null;

  for (const charger of request.candidateChargers) {
    const durationMin = chargingDurationMinutes(
      request.energyDemandKWh,
      charger.powerKW
    );
    if (!isFinite(durationMin)) continue;
    const durationMs = durationMin * 60 * 1000;

    const timeline = getTimeline(charger.id);

    for (
      let startMs = earliestStart.getTime();
      startMs <= horizonMs;
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

      const cost = requestCost(request, candidate, now);
      const fullAssignment = {
        ...candidate,
        estimatedCostEur: cost.estimatedCostEur,
        deadlinePenaltyMinutes: cost.deadlinePenaltyMinutes,
        waitingPenaltyMinutes: cost.waitingPenaltyMinutes,
        _totalCost: cost.total,
      };

      if (!best || fullAssignment._totalCost < best._totalCost) {
        best = fullAssignment;
      }
    }
  }

  return best;
}

// Add a freshly-placed slot to a charger's timeline so subsequent
// placements see it. Mutates `timeline` in place.
function commit(timeline, assignment, bookingId) {
  timeline.push({
    startMs: new Date(assignment.startTime).getTime(),
    endMs: new Date(assignment.endTime).getTime(),
    bookingId,
  });
  timeline.sort((a, b) => a.startMs - b.startMs);
}

// Attempt to move request I into J's slot and J into I's. If both fit
// and the new combined cost is strictly lower (epsilon avoids accepting
// no-op swaps caused by floating-point noise), commit the swap.
function trySwap(reqI, reqJ, assignI, assignJ, getTimeline, now) {
  // Same-charger only — see file header for why.
  if (assignI.chargerId !== assignJ.chargerId) return null;

  const timeline = getTimeline(assignI.chargerId);
  const idI = String(reqI._id);
  const idJ = String(reqJ._id);

  const iAtJ = buildCandidate(reqI, assignJ, now);
  const jAtI = buildCandidate(reqJ, assignI, now);
  if (!iAtJ || !jAtI) return null;

  const iFits = fitsInTimeline(timeline, iAtJ.startMs, iAtJ.endMs, idI);
  // For J's check, build a hypothetical timeline that already has I in
  // its new spot — otherwise J would still see I's old slot and might
  // wrongly conclude there's no room.
  const jFits = fitsInTimeline(
    timeline.filter((t) => t.bookingId !== idJ).concat([
      { startMs: iAtJ.startMs, endMs: iAtJ.endMs, bookingId: idI },
    ]),
    jAtI.startMs,
    jAtI.endMs,
    idJ
  );
  if (!iFits || !jFits) return null;

  const currentTotal = assignI._totalCost + assignJ._totalCost;
  const swappedTotal = iAtJ._totalCost + jAtI._totalCost;
  // 1e-9 epsilon: only accept genuine improvements, not float jitter.
  if (swappedTotal >= currentTotal - 1e-9) return null;

  const oldIslot = timeline.findIndex((t) => t.bookingId === idI);
  if (oldIslot >= 0) timeline.splice(oldIslot, 1);
  const oldJslot = timeline.findIndex((t) => t.bookingId === idJ);
  if (oldJslot >= 0) timeline.splice(oldJslot, 1);
  commit(timeline, iAtJ, idI);
  commit(timeline, jAtI, idJ);

  return { i: iAtJ, j: jAtI };
}

// Build a full assignment for `request` that starts at `slotTemplate`'s
// start time on `slotTemplate`'s charger. End time is recomputed because
// charging duration depends on the *requesting* charger's power, which
// equals the template's power (same charger) but the energy demand may
// differ between requests.
function buildCandidate(request, slotTemplate, now) {
  const charger = request.candidateChargers.find(
    (c) => c.id === slotTemplate.chargerId
  );
  if (!charger) return null;
  const durationMin = chargingDurationMinutes(
    request.energyDemandKWh,
    charger.powerKW
  );
  if (!isFinite(durationMin)) return null;

  const startMs = new Date(slotTemplate.startTime).getTime();
  const endMs = startMs + durationMin * 60 * 1000;

  const candidate = {
    chargerId: charger.id,
    chargerLabel: charger.label,
    powerKW: charger.powerKW,
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    startMs,
    endMs,
  };
  const cost = requestCost(request, candidate, now);
  return {
    ...candidate,
    estimatedCostEur: cost.estimatedCostEur,
    deadlinePenaltyMinutes: cost.deadlinePenaltyMinutes,
    waitingPenaltyMinutes: cost.waitingPenaltyMinutes,
    _totalCost: cost.total,
  };
}

module.exports = { assign };
