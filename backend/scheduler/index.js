// The scheduler's background loop. Exposes the same start/trigger/stop
// API the server.js + routes already import. Single-flight guard so
// overlapping calls coalesce instead of racing — important because the
// booking routes call trigger() on every create/cancel.

const Booking = require("./models");
const { TICK_INTERVAL_MS } = require("./config");
const { assignPending } = require("./bookings");
const { tickReoptimize } = require("./reoptimizer");

let timer = null;
let running = false;
let pendingTrigger = false;

async function run() {
  if (running) {
    pendingTrigger = true;
    return;
  }
  running = true;
  try {
    const now = new Date();

    // 1. Promote scheduled→in_progress and in_progress→completed first
    //    so freshly-vacated slots are visible to the rest of the tick.
    const startedRes = await Booking.updateMany(
      { status: "scheduled", "assignment.startTime": { $lte: now } },
      { $set: { status: "in_progress" } },
    );
    const completedRes = await Booking.updateMany(
      { status: "in_progress", "assignment.endTime": { $lte: now } },
      { $set: { status: "completed" } },
    );

    // 2. Assign any pending bookings. Infeasible is terminal — the user
    //    has been shown the "no slot found" screen and has either picked
    //    another station, adjusted preferences, or moved on. Reviving
    //    those rows would surprise the user with a booking they thought
    //    was abandoned.
    const queue = await Booking.find({ status: "pending" });
    let assigned = 0;
    let infeasible = 0;
    for (const doc of queue) {
      const res = await assignPending(doc);
      if (res) assigned++;
      else infeasible++;
    }

    // 3. Look for earlier slots for already-scheduled bookings.
    const { proposed, cleared } = await tickReoptimize();

    const started = startedRes.modifiedCount || 0;
    const completed = completedRes.modifiedCount || 0;
    const pending = queue.length;
    if (started || completed || pending || proposed || cleared) {
      console.log(
        `[scheduler] started:${started} completed:${completed} pending:${pending} assigned:${assigned} infeasible:${infeasible} proposed:${proposed} cleared:${cleared}`,
      );
    }
  } catch (err) {
    console.error("Scheduler tick error:", err);
  } finally {
    running = false;
    if (pendingTrigger) {
      pendingTrigger = false;
      setImmediate(run);
    }
  }
}

function start() {
  if (timer) return;
  console.log(`[scheduler] started — tick every ${TICK_INTERVAL_MS / 1000}s`);
  timer = setInterval(run, TICK_INTERVAL_MS);
  run();
}

function trigger() {
  if (running) {
    pendingTrigger = true;
  } else {
    run();
  }
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, trigger, stop };
