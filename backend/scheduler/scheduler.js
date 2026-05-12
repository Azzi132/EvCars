// findBestSlot: the heart of the scheduler. Pure function — no DB I/O.
// Hand it a request plus the bookings already pinned to its station and
// it returns the best candidate slot, or null if nothing fits inside the
// user's wait window.
//
// Tiebreak order: lower score, then earlier start, then lower powerKW.
// The powerKW tiebreak prefers slower chargers when scores match, which
// is consistent with the eco-favouring direction of the cost function.

const { generateCandidates } = require("./candidates");

function findBestSlot({
  request,
  existingBookings,
  userBookings = [],
  now = new Date(),
  ignoreBookingId = null,
}) {
  const candidates = generateCandidates({
    request,
    existingBookings,
    userBookings,
    now,
    ignoreBookingId,
  });
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (
      c.score < best.score ||
      (c.score === best.score && c.start < best.start) ||
      (c.score === best.score &&
        +c.start === +best.start &&
        c.powerKW < best.powerKW)
    ) {
      best = c;
    }
  }
  return best;
}

module.exports = { findBestSlot };
