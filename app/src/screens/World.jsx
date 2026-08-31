import { useState } from 'react'
import { Lock, Palette, Car as CarIcon, Trophy } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { sfx } from '../match/sounds.js'
import Avatar from '../avatar/Avatar.jsx'
import Draw from '../world/Draw.jsx'
import Drive from '../world/Drive.jsx'
import { PlayClockChip, PlayClockBanner, PlayClockOverlay, usePlayClockTicker } from '../components/PlayClock.jsx'

// His world: drawing is always open because it is creative, driving is a game
// and spends the play time he earned.
export default function World() {
  const { state, dispatch, playClock } = usePlayer()
  const { t } = useLang()
  const { theme } = useTheme()
  const [open, setOpen] = useState(null) // { id, run }
  const [msLeft, setMsLeft] = useState(playClock.msLeft)

  usePlayClockTicker(open?.id === 'drive', msLeft, setMsLeft)
  const hasTime = msLeft > 0

  const startDrive = () => {
    if (!hasTime) return
    sfx.click()
    setOpen({ id: 'drive', run: 1 })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <Avatar size={64} />
        <h2 className="flex-1 text-2xl lg:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">
          {t('world.title')}
        </h2>
        {theme && <span className="text-3xl">{theme.emoji}</span>}
        <PlayClockChip msLeft={msLeft} />
      </div>

      {/* drawing — no clock */}
      <div
        onClick={() => { sfx.click(); setOpen({ id: 'draw' }) }}
        className="rounded-3xl border-b-8 bg-amber-400 border-amber-600 shadow-xl cursor-pointer hover:-translate-y-1 active:translate-y-1 active:border-b-0 transition-all"
      >
        <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-4 flex items-center gap-4">
          <div className="p-3 rounded-2xl border-4 bg-amber-100 border-amber-600 -rotate-3">
            <Palette className="w-9 h-9 text-amber-500" />
          </div>
          <div className="flex-1" dir="rtl">
            <h3 className="font-black text-slate-800 uppercase italic text-lg">{t('world.draw')}</h3>
            <p className="font-bold text-slate-500 text-sm">{t('fun.drawFree')}</p>
          </div>
          <span className="bg-amber-400 text-amber-950 font-black italic uppercase text-sm px-4 py-1.5 rounded-xl border-b-4 border-amber-600">
            {t('arcade.play')}
          </span>
        </div>
      </div>

      {/* driving — spends play time */}
      <div
        onClick={startDrive}
        className={`rounded-3xl border-b-8 shadow-xl transition-all
          ${hasTime ? 'bg-sky-500 border-sky-700 cursor-pointer hover:-translate-y-1 active:translate-y-1 active:border-b-0' : 'bg-slate-600 border-slate-800'}`}
      >
        <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-4 flex items-center gap-4">
          <div className={`p-3 rounded-2xl border-4 -rotate-3 ${hasTime ? 'bg-sky-100 border-sky-700' : 'bg-slate-200 border-slate-400'}`}>
            <CarIcon className={`w-9 h-9 ${hasTime ? 'text-sky-500' : 'text-slate-400'}`} />
          </div>
          <div className="flex-1" dir="rtl">
            <h3 className="font-black text-slate-800 uppercase italic text-lg">{t('world.drive')}</h3>
            <p className="font-bold text-slate-500 text-sm">
              {hasTime ? t('world.driveHe') : t('fun.needMore', { n: playClock.matchesToNext })}
            </p>
          </div>
          {hasTime ? (
            <span className="bg-sky-500 text-white font-black italic uppercase text-sm px-4 py-1.5 rounded-xl border-b-4 border-sky-700">
              {t('arcade.play')}
            </span>
          ) : (
            <Lock className="text-slate-400 shrink-0" size={22} />
          )}
          {(state.arcadeHighScores?.drive ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs font-black text-slate-400 tabular-nums shrink-0">
              <Trophy size={12} className="text-yellow-500 fill-yellow-200" /> {state.arcadeHighScores.drive}
            </span>
          )}
        </div>
      </div>

      <PlayClockBanner msLeft={msLeft} />

      {open?.id === 'draw' && <Draw onClose={() => setOpen(null)} />}
      {open?.id === 'drive' && (
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
    </div>
  )
}
