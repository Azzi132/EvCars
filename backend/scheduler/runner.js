const { runScheduler } = require("./index");

const INTERVAL_MS = 30 * 1000;
const DEBOUNCE_MS = 500;

let intervalHandle = null;
let debounceHandle = null;
let running = false;
let dirty = false;

async function safeRun() {
  if (running) {
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
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    safeRun();
  }, DEBOUNCE_MS);
}

module.exports = { start, stop, trigger };
