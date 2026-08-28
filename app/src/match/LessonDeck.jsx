import { useState } from 'react'
import { X, ChevronLeft, BookOpen } from 'lucide-react'
import { sfx } from './sounds.js'
import { lessonCardsForToday } from './lessonRotation.js'
import { useLang } from '../context/LangContext.jsx'

/**
 * Daily mini-lesson: short story cards Tommy taps through before the game.
 * onDone fires after the last card (the read-gate); onClose aborts.
 */
export default function LessonDeck({ event, onDone, onClose }) {
  const { t } = useLang()
  const [cards] = useState(() => lessonCardsForToday(event.id))
  const [idx, setIdx] = useState(0)

  if (cards.length === 0) { onDone(); return null }

  const card = cards[idx]
  const isLast = idx === cards.length - 1

  const forward = () => {
    sfx.flip()
    if (isLast) onDone()
    else setIdx((i) => i + 1)
  }
  const back = () => idx > 0 && setIdx((i) => i - 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        {/* header row: close + progress dots */}
        <div className="w-full flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
          >
            <X size={22} strokeWidth={3} />
          </button>
          <div className="flex-1 flex gap-1.5">
            {cards.map((_, i) => (
              <div key={i} className={`h-3 flex-1 rounded-full ${i < idx ? 'bg-yellow-400' : i === idx ? 'bg-white' : 'bg-white/20'}`}></div>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-white font-black text-sm uppercase shrink-0">
            <BookOpen size={16} /> {idx + 1}/{cards.length}
          </span>
        </div>

        {/* the card — tap anywhere to move forward */}
        <div
          key={idx}
          onClick={forward}
          className="anim-slide-in-q w-full bg-white rounded-3xl border-8 border-slate-800 shadow-2xl overflow-hidden cursor-pointer select-none"
        >
          <div className={`p-4 text-center border-b-8 border-black/10 ${event.headerColor}`}>
            <span className="text-white font-black uppercase italic tracking-wider drop-shadow-sm">{event.type} · {t('lesson.header')}</span>
          </div>
          <div className="p-7 flex flex-col items-center text-center gap-4 bg-slate-50 min-h-72 justify-center">
            <span className="text-6xl">{card.emoji}</span>
            <h3 className="text-2xl font-black text-slate-800" dir="rtl">{card.title}</h3>
            <p className="text-lg font-bold text-slate-600 leading-relaxed" dir="rtl">{card.text}</p>
          </div>
        </div>

        {/* nav buttons */}
        <div className="w-full flex gap-3">
          <button
            onClick={back}
            disabled={idx === 0}
            className="w-14 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center justify-center transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={26} strokeWidth={3} />
          </button>
          <button
            onClick={forward}
            className={`flex-1 text-white text-xl font-black italic uppercase py-3.5 rounded-2xl border-b-8 active:border-b-0 active:translate-y-2 transition-all shadow-lg
              ${isLast ? 'bg-green-500 hover:bg-green-400 border-green-700' : 'bg-blue-500 hover:bg-blue-400 border-blue-700'}`}
          >
            {isLast ? t('lesson.done') : t('lesson.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
