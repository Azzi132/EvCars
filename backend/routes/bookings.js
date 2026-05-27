const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../scheduler/models");
const auth = require("../middleware/auth");
const schedulerRunner = require("../scheduler");
const schedulerBookings = require("../scheduler/bookings");

const router = express.Router();

router.use(auth);

function validateCreatePayload(body) {
  const {
    stationId,
    stationName,
    stationLat,
    stationLon,
    candidateChargers,
    energyDemandKWh,
    maxWaitHours,
    preferences,
  } = body;

  if (
    stationId == null ||
    !stationName ||
    stationLat == null ||
    stationLon == null
  ) {
    return "Missing station fields.";
  }
  if (!Array.isArray(candidateChargers) || candidateChargers.length === 0) {
    return "At least one candidate charger is required.";
  }
  for (const c of candidateChargers) {
    if (c.id == null || !c.label || !c.powerKW || c.powerKW <= 0) {
      return "Each candidate charger needs id, label, and positive powerKW.";
    }
  }
  if (!energyDemandKWh || energyDemandKWh <= 0) {
    return "energyDemandKWh must be > 0.";
  }
  if (
    typeof maxWaitHours !== "number" ||
    maxWaitHours < 0.25 ||
    maxWaitHours > 168
  ) {
    return "maxWaitHours must be a number between 0.25 and 168.";
  }
  if (
    !preferences ||
    typeof preferences.price !== "number" ||
    typeof preferences.co2 !== "number"
  ) {
    return "preferences.{price,co2} are required numbers.";
  }
  for (const key of ["price", "co2"]) {
    const v = preferences[key];
    if (v < 0 || v > 1) {
      return `preferences.${key} must be in [0, 1].`;
    }
  }

  return null;
}

// Create new booking
router.post("/", async (req, res) => {
  try {
    const err = validateCreatePayload(req.body);
    if (err) return res.status(400).json({ message: err });

    const {
      stationId,
      stationName,
      stationLat,
      stationLon,
      candidateChargers,
      energyDemandKWh,
      maxWaitHours,
      preferences,
    } = req.body;

    const booking = await Booking.create({
      userId: req.userId,
      stationId,
      stationName,
      stationLat,
      stationLon,
      candidateChargers,
      energyDemandKWh,
      maxWaitHours,
      preferences,
      status: "pending",
    });

    schedulerRunner.trigger();

    res.status(201).json(booking);
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ message: "Failed to create booking." });
  }
});

// Get users current active bookings
router.get("/mine", async (req, res) => {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      userId: req.userId,
      $or: [
        { status: "pending" },
        {
          status: { $in: ["scheduled", "in_progress"] },
          "assignment.endTime": { $gt: now },
        },
      ],
    }).sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    console.error("Get my bookings error:", err);
    res.status(500).json({ message: "Failed to load bookings." });
  }
});

// Check which chargers are busy right now
router.get("/availability", async (req, res) => {
  try {
    const raw = req.query.stationIds || "";
    const ids = raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    if (ids.length === 0) {
      return res.json({});
    }

    const now = new Date();
    const busy = await Booking.find({
      stationId: { $in: ids },
      status: { $in: ["scheduled", "in_progress"] },
      "assignment.startTime": { $lte: now },
      "assignment.endTime": { $gt: now },
    }).select("stationId assignment.chargerId");

    const result = {};
    ids.forEach((id) => {
      result[id] = [];
    });
    busy.forEach((b) => {
      if (b.assignment && b.assignment.chargerId != null) {
        result[b.stationId].push(b.assignment.chargerId);
      }
    });

    res.json(result);
  } catch (err) {
    console.error("Availability error:", err);
    res.status(500).json({ message: "Failed to load availability." });
  }
});

// Accepted proposed earlier time slot given by scheduler
router.post("/:id/accept-reschedule", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id." });
    }
    const booking = await schedulerBookings.acceptReschedule(
      req.params.id,
      req.userId,
    );
    schedulerRunner.trigger();
    res.json(booking);
  } catch (err) {
    console.error("Accept reschedule error:", err);
    res.status(400).json({ message: err.message || "Failed to accept." });
  }
});

// Reject earlier slot and delete it
router.post("/:id/reject-reschedule", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id." });
    }
    const booking = await schedulerBookings.rejectReschedule(
      req.params.id,
      req.userId,
    );
    res.json(booking);
  } catch (err) {
    console.error("Reject reschedule error:", err);
    res.status(400).json({ message: err.message || "Failed to reject." });
  }
});

// Fetch one of the user's bookings, based on booking ID.
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id." });
    }
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!booking) return res.status(404).json({ message: "Not found." });
    res.json(booking);
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ message: "Failed to load booking." });
  }
});

// Cancel a booking based on it's ID.
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id." });
    }
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!booking) return res.status(404).json({ message: "Not found." });

    if (booking.status === "in_progress" || booking.status === "completed") {
      return res
        .status(409)
        .json({ message: `Cannot cancel a ${booking.status} booking.` });
    }

    await Booking.deleteOne({ _id: booking._id });

    schedulerRunner.trigger();

    res.json({ _id: booking._id, deleted: true });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Failed to cancel booking." });
  }
});

module.exports = router;
