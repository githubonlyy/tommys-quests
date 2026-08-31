import { useEffect, useRef } from 'react'
import { Timer } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { sfx } from '../match/sounds.js'

export const TICK_MS = 1000
const FLUSH_EVERY = 5 // write the spend to state every 5s, not every tick

export const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Runs the play-time countdown while a timed game is open, and reports what is
 * left. Time is only spent when `running` is true, so browsing costs nothing.
 */
export function usePlayClockTicker(running, msLeft, setMsLeft) {
  const { dispatch, playClock } = usePlayer()

  useEffect(() => {
    if (!running) return
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
  }, [running])

  // stay in sync with the budget whenever no game is running
  useEffect(() => {
    if (!running) setMsLeft(playClock.msLeft)
  }, [running, playClock.msLeft, setMsLeft])
}

/** Timer chip for a screen header. */
export function PlayClockChip({ msLeft }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-b-4 font-black tabular-nums shrink-0
        ${msLeft > 0 ? 'bg-green-500 border-green-700 text-white' : 'bg-black/30 border-black/40 text-(--t-text-soft)'}`}
    >
      <Timer size={18} />
      {mmss(msLeft)}
    </div>
  )
}

/** Explains how much play is left, or how to earn the next session. */
export function PlayClockBanner({ msLeft }) {
  const { playClock, config } = usePlayer()
  const { t } = useLang()
  return (
    <div className="flex items-center gap-3 bg-(--t-panel) p-3 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm" dir="rtl">
      <div className="flex-1">
        <p className="text-white font-black leading-tight">
          {msLeft > 0
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
        {t('fun.sessionLength', { mins: config.playTime.minutesPerSession })}
      </span>
    </div>
  )
}

/** Countdown pinned over a running game; becomes a "finish this round" note. */
export function PlayClockOverlay({ msLeft }) {
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
