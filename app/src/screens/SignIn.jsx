import { useState } from 'react'
import { Zap, Mail, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { useCloud } from '../context/CloudContext.jsx'

// Parent sign-in (one account per family). Kids never see this after setup.
export default function SignIn() {
  const cloud = useCloud()
  const [mode, setMode] = useState('in') // in | up
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const fn = mode === 'in' ? cloud.signIn : cloud.signUp
    const { data, error } = await fn(email.trim(), password)
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message })
    if (mode === 'up' && !data.session) {
      setMsg({ type: 'ok', text: 'נשלח מייל אימות — אשרו אותו ואז היכנסו.' })
      setMode('in')
    }
  }

  return (
    <div
      className="h-dvh w-full flex items-center justify-center p-4 bg-blue-600"
      style={{ backgroundImage: 'radial-gradient(circle at center, #2563eb 0%, #1e40af 100%)' }}
    >
      <form onSubmit={submit} className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-6 bg-gradient-to-br from-blue-400 to-blue-600 border-b-8 border-black/10 text-center">
          <div className="inline-block bg-yellow-400 p-3 rounded-2xl border-b-4 border-yellow-600 shadow-lg -rotate-3 mb-2">
            <Zap className="text-yellow-950 w-10 h-10 fill-current" />
          </div>
          <h1 className="text-3xl font-black text-white italic uppercase drop-shadow-md">Tommy's Quests</h1>
          <p className="text-blue-100 font-bold text-sm mt-1" dir="rtl">כניסת הורים — חשבון אחד לכל המשפחה</p>
        </div>

        <div className="p-6 bg-slate-50 space-y-4">
          <label className="block">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><Mail size={12} /> Email</span>
            <input
              type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-white border-4 border-slate-200 rounded-xl px-4 py-2.5 font-bold text-lg focus:outline-none focus:border-blue-400"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><KeyRound size={12} /> Password</span>
            <input
              type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-white border-4 border-slate-200 rounded-xl px-4 py-2.5 font-bold text-lg focus:outline-none focus:border-blue-400"
            />
          </label>

          {msg && (
            <p className={`text-sm font-bold rounded-xl px-3 py-2 ${msg.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`} dir="auto">
              {msg.text}
            </p>
          )}

          <button
            type="submit" disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white text-xl font-black italic uppercase py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all disabled:opacity-60"
          >
            {mode === 'in' ? <><LogIn size={22} /> Sign in</> : <><UserPlus size={22} /> Create account</>}
          </button>

          <button
            type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}
            className="w-full text-sm font-black text-slate-500 hover:text-slate-700 uppercase"
          >
            {mode === 'in' ? 'First time? Create the family account' : 'Already have an account? Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
