// Two cost dimensions live in this file: real money (€/kWh, time-of-use)
// and a relative CO2 score. The scheduler's cost function is a weighted
// sum of both, so we expose them with comparable shapes — `priceTerm`
// returns € for the energy delivered, `co2Term` returns a unit-less
// "eco score" that's also expressed in €-equivalent so the weighted
// sum is sane.
//
// To swap in a real tariff or a real grid-intensity feed, edit the
// constants below; the scheduler doesn't care about the units, only
// that bigger = worse.

// ---- Time-of-use electricity pricing -------------------------------------

// Four flat-rate bands covering the full 24h day. Cheap overnight,
// normal during the working day, expensive in the evening peak,
// slightly cheaper late at night. Edit these to model a real tariff.
const TOU_BANDS = [
  { startHour: 0, endHour: 6, pricePerKWh: 0.10 },
  { startHour: 6, endHour: 17, pricePerKWh: 0.25 },
  { startHour: 17, endHour: 21, pricePerKWh: 0.40 },
  { startHour: 21, endHour: 24, pricePerKWh: 0.20 },
];

// Spot price for the moment in time `date` falls into.
function priceAtEurPerKWh(date) {
  const d = date instanceof Date ? date : new Date(date);
  const hour = d.getHours() + d.getMinutes() / 60;
  const band = TOU_BANDS.find((b) => hour >= b.startHour && hour < b.endHour);
  return band ? band.pricePerKWh : TOU_BANDS[TOU_BANDS.length - 1].pricePerKWh;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Average €/kWh over a time interval, weighting each TOU band by how
// many milliseconds of the interval fall inside it.
//
// Walk-the-bands algorithm:
//   - cursor starts at `s`.
//   - Each iteration finds the band that contains `cursor`, computes
//     the band's end-of-day boundary, and advances cursor to whichever
//     is sooner (band end or interval end), accumulating price × ms.
//   - Stops when cursor hits `e`.
//   - Final result = total weighted price ÷ total ms.
function averagePriceOverInterval(start, end) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (e <= s) return priceAtEurPerKWh(s);

  const totalMs = e.getTime() - s.getTime();
  let weighted = 0;
  let cursor = new Date(s);

  while (cursor < e) {
    const dayStart = startOfDay(cursor);
    const hour = cursor.getHours() + cursor.getMinutes() / 60;
    const band = TOU_BANDS.find((b) => hour >= b.startHour && hour < b.endHour)
      || TOU_BANDS[TOU_BANDS.length - 1];
    const bandEnd = new Date(dayStart.getTime() + band.endHour * 3600 * 1000);
    const next = bandEnd < e ? bandEnd : e;
    const ms = next.getTime() - cursor.getTime();
    weighted += band.pricePerKWh * ms;
    cursor = next;
  }

  return weighted / totalMs;
}

// ---- CO2 / "eco" scoring -------------------------------------------------

// Scaling factor that makes the CO2 term comparable in magnitude to the
// price term. The exact number isn't physically meaningful — it's tuned
// so that, with energy and power figures typical for our chargers
// (10–60 kWh, 7–150 kW), the CO2 score lands in the same ballpark as
// the electricity bill. Increase to make CO2-conscious users prefer
// slow chargers more strongly.
const CO2_FACTOR = 0.0008;

// Relative environmental cost of charging `energyKWh` at a charger of
// `chargerPowerKW`. Linear in both:
//   - More energy ⇒ more total emissions.
//   - Higher kW ⇒ more instantaneous grid load, which (especially at
//     peak times) is more likely to come from dirtier peaker plants.
// A user who weights `co2` highly will see slow chargers picked over
// fast ones for the same booking.
function co2ScoreForCharge(energyKWh, chargerPowerKW) {
  if (!chargerPowerKW || chargerPowerKW <= 0) return 0;
  return energyKWh * chargerPowerKW * CO2_FACTOR;
}

module.exports = {
  priceAtEurPerKWh,
  averagePriceOverInterval,
  co2ScoreForCharge,
  TOU_BANDS,
  CO2_FACTOR,
};
