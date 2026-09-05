import { useEffect, useRef, useState } from 'react'
import { RotateCcw, TowerControl } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import Avatar from '../avatar/Avatar.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const SIZES = [3, 4, 5]
const WIN_DELAY = 1600 // let him admire the finished tower before the modal lands
const SHAKE_MS = 420

// disc skins indexed by size-1 (1 = the little top disc)
const DISC_SKIN = [
  'from-fuchsia-400 to-fuchsia-600 border-fuchsia-800',
  'from-sky-400 to-sky-600 border-sky-800',
  'from-lime-400 to-lime-600 border-lime-700',
  'from-amber-400 to-amber-600 border-amber-700',
  'from-rose-400 to-rose-600 border-rose-800',
]

// generated once at import — fixed jitter, no per-render churn
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 0.9,
  duration: 2 + Math.random() * 1.6,
  size: 9 + Math.random() * 9,
}))

const optimalFor = (n) => (1 << n) - 1 // 2^n - 1

// The board score holds steady while he stays at or under the optimal move
// count, then decays with optimal/moves — sloppy solutions simply pay less,
// there is no way to "lose".
const boardScore = (n, moves) => {
  const opt = optimalFor(n)
  return Math.round(opt * 60 * Math.min(1, opt / Math.max(1, moves)))
}

// widest disc ~92% of the column, narrowest ~40%
const discWidth = (size, n) => `${28 + (size / n) * 64}%`

// legal landing: empty peg, or a ring bigger than the one in hand. Pure, so the
// tap handler can ask it about the ref-mirrored board and the render about state.
const canDropOn = (board, held, i) => {
  if (!held || i === held.from) return false
  const top = board[i][board[i].length - 1]
  return top === undefined || top > held.size
}

// Tower of Hanoi — lift the top ring off a peg, drop it on another, never a big
// ring on a small one. Finishing the tower on a different peg is the win.
export default function Hanoi({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const [discs, setDiscs] = useState(0) // 0 = still on the size picker
  const [pegs, setPegs] = useState([[], [], []]) // index 0 of each peg is the bottom ring
  const [lifted, setLifted] = useState(null) // { size, from }
  const [moves, setMoves] = useState(0)
  const [shake, setShake] = useState(-1) // peg index refusing a drop
  const [result, setResult] = useState(null) // { score, isRecord } the instant he solves it
  const [over, setOver] = useState(null)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const timersRef = useRef(new Set())
  const reportedRef = useRef(false)
  // ref mirrors of the board, the ring in hand and the move count: two fingers
  // landing in the same tick would otherwise both read the pre-render state and
  // both lift the same ring, which loses a ring and makes the tower unsolvable
  const pegsRef = useRef([[], [], []])
  const liftedRef = useRef(null)
  const movesRef = useRef(0)

  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const confetti = theme?.confetti ?? ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399']

  // every timeout goes through here so unmount can kill the whole set
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t)
      fn()
    }, ms)
    timersRef.current.add(t)
  }

  // drop every pending timeout — without this the win timer from the finished
  // round fires the game-over modal on top of the fresh board
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

  const begin = (n) => {
    clearTimers() // a restart mid-fanfare must not inherit the old win timer
    sfx.click()
    const board = [Array.from({ length: n }, (_, i) => n - i), [], []]
    doneRef.current = false
    reportedRef.current = false // the new round gets to report its own score
    startRef.current = Date.now()
    pegsRef.current = board
    liftedRef.current = null
    movesRef.current = 0
    setDiscs(n)
    setPegs(board)
    setLifted(null)
    setMoves(0)
    setShake(-1)
    setResult(null)
    setOver(null)
  }

  const backToPicker = () => {
    clearTimers()
    sfx.click()
    doneRef.current = false
    reportedRef.current = false
    pegsRef.current = [[], [], []]
    liftedRef.current = null
    movesRef.current = 0
    setDiscs(0)
    setPegs([[], [], []])
    setLifted(null)
    setMoves(0)
    setShake(-1)
    setResult(null)
    setOver(null)
  }

  const bump = (i) => {
    setShake(i)
    later(() => setShake((s) => (s === i ? -1 : s)), SHAKE_MS)
  }

  const win = (count) => {
    doneRef.current = true
    const secs = (Date.now() - startRef.current) / 1000
    const speed = Math.max(0, 240 - Math.round(secs) * 2) // pure bonus, never negative
    const score = boardScore(discs, count) + speed
    const isRecord = score > highScore
    // a solved tower is always a fanfare moment — that also covers the record cheer
    sfx.fanfare()
    setResult({ score, isRecord })
    later(() => setOver({ score, isRecord, won: true }), WIN_DELAY)
  }

  // every tap reads and writes the refs first, so a second finger in the same
  // tick sees the ring that the first one already picked up
  const tapPeg = (i) => {
    if (doneRef.current) return
    const board = pegsRef.current
    const held = liftedRef.current
    const peg = board[i]

    if (!held) {
      if (!peg.length) {
        sfx.buzz()
        bump(i)
        return
      }
      const size = peg[peg.length - 1]
      const next = board.map((col, k) => (k === i ? col.slice(0, -1) : col))
      pegsRef.current = next
      liftedRef.current = { size, from: i }
      setPegs(next)
      setLifted(liftedRef.current)
      sfx.flip()
      return
    }

    if (i === held.from) {
      // tapping the source peg again puts the ring back — costs no move
      const next = board.map((col, k) => (k === i ? [...col, held.size] : col))
      pegsRef.current = next
      liftedRef.current = null
      setPegs(next)
      setLifted(null)
      sfx.click()
      return
    }

    if (!canDropOn(board, held, i)) {
      sfx.buzz()
      bump(i)
      return
    }

    const next = board.map((col, k) => (k === i ? [...col, held.size] : col))
    pegsRef.current = next
    liftedRef.current = null
    setPegs(next)
    setLifted(null)
    const count = movesRef.current + 1
    movesRef.current = count
    setMoves(count)
    sfx.pop()
    // the tower only counts as solved on a peg other than the starting one
    if (next[1].length === discs || next[2].length === discs) win(count)
  }

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const optimal = discs ? optimalFor(discs) : 0
  const hud = { score: result ? result.score : discs ? boardScore(discs, moves) : 0 }
  const discH = discs >= 5 ? 40 : discs === 4 ? 46 : 52

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-indigo-700 via-indigo-900 to-indigo-950">
        {discs === 0 ? (
          <div dir="rtl" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center">
            <TowerControl size={58} strokeWidth={2.5} className="text-yellow-300 drop-shadow" />
            <h2 className="text-4xl font-black italic text-white drop-shadow-md">מגדל האנוי</h2>
            <p className="max-w-xs text-lg font-bold leading-snug text-white/85">
              העבר את כל המגדל לעמוד אחר. אסור להניח טבעת גדולה על טבעת קטנה!
            </p>
            <Avatar size={96} />
            <p className="text-xl font-black text-yellow-300">כמה טבעות?</p>
            <div className="flex gap-3">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => begin(n)}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl border-b-8 border-amber-700 bg-yellow-400 font-black italic text-indigo-950 transition-all active:translate-y-2 active:border-b-0"
                >
                  <span className="text-4xl leading-none">{n}</span>
                  <span className="mt-1 text-xs not-italic opacity-70">{optimalFor(n)} מהלכים</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            {/* move counter vs. the perfect solution — the number he chases */}
            <div dir="rtl" className="flex flex-wrap items-center justify-center gap-2 px-3 pt-3">
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-lg font-black text-white">
                <span>מהלכים</span>
                <span className="tabular-nums text-yellow-300">{moves}</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-lg font-black text-white">
                <span>מושלם</span>
                <span className="tabular-nums text-green-300">{optimal}</span>
              </div>
            </div>

            {moves === 0 && !lifted && (
              <div dir="rtl" className="anim-fade-in px-4 pt-2 text-center text-base font-black leading-snug text-white/80">
                לחץ על עמוד כדי להרים טבעת, ואז על עמוד אחר כדי להניח אותה
              </div>
            )}

            <div className="flex flex-1 items-stretch gap-1 px-2 pb-1 md:gap-3 md:px-5">
              {pegs.map((peg, i) => {
                const target = canDropOn(pegs, lifted, i)
                return (
                  <button
                    key={i}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      tapPeg(i)
                    }}
                    style={{ touchAction: 'none' }}
                    className={`relative flex flex-1 select-none flex-col items-center justify-end rounded-3xl pb-4 outline-none transition-colors
                      ${target ? 'bg-white/10 ring-4 ring-white/50' : ''}
                      ${shake === i ? 'anim-shake' : ''}`}
                  >
                    {/* peg pole + base plate, behind the rings */}
                    <span
                      className="absolute bottom-4 z-0 w-4 rounded-t-full bg-gradient-to-b from-amber-600 to-amber-800"
                      style={{ height: (discs + 1) * discH }}
                    />
                    <span className="absolute inset-x-1 bottom-0 z-0 h-4 rounded-xl border-b-4 border-amber-950 bg-amber-800" />

                    {/* the ring in hand floats above its own peg */}
                    {lifted && lifted.from === i && (
                      <span className="pointer-events-none absolute inset-x-0 top-1 z-20 flex justify-center">
                        <span
                          className={`anim-float-bob flex items-center justify-center rounded-2xl border-b-4 bg-gradient-to-b shadow-2xl ring-4 ring-white text-xl font-black italic text-white ${DISC_SKIN[lifted.size - 1]}`}
                          style={{ width: discWidth(lifted.size, discs), height: discH }}
                        >
                          {lifted.size}
                        </span>
                      </span>
                    )}

                    {/* rings drawn top-of-stack first so the widest one sits on the base */}
                    {[...peg].reverse().map((size, idx) => (
                      <span
                        key={size}
                        className={`relative z-10 flex items-center justify-center rounded-2xl border-b-4 bg-gradient-to-b text-xl font-black italic text-white shadow-lg ${DISC_SKIN[size - 1]}
                          ${!lifted && idx === 0 ? 'ring-4 ring-white/60' : ''}`}
                        style={{ width: discWidth(size, discs), height: discH }}
                      >
                        {size}
                      </span>
                    ))}
                  </button>
                )
              })}
            </div>

            <div dir="rtl" className="flex items-center justify-center gap-3 p-3">
              <button
                type="button"
                onClick={() => begin(discs)}
                className="flex items-center gap-2 rounded-2xl border-b-8 border-blue-700 bg-blue-500 px-5 py-3 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <RotateCcw size={20} strokeWidth={3} />
                התחל מחדש
              </button>
              <button
                type="button"
                onClick={backToPicker}
                className="flex items-center gap-2 rounded-2xl border-b-8 border-purple-800 bg-purple-600 px-5 py-3 text-lg font-black italic text-white transition-all active:translate-y-2 active:border-b-0"
              >
                <TowerControl size={20} strokeWidth={3} />
                בחר גודל
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="pointer-events-none absolute inset-0 z-30">
            {CONFETTI.map((p) => (
              <span
                key={p.id}
                className="confetti-piece absolute rounded-sm"
                style={{
                  left: `${p.left}%`,
                  top: 0,
                  width: p.size,
                  height: p.size * 0.6,
                  backgroundColor: confetti[p.id % confetti.length],
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                }}
              />
            ))}
            <div dir="rtl" className="absolute inset-x-0 top-[24%] flex justify-center px-4">
              <div
                className="anim-pop rounded-3xl bg-white/95 px-7 py-4 text-center text-3xl font-black italic text-slate-800 shadow-xl"
                style={{ borderBottom: `8px solid ${accent}` }}
              >
                כל הכבוד! המגדל עבר!
              </div>
            </div>
          </div>
        )}
      </div>
    </ArcadeShell>
  )
}
