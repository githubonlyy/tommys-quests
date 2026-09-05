import { useEffect, useRef, useState } from 'react'
import { Grid3x3, RotateCcw, PartyPopper } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

// Slide Puzzle — classic sliding tiles. 0 is the gap, 1..n-1 are the numbers,
// solved order is [1, 2, ... n-1, 0].
const FALLBACK_CONFETTI = ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399', '#a78bfa']

// tile skin per HOME row, so a solved board shows clean colour bands
const ROW_SKIN = [
  'from-rose-400 to-rose-600 border-rose-800',
  'from-amber-400 to-amber-600 border-amber-700',
  'from-emerald-400 to-emerald-600 border-emerald-800',
  'from-sky-400 to-sky-600 border-sky-800',
]

const isSolved = (arr) => arr.every((v, i) => v === (i + 1) % arr.length)

// indices orthogonally adjacent to `idx` on a sz x sz board
function neighbours(idx, sz) {
  const r = Math.floor(idx / sz)
  const c = idx % sz
  const out = []
  if (r > 0) out.push(idx - sz)
  if (r < sz - 1) out.push(idx + sz)
  if (c > 0) out.push(idx - 1)
  if (c < sz - 1) out.push(idx + 1)
  return out
}

// Shuffle by walking the gap with legal moves only — a blind permutation would
// be unsolvable half the time. `prev` blocks instant back-steps so the walk
// actually travels instead of jittering in place.
function makeBoard(sz) {
  const n = sz * sz
  const walks = sz === 3 ? 80 : 240
  let arr
  let tries = 0
  do {
    arr = Array.from({ length: n }, (_, i) => (i + 1) % n)
    let gap = n - 1
    let prev = -1
    for (let i = 0; i < walks; i++) {
      const opts = neighbours(gap, sz).filter((p) => p !== prev)
      const pick = opts[Math.floor(Math.random() * opts.length)]
      arr[gap] = arr[pick]
      arr[pick] = 0
      prev = gap
      gap = pick
    }
    tries++
  } while (isSolved(arr) && tries < 6) // the walk can wander back home
  return arr
}

// Rewards speed and efficiency; the 4x4 board starts higher because it is
// worth many more moves. Never drops below 50 — finishing always pays.
const scoreFor = (sz, moves, secs) => Math.max(50, (sz === 3 ? 1000 : 1600) - moves * 5 - secs)

export default function SlidePuzzle({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const emoji = theme?.emoji ?? '🎉'
  const confetti = theme?.confetti?.length ? theme.confetti : FALLBACK_CONFETTI

  const [size, setSize] = useState(null) // null => size picker
  const [tiles, setTiles] = useState([])
  const [moves, setMoves] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [solved, setSolved] = useState(false)
  const [hint, setHint] = useState(true)
  const [over, setOver] = useState(null)

  const startRef = useRef(0) // clock starts on the first slide, not on shuffle
  const solvedRef = useRef(false)
  // mirrors of board + move count: two fingers landing in the same tick would
  // otherwise both read the pre-render state and compute the same slide twice
  const tilesRef = useRef([])
  const movesRef = useRef(0)
  const winTimerRef = useRef(null)
  const reportedRef = useRef(false)
  // the win payload waiting on the 1500 ms celebration timer, so a reset that
  // lands mid-celebration can still report it instead of dropping the score
  const pendingWinRef = useRef(null)

  // elapsed-time ticker (counts up — this puzzle has no deadline)
  useEffect(() => {
    if (!size || solved) return
    const iv = setInterval(() => {
      if (!startRef.current) return
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => clearInterval(iv)
  }, [size, solved])

  useEffect(() => () => clearTimeout(winTimerRef.current), [])

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  // A solve is only reported once `over` is set, and only the celebration timer
  // sets it. Any reset that fires during those 1500 ms must land the win first —
  // cancelling the timer would throw away the score we already told him he won.
  const flushPendingWin = () => {
    const pending = pendingWinRef.current
    if (!pending) return false
    pendingWinRef.current = null
    clearTimeout(winTimerRef.current)
    setOver(pending)
    return true
  }

  const deal = (sz) => {
    if (flushPendingWin()) return
    clearTimeout(winTimerRef.current)
    solvedRef.current = false
    startRef.current = 0
    movesRef.current = 0
    tilesRef.current = makeBoard(sz)
    setSize(sz)
    setTiles(tilesRef.current)
    setMoves(0)
    setElapsed(0)
    setSolved(false)
    setHint(true)
    sfx.pop()
  }

  const backToPicker = () => {
    if (flushPendingWin()) return
    clearTimeout(winTimerRef.current)
    solvedRef.current = false
    startRef.current = 0
    movesRef.current = 0
    tilesRef.current = []
    setSize(null)
    setTiles([])
    setMoves(0)
    setElapsed(0)
    setSolved(false)
    sfx.click()
  }

  const tap = (idx) => {
    const sz = size
    const cur = tilesRef.current
    if (!sz || solvedRef.current || cur.length === 0) return
    const gap = cur.indexOf(0)
    if (idx === gap) return
    const gr = Math.floor(gap / sz)
    const gc = gap % sz
    const r = Math.floor(idx / sz)
    const c = idx % sz
    if (r !== gr && c !== gc) {
      sfx.click() // not in the gap's row or column — nothing can slide
      return
    }

    // Whole-run push: every tile between the tap and the gap shifts one step
    // toward the gap, so a kid can clear a row with one tap.
    const next = cur.slice()
    if (r === gr) {
      const step = c > gc ? 1 : -1
      for (let cc = gc; cc !== c; cc += step) next[gr * sz + cc] = next[gr * sz + cc + step]
    } else {
      const step = r > gr ? 1 : -1
      for (let rr = gr; rr !== r; rr += step) next[rr * sz + gc] = next[(rr + step) * sz + gc]
    }
    next[idx] = 0

    if (!startRef.current) startRef.current = Date.now()
    setHint(false)
    tilesRef.current = next
    setTiles(next)
    const mv = ++movesRef.current
    setMoves(mv)
    sfx.flip()

    if (isSolved(next)) {
      const secs = Math.floor((Date.now() - startRef.current) / 1000)
      const score = scoreFor(sz, mv, secs)
      solvedRef.current = true
      setElapsed(secs)
      setSolved(true)
      sfx.fanfare() // every solve is a win, records included
      const isRecord = score > highScore
      // let the confetti breathe before the shell modal covers the board
      const win = { score, isRecord, won: true }
      pendingWinRef.current = win
      winTimerRef.current = setTimeout(() => {
        pendingWinRef.current = null
        setOver(win)
      }, 1500)
    }
  }

  const hud = size ? { score: scoreFor(size, moves, elapsed), time: elapsed } : { score: 0 }
  const cell = size ? 100 / size : 0

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div
        dir="rtl"
        className="absolute inset-0 bg-gradient-to-b from-indigo-800 to-indigo-950 flex flex-col items-center justify-center gap-3 p-3 overflow-hidden"
      >
        {!size && (
          <div className="anim-pop w-full max-w-sm flex flex-col items-center gap-4">
            <Grid3x3 size={64} strokeWidth={2.5} className="text-yellow-300 drop-shadow" />
            <h2 className="text-white text-3xl font-black italic drop-shadow">פאזל הזזה</h2>
            <p className="text-indigo-200 text-lg font-bold text-center leading-snug">
              בחר לוח והחזר את המספרים לסדר!
            </p>
            {[3, 4].map((sz) => (
              <button
                key={sz}
                onClick={() => deal(sz)}
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-yellow-950 text-3xl font-black italic py-5 rounded-3xl border-b-8 border-yellow-700 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-4"
              >
                <span className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${sz}, 1fr)` }}>
                  {Array.from({ length: sz * sz }).map((_, i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-[2px] bg-yellow-900/70"></span>
                  ))}
                </span>
                {sz} × {sz}
              </button>
            ))}
          </div>
        )}

        {size && (
          <>
            <div className="flex items-center gap-2 text-white font-black text-lg">
              <span className="bg-white/15 rounded-2xl px-4 py-1.5">
                מהלכים: <span className="tabular-nums">{moves}</span>
              </span>
            </div>

            {/* board — kept LTR so 1..n reads in the order he knows from the real toy */}
            <div
              dir="ltr"
              className="relative aspect-square w-[min(88vw,56vh,440px)] rounded-3xl border-b-8 border-indigo-950 bg-indigo-950/70 p-2 touch-none"
              style={{ touchAction: 'none', boxShadow: `0 0 0 4px ${accent}, 0 18px 40px rgba(0,0,0,0.45)` }}
            >
              {tiles.map((v, i) => {
                if (v === 0) return null
                const home = v === i + 1
                const skin = ROW_SKIN[Math.floor((v - 1) / size) % ROW_SKIN.length]
                return (
                  <button
                    key={v}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      tap(i)
                    }}
                    className="absolute p-1 transition-all duration-150 ease-out"
                    style={{
                      width: `${cell}%`,
                      height: `${cell}%`,
                      left: `${(i % size) * cell}%`,
                      top: `${Math.floor(i / size) * cell}%`,
                    }}
                  >
                    <span
                      className={`w-full h-full rounded-2xl bg-gradient-to-b ${skin} border-b-[6px] flex items-center justify-center font-black italic text-white tabular-nums drop-shadow-md select-none
                        ${size === 3 ? 'text-5xl' : 'text-4xl'}
                        ${home ? 'ring-4 ring-white/70' : ''}`}
                    >
                      {v}
                    </span>
                  </button>
                )
              })}
            </div>

            {hint && !solved && (
              <p className="anim-fade-in text-center text-white font-black text-lg bg-black/40 rounded-2xl px-5 py-2 leading-snug">
                לחץ על משבצת ליד החור והיא תחליק ⬅️
              </p>
            )}

            <div className="flex gap-3 w-[min(88vw,440px)]">
              <button
                onClick={() => deal(size)}
                disabled={solved}
                className="flex-1 min-h-[52px] bg-emerald-500 hover:bg-emerald-400 text-white text-xl font-black italic rounded-2xl border-b-8 border-emerald-700 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                <RotateCcw size={22} strokeWidth={3} />
                ערבב מחדש
              </button>
              <button
                onClick={backToPicker}
                disabled={solved}
                className="min-h-[52px] px-5 bg-white/15 hover:bg-white/25 text-white text-xl font-black italic rounded-2xl border-b-8 border-black/30 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Grid3x3 size={22} strokeWidth={3} />
                גודל
              </button>
            </div>
          </>
        )}

        {solved && !over && (
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
            <div className="absolute inset-x-0 top-1/3 flex justify-center pointer-events-none px-4">
              <div className="anim-pop bg-white/95 text-slate-800 font-black text-3xl rounded-3xl border-b-8 border-yellow-500 shadow-2xl px-7 py-4 flex items-center gap-3">
                <PartyPopper size={32} className="text-yellow-500" />
                כל הכבוד טומי! {emoji}
              </div>
            </div>
          </>
        )}
      </div>
    </ArcadeShell>
  )
}
