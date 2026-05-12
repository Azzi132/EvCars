// Demo seeder for the booking flow.
//
// Wipes admin's existing bookings and inserts two pending requests with
// opposite preference profiles — one cheap-focused, one CO2-focused —
// so you can watch the scheduler turn them into concrete slots after it
// next runs. Useful for eyeballing the scheduler in dev.
//
// Expected outcome on a typical day:
//   - cheap-focused booking gets pushed into an off-peak (low DKK/kWh) band.
//   - co2-focused booking gets the slowest available charger so it
//     pulls less power from the grid.
//
// Run with `npm run seed:bookings` (after `npm run seed` to create admin).

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Booking = require("./scheduler/models");

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
      `User "${USERNAME}" not found. Run "npm run seed" first to create it.`,
    );
    await mongoose.disconnect();
    return;
  }

  const removed = await Booking.deleteMany({ userId: user._id });
  console.log(
    `Removed ${removed.deletedCount} existing booking(s) for "${USERNAME}".`,
  );

  const docs = [
    {
      userId: user._id,
      ...SAMPLE_STATION,
      candidateChargers: SAMPLE_CHARGERS,
      energyDemandKWh: 25,
      maxWaitHours: 8,                                  // willing to wait
      preferences: { price: 0.9, co2: 0.1 },            // cheap-focused
      status: "pending",
    },
    {
      userId: user._id,
      ...SAMPLE_STATION,
      candidateChargers: SAMPLE_CHARGERS,
      energyDemandKWh: 30,
      maxWaitHours: 12,                                 // very flexible
      preferences: { price: 0.1, co2: 0.9 },            // green-focused
      status: "pending",
    },
  ];

  await Booking.insertMany(docs);
  console.log(`Inserted ${docs.length} pending booking(s) for "${USERNAME}":`);
  docs.forEach((d, i) => {
    console.log(
      `  ${i + 1}. ${d.energyDemandKWh} kWh, within ${d.maxWaitHours}h, ` +
        `prefs=${JSON.stringify(d.preferences)}`,
    );
  });
  console.log(
    "\nStart the backend to have the scheduler assign concrete slots.",
  );

  await mongoose.disconnect();
}

seedBookings().catch((err) => {
  console.error("Seed bookings error:", err);
  process.exit(1);
});
