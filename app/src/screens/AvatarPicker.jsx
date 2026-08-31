import { useState } from 'react'
import { X, Lock, Check, Coins } from 'lucide-react'
import { AVATARS, FRAMES, frameById } from '../data/avatars.js'
import { GEAR_SLOTS, gearInSlot, isGearLocked } from '../data/gear.js'
import HeroAvatar from '../components/HeroAvatar.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import { sfx } from '../match/sounds.js'

// Pick character, frame and gear, and edit the display name. Characters and
// frames unlock by level; gear is bought with coins (a few are level-earned).
export default function AvatarPicker({ onClose }) {
  const { t } = useLang()
  const { state, dispatch } = usePlayer()
  const [name, setName] = useState(state.avatar.name)
  const level = state.level

  const choose = (patch) => {
    sfx.click()
    dispatch({ type: 'SET_AVATAR', avatar: patch })
  }
  const saveName = () => {
    const clean = name.trim().slice(0, 12).toUpperCase()
    if (clean) dispatch({ type: 'SET_AVATAR', avatar: { name: clean } })
  }

  const frame = frameById(state.avatar.frameId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 backdrop-blur-sm p-4">
      <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="p-4 bg-gradient-to-br from-blue-400 to-blue-600 border-b-8 border-black/10 flex items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl border-4 flex items-center justify-center text-3xl shadow-lg ${frame.classes}`}>
            {AVATARS.find((a) => a.id === state.avatar.avatarId)?.emoji}
          </div>
          <h2 className="flex-1 text-2xl font-black text-white uppercase italic drop-shadow-md">{t('avatar.title')}</h2>
          <button onClick={onClose} className="w-10 h-10 bg-black/20 hover:bg-black/30 text-white rounded-full flex items-center justify-center">
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        <div className="p-5 bg-slate-50 overflow-y-auto space-y-5">
          {/* name */}
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider">{t('avatar.name')}</label>
            <div className="flex gap-2 mt-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                maxLength={12}
                className="flex-1 bg-white border-4 border-slate-200 rounded-xl px-4 py-2 font-black text-xl uppercase tracking-wide focus:outline-none focus:border-blue-400"
              />
              <button onClick={saveName} className="bg-green-500 text-white font-black px-4 rounded-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all">
                <Check size={22} strokeWidth={3} />
              </button>
            </div>
          </div>

          {/* characters */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">{t('avatar.character')} · <span dir="rtl">{t('avatar.byLevel')}</span></p>
            <div className="grid grid-cols-5 gap-2">
              {AVATARS.map((a) => {
                const locked = level < a.level
                const active = state.avatar.avatarId === a.id
                return (
                  <button
                    key={a.id}
                    onClick={() => !locked && choose({ avatarId: a.id })}
                    disabled={locked}
                    className={`relative aspect-square rounded-2xl border-4 flex flex-col items-center justify-center text-3xl transition-all
                      ${active ? 'bg-yellow-100 border-yellow-400 scale-105 shadow-md' : locked ? 'bg-slate-200 border-slate-300 opacity-70' : 'bg-white border-slate-200 hover:border-blue-300 active:scale-95'}`}
                  >
                    <span className={locked ? 'grayscale' : ''}>{a.emoji}</span>
                    {locked && (
                      <span className="absolute -bottom-1.5 bg-slate-700 text-white text-[10px] font-black px-1.5 rounded-full border-2 border-slate-900 flex items-center gap-0.5">
                        <Lock size={9} /> {a.level}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* frames */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">{t('avatar.frame')}</p>
            <div className="grid grid-cols-5 gap-2">
              {FRAMES.map((f) => {
                const locked = level < f.level
                const active = state.avatar.frameId === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => !locked && choose({ frameId: f.id })}
                    disabled={locked}
                    className={`relative aspect-square rounded-2xl border-4 transition-all ${f.classes}
                      ${active ? 'ring-4 ring-yellow-400 scale-105' : ''} ${locked ? 'opacity-40 grayscale' : 'active:scale-95'}`}
                  >
                    {locked && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-slate-800 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Lock size={9} /> {f.level}
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* gear */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">
              {t('avatar.gear')} · <span className="normal-case tracking-normal">{t('avatar.gearHint')}</span>
            </p>
            <div className="space-y-3">
              {GEAR_SLOTS.map((slot) => {
                const equipped = state.avatar.gear?.[slot] ?? null
                return (
                  <div key={slot}>
                    <p className="text-[11px] font-black text-slate-400 uppercase mb-1">{t(`avatar.slot.${slot}`)}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <button
                        onClick={() => { sfx.click(); dispatch({ type: 'SET_GEAR', slot, id: null }) }}
                        className={`shrink-0 min-w-14 h-14 rounded-2xl border-4 text-xs font-black transition-all
                          ${equipped === null ? 'bg-yellow-100 border-yellow-400 text-yellow-700' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        {t('avatar.none')}
                      </button>
                      {gearInSlot(slot).map((g) => {
                        const owned = state.ownedGear.includes(g.id)
                        const locked = isGearLocked(g, level)
                        const active = equipped === g.id
                        const affordable = g.cost != null && state.coins >= g.cost
                        return (
                          <button
                            key={g.id}
                            title={g.he}
                            onClick={() => {
                              if (owned) { sfx.click(); dispatch({ type: 'SET_GEAR', slot, id: active ? null : g.id }); return }
                              if (locked) return
                              if (g.level || affordable) {
                                dispatch({ type: 'GEAR_BUY', id: g.id })
                                dispatch({ type: 'SET_GEAR', slot, id: g.id })
                                sfx.fanfare()
                              }
                            }}
                            disabled={locked || (!owned && !g.level && !affordable)}
                            className={`shrink-0 w-14 relative rounded-2xl border-4 flex flex-col items-center justify-center gap-0.5 py-1 transition-all
                              ${active ? 'bg-yellow-100 border-yellow-400 scale-105' : owned ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-200'}
                              ${locked || (!owned && !g.level && !affordable) ? 'opacity-50' : 'active:scale-95'}`}
                          >
                            <span className={`text-2xl leading-none ${owned ? '' : 'grayscale'}`}>{g.emoji}</span>
                            {owned ? (
                              active && <Check size={12} strokeWidth={4} className="text-yellow-600" />
                            ) : locked ? (
                              <span className="flex items-center gap-0.5 text-[9px] font-black text-slate-500">
                                <Lock size={8} /> {g.level}
                              </span>
                            ) : g.level ? (
                              <span className="text-[9px] font-black text-green-600 uppercase">{t('avatar.buy')}</span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[9px] font-black text-yellow-700 tabular-nums">
                                <Coins size={8} className="fill-current" />{g.cost}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-sm font-bold text-slate-500 text-center" dir="rtl">
            {t('avatar.levelHint', { level })}
          </p>
        </div>
      </div>
    </div>
  )
}
