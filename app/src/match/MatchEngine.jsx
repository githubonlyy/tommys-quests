import { useEffect, useRef, useState } from 'react'
import { X, Coins, Trophy, Skull, Minus, Sparkles, ChevronUp, Flame, Volume2, VolumeX } from 'lucide-react'
import { sfx, isMuted, setMuted } from './sounds.js'
import { speak, stopSpeaking } from './speak.js'
import { usePlayer } from '../context/PlayerContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import mathQ from '../data/questions/math.json'
import englishQ from '../data/questions/english.json'
import hebrewQ from '../data/questions/hebrew.json'
import geographyQ from '../data/questions/geography.json'
import oppositesQ from '../data/questions/opposites.json'
import clockQ from '../data/questions/clock.json'
import moneyQ from '../data/questions/money.json'
import scienceQ from '../data/questions/science.json'
import timesQ from '../data/questions/times.json'
import readingQ from '../data/questions/reading.json'
import sentencesQ from '../data/questions/sentences.json'
import fractionsQ from '../data/questions/fractions.json'
import wordproblemsQ from '../data/questions/wordproblems.json'
import geometryQ from '../data/questions/geometry.json'
import spellingQ from '../data/questions/spelling.json'
import hebrewreadQ from '../data/questions/hebrewread.json'
import synonymsQ from '../data/questions/synonyms.json'
import holidaysQ from '../data/questions/holidays.json'
import flagsQ from '../data/questions/flags.json'
import bodyQ from '../data/questions/body.json'
import patternsQ from '../data/questions/patterns.json'
import riddlesQ from '../data/questions/riddles.json'
import lettersQ from '../data/questions/letters.json'
import phonicsQ from '../data/questions/phonics.json'
import blendingQ from '../data/questions/blending.json'
import sightwordsQ from '../data/questions/sightwords.json'
import NumberPad from './widgets/NumberPad.jsx'
import LetterTiles from './widgets/LetterTiles.jsx'
import WordTap from './widgets/WordTap.jsx'
import MapGrid from './widgets/MapGrid.jsx'
import BalloonPop from './widgets/BalloonPop.jsx'
import ClockRead, { fmtTime } from './widgets/ClockRead.jsx'
import ListenPick from './widgets/ListenPick.jsx'
import ReadPick from './widgets/ReadPick.jsx'
import SentenceOrder from './widgets/SentenceOrder.jsx'
import FractionPick from './widgets/FractionPick.jsx'
import PatternPick from './widgets/PatternPick.jsx'
import MoneyCount, { moneySum } from './widgets/MoneyCount.jsx'
import PairsBoard from './PairsBoard.jsx'
import VaultReveal from './VaultReveal.jsx'
import { PLACES, placeName } from './widgets/israelCities.js'
import { TROPHIES } from '../data/trophies.js'

const BANKS = {
  math: mathQ, english: englishQ, hebrew: hebrewQ, geography: geographyQ,
  clock: clockQ, money: moneyQ, science: scienceQ, times: timesQ,
  listening: englishQ, reading: readingQ, sentences: sentencesQ,
  fractions: fractionsQ, wordproblems: wordproblemsQ, geometry: geometryQ,
  spelling: spellingQ, hebrewread: hebrewreadQ, synonyms: synonymsQ,
  holidays: holidaysQ, flags: flagsQ, body: bodyQ,
  patterns: patternsQ, riddles: riddlesQ,
  letters: lettersQ, phonics: phonicsQ, blending: blendingQ, sightwords: sightwordsQ,
}
const WIDGETS = {
  numberpad: NumberPad, lettertiles: LetterTiles, wordtap: WordTap, mapgrid: MapGrid,
  clockread: ClockRead, moneycount: MoneyCount, balloon: BalloonPop,
  listenpick: ListenPick, readpick: ReadPick, sentenceorder: SentenceOrder,
  fractionpick: FractionPick, patternpick: PatternPick,
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const sample = (bank, n) => shuffle(bank).slice(0, Math.min(n, bank.length))
const pickOthers = (bank, exclude, n, key) =>
  shuffle(bank.filter((x) => x[key] !== exclude)).slice(0, n).map((x) => x[key])

/* ---- balloon mode: turn a bank question into a 4-option pick ---- */
function mathDistractors(answer) {
  const a = parseInt(answer, 10)
  const pool = new Set()
  const candidates = [a + 1, a - 1, a + 2, a - 2, a + 10, a - 10, a + 5, a - 5]
  for (const c of shuffle(candidates)) {
    if (c > 0 && c !== a) pool.add(String(c))
    if (pool.size === 3) break
  }
  return [...pool]
}

// subjects whose bank already ships its own decoys need no distractor logic
const DECOY_BANKS = ['science', 'geometry', 'spelling', 'synonyms', 'holidays', 'flags', 'body', 'riddles']

// { q, a, decoys } -> a four-way pick, keeping any extra fields the widget needs
function buildChoice(q, extra = {}) {
  return {
    ...extra,
    prompt: q.q,
    dir: 'rtl',
    answerText: q.a,
    options: shuffle([{ label: q.a, correct: true }, ...q.decoys.map((d) => ({ label: d, correct: false }))]),
  }
}

function buildBalloon(eventId, q, sourceBank) {
  let prompt, dir, emoji = null, correct, decoys
  if (eventId === 'math' || eventId === 'times') {
    prompt = `${q.q} = ?`; dir = 'ltr'
    correct = q.a; decoys = mathDistractors(q.a)
  } else if (DECOY_BANKS.includes(eventId)) {
    prompt = q.q; dir = 'rtl'
    correct = q.a; decoys = q.decoys
  } else if (eventId === 'english') {
    prompt = q.hint; dir = 'rtl'; emoji = q.emoji
    correct = q.word; decoys = pickOthers(sourceBank, q.word, 3, 'word')
  } else if (eventId === 'hebrew') {
    prompt = `מה ההפך של "${q.q}"?`; dir = 'rtl'
    correct = q.a; decoys = pickOthers(sourceBank, q.a, 3, 'a')
  } else {
    prompt = q.q; dir = 'rtl'
    correct = placeName(q.answer)
    decoys = shuffle(PLACES.filter((p) => p.id !== q.answer)).slice(0, 3).map((p) => p.name)
  }
  return {
    prompt,
    dir,
    emoji,
    answerText: correct,
    options: shuffle([{ label: correct, correct: true }, ...decoys.map((d) => ({ label: d, correct: false }))]),
  }
}

/* ---- pairs mode: build 6 matching pairs from a bank ---- */
function buildPairs(eventId, count) {
  if (eventId === 'english') {
    return sample(englishQ, count).map((q, i) => ({ id: i, a: q.word, b: q.hint }))
  }
  // math/times: exercise <-> result; avoid two exercises sharing the same answer
  const bank = eventId === 'times' ? timesQ : mathQ
  const seen = new Set()
  const uniq = shuffle(bank).filter((q) => (seen.has(q.a) ? false : seen.add(q.a)))
  return uniq.slice(0, count).map((q, i) => ({ id: i, a: q.q, b: q.a }))
}

// heard word -> four Hebrew meanings
function buildListening(q, bank) {
  const decoys = pickOthers(bank, q.hint, 3, 'hint')
  return {
    word: q.word,
    key: 'match.whatDidYouHear',
    dir: 'rtl',
    answerText: q.hint,
    options: shuffle([{ label: q.hint, correct: true }, ...decoys.map((d) => ({ label: d, correct: false }))]),
  }
}

// English sentence -> Hebrew comprehension question
function buildReading(q) {
  return {
    text: q.text,
    prompt: q.q,
    dir: 'rtl',
    answerText: q.a,
    options: shuffle([{ label: q.a, correct: true }, ...q.decoys.map((d) => ({ label: d, correct: false }))]),
  }
}

function classicAnswerText(eventId, q) {
  if (eventId === 'math' || eventId === 'times') return q.a
  if (eventId === 'english') return q.word
  if (eventId === 'hebrew') return q.sentence[q.target]
  if (eventId === 'geography') return placeName(q.answer)
  if (eventId === 'clock') return fmtTime(q.h, q.m)
  if (eventId === 'money') return `₪${moneySum(q.items)}`
  if (eventId === 'sentences') return q.words.join(' ')
  if (eventId === 'wordproblems') return q.a
  return ''
}

function classicPrompt(eventId, q) {
  if (eventId === 'math' || eventId === 'times') return { text: `${q.q} = ?`, dir: 'ltr' }
  if (eventId === 'english') return { key: 'match.spellIt', dir: 'ltr' }
  if (eventId === 'hebrew') return { key: 'match.readSentence', dir: 'rtl' }
  if (eventId === 'geography') return { text: q.q, dir: 'rtl' }
  if (eventId === 'clock') return { key: 'match.whatTime', dir: 'rtl' }
  if (eventId === 'money') return { key: 'match.howMuch', dir: 'rtl' }
  if (eventId === 'sentences') return { key: 'match.buildSentence', dir: 'rtl' }
  if (eventId === 'wordproblems') return { text: q.q, dir: 'rtl' }
  return { text: '', dir: 'ltr' }
}

export default function MatchEngine({ event, mode = 'classic', practice, onExit, onPlayAgain }) {
  const { t, name } = useLang()
  const { state, dispatch, config } = usePlayer()
  const N = config.questionsPerMatch
  const isPairs = mode === 'pairs'
  // 0 turns the countdown off entirely — no clock pressure on a question
  const hasTimer = config.questionTimerSec > 0

  const [questions] = useState(() => {
    if (isPairs) return []
    // science's classic widget IS the balloon picker — same prepared format
    if (event.id === 'fractions') {
      return sample(fractionsQ, N).map((q) => buildChoice({ ...q, q: 'איזה חלק צבוע?' }, { num: q.num, den: q.den }))
    }
    if (event.id === 'patterns') return sample(patternsQ, N).map((q) => buildChoice({ ...q, q: 'מה בא אחר כך?' }, { seq: q.seq }))
    if (['hebrewread', 'letters', 'phonics', 'blending', 'sightwords'].includes(event.id)) {
      return sample(BANKS[event.id], N).map((q) => buildChoice(q, { text: q.text }))
    }
    if (event.id === 'listening') return sample(englishQ, N).map((q) => buildListening(q, englishQ))
    if (event.id === 'reading') return sample(readingQ, N).map(buildReading)
    if (mode === 'balloon' || event.widget === 'balloon') {
      const source = event.id === 'hebrew' && mode === 'balloon' ? oppositesQ : BANKS[event.id]
      return sample(source, N).map((q) => buildBalloon(event.id, q, source))
    }
    return sample(BANKS[event.id], N)
  })
  const [pairsData] = useState(() => (isPairs ? buildPairs(event.id, config.pairs.pairCount) : null))

  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState(isPairs ? 'board' : 'ask') // ask | feedback | board | results
  const [remaining, setRemaining] = useState(config.questionTimerSec)
  const [feedback, setFeedback] = useState(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const [pairsOutcome, setPairsOutcome] = useState(null)
  const [revealDone, setRevealDone] = useState(false)
  const [streak, setStreak] = useState(0)
  const [muted, setMutedState] = useState(isMuted())

  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
  }

  const qStartRef = useRef(Date.now())
  const totalTimeRef = useRef(0)
  const reportedRef = useRef(false)
  const startLevelRef = useRef(state.level)
  const startTrophiesRef = useRef(Object.keys(state.trophies ?? {}))

  const total = questions.length
  const question = questions[qIndex]
  const usesBalloon = mode === 'balloon' || event.widget === 'balloon'
  const Widget = mode === 'balloon' ? BalloonPop : WIDGETS[event.widget]

  // per-question countdown (question modes only)
  useEffect(() => {
    if (phase !== 'ask') return
    qStartRef.current = Date.now()
    if (!hasTimer) return
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

  // English vocabulary: say the word itself once it is revealed, so a miss
  // still teaches the pronunciation
  useEffect(() => {
    if (phase !== 'feedback' || event.id !== 'english' || !answerText) return
    speak(answerText, { delay: 350, lang: 'en', rate: 0.85 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // fxDelay: widget is playing its own effect (pop, pin drop...) — the answer is
  // locked in NOW (timer frozen), feedback overlay appears after the fx finishes.
  function handleAnswer(isCorrect, timedOut = false, fxDelay = 0) {
    if (phase !== 'ask') return
    const elapsed = timedOut ? config.questionTimerSec : (Date.now() - qStartRef.current) / 1000
    totalTimeRef.current += elapsed

    let gained = 0
    if (isCorrect) {
      gained = config.coinsPerCorrect + (elapsed < config.speedThresholdSec ? config.speedBonusCoins : 0)
      setCorrectCount((c) => c + 1)
      setCoinsEarned((c) => c + gained)
      setStreak((s) => s + 1)
    } else {
      setStreak(0)
    }

    const showFeedback = () => {
      if (!usesBalloon) (isCorrect ? sfx.ding : sfx.buzz)() // balloon pops/buzzes itself
      setFeedback({ correct: isCorrect, gained, timedOut })
      setPhase('feedback')
    }
    if (fxDelay > 0) {
      setPhase('fxwait') // freezes the countdown while the widget animates
      setTimeout(showFeedback, fxDelay)
    } else {
      showFeedback()
    }
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

  function handleBoardFinish({ pairs, wrongFlips, elapsedSec, timedOut }) {
    const pcfg = config.pairs
    const complete = pairs === pcfg.pairCount
    const win = complete && !timedOut && wrongFlips <= pcfg.maxWrongForWin
    const resultLabel = win ? 'WIN' : complete ? 'DRAW' : 'LOSS'
    setPairsOutcome({
      correct: pairs,
      total: pcfg.pairCount,
      coins: pairs * pcfg.coinsPerPair + (win ? config.winBonusCoins : 0),
      xp: pairs * pcfg.xpPerPair,
      resultLabel,
      avgTimeSec: Math.round((elapsedSec / Math.max(1, pairs)) * 10) / 10,
    })
    setPhase('results')
  }

  /* ---- unified result values across modes ---- */
  const qIsWin = correctCount >= config.winThreshold
  const qIsDraw = !qIsWin && correctCount >= config.drawThreshold
  const unified = isPairs && pairsOutcome
    ? {
        correct: pairsOutcome.correct,
        totalUnits: pairsOutcome.total,
        resultLabel: pairsOutcome.resultLabel,
        finalCoins: pairsOutcome.coins,
        xpEarned: pairsOutcome.xp,
        avgTimeSec: pairsOutcome.avgTimeSec,
      }
    : {
        correct: correctCount,
        totalUnits: total,
        resultLabel: qIsWin ? 'WIN' : qIsDraw ? 'DRAW' : 'LOSS',
        finalCoins: coinsEarned + (qIsWin ? config.winBonusCoins : 0),
        xpEarned: correctCount * config.xpPerCorrect,
        avgTimeSec: Math.round((totalTimeRef.current / Math.max(1, total)) * 10) / 10,
      }
  const isWin = unified.resultLabel === 'WIN'
  const isDraw = unified.resultLabel === 'DRAW'

  // report result exactly once
  useEffect(() => {
    if (phase !== 'results' || reportedRef.current) return
    reportedRef.current = true
    if (unified.resultLabel === 'WIN') sfx.fanfare()
    // he hears his own name at the moment that matters most
    speak(t(`result.say.${unified.resultLabel}`, { name: state.name }), { delay: 900 })
    dispatch({
      type: 'MATCH_RESULT',
      eventId: event.id,
      subject: event.title,
      result: unified.resultLabel,
      correct: unified.correct,
      total: unified.totalUnits,
      coinsEarned: unified.finalCoins,
      xpEarned: unified.xpEarned,
      avgTimeSec: unified.avgTimeSec,
      practice,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const leveledUp = state.level > startLevelRef.current
  const newTrophies = Object.keys(state.trophies ?? {})
    .filter((id) => !startTrophiesRef.current.includes(id))
    .map((id) => TROPHIES.find((t) => t.id === id))
    .filter(Boolean)
  const timerPct = hasTimer ? (remaining / config.questionTimerSec) * 100 : 100
  const prompt = !isPairs && question
    ? question.options ? { text: question.prompt, key: question.key, dir: question.dir } : classicPrompt(event.id, question)
    : { text: '', dir: 'ltr' }
  const answerText = question ? (question.options ? question.answerText : classicAnswerText(event.id, question)) : ''

  // read the prompt aloud: Hebrew by default, English voice for Latin text
  // (so the vocabulary he hears in Alien Decode is pronounced correctly)
  useEffect(() => {
    if (phase !== 'ask' || !question) return
    // the listening drill owns its own audio — a prompt here would cut the word off
    if (event.widget === 'listenpick') return
    const text = prompt.key ? t(prompt.key) : prompt.text
    if (!text) return
    const latinOnly = !/[֐-׿]/.test(text)
    speak(text, { delay: 250, lang: latinOnly ? 'en' : 'he' })
    return () => stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qIndex])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-blue-950/95 backdrop-blur-sm">
      {phase !== 'results' && (
        <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-3 md:p-6 short:p-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {/* top bar */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onExit}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
            >
              <X size={22} strokeWidth={3} />
            </button>
            {!isPairs && (
              <>
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
                <span className="text-white font-black text-lg shrink-0 tabular-nums">{qIndex + 1}/{total}</span>
              </>
            )}
            {isPairs && (
              <span className="flex-1 text-white font-black text-lg uppercase italic tracking-wide">{t('match.pairs')}</span>
            )}
            {!isPairs && streak >= 3 && (
              <span key={streak} className="anim-streak-pop flex items-center gap-1 bg-orange-500 text-white text-sm font-black px-2.5 py-1 rounded-full border-2 border-orange-300 shrink-0">
                <Flame size={16} className="fill-yellow-300 text-yellow-200" /> x{streak}
              </span>
            )}
            {practice && (
              <span className="bg-blue-500 text-white text-xs font-black px-3 py-1 rounded-full border-2 border-blue-300 shrink-0">
                {t('match.practice')}
              </span>
            )}
            <button
              onClick={toggleMute}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors shrink-0"
              aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>

          {/* per-question timer (question modes) */}
          {!isPairs && hasTimer && (
            <div className="h-4 bg-black/40 rounded-full border-2 border-black/40 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-[width] duration-100 ${
                  timerPct > 50 ? 'bg-green-500' : timerPct > 25 ? 'bg-yellow-400' : 'bg-red-500'
                }`}
                style={{ width: `${timerPct}%` }}
              ></div>
            </div>
          )}

          {/* PAIRS BOARD */}
          {isPairs && (
            <div className="flex-1 flex flex-col justify-center">
              <PairsBoard
                event={event}
                pairs={pairsData}
                timerSec={config.pairs.timerSec}
                onFinish={handleBoardFinish}
              />
            </div>
          )}

          {/* QUESTION CARD (classic + balloon) */}
          {!isPairs && question && (
            <div
              key={qIndex}
              className={`anim-slide-in-q flex-1 bg-white rounded-3xl border-8 border-slate-800 shadow-2xl flex flex-col items-center justify-center gap-4 md:gap-6 short:gap-2 p-4 md:p-6 short:p-2 overflow-y-auto relative ${
                feedback && !feedback.correct ? 'anim-shake' : ''
              } ${feedback ? (feedback.correct ? 'outline outline-8 outline-green-400' : 'outline outline-8 outline-red-400') : ''}`}
            >
              <div className={`${event.headerColor} px-6 py-2 rounded-full border-b-4 border-black/20`}>
                <span className="text-white font-black uppercase italic tracking-wider drop-shadow-sm">
                  {mode === 'balloon' ? t('mode.balloon') : name(event)}
                </span>
              </div>

              <p className="text-2xl md:text-4xl lg:text-5xl short:text-xl font-black text-slate-800 text-center" dir={prompt.dir}>
                {prompt.key ? t(prompt.key) : prompt.text}
              </p>

              <Widget key={qIndex} question={question} disabled={phase !== 'ask'} onAnswer={(ok, fxDelay = 0) => handleAnswer(ok, false, fxDelay)} />

              {/* floating coin gain */}
              {feedback?.correct && !practice && (
                <div className="anim-float-up absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-1 text-yellow-500 font-black text-2xl pointer-events-none z-10">
                  <Coins size={22} className="fill-yellow-200" /> +{feedback.gained}
                </div>
              )}

              {feedback && (
                <div
                  className={`absolute bottom-0 start-0 end-0 py-3 px-6 text-center font-black text-white text-xl anim-pop ${
                    feedback.correct ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  dir="rtl"
                >
                  {feedback.correct ? (
                    <span className="flex items-center justify-center gap-2">
                      {t('match.great')} {!practice && <span className="flex items-center gap-1"><Coins size={20} className="fill-yellow-200 text-yellow-200" /> +{feedback.gained}</span>}
                    </span>
                  ) : feedback.timedOut ? (
                    <span>{t('match.timeUp', { answer: answerText })}</span>
                  ) : (
                    <span>{t('match.wrong', { answer: answerText })}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* RESULTS — vault finale */}
      {phase === 'results' && (
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden overflow-y-auto">
          {isWin && <Confetti />}
          <div className="anim-zoom-in bg-white rounded-3xl border-8 border-slate-800 shadow-2xl w-full max-w-md overflow-hidden relative z-10 my-auto">
            <div
              className={`p-4 md:p-5 text-center border-b-8 border-black/10 ${
                isWin ? 'bg-gradient-to-br from-green-400 to-green-600' : isDraw ? 'bg-gradient-to-br from-slate-400 to-slate-600' : 'bg-gradient-to-br from-red-400 to-red-600'
              }`}
            >
              <h2 className="text-4xl font-black text-white uppercase italic tracking-wide drop-shadow-md flex items-center justify-center gap-3">
                {isWin ? <Trophy className="fill-yellow-200 text-yellow-400" size={34} /> : isDraw ? <Minus size={34} strokeWidth={4} /> : <Skull size={34} />}
                {t(`result.${unified.resultLabel.toLowerCase()}`)}
              </h2>
            </div>

            <div className="p-5 md:p-6 flex flex-col items-center gap-4 bg-slate-50">
              <VaultReveal
                coins={unified.finalCoins}
                xp={unified.xpEarned}
                result={unified.resultLabel}
                practice={practice}
                onDone={() => setRevealDone(true)}
              />

              <div className={`flex flex-col items-center gap-3 w-full transition-opacity duration-500 ${revealDone ? 'opacity-100' : 'opacity-30'}`}>
                <p className="text-xl font-black text-slate-700" dir="rtl">
                  {t('result.score', { correct: unified.correct, total: unified.totalUnits, unit: t(isPairs ? 'result.unit.pairs' : 'result.unit.correct') })}
                </p>

                {leveledUp && (
                  <div className="flex flex-col items-center gap-1 bg-orange-100 border-4 border-orange-300 px-5 py-2 rounded-2xl anim-pop">
                    <div className="flex items-center gap-2">
                      <ChevronUp className="text-orange-500" size={26} strokeWidth={4} />
                      <span className="font-black text-orange-600 text-xl uppercase">{t('result.levelUp', { level: state.level })}</span>
                    </div>

                  </div>
                )}

                {newTrophies.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 bg-yellow-100 border-4 border-yellow-400 px-5 py-2 rounded-2xl anim-pop">
                    <Trophy className="text-yellow-600 fill-yellow-300" size={24} />
                    <span className="font-black text-yellow-700 uppercase">New Trophy! {t.title}</span>
                  </div>
                ))}

                <div className="flex gap-3 w-full">
                  <div className="flex-1 bg-white border-4 border-slate-200 rounded-2xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-yellow-500 font-black text-2xl tabular-nums">
                      <Coins size={22} className="fill-yellow-200" /> {practice ? 0 : unified.finalCoins}
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">{t('common.coins')}</span>
                  </div>
                  <div className="flex-1 bg-white border-4 border-slate-200 rounded-2xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-500 font-black text-2xl tabular-nums">
                      <Sparkles size={22} /> {unified.xpEarned}
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase">{t('common.xp')}</span>
                  </div>
                </div>

                {practice && (
                  <p className="text-sm font-bold text-blue-600" dir="rtl">{t('result.practiceNote')}</p>
                )}
                {isWin && !practice && (
                  <p className="text-sm font-bold text-green-600" dir="rtl">{t('result.winBonus', { bonus: config.winBonusCoins })}</p>
                )}
              </div>

              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={onPlayAgain}
                  className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-blue-700 active:border-b-0 active:translate-y-2 transition-all"
                >
                  {t('result.again')}
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 bg-green-500 hover:bg-green-400 text-white text-lg font-black italic uppercase py-3 rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all"
                >
                  {t('result.exit')}
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
