// Pure-function smoke test for the scheduler. No DB required — useful
// for eyeballing the algorithm and pricing tables locally.
//
//   node backend/scheduler/example.js

const { findBestSlot } = require("./scheduler");

const request = {
  stationId: 999001,
  candidateChargers: [
    { id: 1, label: "Type 2 — 22 kW", powerKW: 22 },
    { id: 2, label: "CCS — 50 kW", powerKW: 50 },
  ],
  energyDemandKWh: 25,
  maxWaitHours: 8,
  preferences: { price: 0.9, co2: 0.1 }, // cheap-focused
};

const existingBookings = []; // no one else booked yet

const best = findBestSlot({ request, existingBookings, now: new Date() });

console.log("--- Sample request -----------------------------------------");
console.log(JSON.stringify(request, null, 2));
console.log();
console.log("--- Sample MongoDB Booking document (pending → scheduled) --");
console.log(
  JSON.stringify(
    {
      _id: "65f0...mongo-id...",
      userId: "65ee...user...",
      stationId: request.stationId,
      stationName: "Sample Charging Hub",
      energyDemandKWh: request.energyDemandKWh,
      maxWaitHours: request.maxWaitHours,
      preferences: request.preferences,
      candidateChargers: request.candidateChargers,
      status: "scheduled",
      assignment: best && {
        chargerId: best.chargerId,
        chargerLabel: best.chargerLabel,
        powerKW: best.powerKW,
        startTime: best.start,
        endTime: best.end,
        estimatedCostDkk: Number(best.estimatedCostDkk.toFixed(2)),
        estimatedCo2Score: Number(best.estimatedCo2Score.toFixed(3)),
      },
      proposedReschedule: null,
      createdAt: new Date(),
    },
    null,
    2,
  ),
);
console.log();
console.log("--- findBestSlot return -----------------------------------");
console.log(best);
