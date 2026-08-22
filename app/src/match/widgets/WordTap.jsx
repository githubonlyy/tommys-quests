// Hebrew grammar: tap the requested word (verb / noun) in the sentence
export default function WordTap({ question, disabled, onAnswer }) {
  return (
    <div className="flex flex-col items-center gap-6 w-full" dir="rtl">
      <div className="bg-purple-100 border-4 border-purple-200 px-6 py-2 rounded-full">
        <span className="text-xl font-black text-purple-700">מצאו את ה{question.ask}</span>
      </div>

      <div className="flex gap-3 justify-center flex-wrap max-w-lg">
        {question.sentence.map((word, i) => (
          <button
            key={i}
            onClick={() => !disabled && onAnswer(i === question.target)}
            disabled={disabled}
            className="bg-white text-slate-800 text-2xl md:text-3xl font-black px-5 py-3 rounded-2xl border-b-4 border-slate-300 hover:bg-purple-50 hover:border-purple-300 active:border-b-0 active:translate-y-1 transition-all shadow disabled:opacity-60"
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  )
}
