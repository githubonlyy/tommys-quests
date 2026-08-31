import { useEffect } from 'react'
import { THEMES, THEME_IDS } from '../data/themes.js'
import { useTheme } from '../context/ThemeContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import HeroAvatar from '../components/HeroAvatar.jsx'
import { speak } from '../match/speak.js'
import { sfx } from '../match/sounds.js'

/**
 * Full-screen gate shown on every launch: one big card per world. The last
 * pick gets a ribbon so the same world is one tap away.
 */
export default function ThemePicker() {
  const { setTheme, lastTheme } = useTheme()
  const { t, dir, isHe, toggleLang } = useLang()
  const { state } = usePlayer()

  const prompt = t('theme.choose')

  useEffect(() => {
    // may be blocked before the first gesture on some browsers — harmless
    if (isHe) speak(prompt, { delay: 400 })
  }, [prompt, isHe])

  const pick = (id) => {
    sfx.fanfare()
    if (isHe) speak(`${THEMES[id].label}! יאללה!`)
    setTheme(id)
  }

  return (
    <div
      dir={dir}
      className="relative h-dvh w-full flex flex-col items-center justify-center gap-4 md:gap-8 p-3 md:p-8 font-sans overflow-y-auto"
      style={{ backgroundImage: 'radial-gradient(circle at center, #2563eb 0%, #1e1b4b 100%)' }}
    >
      <button
        onClick={toggleLang}
        className="absolute top-3 end-3 min-h-11 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white font-black text-sm uppercase tracking-wider border-b-4 border-black/30 active:border-b-0 active:translate-y-1 transition-all"
      >
        {t('header.lang')}
      </button>

      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white italic drop-shadow-[0_4px_0_rgba(0,0,0,0.25)] leading-tight">
          TOMMY'S <span className="text-yellow-400">QUESTS</span>
        </h1>
        <button
          onClick={() => speak(prompt)}
          className="mt-2 md:mt-3 min-h-11 inline-flex items-center gap-2 text-base sm:text-xl md:text-2xl font-black text-blue-950 bg-white/80 px-4 sm:px-5 py-2 rounded-full border-b-4 border-blue-300 active:border-b-0 active:translate-y-1 transition-all"
        >
          🔊 {prompt}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6 w-full max-w-5xl">
        {THEME_IDS.map((id) => {
          const th = THEMES[id]
          const isLast = id === lastTheme
          return (
            <button
              key={id}
              onClick={() => pick(id)}
              style={{ ...th.vars, backgroundImage: 'linear-gradient(160deg, var(--t-bg-from), var(--t-bg-to))' }}
              className="group relative rounded-[2rem] border-b-[10px] border-black/25 shadow-2xl p-1.5 hover:-translate-y-2 active:translate-y-2 active:border-b-0 transition-all duration-200"
            >
              {isLast && (
                <span className="absolute -top-3 inset-x-0 mx-auto w-fit bg-yellow-400 text-yellow-900 font-black text-[10px] md:text-xs px-2.5 py-1 rounded-full border-2 border-yellow-600 shadow z-10 whitespace-nowrap">
                  ⭐ {t('theme.last')}
                </span>
              )}
              <div className="bg-white/90 rounded-[1.6rem] flex flex-col items-center gap-1.5 md:gap-2.5 py-4 md:py-6 px-3">
                {/* his hero stands in the world he is about to enter */}
                <div className="relative flex items-center justify-center group-hover:scale-105 transition-transform">
                  <HeroAvatar size="lg" className="anim-float-bob" />
                  <span className="absolute -top-2 -end-3 text-3xl md:text-4xl drop-shadow-md">{th.emoji}</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-slate-800">{isHe ? th.label : th.en}</span>
                <span className="text-xs md:text-sm font-bold text-slate-500 leading-tight">
                  {isHe ? th.subtitle : th.enSubtitle}
                </span>
                <span className="flex gap-1 text-base md:text-lg mt-0.5">
                  {th.particles.slice(0, 4).map((p, i) => (
                    <span key={i}>{p}</span>
                  ))}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
