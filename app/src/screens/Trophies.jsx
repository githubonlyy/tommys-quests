import { Trophy, Target, Flame, Crown, Calculator, MessageCircle, BookOpen, Map as MapIcon, Coins, ShoppingBag, Gift, Lock } from 'lucide-react'
import { TROPHIES } from '../data/trophies.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'

const ICONS = {
  trophy: Trophy,
  target: Target,
  flame: Flame,
  crown: Crown,
  calculator: Calculator,
  message: MessageCircle,
  book: BookOpen,
  map: MapIcon,
  coins: Coins,
  bag: ShoppingBag,
  gift: Gift,
}

export default function Trophies() {
  const { t, name } = useLang()
  const { state } = usePlayer()
  const earnedCount = Object.keys(state.trophies).length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">{t('trophies.title')}</h2>
        <div className="px-3 py-1.5 bg-yellow-400 text-yellow-900 rounded-xl border-b-4 border-yellow-600 font-black text-sm uppercase tabular-nums">
          {earnedCount}/{TROPHIES.length}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {TROPHIES.map((t) => {
          const earnedTs = state.trophies[t.id]
          const Icon = ICONS[t.icon] ?? Trophy
          return (
            <div
              key={t.id}
              className={`rounded-3xl border-4 p-4 flex flex-col items-center text-center gap-2 shadow-lg transition-transform
                ${earnedTs
                  ? 'bg-white border-yellow-400 hover:scale-105'
                  : 'bg-(--t-panel) border-(--t-panel-border) backdrop-blur-sm'}`}
            >
              <div
                className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center -rotate-3 relative
                  ${earnedTs
                    ? 'bg-gradient-to-br from-yellow-300 to-amber-500 border-yellow-600 shadow-md'
                    : 'bg-(--t-side-deep) border-(--t-panel-border)'}`}
              >
                <Icon className={earnedTs ? 'text-yellow-900 w-8 h-8' : 'text-blue-700 w-8 h-8'} />
                {!earnedTs && (
                  <span className="absolute -bottom-2 -right-2 bg-slate-700 rounded-full p-1 border-2 border-slate-900">
                    <Lock size={12} className="text-slate-300" />
                  </span>
                )}
              </div>
              <span className={`font-black uppercase italic leading-tight ${earnedTs ? 'text-slate-800' : 'text-blue-300'}`}>
                {name(t)}
              </span>
              <span className={`text-xs font-bold leading-snug ${earnedTs ? 'text-slate-500' : 'text-blue-400'}`} dir="rtl">
                {t.he}
              </span>
              {earnedTs && (
                <span className="text-[10px] font-black text-yellow-600 uppercase tracking-wider">
                  {new Date(earnedTs).toLocaleDateString('he-IL')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
