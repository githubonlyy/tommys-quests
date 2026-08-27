import { useState } from 'react'
import { Plus, Upload, LogOut, Star } from 'lucide-react'
import { useCloud } from '../context/CloudContext.jsx'
import { AVATARS, frameById, avatarById } from '../data/avatars.js'
import { sfx } from '../match/sounds.js'

const LOCAL_KEY = 'tommys-quests-v1'

function readLocalProgress() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    // only worth importing if the device actually has progress
    return s && (s.coins > 0 || s.level > 1 || (s.battleLog?.length ?? 0) > 0) ? s : null
  } catch { return null }
}

// Who is playing? One tile per kid; parent can add kids or import this
// device's Phase-1 progress as a kid profile (one-time).
export default function ProfilePicker() {
  const cloud = useCloud()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [avatarId, setAvatarId] = useState('hero')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const local = readLocalProgress()

  const pick = (id) => { sfx.click(); cloud.setActivePlayerId(id) }

  const create = async (e) => {
    e.preventDefault()
    const clean = name.trim().slice(0, 12).toUpperCase()
    if (!clean) return
    setBusy(true); setErr(null)
    try {
      const row = await cloud.addPlayer(clean, { avatarId, frameId: 'steel' })
      sfx.fanfare()
      cloud.setActivePlayerId(row.id)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const importLocal = async () => {
    setBusy(true); setErr(null)
    try {
      const nm = (local.avatar?.name || 'TOMMY').toUpperCase()
      const row = await cloud.importLocal(nm, local)
      sfx.fanfare()
      cloud.setActivePlayerId(row.id)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <div
      className="h-dvh w-full flex flex-col items-center justify-center p-4 bg-blue-600 overflow-y-auto"
      style={{ backgroundImage: 'radial-gradient(circle at center, #2563eb 0%, #1e40af 100%)' }}
    >
      <h1 className="text-3xl md:text-4xl font-black text-white italic uppercase drop-shadow-md mb-1">Who's playing?</h1>
      <p className="text-blue-200 font-bold mb-6" dir="rtl">בחרו את השחקן שלכם</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
        {cloud.players.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className="bg-white rounded-3xl border-b-8 border-slate-300 p-5 flex flex-col items-center gap-2 shadow-xl hover:-translate-y-1 active:translate-y-1 active:border-b-0 transition-all"
          >
            <span className={`w-20 h-20 rounded-2xl border-4 flex items-center justify-center text-5xl ${frameById(p.avatar?.frameId).classes}`}>
              {avatarById(p.avatar?.avatarId).emoji}
            </span>
            <span className="font-black text-slate-800 text-xl uppercase">{p.name}</span>
            <span className="flex items-center gap-1 text-xs font-black text-slate-400 uppercase"><Star size={12} className="fill-current" /> LVL {p.level}</span>
          </button>
        ))}

        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="bg-blue-900/60 rounded-3xl border-4 border-dashed border-blue-300 p-5 flex flex-col items-center justify-center gap-2 text-blue-100 font-black uppercase hover:bg-blue-900/80 transition-colors min-h-40"
          >
            <Plus size={36} strokeWidth={3} /> Add kid
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={create} className="mt-5 w-full max-w-md bg-white rounded-3xl border-8 border-slate-800 p-5 space-y-4 anim-zoom-in">
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="NAME"
            className="w-full bg-slate-50 border-4 border-slate-200 rounded-xl px-4 py-2.5 font-black text-xl uppercase tracking-wide focus:outline-none focus:border-blue-400"
          />
          <div className="grid grid-cols-5 gap-2">
            {AVATARS.filter((a) => a.level === 1).map((a) => (
              <button
                key={a.id} type="button" onClick={() => setAvatarId(a.id)}
                className={`aspect-square rounded-2xl border-4 text-3xl flex items-center justify-center ${avatarId === a.id ? 'bg-yellow-100 border-yellow-400 scale-105' : 'bg-white border-slate-200'}`}
              >
                {a.emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="flex-1 bg-green-500 text-white font-black italic uppercase py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-60">
              Create
            </button>
            <button type="button" onClick={() => setAdding(false)} className="flex-1 bg-slate-300 text-slate-700 font-black italic uppercase py-3 rounded-2xl border-b-8 border-slate-400">
              Cancel
            </button>
          </div>
        </form>
      )}

      {local && cloud.players.length === 0 && (
        <button
          onClick={importLocal} disabled={busy}
          className="mt-5 flex items-center gap-2 bg-yellow-400 text-yellow-950 font-black italic uppercase px-5 py-3 rounded-2xl border-b-8 border-yellow-600 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-60"
        >
          <Upload size={20} /> <span dir="rtl">ייבוא ההתקדמות מהמכשיר הזה ({local.coins} מטבעות, רמה {local.level})</span>
        </button>
      )}

      {err && <p className="mt-3 bg-red-100 text-red-600 font-bold rounded-xl px-3 py-2 text-sm">{err}</p>}

      <button onClick={cloud.signOut} className="mt-8 flex items-center gap-1.5 text-blue-200 hover:text-white font-black text-sm uppercase">
        <LogOut size={16} /> Sign out
      </button>
    </div>
  )
}
