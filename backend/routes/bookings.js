// Booking routes — create, list, fetch, cancel, and check live availability.
//
// Every route here requires a valid JWT (see `router.use(auth)` below) and
// is scoped to the authenticated user. Mutating routes (POST, DELETE) call
// schedulerRunner.trigger() at the end so the scheduler re-evaluates
// assignments quickly instead of waiting for the next 30-second tick.

const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const auth = require("../middleware/auth");
const schedulerRunner = require("../scheduler/runner");

const router = express.Router();

router.use(auth);

// ---------- validation ------------------------------------------------------

// Returns null if the payload is acceptable, or a human-readable error
// message if not. We use `== null` for fields where 0 is a legitimate
// value (coordinates, ids, maxWait) and `!x` for fields where 0 or "" is
// definitely wrong (names, positive numbers like power and energy).
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
  // We allow weights that don't sum to 1 — the model's pre-validate hook
  // normalises them — but at least one has to be positive or there's
  // nothing for the scheduler to optimise.
  const sum =
    preferences.deadlineImportance +
    preferences.waitingImportance +
    preferences.priceImportance;
  if (sum <= 0) return "At least one preference weight must be > 0.";
  return null;
}

// ---------- POST / -- create a new booking ---------------------------------

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

    // Wake the scheduler so the user doesn't have to wait up to 30s for
    // the next periodic tick to see their request.
    schedulerRunner.trigger();

    res.status(201).json(booking);
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ message: "Failed to create booking." });
  }
});

// ---------- GET /mine -- list current user's active bookings --------------

// "Active" means: still pending/infeasible (so the user can see it being
// worked on or know it failed), or scheduled/in_progress with an end time
// still in the future. Completed and cancelled bookings drop out.
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

// ---------- GET /availability -- which chargers are busy right now --------

// The mobile app calls this to grey out chargers that are mid-charge.
// Result shape: { [stationId]: [chargerId, chargerId, ...] }, with an
// empty array for any requested station that has no current bookings.
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

    // "Busy" = has an assignment whose [start, end) interval contains now.
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

// ---------- GET /:id -- fetch one of the user's bookings ------------------

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id." });
    }
    // Scope by userId so users can't read each other's bookings even if
    // they guess an id.
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

// ---------- DELETE /:id -- cancel a booking -------------------------------

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

    // Once a charge has actually started or finished there's no sensible
    // way to "cancel" it from the user's side.
    if (booking.status === "in_progress" || booking.status === "completed") {
      return res
        .status(409)
        .json({ message: `Cannot cancel a ${booking.status} booking.` });
    }

    booking.status = "cancelled";
    await booking.save();

    // Freeing this slot may let the scheduler give a better assignment
    // to someone else — re-run it now instead of on the next tick.
    schedulerRunner.trigger();

    res.json(booking);
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Failed to cancel booking." });
  }
});

module.exports = router;
