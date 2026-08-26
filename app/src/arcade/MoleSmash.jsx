import { useEffect, useRef, useState } from 'react'
import { Bomb, Rat } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

const ROUND_SEC = 45
const START_LIVES = 3
const HOLES = 9

// Mole Smash — moles pop from holes, tap them fast. Don't tap the bombs!
export default function MoleSmash({ highScore, onClose, onScore, onRestart }) {
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, time: ROUND_SEC })
  const [active, setActive] = useState(null) // { idx, kind, id }
  const [smashed, setSmashed] = useState(null) // idx just hit (for fx)
  const [over, setOver] = useState(null)
  const stateRef = useRef({ score: 0, lives: START_LIVES, done: false })
  const reportedRef = useRef(false)

  // round timer
  useEffect(() => {
    const start = Date.now()
    const iv = setInterval(() => {
      const left = Math.max(0, ROUND_SEC - Math.round((Date.now() - start) / 1000))
      setHud((h) => (h.time === left ? h : { ...h, time: left }))
      if (left <= 0) endRound()
    }, 250)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // spawner: pop a mole (or bomb) in a random hole, faster over time
  useEffect(() => {
    let timeout
    let popId = 0
    const start = Date.now()
    const spawn = () => {
      if (stateRef.current.done) return
      const elapsed = (Date.now() - start) / 1000
      const kind = Math.random() < 0.22 ? 'bomb' : 'mole'
      const idx = Math.floor(Math.random() * HOLES)
      const id = ++popId
      setActive({ idx, kind, id })
      const upFor = Math.max(550, 950 - elapsed * 9)
      timeout = setTimeout(() => {
        setActive((a) => (a?.id === id ? null : a))
        timeout = setTimeout(spawn, Math.max(180, 420 - elapsed * 4))
      }, upFor)
    }
    timeout = setTimeout(spawn, 600)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const endRound = () => {
    const s = stateRef.current
    if (s.done) return
    s.done = true
    const isRecord = s.score > highScore
    if (isRecord) sfx.fanfare()
    setOver({ score: s.score, isRecord })
  }

  const smash = (idx) => {
    const s = stateRef.current
    if (s.done || !active || active.idx !== idx) return
    setSmashed(idx)
    setTimeout(() => setSmashed(null), 250)
    if (active.kind === 'mole') {
      s.score += 10
      sfx.pop()
    } else {
      s.lives -= 1
      sfx.thud()
      if (s.lives <= 0) {
        setHud((h) => ({ ...h, score: s.score, lives: 0 }))
        setActive(null)
        endRound()
        return
      }
    }
    setHud((h) => ({ ...h, score: s.score, lives: s.lives }))
    setActive(null)
  }

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div className="absolute inset-0 bg-gradient-to-b from-green-700 to-green-900 flex items-center justify-center p-4">
        <div className="grid grid-cols-3 gap-3 md:gap-5 w-full max-w-md">
          {Array.from({ length: HOLES }).map((_, i) => {
            const isUp = active?.idx === i
            const isBomb = isUp && active.kind === 'bomb'
            const hit = smashed === i
            return (
              <button
                key={i}
                onPointerDown={() => smash(i)}
                className="relative aspect-square rounded-full bg-gradient-to-b from-amber-900 to-stone-900 border-b-8 border-black/50 shadow-inner overflow-hidden select-none"
              >
                {/* hole shadow */}
                <span className="absolute inset-x-3 bottom-2 h-4 rounded-full bg-black/50"></span>
                {isUp && (
                  <span
                    className={`absolute inset-2 rounded-full flex items-center justify-center anim-pop border-b-4
                      ${isBomb
                        ? 'bg-gradient-to-b from-slate-600 to-slate-800 border-slate-950'
                        : 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-800'}
                      ${hit ? 'anim-scatter-shake' : ''}`}
                  >
                    {isBomb
                      ? <Bomb className="text-white w-1/2 h-1/2" />
                      : <Rat className="text-amber-950 w-1/2 h-1/2" />}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </ArcadeShell>
  )
}
