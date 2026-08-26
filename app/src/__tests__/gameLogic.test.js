import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  reducer,
  DEFAULT_STATE,
  levelCost,
  applyXp,
  businessDate,
} from '../context/PlayerContext.jsx'
import { lessonCardsForToday, CARDS_PER_DAY } from '../match/lessonRotation.js'
import LESSONS from '../data/lessons.json'
import config from '../data/config.json'

const fresh = () => structuredClone(DEFAULT_STATE)

// engine-shaped MATCH_RESULT action
const match = (over = {}) => ({
  type: 'MATCH_RESULT',
  eventId: 'math',
  subject: 'Vault Heist',
  result: 'WIN',
  correct: 8,
  total: 10,
  coinsEarned: 135,
  xpEarned: 80,
  avgTimeSec: 6.5,
  practice: false,
  ...over,
})

// fixed local times (month is 0-based)
const DAY1_10AM = new Date(2026, 7, 24, 10, 0, 0)
const DAY2_10AM = new Date(2026, 7, 25, 10, 0, 0)
const DAY4_10AM = new Date(2026, 7, 27, 10, 0, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(DAY1_10AM)
})
afterEach(() => vi.useRealTimers())

describe('level curve', () => {
  it('levelCost grows linearly', () => {
    expect(levelCost(1)).toBe(300)
    expect(levelCost(5)).toBe(700)
  })

  it('applyXp carries leftover into the next level', () => {
    const r = applyXp({ xp: 290, level: 1 }, 20) // cost 300 -> 310 total
    expect(r.level).toBe(2)
    expect(r.xp).toBe(10)
    expect(r.leveledUp).toBe(true)
  })

  it('applyXp can jump multiple levels', () => {
    const r = applyXp({ xp: 0, level: 1 }, 300 + 400 + 5)
    expect(r.level).toBe(3)
    expect(r.xp).toBe(5)
  })
})

describe('businessDate (day flips at 05:00)', () => {
  it('3 AM still belongs to the previous day', () => {
    expect(businessDate(new Date(2026, 7, 26, 3, 0))).toBe('2026-08-25')
  })
  it('6 AM belongs to the current day', () => {
    expect(businessDate(new Date(2026, 7, 26, 6, 0))).toBe('2026-08-26')
  })
})

describe('MATCH_RESULT', () => {
  it('paid match adds coins, xp, daily play, log entry', () => {
    const s = reducer(fresh(), match())
    expect(s.coins).toBe(135)
    expect(s.dailyPlays.math).toBe(businessDate())
    expect(s.battleLog).toHaveLength(1)
    expect(s.battleLog[0]).toMatchObject({ subject: 'Vault Heist', result: 'WIN', correct: 8, total: 10, coins: 135 })
  })

  it('practice gives xp but no coins and no daily-play mark', () => {
    const s = reducer(fresh(), match({ practice: true }))
    expect(s.coins).toBe(0)
    expect(s.dailyPlays.math).toBeUndefined()
    expect(s.battleLog[0].coins).toBe(0)
    expect(s.xp).toBeGreaterThan(0)
  })

  it('battle log caps at 100 entries', () => {
    let s = fresh()
    for (let i = 0; i < 105; i++) s = reducer(s, match())
    expect(s.battleLog).toHaveLength(100)
  })

  it('tracks win stats per subject and perfect counts', () => {
    let s = reducer(fresh(), match({ correct: 10 })) // win + perfect
    s = reducer(s, match({ eventId: 'english', subject: 'Alien Decode', result: 'LOSS', correct: 3 }))
    expect(s.stats.totalWins).toBe(1)
    expect(s.stats.perfectCount).toBe(1)
    expect(s.stats.winsBySubject.math).toBe(1)
    expect(s.stats.winsBySubject.english).toBeUndefined()
  })
})

describe('streak', () => {
  it('same-day matches count once; consecutive days grow; gaps reset', () => {
    let s = reducer(fresh(), match())
    s = reducer(s, match()) // same day again
    expect(s.streak.count).toBe(1)

    vi.setSystemTime(DAY2_10AM)
    s = reducer(s, match())
    expect(s.streak.count).toBe(2)
    expect(s.streak.best).toBe(2)

    vi.setSystemTime(DAY4_10AM) // skipped a day
    s = reducer(s, match())
    expect(s.streak.count).toBe(1)
    expect(s.streak.best).toBe(2)
  })

  it('practice does not advance the streak', () => {
    const s = reducer(fresh(), match({ practice: true }))
    expect(s.streak.count).toBe(0)
  })
})

describe('trophies', () => {
  it('first win and perfect match award trophies', () => {
    const s = reducer(fresh(), match({ correct: 10 }))
    expect(s.trophies['first-win']).toBeDefined()
    expect(s.trophies.perfect).toBeDefined()
  })

  it('rich trophy at 1000 coins', () => {
    const s = reducer(fresh(), match({ coinsEarned: 1200 }))
    expect(s.trophies.rich).toBeDefined()
  })
})

describe('BUY (real-world shop)', () => {
  const item = { id: 'lego-set', title: 'Lego Set', cost: 500 }

  it('deducts coins, logs purchase, awards shopper trophy', () => {
    let s = { ...fresh(), coins: 600 }
    s = reducer(s, { type: 'BUY', item })
    expect(s.coins).toBe(100)
    expect(s.purchases[0].title).toBe('Lego Set')
    expect(s.trophies.shopper).toBeDefined()
  })

  it('insufficient funds is a no-op', () => {
    const s0 = { ...fresh(), coins: 100 }
    expect(reducer(s0, { type: 'BUY', item })).toBe(s0)
  })
})

describe('CHEST_CLAIM', () => {
  it('adds coins once per business day', () => {
    let s = reducer(fresh(), { type: 'CHEST_CLAIM', amount: config.dailyChestCoins })
    expect(s.coins).toBe(100)
    expect(s.stats.chestsOpened).toBe(1)
    expect(s.trophies['chest-hunter']).toBeDefined()

    const again = reducer(s, { type: 'CHEST_CLAIM', amount: config.dailyChestCoins })
    expect(again).toBe(s) // same-day double claim rejected
  })
})

describe('arcade', () => {
  const game = { id: 'flappy', title: 'Flappy Zap', price: 1500 }

  it('ARCADE_BUY deducts, unlocks permanently, logs; double-buy and poor no-op', () => {
    let s = { ...fresh(), coins: 2000 }
    s = reducer(s, { type: 'ARCADE_BUY', game })
    expect(s.coins).toBe(500)
    expect(s.ownedGames).toContain('flappy')
    expect(s.purchases[0].cost).toBe(1500)

    expect(reducer(s, { type: 'ARCADE_BUY', game })).toBe(s) // already owned
    const poor = { ...fresh(), coins: 10 }
    expect(reducer(poor, { type: 'ARCADE_BUY', game })).toBe(poor)
  })

  it('ARCADE_SCORE keeps only the best score', () => {
    let s = reducer(fresh(), { type: 'ARCADE_SCORE', game: 'coinrush', score: 120 })
    expect(s.arcadeHighScores.coinrush).toBe(120)
    const lower = reducer(s, { type: 'ARCADE_SCORE', game: 'coinrush', score: 80 })
    expect(lower).toBe(s)
  })
})

describe('LESSON_READ + rotation', () => {
  it('marks the subject read for today', () => {
    const s = reducer(fresh(), { type: 'LESSON_READ', eventId: 'math' })
    expect(s.lessonsRead.math).toBe(businessDate())
  })

  it('every subject has a lesson pool sized for clean rotation', () => {
    for (const [subject, pool] of Object.entries(LESSONS)) {
      expect(pool.length, subject).toBeGreaterThanOrEqual(CARDS_PER_DAY)
    }
  })

  it('same date -> same cards; next day -> different slice; all from pool', () => {
    const a1 = lessonCardsForToday('math', '2026-08-26')
    const a2 = lessonCardsForToday('math', '2026-08-26')
    const b = lessonCardsForToday('math', '2026-08-27')
    expect(a1).toHaveLength(CARDS_PER_DAY)
    expect(a1).toEqual(a2)
    expect(a1).not.toEqual(b)
    for (const card of a1) expect(LESSONS.math).toContainEqual(card)
  })
})
