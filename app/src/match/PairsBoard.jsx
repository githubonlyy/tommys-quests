import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Memory board: 6 pairs / 12 cards. Match all pairs before the timer runs out.
 * pairs: [{ id, a, b }] — a/b are the two card faces (e.g. "6 × 7" / "42").
 * Reports once via onFinish({ pairs, wrongFlips, elapsedSec, timedOut }).
 */
export default function PairsBoard({ event, pairs, timerSec, onFinish }) {
  const [cards] = useState(() =>
    shuffle(pairs.flatMap((p) => [
      { key: `${p.id}-a`, pairId: p.id, text: p.a },
      { key: `${p.id}-b`, pairId: p.id, text: p.b },
    ])),
  )
  const [flipped, setFlipped] = useState([]) // card keys, max 2
  const [matched, setMatched] = useState(() => new Set())
  const [wrongFlips, setWrongFlips] = useState(0)
  const [remaining, setRemaining] = useState(timerSec)
  const lockRef = useRef(false)
  const startRef = useRef(Date.now())
  const doneRef = useRef(false)

  const finish = (timedOut) => {
    if (doneRef.current) return
    doneRef.current = true
    onFinish({
      pairs: matched.size,
      wrongFlips,
      elapsedSec: Math.round((Date.now() - startRef.current) / 1000),
      timedOut,
    })
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  // board timer
  useEffect(() => {
    const iv = setInterval(() => {
      const left = timerSec - (Date.now() - startRef.current) / 1000
      if (left <= 0) {
        clearInterval(iv)
        finishRef.current(true)
      } else {
        setRemaining(left)
      }
    }, 250)
    return () => clearInterval(iv)
  }, [timerSec])

  // all pairs found
  useEffect(() => {
    if (matched.size === pairs.length) {
      const t = setTimeout(() => finishRef.current(false), 600)
      return () => clearTimeout(t)
    }
  }, [matched, pairs.length])

  const tapCard = (card) => {
    if (lockRef.current || doneRef.current) return
    if (matched.has(card.pairId) || flipped.includes(card.key)) return
    const next = [...flipped, card.key]
    setFlipped(next)
    if (next.length < 2) return

    const [k1, k2] = next
    const c1 = cards.find((c) => c.key === k1)
    const c2 = cards.find((c) => c.key === k2)
    if (c1.pairId === c2.pairId) {
      setMatched((m) => new Set([...m, c1.pairId]))
      setFlipped([])
    } else {
      lockRef.current = true
      setWrongFlips((w) => w + 1)
      setTimeout(() => {
        setFlipped([])
        lockRef.current = false
      }, 800)
    }
  }

  const timerPct = (remaining / timerSec) * 100

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
      {/* board timer + progress */}
      <div className="w-full flex items-center gap-3">
        <div className="flex-1 h-4 bg-black/40 rounded-full border-2 border-black/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              timerPct > 50 ? 'bg-green-500' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
            }`}
            style={{ width: `${timerPct}%` }}
          ></div>
        </div>
        <span className="text-white font-black tabular-nums">{matched.size}/{pairs.length}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 md:gap-3 w-full">
        {cards.map((card) => {
          const isUp = matched.has(card.pairId) || flipped.includes(card.key)
          const isMatched = matched.has(card.pairId)
          return (
            <button
              key={card.key}
              onClick={() => tapCard(card)}
              disabled={isUp}
              className={`aspect-[4/3] rounded-2xl border-b-4 font-black text-base md:text-xl flex items-center justify-center p-1.5 transition-all duration-200 select-none
                ${isMatched
                  ? 'bg-green-100 border-green-400 text-green-700 scale-95'
                  : isUp
                    ? 'bg-white border-slate-300 text-slate-800 anim-pop'
                    : `${event.color} ${event.borderColor} text-white/70 active:translate-y-1 active:border-b-0 cursor-pointer`}`}
            >
              {isUp ? (
                <span dir="auto" className="leading-tight break-words">{card.text}</span>
              ) : (
                <HelpCircle size={28} className="drop-shadow" />
              )}
            </button>
          )
        })}
      </div>

      <p className="text-blue-200 font-bold text-sm" dir="rtl">
        טעויות: <span className="tabular-nums font-black">{wrongFlips}</span>
      </p>
    </div>
  )
}
