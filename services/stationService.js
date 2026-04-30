// Thin wrapper around GET /api/stations/nearby. The backend proxies this
// to Open Charge Map and reshapes the response — see backend/routes/stations.js
// for the field shape returned here.
//
// No auth header is needed: the endpoint is public.

import API_URL from '../config';

export async function fetchNearbyStations(lat, lon, radius = 10, maxresults = 50) {
  const url = `${API_URL}/api/stations/nearby?lat=${lat}&lon=${lon}&radius=${radius}&maxresults=${maxresults}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stations: ${res.status}`);
  }
  return res.json();
}
