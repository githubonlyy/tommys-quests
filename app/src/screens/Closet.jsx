import { useEffect, useMemo, useRef, useState } from 'react'
import { Coins, Volume2, Check, Lock } from 'lucide-react'
import wardrobe from '../data/wardrobe.json'
import { usePlayer, REQUIRED_SLOTS, getEquipped } from '../context/PlayerContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useToast } from '../App.jsx'
import { speak } from '../match/speak.js'
import { sfx } from '../match/sounds.js'
import Avatar from '../avatar/Avatar.jsx'
import { SLOTS, getItem } from '../avatar/registry.js'

const GREETING = 'בוא נתלבש!'

// Trailing-edge fade on the slot strip: the hint that more tabs are hiding past
// the left (RTL trailing) edge. Removed once the strip is scrolled to the end.
const TAB_FADE = 'linear-gradient(to right, rgba(0,0,0,0.22) 0, rgba(0,0,0,0.6) 14px, #000 34px)'

const RARITY = {
  FREE: { label: 'חינם', cls: 'bg-emerald-500 text-white' },
  RARE: { label: 'נדיר', cls: 'bg-sky-500 text-white' },
  EPIC: { label: 'אפי', cls: 'bg-purple-500 text-white' },
  LEGENDARY: { label: 'אגדי', cls: 'bg-amber-400 text-amber-950' },
}

// How each slot's card preview crops the doll (preview box is 120px tall):
// size = doll height, y = vertical shift so the relevant part is in view.
const PREVIEW = {
  skin: { size: 200, y: 2 },
  hair: { size: 200, y: 2 },
  head: { size: 200, y: 12 },
  outfit: { size: 200, y: -78 },
  shoes: { size: 200, y: -80 },
  hand: { size: 118, y: 0 },
  back: { size: 118, y: 0 },
  pet: { size: 118, y: 0 },
}

// Double-tap guard: returns false when the previous accepted tap was < ms ago.
function acceptTap(ref, ms) {
  const now = Date.now()
  if (now - ref.current < ms) return false
  ref.current = now
  return true
}

// Closet tab: big doll preview + per-slot item grid. Owned items equip on tap,
// unowned ones open a buy confirm (same double-tap guard as the Arcade).
export default function Closet() {
  const { state, dispatch } = usePlayer()
  const { theme } = useTheme()
  const showToast = useToast()
  const [slot, setSlot] = useState('outfit')
  const [showAll, setShowAll] = useState(false)
  const [buying, setBuying] = useState(null)
  const lastTapRef = useRef(0)
  const lastBuyRef = useRef(0)
  const tabsRef = useRef(null)
  const [tabsMore, setTabsMore] = useState(true) // more slot tabs past the edge?

  useEffect(() => {
    speak(GREETING, { delay: 300 })
  }, [])

  // RTL scrollLeft counts down from 0, hence the abs()
  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const sync = () => setTabsMore(el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 4)
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  const themeId = theme.id
  const { owned } = state.avatar
  const equipped = getEquipped(state, themeId) // this world's outfit
  const optional = !REQUIRED_SLOTS.includes(slot)
  const slotMeta = SLOTS.find((s) => s.id === slot)
  const current = getItem(equipped[slot])

  const items = useMemo(
    () =>
      wardrobe
        .filter((i) => i.slot === slot && (showAll || i.theme === 'all' || i.theme === theme.id))
        .sort((a, b) => Number(owned.includes(b.id)) - Number(owned.includes(a.id)) || a.price - b.price),
    [slot, showAll, theme.id, owned],
  )

  // ignore a second tap within 500ms (little fingers double-tap a lot)
  const tapOk = () => acceptTap(lastTapRef, 500)

  const pickSlot = (s) => {
    setSlot(s.id)
    sfx.click()
    speak(s.label)
  }

  const onTapItem = (item) => {
    if (!tapOk()) return
    sfx.click()
    speak(item.name)
    if (!owned.includes(item.id)) {
      setBuying(item)
      return
    }
    if (equipped[slot] !== item.id) dispatch({ type: 'AVATAR_EQUIP', themeId, slot, itemId: item.id })
  }

  const onTapNone = () => {
    if (!tapOk()) return
    sfx.click()
    speak('בלי')
    if (equipped[slot] !== null) dispatch({ type: 'AVATAR_EQUIP', themeId, slot, itemId: null })
  }

  const confirmBuy = () => {
    if (!buying || !acceptTap(lastBuyRef, 800)) return
    if (state.coins >= buying.price) {
      dispatch({ type: 'WARDROBE_BUY', themeId, item: buying })
      sfx.fanfare()
      showToast(`${buying.name} שלך!`, 'success')
    } else {
      sfx.buzz()
      showToast(`חסרים ${(buying.price - state.coins).toLocaleString()} מטבעות`, 'error')
    }
    setBuying(null)
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6" dir="rtl">
      {/* HEADER */}
      <div className="flex items-center gap-3 bg-(--t-panel) p-2.5 sm:p-3 lg:p-4 rounded-2xl border-4 border-(--t-panel-border) backdrop-blur-sm">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white drop-shadow-md flex-1 min-w-0">הארון של מיכאל 👕</h2>
        <button
          onClick={() => speak(GREETING)}
          aria-label="הקראה"
          className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl bg-(--t-accent) text-slate-900 border-b-4 border-(--t-accent-deep) flex items-center justify-center shadow-md active:translate-y-1 active:border-b-0 transition-all"
        >
          <Volume2 size={30} strokeWidth={2.5} />
        </button>
      </div>

      {/* Preview panel first in DOM = top of the page. On phones it is a short
          horizontal strip (small doll + coins beside it) so the item grid she is
          actually shopping in starts near the top of the viewport. From md: it
          moves beside the grid — but the doll only grows to full height at lg:,
          because a 844x390 landscape phone is an md: bottom-nav layout with just
          ~266px of vertical room. */}
      <div className="flex flex-col md:flex-row-reverse gap-3 sm:gap-4 lg:gap-6 items-stretch">
        {/* PREVIEW */}
        <div className="md:w-64 lg:w-72 xl:w-80 shrink-0 bg-(--t-panel) border-4 border-(--t-panel-border) rounded-3xl p-2.5 sm:p-3 lg:p-4 flex flex-row md:flex-col items-center gap-3">
          <div className="relative w-[128px] sm:w-[150px] md:w-full h-[172px] md:h-[min(290px,34vh)] lg:h-auto lg:min-h-[290px] shrink-0 rounded-2xl bg-white/90 border-4 border-(--t-accent) flex items-end justify-center pt-2 lg:pt-4 px-2 overflow-hidden">
            <div className="absolute bottom-3 inset-x-0 mx-auto w-20 sm:w-24 lg:w-40 h-4 lg:h-5 rounded-full bg-slate-400/40 blur-[3px]"></div>
            {/* Avatar caps itself at maxHeight:100%, so the wrapper height is the doll size */}
            <div className="relative h-[150px] md:h-[min(260px,30vh)] lg:h-[260px]">
              <Avatar size={260} />
            </div>
          </div>
          <div className="flex-1 min-w-0 max-w-md flex flex-col gap-2 md:contents">
            <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 sm:px-4 py-2 border-2 border-(--t-panel-border) w-full justify-center">
              <Coins className="text-yellow-400 fill-yellow-200 shrink-0" size={24} />
              <span className="text-yellow-300 font-black text-2xl tabular-nums">{state.coins.toLocaleString()}</span>
              <span className="text-(--t-text-soft) font-bold">מטבעות</span>
            </div>
            <p className="text-(--t-text-soft) font-bold text-sm text-center leading-snug min-h-5">
              {slotMeta.emoji} {slotMeta.label}: <span className="text-white">{current ? current.name : 'בלי'}</span>
            </p>
          </div>
        </div>

        {/* TABS + GRID */}
        <div className="flex-1 min-w-0 space-y-2.5 sm:space-y-3 lg:space-y-4">
          <div
            ref={tabsRef}
            className="flex gap-2 overflow-x-auto py-1.5 px-0.5 -mx-0.5"
            style={tabsMore ? { maskImage: TAB_FADE, WebkitMaskImage: TAB_FADE } : undefined}
          >
            {SLOTS.map((s) => {
              const active = s.id === slot
              return (
                <button
                  key={s.id}
                  onClick={() => pickSlot(s)}
                  aria-pressed={active}
                  className={`shrink-0 min-w-16 h-16 lg:min-w-20 lg:h-20 px-2 rounded-2xl border-b-4 flex flex-col items-center justify-center gap-0.5 font-black transition-all active:translate-y-1 active:border-b-0
                    ${active ? 'bg-(--t-accent) border-(--t-accent-deep) text-slate-900 scale-105 shadow-lg' : 'bg-white/15 border-(--t-panel-border) text-white'}`}
                >
                  <span className="text-2xl lg:text-3xl leading-none">{s.emoji}</span>
                  <span className="text-xs lg:text-sm leading-none">{s.label}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-black text-lg drop-shadow-sm">
              {showAll ? '🌍 כל העולמות' : `${theme.emoji} עולם ${theme.label}`}
            </span>
            <button
              onClick={() => {
                setShowAll((v) => !v)
                sfx.click()
              }}
              aria-pressed={showAll}
              className={`ms-auto min-h-14 px-4 rounded-xl border-b-4 font-black text-sm lg:text-base transition-all active:translate-y-1 active:border-b-0
                ${showAll ? 'bg-yellow-400 border-yellow-600 text-yellow-950' : 'bg-white/15 border-(--t-panel-border) text-white'}`}
            >
              🌍 כל העולמות
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {optional && <NoneCard active={equipped[slot] === null} onTap={onTapNone} />}
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isEquipped={equipped[slot] === item.id}
                isOwned={owned.includes(item.id)}
                canAfford={state.coins >= item.price}
                baseEquipped={equipped}
                onTap={() => onTapItem(item)}
              />
            ))}
          </div>
          {items.length === 0 && (
            <p className="text-(--t-text-soft) font-bold text-center py-6">אין פריטים כאן עדיין — נסה "כל העולמות" 🌍</p>
          )}
        </div>
      </div>

      {/* BUY CONFIRM */}
      {buying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--t-overlay) backdrop-blur-sm p-4">
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm max-h-full overflow-y-auto text-center">
            <div className={`p-4 border-b-8 border-black/10 ${(RARITY[buying.rarity] ?? RARITY.RARE).cls}`}>
              <h2 className="text-2xl font-black drop-shadow-md">{buying.name}</h2>
            </div>
            <div className="p-5 flex flex-col items-center gap-4 bg-slate-50">
              <div className="h-36 flex items-end justify-center">
                <Avatar size={140} equipped={{ ...equipped, [buying.slot]: buying.id }} />
              </div>
              <p className="font-black text-slate-800 text-lg">
                לקנות ב-
                <span className="text-yellow-600 tabular-nums"> {buying.price.toLocaleString()} </span>
                מטבעות?
              </p>
              {state.coins < buying.price && (
                <p className="font-bold text-red-500 text-sm">
                  חסרים {(buying.price - state.coins).toLocaleString()} מטבעות — נמשיך לשחק ולחסוך!
                </p>
              )}
              <div className="flex gap-3 w-full">
                <button
                  onClick={confirmBuy}
                  disabled={state.coins < buying.price}
                  className="flex-1 min-h-16 bg-yellow-400 text-yellow-950 text-xl font-black py-3 rounded-2xl border-b-8 border-yellow-600 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  קונים! 🛍️
                </button>
                <button
                  onClick={() => setBuying(null)}
                  className="flex-1 min-h-16 bg-slate-300 text-slate-700 text-xl font-black py-3 rounded-2xl border-b-8 border-slate-400 active:border-b-0 active:translate-y-2 transition-all"
                >
                  לא עכשיו
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoneCard({ active, onTap }) {
  return (
    <button
      onClick={onTap}
      aria-pressed={active}
      className={`relative flex flex-col items-center justify-center gap-2 min-h-44 bg-white rounded-2xl border-4 shadow-lg transition-transform active:scale-95
        ${active ? 'border-yellow-400 ring-4 ring-yellow-300/60' : 'border-slate-200'}`}
    >
      {active && <EquippedBadge />}
      <span className="text-5xl">🙅‍♀️</span>
      <span className="font-black text-slate-700 text-lg">בלי</span>
    </button>
  )
}

function EquippedBadge() {
  return (
    <span className="absolute top-1.5 end-1.5 z-10 bg-yellow-400 border-2 border-yellow-600 rounded-full p-0.5 shadow">
      <Check size={16} strokeWidth={4} className="text-yellow-950" />
    </span>
  )
}

function ItemCard({ item, isEquipped, isOwned, canAfford, baseEquipped, onTap }) {
  const r = RARITY[item.rarity] ?? RARITY.RARE
  const pv = PREVIEW[item.slot] ?? PREVIEW.hand
  return (
    <button
      onClick={onTap}
      aria-pressed={isEquipped}
      className={`relative flex flex-col bg-white rounded-2xl border-4 overflow-hidden shadow-lg text-start transition-transform active:scale-95
        ${isEquipped ? 'border-yellow-400 ring-4 ring-yellow-300/60' : isOwned ? 'border-slate-200' : 'border-slate-300'}`}
    >
      <span className={`absolute top-0 start-0 z-10 px-2 py-0.5 rounded-ee-xl text-[11px] font-black ${r.cls}`}>{r.label}</span>
      {isEquipped && <EquippedBadge />}

      <div className="h-30 w-full overflow-hidden flex justify-center bg-gradient-to-b from-slate-50 to-slate-200">
        <div className="shrink-0" style={{ height: pv.size, transform: `translateY(${pv.y}px)` }}>
          <Avatar size={pv.size} equipped={{ ...baseEquipped, [item.slot]: item.id }} />
        </div>
      </div>

      <div className="p-2 lg:p-2.5 flex flex-col gap-1.5 flex-1 bg-slate-50 border-t-4 border-slate-100">
        <span className="font-black text-slate-800 text-sm lg:text-base leading-tight">{item.name}</span>
        {isEquipped ? (
          <span className="mt-auto self-start flex items-center gap-1 text-sm font-black text-yellow-800 bg-yellow-200 border-2 border-yellow-400 rounded-lg px-2 py-0.5">
            <Check size={14} strokeWidth={4} /> לבוש
          </span>
        ) : isOwned ? (
          <span className="mt-auto self-start flex items-center gap-1 text-sm font-black text-emerald-800 bg-emerald-100 border-2 border-emerald-300 rounded-lg px-2 py-0.5">
            <Check size={14} strokeWidth={4} /> יש לי
          </span>
        ) : (
          <span
            className={`mt-auto self-start flex items-center gap-1.5 text-sm font-black rounded-lg px-2.5 py-1 border-b-4
              ${canAfford ? 'bg-yellow-400 border-yellow-600 text-yellow-950' : 'bg-slate-200 border-slate-400 text-slate-500'}`}
          >
            {canAfford ? <Coins size={15} className="fill-current" /> : <Lock size={14} strokeWidth={3} />}
            <span className="tabular-nums">{item.price.toLocaleString()}</span>
          </span>
        )}
      </div>
    </button>
  )
}
