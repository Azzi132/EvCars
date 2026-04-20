const Booking = require("../models/Booking");
const greedy = require("./strategies/greedy");

async function runScheduler(now = new Date()) {
  const startedAt = Date.now();

  await Booking.updateMany(
    {
      status: "scheduled",
      "assignment.endTime": { $lte: now },
    },
    { $set: { status: "completed" } },
  );

  const reoptimizable = await Booking.find({
    $or: [
      { status: "pending" },
      {
        status: "scheduled",
        "assignment.startTime": { $gt: now },
      },
    ],
  }).lean();

  const committed = await Booking.find({
    status: { $in: ["scheduled", "in_progress"] },
    "assignment.startTime": { $lte: now },
    "assignment.endTime": { $gt: now },
  }).lean();

  const results = greedy.assign(reoptimizable, committed, now);

  const priorRevisionById = new Map(
    reoptimizable.map((b) => [String(b._id), b.assignment?.revisionCount || 0]),
  );

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
