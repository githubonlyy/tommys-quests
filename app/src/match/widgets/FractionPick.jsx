import { useRef, useState } from 'react'
import { sfx } from '../sounds.js'

// A fraction is only obvious once you see it: the shape is drawn as `den`
// equal slices with `num` of them filled, and the choices name it in Hebrew.
export default function FractionPick({ question, disabled, onAnswer }) {
  const [tapped, setTapped] = useState(null)
  const lockRef = useRef(false)
  const { num, den } = question

  const pick = (opt) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    setTapped(opt.label)
    if (opt.correct) sfx.click()
    onAnswer(opt.correct, opt.correct ? 700 : 1200)
  }

  // a pie is easiest to read for halves/thirds/quarters; bars for the rest
  const asPie = den <= 6

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {asPie ? (
        <svg viewBox="0 0 120 120" className="w-40 h-40 md:w-48 md:h-48 drop-shadow">
          {Array.from({ length: den }).map((_, i) => {
            const a0 = (i / den) * Math.PI * 2 - Math.PI / 2
            const a1 = ((i + 1) / den) * Math.PI * 2 - Math.PI / 2
            const large = 1 / den > 0.5 ? 1 : 0
            const d = `M60 60 L${60 + Math.cos(a0) * 55} ${60 + Math.sin(a0) * 55} A55 55 0 ${large} 1 ${60 + Math.cos(a1) * 55} ${60 + Math.sin(a1) * 55} Z`
            return <path key={i} d={d} fill={i < num ? '#f59e0b' : '#ffffff'} stroke="#1e293b" strokeWidth="3" />
          })}
        </svg>
      ) : (
        <div className="flex w-full max-w-sm h-20 rounded-2xl overflow-hidden border-4 border-slate-800">
          {Array.from({ length: den }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 border-e-2 border-slate-800 last:border-e-0 ${i < num ? 'bg-amber-500' : 'bg-white'}`}
            ></div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 bg-slate-100 border-4 border-slate-200 rounded-2xl px-5 py-2" dir="ltr">
        <span className="text-3xl font-black text-slate-800 tabular-nums leading-none flex flex-col items-center">
          <span>{num}</span>
          <span className="w-6 border-t-4 border-slate-800"></span>
          <span>{den}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm" dir="rtl">
        {question.options.map((opt) => {
          const hitCorrect = tapped === opt.label && opt.correct
          const hitWrong = tapped === opt.label && !opt.correct
          const reveal = tapped && !hitCorrect && opt.correct
          return (
            <button
              key={opt.label}
              onClick={() => pick(opt)}
              disabled={disabled || tapped !== null}
              className={`min-h-14 px-3 rounded-2xl border-b-4 text-lg font-black transition-all shadow
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
