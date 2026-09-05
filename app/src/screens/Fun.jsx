import { useState } from 'react'
import { Gamepad2, Lock, Trophy, Palette, Car as CarIcon } from 'lucide-react'
import { ARCADE_GAMES, FUN_CATEGORIES } from '../data/arcadeGames.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { sfx } from '../match/sounds.js'
import Avatar from '../avatar/Avatar.jsx'
import Draw from '../world/Draw.jsx'
import Drive from '../world/Drive.jsx'
import { PlayClockChip, PlayClockBanner, PlayClockOverlay, usePlayClockTicker } from '../components/PlayClock.jsx'
import LockedFun from '../components/LockedFun.jsx'

// Everything fun in one place, grouped like the subjects are. Nothing here
// costs coins — the games are earned by learning, and coins stay for the
// real-world shop. Drawing is the one thing that is always open.
export default function Fun({ onGoLearn }) {
  const { state, dispatch, playClock } = usePlayer()
  const { t, name, isHe } = useLang()
  const { theme } = useTheme()
  const [open, setOpen] = useState(null) // { kind: 'draw'|'drive'|'arcade', id, run }
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

  const DRAW_CARD = {
    id: 'draw', kind: 'draw', alwaysOpen: true, Icon: Palette,
    title: t('world.draw'), heTitle: t('world.draw'), he: t('fun.drawFree'),
    color: 'bg-amber-400', borderColor: 'border-amber-600', textColor: 'text-amber-500', lightBg: 'bg-amber-100',
  }
  const DRIVE_CARD = {
    id: 'drive', drive: true, Icon: CarIcon,
    title: t('world.drive'), heTitle: t('world.drive'), he: t('world.driveHe'),
    color: 'bg-sky-500', borderColor: 'border-sky-700', textColor: 'text-sky-500', lightBg: 'bg-sky-100',
  }

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

      <PlayClockBanner msLeft={msLeft} />

      {FUN_CATEGORIES.map((cat) => {
        const inCat = cat.id === 'create'
          ? [DRAW_CARD, DRIVE_CARD]
          : ARCADE_GAMES.filter((g) => g.category === cat.id)
        if (inCat.length === 0) return null
        return (
          <section key={cat.id} className="space-y-3">
            <div className={`flex items-center gap-3 ${cat.color} ${cat.border} px-4 py-2.5 rounded-2xl border-b-8 shadow-lg`}>
              <span className="w-10 h-10 shrink-0 rounded-xl bg-white/25 border-2 border-white/40 flex items-center justify-center text-xl leading-none">
                {cat.emoji}
              </span>
              <span className="flex-1 text-start text-lg lg:text-xl font-black text-white drop-shadow-md">
                {isHe ? cat.he : cat.en}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {inCat.map((gm) => {
                const free = gm.alwaysOpen
                const playable = free || hasTime
                const best = state.arcadeHighScores?.[gm.id] ?? 0
                const Icon = gm.Icon ?? Gamepad2
                return (
                  <div
                    key={gm.id}
                    onClick={() => start(gm.kind ? { kind: gm.kind } : { kind: gm.drive ? 'drive' : 'arcade', id: gm.id, run: 1 })}
                    className={`relative rounded-3xl border-b-8 shadow-xl cursor-pointer transition-all duration-200 overflow-hidden
                      ${playable ? `${gm.color} ${gm.borderColor} hover:-translate-y-1 active:translate-y-1 active:border-b-0` : 'bg-slate-600 border-slate-800'}`}
                  >
                    <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-3 md:p-4 flex flex-col items-center text-center gap-1.5">
                      <div className={`p-2.5 rounded-2xl border-4 -rotate-3 ${playable ? `${gm.lightBg} ${gm.borderColor}` : 'bg-slate-200 border-slate-400'}`}>
                        <Icon className={`w-8 h-8 ${playable ? gm.textColor : 'text-slate-400'}`} />
                      </div>
                      <h3 className="font-black text-slate-800 italic text-sm md:text-base leading-tight">{name(gm)}</h3>
                      <p className="font-bold text-slate-500 text-xs leading-snug" dir="rtl">{gm.he}</p>
                      {playable ? (
                        <span className={`${gm.color} text-white font-black italic text-xs px-4 py-1 rounded-lg border-b-2 border-black/30`}>
                          {t('arcade.play')}
                        </span>
                      ) : (
                        <Lock className="text-slate-400" size={18} />
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
          </section>
        )
      })}

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
