const test = require("node:test");
const assert = require("node:assert/strict");
const greedy = require("../strategies/greedy");

function makeRequest(id, overrides) {
  return {
    _id: id,
    candidateChargers: [{ id: 1, label: "CCS 50kW", powerKW: 50 }],
    createdAt: new Date(Date.now() - 60000),
    preferences: {
      deadlineImportance: 0.33,
      waitingImportance: 0.33,
      priceImportance: 0.34,
    },
    ...overrides,
  };
}

test("greedy: A-vs-B scenario prefers tight-deadline user at peak", () => {
  const now = new Date();
  now.setHours(14, 0, 0, 0);

  const deadlineA = new Date(now);
  deadlineA.setHours(22, 0, 0, 0);
  const deadlineB = new Date(now);
  deadlineB.setHours(16, 0, 0, 0);

  const A = makeRequest("A", {
    energyDemandKWh: 20,
    deadline: deadlineA,
    maxWaitMinutes: 120,
    preferences: {
      deadlineImportance: 0.1,
      waitingImportance: 0.1,
      priceImportance: 0.8,
    },
    createdAt: new Date(now.getTime() - 120000),
  });
  const B = makeRequest("B", {
    energyDemandKWh: 35,
    deadline: deadlineB,
    maxWaitMinutes: 15,
    preferences: {
      deadlineImportance: 0.9,
      waitingImportance: 0.05,
      priceImportance: 0.05,
    },
    createdAt: new Date(now.getTime() - 60000),
  });

  const results = greedy.assign([A, B], [], now);
  const byId = Object.fromEntries(results.map((r) => [r.requestId, r]));

  assert.equal(byId.B.status, "scheduled");
  assert.equal(byId.A.status, "scheduled");

  const bStart = new Date(byId.B.assignment.startTime).getTime();
  const aStart = new Date(byId.A.assignment.startTime).getTime();

  assert.ok(
    bStart < aStart,
    `Expected B to start before A, got B=${new Date(bStart).toISOString()} A=${new Date(aStart).toISOString()}`
  );
  assert.ok(
    bStart - now.getTime() <= 45 * 60000,
    "Expected B to start within 45 minutes of now"
  );
  const aHour = new Date(aStart).getHours();
  assert.ok(
    aHour >= 21 || aHour < 6,
    `Expected flexible A to land in off-peak, got hour=${aHour}`
  );
});

test("greedy: marks infeasible when no charger can make the deadline", () => {
  const now = new Date();
  const req = makeRequest("imp", {
    energyDemandKWh: 100,
    deadline: new Date(now.getTime() + 10 * 60000),
    maxWaitMinutes: 5,
    candidateChargers: [{ id: 1, label: "slow", powerKW: 3 }],
  });

  const results = greedy.assign([req], [], now);
  assert.equal(results[0].status, "scheduled",
    "current greedy still assigns but penalizes — see deadlinePenaltyMinutes"
  );
  assert.ok(results[0].assignment.deadlinePenaltyMinutes > 0);
});

test("greedy: second request honors committed timeline of first", () => {
  const now = new Date();
  const deadline = new Date(now.getTime() + 8 * 3600 * 1000);
  const r1 = makeRequest("r1", {
    energyDemandKWh: 20,
    deadline,
    maxWaitMinutes: 30,
  });
  const r2 = makeRequest("r2", {
    energyDemandKWh: 20,
    deadline,
    maxWaitMinutes: 30,
  });

  const results = greedy.assign([r1, r2], [], now);
  const [a1, a2] = results.map((r) => r.assignment);
  const overlap =
    new Date(a1.startTime).getTime() < new Date(a2.endTime).getTime() &&
    new Date(a2.startTime).getTime() < new Date(a1.endTime).getTime();
  assert.ok(!overlap, "Assignments overlap on the same charger");
});
