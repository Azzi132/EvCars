// Is a charger free for a given time window, given the existing bookings
// already assigned to it? Pure function — the caller is responsible for
// loading `existingBookings` from the DB and filtering them to the same
// station + statuses that actually occupy the timeline ("scheduled" and
// "in_progress" with a non-null assignment).
//
// Overlap test is strict-inequality on both ends, so a slot can start
// exactly when another one ends (end times are exclusive).
//
// `ignoreBookingId` is the booking we're (re)scoring — without it, a
// scheduled booking would block its own slot when the reoptimizer asks
// whether an earlier window is free.

function isChargerFree(
  chargerId,
  start,
  end,
  existingBookings,
  ignoreBookingId = null,
) {
  for (const b of existingBookings) {
    if (!b.assignment) continue;
    if (b.assignment.chargerId !== chargerId) continue;
    if (ignoreBookingId && String(b._id) === String(ignoreBookingId)) continue;
    if (start < b.assignment.endTime && end > b.assignment.startTime) {
      return false;
    }
  }
  return true;
}

// A user can only be at one charger at a time. If [start, end) overlaps
// any of their other active bookings — same station or not, same charger
// or not — the candidate has to be rejected.
function hasUserConflict(start, end, userBookings, ignoreBookingId = null) {
  for (const b of userBookings) {
    if (!b.assignment) continue;
    if (ignoreBookingId && String(b._id) === String(ignoreBookingId)) continue;
    if (start < b.assignment.endTime && end > b.assignment.startTime) {
      return true;
    }
  }
  return false;
}

module.exports = { isChargerFree, hasUserConflict };
