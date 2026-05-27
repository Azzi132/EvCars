"use strict";

const CHARGER_POWERS = [11, 22, 50, 150];
const POWER_LABELS = {
  11: "Type 2 — 11 kW",
  22: "Type 2 — 22 kW",
  50: "CCS — 50 kW",
  150: "CCS — 150 kW",
};

function makeStations(nStations, chargersPerStation) {
  const stations = [];
  for (let s = 0; s < nStations; s++) {
    const chargers = [];
    for (let c = 0; c < chargersPerStation; c++) {
      const powerKW = CHARGER_POWERS[c % CHARGER_POWERS.length];
      chargers.push({
        id: c + 1,
        label: POWER_LABELS[powerKW] || `${powerKW} kW`,
        powerKW,
      });
    }
    stations.push({
      stationId: 900000 + s,
      stationName: `Test Station ${s + 1}`,
      stationLat: 55.6 + (s % 100) * 0.001,
      stationLon: 12.5 + (s % 100) * 0.001,
      chargers,
    });
  }
  return stations;
}

module.exports = { makeStations, CHARGER_POWERS, POWER_LABELS };
