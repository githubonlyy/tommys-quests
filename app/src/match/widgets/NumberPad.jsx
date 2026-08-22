import { useState } from 'react'
import { Delete, Check } from 'lucide-react'

// Math answer input: builds a digit string, OK submits
export default function NumberPad({ question, disabled, onAnswer }) {
  const [value, setValue] = useState('')

  const press = (d) => {
    if (disabled || value.length >= 4) return
    setValue(value + d)
  }
  const backspace = () => !disabled && setValue(value.slice(0, -1))
  const submit = () => {
    if (disabled || value === '') return
    onAnswer(value === question.a)
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xs mx-auto">
      <div className="w-full bg-slate-900 text-yellow-400 font-black text-4xl text-center py-3 rounded-2xl border-4 border-slate-700 shadow-inner min-h-[64px] tracking-widest">
        {value || <span className="text-slate-600">?</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 w-full">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            disabled={disabled}
            className="bg-white text-slate-800 text-2xl font-black py-3 rounded-xl border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all shadow disabled:opacity-50"
          >
            {k}
          </button>
        ))}
        <button
          onClick={backspace}
          disabled={disabled}
          className="bg-red-400 text-white py-3 rounded-xl border-b-4 border-red-600 active:border-b-0 active:translate-y-1 transition-all shadow flex items-center justify-center disabled:opacity-50"
        >
          <Delete size={26} />
        </button>
        <button
          onClick={() => press('0')}
          disabled={disabled}
          className="bg-white text-slate-800 text-2xl font-black py-3 rounded-xl border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all shadow disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={disabled || value === ''}
          className="bg-green-500 text-white py-3 rounded-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all shadow flex items-center justify-center disabled:opacity-50"
        >
          <Check size={26} strokeWidth={3} />
        </button>
      </div>
    </div>
  )
}
