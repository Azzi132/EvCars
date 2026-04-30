// Urgency scoring + cost function used by the greedy strategy.
//
// `urgencyScore` ranks requests so the scheduler decides who to place
// first (higher = more urgent). `requestCost` scores a specific
// (request, slot) pair so the scheduler picks the best slot for one
// request. Both feed off the same user preference weights but answer
// different questions.

const { averagePriceOverInterval } = require("./pricing");

// Penalty rates used when a slot misses the user's deadline or wait
// tolerance. The deadline penalty is much higher because exceeding the
// deadline is the worst outcome — if the car has to leave by 9am, a slot
// that finishes at 9:05 is essentially useless. The wait penalty is mild;
// it only kicks in past the user's stated tolerance and just nudges
// scoring rather than dominating it.
const DEADLINE_PENALTY_EUR_PER_MINUTE = 5.0;
const WAITING_PENALTY_EUR_PER_MINUTE = 0.01;

// Minutes of charging needed at this charger's power level. Returns
// Infinity for nonsensical input so callers can skip the candidate.
function chargingDurationMinutes(energyKWh, chargerPowerKW) {
  if (!chargerPowerKW || chargerPowerKW <= 0) return Infinity;
  return (energyKWh / chargerPowerKW) * 60;
}

function fastestPowerKW(candidateChargers) {
  return candidateChargers.reduce(
    (best, c) => (c.powerKW > best ? c.powerKW : best),
    0
  );
}

// Higher score = place this request earlier. The intuition:
//   - "slack" is how much wiggle room we have between now and the
//     deadline if we used the fastest possible charger.
//   - Less slack ⇒ more urgent ⇒ higher score.
//   - The user's preference weights then tilt this further: someone
//     who really cares about deadlines gets nudged up the queue.
//
// We clamp slack and waitTol to a 0.5-minute floor so we can't divide
// by zero (or by a tiny number that explodes the score).
function urgencyScore(request, now) {
  const fastest = fastestPowerKW(request.candidateChargers);
  const minChargeMin = chargingDurationMinutes(
    request.energyDemandKWh,
    fastest
  );
  const deadlineMs = new Date(request.deadline).getTime();
  const slackMin = Math.max(
    0.5,
    (deadlineMs - now.getTime()) / 60000 - minChargeMin
  );
  const waitTol = Math.max(0.5, request.maxWaitMinutes);

  const deadlineTerm = request.preferences.deadlineImportance / slackMin;
  const waitingTerm = request.preferences.waitingImportance / waitTol;

  return deadlineTerm + waitingTerm;
}

// Cost of assigning `request` to the slot described by `candidate`.
// Three terms, each weighted by the user's preferences:
//   - deadlineTerm: minutes the slot ends past the deadline × penalty rate
//   - waitingTerm:  minutes the user has to wait past their tolerance × rate
//   - priceTerm:    actual electricity cost (avg €/kWh × kWh)
// Lower total = better slot. The raw penalty/cost components are also
// returned so the caller can store them on the booking for transparency.
function requestCost(request, candidate, now) {
  const start = candidate.startTime instanceof Date
    ? candidate.startTime
    : new Date(candidate.startTime);
  const end = candidate.endTime instanceof Date
    ? candidate.endTime
    : new Date(candidate.endTime);

  const deadlineMs = new Date(request.deadline).getTime();
  const overshootMin = Math.max(0, (end.getTime() - deadlineMs) / 60000);
  const deadlineTermRaw = overshootMin * DEADLINE_PENALTY_EUR_PER_MINUTE;

  const startDelayMin = Math.max(0, (start.getTime() - now.getTime()) / 60000);
  const waitOvershoot = Math.max(0, startDelayMin - request.maxWaitMinutes);
  const waitingTermRaw = waitOvershoot * WAITING_PENALTY_EUR_PER_MINUTE;

  const avgPrice = averagePriceOverInterval(start, end);
  const priceTermRaw = avgPrice * request.energyDemandKWh;

  const { deadlineImportance, waitingImportance, priceImportance } =
    request.preferences;

  const total =
    deadlineImportance * deadlineTermRaw +
    waitingImportance * waitingTermRaw +
    priceImportance * priceTermRaw;

  return {
    total,
    deadlinePenaltyMinutes: overshootMin,
    waitingPenaltyMinutes: waitOvershoot,
    estimatedCostEur: priceTermRaw,
  };
}

module.exports = {
  chargingDurationMinutes,
  fastestPowerKW,
  urgencyScore,
  requestCost,
  DEADLINE_PENALTY_EUR_PER_MINUTE,
  WAITING_PENALTY_EUR_PER_MINUTE,
};
