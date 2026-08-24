const BALLOON_STYLES = [
  'bg-gradient-to-b from-red-400 to-red-600 border-red-700',
  'bg-gradient-to-b from-blue-400 to-blue-600 border-blue-700',
  'bg-gradient-to-b from-green-400 to-green-600 border-green-700',
  'bg-gradient-to-b from-purple-400 to-purple-600 border-purple-700',
]

// Arcade mode: the answer floats in one of four balloons — pop the right one.
// question is pre-built by MatchEngine: { options: [{label, correct}], emoji? }
export default function BalloonPop({ question, disabled, onAnswer }) {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {question.emoji && <span className="text-6xl">{question.emoji}</span>}

      <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-sm">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => !disabled && onAnswer(opt.correct)}
            disabled={disabled}
            className="anim-float-bob relative flex items-center justify-center aspect-square rounded-full border-b-8 shadow-xl
              active:scale-90 active:border-b-4 transition-transform disabled:opacity-60 select-none
              text-white font-black text-2xl md:text-3xl drop-shadow-md p-2
              max-w-36 mx-auto w-full
              "
            style={{ animationDelay: `${i * 0.35}s` }}
          >
            <span className={`absolute inset-0 rounded-full ${BALLOON_STYLES[i]} border-b-8 -z-10`}></span>
            {/* balloon shine */}
            <span className="absolute top-3 left-4 w-6 h-4 bg-white/40 rounded-full rotate-[-25deg]"></span>
            <span dir="auto" className="break-words leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
