// DB-side glue around the pure scheduler. Loads station context, calls
// findBestSlot, writes the result back. The route layer talks to this
// module, not to the scheduler internals.

const Booking = require("./models");
const { findBestSlot } = require("./scheduler");

// Bookings that physically occupy the timeline on a given charger.
const OCCUPYING = ["scheduled", "in_progress"];

async function loadExistingFor(stationId) {
  return Booking.find({
    stationId,
    status: { $in: OCCUPYING },
    assignment: { $ne: null },
  }).lean();
}

// All of a user's other active bookings — across every station — so a
// new booking can't be placed during a time window the user is already
// charging somewhere else.
async function loadUserBookings(userId, ignoreBookingId) {
  const query = {
    userId,
    status: { $in: OCCUPYING },
    assignment: { $ne: null },
  };
  if (ignoreBookingId) query._id = { $ne: ignoreBookingId };
  return Booking.find(query).lean();
}

// Assigns a pending booking by finding the best free slot. On success
// the doc flips to "scheduled" with an assignment and is saved in place.
// On failure the doc is deleted outright — the user will see "no slot
// found" in the booking flow and there's no reason to keep an orphaned
// row around that the user can't see or act on.
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

// Copy whatever proposal is currently on the booking into the assignment.
// We re-read inside the function so the user always accepts the *latest*
// proposal even if the reoptimizer rewrote it between display and tap.
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
