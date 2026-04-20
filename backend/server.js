require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const stationsRoutes = require("./routes/stations");
const bookingsRoutes = require("./routes/bookings");
const schedulerRunner = require("./scheduler/runner");

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on 0.0.0.0:${PORT}`));
