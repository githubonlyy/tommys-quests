import { useEffect, useState, createContext, useContext } from 'react'
import { Gamepad2, Store, BarChart3, Zap, Trophy, Coins, Lock, Skull, Flame, Music, Joystick } from 'lucide-react'
import { usePlayer, levelCost } from './context/PlayerContext.jsx'
import { playMusic, stopMusic, isMusicOn, setMusicOn } from './match/music.js'
import EventBoard from './screens/EventBoard.jsx'
import Shop from './screens/Shop.jsx'
import Trophies from './screens/Trophies.jsx'
import Arcade from './screens/Arcade.jsx'
import AvatarPicker from './screens/AvatarPicker.jsx'
import { avatarById, frameById } from './data/avatars.js'
import CoachStats from './screens/CoachStats.jsx'
import MatchEngine from './match/MatchEngine.jsx'

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export default function App() {
  const { state, dispatch, playedToday } = usePlayer()
  const [activeTab, setActiveTab] = useState('events')
  const [toast, setToast] = useState(null)
  const [avatarOpen, setAvatarOpen] = useState(false)
  // { event, practice } while a match is running
  const [match, setMatch] = useState(null)
  const [musicOn, setMusicOnState] = useState(isMusicOn())

  // background music follows app state; first pointer tap unlocks WebAudio
  useEffect(() => {
    if (!musicOn) { stopMusic(); return }
    const track = match ? 'match' : 'lobby'
    playMusic(track)
    const kick = () => playMusic(track)
    window.addEventListener('pointerdown', kick, { once: true })
    return () => window.removeEventListener('pointerdown', kick)
  }, [match, musicOn])

  const toggleMusic = () => {
    setMusicOn(!musicOn)
    setMusicOnState(!musicOn)
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const showToast = (message, type = 'success') => setToast({ message, type })

  useEffect(() => {
    if (state.corrupt) {
      showToast('הנתונים השמורים נפגמו — התחלנו מחדש', 'error')
      dispatch({ type: 'CLEAR_CORRUPT_FLAG' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const xpPct = Math.min(100, Math.round((state.xp / levelCost(state.level)) * 100))

  return (
    <ToastContext.Provider value={showToast}>
      <div
        className="flex flex-col md:flex-row h-dvh w-full bg-blue-600 text-slate-800 font-sans overflow-hidden selection:bg-yellow-400 selection:text-black"
        style={{ backgroundImage: 'radial-gradient(circle at center, #2563eb 0%, #1e40af 100%)' }}
      >
        {/* SIDEBAR — tablet/desktop only; phones get the bottom nav */}
        <aside className="hidden md:flex w-64 bg-blue-900 border-r-4 border-blue-950 flex-col relative z-20 shadow-2xl">
          <div className="p-4 md:p-6 border-b-4 border-blue-950 flex flex-col items-center md:items-start">
            <div className="bg-yellow-400 p-2 md:p-3 rounded-2xl border-b-4 border-yellow-600 shadow-lg mb-2 -rotate-3">
              <Zap className="text-yellow-950 h-8 w-8 md:h-10 md:w-10 fill-current" />
            </div>
            <h1 className="hidden md:block text-2xl font-black text-white italic tracking-wider drop-shadow-md">
              TOMMY'S<br /><span className="text-yellow-400">QUESTS</span>
            </h1>
          </div>

          <nav className="flex-1 p-2 md:p-4 space-y-3 mt-4">
            <NavItem
              icon={<Gamepad2 size={28} className="md:mr-3" />}
              label="Events"
              isActive={activeTab === 'events'}
              onClick={() => setActiveTab('events')}
              color="bg-green-500"
            />
            <NavItem
              icon={<Store size={28} className="md:mr-3" />}
              label="Shop"
              isActive={activeTab === 'rewards'}
              onClick={() => setActiveTab('rewards')}
              color="bg-purple-500"
            />
            <NavItem
              icon={<Joystick size={28} className="md:mr-3" />}
              label="Arcade"
              isActive={activeTab === 'arcade'}
              onClick={() => setActiveTab('arcade')}
              color="bg-pink-500"
            />
            <NavItem
              icon={<Trophy size={28} className="md:mr-3" />}
              label="Trophies"
              isActive={activeTab === 'trophies'}
              onClick={() => setActiveTab('trophies')}
              color="bg-yellow-500"
            />
          </nav>

          <div className="p-2 md:p-4 border-t-4 border-blue-950 bg-blue-800/50">
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center justify-center md:justify-start w-full p-3 rounded-xl transition-all duration-200 font-black uppercase tracking-wider
                ${activeTab === 'admin'
                  ? 'bg-slate-700 text-white border-b-4 border-slate-900 scale-95'
                  : 'bg-blue-900 text-blue-300 hover:bg-slate-700 hover:text-white border-b-4 border-transparent hover:border-slate-900'}`}
            >
              <BarChart3 className="md:mr-3" size={24} />
              <span className="hidden md:inline">Coach Stats</span>
              <Lock className="hidden md:block ml-auto opacity-50" size={16} />
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col relative overflow-hidden min-h-0">
          <header className="h-16 md:h-24 shrink-0 bg-blue-800/80 backdrop-blur-md border-b-4 border-blue-900 flex items-center justify-between px-3 md:px-8 z-10 shadow-md">
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={() => setAvatarOpen(true)}
                className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl border-4 flex items-center justify-center text-2xl md:text-3xl shadow-lg active:scale-95 transition-transform ${frameById(state.avatar.frameId).classes}`}
                aria-label="Change avatar"
              >
                {avatarById(state.avatar.avatarId).emoji}
              </button>
              <div className="flex flex-col">
                <span className="text-base md:text-2xl text-white font-black drop-shadow-md tracking-wide leading-tight">{state.avatar.name}</span>
                <div className="flex items-center gap-1.5 md:gap-2 w-28 md:w-48">
                  <span className="text-[10px] md:text-xs font-black text-blue-300 whitespace-nowrap">LVL {state.level}</span>
                  <div className="flex-1 h-3 md:h-4 bg-blue-950 rounded-full border-2 border-blue-900 overflow-hidden relative">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000"
                      style={{ width: `${xpPct}%` }}
                    ></div>
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-white/20"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={toggleMusic}
                aria-label={musicOn ? 'Turn music off' : 'Turn music on'}
                className={`w-9 h-9 md:w-11 md:h-11 rounded-xl border-b-4 flex items-center justify-center transition-all active:translate-y-0.5 active:border-b-2 relative
                  ${musicOn ? 'bg-green-500 border-green-700 text-white' : 'bg-blue-950 border-blue-900 text-blue-600'}`}
              >
                <Music size={18} />
                {!musicOn && <span className="absolute w-7 h-0.5 bg-blue-500 rotate-45 rounded"></span>}
              </button>
              {state.streak.count > 0 && (
                <div className="flex items-center gap-1 bg-orange-500 border-2 border-orange-300 rounded-xl px-2 py-1 md:px-3 md:py-1.5 shadow-md -rotate-2">
                  <Flame size={16} className="text-yellow-200 fill-yellow-300" />
                  <span className="text-white font-black text-sm md:text-lg tabular-nums">{state.streak.count}</span>
                </div>
              )}
              <div className="flex items-center bg-blue-950 border-4 border-blue-900 rounded-xl md:rounded-2xl px-2.5 py-1 md:px-6 md:py-3 shadow-inner rotate-1">
              <div className="bg-yellow-400 p-1 md:p-1.5 rounded-full mr-1.5 md:mr-3 border-2 border-yellow-600 shadow-sm">
                <Coins className="text-yellow-900 fill-yellow-200 w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-lg md:text-3xl text-yellow-400 font-black tracking-wide drop-shadow-sm tabular-nums">
                {state.coins.toLocaleString()}
              </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-3 md:p-8 relative">
            <div className="relative z-10 max-w-5xl mx-auto pb-8 md:pb-20">
              {activeTab === 'events' && (
                <EventBoard
                  onStartMatch={(event, mode) => setMatch({ event, mode, practice: playedToday(event.id) })}
                />
              )}
              {activeTab === 'rewards' && <Shop />}
              {activeTab === 'arcade' && <Arcade />}
              {activeTab === 'trophies' && <Trophies />}
              {activeTab === 'admin' && <CoachStats />}
            </div>
          </div>
        </main>

        {/* BOTTOM NAV — phones only */}
        <nav
          className="md:hidden shrink-0 grid grid-cols-5 bg-blue-900 border-t-4 border-blue-950 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <BottomNavItem
            icon={<Gamepad2 size={24} />}
            label="Events"
            isActive={activeTab === 'events'}
            activeColor="text-green-400"
            onClick={() => setActiveTab('events')}
          />
          <BottomNavItem
            icon={<Store size={24} />}
            label="Shop"
            isActive={activeTab === 'rewards'}
            activeColor="text-purple-400"
            onClick={() => setActiveTab('rewards')}
          />
          <BottomNavItem
            icon={<Joystick size={24} />}
            label="Arcade"
            isActive={activeTab === 'arcade'}
            activeColor="text-pink-400"
            onClick={() => setActiveTab('arcade')}
          />
          <BottomNavItem
            icon={<Trophy size={24} />}
            label="Wins"
            isActive={activeTab === 'trophies'}
            activeColor="text-yellow-400"
            onClick={() => setActiveTab('trophies')}
          />
          <BottomNavItem
            icon={<BarChart3 size={24} />}
            label="Coach"
            isActive={activeTab === 'admin'}
            activeColor="text-slate-300"
            onClick={() => setActiveTab('admin')}
          />
        </nav>

        {avatarOpen && <AvatarPicker onClose={() => setAvatarOpen(false)} />}

        {/* MATCH OVERLAY */}
        {match && (
          <MatchEngine
            key={match.startedAt ?? 0}
            event={match.event}
            mode={match.mode}
            practice={match.practice}
            onExit={() => setMatch(null)}
            onPlayAgain={() => setMatch({ event: match.event, mode: match.mode, practice: true, startedAt: Date.now() })}
          />
        )}

        {/* TOAST */}
        {toast && (
          <div className="fixed top-6 left-1/2 z-[100] anim-toast" style={{ transform: 'translateX(-50%)' }}>
            <div
              dir="auto"
              className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-4 shadow-2xl font-black uppercase tracking-wide ${
                toast.type === 'success'
                  ? 'bg-green-500 border-green-700 text-white'
                  : 'bg-red-500 border-red-700 text-white'
              }`}
            >
              {toast.type === 'success' ? <Trophy className="fill-current" size={24} /> : <Skull size={24} />}
              <span className="text-lg md:text-xl drop-shadow-sm">{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

function BottomNavItem({ icon, label, isActive, activeColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 font-black uppercase tracking-wider transition-colors relative
        ${isActive ? `${activeColor}` : 'text-blue-400 active:text-blue-200'}`}
    >
      {/* active indicator bar */}
      <span className={`absolute top-0 left-1/4 right-1/4 h-1 rounded-b-full transition-opacity ${isActive ? 'bg-yellow-400 opacity-100' : 'opacity-0'}`}></span>
      {icon}
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  )
}

function NavItem({ icon, label, isActive, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center md:justify-start w-full p-2 md:p-3 rounded-2xl transition-all duration-200 font-black uppercase tracking-wider
        ${isActive
          ? `${color} text-white border-b-4 border-black/20 scale-95 shadow-inner`
          : 'bg-blue-800 text-blue-200 hover:bg-blue-700 hover:text-white border-b-4 border-blue-900 hover:translate-y-1'}`}
    >
      {icon}
      <span className="hidden md:inline text-lg">{label}</span>
    </button>
  )
}
