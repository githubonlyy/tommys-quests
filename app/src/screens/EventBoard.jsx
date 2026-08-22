import { useState } from 'react'
import { Calculator, MessageCircle, BookOpen, Map as MapIcon, Coins, Check, X, Sparkles } from 'lucide-react'
import { EVENTS } from '../data/events.js'
import { usePlayer } from '../context/PlayerContext.jsx'

const ICONS = {
  math: Calculator,
  english: MessageCircle,
  hebrew: BookOpen,
  geography: MapIcon,
}

export default function EventBoard({ onStartMatch }) {
  const { playedToday } = usePlayer()
  const [preview, setPreview] = useState(null) // event shown in the pre-match modal

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-blue-900/50 p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">Daily Events</h2>
        <div className="px-3 py-1.5 bg-green-500 text-white rounded-xl border-b-4 border-green-700 font-bold text-sm uppercase flex items-center gap-1">
          <Check size={16} strokeWidth={3} /> New Events
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
        {EVENTS.map((event) => {
          const Icon = ICONS[event.id]
          const practice = playedToday(event.id)
          return (
            <div
              key={event.id}
              onClick={() => setPreview(event)}
              className={`group relative ${event.color} rounded-3xl border-b-8 ${event.borderColor} cursor-pointer hover:-translate-y-2 active:translate-y-2 active:border-b-0 transition-all duration-200 shadow-xl`}
            >
              <div className="bg-white m-1.5 rounded-[1.25rem] h-[calc(100%-12px)] flex flex-col overflow-hidden relative">
                <div className={`${event.headerColor} p-2 text-center border-b-4 border-black/10`}>
                  <span className="text-white font-black uppercase text-sm tracking-wider drop-shadow-sm">
                    {event.type}
                  </span>
                </div>

                <div className="p-4 md:p-6 pb-12 md:pb-14 flex items-start gap-3 md:gap-4 flex-1">
                  <div className={`p-2.5 md:p-3 rounded-2xl bg-slate-100 border-4 ${event.borderColor} shadow-inner -rotate-3 group-hover:rotate-0 transition-transform`}>
                    <Icon className={`${event.textColor} w-10 h-10 md:w-12 md:h-12`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic leading-tight mb-2">
                      {event.title}
                    </h3>
                    <div className="bg-slate-100 p-2 rounded-xl border-2 border-slate-200" dir="rtl">
                      <p className="font-bold text-slate-600 text-sm">{event.description}</p>
                    </div>
                  </div>
                </div>

                {practice ? (
                  <div className="absolute bottom-4 right-4 bg-blue-100 px-3 py-1 rounded-full border-2 border-blue-300 flex items-center gap-1 shadow-md">
                    <Sparkles className="text-blue-600" size={14} />
                    <span className="font-black text-blue-600 text-sm">PRACTICE · XP</span>
                  </div>
                ) : (
                  <div className="absolute bottom-4 right-4 bg-yellow-400 px-3 py-1 rounded-full border-2 border-yellow-600 flex items-center gap-1 shadow-md">
                    <Coins className="text-yellow-900 fill-current" size={14} />
                    <span className="font-black text-yellow-900 text-sm">עד 200+</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* PRE-MATCH MODAL */}
      {preview && (() => {
        const Icon = ICONS[preview.id]
        const practice = playedToday(preview.id)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-4">
            <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-xl overflow-hidden flex flex-col relative">
              <div className={`p-6 text-center relative border-b-8 border-black/10 ${preview.headerColor}`}>
                <button
                  onClick={() => setPreview(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/20 hover:bg-black/30 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <X size={24} strokeWidth={3} />
                </button>
                <div className="w-24 h-24 mx-auto bg-white rounded-2xl border-4 border-slate-200 flex items-center justify-center mb-2 shadow-lg rotate-3">
                  <Icon className={`${preview.textColor} w-12 h-12`} />
                </div>
                <h2 className="text-3xl font-black text-white uppercase tracking-wide drop-shadow-md italic mt-2">
                  {preview.title}
                </h2>
              </div>

              <div className="p-5 md:p-8 flex flex-col items-center text-center bg-slate-50">
                <div className="inline-block px-4 py-1 bg-slate-200 rounded-full font-bold text-slate-500 uppercase tracking-wider text-sm mb-4">
                  {preview.type}
                </div>
                <p className="text-lg font-bold text-slate-700 mb-6 max-w-md leading-relaxed" dir="rtl">
                  {preview.description}
                </p>

                {practice && (
                  <div className="bg-blue-50 border-4 border-blue-200 rounded-2xl px-4 py-3 mb-6 w-full" dir="rtl">
                    <p className="font-bold text-blue-700 text-sm">
                      כבר שיחקת היום! משחק חוזר = אימון: נקודות XP בלבד, בלי מטבעות.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => { setPreview(null); onStartMatch(preview) }}
                  className="w-full bg-green-500 hover:bg-green-400 text-white text-2xl font-black italic uppercase py-4 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all shadow-lg"
                >
                  PLAY!
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
