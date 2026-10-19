/**
 * Zero-fill a sparse per-day count series over a trailing window (#952).
 *
 * The analytics API returns one row per day that has data. Plotting only
 * those rows draws a line that skips empty days entirely, implying activity
 * was continuous; a 30-day-titled chart built from days-with-data can span
 * months. This expands the series to one point per calendar day over the
 * window, with zeros where nothing happened, so the line tells the truth.
 *
 * Pure so it can be unit-tested without rendering the tab (App.jsx OOM
 * convention: gating and shaping logic lives in utils/).
 *
 * @param {Array<{date: string, count: string|number}>} items Rows keyed by
 *   "YYYY-MM-DD" date strings (the API's DATE() output), any order.
 * @param {number} days Window length in days, today inclusive.
 * @param {Date} [now] Clock override for tests; defaults to the real now.
 * @returns {Array<{date: string, count: number}>} One entry per day,
 *   oldest first, "YYYY-MM-DD" keys, zeros filled in.
 */
export function fillDailySeries(items, days, now = new Date()) {
  const countsByDay = {};
  for (const item of items || []) {
    // Normalise whatever date shape arrives to a UTC YYYY-MM-DD key; skip
    // rows whose date does not parse rather than letting toISOString throw
    // and white-screen the whole tab.
    const d = new Date(item.date);
    if (isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    countsByDay[key] = (countsByDay[key] || 0) + (parseInt(item.count, 10) || 0);
  }

  const series = [];
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(end - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date: key, count: countsByDay[key] || 0 });
  }
  return series;
}
