const Booking = require("./models");
const { findBestSlot } = require("./scheduler");

const OCCUPYING = ["scheduled", "in_progress"];

async function loadExistingFor(stationId) {
  return Booking.find({
    stationId,
    status: { $in: OCCUPYING },
    assignment: { $ne: null },
  }).lean();
}

async function loadUserBookings(userId, ignoreBookingId) {
  const query = {
    userId,
    status: { $in: OCCUPYING },
    assignment: { $ne: null },
  };
  if (ignoreBookingId) query._id = { $ne: ignoreBookingId };
  return Booking.find(query).lean();
}

async function assignPending(doc) {
  const [existing, userBookings] = await Promise.all([
    loadExistingFor(doc.stationId),
    loadUserBookings(doc.userId, doc._id),
  ]);
  const cand = findBestSlot({
    request: doc,
    existingBookings: existing,
    userBookings,
    now: new Date(),
    ignoreBookingId: doc._id,
  });
  if (!cand) {
    await Booking.deleteOne({ _id: doc._id });
    return null;
  }
  doc.assignment = {
    chargerId: cand.chargerId,
    chargerLabel: cand.chargerLabel,
    powerKW: cand.powerKW,
    startTime: cand.start,
    endTime: cand.end,
    estimatedCostDkk: cand.estimatedCostDkk,
    estimatedCo2Score: cand.estimatedCo2Score,
    assignedAt: new Date(),
  };
  doc.status = "scheduled";
  await doc.save();
  return doc;
}

async function acceptReschedule(id, userId) {
  const b = await Booking.findOne({ _id: id, userId });
  if (!b) throw new Error("Booking not found.");
  if (!b.proposedReschedule) {
    throw new Error("No reschedule proposal to accept.");
  }
  const p = b.proposedReschedule;
  b.assignment = {
    chargerId: p.newChargerId,
    chargerLabel: p.newChargerLabel,
    powerKW: p.newPowerKW,
    startTime: p.newStart,
    endTime: p.newEnd,
    estimatedCostDkk: p.newEstimatedCostDkk,
    estimatedCo2Score: p.newEstimatedCo2Score,
    assignedAt: new Date(),
  };
  b.proposedReschedule = null;
  await b.save();
  return b;
}

async function rejectReschedule(id, userId) {
  const b = await Booking.findOne({ _id: id, userId });
  if (!b) throw new Error("Booking not found.");
  b.proposedReschedule = null;
  await b.save();
  return b;
}

module.exports = { assignPending, acceptReschedule, rejectReschedule };
