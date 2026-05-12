// DKK/kWh and renewable-share % tables are approximations of DK1 patterns
// for 2025 based on publicly documented Nord Pool spot prices and Energi
// Data Service "CO2Emis" / renewable share data. Not real-time — they're
// representative hourly profiles used as a stand-in for a live price feed.
// Sources:
//   Nord Pool day-ahead prices (DK1):    https://www.nordpoolgroup.com/
//   Energi Data Service:                 https://www.energidataservice.dk/

// DKK/kWh, weekday DK1 — index = hour 0..23
const WEEKDAY_PRICES = [
  1.70, 1.65, 1.60, 1.55, 1.60, 1.75,
  2.10, 2.60, 2.80, 2.50, 2.20, 2.00,
  1.90, 1.85, 1.95, 2.10, 2.50, 3.00,
  3.30, 3.20, 2.90, 2.40, 2.00, 1.80,
];

const WEEKEND_PRICES = [
  1.60, 1.55, 1.50, 1.45, 1.50, 1.60,
  1.75, 1.90, 1.95, 1.85, 1.65, 1.45,
  1.30, 1.25, 1.35, 1.55, 1.85, 2.20,
  2.50, 2.40, 2.10, 1.85, 1.65, 1.55,
];

// Renewable share %, by hour (same on weekdays and weekends — simplified).
const RENEWABLE_SHARE = [
  78, 80, 82, 83, 82, 80,
  72, 65, 60, 62, 68, 75,
  82, 85, 86, 84, 78, 70,
  60, 58, 62, 70, 75, 77,
];

const isWeekend = (date) => {
  const d = date.getDay();
  return d === 0 || d === 6;
};

const getPrice = (date) =>
  (isWeekend(date) ? WEEKEND_PRICES : WEEKDAY_PRICES)[date.getHours()];

const getRenewable = (date) => RENEWABLE_SHARE[date.getHours()];

// Walks each hour boundary inside [start, end) and returns a duration-
// weighted average of `lookup(hourDate)`. Used to average price or
// renewable share across a charging window that may span multiple hours.
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
