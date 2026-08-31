import { useEffect, useState } from 'react'
import { Coins, Sparkles } from 'lucide-react'
import { sfx } from './sounds.js'
import { useLang } from '../context/LangContext.jsx'

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  const dist = 70 + (i % 3) * 30
  return {
    id: i,
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist * 0.8 - 40)}px`,
    delay: (i % 5) * 0.06,
  }
})

/**
 * End-of-match vault: dial spins, door swings open, coins burst out and
 * the earned total counts up. LOSS thuds first and only creaks open.
 * Practice mode opens to a blue XP glow instead of gold coins.
 */
export default function VaultReveal({ coins, xp, result, practice, onDone }) {
  const { t } = useLang()
  // spin -> (thud on LOSS) -> open -> count -> done
  const [stage, setStage] = useState('spin')
  const [count, setCount] = useState(0)

  const total = practice ? xp : coins
  const isLoss = result === 'LOSS'
  const opened = stage === 'open' || stage === 'count' || stage === 'done'

  useEffect(() => {
    const t1 = setTimeout(() => setStage(isLoss ? 'thud' : 'open'), 950)
    const t2 = isLoss ? setTimeout(() => setStage('open'), 1750) : null
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2) }
  }, [isLoss])

  useEffect(() => {
    if (stage === 'thud') sfx.thud()
    if (stage !== 'open') return
    sfx.click()
    const t = setTimeout(() => setStage('count'), 450)
    return () => clearTimeout(t)
  }, [stage])

  // count-up ticker
  useEffect(() => {
    if (stage !== 'count') return
    if (total === 0) { setStage('done'); return }
    const step = Math.max(1, Math.ceil(total / 40))
    let tick = 0
    const iv = setInterval(() => {
      if (tick++ % 5 === 0) sfx.coin()
      setCount((c) => {
        const next = c + step
        if (next >= total) { clearInterval(iv); setStage('done'); return total }
        return next
      })
    }, 28)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  useEffect(() => {
    if (stage === 'done' && onDone) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const glowColor = practice ? 'from-blue-300 via-blue-400 to-blue-600' : 'from-yellow-200 via-yellow-400 to-amber-600'

  return (
    <div className="flex flex-col items-center">
      <div className={`relative w-40 h-40 md:w-44 md:h-44 ${stage === 'thud' ? 'anim-vault-thud' : ''}`}>
        {/* vault body */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-500 to-slate-700 border-8 border-slate-800 shadow-2xl"></div>
        {/* corner bolts */}
        {['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((pos) => (
          <div key={pos} className={`absolute ${pos} w-3 h-3 rounded-full bg-slate-300 border-2 border-slate-800`}></div>
        ))}

        {/* interior glow + treasure (revealed when door opens) */}
        {opened && (
          <div className={`absolute inset-3 rounded-2xl bg-gradient-to-br ${glowColor} anim-vault-glow flex items-center justify-center overflow-hidden`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7),transparent_65%)]"></div>
            {practice ? (
              <Sparkles className="w-14 h-14 text-white drop-shadow-lg relative z-10" />
            ) : (
              <div className="relative z-10 flex flex-col items-center">
                <Coins className="w-14 h-14 text-yellow-900 fill-yellow-200 drop-shadow-lg" />
              </div>
            )}
          </div>
        )}

        {/* coin burst */}
        {(stage === 'count' || stage === 'done') && total > 0 && (
          <div className="absolute inset-0 pointer-events-none z-20">
            {BURST.map((p) => (
              <div
                key={p.id}
                className="anim-coin-burst absolute left-1/2 top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full border-2 shadow"
                style={{
                  '--dx': p.dx,
                  '--dy': p.dy,
                  animationDelay: `${p.delay}s`,
                  background: practice ? '#93c5fd' : '#facc15',
                  borderColor: practice ? '#1d4ed8' : '#a16207',
                }}
              ></div>
            ))}
          </div>
        )}

        {/* vault door (circular, swings away when open) */}
        <div className={`absolute inset-3 z-10 ${opened ? 'anim-door-open' : ''}`} style={{ transformOrigin: '100% 50%' }}>
          <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-400 to-slate-600 border-4 border-slate-800 shadow-inner flex items-center justify-center">
            {/* dial */}
            <div className={`w-14 h-14 rounded-full bg-slate-300 border-4 border-slate-700 relative ${stage === 'spin' ? 'anim-dial-spin' : ''}`}>
              {[0, 45, 90, 135].map((deg) => (
                <div
                  key={deg}
                  className="absolute left-1/2 top-1/2 w-1.5 h-12 -ml-[3px] -mt-6 bg-slate-600 rounded"
                  style={{ transform: `rotate(${deg}deg)` }}
                ></div>
              ))}
              <div className="absolute left-1/2 top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full bg-slate-700 border-2 border-slate-900"></div>
            </div>
            {/* handle spokes hint */}
            <div className="absolute bottom-3 w-10 h-2 rounded-full bg-slate-700/60"></div>
          </div>
        </div>
      </div>

      {/* counter */}
      <div className="mt-3 flex items-center gap-2 min-h-12">
        {stage === 'done' || stage === 'count' ? (
          <div className={`flex items-center gap-2 px-5 py-1.5 rounded-2xl border-4 anim-pop ${
            practice ? 'bg-blue-100 border-blue-300' : 'bg-yellow-100 border-yellow-400'
          }`}>
            {practice ? (
              <Sparkles className="text-blue-500" size={24} />
            ) : (
              <Coins className="text-yellow-600 fill-yellow-300" size={24} />
            )}
            <span className={`text-3xl font-black tabular-nums ${practice ? 'text-blue-600' : 'text-yellow-700'}`}>
              {count}
            </span>
            <span className={`text-sm font-black uppercase ${practice ? 'text-blue-400' : 'text-yellow-600'}`}>
              {practice ? t('common.xp') : t('common.coins')}
            </span>
          </div>
        ) : (
          <span className="text-sm font-black text-slate-400 uppercase tracking-widest">
            {isLoss && stage === 'thud' ? t('vault.locked') : t('vault.opening')}
          </span>
        )}
      </div>
    </div>
  )
}
