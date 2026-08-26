import { X, Heart, Trophy, Timer } from 'lucide-react'

/**
 * Shared arcade chrome: HUD bar (timer / score / lives) + game-over modal.
 * The game itself renders as children inside the play area.
 */
export default function ArcadeShell({ hud, over, highScore, onClose, onRestart, wrapRef, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-blue-950">
      <div className="flex items-center gap-3 p-3 bg-blue-900 border-b-4 border-blue-950">
        <button
          onClick={onClose}
          className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <X size={22} strokeWidth={3} />
        </button>
        {hud.time !== undefined && (
          <div className="flex items-center gap-1 text-white font-black text-xl tabular-nums">
            <Timer size={20} className="text-blue-300" /> {hud.time}
          </div>
        )}
        <div className="flex-1 text-center text-yellow-400 font-black text-2xl tabular-nums drop-shadow">{hud.score}</div>
        {hud.lives !== undefined && (
          <div className="flex gap-1">
            {Array.from({ length: hud.maxLives ?? 3 }).map((_, i) => (
              <Heart
                key={i}
                size={22}
                className={i < hud.lives ? 'text-red-500 fill-red-500' : 'text-blue-950 fill-blue-950 opacity-60'}
              />
            ))}
          </div>
        )}
      </div>

      <div ref={wrapRef} className="flex-1 relative touch-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {children}
      </div>

      {over && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-950/85 backdrop-blur-sm p-4">
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden text-center">
            <div className="p-5 bg-gradient-to-br from-yellow-300 to-amber-500 border-b-8 border-black/10">
              <h2 className="text-3xl font-black text-white uppercase italic drop-shadow-md">
                {over.isRecord ? 'NEW RECORD!' : 'GAME OVER'}
              </h2>
            </div>
            <div className="p-6 flex flex-col items-center gap-4 bg-slate-50">
              <p className="text-5xl font-black text-slate-800 tabular-nums">{over.score}</p>
              <div className="flex items-center gap-2 text-slate-500 font-bold">
                <Trophy size={18} className="text-yellow-500 fill-yellow-200" />
                <span className="tabular-nums">שיא: {Math.max(highScore, over.score)}</span>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={onRestart}
                  className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-blue-700 active:border-b-0 active:translate-y-2 transition-all"
                >
                  Again!
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-green-500 hover:bg-green-400 text-white text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
