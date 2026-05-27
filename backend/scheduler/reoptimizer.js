const Booking = require("./models");
const { findBestSlot } = require("./scheduler");
const { PROPOSAL_MIN_GAIN_MIN } = require("./config");

const MIN_GAIN_MS = PROPOSAL_MIN_GAIN_MIN * 60_000;

async function tickReoptimize() {
  const now = new Date();
  const stationIds = await Booking.distinct("stationId", {
    status: { $in: ["scheduled", "in_progress"] },
  });

  let proposed = 0;
  let cleared = 0;

  for (const stationId of stationIds) {
    const existing = await Booking.find({
      stationId,
      status: { $in: ["scheduled", "in_progress"] },
      assignment: { $ne: null },
    }).lean();

    const future = await Booking.find({
      stationId,
      status: "scheduled",
      "assignment.startTime": { $gt: now },
    }).sort({ "assignment.startTime": 1 });

    for (const b of future) {
      const userBookings = await Booking.find({
        userId: b.userId,
        status: { $in: ["scheduled", "in_progress"] },
        assignment: { $ne: null },
        _id: { $ne: b._id },
      }).lean();
      const cand = findBestSlot({
        request: b,
        existingBookings: existing,
        userBookings,
        now,
        ignoreBookingId: b._id,
      });
      const earlierBy =
        cand && b.assignment ? b.assignment.startTime - cand.start : 0;

      if (cand && earlierBy >= MIN_GAIN_MS) {
        b.proposedReschedule = {
          newStart: cand.start,
          newEnd: cand.end,
          newChargerId: cand.chargerId,
          newChargerLabel: cand.chargerLabel,
          newPowerKW: cand.powerKW,
          newScore: cand.score,
          newEstimatedCostDkk: cand.estimatedCostDkk,
          newEstimatedCo2Score: cand.estimatedCo2Score,
          proposedAt: now,
        };
        await b.save();
        proposed++;
      } else if (b.proposedReschedule) {
        b.proposedReschedule = null;
        await b.save();
        cleared++;
      }
    }
  }
  return { proposed, cleared };
}

module.exports = { tickReoptimize };
