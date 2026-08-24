import { useEffect, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
import { sfx } from './sounds.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const SPARKS = Array.from({ length: 5 }, (_, i) => {
  const angle = (i / 5) * Math.PI * 2 + 0.5
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * 34)}px`,
    dy: `${Math.round(Math.sin(angle) * 34)}px`,
  }
})

/**
 * Memory board: 6 pairs / 12 vault cards with real 3D flips.
 * Match: gold flash + sparkle burst. Mismatch: wobble, flip back.
 * Reports once via onFinish({ pairs, wrongFlips, elapsedSec, timedOut }).
 */
export default function PairsBoard({ event, pairs, timerSec, onFinish }) {
  const [cards] = useState(() =>
    shuffle(pairs.flatMap((p) => [
      { key: `${p.id}-a`, pairId: p.id, text: p.a },
      { key: `${p.id}-b`, pairId: p.id, text: p.b },
    ])),
  )
  const [flipped, setFlipped] = useState([])
  const [matched, setMatched] = useState(() => new Set())
  const [matchFx, setMatchFx] = useState(null) // pairId flashing gold
  const [mismatchFx, setMismatchFx] = useState([]) // card keys wobbling
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

  useEffect(() => {
    if (matched.size === pairs.length) {
      const t = setTimeout(() => finishRef.current(false), 700)
      return () => clearTimeout(t)
    }
  }, [matched, pairs.length])

  const tapCard = (card) => {
    if (lockRef.current || doneRef.current) return
    if (matched.has(card.pairId) || flipped.includes(card.key)) return
    sfx.flip()
    const next = [...flipped, card.key]
    setFlipped(next)
    if (next.length < 2) return

    const [k1, k2] = next
    const c1 = cards.find((c) => c.key === k1)
    const c2 = cards.find((c) => c.key === k2)
    if (c1.pairId === c2.pairId) {
      lockRef.current = true
      setTimeout(() => {
        setMatched((m) => new Set([...m, c1.pairId]))
        setMatchFx(c1.pairId)
        setFlipped([])
        sfx.ding()
        setTimeout(() => setMatchFx(null), 900)
        lockRef.current = false
      }, 350)
    } else {
      lockRef.current = true
      setWrongFlips((w) => w + 1)
      setTimeout(() => {
        setMismatchFx([k1, k2])
        sfx.buzz()
      }, 400)
      setTimeout(() => {
        setFlipped([])
        setMismatchFx([])
        lockRef.current = false
      }, 1100)
    }
  }

  const timerPct = (remaining / timerSec) * 100

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">
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
          const flashing = matchFx === card.pairId
          const wobbling = mismatchFx.includes(card.key)
          return (
            <button
              key={card.key}
              onClick={() => tapCard(card)}
              disabled={isUp}
              className={`aspect-[4/3] perspective-600 select-none relative ${wobbling ? 'anim-wobble' : ''}`}
            >
              {/* 3D flipper */}
              <div
                className="absolute inset-0 preserve-3d transition-transform duration-300"
                style={{ transform: isUp ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
              >
                {/* face-down: gold vault card */}
                <div className="absolute inset-0 backface-hidden rounded-2xl border-b-4 border-amber-700 bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                  <div className="w-9 h-9 rounded-full bg-amber-300 border-4 border-amber-700/60 flex items-center justify-center">
                    <Coins size={20} className="text-amber-800 fill-amber-200" />
                  </div>
                  <span className="absolute inset-1.5 rounded-xl border-2 border-amber-300/50 pointer-events-none"></span>
                </div>
                {/* face-up: the value */}
                <div
                  className={`absolute inset-0 backface-hidden rounded-2xl border-b-4 flex items-center justify-center p-1.5 font-black text-base md:text-xl shadow-md
                    ${isMatched
                      ? `bg-green-100 border-green-400 text-green-700 ${flashing ? 'anim-gold-flash' : ''}`
                      : wobbling
                        ? 'bg-red-50 border-red-400 text-red-600'
                        : 'bg-white border-slate-300 text-slate-800'}`}
                  style={{ transform: 'rotateY(180deg)' }}
                >
                  <span dir="auto" className="leading-tight break-words">{card.text}</span>
                </div>
              </div>

              {/* sparkle burst on match */}
              {flashing && (
                <div className="absolute inset-0 pointer-events-none z-10">
                  {SPARKS.map((s) => (
                    <span
                      key={s.id}
                      className="anim-star-burst absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 text-yellow-400 text-lg leading-none"
                      style={{ '--dx': s.dx, '--dy': s.dy }}
                    >
                      ✦
                    </span>
                  ))}
                </div>
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
