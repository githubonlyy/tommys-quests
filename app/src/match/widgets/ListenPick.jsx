import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { speak } from '../speak.js'
import { sfx } from '../sounds.js'

// Listening drill: the word is only ever heard, never shown, and the answer
// choices are in Hebrew. Tapping the speaker replays it as often as he likes.
export default function ListenPick({ question, disabled, onAnswer }) {
  const [tapped, setTapped] = useState(null)
  const lockRef = useRef(false)

  const say = () => speak(question.word, { lang: 'en', rate: 0.8 })

  useEffect(() => {
    speak(question.word, { lang: 'en', rate: 0.8, delay: 350 })
  }, [question.word])

  const pick = (opt) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    setTapped(opt.label)
    if (opt.correct) sfx.click()
    // show the written word after answering, so the sound gets attached to spelling
    onAnswer(opt.correct, opt.correct ? 700 : 1200)
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <button
        onClick={say}
        className="w-28 h-28 rounded-full bg-cyan-500 border-b-8 border-cyan-700 text-white flex items-center justify-center shadow-xl active:border-b-0 active:translate-y-2 transition-all anim-ready-pulse"
        aria-label="Play the word"
      >
        <Volume2 size={52} />
      </button>

      {tapped && (
        <span className="text-3xl font-black text-slate-800 tracking-wide anim-pop" dir="ltr">
          {question.word}
        </span>
      )}

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
              className={`min-h-16 px-3 rounded-2xl border-b-4 text-xl font-black transition-all shadow
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
