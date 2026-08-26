import LESSONS from '../data/lessons.json'
import { businessDate } from '../context/PlayerContext.jsx'

export const CARDS_PER_DAY = 3

// Today's cards, rotating through the subject's pool by date —
// stable all day, a different slice tomorrow.
export function lessonCardsForToday(eventId, date = businessDate()) {
  const pool = LESSONS[eventId] ?? []
  if (pool.length === 0) return []
  const dayNumber = Math.floor(Date.parse(date) / 86400000)
  const start = (dayNumber * CARDS_PER_DAY) % pool.length
  return Array.from({ length: Math.min(CARDS_PER_DAY, pool.length) }, (_, i) => pool[(start + i) % pool.length])
}
