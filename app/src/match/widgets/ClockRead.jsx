import { useMemo, useRef, useState } from 'react'
import { sfx } from '../sounds.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const fmtTime = (h, m) => `${h}:${String(m).padStart(2, '0')}`

function buildOptions(h, m) {
  const opts = new Set([fmtTime(h, m)])
  const candidates = [
    [h % 12 + 1, m], // hour off by one
    [h === 1 ? 12 : h - 1, m],
    [h, (m + 30) % 60], // half-hour off
    [h, (m + 15) % 60],
    [m === 0 ? h : m / 5, m === 0 ? 0 : h * 5 % 60], // swapped-hands feel
  ]
  for (const [ch, cm] of shuffle(candidates)) {
    opts.add(fmtTime(ch, cm))
    if (opts.size === 4) break
  }
  return shuffle([...opts])
}

// Read the analog clock, tap the matching digital time.
export default function ClockRead({ question, disabled, onAnswer }) {
  const { h, m } = question
  const correct = fmtTime(h, m)
  const options = useMemo(() => buildOptions(h, m), [h, m])
  const [tapped, setTapped] = useState(null)
  const lockRef = useRef(false)

  const hourAngle = ((h % 12) + m / 60) * 30
  const minAngle = m * 6

  const tap = (opt) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    setTapped(opt)
    const ok = opt === correct
    if (ok) sfx.click()
    onAnswer(ok, ok ? 500 : 1000)
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* analog clock */}
      <svg viewBox="0 0 120 120" className="w-44 h-44 md:w-52 md:h-52 drop-shadow-lg">
        <circle cx="60" cy="60" r="55" fill="white" stroke="#1e293b" strokeWidth="6" />
        <circle cx="60" cy="60" r="49" fill="none" stroke="#f1f5f9" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = ((i + 1) * 30 * Math.PI) / 180
          const x = 60 + Math.sin(a) * 41
          const y = 60 - Math.cos(a) * 41
          return (
            <text key={i} x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="#334155">
              {i + 1}
            </text>
          )
        })}
        {/* hour hand */}
        <line
          x1="60" y1="60"
          x2={60 + Math.sin((hourAngle * Math.PI) / 180) * 24}
          y2={60 - Math.cos((hourAngle * Math.PI) / 180) * 24}
          stroke="#1e293b" strokeWidth="6" strokeLinecap="round"
        />
        {/* minute hand */}
        <line
          x1="60" y1="60"
          x2={60 + Math.sin((minAngle * Math.PI) / 180) * 36}
          y2={60 - Math.cos((minAngle * Math.PI) / 180) * 36}
          stroke="#f97316" strokeWidth="4" strokeLinecap="round"
        />
        <circle cx="60" cy="60" r="4.5" fill="#1e293b" />
      </svg>

      {/* time options */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm" dir="ltr">
        {options.map((opt) => {
          const hitCorrect = tapped === opt && opt === correct
          const hitWrong = tapped === opt && opt !== correct
          const revealCorrect = tapped && tapped !== correct && opt === correct
          return (
            <button
              key={opt}
              onClick={() => tap(opt)}
              disabled={disabled || tapped !== null}
              className={`py-3 rounded-2xl border-b-4 text-2xl font-black tabular-nums transition-all shadow select-none
                ${hitCorrect
                  ? 'bg-yellow-400 border-yellow-600 text-yellow-900 anim-wave-jump'
                  : hitWrong
                    ? 'bg-red-400 border-red-600 text-white anim-scatter-shake'
                    : revealCorrect
                      ? 'bg-green-400 border-green-600 text-white anim-wobble'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-orange-50 hover:border-orange-300 active:border-b-0 active:translate-y-1'}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
