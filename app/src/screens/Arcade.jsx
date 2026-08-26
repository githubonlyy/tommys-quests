import { useState } from 'react'
import { Gamepad2, Coins, Lock, Trophy } from 'lucide-react'
import { EVENTS } from '../data/events.js'
import { ARCADE_GAMES } from '../data/arcadeGames.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useToast } from '../App.jsx'
import { sfx } from '../match/sounds.js'

// Arcade tab: fun-only games. New games are bought with coins; playing any
// of them still requires finishing the daily study goal first.
export default function Arcade() {
  const { state, dispatch, playedToday, config } = usePlayer()
  const [play, setPlay] = useState(null) // { id, run } — run bumps to remount/restart
  const [buying, setBuying] = useState(null)
  const showToast = useToast()

  const goal = config.dailyGoal
  const doneCount = EVENTS.filter((e) => playedToday(e.id)).length
  const goalDone = Math.min(doneCount, goal)
  const unlocked = doneCount >= goal

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 bg-blue-900/50 p-4 rounded-2xl border-4 border-blue-900 backdrop-blur-sm">
        <Gamepad2 className="text-pink-400" size={28} />
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md flex-1">Arcade</h2>
        {!unlocked && (
          <span className="text-blue-200 font-bold text-sm" dir="rtl">
            נפתח אחרי {goal} משימות ({goalDone}/{goal})
          </span>
        )}
      </div>

      {!unlocked && (
        <div className="flex items-center gap-3 bg-slate-800/80 border-4 border-slate-900 rounded-2xl p-4" dir="rtl">
          <Lock className="text-slate-400 shrink-0" size={24} />
          <p className="text-slate-200 font-bold">
            קודם לומדים, אחר כך משחקים! סיימו {goal} משימות שונות במסך Events — ואז הארקייד נפתח להיום.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {ARCADE_GAMES.map((gm) => {
          const owned = state.ownedGames.includes(gm.id)
          const best = state.arcadeHighScores[gm.id] || 0
          const playable = owned && unlocked
          return (
            <div
              key={gm.id}
              onClick={() => {
                if (playable) setPlay({ id: gm.id, run: 1 })
                else if (owned) showToast(`שחקו ${goal} משימות קודם!`, 'error')
                else setBuying(gm)
              }}
              className={`relative rounded-3xl border-b-8 shadow-xl cursor-pointer transition-all duration-200 overflow-hidden
                ${owned && !unlocked ? 'bg-slate-600 border-slate-800' : `${gm.color} ${gm.borderColor} hover:-translate-y-1 active:translate-y-1 active:border-b-0`}`}
            >
              <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-4 md:p-5 flex flex-col items-center text-center gap-2">
                <div className={`p-3 rounded-2xl border-4 -rotate-3 ${owned && unlocked ? `${gm.lightBg} ${gm.borderColor}` : 'bg-slate-200 border-slate-400'}`}>
                  <Gamepad2 className={`w-9 h-9 md:w-11 md:h-11 ${owned && unlocked ? gm.textColor : 'text-slate-400'}`} />
                </div>
                <h3 className="font-black text-slate-800 uppercase italic leading-tight text-base md:text-lg">{gm.title}</h3>
                <p className="font-bold text-slate-500 text-xs leading-snug" dir="rtl">{gm.he}</p>
                {owned ? (
                  playable ? (
                    <span className={`${gm.color} text-white font-black italic uppercase text-sm px-5 py-1.5 rounded-xl border-b-4 border-black/30 anim-ready-pulse`}>PLAY</span>
                  ) : (
                    <Lock className="text-slate-400" size={22} />
                  )
                ) : (
                  <span className={`flex items-center gap-1.5 font-black text-sm px-3.5 py-1.5 rounded-xl border-b-4
                    ${state.coins >= gm.price ? 'bg-yellow-400 border-yellow-600 text-yellow-900' : 'bg-slate-300 border-slate-400 text-slate-500'}`}>
                    <Coins size={15} className="fill-current" /> {gm.price.toLocaleString()}
                  </span>
                )}
                {best > 0 && (
                  <span className="flex items-center gap-1 text-xs font-black text-slate-400 tabular-nums">
                    <Trophy size={12} className="text-yellow-500 fill-yellow-200" /> {best}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* BUY GAME CONFIRM */}
      {buying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-4">
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden text-center">
            <div className={`p-4 ${buying.color} border-b-8 border-black/10`}>
              <h2 className="text-2xl font-black text-white uppercase italic drop-shadow-md">{buying.title}</h2>
            </div>
            <div className="p-6 flex flex-col items-center gap-4 bg-slate-50">
              <p className="font-bold text-slate-600" dir="rtl">{buying.he}</p>
              <p className="font-black text-slate-800 text-lg" dir="rtl">
                לקנות לתמיד ב-
                <span className="text-yellow-600 tabular-nums"> {buying.price.toLocaleString()} </span>
                מטבעות?
              </p>
              {state.coins < buying.price && (
                <p className="font-bold text-red-500 text-sm" dir="rtl">
                  חסרים {(buying.price - state.coins).toLocaleString()} מטבעות — המשיכו לשחק ולחסוך!
                </p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    if (state.coins >= buying.price) {
                      dispatch({ type: 'ARCADE_BUY', game: buying })
                      sfx.fanfare()
                      showToast(`EPIC UNLOCK! ${buying.title} is yours!`, 'success')
                    }
                    setBuying(null)
                  }}
                  disabled={state.coins < buying.price}
                  className="flex-1 bg-yellow-400 text-yellow-950 text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-yellow-600 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  BUY!
                </button>
                <button
                  onClick={() => setBuying(null)}
                  className="flex-1 bg-slate-300 text-slate-700 text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-slate-400 active:border-b-0 active:translate-y-2 transition-all"
                >
                  לא עכשיו
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE ARCADE GAME */}
      {play && (() => {
        const gm = ARCADE_GAMES.find((g) => g.id === play.id)
        const GameComponent = gm.Component
        return (
          <GameComponent
            key={play.run}
            highScore={state.arcadeHighScores[gm.id] || 0}
            onScore={(score) => dispatch({ type: 'ARCADE_SCORE', game: gm.id, score })}
            onRestart={() => setPlay((p) => ({ ...p, run: p.run + 1 }))}
            onClose={() => setPlay(null)}
          />
        )
      })()}
    </div>
  )
}
