import API_URL from '../config';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function createBooking(bookingData, token) {
  const res = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(bookingData),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body.message || `Failed to create booking (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body;
}

export async function getBookingById(id, token) {
  const res = await fetch(`${API_URL}/api/bookings/${id}`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Failed to load booking (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function cancelBooking(id, token) {
  const res = await fetch(`${API_URL}/api/bookings/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `Failed to cancel booking (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function getMyBookings(token) {
  const res = await fetch(`${API_URL}/api/bookings/mine`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Failed to load bookings (${res.status})`);
  }

  return res.json();
}

export async function getStationAvailability(stationIds, token) {
  if (!stationIds || stationIds.length === 0) return {};

  const url = `${API_URL}/api/bookings/availability?stationIds=${stationIds.join(',')}`;
  const res = await fetch(url, { headers: authHeaders(token) });

  if (!res.ok) {
    throw new Error(`Failed to load availability (${res.status})`);
  }

  return res.json();
}
