import { useState } from 'react'
import { Lock, Palette, Car as CarIcon, Trophy } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { EVENTS } from '../data/events.js'
import HeroAvatar from '../components/HeroAvatar.jsx'
import { sfx } from '../match/sounds.js'
import Draw from '../world/Draw.jsx'
import Drive from '../world/Drive.jsx'

// Free-play corner. Drawing is always open; driving is a game, so it waits
// behind the same daily study goal as the arcade.
const ACTIVITIES = [
  { id: 'draw', Icon: Palette, titleKey: 'world.draw', subKey: 'world.drawHe', color: 'bg-amber-400', border: 'border-amber-600', text: 'text-amber-500', light: 'bg-amber-100', gated: false },
  { id: 'drive', Icon: CarIcon, titleKey: 'world.drive', subKey: 'world.driveHe', color: 'bg-sky-500', border: 'border-sky-700', text: 'text-sky-500', light: 'bg-sky-100', gated: true },
]

export default function World() {
  const { state, dispatch, playedToday, config } = usePlayer()
  const { t, dir } = useLang()
  const { theme } = useTheme()
  const [open, setOpen] = useState(null) // { id, run } — run bumps to restart

  const goal = config.dailyGoal
  const doneCount = EVENTS.filter((e) => playedToday(e.id)).length
  const goalDone = Math.min(doneCount, goal)
  const unlocked = doneCount >= goal

  const start = (a) => {
    if (a.gated && !unlocked) return
    sfx.click()
    setOpen({ id: a.id, run: 1 })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <HeroAvatar size="md" />
        <h2 className="flex-1 text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">
          {t('world.title')}
        </h2>
        {theme && <span className="text-3xl">{theme.emoji}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ACTIVITIES.map((a) => {
          const locked = a.gated && !unlocked
          return (
            <div
              key={a.id}
              onClick={() => start(a)}
              className={`relative rounded-3xl border-b-8 shadow-xl transition-all duration-200 overflow-hidden
                ${locked ? 'bg-slate-600 border-slate-800' : `${a.color} ${a.border} cursor-pointer hover:-translate-y-1 active:translate-y-1 active:border-b-0`}`}
            >
              <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-5 flex flex-col items-center text-center gap-2">
                <div className={`p-3 rounded-2xl border-4 -rotate-3 ${locked ? 'bg-slate-200 border-slate-400' : `${a.light} ${a.border}`}`}>
                  <a.Icon className={`w-10 h-10 ${locked ? 'text-slate-400' : a.text}`} />
                </div>
                <h3 className="font-black text-slate-800 uppercase italic text-lg">{t(a.titleKey)}</h3>
                <p className="font-bold text-slate-500 text-sm" dir={dir}>
                  {locked ? t('arcade.lockedShort', { done: goalDone, goal }) : t(a.subKey)}
                </p>
                {locked ? (
                  <Lock className="text-slate-400" size={22} />
                ) : (
                  <span className={`${a.color} text-white font-black italic uppercase text-sm px-5 py-1.5 rounded-xl border-b-4 border-black/30`}>
                    {t('arcade.play')}
                  </span>
                )}
                {a.id === 'drive' && (state.arcadeHighScores?.drive ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-xs font-black text-slate-400 tabular-nums">
                    <Trophy size={12} className="text-yellow-500 fill-yellow-200" /> {state.arcadeHighScores.drive}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {open?.id === 'draw' && <Draw onClose={() => setOpen(null)} />}
      {open?.id === 'drive' && (
        <Drive
          key={open.run}
          highScore={state.arcadeHighScores?.drive ?? 0}
          onScore={(score) => dispatch({ type: 'ARCADE_SCORE', game: 'drive', score })}
          onRestart={() => setOpen((o) => ({ ...o, run: o.run + 1 }))}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
