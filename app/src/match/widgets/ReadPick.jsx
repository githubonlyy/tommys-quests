import { useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { speak } from '../speak.js'
import { sfx } from '../sounds.js'

// Reading comprehension: an English sentence he can also hear, answered in
// Hebrew so the test is understanding, not translation speed.
const HEBREW = /[֐-׿]/

export default function ReadPick({ question, disabled, onAnswer }) {
  // a Hebrew passage in an ltr box puts its full stop on the wrong end
  const isHebrewText = HEBREW.test(question.text)
  const textDir = isHebrewText ? 'rtl' : 'ltr'
  const textLang = isHebrewText ? 'he' : 'en'
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
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="w-full max-w-lg bg-cyan-50 border-4 border-cyan-200 rounded-2xl p-4 flex items-center gap-3">
        <p className="flex-1 text-2xl md:text-3xl font-black text-slate-800 leading-snug" dir={textDir}>
          {question.text}
        </p>
        <button
          onClick={() => speak(question.text, { lang: textLang, rate: 0.8 })}
          className="shrink-0 w-12 h-12 rounded-xl bg-cyan-500 border-b-4 border-cyan-700 text-white flex items-center justify-center active:border-b-0 active:translate-y-1 transition-all"
          aria-label="Read the sentence aloud"
        >
          <Volume2 size={22} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg" dir="rtl">
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
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-cyan-50 active:border-b-0 active:translate-y-1'}`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
