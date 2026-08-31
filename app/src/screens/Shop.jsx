import { useRef } from 'react'
import { Award, Flag, Zap, Coins, Lock } from 'lucide-react'
import shopItems from '../data/shop.json'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { useToast } from '../App.jsx'

const ICONS = { award: Award, flag: Flag, zap: Zap }
const ICON_COLORS = { award: 'text-blue-500', flag: 'text-purple-500', zap: 'text-yellow-500 fill-current' }

export default function Shop() {
  const { t, name, isHe } = useLang()
  const { state, dispatch } = usePlayer()
  const showToast = useToast()
  const lastBuyRef = useRef(0) // double-tap protection

  const handleBuy = (item) => {
    const now = Date.now()
    if (now - lastBuyRef.current < 800) return
    lastBuyRef.current = now

    if (state.coins >= item.cost) {
      dispatch({ type: 'BUY', item })
      showToast(t('shop.unlock', { title: name(item) }), 'success')
    } else {
      showToast(t('shop.notEnough', { missing: (item.cost - state.coins).toLocaleString() }), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-(--t-panel) p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-wide uppercase drop-shadow-md">{t('shop.title')}</h2>
        <div className="hidden md:flex items-center gap-2 bg-black/20 px-4 py-2 rounded-xl">
          <span className="text-(--t-text-soft) font-bold uppercase text-sm">{t('shop.yourCoins')}</span>
          <span className="text-yellow-400 font-black text-xl">{state.coins.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {shopItems.map((item) => {
          const Icon = ICONS[item.icon]
          const canAfford = state.coins >= item.cost
          return (
            <div key={item.id} className="relative bg-white rounded-3xl border-8 border-slate-200 overflow-hidden shadow-xl flex flex-col group">
              {!canAfford && (
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-[1.25rem]">
                  <div className="bg-red-500 px-4 py-2 rounded-xl border-b-4 border-red-700 rotate-12 flex items-center gap-2 shadow-xl">
                    <Lock className="text-white" size={20} strokeWidth={3} />
                    <span className="font-black text-white uppercase text-lg">{t('shop.locked')}</span>
                  </div>
                </div>
              )}

              <div className={`${item.bgColor} p-2 text-center border-b-4 border-black/10`}>
                <span className="text-white font-black text-sm tracking-widest drop-shadow-md">{t(`rarity.${item.rarity}`)}</span>
              </div>

              <div className="p-6 flex flex-col items-center text-center flex-1 relative bg-gradient-to-b from-slate-50 to-slate-200">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white rounded-full blur-2xl opacity-60"></div>
                <div className="relative z-10 w-24 h-24 bg-white rounded-2xl border-4 border-slate-200 flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Icon className={`${ICON_COLORS[item.icon]} w-16 h-16`} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{isHe ? (item.heType ?? item.type) : item.type}</span>
                <h3 className="text-2xl font-black text-slate-800 uppercase italic leading-tight mb-3">{name(item)}</h3>
                <p className="text-slate-600 font-semibold text-sm leading-snug" dir="rtl">{item.desc}</p>
              </div>

              <div className="p-4 bg-slate-100 border-t-4 border-slate-200 mt-auto">
                <button
                  onClick={() => handleBuy(item)}
                  disabled={!canAfford}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl uppercase tracking-wider font-black text-xl transition-all
                    ${canAfford
                      ? 'bg-yellow-400 text-yellow-950 border-b-4 border-yellow-600 hover:bg-yellow-300 active:border-b-0 active:translate-y-1 shadow-md'
                      : 'bg-slate-300 text-slate-500 border-b-4 border-slate-400 cursor-not-allowed'}`}
                >
                  <Coins className={canAfford ? 'fill-yellow-200' : 'fill-slate-400'} size={24} />
                  {item.cost.toLocaleString()}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
