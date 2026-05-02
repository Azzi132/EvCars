// Mongoose schema for charging bookings.
//
// A Booking captures both the user's *request* (which station, how much
// energy, how long they're willing to wait, and what to optimise for)
// and the scheduler's *answer* (which charger, what time slot, projected
// cost). The same document transitions through statuses as the scheduler
// runs and time passes:
//
//   pending → scheduled → in_progress → completed
//                 ↓
//             infeasible
//                 ↓ (user)
//             cancelled
//
// `assignment` is null while pending/infeasible and gets populated by the
// scheduler when a slot is found. See scheduler/scheduler.js for the
// writer and the slot-picking logic.

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

// What the user is optimising for. Two weights in [0, 1], normalised to
// sum to 1 by the pre-validate hook below. Conceptually a probability
// split: "60% I care about price, 40% I care about CO2."
//
// We don't include a "deadline weight" — the deadline is a hard window
// (see `maxWaitHours` below), not a soft preference.
const preferencesSchema = new mongoose.Schema(
  {
    // Higher = pick slots with cheaper electricity (off-peak time bands).
    price: { type: Number, required: true, min: 0, max: 1 },
    // Higher = prefer slower (lower-kW) chargers. Higher-power chargers
    // pull harder on the grid, so a CO2-conscious user nudges toward
    // slower chargers when one is available.
    co2: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

// Concrete slot the scheduler has picked. Populated when status flips
// from pending → scheduled.
const assignmentSchema = new mongoose.Schema(
  {
    chargerId: { type: Number, required: true },
    chargerLabel: { type: String, required: true },
    powerKW: { type: Number, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    // Projected € for the energy delivered, using TOU pricing over [start, end).
    estimatedCostEur: { type: Number, required: true },
    // Relative "eco score" — proportional to chargerPowerKW × energy.
    // Lower is greener. Stored for transparency in the UI; the scheduler
    // recomputes it from pricing.js when scoring slots.
    estimatedCo2Score: { type: Number, required: true, default: 0 },
    assignedAt: { type: Date, default: Date.now },
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
  // "I'm willing to wait up to N hours from now." This is the user's
  // deadline expressed as a duration: deadlineMs = createdAt + maxWaitHours.
  // Capped at a week so a typo can't ask the scheduler to plan for next
  // year. The scheduler treats this as a hard constraint — if no slot
  // fits inside this window, the booking goes infeasible.
  maxWaitHours: { type: Number, required: true, min: 0.25, max: 168 },
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

// Normalise preference weights so they sum to 1. We allow callers to pass
// raw weights like {price: 1, co2: 1} or {price: 0.5, co2: 0.5} and quietly
// rescale. The 1e-6 tolerance covers floating-point fuzz when weights
// already sum to ~1 and lets us skip the divide in that common case.
//
// If the caller zeros both weights out, fall back to a 50/50 split rather
// than rejecting the booking — there's no useful "I care about nothing"
// answer for the scheduler.
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

// Compound indexes that match the scheduler's hot-path queries: finding
// active bookings on a given charger, and ordering them by start time.
bookingSchema.index({ status: 1, "assignment.chargerId": 1 });
bookingSchema.index({ status: 1, "assignment.startTime": 1 });

module.exports = mongoose.model("Booking", bookingSchema);
