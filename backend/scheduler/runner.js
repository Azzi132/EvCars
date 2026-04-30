// Background runner that drives the scheduler.
//
// Two ways the scheduler runs:
//   1. Periodically — every 30 seconds, so completed bookings get marked
//      done and bookings whose start time has arrived flip to in_progress
//      even when nobody touches the API.
//   2. On demand — `trigger()` is called from booking routes after a
//      create or cancel so the user doesn't have to wait for the next
//      tick. We debounce these calls to coalesce bursts (e.g. ten people
//      booking in the same second only causes one extra run).
//
// `running` and `dirty` together implement a single-flight + replay
// pattern: if a tick is already in flight when another fires, we just
// remember that something changed and re-run once it finishes.

const { runScheduler } = require("./index");

const INTERVAL_MS = 30 * 1000;
const DEBOUNCE_MS = 500;

let intervalHandle = null;
let debounceHandle = null;
let running = false;
let dirty = false;

async function safeRun() {
  if (running) {
    // Another run is already happening — just mark that more work has
    // arrived and let the in-flight run kick off a follow-up when done.
    dirty = true;
    return;
  }
  running = true;
  try {
    await runScheduler(new Date());
  } catch (err) {
    console.error("[scheduler] run failed:", err);
  } finally {
    running = false;
    if (dirty) {
      dirty = false;
      // setImmediate (rather than calling safeRun directly) avoids
      // recursing on the same stack and lets Mongo finish flushing.
      setImmediate(safeRun);
    }
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(safeRun, INTERVAL_MS);
  safeRun();
  console.log(`[scheduler] runner started (interval ${INTERVAL_MS / 1000}s)`);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (debounceHandle) {
    clearTimeout(debounceHandle);
    debounceHandle = null;
  }
}

function trigger() {
  // Reset the timer on every call — only the last trigger in a burst
  // actually fires. 500 ms is short enough to feel instant and long
  // enough to coalesce a flurry of API calls.
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    safeRun();
  }, DEBOUNCE_MS);
}

module.exports = { start, stop, trigger };
