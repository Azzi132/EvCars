const WEEKDAY_PRICES = [
  1.7, 1.65, 1.6, 1.55, 1.6, 1.75, 2.1, 2.6, 2.8, 2.5, 2.2, 2.0, 1.9, 1.85,
  1.95, 2.1, 2.5, 3.0, 3.3, 3.2, 2.9, 2.4, 2.0, 1.8,
];

const WEEKEND_PRICES = [
  1.6, 1.55, 1.5, 1.45, 1.5, 1.6, 1.75, 1.9, 1.95, 1.85, 1.65, 1.45, 1.3, 1.25,
  1.35, 1.55, 1.85, 2.2, 2.5, 2.4, 2.1, 1.85, 1.65, 1.55,
];

const RENEWABLE_SHARE = [
  78, 80, 82, 83, 82, 80, 72, 65, 60, 62, 68, 75, 82, 85, 86, 84, 78, 70, 60,
  58, 62, 70, 75, 77,
];

const isWeekend = (date) => {
  const d = date.getDay();
  return d === 0 || d === 6;
};

const getPrice = (date) =>
  (isWeekend(date) ? WEEKEND_PRICES : WEEKDAY_PRICES)[date.getHours()];

const getRenewable = (date) => RENEWABLE_SHARE[date.getHours()];

function weightedHourly(start, end, lookup) {
  const totalMs = end - start;
  if (totalMs <= 0) return lookup(start);
  let acc = 0;
  let cursor = new Date(start);
  while (cursor < end) {
    const nextHour = new Date(cursor);
    nextHour.setMinutes(60, 0, 0);
    const segmentEnd = nextHour < end ? nextHour : end;
    const segmentMs = segmentEnd - cursor;
    acc += (segmentMs / totalMs) * lookup(cursor);
    cursor = segmentEnd;
  }
  return acc;
}

const avgPrice = (start, end) => weightedHourly(start, end, getPrice);
const avgRenewable = (start, end) => weightedHourly(start, end, getRenewable);

module.exports = {
  WEEKDAY_PRICES,
  WEEKEND_PRICES,
  RENEWABLE_SHARE,
  getPrice,
  getRenewable,
  avgPrice,
  avgRenewable,
};
