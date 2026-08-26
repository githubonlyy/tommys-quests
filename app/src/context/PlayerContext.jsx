import { createContext, useContext, useEffect, useReducer } from 'react'
import config from '../data/config.json'
import { evaluateTrophies } from '../data/trophies.js'

const STORAGE_KEY = 'tommys-quests-v1'

// exported for tests
export const DEFAULT_STATE = {
  version: 1,
  coins: 0,
  xp: 0, // progress inside current level
  level: 1,
  pin: config.defaultPin,
  dailyPlays: {}, // eventId -> business date string of last PAID play
  battleLog: [], // newest first, capped at 100
  purchases: [], // newest first
  stats: { totalWins: 0, perfectCount: 0, winsBySubject: {}, chestsOpened: 0 },
  streak: { count: 0, best: 0, lastDate: null }, // paid-play daily streak
  chestClaimed: null, // business date the daily chest was opened
  trophies: {}, // trophyId -> earned timestamp
  ownedGames: ['coinrush'], // arcade games bought with coins (coinrush is free)
  arcadeHighScores: {}, // gameId -> best score
  lessonsRead: {}, // eventId -> business date the day's lesson cards were read
  corrupt: false,
}

// XP needed to go from `level` to `level + 1`
export function levelCost(level) {
  return 200 + 100 * level
}

// "Game day" flips at dailyResetHour (05:00), not midnight
export function businessDate(now = new Date()) {
  const shifted = new Date(now.getTime() - config.dailyResetHour * 3600 * 1000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function applyXp(state, gained) {
  let { xp, level } = state
  xp += gained
  while (xp >= levelCost(level)) {
    xp -= levelCost(level)
    level += 1
  }
  return { xp, level, leveledUp: level > state.level }
}

// exported for tests
export function reducer(state, action) {
  switch (action.type) {
    case 'MATCH_RESULT': {
      const { eventId, subject, result, correct, total, coinsEarned, xpEarned, avgTimeSec, practice } = action
      const { xp, level } = applyXp(state, xpEarned)
      const entry = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        ts: Date.now(),
        subject,
        result,
        correct,
        total: total ?? 10,
        coins: practice ? 0 : coinsEarned,
        avgTimeSec,
        practice,
      }
      // aggregate counters (trophies read these — battleLog is capped at 100)
      const isWin = result === 'WIN'
      const stats = {
        ...state.stats,
        totalWins: state.stats.totalWins + (isWin ? 1 : 0),
        perfectCount: state.stats.perfectCount + (correct === (total ?? 10) ? 1 : 0),
        winsBySubject: isWin
          ? { ...state.stats.winsBySubject, [eventId]: (state.stats.winsBySubject[eventId] || 0) + 1 }
          : state.stats.winsBySubject,
      }

      // paid-play daily streak
      let streak = state.streak
      if (!practice) {
        const today = businessDate()
        if (streak.lastDate !== today) {
          const yesterday = businessDate(new Date(Date.now() - 24 * 3600 * 1000))
          const count = streak.lastDate === yesterday ? streak.count + 1 : 1
          streak = { count, best: Math.max(streak.best, count), lastDate: today }
        }
      }

      const next = {
        ...state,
        coins: practice ? state.coins : state.coins + coinsEarned,
        xp,
        level,
        dailyPlays: practice ? state.dailyPlays : { ...state.dailyPlays, [eventId]: businessDate() },
        battleLog: [entry, ...state.battleLog].slice(0, 100),
        stats,
        streak,
      }
      return { ...next, trophies: evaluateTrophies(next) }
    }
    case 'CHEST_CLAIM': {
      const today = businessDate()
      if (state.chestClaimed === today) return state
      const next = {
        ...state,
        coins: state.coins + action.amount,
        chestClaimed: today,
        stats: { ...state.stats, chestsOpened: state.stats.chestsOpened + 1 },
      }
      return { ...next, trophies: evaluateTrophies(next) }
    }
    case 'BUY': {
      const { item } = action
      if (state.coins < item.cost) return state // funds re-checked at dispatch time
      const purchase = { id: Date.now() + '-' + item.id, ts: Date.now(), title: item.title, cost: item.cost }
      const next = { ...state, coins: state.coins - item.cost, purchases: [purchase, ...state.purchases] }
      return { ...next, trophies: evaluateTrophies(next) }
    }
    case 'ARCADE_SCORE': {
      const prev = state.arcadeHighScores[action.game] || 0
      if (action.score <= prev) return state
      return { ...state, arcadeHighScores: { ...state.arcadeHighScores, [action.game]: action.score } }
    }
    case 'ARCADE_BUY': {
      const { game } = action // { id, title, price }
      if (state.ownedGames.includes(game.id) || state.coins < game.price) return state
      const purchase = { id: Date.now() + '-' + game.id, ts: Date.now(), title: `🎮 ${game.title}`, cost: game.price }
      return {
        ...state,
        coins: state.coins - game.price,
        ownedGames: [...state.ownedGames, game.id],
        purchases: [purchase, ...state.purchases],
      }
    }
    case 'LESSON_READ':
      return { ...state, lessonsRead: { ...state.lessonsRead, [action.eventId]: businessDate() } }
    case 'SET_PIN':
      return { ...state, pin: action.pin }
    case 'CLEAR_CORRUPT_FLAG':
      return { ...state, corrupt: false }
    case 'RESET_ALL':
      return { ...DEFAULT_STATE }
    default:
      return state
  }
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || parsed.version !== 1 || typeof parsed.coins !== 'number') {
      return { ...DEFAULT_STATE, corrupt: true }
    }
    const merged = { ...DEFAULT_STATE, ...parsed, corrupt: false }
    // migrate pre-game-shop saves: single coinrush high score -> per-game map
    if (typeof parsed.arcadeHighScore === 'number' && parsed.arcadeHighScore > 0 && !parsed.arcadeHighScores) {
      merged.arcadeHighScores = { coinrush: parsed.arcadeHighScore }
    }
    delete merged.arcadeHighScore
    if (!merged.ownedGames.includes('coinrush')) merged.ownedGames = ['coinrush', ...merged.ownedGames]
    return merged
  } catch {
    return { ...DEFAULT_STATE, corrupt: true }
  }
}

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial)

  useEffect(() => {
    try {
      const { corrupt, ...toSave } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // storage full/unavailable — app keeps working in-memory
    }
  }, [state])

  const playedToday = (eventId) => state.dailyPlays[eventId] === businessDate()
  const lessonReadToday = (eventId) => state.lessonsRead[eventId] === businessDate()

  return (
    <PlayerContext.Provider value={{ state, dispatch, playedToday, lessonReadToday, config }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
