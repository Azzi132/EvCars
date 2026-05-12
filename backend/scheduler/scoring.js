// Score a candidate slot. Lower scores win.
//
// preferences.price and preferences.co2 are normalised weights in [0, 1]
// summing to 1 (enforced by the Booking pre-validate hook). The two terms
// have different units — DKK/kWh vs renewable %. They aren't directly
// comparable; the weights are how the user expresses how much each
// matters. Subtracting renewable share means a greener hour lowers the
// score, which is what we want.

const { avgPrice, avgRenewable } = require("./pricing");

function scoreCandidate({ start, end, powerKW, energyKWh }, preferences) {
  const avgPriceDkk = avgPrice(start, end);
  const avgRenewablePct = avgRenewable(start, end);

  const score =
    preferences.price * avgPriceDkk - preferences.co2 * avgRenewablePct;

  const estimatedCostDkk = avgPriceDkk * energyKWh;
  // (100 - renewable%) is the "dirty share". Scaling by powerKW means a
  // CO2-conscious user (high co2 weight) sees lower scores for slower
  // chargers all else equal, matching the spec.
  const estimatedCo2Score = ((100 - avgRenewablePct) * powerKW) / 100;

  return {
    score,
    avgPriceDkk,
    avgRenewablePct,
    estimatedCostDkk,
    estimatedCo2Score,
  };
}

module.exports = { scoreCandidate };
