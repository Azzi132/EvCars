// Scheduler orchestration. One `runScheduler(now)` call does a full
// scheduling pass: advance lifecycle states, ask the strategy to assign
// slots to anything pending, and persist the result.
//
// Each pass goes through five phases:
//   1. Mark scheduled bookings whose end time passed as "completed".
//   2. Pull bookings that are still up for grabs (pending, or scheduled
//      but the start time is still in the future so re-optimising is OK).
//   3. Pull bookings that are locked in (scheduled/in_progress and
//      currently running) — those occupy timeline slots but cannot be
//      moved.
//   4. Hand both lists to the greedy strategy, which decides who gets
//      which charger and when.
//   5. Bulk-write the strategy's results, then promote any "scheduled"
//      bookings whose start time has now arrived to "in_progress".

const Booking = require("../models/Booking");
const greedy = require("./strategies/greedy");

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
  //    A scheduled booking that hasn't started yet is fair game — we may
  //    find a better slot for it as new requests arrive.
  const reoptimizable = await Booking.find({
    $or: [
      { status: "pending" },
      {
        status: "scheduled",
        "assignment.startTime": { $gt: now },
      },
    ],
  }).lean();

  // 3. Currently-running bookings — these block their charger's timeline
  //    but we don't touch their assignments.
  const committed = await Booking.find({
    status: { $in: ["scheduled", "in_progress"] },
    "assignment.startTime": { $lte: now },
    "assignment.endTime": { $gt: now },
  }).lean();

  // 4. Strategy decides who gets what.
  const results = greedy.assign(reoptimizable, committed, now);

  // Track existing revisionCounts so we can increment them on update.
  // Lets us see, on a given booking, how many times it's been moved.
  const priorRevisionById = new Map(
    reoptimizable.map((b) => [String(b._id), b.assignment?.revisionCount || 0]),
  );

  // 5a. Build bulk write ops: one per result.
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
              deadlinePenaltyMinutes: a.deadlinePenaltyMinutes,
              waitingPenaltyMinutes: a.waitingPenaltyMinutes,
              assignedAt: new Date(),
              revisionCount: (priorRevisionById.get(r.requestId) || 0) + 1,
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

  return { scheduledCount, infeasibleCount, considered: reoptimizable.length };
}

module.exports = { runScheduler };
