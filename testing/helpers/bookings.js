"use strict";

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function makeExistingForExp1({ n, chargers, now }) {
  const out = [];
  const nowMs = now.getTime();
  for (let i = 0; i < n; i++) {
    const charger = chargers[Math.floor(Math.random() * chargers.length)];
    const startMs = nowMs + Math.random() * DAY_MS;
    const durMs = randInt(30, 90) * 60_000;
    out.push({
      _id: `exist-${i}`,
      assignment: {
        chargerId: charger.id,
        startTime: new Date(startMs),
        endTime: new Date(startMs + durMs),
      },
    });
  }
  return out;
}

function makeActiveBookingDocs({
  stations,
  count,
  userIds,
  now,
  windowHours = 168,
  spread = "cycle",
}) {
  const docs = [];
  const nowMs = now.getTime();
  const windowMs = windowHours * HOUR_MS;
  const perStation = stations[0].chargers.length;
  for (let i = 0; i < count; i++) {
    const station = stations[i % stations.length];
    const charger =
      spread === "even"
        ? station.chargers[Math.floor(i / stations.length) % perStation]
        : station.chargers[i % station.chargers.length];
    const userId = userIds[i % userIds.length];
    const startMs = nowMs + Math.random() * windowMs;
    const durMs = randInt(30, 90) * 60_000;
    docs.push({
      userId,
      stationId: station.stationId,
      stationName: station.stationName,
      stationLat: station.stationLat,
      stationLon: station.stationLon,
      candidateChargers: station.chargers,
      energyDemandKWh: 25,
      maxWaitHours: 24,
      preferences: { price: 0.5, co2: 0.5 },
      status: "scheduled",
      assignment: {
        chargerId: charger.id,
        chargerLabel: charger.label,
        powerKW: charger.powerKW,
        startTime: new Date(startMs),
        endTime: new Date(startMs + durMs),
        estimatedCostDkk: 0,
        estimatedCo2Score: 0,
        assignedAt: new Date(),
      },
      createdAt: new Date(),
    });
  }
  return docs;
}

function makePendingDoc({ station, userId }) {
  return {
    userId,
    stationId: station.stationId,
    stationName: station.stationName,
    stationLat: station.stationLat,
    stationLon: station.stationLon,
    candidateChargers: station.chargers,
    energyDemandKWh: 25,
    maxWaitHours: 12,
    preferences: { price: 0.5, co2: 0.5 },
    status: "pending",
  };
}

function makeHttpBody({ station }) {
  return {
    stationId: station.stationId,
    stationName: station.stationName,
    stationLat: station.stationLat,
    stationLon: station.stationLon,
    candidateChargers: station.chargers,
    energyDemandKWh: 25,
    maxWaitHours: 8,
    preferences: { price: 0.7, co2: 0.3 },
  };
}

const PREF_MIXES = [
  { price: 0.5, co2: 0.5 },
  { price: 1, co2: 0 },
  { price: 0, co2: 1 },
];
function makeProdScaleHttpBody({ station }) {
  return {
    stationId: station.stationId,
    stationName: station.stationName,
    stationLat: station.stationLat,
    stationLon: station.stationLon,
    candidateChargers: station.chargers,
    energyDemandKWh: randInt(15, 40),
    maxWaitHours: 4,
    preferences: PREF_MIXES[Math.floor(Math.random() * PREF_MIXES.length)],
  };
}

module.exports = {
  randInt,
  makeExistingForExp1,
  makeActiveBookingDocs,
  makePendingDoc,
  makeHttpBody,
  makeProdScaleHttpBody,
};
