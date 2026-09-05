import { useEffect, useRef, useState } from 'react'
import { Grid2x2, RotateCcw, Undo2, PartyPopper } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

// 2048 — swipe the whole board, equal numbers fuse into their double.
const SIZE = 4
const WIN_TILE = 2048
const SLIDE_MS = 110 // slide duration; merges resolve the moment it ends
const SWIPE_PX = 26 // finger travel that counts as a swipe (forgiving for small hands)

// Tile geometry in % of the board's inner track, so the board scales with the
// screen and the empty slots underneath line up exactly with the tiles.
const GAP = 2.4
const CELL = (100 - GAP * (SIZE - 1)) / SIZE

const FALLBACK_CONFETTI = ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399', '#a78bfa']

// Colour ramp: cool and pale at the bottom, hot and saturated as the numbers
// climb, so he can read his progress at a glance without reading the digits.
const SKIN = {
  2: 'from-sky-200 to-sky-300 border-sky-500 text-sky-900',
  4: 'from-teal-200 to-teal-400 border-teal-600 text-teal-950',
  8: 'from-lime-300 to-lime-500 border-lime-700 text-lime-950',
  16: 'from-amber-300 to-amber-500 border-amber-700 text-amber-950',
  32: 'from-orange-400 to-orange-600 border-orange-800 text-white',
  64: 'from-rose-400 to-rose-600 border-rose-800 text-white',
  128: 'from-red-500 to-red-700 border-red-900 text-white',
  256: 'from-fuchsia-400 to-fuchsia-600 border-fuchsia-800 text-white',
  512: 'from-violet-500 to-violet-700 border-violet-900 text-white',
  1024: 'from-cyan-400 to-cyan-600 border-cyan-800 text-white',
  2048: 'from-yellow-300 to-amber-500 border-yellow-700 text-yellow-950',
}
const SKIN_HUGE = 'from-emerald-300 to-emerald-500 border-emerald-700 text-emerald-950'
const skinFor = (v) => SKIN[v] ?? SKIN_HUGE
const digitsFor = (v) => (v < 100 ? 'text-5xl' : v < 1000 ? 'text-4xl' : 'text-3xl tracking-tight')

// Classic merge score plus an efficiency kicker paid only on a real 2048:
// fewer moves and less dithering is worth more. Never negative.
const speedBonus = (moves, secs) => Math.max(0, 3000 - moves * 4 - secs * 3)

const cellsOf = (tiles) => {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
  for (const t of tiles) grid[t.r][t.c] = t
  return grid
}

function freeCells(tiles) {
  const grid = cellsOf(tiles)
  const out = []
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) out.push({ r, c })
  return out
}

function spawn(tiles, idRef) {
  const spots = freeCells(tiles)
  if (!spots.length) return null
  const spot = spots[Math.floor(Math.random() * spots.length)]
  // 4s are rare — a board full of 2s is far kinder to an 8-year-old
  return { id: ++idRef.current, r: spot.r, c: spot.c, val: Math.random() < 0.9 ? 2 : 4, born: true, bump: false }
}

// Dead only when the board is full AND no orthogonal pair matches.
function canMove(tiles) {
  if (tiles.length < SIZE * SIZE) return true
  const grid = cellsOf(tiles)
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c].val
      if (c + 1 < SIZE && grid[r][c + 1].val === v) return true
      if (r + 1 < SIZE && grid[r + 1][c].val === v) return true
    }
  }
  return false
}

/**
 * Plan one swipe. Returns two boards on purpose:
 *   next  — every tile at its landing cell, a merged pair still stacked and
 *           still showing its old number (this is the frame that animates)
 *   after — the same board once the pair has fused into one doubled tile
 * Tile ids survive both, so React keeps the DOM node and CSS slides it.
 */
function planMove(tiles, dir) {
  const grid = cellsOf(tiles)
  const horiz = dir === 'left' || dir === 'right'
  const forward = dir === 'left' || dir === 'up' // scan order starts at the wall we push into
  const next = []
  const after = []
  let gained = 0
  let moved = false

  for (let line = 0; line < SIZE; line++) {
    const seq = []
    for (let k = 0; k < SIZE; k++) {
      const idx = forward ? k : SIZE - 1 - k
      const t = horiz ? grid[line][idx] : grid[idx][line]
      if (t) seq.push(t)
    }
    let slot = 0
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i]
      const mate = seq[i + 1]
      const pos = forward ? slot : SIZE - 1 - slot
      const r = horiz ? line : pos
      const c = horiz ? pos : line
      if (t.r !== r || t.c !== c) moved = true
      if (mate && mate.val === t.val) {
        gained += t.val * 2
        moved = true
        next.push({ ...t, r, c, born: false, bump: false })
        next.push({ ...mate, r, c, born: false, bump: false, eaten: true })
        after.push({ ...t, r, c, val: t.val * 2, born: false, bump: true })
        i++ // the mate is spent — a tile can only merge once per swipe
      } else {
        next.push({ ...t, r, c, born: false, bump: false })
        after.push({ ...t, r, c, born: false, bump: false })
      }
      slot++
    }
  }
  return { next, after, gained, moved }
}

export default function Merge2048({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const emoji = theme?.emoji ?? '🎉'
  const confetti = theme?.confetti?.length ? theme.confetti : FALLBACK_CONFETTI

  const [tiles, setTiles] = useState([])
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [hint, setHint] = useState(true)
  const [canUndo, setCanUndo] = useState(false)
  const [nudge, setNudge] = useState(false) // shake when a swipe changes nothing
  const [winBanner, setWinBanner] = useState(false)
  const [over, setOver] = useState(null)

  // The board lives in a ref as well as in state: a swipe reads and writes it
  // synchronously, so two fingers in the same tick cannot both plan the same move.
  const gameRef = useRef({ tiles: [], score: 0, moves: 0, best: 0, reached: false, done: false, locked: false, undo: null })
  const idRef = useRef(0)
  const startRef = useRef(0) // clock starts on the first swipe, not on the deal
  const dragRef = useRef(null)
  const slideTimerRef = useRef(null)
  const nudgeTimerRef = useRef(null)
  const reportedRef = useRef(false)

  const deal = () => {
    clearTimeout(slideTimerRef.current)
    clearTimeout(nudgeTimerRef.current)
    idRef.current = 0
    const fresh = []
    for (let i = 0; i < 2; i++) {
      const t = spawn(fresh, idRef)
      if (t) fresh.push(t)
    }
    gameRef.current = {
      tiles: fresh,
      score: 0,
      moves: 0,
      best: fresh.reduce((m, t) => Math.max(m, t.val), 0),
      reached: false,
      done: false,
      locked: false,
      undo: null,
    }
    startRef.current = 0
    dragRef.current = null
    setTiles(fresh)
    setScore(0)
    setMoves(0)
    setElapsed(0)
    setHint(true)
    setCanUndo(false)
    setNudge(false)
    setWinBanner(false)
    sfx.pop()
  }

  useEffect(() => {
    deal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // count-up clock — this puzzle has no deadline, the seconds only shave the bonus
  useEffect(() => {
    const iv = setInterval(() => {
      if (!startRef.current || gameRef.current.done) return
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => clearInterval(iv)
  }, [])

  useEffect(
    () => () => {
      clearTimeout(slideTimerRef.current)
      clearTimeout(nudgeTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const endGame = (won) => {
    const g = gameRef.current
    if (g.done) return
    g.done = true
    g.locked = true
    const secs = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0
    const total = g.score + (won ? speedBonus(g.moves, secs) : 0)
    const isRecord = total > highScore
    if (isRecord) sfx.fanfare()
    else if (!won) sfx.buzz()
    setElapsed(secs)
    setOver({ score: total, isRecord, won })
  }

  const doMove = (dir) => {
    const g = gameRef.current
    if (g.locked || g.done) return
    const { next, after, gained, moved } = planMove(g.tiles, dir)

    if (!moved) {
      sfx.click()
      setNudge(true)
      clearTimeout(nudgeTimerRef.current)
      nudgeTimerRef.current = setTimeout(() => setNudge(false), 420)
      return
    }

    g.undo = {
      tiles: g.tiles.map((t) => ({ ...t, born: false, bump: false })),
      score: g.score,
      moves: g.moves,
      best: g.best,
    }
    setCanUndo(true)
    if (!startRef.current) startRef.current = Date.now()
    setHint(false)
    g.locked = true
    g.tiles = next
    setTiles(next)
    sfx.click()

    slideTimerRef.current = setTimeout(() => {
      if (gained > 0) {
        g.score += gained
        setScore(g.score)
        sfx.pop()
      }
      g.moves += 1
      setMoves(g.moves)

      const board = after
      const born = spawn(board, idRef)
      if (born) board.push(born)
      g.tiles = board
      setTiles(board)

      const top = board.reduce((m, t) => Math.max(m, t.val), 0)
      if (top > g.best) {
        g.best = top
        sfx.ding() // a number he has never made before
      }
      if (top >= WIN_TILE && !g.reached) {
        g.reached = true
        sfx.fanfare()
        setWinBanner(true)
        return // stays locked until he taps a button on the banner
      }
      g.locked = false
      if (!canMove(board)) endGame(g.reached)
    }, SLIDE_MS)
  }

  const undoMove = () => {
    const g = gameRef.current
    if (!g.undo || g.locked || g.done) return
    g.tiles = g.undo.tiles
    g.score = g.undo.score
    g.moves = g.undo.moves
    g.best = g.undo.best
    g.undo = null
    setTiles(g.tiles)
    setScore(g.score)
    setMoves(g.moves)
    setCanUndo(false)
    sfx.flip()
  }

  const keepPlaying = () => {
    setWinBanner(false)
    gameRef.current.locked = false
    sfx.click()
    if (!canMove(gameRef.current.tiles)) endGame(true)
  }

  const onDown = (e) => {
    e.preventDefault()
    // capture so a swipe that runs off the board still delivers its move events
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is a nicety, not a requirement */
    }
    dragRef.current = { x: e.clientX, y: e.clientY, fired: false }
  }

  // Fire mid-drag once the finger has travelled far enough — waiting for the
  // lift makes the board feel dead. One swipe = one move until the finger is up.
  const onDrag = (e) => {
    e.preventDefault()
    const d = dragRef.current
    if (!d || d.fired) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return
    d.fired = true
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  const onUp = (e) => {
    e.preventDefault()
    dragRef.current = null
  }

  const hud = { score, time: elapsed }

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div
        dir="rtl"
        className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-950 flex flex-col items-center justify-center gap-3 p-3 overflow-hidden"
      >
        <div className="flex items-center gap-2 text-white font-black text-lg">
          <span className="bg-white/15 rounded-2xl px-4 py-1.5 flex items-center gap-2">
            <Grid2x2 size={20} strokeWidth={3} className="text-yellow-300" />
            מהלכים: <span className="tabular-nums">{moves}</span>
          </span>
          <span className="bg-white/15 rounded-2xl px-4 py-1.5">
            הכי גדול: <span className="tabular-nums" dir="ltr">{gameRef.current.best || 2}</span>
          </span>
        </div>

        {/* board — LTR so the numbers sit in the order he knows from the real game */}
        <div
          dir="ltr"
          onPointerDown={onDown}
          onPointerMove={onDrag}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`relative aspect-square w-[min(88vw,54vh,440px)] rounded-3xl border-b-8 border-slate-950 bg-slate-900/80 p-2 touch-none select-none ${nudge ? 'anim-shake' : ''}`}
          style={{ touchAction: 'none', boxShadow: `0 0 0 4px ${accent}, 0 18px 40px rgba(0,0,0,0.45)` }}
        >
          <div className="absolute inset-2">
            {/* empty slots, same geometry as the tiles so nothing drifts */}
            {Array.from({ length: SIZE * SIZE }).map((_, i) => (
              <span
                key={i}
                className="absolute rounded-2xl bg-white/5"
                style={{
                  width: `${CELL}%`,
                  height: `${CELL}%`,
                  left: `${(i % SIZE) * (CELL + GAP)}%`,
                  top: `${Math.floor(i / SIZE) * (CELL + GAP)}%`,
                }}
              ></span>
            ))}

            {tiles.map((t) => (
              <div
                key={t.id}
                className="absolute transition-all duration-100 ease-out"
                style={{
                  width: `${CELL}%`,
                  height: `${CELL}%`,
                  left: `${t.c * (CELL + GAP)}%`,
                  top: `${t.r * (CELL + GAP)}%`,
                  zIndex: t.eaten ? 1 : 2,
                }}
              >
                <span
                  className={`w-full h-full rounded-2xl bg-gradient-to-b ${skinFor(t.val)} border-b-[6px]
                    flex items-center justify-center font-black italic tabular-nums leading-none drop-shadow-md
                    ${digitsFor(t.val)} ${t.born || t.bump ? 'anim-pop' : ''}`}
                >
                  {t.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {hint && (
          <p className="anim-fade-in text-center text-white font-black text-lg bg-black/40 rounded-2xl px-5 py-2 leading-snug">
            החלק לכל כיוון ⬆️⬇️⬅️➡️ ומספרים זהים יתחברו! הגע ל־2048
          </p>
        )}

        <div className="flex gap-3 w-[min(88vw,440px)]">
          <button
            onClick={undoMove}
            disabled={!canUndo}
            className={`flex-1 min-h-[52px] text-white text-xl font-black italic rounded-2xl border-b-8 transition-all flex items-center justify-center gap-2
              ${canUndo
                ? 'bg-sky-500 hover:bg-sky-400 border-sky-700 active:border-b-0 active:translate-y-2'
                : 'bg-white/10 border-black/30 opacity-50'}`}
          >
            <Undo2 size={22} strokeWidth={3} />
            אחורה
          </button>
          <button
            onClick={deal}
            className="flex-1 min-h-[52px] bg-emerald-500 hover:bg-emerald-400 text-white text-xl font-black italic rounded-2xl border-b-8 border-emerald-700 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw size={22} strokeWidth={3} />
            מחדש
          </button>
        </div>

        {winBanner && !over && (
          <>
            <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: 34 }).map((_, i) => (
                <span
                  key={i}
                  className="confetti-piece absolute rounded-sm"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    top: 0,
                    width: 10 + (i % 4) * 3,
                    height: 7 + (i % 3) * 3,
                    backgroundColor: confetti[i % confetti.length],
                    animationDelay: `${(i % 8) * 0.12}s`,
                    animationDuration: `${2.2 + (i % 5) * 0.3}s`,
                  }}
                ></span>
              ))}
            </div>
            <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center p-4">
              <div className="anim-pop bg-white rounded-3xl border-b-8 border-yellow-500 shadow-2xl px-6 py-6 flex flex-col items-center gap-4 max-w-sm w-full text-center">
                <PartyPopper size={44} className="text-yellow-500" />
                <p className="text-slate-800 font-black text-3xl leading-snug">
                  הגעת ל־2048! כל הכבוד טומי {emoji}
                </p>
                <p className="text-slate-500 font-black text-lg">
                  בונוס מהירות: <span className="tabular-nums text-emerald-600">+{speedBonus(moves, elapsed)}</span>
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={keepPlaying}
                    className="flex-1 min-h-[52px] bg-blue-500 hover:bg-blue-400 text-white text-xl font-black italic rounded-2xl border-b-8 border-blue-700 active:border-b-0 active:translate-y-2 transition-all"
                  >
                    להמשיך
                  </button>
                  <button
                    onClick={() => endGame(true)}
                    className="flex-1 min-h-[52px] bg-green-500 hover:bg-green-400 text-white text-xl font-black italic rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all"
                  >
                    סיימתי!
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ArcadeShell>
  )
}
