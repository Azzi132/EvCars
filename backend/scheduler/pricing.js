// Time-of-use (TOU) electricity pricing.
//
// We model the day as four flat-rate bands. Cheap overnight, normal
// during the working day, expensive in the evening peak, slightly cheaper
// late at night. The scheduler uses these to compute the projected cost
// of a charging slot — letting price-conscious users get pushed to
// off-peak hours.
//
// To swap in a real tariff, just edit the bands. The math below works
// for any non-overlapping list that covers the full 0–24 range.

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
//   - Each iteration finds the band that contains `cursor`, computes the
//     band's end-of-day boundary, and advances cursor to whichever is
//     sooner (band end or interval end), accumulating price × ms.
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

module.exports = {
  priceAtEurPerKWh,
  averagePriceOverInterval,
  TOU_BANDS,
};
