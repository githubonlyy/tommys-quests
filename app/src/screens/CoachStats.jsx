import { useMemo, useState } from 'react'
import { BarChart3, Lock, Trophy, Zap, ShoppingBag, KeyRound, Delete, Timer, Plus, Square } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useToast } from '../App.jsx'

export default function CoachStats() {
  const { state, config } = usePlayer()
  const [unlocked, setUnlocked] = useState(false)

  if (!unlocked) return <PinGate pin={state.pin} config={config} onUnlock={() => setUnlocked(true)} />
  return <Dashboard />
}

/* ---------- PIN GATE ---------- */

function PinGate({ pin, config, onUnlock }) {
  const { t } = useLang()
  const [entry, setEntry] = useState('')
  const [tries, setTries] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [, forceTick] = useState(0)

  const now = Date.now()
  const locked = now < lockedUntil
  const lockedSecs = Math.ceil((lockedUntil - now) / 1000)

  const press = (d) => {
    if (locked || entry.length >= 4) return
    const next = entry + d
    setEntry(next)
    if (next.length === 4) {
      if (next === pin) {
        onUnlock()
      } else {
        const nextTries = tries + 1
        setTries(nextTries)
        setEntry('')
        if (nextTries >= config.pinLockoutTries) {
          const until = Date.now() + config.pinLockoutSec * 1000
          setLockedUntil(until)
          setTries(0)
          const iv = setInterval(() => {
            forceTick((t) => t + 1)
            if (Date.now() >= until) clearInterval(iv)
          }, 1000)
        }
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="bg-white rounded-3xl border-8 border-slate-800 shadow-2xl p-8 flex flex-col items-center w-full max-w-sm">
        <div className="bg-slate-800 p-4 rounded-2xl border-b-4 border-slate-950 mb-4 -rotate-3">
          <Lock className="text-white w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase italic mb-1">{t('coach.only')}</h2>
        <p className="font-bold text-slate-500 mb-6" dir="rtl">{t('coach.enterPin')}</p>

        <div className="flex gap-3 mb-6" dir="ltr">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-12 h-14 rounded-xl border-4 flex items-center justify-center text-3xl font-black ${
                entry.length > i ? 'bg-slate-800 border-slate-900 text-white' : 'bg-slate-100 border-slate-200 text-slate-300'
              }`}
            >
              {entry.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {locked ? (
          <p className="font-black text-red-500 text-lg mb-4" dir="rtl">{t('coach.lockedFor', { secs: lockedSecs })}</p>
        ) : tries > 0 ? (
          <p className="font-black text-red-500 mb-4" dir="rtl">{t('coach.wrongPin', { tries, max: config.pinLockoutTries })}</p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 w-full" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              disabled={locked}
              className="bg-slate-100 text-slate-800 text-2xl font-black py-3 rounded-xl border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-40"
            >
              {k}
            </button>
          ))}
          <div></div>
          <button
            onClick={() => press('0')}
            disabled={locked}
            className="bg-slate-100 text-slate-800 text-2xl font-black py-3 rounded-xl border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={() => setEntry(entry.slice(0, -1))}
            disabled={locked}
            className="bg-red-400 text-white py-3 rounded-xl border-b-4 border-red-600 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center disabled:opacity-40"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- DASHBOARD ---------- */

function Dashboard() {
  const { t } = useLang()
  const { state, dispatch, playClock } = usePlayer()
  const showToast = useToast()
  const [newPin, setNewPin] = useState('')

  const stats = useMemo(() => {
    const paid = state.battleLog.filter((l) => !l.practice)
    const wins = paid.filter((l) => l.result === 'WIN').length
    const winRate = paid.length ? Math.round((wins / paid.length) * 100) : 0
    const avgTime = state.battleLog.length
      ? Math.round((state.battleLog.reduce((s, l) => s + (l.avgTimeSec || 0), 0) / state.battleLog.length) * 10) / 10
      : 0

    const bySubject = {}
    for (const l of state.battleLog) {
      bySubject[l.subject] ??= { correct: 0, total: 0 }
      bySubject[l.subject].correct += l.correct
      bySubject[l.subject].total += l.total ?? 10
    }
    return { winRate, avgTime, wins, bySubject }
  }, [state.battleLog])

  const changePin = () => {
    if (!/^\d{4}$/.test(newPin)) {
      showToast(t('coach.pinInvalid'), 'error')
      return
    }
    dispatch({ type: 'SET_PIN', pin: newPin })
    setNewPin('')
    showToast(t('coach.pinSaved'), 'success')
  }

  return (
    <div className="space-y-6 anim-fade-in">
      <div className="flex justify-between items-center bg-slate-800 p-4 rounded-2xl border-4 border-slate-900 shadow-xl">
        <h2 className="text-2xl md:text-3xl font-black text-white uppercase drop-shadow-md flex items-center gap-3">
          <BarChart3 className="text-blue-400" size={32} />
          {t('coach.title')}
        </h2>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label={t('coach.winRate')} value={`${stats.winRate}%`} icon={<div className="w-12 h-12 rounded-full border-8 border-slate-100 border-t-green-500 border-r-green-500 rotate-45"></div>} />
        <MetricCard label={t('coach.avgTime')} value={`${stats.avgTime}s`} icon={<Zap className="text-yellow-400 fill-yellow-200 h-10 w-10" />} />
        <MetricCard label={t('coach.totalWins')} value={stats.wins} icon={<Trophy className="text-blue-500 fill-blue-200 h-10 w-10" />} />
      </div>

      {/* PER-SUBJECT ACCURACY */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl shadow-lg p-6">
        <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide mb-4">{t('coach.accuracy')}</h3>
        {Object.keys(stats.bySubject).length === 0 ? (
          <p className="font-bold text-slate-400" dir="rtl">{t('coach.noMatches')}</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(stats.bySubject).map(([subject, s]) => {
              const pct = Math.round((s.correct / s.total) * 100)
              return (
                <div key={subject}>
                  <div className="flex justify-between font-black text-sm text-slate-600 uppercase mb-1">
                    <span>{subject}</span>
                    <span>{pct}% ({s.correct}/{s.total})</span>
                  </div>
                  <div className="h-4 bg-slate-100 rounded-full border-2 border-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* BATTLE LOG */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl overflow-hidden shadow-lg">
        <div className="bg-slate-100 px-6 py-4 border-b-4 border-slate-200">
          <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide">{t('coach.battleLog')}</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-start border-collapse">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <Th>{t('coach.time')}</Th><Th>{t('coach.event')}</Th><Th>{t('coach.result')}</Th><Th>{t('coach.score')}</Th><Th>{t('common.coins')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 font-bold">
              {state.battleLog.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold text-center">{t('coach.noMatches')}</td></tr>
              )}
              {state.battleLog.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(log.ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-3 text-slate-800 uppercase italic whitespace-nowrap">
                    {log.subject}
                    {log.practice && <span className="ms-2 text-xs bg-blue-100 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 not-italic">PRACTICE</span>}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-3 py-1 rounded-lg text-sm font-black uppercase ${
                      log.result === 'LOSS' ? 'bg-red-100 text-red-600 border-2 border-red-200'
                      : log.result === 'DRAW' ? 'bg-slate-200 text-slate-600 border-2 border-slate-300'
                      : 'bg-green-100 text-green-600 border-2 border-green-200'
                    }`}>
                      {t(`log.${log.result}`)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600 tabular-nums">{log.correct}/{log.total ?? 10}</td>
                  <td className={`px-6 py-3 font-black ${log.coins > 0 ? 'text-green-500' : 'text-slate-400'}`}>
                    {log.coins > 0 ? `+${log.coins}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PURCHASES */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl shadow-lg p-6">
        <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
          <ShoppingBag size={20} /> {t('coach.purchases')}
        </h3>
        {state.purchases.length === 0 ? (
          <p className="font-bold text-slate-400">{t('coach.noPurchases')}</p>
        ) : (
          <ul className="space-y-2">
            {state.purchases.map((p) => (
              <li key={p.id} className="flex justify-between items-center bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700">
                <span>{p.title}</span>
                <span className="text-sm text-slate-400">
                  {new Date(p.ts).toLocaleDateString('he-IL')} · {p.cost.toLocaleString()} coins
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PLAY TIME — parent override */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl shadow-lg p-6">
        <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Timer size={20} /> {t('coach.playTime')}
        </h3>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 border-2 border-slate-200 font-black text-slate-700 tabular-nums">
            {t('coach.playLeft')}: {Math.ceil(playClock.msLeft / 60000)}′
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 border-2 border-slate-200 font-bold text-slate-500 tabular-nums">
            {t('coach.playEarned', { n: playClock.earnedSessions, max: playClock.maxSessions })}
          </span>
          {playClock.bonusMs > 0 && (
            <span className="px-3 py-1.5 rounded-xl bg-green-100 border-2 border-green-300 font-black text-green-700 tabular-nums">
              {t('coach.playBonus', { mins: Math.round(playClock.bonusMs / 60000) })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {[5, 15, 30].map((mins) => (
            <button
              key={mins}
              onClick={() => {
                dispatch({ type: 'PLAY_TIME_GRANT', ms: mins * 60000 })
                showToast(t('coach.playGranted', { mins }), 'success')
              }}
              className="flex items-center gap-1 bg-green-500 text-white font-black uppercase px-4 py-2.5 rounded-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all"
            >
              <Plus size={16} strokeWidth={3} /> {mins}′
            </button>
          ))}
          <button
            onClick={() => {
              dispatch({ type: 'PLAY_TIME_END', msLeft: playClock.msLeft })
              showToast(t('coach.playEnded'), 'success')
            }}
            disabled={playClock.msLeft <= 0}
            className="flex items-center gap-1 bg-slate-700 text-white font-black uppercase px-4 py-2.5 rounded-xl border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-40"
          >
            <Square size={14} strokeWidth={3} /> {t('coach.playEnd')}
          </button>
        </div>
        <p className="text-xs font-bold text-slate-400 mt-3" dir="rtl">{t('coach.playHint')}</p>
      </div>

      {/* CHANGE PIN */}
      <div className="bg-white border-4 border-slate-200 rounded-3xl shadow-lg p-6">
        <h3 className="text-lg font-black text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
          <KeyRound size={20} /> {t('coach.changePin')}
        </h3>
        <div className="flex gap-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder={t('coach.newPin')}
            className="flex-1 bg-slate-100 border-4 border-slate-200 rounded-xl px-4 py-2 font-black text-xl tracking-widest focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={changePin}
            className="bg-slate-800 text-white font-black uppercase px-6 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all"
          >
            {t('coach.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon }) {
  return (
    <div className="bg-white border-4 border-slate-200 p-6 rounded-3xl shadow-lg flex flex-col">
      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-end justify-between mt-auto">
        <p className="text-4xl text-slate-800 font-black italic">{value}</p>
        {icon}
      </div>
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider border-b-2 border-slate-200">
      {children}
    </th>
  )
}
