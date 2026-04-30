// Mongoose schema for charging bookings.
//
// A Booking captures both the user's *request* (which station, how much
// energy, by when, with what preferences) and the scheduler's *answer*
// (which charger, what time slot, projected cost). The same document
// transitions through statuses as the scheduler runs and time passes:
//
//   pending → scheduled → in_progress → completed
//                 ↓
//             infeasible
//                 ↓ (user)
//             cancelled
//
// `assignment` is null while pending/infeasible and gets populated by the
// scheduler when a slot is found. See scheduler/index.js for the writer
// and scheduler/strategies/greedy.js for how the slot is chosen.

const mongoose = require("mongoose");

// One charger the user is willing to use at the chosen station. We snapshot
// these on the booking so a station's catalog changing later doesn't
// invalidate or silently mutate an existing booking.
const candidateChargerSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    label: { type: String, required: true },
    powerKW: { type: Number, required: true },
  },
  { _id: false },
);

// User-supplied weights describing what to optimize for. Each is in [0, 1]
// and the trio is normalized to sum to 1 in the pre-validate hook below,
// so the scheduler can treat them as a probability-like distribution.
const preferencesSchema = new mongoose.Schema(
  {
    deadlineImportance: { type: Number, required: true, min: 0, max: 1 },
    waitingImportance: { type: Number, required: true, min: 0, max: 1 },
    priceImportance: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

// Concrete slot the scheduler has picked. revisionCount is bumped each
// time the scheduler re-optimises this booking onto a different slot,
// which helps debugging if a user keeps getting moved around.
const assignmentSchema = new mongoose.Schema(
  {
    chargerId: { type: Number, required: true },
    chargerLabel: { type: String, required: true },
    powerKW: { type: Number, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    estimatedCostEur: { type: Number, required: true },
    deadlinePenaltyMinutes: { type: Number, required: true, default: 0 },
    waitingPenaltyMinutes: { type: Number, required: true, default: 0 },
    assignedAt: { type: Date, default: Date.now },
    revisionCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema({
  // Identity
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // Snapshot of the station the user picked
  stationId: { type: Number, required: true },
  stationName: { type: String, required: true },
  stationLat: { type: Number, required: true },
  stationLon: { type: Number, required: true },

  // The chargers at that station the user accepts
  candidateChargers: {
    type: [candidateChargerSchema],
    validate: (v) => Array.isArray(v) && v.length > 0,
  },

  // The request itself
  energyDemandKWh: { type: Number, required: true, min: 0.1 },
  deadline: { type: Date, required: true, index: true },
  maxWaitMinutes: { type: Number, required: true, min: 0 },
  preferences: { type: preferencesSchema, required: true },

  // Lifecycle
  status: {
    type: String,
    enum: [
      "pending",
      "scheduled",
      "in_progress",
      "completed",
      "cancelled",
      "infeasible",
    ],
    default: "pending",
    index: true,
  },

  // The scheduler's answer (null until a slot is found)
  assignment: { type: assignmentSchema, default: null },

  createdAt: { type: Date, default: Date.now, index: true },
});

// Normalize preference weights so they sum to 1. We allow callers to pass
// raw weights like {1, 1, 1} or {0.5, 0.25, 0.25} and quietly rescale.
// The 1e-6 tolerance covers floating-point fuzz when weights already sum
// to ~1 and lets us skip the divide in that common case.
bookingSchema.pre("validate", function normalizePreferences(next) {
  if (!this.preferences) return next();
  const { deadlineImportance, waitingImportance, priceImportance } =
    this.preferences;
  const sum =
    (deadlineImportance || 0) +
    (waitingImportance || 0) +
    (priceImportance || 0);
  if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
    this.preferences.deadlineImportance = (deadlineImportance || 0) / sum;
    this.preferences.waitingImportance = (waitingImportance || 0) / sum;
    this.preferences.priceImportance = (priceImportance || 0) / sum;
  }
  next();
});

// Compound indexes that match the scheduler's hot-path queries: finding
// active bookings on a given charger, and ordering them by start time.
bookingSchema.index({ status: 1, "assignment.chargerId": 1 });
bookingSchema.index({ status: 1, "assignment.startTime": 1 });

module.exports = mongoose.model("Booking", bookingSchema);
