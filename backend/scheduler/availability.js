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
