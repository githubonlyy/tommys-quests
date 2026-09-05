import { useEffect, useRef, useState } from 'react'
import { Brain } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

// Board sizes. cols * rows is always 2 * pairs, so the grid never has a hole in it.
const LEVELS = [
  { id: 'easy', label: 'קל', pairs: 6, cols: 3, rows: 4, emoji: '🐣', cls: 'bg-green-400 border-green-600' },
  { id: 'normal', label: 'רגיל', pairs: 8, cols: 4, rows: 4, emoji: '🦊', cls: 'bg-yellow-400 border-amber-600' },
  { id: 'hard', label: 'קשה', pairs: 10, cols: 4, rows: 5, emoji: '🦁', cls: 'bg-pink-400 border-pink-600' },
]

// Big, instantly recognisable shapes only — animals, fruit, vehicles.
const DECK = [
  '🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐵', '🐨', '🐯', '🐮', '🐷', '🦄',
  '🍎', '🍌', '🍓', '🍉', '🍇', '🍍', '🍒', '🥕',
  '🚗', '🚌', '🚀', '🚁', '🚂', '🚜', '🚕', '⛵',
]

const MATCH_POINTS = 100
const CLEAN_BONUS = 60 // paid in full when a pair is found with no wasted flips since the last one
const MISS_COST = 20 // every miss since the last match eats into that bonus
const SEC_PER_PAIR = 12 // generous time budget; each second under it pays TIME_BONUS
const TIME_BONUS = 6
const PERFECT_BONUS = 300 // cleared with the theoretical minimum number of moves
const FLIP_BACK_MS = 900
const FINALE_MS = 1300 // let the confetti fall before the result card covers the board
const HINT_MS = 6000

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/**
 * Memory — flip two cards, keep the ones that match. No clock to beat and no way
 * to lose: the board always ends solved. The score is what rewards playing well,
 * so a clean run (few wasted flips, quick finish) pays far more than a lucky one.
 */
export default function MemoryPairs({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const confettiColors = theme?.confetti ?? ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c']

  const [level, setLevel] = useState(null)
  const [cards, setCards] = useState([])
  const [open, setOpen] = useState([]) // indices face-up and not yet resolved
  const [matched, setMatched] = useState(() => new Set())
  const [wrong, setWrong] = useState([]) // the pair currently shaking before it flips back
  const [lock, setLock] = useState(false)
  const [fx, setFx] = useState(null) // { id, a, b, gain } — pop + floating points
  const [stats, setStats] = useState({ moves: 0, found: 0 })
  const [hint, setHint] = useState(true)
  const [solved, setSolved] = useState(false)
  const [hud, setHud] = useState({ score: 0, time: 0 })
  const [over, setOver] = useState(null)

  // Tap bookkeeping lives in a ref, not in state: two pointerdowns can land before
  // React re-renders, and a stale `open` list would happily match a card with itself.
  const st = useRef({ score: 0, moves: 0, misses: 0, found: 0, startAt: 0, done: false, open: [], busy: false })
  const timersRef = useRef(new Set())
  const reportedRef = useRef(false)

  // every timeout goes through here so unmount can kill the whole set at once
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t)
      fn()
    }, ms)
    timersRef.current.add(t)
  }

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])

  // elapsed clock — counts up, never down, and only once he has flipped a card
  useEffect(() => {
    const iv = setInterval(() => {
      const s = st.current
      if (s.done || !s.startAt) return
      const secs = Math.round((Date.now() - s.startAt) / 1000)
      setHud((h) => (h.time === secs ? h : { ...h, time: secs }))
    }, 400)
    return () => clearInterval(iv)
  }, [])

  const start = (lv) => {
    const symbols = shuffle(DECK).slice(0, lv.pairs)
    st.current = { score: 0, moves: 0, misses: 0, found: 0, startAt: 0, done: false, open: [], busy: false }
    setCards(shuffle([...symbols, ...symbols]).map((sym, i) => ({ id: i, sym })))
    setOpen([])
    setMatched(new Set())
    setWrong([])
    setLock(false)
    setFx(null)
    setStats({ moves: 0, found: 0 })
    setSolved(false)
    setHint(true)
    setHud({ score: 0, time: 0 })
    setOver(null)
    setLevel(lv)
    sfx.click()
    later(() => setHint(false), HINT_MS)
  }

  const finish = (total) => {
    const s = st.current
    if (s.done) return
    s.done = true
    const elapsed = Math.max(1, Math.round((Date.now() - s.startAt) / 1000))
    const timeBonus = Math.max(0, Math.round((total * SEC_PER_PAIR - elapsed) * TIME_BONUS))
    const perfect = s.moves === total ? PERFECT_BONUS : 0
    const score = s.score + timeBonus + perfect
    s.score = score
    setHud({ score, time: elapsed })
    setSolved(true)
    sfx.fanfare() // clearing the board always earns the fanfare — a record just makes it official
    const isRecord = score > highScore
    later(() => setOver({ score, isRecord, won: true }), FINALE_MS)
  }

  const tap = (idx) => {
    const s = st.current
    if (s.done || s.busy) return
    if (matched.has(idx) || s.open.includes(idx)) return

    if (!s.startAt) s.startAt = Date.now() // the clock starts on the first flip, not on the menu
    sfx.flip()
    setHint(false)

    const next = [...s.open, idx]
    s.open = next
    setOpen(next)
    if (next.length < 2) return

    const [a, b] = next
    s.moves += 1

    if (cards[a].sym === cards[b].sym) {
      const gain = MATCH_POINTS + Math.max(0, CLEAN_BONUS - s.misses * MISS_COST)
      s.misses = 0
      s.score += gain
      s.found += 1
      sfx.ding()
      s.open = []
      setOpen([])
      setMatched((prev) => new Set(prev).add(a).add(b))
      setStats({ moves: s.moves, found: s.found })
      setHud((h) => ({ ...h, score: s.score }))
      const fxId = s.moves
      setFx({ id: fxId, a, b, gain })
      later(() => setFx((f) => (f && f.id === fxId ? null : f)), 950)
      if (s.found === cards.length / 2) finish(cards.length / 2)
    } else {
      s.misses += 1
      s.busy = true
      sfx.buzz()
      setStats({ moves: s.moves, found: s.found })
      setLock(true)
      setWrong(next)
      later(() => {
        s.open = []
        s.busy = false
        setOpen([])
        setWrong([])
        setLock(false)
      }, FLIP_BACK_MS)
    }
  }

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell
      hud={level ? hud : { score: 0 }}
      over={over}
      highScore={highScore}
      onClose={onClose}
      onRestart={onRestart}
    >
      <div dir="rtl" className="absolute inset-0 overflow-hidden bg-gradient-to-b from-indigo-700 to-violet-950">
        {!level && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 p-6">
            <div className="anim-pop flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-3xl bg-white/15 border-b-8 border-black/30 flex items-center justify-center">
                <Brain size={52} strokeWidth={2.5} className="text-white drop-shadow" />
              </div>
              <h2 className="text-white text-4xl font-black italic drop-shadow">משחק זיכרון</h2>
              <p className="text-indigo-200 text-xl font-bold">בחר לוח ובוא נתחיל!</p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xs">
              {LEVELS.map((lv) => (
                <button
                  key={lv.id}
                  onClick={() => start(lv)}
                  className={`flex items-center gap-3 w-full min-h-16 px-5 py-4 rounded-3xl text-slate-900 text-2xl font-black italic
                    border-b-8 active:border-b-0 active:translate-y-2 transition-all shadow-lg ${lv.cls}`}
                >
                  <span className="text-3xl leading-none">{lv.emoji}</span>
                  <span className="flex-1 text-right">{lv.label}</span>
                  <span className="text-lg tabular-nums text-black/60">{lv.pairs} זוגות</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {level && (
          <div className="absolute inset-0 flex flex-col gap-2 p-3">
            <div className="shrink-0 flex items-center justify-center gap-2">
              <span className="bg-black/35 text-white font-black text-base rounded-full px-4 py-1.5 tabular-nums">
                🔁 {stats.moves}
              </span>
              <span className="bg-black/35 text-white font-black text-base rounded-full px-4 py-1.5 tabular-nums">
                🧩 {stats.found}/{level.pairs}
              </span>
            </div>

            <div
              className="flex-1 min-h-0 w-full max-w-[520px] mx-auto grid gap-2 sm:gap-3"
              style={{
                gridTemplateColumns: `repeat(${level.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${level.rows}, minmax(0, 1fr))`,
              }}
            >
              {cards.map((card, i) => {
                const isMatched = matched.has(i)
                const isUp = isMatched || open.includes(i)
                const isWrong = wrong.includes(i)
                const popping = fx && (fx.a === i || fx.b === i)
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isUp || lock}
                    onPointerDown={() => tap(i)}
                    style={{ touchAction: 'manipulation' }}
                    className={`relative min-h-11 perspective-600 select-none
                      ${isWrong ? 'anim-wobble' : ''} ${popping ? 'anim-pop' : ''}`}
                  >
                    <div
                      className="absolute inset-0 preserve-3d transition-transform duration-300"
                      style={{ transform: isUp ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                    >
                      {/* face-down: the brain card */}
                      <div className="absolute inset-0 backface-hidden rounded-3xl shadow-lg flex items-center justify-center
                        border-b-8 border-indigo-900 bg-gradient-to-br from-indigo-400 to-indigo-600">
                        <Brain className="w-1/2 h-1/2 text-white/85" strokeWidth={2.5} />
                        <span className="absolute inset-2 rounded-2xl border-4 border-white/20 pointer-events-none"></span>
                      </div>
                      {/* face-up: the picture */}
                      <div
                        className={`absolute inset-0 backface-hidden rounded-3xl shadow-lg flex items-center justify-center border-b-8
                          ${isMatched
                            ? `bg-green-100 border-green-500 ${popping ? 'anim-gold-flash' : ''}`
                            : isWrong
                              ? 'bg-red-100 border-red-400'
                              : 'bg-white border-slate-300'}`}
                        style={{
                          transform: 'rotateY(180deg)',
                          fontSize: 'min(9vmin, 3.25rem)',
                          // matched cards keep a soft themed halo so the board reads as "done"
                          boxShadow: isMatched ? `0 0 16px ${accent}` : undefined,
                        }}
                      >
                        <span className="leading-none">{card.sym}</span>
                      </div>
                    </div>

                    {fx && fx.b === i && (
                      <span
                        key={fx.id}
                        className="anim-float-up absolute inset-x-0 top-1 z-10 text-center font-black text-xl pointer-events-none drop-shadow"
                        style={{ color: accent }}
                      >
                        +{fx.gain}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {hint && !solved && (
              <div className="anim-fade-in absolute inset-x-0 bottom-4 flex justify-center px-4 pointer-events-none">
                <div className="bg-black/70 text-white font-black text-xl rounded-2xl px-5 py-3 text-center leading-snug">
                  הפוך שני קלפים זהים 🧠
                </div>
              </div>
            )}

            {solved && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="anim-pop bg-white/95 text-slate-800 text-4xl font-black rounded-3xl border-b-8 px-8 py-5 shadow-2xl"
                  style={{ borderColor: accent }}
                >
                  כל הכבוד! 🎉
                </div>
              </div>
            )}
          </div>
        )}

        {solved && <Confetti colors={confettiColors} />}
      </div>
    </ArcadeShell>
  )
}

function Confetti({ colors }) {
  // frozen on mount — re-rendering the board must not re-roll the fall
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.1,
      duration: 2.2 + Math.random() * 1.6,
      color: colors[i % colors.length],
      size: 8 + Math.random() * 8,
    })),
  )
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece absolute rounded-sm"
          style={{
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        ></div>
      ))}
    </div>
  )
}
