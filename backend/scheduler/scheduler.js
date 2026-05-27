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
