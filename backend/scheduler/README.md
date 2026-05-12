# Scheduler

Continuous booking scheduler for the EV charging app. Picks a charger and
a time slot for each pending booking, and proposes earlier slots when
they appear.

## How to run

```
cd backend
npm start
```

The scheduler starts automatically once Mongoose connects (see
`backend/server.js`). It runs immediately and then every
`TICK_INTERVAL_MS` (15 s, see `config.js`). Routes also call
`trigger()` after creating or cancelling a booking so the user doesn't
have to wait for the next periodic tick.

Smoke test the pure algorithm without a DB:

```
node backend/scheduler/example.js
```

## Data model

A `Booking` (see `models.js`) carries both the user's request and the
scheduler's answer:

- **Request:** `stationId`, `candidateChargers`, `energyDemandKWh`,
  `maxWaitHours`, `preferences: { price, co2 }` (weights normalised to
  sum to 1).
- **Answer (`assignment`, null until scheduled):** `chargerId`,
  `chargerLabel`, `powerKW`, `startTime`, `endTime`,
  `estimatedCostDkk`, `estimatedCo2Score`, `assignedAt`.
- **`proposedReschedule`** (null unless an earlier slot was found): same
  fields as `assignment` prefixed with `new`, plus `proposedAt`.
- **`status`** transitions: `pending → scheduled → in_progress →
  completed`, or `pending → infeasible`, or any non-terminal state →
  `cancelled` via DELETE.

## Algorithm (plain English)

For a booking request, for each candidate charger the user accepts:

1. Compute the charging duration as `energyDemandKWh / charger.powerKW`.
2. Walk start times in 15-minute steps from "now" to "now +
   maxWaitHours − duration".
3. Skip starts where the slot overlaps another booking on the same
   charger.
4. Score each free slot:
   `score = price_weight × avg_DKK_per_kWh − co2_weight × avg_renewable_share_%`.
   Lower wins. The two terms aren't directly comparable; the weights are
   how the user expresses how much each one matters.
5. Pick the lowest-scoring slot across all chargers. If none fits inside
   the wait window, return `null` → the booking becomes `infeasible`.

Every 15 s the scheduler also re-runs the search for already-scheduled
bookings. If a strictly-earlier slot exists (by at least 5 minutes), it
writes a `proposedReschedule`. The booking's current `assignment` is
never changed without the user accepting; **never push later, never
silently overwrite**.

## Pricing and renewable share

Hardcoded 24-hour tables for DK1 in `pricing.js`. They approximate Nord
Pool spot prices and Energi Data Service renewable share patterns for
2025 — not real-time. Weekday/weekend split for prices; the same
renewable profile for both. Citation block lives at the top of
`pricing.js`:

- Nord Pool day-ahead prices (DK1): https://www.nordpoolgroup.com/
- Energi Data Service: https://www.energidataservice.dk/

The server reads hours from `Date#getHours()`, so production deployments
outside CET/CEST should swap that for a fixed-zone lookup.

## Files

```
config.js        // tick interval, slot granularity, proposal floor
pricing.js       // hourly DKK + renewable tables, avg helpers
scoring.js       // scoreCandidate (pure)
availability.js  // isChargerFree (pure)
candidates.js    // 15-min grid sweep × chargers
scheduler.js     // findBestSlot (pure)
bookings.js      // DB I/O: assignPending, acceptReschedule, rejectReschedule
reoptimizer.js   // tick loop body: propose earlier slots
index.js         // start/trigger/stop, single-flight guard
models.js        // Mongoose Booking schema
example.js       // smoke test (no DB)
```

## Wiping the bookings collection

The schema renamed `assignment.estimatedCostEur` → `estimatedCostDkk` and
added `proposedReschedule`. If you have older documents lying around:

```
mongosh "$MONGODB_URI"
> db.bookings.drop()
> exit
npm run seed:bookings
```

## Things the scheduler does not model

- **Charger faults / liveness.** Assignments are trusted; if a charger
  goes offline mid-charge, the slot is still considered occupied. A
  cancel from the user frees it.
- **Real-time pricing.** Tables are static. To plug in a live feed,
  replace `getPrice` and `getRenewable` and keep their signatures.

## Curl recipes

```
# Create a booking (replace $TOKEN and station fields with real values)
curl -X POST http://localhost:5000/api/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"stationId":999001,"stationName":"Test","stationLat":55.67,"stationLon":12.57,
       "candidateChargers":[{"id":1,"label":"Type 2 — 22 kW","powerKW":22}],
       "energyDemandKWh":10,"maxWaitHours":6,"preferences":{"price":0.9,"co2":0.1}}'

# Accept / reject an earlier slot proposal
curl -X POST http://localhost:5000/api/bookings/<id>/accept-reschedule \
  -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:5000/api/bookings/<id>/reject-reschedule \
  -H "Authorization: Bearer $TOKEN"
```
