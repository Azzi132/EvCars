"use strict";

const http = require("http");
const { Booking } = require("./db");
const { toMs } = require("./timing");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function quiesce({
  timeoutMs = 60000,
  stableMs = 6000,
  pollMs = 250,
} = {}) {
  const start = Date.now();
  let prev = null;
  let unchangedSince = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const [pending, proposed, latest] = await Promise.all([
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({ proposedReschedule: { $ne: null } }),
      Booking.findOne({ proposedReschedule: { $ne: null } })
        .sort({ "proposedReschedule.proposedAt": -1 })
        .select("proposedReschedule.proposedAt")
        .lean(),
    ]);
    const maxAt = latest?.proposedReschedule?.proposedAt
      ? new Date(latest.proposedReschedule.proposedAt).getTime()
      : 0;
    const fingerprint = `${pending}:${proposed}:${maxAt}`;
    if (fingerprint !== prev) {
      prev = fingerprint;
      unchangedSince = Date.now();
    }
    if (pending === 0 && Date.now() - unchangedSince >= stableMs) return;
    await sleep(pollMs);
  }
  console.warn("[warn] quiesce timed out waiting for the scheduler to go idle");
}

function postBooking({ host = "127.0.0.1", port, token, body, agent }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port,
        path: "/api/bookings",
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runLevel({
  host = "127.0.0.1",
  port,
  token,
  stations,
  concurrency,
  total,
  agent,
  makeBody,
}) {
  const samples = new Array(total);
  let errors = 0;
  let next = 0;

  const wall0 = process.hrtime.bigint();
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) break;
      const station = stations[Math.floor(Math.random() * stations.length)];
      const body = JSON.stringify(makeBody(station));
      const t0 = process.hrtime.bigint();
      try {
        const status = await postBooking({ host, port, token, body, agent });
        samples[i] = toMs(process.hrtime.bigint() - t0);
        if (status !== 201) errors++;
      } catch (e) {
        samples[i] = toMs(process.hrtime.bigint() - t0);
        errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const wallMs = toMs(process.hrtime.bigint() - wall0);
  return { samples, errors, wallMs };
}

module.exports = { quiesce, postBooking, runLevel, sleep };
