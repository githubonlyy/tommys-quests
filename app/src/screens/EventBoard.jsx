import { useEffect, useState } from 'react'
import { Calculator, MessageCircle, BookOpen, Map as MapIcon, Coins, Check, X, Sparkles, Gift } from 'lucide-react'
import { EVENTS, MODES } from '../data/events.js'
import { usePlayer, businessDate } from '../context/PlayerContext.jsx'
import { sfx } from '../match/sounds.js'

const ICONS = {
  math: Calculator,
  english: MessageCircle,
  hebrew: BookOpen,
  geography: MapIcon,
}

export default function EventBoard({ onStartMatch }) {
  const { state, playedToday } = usePlayer()
  const [preview, setPreview] = useState(null) // event shown in the pre-match modal
  const [chestOpen, setChestOpen] = useState(false)

  const doneCount = EVENTS.filter((e) => playedToday(e.id)).length
  const chestReady = doneCount === EVENTS.length
  const chestClaimed = state.chestClaimed === businessDate()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-blue-900/50 p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">Daily Events</h2>
        <div className="px-3 py-1.5 bg-green-500 text-white rounded-xl border-b-4 border-green-700 font-bold text-sm uppercase flex items-center gap-1">
          <Check size={16} strokeWidth={3} /> New Events
        </div>
      </div>

      {/* DAILY CHEST STRIP */}
      <div className="flex items-center gap-3 bg-blue-900/50 p-3 md:p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <button
          onClick={() => chestReady && !chestClaimed && setChestOpen(true)}
          disabled={!chestReady || chestClaimed}
          className={`shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl border-b-4 flex items-center justify-center transition-all
            ${chestClaimed
              ? 'bg-green-500 border-green-700'
              : chestReady
                ? 'bg-yellow-400 border-yellow-600 anim-ready-pulse cursor-pointer shadow-[0_0_18px_rgba(250,204,21,0.7)]'
                : 'bg-blue-950 border-blue-900'}`}
          aria-label="Daily chest"
        >
          {chestClaimed
            ? <Check size={30} strokeWidth={3.5} className="text-white" />
            : <Gift size={30} className={chestReady ? 'text-yellow-900' : 'text-blue-700'} />}
        </button>
        <div className="flex-1" dir="rtl">
          <p className="text-white font-black leading-tight">
            {chestClaimed
              ? 'תיבת האוצר נאספה! נתראה מחר'
              : chestReady
                ? 'תיבת האוצר מוכנה — פתחו אותה!'
                : `סיימו את כל המשימות היום — ${doneCount}/4`}
          </p>
          <div className="flex gap-1.5 mt-1.5" dir="ltr">
            {EVENTS.map((e) => (
              <span
                key={e.id}
                className={`h-2.5 flex-1 max-w-16 rounded-full ${playedToday(e.id) ? e.color : 'bg-blue-950'}`}
              ></span>
            ))}
          </div>
        </div>
      </div>

      {chestOpen && <ChestModal onClose={() => setChestOpen(false)} />}

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

      {/* CHEST + PRE-MATCH MODALS below */}
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

                {/* game mode picker */}
                <div className="w-full space-y-3">
                  <button
                    onClick={() => { setPreview(null); onStartMatch(preview, 'classic') }}
                    className="w-full bg-green-500 hover:bg-green-400 text-white text-2xl font-black italic uppercase py-4 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all shadow-lg"
                  >
                    PLAY! · {preview.title}
                  </button>
                  {preview.modes.filter((m) => m !== 'classic').map((m) => (
                    <button
                      key={m}
                      onClick={() => { setPreview(null); onStartMatch(preview, m) }}
                      className={`w-full ${m === 'balloon' ? 'bg-orange-400 hover:bg-orange-300 border-orange-600' : 'bg-indigo-500 hover:bg-indigo-400 border-indigo-700'} text-white font-black italic uppercase py-3 rounded-2xl border-b-8 active:border-b-0 active:translate-y-2 transition-all shadow-lg flex flex-col items-center leading-tight`}
                    >
                      <span className="text-xl">{MODES[m].label}</span>
                      <span className="text-xs font-bold normal-case not-italic opacity-90" dir="rtl">{MODES[m].heLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/* ---------- DAILY CHEST MODAL ---------- */

const CHEST_BURST = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2
  const dist = 60 + (i % 3) * 26
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist * 0.7 - 46)}px`,
    delay: (i % 4) * 0.07,
  }
})

function ChestModal({ onClose }) {
  const { dispatch, config } = usePlayer()
  const [opened, setOpened] = useState(false)

  // lid pops after a beat, reward is granted exactly once
  useEffect(() => {
    const t = setTimeout(() => {
      setOpened(true)
      dispatch({ type: 'CHEST_CLAIM', amount: config.dailyChestCoins })
      sfx.pop()
      sfx.fanfare()
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-4">
      <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden text-center">
        <div className="p-4 bg-gradient-to-br from-yellow-300 to-amber-500 border-b-8 border-black/10">
          <h2 className="text-3xl font-black text-white uppercase italic drop-shadow-md">Daily Chest!</h2>
        </div>

        <div className="p-8 flex flex-col items-center gap-5 bg-slate-50">
          {/* chest */}
          <div className="relative w-36 h-32">
            {/* coin burst */}
            {opened && (
              <div className="absolute inset-0 pointer-events-none z-20">
                {CHEST_BURST.map((p) => (
                  <div
                    key={p.id}
                    className="anim-coin-burst absolute left-1/2 top-1/3 w-4 h-4 -ml-2 -mt-2 rounded-full bg-yellow-400 border-2 border-yellow-700 shadow"
                    style={{ '--dx': p.dx, '--dy': p.dy, animationDelay: `${p.delay}s` }}
                  ></div>
                ))}
              </div>
            )}
            {/* glow inside */}
            {opened && (
              <div className="absolute left-3 right-3 top-8 bottom-2 rounded-xl bg-gradient-to-t from-amber-400 to-yellow-200 anim-vault-glow"></div>
            )}
            {/* body */}
            <div className="absolute left-0 right-0 bottom-0 h-20 rounded-b-2xl rounded-t-md bg-gradient-to-b from-amber-600 to-amber-800 border-4 border-amber-900 z-10">
              <div className="absolute left-1/2 -ml-3 top-2 w-6 h-7 bg-yellow-400 border-4 border-amber-900 rounded-md"></div>
            </div>
            {/* lid */}
            <div className={`absolute left-0 right-0 top-4 h-12 rounded-t-2xl bg-gradient-to-b from-amber-500 to-amber-700 border-4 border-amber-900 z-10 ${opened ? 'anim-chest-lid' : ''}`}>
              <div className="absolute inset-x-2 top-1.5 h-1.5 rounded bg-amber-300/50"></div>
            </div>
          </div>

          {opened ? (
            <div className="anim-pop flex items-center gap-2 bg-yellow-100 border-4 border-yellow-400 rounded-2xl px-6 py-2">
              <Coins size={26} className="text-yellow-600 fill-yellow-300" />
              <span className="text-3xl font-black text-yellow-700 tabular-nums">+{config.dailyChestCoins}</span>
            </div>
          ) : (
            <p className="font-black text-slate-400 uppercase tracking-widest">...נפתח</p>
          )}

          <p className="font-bold text-slate-600" dir="rtl">
            כל הכבוד! סיימת את כל המשימות של היום 🎉
          </p>

          <button
            onClick={onClose}
            disabled={!opened}
            className="w-full bg-green-500 hover:bg-green-400 text-white text-xl font-black italic uppercase py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50"
          >
            YES!
          </button>
        </div>
      </div>
    </div>
  )
}
