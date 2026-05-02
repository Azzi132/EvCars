// Tests for the consolidated scheduler. We exercise the pure functions
// directly (no DB) — `runScheduler` itself is integration-tested by
// running the server.

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assign,
  requestCost,
  chargingDurationMinutes,
  deadlineMsFor,
} = require("../scheduler");
const { CO2_FACTOR } = require("../pricing");

// Build a request with sane defaults; override anything per-test.
function req(overrides = {}) {
  const createdAt = overrides.createdAt || new Date();
  return {
    _id: "r1",
    energyDemandKWh: 30,
    maxWaitHours: 4,
    preferences: { price: 0.5, co2: 0.5 },
    candidateChargers: [
      { id: 1, label: "Fast 50kW", powerKW: 50 },
      { id: 2, label: "Slow 7kW", powerKW: 7 },
    ],
    createdAt,
    ...overrides,
  };
}

test("chargingDurationMinutes: 30kWh at 50kW is 36 min", () => {
  assert.equal(chargingDurationMinutes(30, 50), 36);
});

test("deadlineMsFor: createdAt + maxWaitHours", () => {
  const created = new Date("2025-01-01T10:00:00Z");
  const r = req({ createdAt: created, maxWaitHours: 2 });
  const expected = created.getTime() + 2 * 3600 * 1000;
  assert.equal(deadlineMsFor(r), expected);
});

test("requestCost: 100% price weight ⇒ cost equals electricity bill", () => {
  // A daytime slot lands in the 0.25 €/kWh band, so 30 kWh × 0.25 = 7.5 €.
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 36 * 60000);
  const r = req({ preferences: { price: 1, co2: 0 } });
  const cost = requestCost(r, {
    startTime: start,
    endTime: end,
    powerKW: 50,
  });
  assert.ok(Math.abs(cost.estimatedCostEur - 7.5) < 1e-9);
  assert.ok(Math.abs(cost.total - 7.5) < 1e-9);
});

test("requestCost: 100% co2 weight ⇒ total grows with chargerPowerKW", () => {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60000);
  const r = req({ preferences: { price: 0, co2: 1 } });

  const slow = requestCost(r, { startTime: start, endTime: end, powerKW: 7 });
  const fast = requestCost(r, { startTime: start, endTime: end, powerKW: 150 });
  // Linear in powerKW.
  assert.ok(Math.abs(fast.total / slow.total - 150 / 7) < 1e-9);
  // Matches the formula directly.
  assert.equal(slow.total, 30 * 7 * CO2_FACTOR);
});

test("assign: simple two-request case picks slots and reports scheduled", () => {
  const now = new Date();
  // Both requests have plenty of slack and a fast charger free, so
  // both should be scheduled rather than infeasible.
  const a = req({ _id: "a" });
  const b = req({ _id: "b", createdAt: new Date(now.getTime() + 1000) });
  const results = assign([a, b], [], now);
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.status, "scheduled");
    assert.ok(r.assignment);
    assert.ok(r.assignment.endTime <= new Date(now.getTime() + 4 * 3600 * 1000));
  }
});

test("assign: too-tight maxWaitHours ⇒ infeasible", () => {
  const now = new Date();
  // 30 kWh at the fastest charger (50 kW) needs 36 min; 0.25h = 15 min
  // is not enough. The slow charger is even worse. So no slot fits.
  const r = req({
    maxWaitHours: 0.25,
    candidateChargers: [{ id: 1, label: "Fast 50kW", powerKW: 50 }],
  });
  const results = assign([r], [], now);
  assert.equal(results[0].status, "infeasible");
});

test("assign: more urgent (sooner deadline) gets first pick", () => {
  // Two requests competing for the same charger. The one with the
  // tighter window is scheduled first, so it grabs the earliest slot.
  const now = new Date();
  const tight = req({
    _id: "tight",
    maxWaitHours: 1,
    candidateChargers: [{ id: 1, label: "Fast 50kW", powerKW: 50 }],
  });
  const loose = req({
    _id: "loose",
    maxWaitHours: 6,
    createdAt: new Date(now.getTime() - 60_000), // older, but less urgent
    candidateChargers: [{ id: 1, label: "Fast 50kW", powerKW: 50 }],
  });
  const results = assign([loose, tight], [], now);
  const tightRes = results.find((r) => r.requestId === "tight");
  const looseRes = results.find((r) => r.requestId === "loose");
  assert.equal(tightRes.status, "scheduled");
  assert.equal(looseRes.status, "scheduled");
  assert.ok(
    new Date(tightRes.assignment.startTime) <
      new Date(looseRes.assignment.startTime),
    "tighter deadline should grab the earlier slot",
  );
});

test("assign: co2-focused user prefers slow charger when both fit", () => {
  // Both chargers can complete in time. A 100% co2-weighted user should
  // pick the slow one because its co2 score is much lower.
  const now = new Date();
  const r = req({
    maxWaitHours: 6, // plenty of room for the 7kW charger to finish
    preferences: { price: 0, co2: 1 },
  });
  const results = assign([r], [], now);
  assert.equal(results[0].status, "scheduled");
  assert.equal(results[0].assignment.chargerId, 2); // slow charger
});
