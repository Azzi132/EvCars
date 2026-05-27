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
    price: { type: Number, required: true, min: 0, max: 1 },
    co2: { type: Number, required: true, min: 0, max: 1 },
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
    estimatedCostDkk: { type: Number, required: true },
    estimatedCo2Score: { type: Number, required: true, default: 0 },
    assignedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const proposedRescheduleSchema = new mongoose.Schema(
  {
    newStart: { type: Date, required: true },
    newEnd: { type: Date, required: true },
    newChargerId: { type: Number, required: true },
    newChargerLabel: { type: String, required: true },
    newPowerKW: { type: Number, required: true },
    newScore: { type: Number, required: true },
    newEstimatedCostDkk: { type: Number, required: true },
    newEstimatedCo2Score: { type: Number, required: true },
    proposedAt: { type: Date, default: Date.now },
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
  maxWaitHours: { type: Number, required: true, min: 0.25, max: 168 },
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
  proposedReschedule: { type: proposedRescheduleSchema, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

bookingSchema.pre("validate", function normalisePreferences(next) {
  if (!this.preferences) return next();
  const { price, co2 } = this.preferences;
  const sum = (price || 0) + (co2 || 0);
  if (sum <= 0) {
    this.preferences.price = 0.5;
    this.preferences.co2 = 0.5;
  } else if (Math.abs(sum - 1) > 1e-6) {
    this.preferences.price = (price || 0) / sum;
    this.preferences.co2 = (co2 || 0) / sum;
  }
  next();
});

bookingSchema.index({ status: 1, "assignment.chargerId": 1 });
bookingSchema.index({ status: 1, "assignment.startTime": 1 });

module.exports = mongoose.model("Booking", bookingSchema);
