import { useEffect, useRef, useState } from 'react'
import { Hash, Lightbulb, Eraser, RotateCcw, PartyPopper } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import Avatar from '../avatar/Avatar.jsx'
import ArcadeShell from './ArcadeShell.jsx'

// Mini Sudoku — child sized boards: 4x4 with 2x2 boxes, or 6x6 with 2x3 boxes.
// No clock to beat and no way to lose: the puzzle ends when it is solved.
const LEVELS = {
  easy: { n: 4, boxRows: 2, boxCols: 2, holes: 8, base: 900 },
  hard: { n: 6, boxRows: 2, boxCols: 3, holes: 17, base: 1800 },
}

const FALLBACK_CONFETTI = ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399', '#a78bfa']
const WIN_DELAY = 1700 // let the confetti land before the shell modal covers the board
const SHAKE_MS = 450

// generated once at import — fixed jitter, no per-render churn
const CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 0.9,
  duration: 2 + Math.random() * 1.5,
  size: 9 + Math.random() * 8,
}))

const range = (k) => Array.from({ length: k }, (_, i) => i)

function shuffled(src) {
  const a = src.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/**
 * A complete, valid board. The seed pattern
 *   v(r,c) = (boxCols * (r % boxRows) + floor(r / boxRows) + c) % n
 * is already a legal sudoku; shuffling rows only inside their band, columns only
 * inside their stack, and relabelling the digits keeps it legal while making it
 * look nothing like the seed.
 */
function makeSolution(L) {
  const { n, boxRows, boxCols } = L
  const digits = shuffled(range(n).map((i) => i + 1))
  const rows = []
  for (const band of shuffled(range(n / boxRows))) {
    for (const r of shuffled(range(boxRows))) rows.push(band * boxRows + r)
  }
  const cols = []
  for (const stack of shuffled(range(n / boxCols))) {
    for (const c of shuffled(range(boxCols))) cols.push(stack * boxCols + c)
  }
  const grid = new Array(n * n)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const sr = rows[r]
      const sc = cols[c]
      grid[r * n + c] = digits[(boxCols * (sr % boxRows) + Math.floor(sr / boxRows) + sc) % n]
    }
  }
  return grid
}

/**
 * Backtracking solution counter, stopped as soon as `cap` solutions are found —
 * we only ever need to know "exactly one" vs "more than one". Always expands the
 * empty cell with the fewest candidates, which keeps these tiny boards instant.
 */
function countSolutions(start, L, cap = 2) {
  const { n, boxRows, boxCols } = L
  const g = start.slice()
  let found = 0

  const ok = (i, v) => {
    const r = Math.floor(i / n)
    const c = i % n
    for (let k = 0; k < n; k++) {
      if (g[r * n + k] === v) return false
      if (g[k * n + c] === v) return false
    }
    const r0 = r - (r % boxRows)
    const c0 = c - (c % boxCols)
    for (let dr = 0; dr < boxRows; dr++) {
      for (let dc = 0; dc < boxCols; dc++) {
        if (g[(r0 + dr) * n + c0 + dc] === v) return false
      }
    }
    return true
  }

  const step = () => {
    if (found >= cap) return
    let best = -1
    let bestCand = null
    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) continue
      const cand = []
      for (let v = 1; v <= n; v++) if (ok(i, v)) cand.push(v)
      if (cand.length === 0) return // dead end
      if (bestCand === null || cand.length < bestCand.length) {
        best = i
        bestCand = cand
      }
      if (cand.length === 1) break
    }
    if (best === -1) {
      found++ // no empty cells left
      return
    }
    for (const v of bestCand) {
      g[best] = v
      step()
      g[best] = 0
      if (found >= cap) return
    }
  }

  step()
  return found
}

// Dig holes one at a time; any removal that would leave two possible answers is
// put straight back, so the board he sees always has exactly one solution.
function makePuzzle(L) {
  const solution = makeSolution(L)
  const puzzle = solution.slice()
  let removed = 0
  for (const i of shuffled(range(L.n * L.n))) {
    if (removed >= L.holes) break
    const keep = puzzle[i]
    puzzle[i] = 0
    if (countSolutions(puzzle, L) === 1) removed++
    else puzzle[i] = keep
  }
  return { solution, puzzle }
}

// Rewards speed and clean play, but finishing always pays at least 50.
const scoreFor = (L, secs, hints, mistakes) =>
  Math.max(50, L.base - secs * 2 - hints * 70 - mistakes * 15)

const THICK = '#1e1b4b'
const THIN = 'rgba(30,27,75,0.3)'

export default function MiniSudoku({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const emoji = theme?.emoji ?? '🎉'
  const confetti = theme?.confetti?.length ? theme.confetti : FALLBACK_CONFETTI

  const [level, setLevel] = useState(null) // null => difficulty picker
  const [cells, setCells] = useState([]) // 0 = empty
  const [given, setGiven] = useState([]) // locked clues from the generator
  const [hinted, setHinted] = useState([]) // locked cells he paid a hint for
  const [solution, setSolution] = useState([])
  const [sel, setSel] = useState(null)
  const [stats, setStats] = useState({ hints: 0, mistakes: 0, placed: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [shake, setShake] = useState(-1)
  const [solved, setSolved] = useState(false)
  const [frozen, setFrozen] = useState(null) // score locked in at the moment he solves it
  const [over, setOver] = useState(null)

  const startRef = useRef(0) // clock starts on his first number, not on the deal
  const doneRef = useRef(false)
  const cellsRef = useRef([]) // two taps in one tick would both read a stale board
  const statsRef = useRef(stats)
  const timersRef = useRef(new Set())
  const reportedRef = useRef(false)

  // every timeout goes through here so unmount can kill the whole set
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t)
      fn()
    }, ms)
    timersRef.current.add(t)
  }

  // drop every pending timeout — without this the win timer from the solved
  // board fires the game-over modal on top of the fresh one
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current.clear()
  }

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  // elapsed-time ticker — counts up, there is no deadline
  useEffect(() => {
    if (!level || solved) return
    const iv = setInterval(() => {
      if (!startRef.current) return
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => clearInterval(iv)
  }, [level, solved])

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const L = level ? LEVELS[level] : null

  const deal = (key) => {
    clearTimers() // a new board mid-confetti must not inherit the old win timer
    const cfg = LEVELS[key]
    const { solution: sol, puzzle } = makePuzzle(cfg)
    doneRef.current = false
    reportedRef.current = false // the new board gets to report its own score
    startRef.current = 0
    cellsRef.current = puzzle
    statsRef.current = { hints: 0, mistakes: 0, placed: 0 }
    setLevel(key)
    setSolution(sol)
    setCells(puzzle)
    setGiven(puzzle.map((v) => v !== 0))
    setHinted(puzzle.map(() => false))
    setStats(statsRef.current)
    setSel(null)
    setElapsed(0)
    setShake(-1)
    setSolved(false)
    setFrozen(null)
    setOver(null)
    sfx.pop()
  }

  const backToPicker = () => {
    clearTimers()
    doneRef.current = false
    reportedRef.current = false
    startRef.current = 0
    cellsRef.current = []
    statsRef.current = { hints: 0, mistakes: 0, placed: 0 }
    setLevel(null)
    setCells([])
    setStats(statsRef.current)
    setElapsed(0)
    setShake(-1)
    setSolved(false)
    setFrozen(null)
    setSel(null)
    setOver(null)
    sfx.click()
  }

  const win = (secs) => {
    doneRef.current = true
    const s = statsRef.current
    const score = scoreFor(L, secs, s.hints, s.mistakes)
    const isRecord = score > highScore
    setElapsed(secs)
    setFrozen(score)
    setSolved(true)
    sfx.fanfare() // every solve is a fanfare moment, records included
    later(() => setOver({ score, isRecord, won: true }), WIN_DELAY)
  }

  // shared tail for "a number landed on the board" — hint and tap both use it.
  // `select` is false for the hint: parking the cursor on the cell the hint just
  // locked would make his very next digit tap buzz and shake.
  const commit = (next, i, select = true) => {
    cellsRef.current = next
    setCells(next)
    if (!startRef.current) startRef.current = Date.now()
    if (select) setSel(i)
    if (next.every((v, k) => v === solution[k])) {
      win(Math.floor((Date.now() - startRef.current) / 1000))
    }
  }

  const tapCell = (i) => {
    if (doneRef.current) return
    setSel(i)
    sfx.click()
  }

  const place = (v) => {
    if (doneRef.current || !L) return
    if (sel === null) {
      sfx.click() // no cell picked yet — still answer the tap so the pad never feels dead
      return
    }
    if (given[sel] || hinted[sel]) {
      sfx.buzz() // clues and paid hints stay put
      setShake(sel)
      later(() => setShake((s) => (s === sel ? -1 : s)), SHAKE_MS)
      return
    }
    const cur = cellsRef.current
    if (cur[sel] === v) return
    const next = cur.slice()
    next[sel] = v

    if (v === 0) {
      cellsRef.current = next
      setCells(next)
      sfx.flip()
      return
    }
    if (v === solution[sel]) {
      sfx.ding()
      statsRef.current = { ...statsRef.current, placed: statsRef.current.placed + 1 }
    } else {
      sfx.buzz()
      statsRef.current = { ...statsRef.current, mistakes: statsRef.current.mistakes + 1 }
      setShake(sel)
      later(() => setShake((s) => (s === sel ? -1 : s)), SHAKE_MS)
    }
    setStats(statsRef.current)
    commit(next, sel)
  }

  // fills one genuinely correct cell — costs points, so it is worth thinking first
  const askHint = () => {
    if (doneRef.current || !L) return
    const cur = cellsRef.current
    const spots = []
    for (let i = 0; i < cur.length; i++) {
      if (!given[i] && !hinted[i] && cur[i] !== solution[i]) spots.push(i)
    }
    if (!spots.length) return
    const i = spots[Math.floor(Math.random() * spots.length)]
    const next = cur.slice()
    next[i] = solution[i]
    setHinted((h) => h.map((was, k) => (k === i ? true : was)))
    statsRef.current = { ...statsRef.current, hints: statsRef.current.hints + 1 }
    setStats(statsRef.current)
    sfx.coin()
    // keep whatever cell he had picked, unless the hint just landed on it
    setSel((s) => (s === i ? null : s))
    commit(next, i, false)
  }

  const liveScore = L ? scoreFor(L, elapsed, stats.hints, stats.mistakes) : 0
  const hud = L ? { score: frozen ?? liveScore, time: elapsed } : { score: 0 }

  const n = L?.n ?? 0
  const selRow = sel === null ? -1 : Math.floor(sel / n)
  const selCol = sel === null ? -1 : sel % n
  const selVal = sel === null ? 0 : cells[sel]

  // how many of each digit are still missing — a finished digit dims on the pad
  const leftFor = (v) => {
    let c = 0
    for (let i = 0; i < cells.length; i++) if (cells[i] === v && cells[i] === solution[i]) c++
    return n - c
  }

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div
        dir="rtl"
        className="absolute inset-0 overflow-hidden bg-gradient-to-b from-indigo-700 via-indigo-900 to-indigo-950"
      >
        {!L ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <Hash size={56} strokeWidth={3} className="anim-pop text-yellow-300 drop-shadow" />
            <h2 className="text-4xl font-black italic text-white drop-shadow-md">סודוקו קטן</h2>
            <p className="max-w-xs text-lg font-bold leading-snug text-white/85">
              בכל שורה, בכל עמודה ובכל ריבוע — כל מספר פעם אחת בלבד!
            </p>
            <Avatar size={88} />
            <p className="text-xl font-black text-yellow-300">בוא נבחר לוח</p>
            <div className="flex w-full max-w-sm flex-col gap-3">
              {[
                { key: 'easy', title: 'קל', sub: '4 × 4', skin: 'bg-emerald-400 border-emerald-700 text-emerald-950' },
                { key: 'hard', title: 'קשה', sub: '6 × 6', skin: 'bg-yellow-400 border-yellow-700 text-yellow-950' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => deal(opt.key)}
                  className={`flex min-h-[76px] w-full items-center justify-center gap-4 rounded-3xl border-b-8 text-3xl font-black italic transition-all active:translate-y-2 active:border-b-0 ${opt.skin}`}
                >
                  <span
                    className="grid gap-0.5"
                    style={{ gridTemplateColumns: `repeat(${LEVELS[opt.key].n}, 1fr)` }}
                  >
                    {range(LEVELS[opt.key].n * LEVELS[opt.key].n).map((i) => (
                      <span key={i} className="h-2 w-2 rounded-[2px] bg-black/35" />
                    ))}
                  </span>
                  {opt.title}
                  <span className="text-2xl not-italic opacity-70">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
            {/* one strip: the how-to-play line first, the counters once he starts */}
            <div className="flex min-h-[38px] items-center justify-center gap-2 text-center">
              {stats.placed + stats.mistakes + stats.hints === 0 ? (
                <span className="anim-fade-in rounded-2xl bg-black/40 px-4 py-1.5 text-base font-black leading-snug text-white">
                  לחץ על משבצת ריקה ואז על מספר 👇
                </span>
              ) : (
                <>
                  <span className="rounded-2xl bg-white/10 px-4 py-1.5 text-base font-black text-white">
                    רמזים <span className="tabular-nums text-sky-300">{stats.hints}</span>
                  </span>
                  <span className="rounded-2xl bg-white/10 px-4 py-1.5 text-base font-black text-white">
                    טעויות <span className="tabular-nums text-rose-300">{stats.mistakes}</span>
                  </span>
                </>
              )}
            </div>

            {/* board — kept LTR so the digits sit the way he knows them */}
            <div
              dir="ltr"
              className="rounded-3xl border-b-8 border-indigo-950 bg-indigo-950/70 p-2 touch-none select-none"
              style={{
                touchAction: 'none',
                width: 'min(86vw, 44vh, 400px)',
                boxShadow: `0 0 0 4px ${accent}, 0 18px 40px rgba(0,0,0,0.45)`,
              }}
            >
              <div
                className="grid aspect-square overflow-hidden rounded-xl"
                style={{
                  gridTemplateColumns: `repeat(${n}, 1fr)`,
                  gridTemplateRows: `repeat(${n}, 1fr)`,
                }}
              >
                {cells.map((v, i) => {
                  const r = Math.floor(i / n)
                  const c = i % n
                  const isSel = i === sel
                  const sameBox =
                    sel !== null &&
                    Math.floor(r / L.boxRows) === Math.floor(selRow / L.boxRows) &&
                    Math.floor(c / L.boxCols) === Math.floor(selCol / L.boxCols)
                  const peer = sel !== null && (r === selRow || c === selCol || sameBox)
                  const twin = selVal !== 0 && v === selVal
                  const wrong = v !== 0 && v !== solution[i]

                  let bg = 'bg-white'
                  if (given[i]) bg = 'bg-indigo-100'
                  if (peer) bg = given[i] ? 'bg-indigo-200' : 'bg-amber-100'
                  if (twin) bg = 'bg-amber-200'
                  if (isSel) bg = 'bg-amber-300'
                  if (wrong) bg = 'bg-rose-400'

                  let ink = 'text-emerald-600'
                  if (given[i]) ink = 'text-indigo-950'
                  else if (hinted[i]) ink = 'text-sky-600'
                  if (wrong) ink = 'text-white'

                  return (
                    <button
                      key={i}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        tapCell(i)
                      }}
                      style={{
                        touchAction: 'none',
                        borderStyle: 'solid',
                        borderTopWidth: r % L.boxRows === 0 ? 3 : 1,
                        borderLeftWidth: c % L.boxCols === 0 ? 3 : 1,
                        borderRightWidth: c === n - 1 ? 3 : 0,
                        borderBottomWidth: r === n - 1 ? 3 : 0,
                        borderTopColor: r % L.boxRows === 0 ? THICK : THIN,
                        borderLeftColor: c % L.boxCols === 0 ? THICK : THIN,
                        borderRightColor: THICK,
                        borderBottomColor: THICK,
                      }}
                      className={`relative flex items-center justify-center font-black italic tabular-nums transition-colors
                        ${bg} ${ink}
                        ${n === 4 ? 'text-4xl' : 'text-2xl'}
                        ${isSel ? 'z-10 ring-4 ring-inset ring-yellow-500' : ''}
                        ${shake === i ? 'anim-shake' : ''}`}
                    >
                      {v !== 0 ? v : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* number pad, LTR so 1..n reads in order */}
            <div dir="ltr" className="flex w-[min(86vw,400px)] gap-1.5">
              {range(n).map((k) => {
                const v = k + 1
                const done = leftFor(v) === 0
                return (
                  <button
                    key={v}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      place(v)
                    }}
                    style={{ touchAction: 'none' }}
                    className={`min-h-[58px] flex-1 rounded-2xl border-b-8 text-3xl font-black italic tabular-nums transition-all active:translate-y-2 active:border-b-0
                      ${done
                        ? 'border-slate-600 bg-slate-400 text-slate-600'
                        : 'border-yellow-700 bg-yellow-400 text-yellow-950'}`}
                  >
                    {v}
                  </button>
                )
              })}
            </div>

            <div dir="rtl" className="flex w-[min(86vw,400px)] gap-1.5">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault()
                  place(0)
                }}
                style={{ touchAction: 'none' }}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-b-8 border-slate-700 bg-slate-500 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <Eraser size={20} strokeWidth={3} />
                מחק
              </button>
              <button
                type="button"
                onClick={askHint}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-b-8 border-sky-700 bg-sky-500 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <Lightbulb size={20} strokeWidth={3} />
                רמז
              </button>
              <button
                type="button"
                onClick={() => deal(level)}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-b-8 border-emerald-700 bg-emerald-500 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <RotateCcw size={20} strokeWidth={3} />
                לוח חדש
              </button>
              <button
                type="button"
                onClick={backToPicker}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-2xl border-b-8 border-purple-800 bg-purple-600 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <Hash size={20} strokeWidth={3} />
                רמה
              </button>
            </div>
          </div>
        )}

        {solved && !over && (
          <div className="pointer-events-none absolute inset-0 z-30">
            {CONFETTI.map((p) => (
              <span
                key={p.id}
                className="confetti-piece absolute rounded-sm"
                style={{
                  left: `${p.left}%`,
                  top: 0,
                  width: p.size,
                  height: p.size * 0.62,
                  backgroundColor: confetti[p.id % confetti.length],
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                }}
              />
            ))}
            <div dir="rtl" className="absolute inset-x-0 top-[26%] flex justify-center px-4">
              <div
                className="anim-pop flex items-center gap-3 rounded-3xl bg-white/95 px-7 py-4 text-3xl font-black italic text-slate-800 shadow-2xl"
                style={{ borderBottom: `8px solid ${accent}` }}
              >
                <PartyPopper size={30} className="text-yellow-500" />
                כל הכבוד טומי! {emoji}
              </div>
            </div>
          </div>
        )}
      </div>
    </ArcadeShell>
  )
}
