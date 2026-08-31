// Which subjects the board offers today.
//
// Eight subjects is a long scroll, and the daily goal is only four, so the
// board shows a window that slides by one every day: every subject comes
// around within about a week, and the set is stable for the whole day (it is
// derived from the business date, not from the clock).

/** Days since the epoch for a `YYYY-MM-DD` business date; 0 for junk input. */
export function dayIndex(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return 0
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/**
 * `size` subjects for the given business date, in the board's own order,
 * wrapping around the end of the list. Fewer subjects than `size` returns them
 * all.
 */
export function dailySubjects(dateStr, events, size = 6) {
  const n = events.length
  if (n === 0) return []
  const take = Math.min(size, n)
  const start = ((dayIndex(dateStr) % n) + n) % n
  return Array.from({ length: take }, (_, i) => events[(start + i) % n])
}
