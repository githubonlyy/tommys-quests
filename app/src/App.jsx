import { useEffect, useState, createContext, useContext } from 'react'
import { Gamepad2, Store, BarChart3, Zap, Trophy, Coins, Lock, Skull, Flame, Music, Joystick, Palette, Shirt, Volume2, Globe2, Languages } from 'lucide-react'
import { usePlayer, getEquipped, levelCost } from './context/PlayerContext.jsx'
import wardrobe from './data/wardrobe.json'
import { useLang } from './context/LangContext.jsx'
import { useTheme } from './context/ThemeContext.jsx'
import ThemePicker from './screens/ThemePicker.jsx'
import { playMusic, stopMusic, isMusicOn, setMusicOn, setTrack, getTrack } from './match/music.js'
import { isSpeechOn, setSpeechOn, stopSpeaking, canSpeak } from './match/speak.js'
import EventBoard from './screens/EventBoard.jsx'
import Shop from './screens/Shop.jsx'
import Trophies from './screens/Trophies.jsx'
import Fun from './screens/Fun.jsx'
import Closet from './screens/Closet.jsx'
import MusicPicker from './components/MusicPicker.jsx'
import HeroAvatar from './components/HeroAvatar.jsx'
import CoachStats from './screens/CoachStats.jsx'
import MatchEngine from './match/MatchEngine.jsx'

// Tab order matches the sibling apps: learn, dress up, play, spend, compete.
const TABS = [
  { id: 'events', key: 'nav.events', Icon: Gamepad2, color: 'bg-green-500', active: 'text-green-300' },
  { id: 'closet', key: 'nav.closet', Icon: Shirt, color: 'bg-pink-500', active: 'text-pink-300' },
  { id: 'fun', key: 'nav.fun', Icon: Joystick, color: 'bg-sky-500', active: 'text-sky-300' },
  { id: 'rewards', key: 'nav.shop', Icon: Store, color: 'bg-purple-500', active: 'text-purple-300' },
  { id: 'trophies', key: 'nav.trophies', Icon: Trophy, color: 'bg-yellow-500', active: 'text-yellow-300' },
]

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export default function App() {
  const { state, dispatch, playedToday } = usePlayer()
  const { t, dir, isHe, toggleLang } = useLang()
  const { theme, clearTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('events')
  const [toast, setToast] = useState(null)
  // { event, practice } while a match is running
  const [match, setMatch] = useState(null)
  const [musicOn, setMusicOnState] = useState(isMusicOn())
  const [musicOpen, setMusicOpen] = useState(false)
  const [speechOn, setSpeechOnState] = useState(isSpeechOn())

  // background music follows app state; first pointer tap unlocks WebAudio
  useEffect(() => {
    if (!musicOn) { stopMusic(); return }
    const track = match ? 'match' : 'lobby'
    playMusic(track)
    const kick = () => playMusic(track)
    window.addEventListener('pointerdown', kick, { once: true })
    return () => window.removeEventListener('pointerdown', kick)
  }, [match, musicOn])


  const toggleSpeech = () => {
    setSpeechOn(!speechOn)
    setSpeechOnState(!speechOn)
    if (speechOn) stopSpeaking()
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const showToast = (message, type = 'success') => setToast({ message, type })

  useEffect(() => {
    if (state.corrupt) {
      showToast(t('toast.corrupt'), 'error')
      dispatch({ type: 'CLEAR_CORRUPT_FLAG' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Picking a world dresses the doll in that world's preset — but only over
  // free starter items, never over something he chose and paid for.
  useEffect(() => {
    if (!theme) return
    const free = new Set(wardrobe.filter((i) => i.price === 0).map((i) => i.id))
    const equipped = getEquipped(state, theme.id)
    for (const [slot, itemId] of Object.entries(theme.avatarPreset)) {
      const current = equipped[slot]
      if (state.avatar.owned.includes(itemId) && current !== itemId && (current === null || free.has(current))) {
        dispatch({ type: 'AVATAR_EQUIP', themeId: theme.id, slot, itemId })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme?.id])

  // a world suggests its own music the first time it is picked; once he has
  // chosen a style himself it is never overridden
  useEffect(() => {
    if (!theme?.music) return
    let chosen = false
    try { chosen = localStorage.getItem('tommys-quests-track') !== null } catch { /* first run */ }
    if (!chosen && getTrack() !== theme.music) setTrack(theme.music)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme?.id])

  const xpPct = Math.min(100, Math.round((state.xp / levelCost(state.level)) * 100))

  // pick a world before the app opens
  if (!theme) return <ThemePicker />

  return (
    <ToastContext.Provider value={showToast}>
      <div
        dir={dir}
        className="flex flex-col lg:flex-row h-dvh w-full text-slate-800 font-sans overflow-hidden selection:bg-yellow-400 selection:text-black"
        style={{
          ...theme.vars,
          backgroundImage: 'radial-gradient(circle at center, var(--t-bg-from) 0%, var(--t-bg-to) 100%)',
        }}
      >
        {/* SIDEBAR — tablet/desktop only; phones get the bottom nav */}
        <aside className="hidden lg:flex w-64 bg-(--t-side) border-e-4 border-(--t-side-deep) flex-col relative z-20 shadow-2xl">
          <div className="p-4 lg:p-6 border-b-4 border-(--t-side-deep) flex flex-col items-start">
            <div className="bg-yellow-400 p-2 lg:p-3 rounded-2xl border-b-4 border-yellow-600 shadow-lg mb-2 -rotate-3">
              <Zap className="text-yellow-950 h-8 w-8 lg:h-10 lg:w-10 fill-current" />
            </div>
            <h1 className="text-2xl font-black text-white italic tracking-wider drop-shadow-md leading-tight">
              {isHe ? <>המסע של<br /><span className="text-(--t-accent)">טומי</span></> : <>TOMMY&apos;S<br /><span className="text-(--t-accent)">QUESTS</span></>}
            </h1>
            <button
              onClick={clearTheme}
              className="mt-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-(--t-text-soft) hover:text-white transition-colors"
            >
              <Globe2 size={14} /> {theme.emoji} {t('header.theme')}
            </button>
          </div>

          <nav className="flex-1 p-2 lg:p-4 space-y-3 mt-4">
            {TABS.map((tab) => (
              <NavItem
                key={tab.id}
                icon={<tab.Icon size={28} className="me-3" />}
                label={t(tab.key)}
                isActive={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                color={tab.color}
              />
            ))}
          </nav>

          <div className="p-2 lg:p-4 border-t-4 border-(--t-side-deep) bg-black/15 space-y-2">
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center w-full p-3 rounded-xl transition-all duration-200 font-black uppercase tracking-wider
                ${activeTab === 'admin'
                  ? 'bg-slate-700 text-white border-b-4 border-slate-900 scale-95'
                  : 'bg-(--t-nav) text-(--t-text-soft) hover:bg-slate-700 hover:text-white border-b-4 border-transparent hover:border-slate-900'}`}
            >
              <BarChart3 className="me-3" size={24} />
              <span>{t('coach.title')}</span>
              <Lock className="ms-auto opacity-50" size={16} />
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col relative overflow-hidden min-h-0">
          <header className="h-16 lg:h-24 shrink-0 bg-(--t-side)/80 backdrop-blur-md border-b-4 border-(--t-side-deep) flex items-center justify-between px-3 lg:px-8 z-10 shadow-md">
            <div className="flex items-center gap-2 lg:gap-4">
              <button
                onClick={() => setActiveTab('closet')}
                className="active:scale-95 transition-transform"
                aria-label={t('header.avatar')}
              >
                <HeroAvatar size="sm" />
              </button>
              <div className="flex flex-col">
                <span className="text-base lg:text-2xl text-white font-black drop-shadow-md tracking-wide leading-tight">{state.name}</span>
                <div className="flex items-center gap-1.5 lg:gap-2 w-28 lg:w-48">
                  <span className="text-[10px] lg:text-xs font-black text-(--t-text-soft) whitespace-nowrap">{t('header.level')} {state.level}</span>
                  <div className="flex-1 h-3 lg:h-4 bg-blue-950 rounded-full border-2 border-blue-900 overflow-hidden relative">
                    <div
                      className="absolute top-0 start-0 h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000"
                      style={{ width: `${xpPct}%` }}
                    ></div>
                    <div className="absolute top-0 start-0 w-full h-1/2 bg-white/20"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-3">
              <button
                onClick={() => setMusicOpen(true)}
                aria-label={musicOn ? t('header.music.on') : t('header.music.off')}
                className={`w-9 h-9 lg:w-11 lg:h-11 rounded-xl border-b-4 flex items-center justify-center transition-all active:translate-y-0.5 active:border-b-2 relative
                  ${musicOn ? 'bg-green-500 border-green-700 text-white' : 'bg-blue-950 border-blue-900 text-blue-600'}`}
              >
                <Music size={18} />
                {!musicOn && <span className="absolute w-7 h-0.5 bg-white/60 rotate-45 rounded"></span>}
              </button>
              {canSpeak() && (
                <button
                  onClick={toggleSpeech}
                  aria-label={speechOn ? t('header.speech.on') : t('header.speech.off')}
                  className={`w-9 h-9 lg:w-11 lg:h-11 rounded-xl border-b-4 flex items-center justify-center transition-all active:translate-y-0.5 active:border-b-2 relative
                    ${speechOn ? 'bg-sky-500 border-sky-700 text-white' : 'bg-black/30 border-black/40 text-(--t-text-soft)'}`}
                >
                  <Volume2 size={18} />
                  {!speechOn && <span className="absolute w-7 h-0.5 bg-white/60 rotate-45 rounded"></span>}
                </button>
              )}
              <button
                onClick={toggleLang}
                aria-label={t('header.lang')}
                className="h-9 lg:h-11 px-2.5 lg:px-3 rounded-xl border-b-4 bg-black/30 border-black/40 text-white font-black text-xs lg:text-sm flex items-center gap-1 transition-all active:translate-y-0.5 active:border-b-2"
              >
                <Languages size={16} /> {t('header.lang')}
              </button>
              {state.streak.count > 0 && (
                <div className="flex items-center gap-1 bg-orange-500 border-2 border-orange-300 rounded-xl px-2 py-1 lg:px-3 lg:py-1.5 shadow-md -rotate-2">
                  <Flame size={16} className="text-yellow-200 fill-yellow-300" />
                  <span className="text-white font-black text-sm lg:text-lg tabular-nums">{state.streak.count}</span>
                </div>
              )}
              <div className="flex items-center bg-blue-950 border-4 border-blue-900 rounded-xl lg:rounded-2xl px-2.5 py-1 lg:px-6 lg:py-3 shadow-inner rotate-1">
              <div className="bg-yellow-400 p-1 lg:p-1.5 rounded-full me-1.5 lg:me-3 border-2 border-yellow-600 shadow-sm">
                <Coins className="text-yellow-900 fill-yellow-200 w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <span className="text-lg lg:text-3xl text-yellow-400 font-black tracking-wide drop-shadow-sm tabular-nums">
                {state.coins.toLocaleString()}
              </span>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-3 lg:p-8 relative">
            <div className="relative z-10 max-w-5xl mx-auto pb-8 lg:pb-20">
              {activeTab === 'events' && (
                <EventBoard
                  onStartMatch={(event, mode) => setMatch({ event, mode, practice: playedToday(event.id) })}
                />
              )}
              {activeTab === 'rewards' && <Shop />}
              {activeTab === 'closet' && <Closet />}
              {activeTab === 'fun' && <Fun onGoLearn={() => setActiveTab('events')} />}
              {activeTab === 'trophies' && <Trophies />}
              {activeTab === 'admin' && <CoachStats />}
            </div>
          </div>
        </main>

        {/* BOTTOM NAV — phones only */}
        <nav
          className="lg:hidden shrink-0 grid grid-cols-6 bg-(--t-side) border-t-4 border-(--t-side-deep) z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((tab) => (
            <BottomNavItem
              key={tab.id}
              icon={<tab.Icon size={22} />}
              label={t(tab.key)}
              isActive={activeTab === tab.id}
              activeColor={tab.active}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
          <BottomNavItem
            icon={<BarChart3 size={22} />}
            label={t('nav.coach')}
            isActive={activeTab === 'admin'}
            activeColor="text-slate-300"
            onClick={() => setActiveTab('admin')}
          />
        </nav>

        

        {musicOpen && (
          <MusicPicker musicOn={musicOn} onToggle={setMusicOnState} onClose={() => setMusicOpen(false)} />
        )}

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
        ${isActive ? `${activeColor}` : 'text-(--t-text-soft) opacity-70 active:opacity-100'}`}
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
      className={`flex items-center w-full p-3 rounded-2xl transition-all duration-200 font-black uppercase tracking-wider
        ${isActive
          ? `${color} text-white border-b-4 border-black/20 scale-95 shadow-inner`
          : 'bg-(--t-nav) text-(--t-text-soft) hover:brightness-125 hover:text-white border-b-4 border-(--t-side-deep) hover:translate-y-1'}`}
    >
      {icon}
      <span className="text-lg">{label}</span>
    </button>
  )
}
