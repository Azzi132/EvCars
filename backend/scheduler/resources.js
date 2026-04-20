const SLOT_MINUTES = 15;

function roundUpToSlot(date, slotMinutes = SLOT_MINUTES) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const extra = (slotMinutes - (mins % slotMinutes)) % slotMinutes;
  d.setMinutes(mins + extra);
  return d;
}

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

function fitsInTimeline(timeline, startMs, endMs, excludeBookingId = null) {
  for (const slot of timeline) {
    if (excludeBookingId && slot.bookingId === excludeBookingId) continue;
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
