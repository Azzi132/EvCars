// Knobs for the scheduler. Imported by index.js, candidates.js, reoptimizer.js.

module.exports = {
  // How often the background loop runs. 15s is a compromise between
  // freshness (a freed slot should propagate quickly) and load.
  TICK_INTERVAL_MS: 15000,

  // Candidate start times are aligned to this minute boundary so the
  // search space stays small (96 starts per 24h window per charger).
  SLOT_STEP_MIN: 15,

  // Reoptimizer ignores proposals smaller than this many minutes earlier
  // than the current assignment — stops the banner from flickering on
  // ties at adjacent grid slots.
  PROPOSAL_MIN_GAIN_MIN: 5,

  CURRENCY: "DKK",
};
