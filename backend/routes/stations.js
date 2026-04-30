// Thin proxy in front of the Open Charge Map (OCM) public API.
//
// The mobile app calls /api/stations/nearby and we translate that into an
// OCM POI lookup, then flatten OCM's verbose schema into the small object
// shape the client actually uses (see services/stationService.js on the
// frontend). Going through the backend keeps the OCM API key off the
// device and gives us a single place to reshape the response.

const express = require("express");

const router = express.Router();

const OCM_BASE_URL = "https://api.openchargemap.io/v3/poi/";

router.get("/nearby", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius) || 10;
  const maxresults = parseInt(req.query.maxresults, 10) || 50;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res
      .status(400)
      .json({ message: "Query params 'lat' and 'lon' are required numbers." });
  }

  try {
    // Build the OCM URL. `compact=true&verbose=false` keeps the response
    // small, which matters because we forward it over a mobile connection.
    const url = new URL(OCM_BASE_URL);
    url.searchParams.set("output", "json");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("distance", radius);
    url.searchParams.set("distanceunit", "KM");
    url.searchParams.set("maxresults", maxresults);
    url.searchParams.set("compact", "true");
    url.searchParams.set("verbose", "false");
    url.searchParams.set("key", process.env.OCM_API_KEY);

    const ocmRes = await fetch(url.toString());

    if (!ocmRes.ok) {
      console.error(
        `OCM upstream error: ${ocmRes.status} ${ocmRes.statusText}`
      );
      return res
        .status(502)
        .json({ message: "Failed to fetch stations from upstream." });
    }

    const pois = await ocmRes.json();

    // Drop POIs without coordinates (they can't be placed on the map) and
    // reshape what's left into the flat schema the frontend expects.
    const stations = pois
      .filter(
        (poi) =>
          poi?.AddressInfo?.Latitude != null &&
          poi?.AddressInfo?.Longitude != null
      )
      .map((poi) => {
        const connections = poi.Connections ?? [];

        const powers = connections
          .map((c) => c.PowerKW)
          .filter((p) => typeof p === "number" && p > 0);
        const maxPowerKW = powers.length ? Math.max(...powers) : null;

        const connectors = connections
          .filter((c) => c.ID != null)
          .map((c) => ({
            id: c.ID,
            connectionType: c.ConnectionType?.Title ?? "Unknown",
            level: c.Level?.Title ?? null,
            powerKW: typeof c.PowerKW === "number" ? c.PowerKW : null,
            currentType: c.CurrentType?.Title ?? null,
            quantity: c.Quantity ?? 1,
          }));

        return {
          id: poi.ID,
          name: poi.AddressInfo.Title,
          latitude: poi.AddressInfo.Latitude,
          longitude: poi.AddressInfo.Longitude,
          address: poi.AddressInfo.AddressLine1 ?? null,
          town: poi.AddressInfo.Town ?? null,
          distanceKM:
            typeof poi.AddressInfo.Distance === "number"
              ? poi.AddressInfo.Distance
              : null,
          operator: poi.OperatorInfo?.Title ?? null,
          connectorCount:
            poi.NumberOfPoints ?? connections.length ?? 0,
          maxPowerKW,
          statusTitle: poi.StatusType?.Title ?? null,
          usageType: poi.UsageType?.Title ?? null,
          connectors,
        };
      });

    res.json(stations);
  } catch (err) {
    console.error("Stations route error:", err);
    res.status(502).json({ message: "Failed to fetch stations." });
  }
});

module.exports = router;
