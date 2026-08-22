import { useEffect, useRef, useState } from 'react'
import { X, Coins, Trophy, Skull, Minus, Sparkles, ChevronUp } from 'lucide-react'
import { usePlayer } from '../context/PlayerContext.jsx'
import mathQ from '../data/questions/math.json'
import englishQ from '../data/questions/english.json'
import hebrewQ from '../data/questions/hebrew.json'
import geographyQ from '../data/questions/geography.json'
import NumberPad from './widgets/NumberPad.jsx'
import LetterTiles from './widgets/LetterTiles.jsx'
import WordTap from './widgets/WordTap.jsx'
import MapGrid from './widgets/MapGrid.jsx'
import { placeName } from './widgets/israelCities.js'

const BANKS = { math: mathQ, english: englishQ, hebrew: hebrewQ, geography: geographyQ }
const WIDGETS = { numberpad: NumberPad, lettertiles: LetterTiles, wordtap: WordTap, mapgrid: MapGrid }

function sample(bank, n) {
  const a = [...bank]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}

function correctAnswerText(eventId, q) {
  if (eventId === 'math') return q.a
  if (eventId === 'english') return q.word
  if (eventId === 'hebrew') return q.sentence[q.target]
  if (eventId === 'geography') return placeName(q.answer)
  return ''
}

function questionPrompt(eventId, q) {
  if (eventId === 'math') return { text: `${q.q} = ?`, dir: 'ltr' }
  if (eventId === 'english') return { text: 'SPELL IT!', dir: 'ltr' }
  if (eventId === 'hebrew') return { text: 'קראו את המשפט', dir: 'rtl' }
  if (eventId === 'geography') return { text: q.q, dir: 'rtl' }
  return { text: '', dir: 'ltr' }
}

export default function MatchEngine({ event, practice, onExit, onPlayAgain }) {
  const { state, dispatch, config } = usePlayer()
  const N = config.questionsPerMatch

  const [questions] = useState(() => sample(BANKS[event.id], N))
  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState('ask') // ask | feedback | results
  const [remaining, setRemaining] = useState(config.questionTimerSec)
  const [feedback, setFeedback] = useState(null) // { correct, gained }
  const [correctCount, setCorrectCount] = useState(0)
  const [coinsEarned, setCoinsEarned] = useState(0)

  const qStartRef = useRef(Date.now())
  const totalTimeRef = useRef(0)
  const reportedRef = useRef(false)
  const startLevelRef = useRef(state.level)

  const total = questions.length
  const question = questions[qIndex]
  const Widget = WIDGETS[event.widget]

  // per-question countdown
  useEffect(() => {
    if (phase !== 'ask') return
    qStartRef.current = Date.now()
    setRemaining(config.questionTimerSec)
    const interval = setInterval(() => {
      const elapsed = (Date.now() - qStartRef.current) / 1000
      const left = config.questionTimerSec - elapsed
      if (left <= 0) {
        clearInterval(interval)
        handleAnswer(false, true)
      } else {
        setRemaining(left)
      }
    }, 100)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qIndex])

  function handleAnswer(isCorrect, timedOut = false) {
    if (phase !== 'ask') return
    const elapsed = timedOut ? config.questionTimerSec : (Date.now() - qStartRef.current) / 1000
    totalTimeRef.current += elapsed

    let gained = 0
    if (isCorrect) {
      gained = config.coinsPerCorrect + (elapsed < config.speedThresholdSec ? config.speedBonusCoins : 0)
      setCorrectCount((c) => c + 1)
      setCoinsEarned((c) => c + gained)
    }
    setFeedback({ correct: isCorrect, gained, timedOut })
    setPhase('feedback')
  }

  // feedback pause, then advance
  useEffect(() => {
    if (phase !== 'feedback') return
    const timer = setTimeout(() => {
      setFeedback(null)
      if (qIndex + 1 < total) {
        setQIndex((i) => i + 1)
        setPhase('ask')
      } else {
        setPhase('results')
      }
    }, feedback?.correct ? 1200 : 2200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // report result exactly once
  const isWin = correctCount >= config.winThreshold
  const isDraw = !isWin && correctCount >= config.drawThreshold
  const resultLabel = isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'
  const finalCoins = coinsEarned + (isWin ? config.winBonusCoins : 0)
  const xpEarned = correctCount * config.xpPerCorrect

  useEffect(() => {
    if (phase !== 'results' || reportedRef.current) return
    reportedRef.current = true
    dispatch({
      type: 'MATCH_RESULT',
      eventId: event.id,
      subject: event.title,
      result: resultLabel,
      correct: correctCount,
      coinsEarned: finalCoins,
      xpEarned,
      avgTimeSec: Math.round((totalTimeRef.current / total) * 10) / 10,
      practice,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const leveledUp = state.level > startLevelRef.current
  const timerPct = (remaining / config.questionTimerSec) * 100
  const prompt = question ? questionPrompt(event.id, question) : { text: '', dir: 'ltr' }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-blue-950/95 backdrop-blur-sm">
      {phase !== 'results' && question && (
        <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-3 md:p-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {/* top bar: exit, progress, practice badge */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onExit}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
            >
              <X size={22} strokeWidth={3} />
            </button>
            <div className="flex-1 flex gap-1.5">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`h-3 flex-1 rounded-full ${
                    i < qIndex ? 'bg-yellow-400' : i === qIndex ? 'bg-white' : 'bg-white/20'
                  }`}
                ></div>
              ))}
            </div>
            <span className="text-white font-black text-lg shrink-0">{qIndex + 1}/{total}</span>
            {practice && (
              <span className="bg-blue-500 text-white text-xs font-black px-3 py-1 rounded-full border-2 border-blue-300 shrink-0">
                PRACTICE
              </span>
            )}
          </div>

          {/* timer bar */}
          <div className="h-4 bg-black/40 rounded-full border-2 border-black/40 overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${
                timerPct > 50 ? 'bg-green-500' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
              }`}
              style={{ width: `${timerPct}%` }}
            ></div>
          </div>

          {/* question card */}
          <div
            className={`flex-1 bg-white rounded-3xl border-8 border-slate-800 shadow-2xl flex flex-col items-center justify-center gap-4 md:gap-6 p-4 md:p-6 overflow-y-auto relative ${
              feedback && !feedback.correct ? 'anim-shake' : ''
            } ${feedback ? (feedback.correct ? 'outline outline-8 outline-green-400' : 'outline outline-8 outline-red-400') : ''}`}
          >
            <div className={`${event.headerColor} px-6 py-2 rounded-full border-b-4 border-black/20`}>
              <span className="text-white font-black uppercase italic tracking-wider drop-shadow-sm">{event.title}</span>
            </div>

            <p className="text-2xl md:text-4xl lg:text-5xl font-black text-slate-800 text-center" dir={prompt.dir}>
              {prompt.text}
            </p>

            <Widget key={qIndex} question={question} disabled={phase !== 'ask'} onAnswer={(ok) => handleAnswer(ok)} />

            {/* feedback overlay strip */}
            {feedback && (
              <div
                className={`absolute bottom-0 left-0 right-0 py-3 px-6 text-center font-black text-white text-xl anim-pop ${
                  feedback.correct ? 'bg-green-500' : 'bg-red-500'
                }`}
                dir="rtl"
              >
                {feedback.correct ? (
                  <span className="flex items-center justify-center gap-2">
                    מעולה! {!practice && <span className="flex items-center gap-1"><Coins size={20} className="fill-yellow-200 text-yellow-200" /> +{feedback.gained}</span>}
                  </span>
                ) : feedback.timedOut ? (
                  <span>נגמר הזמן! התשובה: {correctAnswerText(event.id, question)}</span>
                ) : (
                  <span>לא נורא! התשובה: {correctAnswerText(event.id, question)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {phase === 'results' && (
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          {isWin && <Confetti />}
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-md overflow-hidden relative z-10">
            <div
              className={`p-6 text-center border-b-8 border-black/10 ${
                isWin ? 'bg-gradient-to-br from-green-400 to-green-600' : isDraw ? 'bg-gradient-to-br from-slate-400 to-slate-600' : 'bg-gradient-to-br from-red-400 to-red-600'
              }`}
            >
              <div className="w-20 h-20 mx-auto bg-white rounded-2xl border-4 border-slate-200 flex items-center justify-center mb-2 shadow-lg rotate-3">
                {isWin ? <Trophy className="text-yellow-500 fill-yellow-200 w-12 h-12" /> : isDraw ? <Minus className="text-slate-500 w-12 h-12" strokeWidth={4} /> : <Skull className="text-red-500 w-12 h-12" />}
              </div>
              <h2 className="text-4xl font-black text-white uppercase italic tracking-wide drop-shadow-md">{resultLabel}!</h2>
            </div>

            <div className="p-6 flex flex-col items-center gap-4 bg-slate-50">
              <p className="text-2xl font-black text-slate-700" dir="rtl">
                {correctCount} מתוך {total} נכונות!
              </p>

              {leveledUp && (
                <div className="flex items-center gap-2 bg-orange-100 border-4 border-orange-300 px-5 py-2 rounded-2xl anim-pop">
                  <ChevronUp className="text-orange-500" size={26} strokeWidth={4} />
                  <span className="font-black text-orange-600 text-xl uppercase">Level Up! LVL {state.level}</span>
                </div>
              )}

              <div className="flex gap-3 w-full">
                <div className="flex-1 bg-white border-4 border-slate-200 rounded-2xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-yellow-500 font-black text-2xl">
                    <Coins size={22} className="fill-yellow-200" /> {practice ? 0 : finalCoins}
                  </div>
                  <span className="text-xs font-bold text-slate-400 uppercase">Coins</span>
                </div>
                <div className="flex-1 bg-white border-4 border-slate-200 rounded-2xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-500 font-black text-2xl">
                    <Sparkles size={22} /> {xpEarned}
                  </div>
                  <span className="text-xs font-bold text-slate-400 uppercase">XP</span>
                </div>
              </div>

              {practice && (
                <p className="text-sm font-bold text-blue-600" dir="rtl">משחק אימון — בלי מטבעות, רק XP</p>
              )}
              {isWin && !practice && (
                <p className="text-sm font-bold text-green-600" dir="rtl">כולל בונוס ניצחון +{config.winBonusCoins}!</p>
              )}

              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={onPlayAgain}
                  className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-blue-700 active:border-b-0 active:translate-y-2 transition-all"
                >
                  Again?
                </button>
                <button
                  onClick={onExit}
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

const CONFETTI_COLORS = ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa']

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 2.2 + Math.random() * 1.8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 8 + Math.random() * 8,
  }))
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece absolute rounded-sm"
          style={{
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        ></div>
      ))}
    </div>
  )
}
