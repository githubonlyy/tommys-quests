import { useRef, useState } from 'react'
import { sfx } from '../sounds.js'

// The sequence is shown as tiles with an empty slot at the end; he picks what
// belongs there. Reads left-to-right even in the Hebrew layout, like numbers.
export default function PatternPick({ question, disabled, onAnswer }) {
  const [tapped, setTapped] = useState(null)
  const lockRef = useRef(false)

  const pick = (opt) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    setTapped(opt.label)
    if (opt.correct) sfx.click()
    onAnswer(opt.correct, opt.correct ? 700 : 1200)
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="flex items-center justify-center gap-2 flex-wrap max-w-lg" dir="ltr">
        {question.seq.map((v, i) => (
          <span
            key={i}
            className="min-w-14 h-14 px-2 rounded-2xl bg-white border-4 border-slate-300 flex items-center justify-center text-2xl font-black text-slate-800 shadow"
          >
            {v}
          </span>
        ))}
        <span className="min-w-14 h-14 rounded-2xl border-4 border-dashed border-amber-400 bg-amber-50 flex items-center justify-center text-3xl font-black text-amber-500">
          ?
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm" dir="ltr">
        {question.options.map((opt) => {
          const hitCorrect = tapped === opt.label && opt.correct
          const hitWrong = tapped === opt.label && !opt.correct
          const reveal = tapped && !hitCorrect && opt.correct
          return (
            <button
              key={opt.label}
              onClick={() => pick(opt)}
              disabled={disabled || tapped !== null}
              className={`min-h-16 px-3 rounded-2xl border-b-4 text-2xl font-black transition-all shadow
                ${hitCorrect
                  ? 'bg-yellow-400 border-yellow-600 text-yellow-900 anim-wave-jump'
                  : hitWrong
                    ? 'bg-red-400 border-red-600 text-white anim-scatter-shake'
                    : reveal
                      ? 'bg-green-400 border-green-600 text-white anim-wobble'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-amber-50 active:border-b-0 active:translate-y-1'}`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
