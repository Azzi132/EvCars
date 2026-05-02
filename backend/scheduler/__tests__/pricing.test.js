const test = require("node:test");
const assert = require("node:assert/strict");
const {
  priceAtEurPerKWh,
  averagePriceOverInterval,
  co2ScoreForCharge,
  CO2_FACTOR,
} = require("../pricing");

function at(h, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

test("pricing: off-peak is cheap, peak is expensive", () => {
  assert.equal(priceAtEurPerKWh(at(3)), 0.10);
  assert.equal(priceAtEurPerKWh(at(12)), 0.25);
  assert.equal(priceAtEurPerKWh(at(19)), 0.40);
  assert.equal(priceAtEurPerKWh(at(22)), 0.20);
});

test("pricing: band boundaries", () => {
  assert.equal(priceAtEurPerKWh(at(6)), 0.25);
  assert.equal(priceAtEurPerKWh(at(17)), 0.40);
  assert.equal(priceAtEurPerKWh(at(21)), 0.20);
});

test("averagePriceOverInterval: within single band equals band price", () => {
  const avg = averagePriceOverInterval(at(2), at(5));
  assert.equal(avg, 0.10);
});

test("averagePriceOverInterval: crossing bands averages by duration", () => {
  const avg = averagePriceOverInterval(at(5), at(8));
  const expected = (1 * 0.10 + 2 * 0.25) / 3;
  assert.ok(Math.abs(avg - expected) < 1e-9);
});

test("co2ScoreForCharge: linear in energy and power", () => {
  // Doubling energy doubles the score; doubling power doubles it again.
  const a = co2ScoreForCharge(20, 50);
  const b = co2ScoreForCharge(40, 50);
  const c = co2ScoreForCharge(20, 100);
  assert.ok(Math.abs(b - 2 * a) < 1e-9);
  assert.ok(Math.abs(c - 2 * a) < 1e-9);
});

test("co2ScoreForCharge: matches energy * power * factor", () => {
  assert.equal(co2ScoreForCharge(30, 50), 30 * 50 * CO2_FACTOR);
});

test("co2ScoreForCharge: returns 0 for non-positive power", () => {
  assert.equal(co2ScoreForCharge(20, 0), 0);
  assert.equal(co2ScoreForCharge(20, -5), 0);
});
