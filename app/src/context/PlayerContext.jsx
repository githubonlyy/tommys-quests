import { createContext, useContext, useEffect, useReducer } from 'react'
import config from '../data/config.json'
import { evaluateTrophies } from '../data/trophies.js'
import wardrobe from '../data/wardrobe.json'
import { THEME_IDS, DEFAULT_THEME } from '../data/themes.js'
import { EVENTS } from '../data/events.js'

const STORAGE_KEY = 'tommys-quests-v1'

// Avatar slots. Required slots always have something equipped; optional ones
// may be null (nothing on his head, no jetpack, no pet).
export const AVATAR_SLOTS = ['skin', 'hair', 'outfit', 'shoes', 'head', 'hand', 'back', 'pet']
export const REQUIRED_SLOTS = ['skin', 'hair', 'outfit', 'shoes']

// Each world dresses its own doll: free items tagged for that world win over
// generic free items, so the three starter dolls already look different.
export function defaultEquipped(themeId, items = wardrobe) {
  const free = items.filter((i) => i.price === 0)
  const equipped = {}
  for (const slot of AVATAR_SLOTS) {
    // optional slots stay empty unless this world (or 'all') offers a free item —
    // otherwise the space jetpack would end up on the racing driver's back
    equipped[slot] =
      free.find((i) => i.slot === slot && i.theme === themeId)?.id ??
      free.find((i) => i.slot === slot && i.theme === 'all')?.id ??
      (REQUIRED_SLOTS.includes(slot) ? (free.find((i) => i.slot === slot)?.id ?? null) : null)
  }
  return equipped
}

// exported for tests: wardrobe items are shared (bought once), outfits are per world
export function defaultAvatar(items = wardrobe) {
  const equippedByTheme = {}
  for (const id of THEME_IDS) equippedByTheme[id] = defaultEquipped(id, items)
  return { owned: items.filter((i) => i.price === 0).map((i) => i.id), equippedByTheme }
}

export const getEquipped = (state, themeId) =>
  state.avatar.equippedByTheme[themeId] ?? state.avatar.equippedByTheme[DEFAULT_THEME]

// exported for tests


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
  name: 'טומי',
  avatar: defaultAvatar(), // { owned: [itemId], equippedByTheme: { themeId: { slot: itemId|null } } }
  playTime: { date: null, usedMs: 0, bonusMs: 0 }, // fun-tab budget for the current game day
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

function withEquip(avatar, themeId, slot, itemId) {
  const id = THEME_IDS.includes(themeId) ? themeId : DEFAULT_THEME
  return {
    ...avatar,
    equippedByTheme: {
      ...avatar.equippedByTheme,
      [id]: { ...avatar.equippedByTheme[id], [slot]: itemId },
    },
  }
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
    case 'WARDROBE_BUY': {
      const { item, themeId = DEFAULT_THEME } = action // item = { id, slot, name, price }
      if (state.avatar.owned.includes(item.id) || state.coins < item.price) return state
      const purchase = { id: Date.now() + '-' + item.id, ts: Date.now(), title: `👕 ${item.name}`, cost: item.price, kind: 'wardrobe' }
      const next = {
        ...state,
        coins: state.coins - item.price,
        purchases: [purchase, ...state.purchases],
        // wear it right away in the world she bought it in
        avatar: withEquip({ ...state.avatar, owned: [...state.avatar.owned, item.id] }, themeId, item.slot, item.id),
      }
      return { ...next, trophies: evaluateTrophies(next) }
    }
    case 'AVATAR_EQUIP': {
      const { themeId = DEFAULT_THEME, slot, itemId } = action // itemId null = take it off (optional slots only)
      if (!AVATAR_SLOTS.includes(slot)) return state
      if (itemId === null && REQUIRED_SLOTS.includes(slot)) return state
      if (itemId !== null && !state.avatar.owned.includes(itemId)) return state
      if (getEquipped(state, themeId)[slot] === itemId) return state
      return { ...state, avatar: withEquip(state.avatar, themeId, slot, itemId) }
    }
    case 'PLAY_TIME_SPEND': {
      const today = businessDate()
      const day = state.playTime.date === today ? state.playTime : { date: today, usedMs: 0, bonusMs: 0 }
      return { ...state, playTime: { ...day, date: today, usedMs: day.usedMs + Math.max(0, action.ms) } }
    }
    // parent override from the coach screen: extra minutes on top of what he earned
    case 'PLAY_TIME_GRANT': {
      const today = businessDate()
      const day = state.playTime.date === today ? state.playTime : { date: today, usedMs: 0, bonusMs: 0 }
      return { ...state, playTime: { ...day, date: today, bonusMs: Math.max(0, (day.bonusMs ?? 0) + action.ms) } }
    }
    // parent override: end play now by spending whatever is left
    case 'PLAY_TIME_END': {
      const today = businessDate()
      const day = state.playTime.date === today ? state.playTime : { date: today, usedMs: 0, bonusMs: 0 }
      return { ...state, playTime: { ...day, date: today, usedMs: day.usedMs + Math.max(0, action.msLeft) } }
    }
    case 'SET_NAME':
      return { ...state, name: action.name }
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

// Items can be renamed/removed in wardrobe.json between releases, and saves
// from before per-world outfits hold a single `equipped` map. Make every world
// valid: equipped ids exist, sit in the right slot, are owned; required slots
// are never empty.
export function repairAvatar(avatar, items = wardrobe) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const fresh = defaultAvatar(items)
  const owned = [...new Set([...fresh.owned, ...(avatar?.owned ?? []).filter((id) => byId.has(id))])]
  const legacy = avatar?.equipped // pre-per-world shape
  const equippedByTheme = {}
  for (const themeId of THEME_IDS) {
    const src = avatar?.equippedByTheme?.[themeId] ?? legacy
    const out = {}
    for (const slot of AVATAR_SLOTS) {
      const cur = src?.[slot]
      const valid = cur && byId.get(cur)?.slot === slot && owned.includes(cur)
      out[slot] = valid ? cur : REQUIRED_SLOTS.includes(slot) ? fresh.equippedByTheme[themeId][slot] : null
    }
    equippedByTheme[themeId] = out
  }
  return { owned, equippedByTheme }
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
    // saves made before the app spoke Hebrew hold the Latin default; only the
    // untouched default is migrated, never a name he chose himself
    if (merged.name === 'TOMMY') merged.name = DEFAULT_STATE.name
    // wardrobe.json changes between releases, and old saves predate per-world outfits
    merged.avatar = repairAvatar(parsed.avatar)
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

/**
 * Play-time budget for the fun tab. Every `matchesPerSession` subjects played
 * today grants one session, capped per day; time already spent is subtracted.
 * Pure so the rules can be tested without React.
 */
/** Distinct subject categories he has played today — the daily goal counts these. */
export function categoriesPlayedToday(state, today = businessDate()) {
  const cats = new Set()
  for (const [eventId, date] of Object.entries(state.dailyPlays)) {
    if (date !== today) continue
    const ev = EVENTS.find((e) => e.id === eventId)
    if (ev?.category) cats.add(ev.category)
  }
  return cats.size
}

export function computePlayClock(state, cfg = config, today = businessDate()) {
  const { minutesPerSession, matchesPerSession, maxSessionsPerDay } = cfg.playTime
  // play time is earned by VOLUME (any matches); the chest is what demands
  // breadth across categories — tying both to categories would make the third
  // session unreachable, since there are fewer categories than it needs
  const doneToday = Object.values(state.dailyPlays).filter((d) => d === today).length
  const earnedSessions = Math.min(maxSessionsPerDay, Math.floor(doneToday / matchesPerSession))
  const sameDay = state.playTime?.date === today
  const bonusMs = sameDay ? (state.playTime.bonusMs ?? 0) : 0
  const earnedMs = earnedSessions * minutesPerSession * 60000 + bonusMs
  const usedMs = sameDay ? state.playTime.usedMs : 0
  const nextAt = Math.min(maxSessionsPerDay * matchesPerSession, (earnedSessions + 1) * matchesPerSession)
  return {
    earnedSessions,
    maxSessions: maxSessionsPerDay,
    bonusMs,
    usedMs,
    msLeft: Math.max(0, earnedMs - usedMs),
    doneToday,
    // how many more subjects until the next session unlocks (0 when capped out)
    matchesToNext: earnedSessions >= maxSessionsPerDay ? 0 : nextAt - doneToday,
    cappedOut: earnedSessions >= maxSessionsPerDay && bonusMs === 0 && earnedMs - usedMs <= 0,
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

  const playClock = computePlayClock(state)
  const lessonReadToday = (eventId) => state.lessonsRead[eventId] === businessDate()

  return (
    <PlayerContext.Provider value={{ state, dispatch, playedToday, lessonReadToday, playClock, config }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
