import { useEffect, useRef, useState } from 'react'
import { Gamepad2, Coins, Lock, Trophy, Timer, Palette, Car as CarIcon } from 'lucide-react'
import { ARCADE_GAMES } from '../data/arcadeGames.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useToast } from '../App.jsx'
import { sfx } from '../match/sounds.js'
import HeroAvatar from '../components/HeroAvatar.jsx'
import Draw from '../world/Draw.jsx'
import Drive from '../world/Drive.jsx'

const TICK_MS = 1000
const FLUSH_EVERY = 5 // write the spend to state every 5s, not every tick

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The fun half of the app: arcade games and the driving game share an earned
 * play-time budget, drawing is always free. Time only ticks while a game is
 * actually open, and a round that is already running is never cut short.
 */
export default function Fun() {
  const { state, dispatch, playClock, config } = usePlayer()
  const { t } = useLang()
  const showToast = useToast()
  const [open, setOpen] = useState(null) // { kind: 'arcade'|'drive'|'draw', id, run }
  const [buying, setBuying] = useState(null)
  const [msLeft, setMsLeft] = useState(playClock.msLeft)

  const timed = open && open.kind !== 'draw'

  // the clock only runs while a timed game is on screen
  useEffect(() => {
    if (!timed) return
    setMsLeft(playClock.msLeft)
    let ticks = 0
    const iv = setInterval(() => {
      ticks += 1
      setMsLeft((m) => Math.max(0, m - TICK_MS))
      if (ticks % FLUSH_EVERY === 0) dispatch({ type: 'PLAY_TIME_SPEND', ms: TICK_MS * FLUSH_EVERY })
    }, TICK_MS)
    return () => {
      clearInterval(iv)
      const unflushed = (ticks % FLUSH_EVERY) * TICK_MS
      if (unflushed > 0) dispatch({ type: 'PLAY_TIME_SPEND', ms: unflushed })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, open?.id, open?.run])

  useEffect(() => {
    if (!timed) setMsLeft(playClock.msLeft)
  }, [timed, playClock.msLeft])

  const hasTime = msLeft > 0
  const openGame = (next) => {
    if (next.kind !== 'draw' && !hasTime) {
      showToast(t('fun.needMore', { n: playClock.matchesToNext }), 'error')
      return
    }
    sfx.click()
    setOpen(next)
  }

  const minutes = config.playTime.minutesPerSession

  return (
    <div className="space-y-5">
      {/* header + play clock */}
      <div className="flex items-center gap-3 bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <HeroAvatar size="md" />
        <h2 className="flex-1 text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">
          {t('nav.fun')}
        </h2>
        <div
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-b-4 font-black tabular-nums shrink-0
            ${hasTime ? 'bg-green-500 border-green-700 text-white' : 'bg-black/30 border-black/40 text-(--t-text-soft)'}`}
        >
          <Timer size={18} />
          {mmss(msLeft)}
        </div>
      </div>

      {/* how to earn more */}
      <div className="flex items-center gap-3 bg-(--t-panel) p-3 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm" dir="rtl">
        <div className="flex-1">
          <p className="text-white font-black leading-tight">
            {hasTime
              ? t('fun.playing', { mins: Math.ceil(msLeft / 60000) })
              : playClock.cappedOut
                ? t('fun.cappedOut')
                : t('fun.needMore', { n: playClock.matchesToNext })}
          </p>
          <div className="flex gap-1.5 mt-1.5" dir="ltr">
            {Array.from({ length: playClock.maxSessions }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 flex-1 max-w-20 rounded-full ${i < playClock.earnedSessions ? 'bg-green-400' : 'bg-black/30'}`}
              ></span>
            ))}
          </div>
        </div>
        <span className="text-(--t-text-soft) font-bold text-sm whitespace-nowrap">
          {t('fun.sessionLength', { mins: minutes })}
        </span>
      </div>

      {/* drawing — always open, no clock */}
      <div
        onClick={() => openGame({ kind: 'draw' })}
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

      {/* timed games */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {[...ARCADE_GAMES, { id: 'drive', drive: true, title: 'Drive', he: t('world.driveHe'), price: 0, color: 'bg-sky-500', borderColor: 'border-sky-700', textColor: 'text-sky-500', lightBg: 'bg-sky-100' }].map((gm) => {
          const owned = gm.drive || state.ownedGames.includes(gm.id)
          const best = state.arcadeHighScores?.[gm.id] ?? 0
          const playable = owned && hasTime
          const Icon = gm.drive ? CarIcon : Gamepad2
          return (
            <div
              key={gm.id}
              onClick={() => {
                if (playable) openGame({ kind: gm.drive ? 'drive' : 'arcade', id: gm.id, run: 1 })
                else if (owned) openGame({ kind: 'arcade' }) // surfaces the "earn more" toast
                else setBuying(gm)
              }}
              className={`relative rounded-3xl border-b-8 shadow-xl cursor-pointer transition-all duration-200 overflow-hidden
                ${owned && !hasTime ? 'bg-slate-600 border-slate-800' : `${gm.color} ${gm.borderColor} hover:-translate-y-1 active:translate-y-1 active:border-b-0`}`}
            >
              <div className="bg-white/95 m-1.5 rounded-[1.25rem] p-3 md:p-4 flex flex-col items-center text-center gap-1.5">
                <div className={`p-2.5 rounded-2xl border-4 -rotate-3 ${playable ? `${gm.lightBg} ${gm.borderColor}` : 'bg-slate-200 border-slate-400'}`}>
                  <Icon className={`w-8 h-8 ${playable ? gm.textColor : 'text-slate-400'}`} />
                </div>
                <h3 className="font-black text-slate-800 uppercase italic text-sm md:text-base leading-tight">{gm.title}</h3>
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

      {/* buy a locked arcade game */}
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

      {/* the running activity */}
      {open?.kind === 'draw' && <Draw onClose={() => setOpen(null)} />}
      {open?.kind === 'drive' && (
        <Drive
          key={open.run}
          highScore={state.arcadeHighScores?.drive ?? 0}
          onScore={(score) => dispatch({ type: 'ARCADE_SCORE', game: 'drive', score })}
          onRestart={() => hasTime && setOpen((o) => ({ ...o, run: o.run + 1 }))}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'arcade' && open.id && (() => {
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
      {open?.kind === 'drive' && <PlayClockOverlay msLeft={msLeft} />}
    </div>
  )
}

// countdown pinned over a running game; turns into a "finish this round" note
function PlayClockOverlay({ msLeft }) {
  const { t } = useLang()
  const warn = msLeft <= 60000
  const over = msLeft <= 0
  const announced = useRef(false)

  useEffect(() => {
    if (over && !announced.current) {
      announced.current = true
      sfx.thud()
    }
  }, [over])

  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-[60] px-3 py-1.5 rounded-xl border-b-4 font-black tabular-nums text-sm shadow-lg pointer-events-none
        ${over ? 'bg-red-500 border-red-700 text-white' : warn ? 'bg-orange-500 border-orange-700 text-white' : 'bg-black/50 border-black/60 text-white'}`}
    >
      {over ? t('fun.finishRound') : mmss(msLeft)}
    </div>
  )
}
