const { averagePriceOverInterval } = require("./pricing");

const DEADLINE_PENALTY_EUR_PER_MINUTE = 5.0;
const WAITING_PENALTY_EUR_PER_MINUTE = 0.01;

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
