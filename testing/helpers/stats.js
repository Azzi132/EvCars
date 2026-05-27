"use strict";

function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(xs, p) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

const p50 = (xs) => percentile(xs, 50);
const p95 = (xs) => percentile(xs, 95);
const p99 = (xs) => percentile(xs, 99);

function stddev(xs) {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
}

module.exports = { mean, percentile, p50, p95, p99, stddev };
