const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chargingDurationMinutes,
  requestCost,
  urgencyScore,
} = require("../urgency");

function req(overrides = {}) {
  return {
    _id: "r1",
    energyDemandKWh: 30,
    deadline: new Date(Date.now() + 4 * 3600 * 1000),
    maxWaitMinutes: 60,
    preferences: {
      deadlineImportance: 0.5,
      waitingImportance: 0.25,
      priceImportance: 0.25,
    },
    candidateChargers: [
      { id: 1, label: "Fast 50kW", powerKW: 50 },
      { id: 2, label: "Slow 7kW", powerKW: 7 },
    ],
    createdAt: new Date(),
    ...overrides,
  };
}

test("chargingDurationMinutes: 30kWh at 50kW is 36 min", () => {
  assert.equal(chargingDurationMinutes(30, 50), 36);
});

test("requestCost: 0 deadline penalty when completion <= deadline", () => {
  const now = new Date();
  const r = req();
  const start = new Date(now.getTime() + 10 * 60000);
  const end = new Date(start.getTime() + 36 * 60000);
  const cost = requestCost(
    r,
    { startTime: start, endTime: end },
    now
  );
  assert.equal(cost.deadlinePenaltyMinutes, 0);
});

test("requestCost: positive deadline penalty when completion > deadline", () => {
  const now = new Date();
  const r = req({ deadline: new Date(now.getTime() + 30 * 60000) });
  const start = new Date(now.getTime() + 10 * 60000);
  const end = new Date(start.getTime() + 60 * 60000);
  const cost = requestCost(
    r,
    { startTime: start, endTime: end },
    now
  );
  assert.ok(cost.deadlinePenaltyMinutes > 0);
  assert.ok(cost.total > 0);
});

test("urgencyScore: tighter deadline -> higher score", () => {
  const now = new Date();
  const tight = req({
    deadline: new Date(now.getTime() + 60 * 60000),
    maxWaitMinutes: 15,
    preferences: {
      deadlineImportance: 0.9,
      waitingImportance: 0.05,
      priceImportance: 0.05,
    },
  });
  const loose = req({
    deadline: new Date(now.getTime() + 8 * 3600 * 1000),
    maxWaitMinutes: 120,
    preferences: {
      deadlineImportance: 0.1,
      waitingImportance: 0.1,
      priceImportance: 0.8,
    },
  });
  assert.ok(urgencyScore(tight, now) > urgencyScore(loose, now));
});
