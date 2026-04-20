const mongoose = require("mongoose");

const candidateChargerSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    label: { type: String, required: true },
    powerKW: { type: Number, required: true },
  },
  { _id: false },
);

const preferencesSchema = new mongoose.Schema(
  {
    deadlineImportance: { type: Number, required: true, min: 0, max: 1 },
    waitingImportance: { type: Number, required: true, min: 0, max: 1 },
    priceImportance: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

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
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  stationId: { type: Number, required: true },
  stationName: { type: String, required: true },
  stationLat: { type: Number, required: true },
  stationLon: { type: Number, required: true },

  candidateChargers: {
    type: [candidateChargerSchema],
    validate: (v) => Array.isArray(v) && v.length > 0,
  },

  energyDemandKWh: { type: Number, required: true, min: 0.1 },
  deadline: { type: Date, required: true, index: true },
  maxWaitMinutes: { type: Number, required: true, min: 0 },
  preferences: { type: preferencesSchema, required: true },

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

  assignment: { type: assignmentSchema, default: null },

  createdAt: { type: Date, default: Date.now, index: true },
});

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

bookingSchema.index({ status: 1, "assignment.chargerId": 1 });
bookingSchema.index({ status: 1, "assignment.startTime": 1 });

module.exports = mongoose.model("Booking", bookingSchema);
