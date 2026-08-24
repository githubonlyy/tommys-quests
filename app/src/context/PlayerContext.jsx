import { createContext, useContext, useEffect, useReducer } from 'react'
import config from '../data/config.json'

const STORAGE_KEY = 'tommys-quests-v1'

const DEFAULT_STATE = {
  version: 1,
  coins: 0,
  xp: 0, // progress inside current level
  level: 1,
  pin: config.defaultPin,
  dailyPlays: {}, // eventId -> business date string of last PAID play
  battleLog: [], // newest first, capped at 100
  purchases: [], // newest first
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

function reducer(state, action) {
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
      return {
        ...state,
        coins: practice ? state.coins : state.coins + coinsEarned,
        xp,
        level,
        dailyPlays: practice ? state.dailyPlays : { ...state.dailyPlays, [eventId]: businessDate() },
        battleLog: [entry, ...state.battleLog].slice(0, 100),
      }
    }
    case 'BUY': {
      const { item } = action
      if (state.coins < item.cost) return state // funds re-checked at dispatch time
      const purchase = { id: Date.now() + '-' + item.id, ts: Date.now(), title: item.title, cost: item.cost }
      return { ...state, coins: state.coins - item.cost, purchases: [purchase, ...state.purchases] }
    }
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
    return { ...DEFAULT_STATE, ...parsed, corrupt: false }
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

  return (
    <PlayerContext.Provider value={{ state, dispatch, playedToday, config }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
