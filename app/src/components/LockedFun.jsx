import { Lock, Check, Gamepad2, ArrowLeft } from 'lucide-react'
import { EVENTS, categoryById } from '../data/events.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'

/**
 * Shown when he taps a game he has not earned yet. A toast was not enough:
 * it vanished before it explained anything. This says how many different
 * subjects are still needed, which ones he already did, and offers a few he
 * could do next — then sends him straight to the board.
 */
export default function LockedFun({ onClose, onGoLearn }) {
  const { state, playedToday, playClock, config } = usePlayer()
  const { t, name, isHe } = useLang()

  const need = config.playTime.matchesPerSession
  const done = EVENTS.filter((e) => playedToday(e.id))
  const left = Math.max(0, need - done.length)
  // suggest from categories he has not touched today, so the nudge adds breadth
  const usedCats = new Set(done.map((e) => e.category))
  const pool = EVENTS.filter((e) => !playedToday(e.id))
  const suggestions = [
    ...pool.filter((e) => !usedCats.has(e.category)),
    ...pool.filter((e) => usedCats.has(e.category)),
  ].slice(0, 3)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--t-overlay) backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 bg-gradient-to-br from-slate-500 to-slate-700 border-b-8 border-black/10 text-center">
          <div className="w-16 h-16 mx-auto bg-white/20 rounded-2xl border-4 border-white/30 flex items-center justify-center mb-2">
            <Lock className="text-white w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white italic drop-shadow-md">{t('locked.title')}</h2>
        </div>

        <div className="p-5 bg-slate-50 space-y-4" dir={isHe ? 'rtl' : 'ltr'}>
          <p className="font-black text-slate-800 text-lg text-center">
            {t('locked.explain', { name: state.name, need, left })}
          </p>

          {/* one pip per subject still required */}
          <div className="flex justify-center gap-2" dir="ltr">
            {Array.from({ length: need }).map((_, i) => (
              <span
                key={i}
                className={`w-10 h-10 rounded-xl border-4 flex items-center justify-center font-black
                  ${i < done.length ? 'bg-green-500 border-green-700 text-white' : 'bg-white border-slate-300 text-slate-300'}`}
              >
                {i < done.length ? <Check size={18} strokeWidth={4} /> : i + 1}
              </span>
            ))}
          </div>

          {done.length > 0 && (
            <p className="text-sm font-bold text-slate-500 text-center">
              {t('locked.doneSoFar')} {done.map((e) => name(e)).join(' · ')}
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{t('locked.try')}</p>
              {suggestions.map((e) => {
                const cat = categoryById(e.category)
                return (
                  <div key={e.id} className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-2xl leading-none">{e.emoji}</span>
                    <span className="flex-1 font-black text-slate-700 text-sm">{name(e)}</span>
                    <span className={`${cat.color} text-white text-[10px] font-black px-2 py-0.5 rounded-md`}>
                      {isHe ? cat.he : cat.en}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onGoLearn}
              className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white text-lg font-black italic py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all"
            >
              <ArrowLeft size={20} className={isHe ? '' : 'rotate-180'} /> {t('locked.go')}
            </button>
            <button
              onClick={onClose}
              className="w-14 bg-slate-300 text-slate-700 rounded-2xl border-b-8 border-slate-400 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center"
            >
              <Gamepad2 size={20} />
            </button>
          </div>
          {playClock.cappedOut && (
            <p className="text-sm font-bold text-orange-600 text-center">{t('fun.cappedOut')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
