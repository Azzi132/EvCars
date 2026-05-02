import API_URL from "../config";

export async function fetchNearbyStations(
  lat,
  lon,
  radius = 10,
  maxresults = 50,
) {
  const url = `${API_URL}/api/stations/nearby?lat=${lat}&lon=${lon}&radius=${radius}&maxresults=${maxresults}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stations: ${res.status}`);
  }
  return res.json();
}
