const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const auth = require("../middleware/auth");
const schedulerRunner = require("../scheduler/runner");

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
    deadline,
    maxWaitMinutes,
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
  if (!deadline) return "deadline is required.";
  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) {
    return "deadline is not a valid date.";
  }
  if (deadlineDate.getTime() <= Date.now()) {
    return "deadline must be in the future.";
  }
  if (maxWaitMinutes == null || maxWaitMinutes < 0) {
    return "maxWaitMinutes must be >= 0.";
  }
  if (
    !preferences ||
    preferences.deadlineImportance == null ||
    preferences.waitingImportance == null ||
    preferences.priceImportance == null
  ) {
    return "preferences.{deadlineImportance,waitingImportance,priceImportance} are required.";
  }
  for (const key of [
    "deadlineImportance",
    "waitingImportance",
    "priceImportance",
  ]) {
    const v = preferences[key];
    if (typeof v !== "number" || v < 0 || v > 1) {
      return `preferences.${key} must be a number in [0, 1].`;
    }
  }
  const sum =
    preferences.deadlineImportance +
    preferences.waitingImportance +
    preferences.priceImportance;
  if (sum <= 0) return "At least one preference weight must be > 0.";
  return null;
}

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
      deadline,
      maxWaitMinutes,
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
      deadline: new Date(deadline),
      maxWaitMinutes,
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

router.get("/mine", async (req, res) => {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      userId: req.userId,
      $or: [
        { status: { $in: ["pending", "infeasible"] } },
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
      if (!result[b.stationId]) result[b.stationId] = [];
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

    booking.status = "cancelled";
    await booking.save();

    schedulerRunner.trigger();

    res.json(booking);
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Failed to cancel booking." });
  }
});

module.exports = router;
