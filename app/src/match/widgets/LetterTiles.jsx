import { useEffect, useMemo, useState } from 'react'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// English spelling: tap letter tiles to fill slots; auto-submits when full
export default function LetterTiles({ question, disabled, onAnswer }) {
  const tiles = useMemo(() => {
    const letters = question.word.split('')
    const decoys = shuffle(ALPHABET.split('').filter((c) => !letters.includes(c))).slice(0, 2)
    return shuffle([...letters, ...decoys]).map((ch, i) => ({ id: i, ch }))
  }, [question])

  // picked: array of tile ids in slot order
  const [picked, setPicked] = useState([])

  const pickTile = (tile) => {
    if (disabled || picked.includes(tile.id) || picked.length >= question.word.length) return
    setPicked([...picked, tile.id])
  }
  const unpick = (slotIdx) => {
    if (disabled) return
    setPicked(picked.filter((_, i) => i !== slotIdx))
  }

  useEffect(() => {
    if (picked.length !== question.word.length) return
    const spelled = picked.map((id) => tiles.find((t) => t.id === id).ch).join('')
    const timer = setTimeout(() => onAnswer(spelled === question.word), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="flex items-center gap-3 bg-slate-100 px-6 py-3 rounded-2xl border-4 border-slate-200">
        <span className="text-5xl">{question.emoji}</span>
        <span className="text-2xl font-black text-slate-700" dir="rtl">{question.hint}</span>
      </div>

      {/* answer slots */}
      <div className="flex gap-2 justify-center flex-wrap" dir="ltr">
        {Array.from({ length: question.word.length }).map((_, i) => {
          const tileId = picked[i]
          const ch = tileId !== undefined ? tiles.find((t) => t.id === tileId).ch : null
          return (
            <button
              key={i}
              onClick={() => tileId !== undefined && unpick(i)}
              className={`w-14 h-14 rounded-xl text-3xl font-black flex items-center justify-center transition-all
                ${ch
                  ? 'bg-cyan-500 text-white border-b-4 border-cyan-700 shadow anim-pop'
                  : 'bg-slate-200 border-4 border-dashed border-slate-300 text-slate-300'}`}
            >
              {ch ?? '_'}
            </button>
          )
        })}
      </div>

      {/* letter pool */}
      <div className="flex gap-2 justify-center flex-wrap max-w-sm" dir="ltr">
        {tiles.map((tile) => {
          const used = picked.includes(tile.id)
          return (
            <button
              key={tile.id}
              onClick={() => pickTile(tile)}
              disabled={disabled || used}
              className={`w-12 h-12 rounded-xl text-2xl font-black flex items-center justify-center border-b-4 transition-all shadow
                ${used
                  ? 'bg-slate-100 text-slate-300 border-slate-200'
                  : 'bg-white text-slate-800 border-slate-300 active:border-b-0 active:translate-y-1'}`}
            >
              {tile.ch}
            </button>
          )
        })}
      </div>
    </div>
  )
}
