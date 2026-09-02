import { Music, X, Check } from 'lucide-react'
import { TRACKS, TRACK_IDS, getTrack, setTrack, isMusicOn, setMusicOn, playMusic, stopMusic } from '../match/music.js'
import { useLang } from '../context/LangContext.jsx'

/**
 * Music sheet: on/off plus the eight styles. Picking one restarts the loop
 * immediately so the choice is audible while the sheet is still open.
 */
export default function MusicPicker({ musicOn, onToggle, onClose }) {
  const { t, isHe } = useLang()
  const current = getTrack()

  const pick = (id) => {
    setTrack(id)
    if (!isMusicOn()) {
      setMusicOn(true)
      onToggle(true)
    }
    playMusic('lobby')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--t-overlay) backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 bg-gradient-to-br from-sky-400 to-sky-600 border-b-8 border-black/10 flex items-center gap-3">
          <Music className="text-white" size={26} />
          <h2 className="flex-1 text-2xl font-black text-white italic drop-shadow-md">{t('music.title')}</h2>
          <button onClick={onClose} className="w-9 h-9 bg-black/20 hover:bg-black/30 text-white rounded-full flex items-center justify-center">
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="p-4 bg-slate-50 space-y-3 max-h-[70dvh] overflow-y-auto">
          <button
            onClick={() => {
              const next = !musicOn
              setMusicOn(next)
              onToggle(next)
              if (next) playMusic('lobby')
              else stopMusic()
            }}
            className={`w-full min-h-14 rounded-2xl border-b-4 font-black text-lg transition-all active:border-b-0 active:translate-y-1
              ${musicOn ? 'bg-green-500 border-green-700 text-white' : 'bg-slate-300 border-slate-400 text-slate-600'}`}
          >
            {musicOn ? t('music.on') : t('music.off')}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {TRACK_IDS.map((id) => {
              const tr = TRACKS[id]
              const active = id === current
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  className={`min-h-16 rounded-2xl border-4 flex flex-col items-center justify-center gap-0.5 font-black transition-all
                    ${active ? 'bg-yellow-100 border-yellow-400 text-yellow-800 scale-105' : 'bg-white border-slate-200 text-slate-700 active:scale-95'}`}
                >
                  <span className="text-2xl leading-none">{tr.emoji}</span>
                  <span className="text-sm flex items-center gap-1">
                    {isHe ? tr.he : tr.en}
                    {active && <Check size={13} strokeWidth={4} />}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs font-bold text-slate-400 text-center" dir="rtl">{t('music.hint')}</p>
        </div>
      </div>
    </div>
  )
}
