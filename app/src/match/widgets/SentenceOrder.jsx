import { useEffect, useMemo, useState } from 'react'
import { Volume2, Delete } from 'lucide-react'
import { speak } from '../speak.js'
import { sfx } from '../sounds.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Word order: the Hebrew meaning is given, the English words arrive scrambled,
// and he taps them into a sentence. Auto-checks once every slot is filled.
export default function SentenceOrder({ question, disabled, onAnswer }) {
  const tiles = useMemo(
    () => shuffle(question.words.map((w, i) => ({ id: i, word: w }))),
    [question],
  )
  const [picked, setPicked] = useState([]) // tile ids, in tap order
  const [done, setDone] = useState(false)

  const take = (tile) => {
    if (disabled || done || picked.includes(tile.id)) return
    sfx.flip()
    setPicked((p) => [...p, tile.id])
  }
  const undo = () => {
    if (disabled || done) return
    setPicked((p) => p.slice(0, -1))
  }

  useEffect(() => {
    if (done || picked.length !== question.words.length) return
    const built = picked.map((id) => tiles.find((x) => x.id === id).word)
    const ok = built.join(' ') === question.words.join(' ')
    setDone(true)
    if (ok) {
      sfx.click()
      speak(question.words.join(' '), { lang: 'en', rate: 0.85 })
    }
    onAnswer(ok, ok ? 1200 : 1400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  const built = picked.map((id) => tiles.find((x) => x.id === id).word)
  const correctSoFar = built.every((w, i) => w === question.words[i])

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="bg-purple-100 border-4 border-purple-200 px-5 py-2 rounded-full" dir="rtl">
        <span className="text-lg md:text-xl font-black text-purple-700">{question.he}</span>
      </div>

      {/* the sentence being built */}
      <div
        dir="ltr"
        className={`w-full max-w-lg min-h-16 flex flex-wrap items-center justify-center gap-2 p-3 rounded-2xl border-4 border-dashed transition-colors
          ${done && correctSoFar ? 'border-green-400 bg-green-50' : done ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-slate-50'}`}
      >
        {built.length === 0 && <span className="text-slate-300 font-black">…</span>}
        {built.map((w, i) => (
          <span key={i} className="anim-pop bg-cyan-500 text-white font-black text-lg md:text-xl px-3 py-1.5 rounded-xl border-b-4 border-cyan-700">
            {w}
          </span>
        ))}
      </div>

      {/* scrambled pool */}
      <div className="flex flex-wrap justify-center gap-2 max-w-lg" dir="ltr">
        {tiles.map((tile) => {
          const used = picked.includes(tile.id)
          return (
            <button
              key={tile.id}
              onClick={() => take(tile)}
              disabled={disabled || used || done}
              className={`min-h-12 px-3.5 rounded-xl text-lg md:text-xl font-black border-b-4 transition-all shadow
                ${used
                  ? 'bg-slate-100 text-slate-300 border-slate-200'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-cyan-50 active:border-b-0 active:translate-y-1'}`}
            >
              {tile.word}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={disabled || done || picked.length === 0}
          className="min-h-11 px-4 rounded-xl bg-red-400 text-white font-black border-b-4 border-red-600 flex items-center gap-1.5 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-40"
        >
          <Delete size={18} />
        </button>
        <button
          onClick={() => speak(question.words.join(' '), { lang: 'en', rate: 0.8 })}
          className="min-h-11 px-4 rounded-xl bg-cyan-500 text-white font-black border-b-4 border-cyan-700 flex items-center gap-1.5 active:border-b-0 active:translate-y-1 transition-all"
          aria-label="Hear the sentence"
        >
          <Volume2 size={18} />
        </button>
      </div>
    </div>
  )
}
