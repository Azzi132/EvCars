// Two-user A/B scenario that pins down whether the scheduler is actually
// preference-aware or just first-come-first-served.
//
//   User A: created 2 minutes ago, very flexible (12h window), price-focused.
//   User B: created 1 minute later, tight (1h window), CO2-focused.
//
// FCFS would hand the first available slot to A (created first).
// The deadline-aware scheduler should give it to B because B's window is
// tighter — B's deadline lands sooner, so B is sorted first in the
// greedy pass.
//
// Run with `npm run seed:ab` and then check via `/api/bookings/mine`
// (or the scheduler tests) which booking ends up scheduled first.

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Booking = require("./scheduler/models");

const STATION = {
  stationId: 999001,
  stationName: "Sample Charging Hub",
  stationLat: 55.6761,
  stationLon: 12.5683,
};

// We give the station two chargers so the CO2-focused user can pick the
// slow one without blocking the price-focused user's preferred fast one.
const CHARGERS = [
  { id: 1, label: "Type 2 — 22 kW", powerKW: 22 },
  { id: 2, label: "CCS — 50 kW", powerKW: 50 },
];

async function seedScenarioAB() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ username: "admin" });
  if (!user) {
    console.error(
      'User "admin" not found. Run "npm run seed" first to create it.',
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  await Booking.deleteMany({ userId: user._id, stationId: STATION.stationId });
  console.log("Cleared existing A/B scenario bookings for admin.");

  const now = new Date();

  // A is flexible & cheap-focused, created earlier.
  const userA = {
    userId: user._id,
    ...STATION,
    candidateChargers: CHARGERS,
    energyDemandKWh: 20,
    maxWaitHours: 12,
    preferences: { price: 0.9, co2: 0.1 },
    status: "pending",
    createdAt: new Date(now.getTime() - 2 * 60 * 1000),
  };

  // B has a tight window and cares about emissions, created later.
  const userB = {
    userId: user._id,
    ...STATION,
    candidateChargers: CHARGERS,
    energyDemandKWh: 30,
    maxWaitHours: 1,
    preferences: { price: 0.1, co2: 0.9 },
    status: "pending",
    createdAt: new Date(now.getTime() - 1 * 60 * 1000),
  };

  const docs = await Booking.insertMany([userA, userB]);
  console.log("Inserted A/B scenario bookings:");
  docs.forEach((d, i) => {
    const tag = i === 0 ? "A (flexible, price-focused)" : "B (tight, CO2-focused)";
    console.log(
      `  ${tag}: ${d.energyDemandKWh} kWh, within ${d.maxWaitHours}h, ` +
        `prefs=${JSON.stringify(d.preferences)}`,
    );
  });

  console.log(
    "\nBoth are pending. Start the server (or wait 30s) for the scheduler to assign slots.",
  );
  console.log(
    "FCFS would give the first slot to A (created earlier). The deadline-aware scheduler should give it to B.",
  );

  await mongoose.disconnect();
}

seedScenarioAB().catch((err) => {
  console.error("Seed scenario error:", err);
  process.exit(1);
});
