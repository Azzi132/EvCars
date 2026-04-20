const {
  chargingDurationMinutes,
  urgencyScore,
  requestCost,
} = require("../urgency");
const {
  SLOT_MINUTES,
  roundUpToSlot,
  buildTimeline,
  fitsInTimeline,
} = require("../resources");

const MAX_SWAP_PASSES = 3;

function assign(requests, externalCommittedBookings, now) {
  const timelines = new Map();

  const requestsSorted = [...requests].sort((a, b) => {
    const ua = urgencyScore(a, now);
    const ub = urgencyScore(b, now);
    if (ub !== ua) return ub - ua;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const results = new Map();

  const getTimeline = (chargerId) => {
    if (!timelines.has(chargerId)) {
      timelines.set(chargerId, buildTimeline(chargerId, externalCommittedBookings));
    }
    return timelines.get(chargerId);
  };

  for (const req of requestsSorted) {
    const best = findBestAssignment(req, getTimeline, now);
    if (!best) {
      results.set(String(req._id), { requestId: String(req._id), status: "infeasible" });
      continue;
    }
    commit(getTimeline(best.chargerId), best, String(req._id));
    results.set(String(req._id), {
      requestId: String(req._id),
      status: "scheduled",
      assignment: best,
    });
  }

  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < requestsSorted.length; i++) {
      for (let j = i + 1; j < requestsSorted.length; j++) {
        const ri = requestsSorted[i];
        const rj = requestsSorted[j];
        const resI = results.get(String(ri._id));
        const resJ = results.get(String(rj._id));
        if (resI.status !== "scheduled" || resJ.status !== "scheduled") continue;

        const swapped = trySwap(ri, rj, resI.assignment, resJ.assignment, getTimeline, now);
        if (swapped) {
          results.set(String(ri._id), {
            requestId: String(ri._id),
            status: "scheduled",
            assignment: swapped.i,
          });
          results.set(String(rj._id), {
            requestId: String(rj._id),
            status: "scheduled",
            assignment: swapped.j,
          });
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return Array.from(results.values());
}

function findBestAssignment(request, getTimeline, now) {
  const deadlineMs = new Date(request.deadline).getTime();
  const earliestStart = roundUpToSlot(now);
  const horizonMs = deadlineMs + 6 * 3600 * 1000;

  let best = null;

  for (const charger of request.candidateChargers) {
    const durationMin = chargingDurationMinutes(
      request.energyDemandKWh,
      charger.powerKW
    );
    if (!isFinite(durationMin)) continue;
    const durationMs = durationMin * 60 * 1000;

    const timeline = getTimeline(charger.id);

    for (
      let startMs = earliestStart.getTime();
      startMs <= horizonMs;
      startMs += SLOT_MINUTES * 60 * 1000
    ) {
      const endMs = startMs + durationMs;
      if (!fitsInTimeline(timeline, startMs, endMs)) continue;

      const candidate = {
        chargerId: charger.id,
        chargerLabel: charger.label,
        powerKW: charger.powerKW,
        startTime: new Date(startMs),
        endTime: new Date(endMs),
      };

      const cost = requestCost(request, candidate, now);
      const fullAssignment = {
        ...candidate,
        estimatedCostEur: cost.estimatedCostEur,
        deadlinePenaltyMinutes: cost.deadlinePenaltyMinutes,
        waitingPenaltyMinutes: cost.waitingPenaltyMinutes,
        _totalCost: cost.total,
      };

      if (!best || fullAssignment._totalCost < best._totalCost) {
        best = fullAssignment;
      }
    }
  }

  return best;
}

function commit(timeline, assignment, bookingId) {
  timeline.push({
    startMs: new Date(assignment.startTime).getTime(),
    endMs: new Date(assignment.endTime).getTime(),
    bookingId,
  });
  timeline.sort((a, b) => a.startMs - b.startMs);
}

function trySwap(reqI, reqJ, assignI, assignJ, getTimeline, now) {
  if (assignI.chargerId !== assignJ.chargerId) return null;

  const timeline = getTimeline(assignI.chargerId);
  const idI = String(reqI._id);
  const idJ = String(reqJ._id);

  const iAtJ = buildCandidate(reqI, assignJ, now);
  const jAtI = buildCandidate(reqJ, assignI, now);
  if (!iAtJ || !jAtI) return null;

  const iFits = fitsInTimeline(timeline, iAtJ.startMs, iAtJ.endMs, idI);
  const jFits = fitsInTimeline(
    timeline.filter((t) => t.bookingId !== idJ).concat([
      { startMs: iAtJ.startMs, endMs: iAtJ.endMs, bookingId: idI },
    ]),
    jAtI.startMs,
    jAtI.endMs,
    idJ
  );
  if (!iFits || !jFits) return null;

  const currentTotal = assignI._totalCost + assignJ._totalCost;
  const swappedTotal = iAtJ._totalCost + jAtI._totalCost;
  if (swappedTotal >= currentTotal - 1e-9) return null;

  const oldIslot = timeline.findIndex((t) => t.bookingId === idI);
  if (oldIslot >= 0) timeline.splice(oldIslot, 1);
  const oldJslot = timeline.findIndex((t) => t.bookingId === idJ);
  if (oldJslot >= 0) timeline.splice(oldJslot, 1);
  commit(timeline, iAtJ, idI);
  commit(timeline, jAtI, idJ);

  return { i: iAtJ, j: jAtI };
}

function buildCandidate(request, slotTemplate, now) {
  const charger = request.candidateChargers.find(
    (c) => c.id === slotTemplate.chargerId
  );
  if (!charger) return null;
  const durationMin = chargingDurationMinutes(
    request.energyDemandKWh,
    charger.powerKW
  );
  if (!isFinite(durationMin)) return null;

  const startMs = new Date(slotTemplate.startTime).getTime();
  const endMs = startMs + durationMin * 60 * 1000;

  const candidate = {
    chargerId: charger.id,
    chargerLabel: charger.label,
    powerKW: charger.powerKW,
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    startMs,
    endMs,
  };
  const cost = requestCost(request, candidate, now);
  return {
    ...candidate,
    estimatedCostEur: cost.estimatedCostEur,
    deadlinePenaltyMinutes: cost.deadlinePenaltyMinutes,
    waitingPenaltyMinutes: cost.waitingPenaltyMinutes,
    _totalCost: cost.total,
  };
}

module.exports = { assign };
