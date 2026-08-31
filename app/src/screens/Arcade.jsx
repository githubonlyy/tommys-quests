import { useState } from 'react'
import { Gamepad2, Coins, Lock, Trophy } from 'lucide-react'
import { ARCADE_GAMES } from '../data/arcadeGames.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useToast } from '../App.jsx'
import { sfx } from '../match/sounds.js'
import { PlayClockChip, PlayClockBanner, PlayClockOverlay, usePlayClockTicker } from '../components/PlayClock.jsx'

// The arcade games. Playing spends the play time he earned by learning; buying
// a new game spends coins.
export default function Arcade() {
  const { state, dispatch, playClock } = usePlayer()
  const { t } = useLang()
  const showToast = useToast()
  const [open, setOpen] = useState(null) // { id, run } — run bumps to restart
  const [buying, setBuying] = useState(null)
  const [msLeft, setMsLeft] = useState(playClock.msLeft)

  usePlayClockTicker(Boolean(open), msLeft, setMsLeft)
  const hasTime = msLeft > 0

  const start = (gm) => {
    if (!hasTime) {
      showToast(t('fun.needMore', { n: playClock.matchesToNext }), 'error')
      return
    }
    sfx.click()
    setOpen({ id: gm.id, run: 1 })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <Gamepad2 className="text-(--t-accent)" size={28} />
        <h2 className="flex-1 text-2xl lg:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">
          {t('nav.arcade')}
        </h2>
        <PlayClockChip msLeft={msLeft} />
      </div>

      <PlayClockBanner msLeft={msLeft} />

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {ARCADE_GAMES.map((gm) => {
          const owned = state.ownedGames.includes(gm.id)
          const best = state.arcadeHighScores?.[gm.id] ?? 0
          const playable = owned && hasTime
          return (
            <div
              key={gm.id}
              onClick={() => (owned ? start(gm) : setBuying(gm))}
              className={`relative rounded-3xl border-b-8 shadow-xl cursor-pointer transition-all duration-200 overflow-hidden
                ${owned && !hasTime ? 'bg-slate-600 border-slate-800' : `${gm.color} ${gm.borderColor} hover:-translate-y-1 active:translate-y-1 active:border-b-0`}`}
            >
              <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-3 md:p-4 flex flex-col items-center text-center gap-1.5">
                <div className={`p-2.5 rounded-2xl border-4 -rotate-3 ${playable ? `${gm.lightBg} ${gm.borderColor}` : 'bg-slate-200 border-slate-400'}`}>
                  <Gamepad2 className={`w-8 h-8 ${playable ? gm.textColor : 'text-slate-400'}`} />
                </div>
                <h3 className="font-black text-slate-800 uppercase italic text-sm md:text-base leading-tight">{gm.title}</h3>
                <p className="font-bold text-slate-500 text-xs leading-snug" dir="rtl">{gm.he}</p>
                {owned ? (
                  playable ? (
                    <span className={`${gm.color} text-white font-black italic uppercase text-xs px-4 py-1 rounded-lg border-b-2 border-black/30`}>
                      {t('arcade.play')}
                    </span>
                  ) : (
                    <Lock className="text-slate-400" size={18} />
                  )
                ) : (
                  <span className={`flex items-center gap-1 font-black text-xs px-2.5 py-1 rounded-lg border-b-2
                    ${state.coins >= gm.price ? 'bg-yellow-400 border-yellow-600 text-yellow-900' : 'bg-slate-300 border-slate-400 text-slate-500'}`}>
                    <Coins size={11} className="fill-current" /> {gm.price.toLocaleString()}
                  </span>
                )}
                {best > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-slate-400 tabular-nums">
                    <Trophy size={10} className="text-yellow-500 fill-yellow-200" /> {best}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {buying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--t-overlay) backdrop-blur-sm p-4">
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden text-center">
            <div className={`p-4 ${buying.color} border-b-8 border-black/10`}>
              <h2 className="text-2xl font-black text-white uppercase italic drop-shadow-md">{buying.title}</h2>
            </div>
            <div className="p-6 flex flex-col items-center gap-4 bg-slate-50">
              <p className="font-bold text-slate-600" dir="rtl">{buying.he}</p>
              <p className="font-black text-slate-800 text-lg" dir="rtl">{t('arcade.buyTitle', { price: buying.price.toLocaleString() })}</p>
              {state.coins < buying.price && (
                <p className="font-bold text-red-500 text-sm" dir="rtl">
                  {t('arcade.missing', { missing: (buying.price - state.coins).toLocaleString() })}
                </p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    if (state.coins >= buying.price) {
                      dispatch({ type: 'ARCADE_BUY', game: buying })
                      sfx.fanfare()
                      showToast(t('shop.unlock', { title: buying.title }), 'success')
                    }
                    setBuying(null)
                  }}
                  disabled={state.coins < buying.price}
                  className="flex-1 bg-yellow-400 text-yellow-950 text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-yellow-600 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50"
                >
                  {t('arcade.buy')}
                </button>
                <button
                  onClick={() => setBuying(null)}
                  className="flex-1 bg-slate-300 text-slate-700 text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-slate-400 active:border-b-0 active:translate-y-2 transition-all"
                >
                  {t('arcade.notNow')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && (() => {
        const gm = ARCADE_GAMES.find((g) => g.id === open.id)
        const GameComponent = gm.Component
        return (
          <>
            <GameComponent
              key={open.run}
              highScore={state.arcadeHighScores?.[gm.id] ?? 0}
              onScore={(score) => dispatch({ type: 'ARCADE_SCORE', game: gm.id, score })}
              onRestart={() => hasTime && setOpen((o) => ({ ...o, run: o.run + 1 }))}
              onClose={() => setOpen(null)}
            />
            <PlayClockOverlay msLeft={msLeft} />
          </>
        )
      })()}
    </div>
  )
}
