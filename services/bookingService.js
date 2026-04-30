// API client for the booking endpoints. Every call needs a JWT — pass it
// in from whoever holds the auth context (typically the screen calling
// these). Errors thrown from here carry a `.status` property so callers
// can distinguish 404 vs 500 vs network failure if they want to.

import API_URL from '../config';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Shared "did the request fail?" helper. We only read the body on
// failure so the caller can still consume it on the success path.
async function throwIfError(res, fallbackMessage) {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  const err = new Error(body.message || `${fallbackMessage} (${res.status})`);
  err.status = res.status;
  throw err;
}

export async function createBooking(bookingData, token) {
  const res = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(bookingData),
  });
  await throwIfError(res, 'Failed to create booking');
  return res.json();
}

export async function getBookingById(id, token) {
  const res = await fetch(`${API_URL}/api/bookings/${id}`, {
    headers: authHeaders(token),
  });
  await throwIfError(res, 'Failed to load booking');
  return res.json();
}

export async function cancelBooking(id, token) {
  const res = await fetch(`${API_URL}/api/bookings/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await throwIfError(res, 'Failed to cancel booking');
  return res.json();
}

export async function getMyBookings(token) {
  const res = await fetch(`${API_URL}/api/bookings/mine`, {
    headers: authHeaders(token),
  });
  await throwIfError(res, 'Failed to load bookings');
  return res.json();
}

export async function getStationAvailability(stationIds, token) {
  // Backend returns 400 for an empty list, so short-circuit here.
  if (!stationIds || stationIds.length === 0) return {};

  const url = `${API_URL}/api/bookings/availability?stationIds=${stationIds.join(',')}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  await throwIfError(res, 'Failed to load availability');
  return res.json();
}
