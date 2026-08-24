import { useRef, useState } from 'react'
import { sfx } from '../sounds.js'

const BALLOON_STYLES = [
  { grad: 'bg-gradient-to-b from-red-400 to-red-600 border-red-700', shard: '#ef4444' },
  { grad: 'bg-gradient-to-b from-blue-400 to-blue-600 border-blue-700', shard: '#3b82f6' },
  { grad: 'bg-gradient-to-b from-green-400 to-green-600 border-green-700', shard: '#22c55e' },
  { grad: 'bg-gradient-to-b from-purple-400 to-purple-600 border-purple-700', shard: '#a855f7' },
]

const SHARDS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * 60)}px`,
    dy: `${Math.round(Math.sin(angle) * 60)}px`,
    rot: `${180 + i * 45}deg`,
  }
})

/**
 * Arcade mode: answers float in balloons — pop the right one.
 * Tap right: balloon inflates then BURSTS (shards + flash + POP!).
 * Tap wrong: that balloon deflates sadly, then the correct one pops itself.
 */
export default function BalloonPop({ question, disabled, onAnswer }) {
  // phases per balloon index: 'inflate' -> 'popped'; 'deflate' for a wrong tap
  const [popped, setPopped] = useState(null)
  const [inflating, setInflating] = useState(null)
  const [deflating, setDeflating] = useState(null)
  const lockRef = useRef(false)

  const correctIdx = question.options.findIndex((o) => o.correct)

  const tap = (opt, i) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    if (opt.correct) {
      setInflating(i)
      setTimeout(() => { setInflating(null); setPopped(i); sfx.pop() }, 180)
      onAnswer(true, 700) // answer locks in now; engine shows feedback after the pop
    } else {
      setDeflating(i)
      sfx.buzz()
      // then show the right answer popping itself
      setTimeout(() => { setPopped(correctIdx); sfx.pop() }, 650)
      onAnswer(false, 1250)
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {question.emoji && <span className="text-6xl">{question.emoji}</span>}

      <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-sm">
        {question.options.map((opt, i) => {
          const style = BALLOON_STYLES[i]
          const isPopped = popped === i
          return (
            <div key={i} className="relative aspect-square max-w-36 mx-auto w-full">
              {/* burst remains */}
              {isPopped && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div className="anim-pop-flash absolute inset-[15%] rounded-full bg-white"></div>
                  {SHARDS.map((s) => (
                    <div
                      key={s.id}
                      className="anim-balloon-shard absolute left-1/2 top-1/2 w-3.5 h-5 -ml-2 -mt-2.5 rounded-[40%_60%_50%_50%]"
                      style={{ '--dx': s.dx, '--dy': s.dy, '--rot': s.rot, backgroundColor: style.shard }}
                    ></div>
                  ))}
                  <span className="anim-pop-text absolute inset-0 flex items-center justify-center text-3xl font-black italic text-slate-800 drop-shadow-md">
                    POP!
                  </span>
                </div>
              )}

              {!isPopped && (
                <button
                  onClick={() => tap(opt, i)}
                  disabled={disabled}
                  className={`absolute inset-0 flex items-center justify-center rounded-full border-b-8 shadow-xl
                    transition-transform select-none text-white font-black text-2xl md:text-3xl drop-shadow-md p-2
                    ${style.grad}
                    ${inflating === i ? 'anim-balloon-inflate' : deflating === i ? 'anim-balloon-deflate' : 'anim-float-bob active:scale-90'}
                  `}
                  style={{ animationDelay: inflating === i || deflating === i ? '0s' : `${i * 0.35}s` }}
                >
                  {/* balloon shine */}
                  <span className="absolute top-3 left-4 w-6 h-4 bg-white/40 rounded-full rotate-[-25deg]"></span>
                  <span dir="auto" className="break-words leading-tight">{opt.label}</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
