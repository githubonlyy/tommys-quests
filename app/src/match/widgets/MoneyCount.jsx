import NumberPad from './NumberPad.jsx'

// coin denominations render as circles, notes as bills
const COIN_STYLES = {
  1: 'bg-gradient-to-br from-slate-200 to-slate-400 border-slate-500 text-slate-700',
  2: 'bg-gradient-to-br from-slate-200 to-slate-400 border-slate-500 text-slate-700',
  5: 'bg-gradient-to-br from-slate-300 to-slate-500 border-slate-600 text-slate-800',
  10: 'bg-gradient-to-br from-yellow-200 to-amber-400 border-amber-600 text-amber-900',
}
const NOTE_STYLES = {
  20: 'bg-gradient-to-br from-red-200 to-red-300 border-red-500 text-red-800',
  50: 'bg-gradient-to-br from-purple-200 to-purple-300 border-purple-500 text-purple-800',
  100: 'bg-gradient-to-br from-orange-200 to-orange-300 border-orange-500 text-orange-800',
}

export const moneySum = (items) => items.reduce((s, v) => s + v, 0)

// Shekel counting: coins/notes shown, answer typed on the number pad.
export default function MoneyCount({ question, disabled, onAnswer }) {
  const total = moneySum(question.items)

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* the money on the table */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-md bg-emerald-50 border-4 border-emerald-200 rounded-2xl p-4" dir="ltr">
        {question.items.map((v, i) =>
          v >= 20 ? (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-20 h-11 rounded-lg border-4 font-black text-lg shadow-md -rotate-1 ${NOTE_STYLES[v]}`}
            >
              ₪{v}
            </span>
          ) : (
            <span
              key={i}
              className={`inline-flex items-center justify-center w-12 h-12 rounded-full border-4 font-black text-base shadow-md rotate-2 ${COIN_STYLES[v]}`}
            >
              ₪{v}
            </span>
          ),
        )}
      </div>

      {/* the NumberPad only reads question.a — hand it the sum */}
      <NumberPad question={{ a: String(total) }} disabled={disabled} onAnswer={onAnswer} />
    </div>
  )
}
