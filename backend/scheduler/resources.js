// Time-slot helpers used by the scheduler.
//
// Charging is allocated in 15-minute slots starting at :00, :15, :30, :45.
// That's coarse enough that the scheduler doesn't have to consider a huge
// search space, fine enough that users don't lose too much idle time, and
// it lines up with how time-of-use pricing tends to be expressed.

const SLOT_MINUTES = 15;

// Round a moment up to the next slot boundary. We use this to pick the
// earliest *legal* start time for a new assignment — we never schedule
// a slot starting in the middle of an ongoing minute.
function roundUpToSlot(date, slotMinutes = SLOT_MINUTES) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const extra = (slotMinutes - (mins % slotMinutes)) % slotMinutes;
  d.setMinutes(mins + extra);
  return d;
}

// Build a sorted timeline of busy intervals for one charger from a list
// of committed bookings. Returns plain millisecond ranges so the search
// loop can do cheap numeric comparisons.
function buildTimeline(chargerId, committedBookings) {
  return committedBookings
    .filter(
      (b) =>
        b.assignment &&
        b.assignment.chargerId === chargerId &&
        b.assignment.startTime &&
        b.assignment.endTime
    )
    .map((b) => ({
      startMs: new Date(b.assignment.startTime).getTime(),
      endMs: new Date(b.assignment.endTime).getTime(),
      bookingId: String(b._id),
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

// Does the half-open interval [startMs, endMs) clear every slot already
// on the timeline? `excludeBookingId` lets the swap logic ignore a
// booking that is *about to be moved* so it doesn't conflict with itself.
function fitsInTimeline(timeline, startMs, endMs, excludeBookingId = null) {
  for (const slot of timeline) {
    if (excludeBookingId && slot.bookingId === excludeBookingId) continue;
    // Standard interval-overlap test.
    if (startMs < slot.endMs && endMs > slot.startMs) return false;
  }
  return true;
}

module.exports = {
  SLOT_MINUTES,
  roundUpToSlot,
  buildTimeline,
  fitsInTimeline,
};
