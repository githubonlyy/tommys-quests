import { describe, it, expect } from 'vitest'
import { dailySubjects, dayIndex } from '../data/board.js'
import { EVENTS, CATEGORIES } from '../data/events.js'

const day = (n) => new Date(Date.UTC(2026, 7, 28) + n * 86400000).toISOString().slice(0, 10)

describe('dayIndex', () => {
  it('counts whole days and ignores junk', () => {
    expect(dayIndex('2026-08-29') - dayIndex('2026-08-28')).toBe(1)
    expect(dayIndex('2026-09-01') - dayIndex('2026-08-31')).toBe(1) // across a month
    expect(dayIndex('')).toBe(0)
    expect(dayIndex(undefined)).toBe(0)
  })
})

describe('dailySubjects', () => {
  it('gives the same six all day and a different six tomorrow', () => {
    const today = dailySubjects(day(0), EVENTS)
    expect(today).toHaveLength(6)
    expect(dailySubjects(day(0), EVENTS).map((e) => e.id)).toEqual(today.map((e) => e.id))
    expect(dailySubjects(day(1), EVENTS).map((e) => e.id)).not.toEqual(today.map((e) => e.id))
  })

  it('returns real events, without repeats, in board order where it does not wrap', () => {
    const set = dailySubjects(day(3), EVENTS)
    const ids = set.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of set) expect(EVENTS).toContain(e)
  })

  // the board rotates inside each category, so coverage is per category
  it('every subject in a category comes around within a fortnight', () => {
    for (const cat of CATEGORIES) {
      const inCat = EVENTS.filter((e) => e.category === cat.id)
      if (inCat.length === 0) continue
      const seen = new Set()
      for (let i = 0; i < 14; i++) for (const e of dailySubjects(day(i), inCat, 2)) seen.add(e.id)
      expect(seen.size, cat.id).toBe(inCat.length)
    }
  })

  it('shows something from every category every day', () => {
    for (let i = 0; i < 14; i++) {
      for (const cat of CATEGORIES) {
        const inCat = EVENTS.filter((e) => e.category === cat.id)
        expect(dailySubjects(day(i), inCat, 2).length, `${cat.id} day ${i}`).toBeGreaterThan(0)
      }
    }
  })

  it('never asks for more subjects than exist', () => {
    expect(dailySubjects(day(0), EVENTS.slice(0, 3))).toHaveLength(3)
    expect(dailySubjects(day(0), [])).toEqual([])
  })

  it('the daily goal is always reachable from the visible set', () => {
    for (let i = 0; i < 14; i++) expect(dailySubjects(day(i), EVENTS).length).toBeGreaterThanOrEqual(2)
  })
})
