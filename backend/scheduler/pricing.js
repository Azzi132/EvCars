const TOU_BANDS = [
  { startHour: 0, endHour: 6, pricePerKWh: 0.10 },
  { startHour: 6, endHour: 17, pricePerKWh: 0.25 },
  { startHour: 17, endHour: 21, pricePerKWh: 0.40 },
  { startHour: 21, endHour: 24, pricePerKWh: 0.20 },
];

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
