require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Booking = require("./models/Booking");

const STATION = {
  stationId: 999001,
  stationName: "Sample Charging Hub",
  stationLat: 55.6761,
  stationLon: 12.5683,
};

const FAST_CHARGER = { id: 1, label: "CCS — 50 kW", powerKW: 50 };

async function seedScenarioAB() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ username: "admin" });
  if (!user) {
    console.error(
      'User "admin" not found. Run "npm run seed" first to create it.'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  await Booking.deleteMany({ userId: user._id, stationId: STATION.stationId });
  console.log("Cleared existing A/B scenario bookings for admin.");

  const now = new Date();
  const deadlineA = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const deadlineB = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const userA = {
    userId: user._id,
    ...STATION,
    candidateChargers: [FAST_CHARGER],
    energyDemandKWh: 20,
    deadline: deadlineA,
    maxWaitMinutes: 120,
    preferences: {
      deadlineImportance: 0.1,
      waitingImportance: 0.1,
      priceImportance: 0.8,
    },
    status: "pending",
    createdAt: new Date(now.getTime() - 2 * 60 * 1000),
  };

  const userB = {
    userId: user._id,
    ...STATION,
    candidateChargers: [FAST_CHARGER],
    energyDemandKWh: 35,
    deadline: deadlineB,
    maxWaitMinutes: 15,
    preferences: {
      deadlineImportance: 0.9,
      waitingImportance: 0.05,
      priceImportance: 0.05,
    },
    status: "pending",
    createdAt: new Date(now.getTime() - 1 * 60 * 1000),
  };

  const docs = await Booking.insertMany([userA, userB]);
  console.log("Inserted A/B scenario bookings:");
  docs.forEach((d, i) => {
    const tag = i === 0 ? "A (flexible, price-sensitive)" : "B (tight deadline)";
    console.log(
      `  ${tag}: ${d.energyDemandKWh} kWh, deadline=${d.deadline.toISOString()}, maxWait=${d.maxWaitMinutes} min`
    );
  });

  console.log(
    "\nBoth are pending. Start the server (or wait 30s) for the scheduler to assign slots."
  );
  console.log(
    "FCFS would give the first slot to A (created earlier). The preference-aware scheduler should give it to B."
  );

  await mongoose.disconnect();
}

seedScenarioAB().catch((err) => {
  console.error("Seed scenario error:", err);
  process.exit(1);
});
