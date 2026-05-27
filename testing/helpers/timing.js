"use strict";

function toMs(ns) {
  return Number(ns) / 1e6;
}

function fmt(ms, decimals = 3) {
  return Number(ms).toFixed(decimals);
}

module.exports = { toMs, fmt };
