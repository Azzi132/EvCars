"use strict";

process.env.JWT_SECRET = "evcars-test-secret";
process.env.OCM_API_KEY = process.env.OCM_API_KEY || "";

const path = require("path");
const http = require("http");
const jwt = require("../backend/node_modules/jsonwebtoken/index.js");

const db = require("./helpers/db.js");
const { Booking, User, mongoose } = db;
const { makeStations } = require("./helpers/stations.js");
const {
  makeActiveBookingDocs,
  makeProdScaleHttpBody,
} = require("./helpers/bookings.js");
const { quiesce, runLevel, sleep } = require("./helpers/loadtest.js");
const stats = require("./helpers/stats.js");
const { writeCsv, printTable } = require("./helpers/csv.js");
const { banner } = require("./helpers/env.js");

const CONCURRENCY_LEVELS = [1, 10, 25, 50, 100, 200];
const REQUESTS_PER_LEVEL = 500;
const N_STATIONS = 400;
const CHARGERS_PER_STATION = 4;
const N_ACTIVE = 1000;
const PORT = 5000;

async function main() {
  banner(
    "Experiment 4: concurrent booking requests at production scale " +
      "(400 stations, 1000 active bookings)",
  );
  console.log(
    `[params] concurrency=${JSON.stringify(CONCURRENCY_LEVELS)} ` +
      `requests/level=${REQUESTS_PER_LEVEL} stations=${N_STATIONS} ` +
      `chargers/station=${CHARGERS_PER_STATION} active_seed=${N_ACTIVE} port=${PORT}`,
  );

  let mongo;
  let agent;
  try {
    mongo = await db.startMongo({ connect: false });

    require("../backend/server.js");
    const scheduler = require("../backend/scheduler/index.js");

    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1) return resolve();
      const t = setTimeout(
        () => reject(new Error("timed out waiting for Mongo connection")),
        20000,
      );
      mongoose.connection.once("connected", () => {
        clearTimeout(t);
        resolve();
      });
      mongoose.connection.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
    await sleep(300);
    scheduler.stop();
    console.log(
      `[boot] real backend/server.js booted on port ${PORT}; 15s scheduler tick stopped`,
    );

    const user = await User.create({
      username: "loadtest-exp4",
      password: "x",
    });
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
    );

    const fillerUserIds = Array.from(
      { length: 200 },
      () => new mongoose.Types.ObjectId(),
    );
    const stations = makeStations(N_STATIONS, CHARGERS_PER_STATION);
    agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });

    const rows = [];
    for (const concurrency of CONCURRENCY_LEVELS) {
      await quiesce();
      await Booking.deleteMany({});
      const cleared = await Booking.countDocuments();
      if (cleared !== 0)
        throw new Error(`Expected 0 bookings after wipe, found ${cleared}`);

      await Booking.insertMany(
        makeActiveBookingDocs({
          stations,
          count: N_ACTIVE,
          userIds: fillerUserIds,
          now: new Date(),
          windowHours: 24,
          spread: "even",
        }),
      );

      const c = await db.counts();
      console.log(
        `[setup] concurrency=${concurrency} — DB ready (bookings=${c.bookings}, users=${c.users})`,
      );
      await db.assertCount(
        Booking,
        N_ACTIVE,
        `concurrency=${concurrency} seed`,
      );
      if (c.users !== 1)
        throw new Error(`Expected exactly 1 user, found ${c.users}`);

      const { samples, errors, wallMs } = await runLevel({
        host: "127.0.0.1",
        port: PORT,
        token,
        stations,
        concurrency,
        total: REQUESTS_PER_LEVEL,
        agent,
        makeBody: (station) => makeProdScaleHttpBody({ station }),
      });
      const throughput = REQUESTS_PER_LEVEL / (wallMs / 1000);
      rows.push({
        concurrency,
        total_requests: REQUESTS_PER_LEVEL,
        throughput_rps: throughput,
        mean_ms: stats.mean(samples),
        p50_ms: stats.p50(samples),
        p95_ms: stats.p95(samples),
        p99_ms: stats.p99(samples),
        errors,
      });
      console.log(
        `[done]  concurrency=${concurrency} — ${throughput.toFixed(1)} req/s, ` +
          `p95=${stats.p95(samples).toFixed(1)}ms, errors=${errors}`,
      );
    }

    await quiesce(); // settle the last level before teardown

    // Columns/order MUST match exp2_http_concurrent_bookings.csv exactly.
    const header = [
      "concurrency",
      "total_requests",
      "throughput_rps",
      "mean_ms",
      "p50_ms",
      "p95_ms",
      "p99_ms",
      "errors",
    ];
    const csvRows = rows.map((r) => [
      r.concurrency,
      r.total_requests,
      r.throughput_rps.toFixed(3),
      r.mean_ms.toFixed(3),
      r.p50_ms.toFixed(3),
      r.p95_ms.toFixed(3),
      r.p99_ms.toFixed(3),
      r.errors,
    ]);
    const outPath = path.join(
      __dirname,
      "results",
      "exp4_concurrent_at_production_scale.csv",
    );
    writeCsv(outPath, header, csvRows);
    printTable("Experiment 4 results", header, csvRows);
    console.log(
      "\nDone. Wrote testing/results/exp4_concurrent_at_production_scale.csv",
    );

    // Headline for the report: throughput + p95 at concurrency = 100, plus an
    // explicit error roundup (silent error counts are exactly what to flag).
    const c100 = rows.find((r) => r.concurrency === 100);
    if (c100) {
      console.log(
        `\n[headline] At 100 concurrent requests against ${N_STATIONS} stations / ` +
          `${N_ACTIVE} bookings: ${c100.throughput_rps.toFixed(1)} req/s, ` +
          `p95 = ${c100.p95_ms.toFixed(1)} ms, ${c100.errors} errors`,
      );
    }
    const totalErrors = rows.reduce((a, r) => a + r.errors, 0);
    if (totalErrors > 0) {
      console.log(
        `[headline] WARNING: ${totalErrors} request error(s) across the sweep:`,
      );
      for (const r of rows) {
        if (r.errors)
          console.log(
            `           concurrency=${r.concurrency}: ${r.errors} errors`,
          );
      }
    } else {
      console.log("[headline] 0 errors across all concurrency levels.");
    }
  } finally {
    if (agent) agent.destroy();
    // server.js owns the port-5000 listener and exposes no handle, so we cannot
    // close it directly — process.exit() below frees it.
    if (mongo) await db.stopMongo(mongo);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
