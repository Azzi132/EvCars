const { avgPrice, avgRenewable } = require("./pricing");

function scoreCandidate({ start, end, powerKW, energyKWh }, preferences) {
  const avgPriceDkk = avgPrice(start, end);
  const avgRenewablePct = avgRenewable(start, end);

  const score =
    preferences.price * avgPriceDkk - preferences.co2 * avgRenewablePct;

  const estimatedCostDkk = avgPriceDkk * energyKWh;

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
