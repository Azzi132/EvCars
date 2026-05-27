"use strict";

/**
 * Experiment 3 — Scheduler scaling at the target system size.
 *
 *   MEASURES : per-booking assignPending latency (backend/scheduler/bookings.js)
 *              and the total time to drain 100 new pending bookings, as the
 *              system grows.
 *   VARIES   : (stations, active bookings):
 *              (200,500), (300,750), (400,1000), (400,1500), (400,2000).
 *   FIXED    : 4 chargers/station; 100 new pending bookings per configuration.
 *   MAPS TO  : "500–1000 active bookings across 200–400 stations" (report §3.2.3),
 *              scaling along the stations and active-bookings axes (§6.5).
 *
 * assignPending is called directly in a loop — the periodic ticker is never
 * started. Each of the 100 pending bookings uses a fresh unique user id, so
 * loadUserBookings returns empty and the measured cost reflects DB selectivity
 * and the charger-availability search, not artificial self-conflicts. Earlier
 * assignments occupy slots for later ones, exactly as a real drain does.
 */

const path = require("path");
const { assignPending } = require("../backend/scheduler/bookings");

const db = require("./helpers/db");
const { Booking, mongoose } = db;
const { makeStations } = require("./helpers/stations");
const { makeActiveBookingDocs, makePendingDoc } = require("./helpers/bookings");
const stats = require("./helpers/stats");
const { writeCsv, printTable } = require("./helpers/csv");
const { banner } = require("./helpers/env");
const { toMs } = require("./helpers/timing");

const CONFIGS = [
  { stations: 200, active: 500 },
  { stations: 300, active: 750 },
  { stations: 400, active: 1000 },
  { stations: 400, active: 1500 },
  { stations: 400, active: 2000 },
];
const CHARGERS_PER_STATION = 4;
const PENDING_COUNT = 100;

async function main() {
  banner("Experiment 3: scheduler scaling at target system size");
  console.log(
    `[params] configs=${JSON.stringify(CONFIGS.map((c) => [c.stations, c.active]))} ` +
      `chargers/station=${CHARGERS_PER_STATION} pending/config=${PENDING_COUNT}`,
  );

  let mongo;
  try {
    mongo = await db.startMongo({ connect: true });

    const rows = [];
    for (const cfg of CONFIGS) {
      const tag = `stations=${cfg.stations} active=${cfg.active}`;

      // (1) Wipe everything and prove the DB is clean before seeding.
      await db.wipeAll();
      await db.assertEmpty(tag);
      await db.logCounts(tag);

      // (2) Pre-populate stations + active bookings, verify the count.
      const stations = makeStations(cfg.stations, CHARGERS_PER_STATION);
      const fillerUserIds = Array.from({ length: 200 }, () => new mongoose.Types.ObjectId());
      await Booking.insertMany(
        makeActiveBookingDocs({
          stations,
          count: cfg.active,
          userIds: fillerUserIds,
          now: new Date(),
        }),
      );
      await db.assertCount(Booking, cfg.active, `${tag} active seed`);

      // Pre-create the 100 pending bookings (each a fresh user), saved as
      // pending — mirroring what the booking route writes before scheduling.
      const pendingDocs = [];
      for (let i = 0; i < PENDING_COUNT; i++) {
        const station = stations[Math.floor(Math.random() * stations.length)];
        const userId = new mongoose.Types.ObjectId();
        const doc = new Booking(makePendingDoc({ station, userId }));
        await doc.save();
        pendingDocs.push(doc);
      }
      console.log(
        `[setup] ${tag} — seeded ${cfg.active} active + ${PENDING_COUNT} pending`,
      );

      // (3) Drain: assignPending each pending booking, timing each call and the
      //     whole loop.
      const samples = [];
      let assigned = 0;
      let infeasible = 0;
      const drain0 = process.hrtime.bigint();
      for (const doc of pendingDocs) {
        const t0 = process.hrtime.bigint();
        const res = await assignPending(doc);
        samples.push(toMs(process.hrtime.bigint() - t0));
        if (res) assigned++;
        else infeasible++;
      }
      const totalDrainMs = toMs(process.hrtime.bigint() - drain0);

      if (infeasible > PENDING_COUNT * 0.2) {
        console.warn(
          `[warn] ${infeasible}/${PENDING_COUNT} pending were infeasible — ` +
            `seed may be saturating the wait window`,
        );
      }
      console.log(
        `[done]  ${tag} — assigned=${assigned} infeasible=${infeasible} ` +
          `drain=${totalDrainMs.toFixed(1)}ms`,
      );

      rows.push({
        n_stations: cfg.stations,
        n_active_bookings: cfg.active,
        mean_assign_ms: stats.mean(samples),
        p95_assign_ms: stats.p95(samples),
        p99_assign_ms: stats.p99(samples),
        total_drain_ms_for_100: totalDrainMs,
      });
    }

    const header = [
      "n_stations", "n_active_bookings", "mean_assign_ms",
      "p95_assign_ms", "p99_assign_ms", "total_drain_ms_for_100",
    ];
    const csvRows = rows.map((r) => [
      r.n_stations,
      r.n_active_bookings,
      r.mean_assign_ms.toFixed(3),
      r.p95_assign_ms.toFixed(3),
      r.p99_assign_ms.toFixed(3),
      r.total_drain_ms_for_100.toFixed(3),
    ]);
    const outPath = path.join(__dirname, "results", "exp3_full_system_scale.csv");
    writeCsv(outPath, header, csvRows);
    printTable("Experiment 3 results", header, csvRows);
    console.log("\nDone. Wrote testing/results/exp3_full_system_scale.csv");
  } finally {
    if (mongo) await db.stopMongo(mongo);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
