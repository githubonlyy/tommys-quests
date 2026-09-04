import { useState } from 'react'
import { Gamepad2, Coins, Lock, Trophy, Palette, Car as CarIcon } from 'lucide-react'
import { ARCADE_GAMES } from '../data/arcadeGames.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useToast } from '../App.jsx'
import { sfx } from '../match/sounds.js'
import Avatar from '../avatar/Avatar.jsx'
import Draw from '../world/Draw.jsx'
import Drive from '../world/Drive.jsx'
import { PlayClockChip, PlayClockBanner, PlayClockOverlay, usePlayClockTicker } from '../components/PlayClock.jsx'
import LockedFun from '../components/LockedFun.jsx'

// Everything fun in one place: drawing is always open, the driving game and
// the arcade games spend the play time he earned by learning.
export default function Fun({ onGoLearn }) {
  const { state, dispatch, playClock } = usePlayer()
  const { t, name } = useLang()
  const { theme } = useTheme()
  const showToast = useToast()
  const [open, setOpen] = useState(null) // { kind: 'draw'|'drive'|'arcade', id, run }
  const [buying, setBuying] = useState(null)
  const [locked, setLocked] = useState(false)
  const [msLeft, setMsLeft] = useState(playClock.msLeft)

  const timed = Boolean(open) && open.kind !== 'draw'
  usePlayClockTicker(timed, msLeft, setMsLeft)
  const hasTime = msLeft > 0

  const start = (next) => {
    if (next.kind !== 'draw' && !hasTime) {
      setLocked(true) // a toast disappeared before it explained anything
      return
    }
    sfx.click()
    setOpen(next)
  }

  const games = [
    { id: 'drive', drive: true, title: t('world.drive'), heTitle: t('world.drive'), he: t('world.driveHe'), price: 0, color: 'bg-sky-500', borderColor: 'border-sky-700', textColor: 'text-sky-500', lightBg: 'bg-sky-100' },
    ...ARCADE_GAMES,
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <Avatar size={64} />
        <h2 className="flex-1 text-2xl lg:text-3xl font-black text-white italic tracking-wide drop-shadow-md">
          {t('nav.fun')}
        </h2>
        {theme && <span className="text-3xl">{theme.emoji}</span>}
        <PlayClockChip msLeft={msLeft} />
      </div>

      {/* drawing — never on the clock */}
      <div
        onClick={() => start({ kind: 'draw' })}
        className="rounded-3xl border-b-8 bg-amber-400 border-amber-600 shadow-xl cursor-pointer hover:-translate-y-1 active:translate-y-1 active:border-b-0 transition-all"
      >
        <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-4 flex items-center gap-4">
          <div className="p-3 rounded-2xl border-4 bg-amber-100 border-amber-600 -rotate-3">
            <Palette className="w-9 h-9 text-amber-500" />
          </div>
          <div className="flex-1" dir="rtl">
            <h3 className="font-black text-slate-800 italic text-lg">{t('world.draw')}</h3>
            <p className="font-bold text-slate-500 text-sm">{t('fun.drawFree')}</p>
          </div>
          <span className="bg-amber-400 text-amber-950 font-black italic px-4 py-1.5 rounded-xl border-b-4 border-amber-600">
            {t('arcade.play')}
          </span>
        </div>
      </div>

      <PlayClockBanner msLeft={msLeft} />

      {/* timed games */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {games.map((gm) => {
          const owned = gm.drive || state.ownedGames.includes(gm.id)
          const best = state.arcadeHighScores?.[gm.id] ?? 0
          const playable = owned && hasTime
          const Icon = gm.drive ? CarIcon : Gamepad2
          return (
            <div
              key={gm.id}
              onClick={() => (owned ? start({ kind: gm.drive ? 'drive' : 'arcade', id: gm.id, run: 1 }) : setBuying(gm))}
              className={`relative rounded-3xl border-b-8 shadow-xl cursor-pointer transition-all duration-200 overflow-hidden
                ${owned && !hasTime ? 'bg-slate-600 border-slate-800' : `${gm.color} ${gm.borderColor} hover:-translate-y-1 active:translate-y-1 active:border-b-0`}`}
            >
              <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-3 md:p-4 flex flex-col items-center text-center gap-1.5">
                <div className={`p-2.5 rounded-2xl border-4 -rotate-3 ${playable ? `${gm.lightBg} ${gm.borderColor}` : 'bg-slate-200 border-slate-400'}`}>
                  <Icon className={`w-8 h-8 ${playable ? gm.textColor : 'text-slate-400'}`} />
                </div>
                <h3 className="font-black text-slate-800 italic text-sm md:text-base leading-tight">{name(gm)}</h3>
                <p className="font-bold text-slate-500 text-xs leading-snug" dir="rtl">{gm.he}</p>
                {owned ? (
                  playable ? (
                    <span className={`${gm.color} text-white font-black italic text-xs px-4 py-1 rounded-lg border-b-2 border-black/30`}>
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
              <h2 className="text-2xl font-black text-white italic drop-shadow-md">{name(buying)}</h2>
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
                      showToast(t('shop.unlock', { title: name(buying) }), 'success')
                    }
                    setBuying(null)
                  }}
                  disabled={state.coins < buying.price}
                  className="flex-1 bg-yellow-400 text-yellow-950 text-lg font-black italic py-3 rounded-2xl border-b-8 border-yellow-600 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50"
                >
                  {t('arcade.buy')}
                </button>
                <button
                  onClick={() => setBuying(null)}
                  className="flex-1 bg-slate-300 text-slate-700 text-lg font-black italic py-3 rounded-2xl border-b-8 border-slate-400 active:border-b-0 active:translate-y-2 transition-all"
                >
                  {t('arcade.notNow')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {locked && <LockedFun onClose={() => setLocked(false)} onGoLearn={() => { setLocked(false); onGoLearn?.() }} />}

      {open?.kind === 'draw' && <Draw onClose={() => setOpen(null)} />}
      {open?.kind === 'drive' && (
        <>
          <Drive
            key={open.run}
            highScore={state.arcadeHighScores?.drive ?? 0}
            onScore={(score) => dispatch({ type: 'ARCADE_SCORE', game: 'drive', score })}
            onRestart={() => hasTime && setOpen((o) => ({ ...o, run: o.run + 1 }))}
            onClose={() => setOpen(null)}
          />
          <PlayClockOverlay msLeft={msLeft} />
        </>
      )}
      {open?.kind === 'arcade' && (() => {
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
