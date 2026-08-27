import { useEffect, useState } from 'react'
import { Users, ShoppingBag, Store, Settings2, LogOut, Check, Plus, EyeOff, Eye } from 'lucide-react'
import { useCloud } from '../context/CloudContext.jsx'
import { useToast } from '../App.jsx'

const STATUS_NEXT = { pending: 'approved', approved: 'fulfilled' }
const STATUS_HE = { pending: 'ממתין', approved: 'אושר', fulfilled: 'נמסר' }

/**
 * Parent remote controls — only rendered in cloud mode, inside the
 * PIN-gated Coach dashboard. Works from any device signed into the family.
 */
export default function CoachCloud() {
  const cloud = useCloud()
  const showToast = useToast()
  const [purchases, setPurchases] = useState([])
  const [editing, setEditing] = useState(null) // shop item draft
  const [goal, setGoal] = useState(cloud.settings?.daily_goal ?? 4)
  const [chest, setChest] = useState(cloud.settings?.daily_chest_coins ?? 100)

  const loadPurchases = () => cloud.api.listPurchases().then(setPurchases).catch(() => {})
  useEffect(() => { loadPurchases() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const advance = async (p) => {
    const next = STATUS_NEXT[p.status]
    if (!next) return
    await cloud.api.setPurchaseStatus(p.id, next)
    loadPurchases()
  }

  const saveItem = async () => {
    if (!editing.title || !(editing.cost > 0)) return showToast('Title + cost required', 'error')
    await cloud.api.upsertShopItem({ ...editing, family_id: cloud.familyId })
    await cloud.refreshShop()
    setEditing(null)
    showToast('Shop updated', 'success')
  }

  const toggleItem = async (item) => {
    await cloud.api.upsertShopItem({ ...item, active: !item.active })
    cloud.refreshShop()
  }

  const saveSettings = async () => {
    await cloud.updateSettings({ daily_goal: Number(goal), daily_chest_coins: Number(chest) })
    showToast('Settings saved', 'success')
  }

  const box = 'bg-white border-4 border-slate-200 rounded-3xl shadow-lg p-6'
  const h3 = 'text-lg font-black text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2'
  const input = 'bg-slate-100 border-4 border-slate-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-blue-400'

  return (
    <>
      {/* KIDS */}
      <div className={box}>
        <h3 className={h3}><Users size={20} /> Family</h3>
        <div className="flex flex-wrap gap-2">
          {cloud.players.map((p) => (
            <button
              key={p.id}
              onClick={() => cloud.setActivePlayerId(p.id)}
              className={`px-4 py-2 rounded-xl border-b-4 font-black uppercase ${p.id === cloud.activePlayerId ? 'bg-blue-500 border-blue-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-700'}`}
            >
              {p.name} · LVL {p.level} · {p.coins.toLocaleString()} 🪙
            </button>
          ))}
        </div>
        <p className="text-xs font-bold text-slate-400 mt-2">Stats above show the highlighted kid.</p>
      </div>

      {/* PURCHASE APPROVALS */}
      <div className={box}>
        <h3 className={h3}><ShoppingBag size={20} /> Purchases to approve</h3>
        {purchases.length === 0 ? (
          <p className="font-bold text-slate-400">Nothing yet</p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-3 bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700">
                <span className="flex-1">
                  <span className="text-slate-400 text-xs uppercase mr-2">{p.players?.name}</span>
                  {p.title}
                  <span className="text-slate-400 text-sm"> · {p.cost.toLocaleString()} coins</span>
                </span>
                <span className={`text-xs font-black px-2 py-1 rounded-lg ${p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : p.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {STATUS_HE[p.status]}
                </span>
                {STATUS_NEXT[p.status] && p.kind === 'reward' && (
                  <button onClick={() => advance(p)} className="bg-green-500 text-white rounded-lg p-1.5 border-b-2 border-green-700 active:border-b-0 active:translate-y-0.5">
                    <Check size={16} strokeWidth={3} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* SHOP EDITOR */}
      <div className={box}>
        <h3 className={h3}><Store size={20} /> Reward shop</h3>
        <ul className="space-y-2 mb-3">
          {cloud.shopItems.map((it) => (
            <li key={it.id} className={`flex items-center gap-3 rounded-xl px-4 py-2 font-bold border-2 ${it.active ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-100 border-slate-200 text-slate-400 line-through'}`}>
              <span className="flex-1">{it.title} <span className="text-xs text-slate-400 uppercase">{it.rarity}</span></span>
              <span className="tabular-nums">{it.cost.toLocaleString()} 🪙</span>
              <button onClick={() => setEditing(it)} className="text-blue-500 font-black text-xs uppercase">Edit</button>
              <button onClick={() => toggleItem(it)} className="text-slate-400" title={it.active ? 'Hide' : 'Show'}>
                {it.active ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="grid grid-cols-2 gap-2 bg-slate-50 border-2 border-slate-200 rounded-2xl p-3">
            <input className={input} placeholder="Title" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <input className={input} placeholder="Type (e.g. Weekend)" value={editing.type ?? ''} onChange={(e) => setEditing({ ...editing, type: e.target.value })} />
            <input className={`${input} col-span-2`} dir="rtl" placeholder="תיאור בעברית" value={editing.desc_he ?? ''} onChange={(e) => setEditing({ ...editing, desc_he: e.target.value })} />
            <input className={input} type="number" min={1} placeholder="Cost" value={editing.cost ?? ''} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} />
            <select className={input} value={editing.rarity ?? 'RARE'} onChange={(e) => setEditing({ ...editing, rarity: e.target.value })}>
              <option>RARE</option><option>EPIC</option><option>LEGENDARY</option>
            </select>
            <select className={input} value={editing.icon ?? 'award'} onChange={(e) => setEditing({ ...editing, icon: e.target.value })}>
              <option value="award">Award</option><option value="flag">Flag</option><option value="zap">Zap</option>
            </select>
            <div className="flex gap-2">
              <button onClick={saveItem} className="flex-1 bg-green-500 text-white font-black uppercase rounded-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1">Save</button>
              <button onClick={() => setEditing(null)} className="flex-1 bg-slate-300 text-slate-700 font-black uppercase rounded-xl border-b-4 border-slate-400">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing({ title: '', type: '', desc_he: '', cost: 500, rarity: 'RARE', icon: 'award', active: true, sort: cloud.shopItems.length + 1 })} className="flex items-center gap-1 text-blue-500 font-black text-sm uppercase">
            <Plus size={16} strokeWidth={3} /> Add reward
          </button>
        )}
      </div>

      {/* SETTINGS */}
      <div className={box}>
        <h3 className={h3}><Settings2 size={20} /> Daily rules</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-black text-slate-400 uppercase">
            Missions for chest
            <input className={`${input} w-24`} type="number" min={1} max={8} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </label>
          <label className="flex flex-col text-xs font-black text-slate-400 uppercase">
            Chest coins
            <input className={`${input} w-28`} type="number" min={0} step={10} value={chest} onChange={(e) => setChest(e.target.value)} />
          </label>
          <button onClick={saveSettings} className="bg-slate-800 text-white font-black uppercase px-5 py-2.5 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1">Save</button>
        </div>
      </div>

      <button onClick={cloud.signOut} className="flex items-center gap-2 text-red-500 font-black uppercase text-sm">
        <LogOut size={16} /> Sign out of family account
      </button>
    </>
  )
}
