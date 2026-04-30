// Demo seeder for the booking flow.
//
// Wipes admin's existing bookings and inserts two pending requests with
// different priorities — one urgent-ish, one flexible & price-sensitive
// — so you can watch the scheduler turn them into concrete slots after
// it next runs. Useful for eyeballing the scheduler in dev.
//
// Run with `npm run seed:bookings` (after `npm run seed` to create admin).

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Booking = require("./models/Booking");

const USERNAME = "admin";

const SAMPLE_STATION = {
  stationId: 999001,
  stationName: "Sample Charging Hub",
  stationLat: 55.6761,
  stationLon: 12.5683,
};

const SAMPLE_CHARGERS = [
  { id: 1, label: "Type 2 — 22 kW", powerKW: 22 },
  { id: 2, label: "CCS — 50 kW", powerKW: 50 },
];

async function seedBookings() {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ username: USERNAME });
  if (!user) {
    console.log(
      `User "${USERNAME}" not found. Run "npm run seed" first to create it.`
    );
    await mongoose.disconnect();
    return;
  }

  const removed = await Booking.deleteMany({ userId: user._id });
  console.log(
    `Removed ${removed.deletedCount} existing booking(s) for "${USERNAME}".`
  );

  const now = new Date();

  const docs = [
    {
      userId: user._id,
      ...SAMPLE_STATION,
      candidateChargers: SAMPLE_CHARGERS,
      energyDemandKWh: 25,
      deadline: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      maxWaitMinutes: 60,
      preferences: {
        deadlineImportance: 0.5,
        waitingImportance: 0.25,
        priceImportance: 0.25,
      },
      status: "pending",
    },
    {
      userId: user._id,
      ...SAMPLE_STATION,
      candidateChargers: SAMPLE_CHARGERS,
      energyDemandKWh: 40,
      deadline: new Date(now.getTime() + 20 * 60 * 60 * 1000),
      maxWaitMinutes: 240,
      preferences: {
        deadlineImportance: 0.1,
        waitingImportance: 0.1,
        priceImportance: 0.8,
      },
      status: "pending",
    },
  ];

  await Booking.insertMany(docs);
  console.log(`Inserted ${docs.length} pending booking(s) for "${USERNAME}":`);
  docs.forEach((d, i) => {
    console.log(
      `  ${i + 1}. ${d.energyDemandKWh} kWh, deadline ${d.deadline.toISOString()}, prefs=${JSON.stringify(d.preferences)}`
    );
  });
  console.log(
    "\nStart the backend to have the scheduler assign concrete slots."
  );

  await mongoose.disconnect();
}

seedBookings().catch((err) => {
  console.error("Seed bookings error:", err);
  process.exit(1);
});
