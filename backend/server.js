// Entry point for the EvCars backend.
// Boots Express, connects to MongoDB, mounts the API routes, and kicks off
// the background scheduler that assigns charger slots to pending bookings.

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const stationsRoutes = require("./routes/stations");
const bookingsRoutes = require("./routes/bookings");
const schedulerRunner = require("./scheduler");

const app = express();
app.use(cors());
app.use(express.json());

// Start the scheduler only once the DB is up — it reads/writes Booking docs
// on every tick, so running it before the connection is ready would just error.
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    schedulerRunner.start();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/stations", stationsRoutes);
app.use("/api/bookings", bookingsRoutes);

// Bind on 0.0.0.0 (not localhost) so the Expo app on a phone or emulator
// can reach this dev server over the LAN.
const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on 0.0.0.0:${PORT}`));
