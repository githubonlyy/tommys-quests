import { useRef, useState } from 'react'
import { sfx } from '../sounds.js'

const STARS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * 42)}px`,
    dy: `${Math.round(Math.sin(angle) * 42)}px`,
  }
})

// Hebrew grammar: tap the requested word (verb / noun) in the sentence.
// Right word balloons up gold with a star burst; wrong shakes red while
// the correct word pulses green so the answer is learned.
export default function WordTap({ question, disabled, onAnswer }) {
  const [tapped, setTapped] = useState(null)
  const [reveal, setReveal] = useState(false) // highlight the correct word after a miss
  const lockRef = useRef(false)

  const tap = (i) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    setTapped(i)
    if (i === question.target) {
      sfx.click()
      onAnswer(true, 600)
    } else {
      setReveal(true)
      onAnswer(false, 1000)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full" dir="rtl">
      <div className="bg-purple-100 border-4 border-purple-200 px-6 py-2 rounded-full">
        <span className="text-xl font-black text-purple-700">מצאו את ה{question.ask}</span>
      </div>

      <div className="flex gap-3 justify-center flex-wrap max-w-lg">
        {question.sentence.map((word, i) => {
          const isTarget = i === question.target
          const hitCorrect = tapped === i && isTarget
          const hitWrong = tapped === i && !isTarget
          return (
            <span key={i} className="relative">
              <button
                onClick={() => tap(i)}
                disabled={disabled || tapped !== null}
                className={`text-2xl md:text-3xl font-black px-5 py-3 rounded-2xl border-b-4 transition-all shadow select-none
                  ${hitCorrect
                    ? 'bg-yellow-400 border-yellow-600 text-yellow-900 anim-wave-jump'
                    : hitWrong
                      ? 'bg-red-400 border-red-600 text-white anim-scatter-shake'
                      : reveal && isTarget
                        ? 'bg-green-400 border-green-600 text-white anim-wobble'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-purple-50 hover:border-purple-300 active:border-b-0 active:translate-y-1'}`}
              >
                {word}
              </button>
              {hitCorrect && (
                <span className="absolute inset-0 pointer-events-none z-10">
                  {STARS.map((s) => (
                    <span
                      key={s.id}
                      className="anim-star-burst absolute left-1/2 top-1/2 -ml-2 -mt-2 text-yellow-500 text-xl leading-none"
                      style={{ '--dx': s.dx, '--dy': s.dy }}
                    >
                      ★
                    </span>
                  ))}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
