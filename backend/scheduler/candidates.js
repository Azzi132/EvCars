const { SLOT_STEP_MIN } = require("./config");
const { isChargerFree, hasUserConflict } = require("./availability");
const { scoreCandidate } = require("./scoring");

const stepMs = SLOT_STEP_MIN * 60_000;
const ceilTo = (ms, step) => Math.ceil(ms / step) * step;

function generateCandidates({
  request,
  existingBookings,
  userBookings = [],
  now = new Date(),
  ignoreBookingId = null,
}) {
  const { candidateChargers, energyDemandKWh, maxWaitHours, preferences } =
    request;
  if (!candidateChargers || candidateChargers.length === 0) return [];

  const nowMs = now.getTime();
  const deadlineMs = nowMs + maxWaitHours * 3_600_000;
  const out = [];

  for (const c of candidateChargers) {
    const durationMs = (energyDemandKWh / c.powerKW) * 3_600_000;
    const latestStartMs = deadlineMs - durationMs;
    if (latestStartMs < nowMs) continue;

    const firstStartMs = ceilTo(nowMs, stepMs);
    for (let t = firstStartMs; t <= latestStartMs; t += stepMs) {
      const start = new Date(t);
      const end = new Date(t + durationMs);
      if (!isChargerFree(c.id, start, end, existingBookings, ignoreBookingId)) {
        continue;
      }
      if (hasUserConflict(start, end, userBookings, ignoreBookingId)) {
        continue;
      }
      const sc = scoreCandidate(
        { start, end, powerKW: c.powerKW, energyKWh: energyDemandKWh },
        preferences,
      );
      out.push({
        chargerId: c.id,
        chargerLabel: c.label,
        powerKW: c.powerKW,
        start,
        end,
        ...sc,
      });
    }
  }
  return out;
}

module.exports = { generateCandidates };
