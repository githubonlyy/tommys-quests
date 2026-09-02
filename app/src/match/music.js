// Chiptune background music — synthesized with WebAudio, no audio files.
// Two looping tracks: 'lobby' (bouncy major) and 'match' (driving minor).
// Separate toggle from sfx; starts only after a user gesture (autoplay policy).

const MUSIC_KEY = 'tommys-quests-music'
let ctx = null
let master = null
let current = null // { name, timer, step, nextTime }
let enabled = (() => {
  try { return localStorage.getItem(MUSIC_KEY) !== '0' } catch { return true }
})()

const midi2freq = (m) => 440 * Math.pow(2, (m - 69) / 12)

// 32 sixteenth-steps (2 bars); 0 = rest
// Eight styles he can pick from. Each is one 2-bar loop played at `bpm` in the
// lobby and at `matchBpm` during a match, so a match feels more urgent without
// needing a second melody per style.
export const TRACKS = {
  chiptune: {
    he: 'שבבים', en: 'Chiptune', emoji: '🎮', bpm: 112, matchBpm: 140,
    melody: [72, 0, 76, 0, 79, 0, 76, 0, 77, 0, 81, 0, 79, 0, 76, 0,
             72, 0, 76, 0, 79, 0, 83, 0, 84, 0, 79, 0, 76, 0, 74, 0],
    bass: [48, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0,
           48, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0, 43, 0, 0, 0],
  },
  epic: {
    he: 'אפי', en: 'Epic', emoji: '⚔️', bpm: 96, matchBpm: 124,
    melody: [69, 0, 0, 0, 72, 0, 76, 0, 77, 0, 0, 0, 76, 0, 72, 0,
             74, 0, 0, 0, 77, 0, 81, 0, 79, 0, 0, 0, 76, 0, 0, 0],
    bass: [45, 0, 0, 0, 45, 0, 0, 0, 41, 0, 0, 0, 41, 0, 0, 0,
           38, 0, 0, 0, 38, 0, 0, 0, 43, 0, 0, 0, 43, 0, 0, 0],
  },
  calm: {
    he: 'רגוע', en: 'Calm', emoji: '🌙', bpm: 84, matchBpm: 104,
    melody: [72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 0, 0,
             74, 0, 0, 0, 77, 0, 0, 0, 81, 0, 0, 0, 79, 0, 0, 0],
    bass: [48, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0,
           50, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0],
  },
  funky: {
    he: 'פאנקי', en: 'Funky', emoji: '🕺', bpm: 120, matchBpm: 146,
    melody: [72, 0, 72, 75, 0, 77, 0, 75, 72, 0, 0, 70, 0, 72, 0, 0,
             75, 0, 75, 77, 0, 79, 0, 77, 75, 0, 0, 72, 0, 70, 0, 0],
    bass: [36, 0, 0, 36, 0, 43, 0, 0, 41, 0, 0, 41, 0, 39, 0, 0,
           36, 0, 0, 36, 0, 43, 0, 0, 44, 0, 0, 44, 0, 43, 0, 0],
  },
  space: {
    he: 'חלל', en: 'Space', emoji: '🚀', bpm: 90, matchBpm: 116,
    melody: [69, 0, 0, 0, 76, 0, 0, 0, 74, 0, 0, 0, 81, 0, 0, 0,
             79, 0, 0, 0, 72, 0, 0, 0, 76, 0, 0, 0, 69, 0, 0, 0],
    bass: [45, 0, 0, 0, 0, 0, 45, 0, 43, 0, 0, 0, 0, 0, 43, 0,
           40, 0, 0, 0, 0, 0, 40, 0, 45, 0, 0, 0, 0, 0, 45, 0],
  },
  sports: {
    he: 'ספורט', en: 'Sports', emoji: '⚽', bpm: 128, matchBpm: 152,
    melody: [72, 0, 72, 0, 79, 0, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0,
             71, 0, 71, 0, 77, 0, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0],
    bass: [48, 0, 48, 0, 48, 0, 0, 0, 43, 0, 43, 0, 43, 0, 0, 0,
           50, 0, 50, 0, 50, 0, 0, 0, 43, 0, 43, 0, 43, 0, 0, 0],
  },
  ninja: {
    he: 'נינג׳ה', en: 'Ninja', emoji: '🥷', bpm: 104, matchBpm: 134,
    melody: [69, 0, 72, 0, 74, 0, 0, 0, 76, 0, 74, 0, 72, 0, 0, 0,
             67, 0, 69, 0, 72, 0, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0],
    bass: [45, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 43, 0, 0, 0,
           40, 0, 0, 0, 40, 0, 0, 0, 45, 0, 0, 0, 45, 0, 0, 0],
  },
  jungle: {
    he: 'ג׳ונגל', en: 'Jungle', emoji: '🦖', bpm: 118, matchBpm: 144,
    melody: [67, 0, 0, 69, 0, 72, 0, 0, 74, 0, 0, 72, 0, 69, 0, 0,
             67, 0, 0, 69, 0, 74, 0, 0, 76, 0, 0, 74, 0, 72, 0, 0],
    bass: [43, 0, 43, 0, 0, 0, 43, 0, 41, 0, 41, 0, 0, 0, 41, 0,
           43, 0, 43, 0, 0, 0, 43, 0, 38, 0, 38, 0, 0, 0, 38, 0],
  },
}

export const TRACK_IDS = Object.keys(TRACKS)
export const DEFAULT_TRACK = 'chiptune'

const TRACK_KEY = 'tommys-quests-track'
let selected = (() => {
  try {
    const v = localStorage.getItem(TRACK_KEY)
    return TRACKS[v] ? v : DEFAULT_TRACK
  } catch { return DEFAULT_TRACK }
})()

export const getTrack = () => selected

/** Pick a style. Restarts whatever is playing so the change is heard at once. */
export function setTrack(id) {
  if (!TRACKS[id] || id === selected) return
  selected = id
  try { localStorage.setItem(TRACK_KEY, id) } catch { /* ignore */ }
  const mode = current?.name ?? pendingName
  if (mode) { clearCurrent(); playMusic(mode) }
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function note(freq, t, dur, type, vol) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function scheduleStep(track, step, t, stepDur) {
  const m = track.melody[step]
  const b = track.bass[step]
  if (m) note(midi2freq(m), t, stepDur * 1.8, 'square', 0.045)
  if (b) note(midi2freq(b), t, stepDur * 3.5, 'triangle', 0.09)
}

export const isMusicOn = () => enabled

export function setMusicOn(v) {
  enabled = v
  try { localStorage.setItem(MUSIC_KEY, v ? '1' : '0') } catch { /* ignore */ }
  if (!v) stopMusic()
}

export function stopMusic() {
  pendingName = null
  if (!current) return
  clearInterval(current.timer)
  current = null
}

/* ---- background behavior ----
   Phone locked, app switched or tab hidden: silence everything and let the
   AudioContext suspend. Coming back resumes the track that was playing. */
let pendingName = null

function clearCurrent() {
  if (!current) return
  clearInterval(current.timer)
  current = null
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const wasPlaying = current?.name ?? pendingName
      if (current) { clearInterval(current.timer); current = null }
      pendingName = wasPlaying
      if (ctx && ctx.state === 'running') ctx.suspend()
    } else {
      const resumeName = pendingName
      pendingName = null
      if (ctx && ctx.state === 'suspended') ctx.resume()
      if (enabled && resumeName) playMusic(resumeName)
    }
  })
}

export function playMusic(name) {
  if (!enabled) return
  if (typeof document !== 'undefined' && document.hidden) { pendingName = name; return }
  if (current?.name === name) return
  const c = ac()
  if (!c) return
  clearCurrent()

  const track = TRACKS[selected] ?? TRACKS[DEFAULT_TRACK]
  const bpm = name === 'match' ? track.matchBpm : track.bpm
  const stepDur = 60 / bpm / 4 // sixteenth note
  const state = { name, step: 0, nextTime: c.currentTime + 0.05, timer: null }

  // lookahead scheduler: keep ~0.35s of audio queued
  state.timer = setInterval(() => {
    if (!ctx) return
    while (state.nextTime < ctx.currentTime + 0.35) {
      scheduleStep(track, state.step, state.nextTime, stepDur)
      state.nextTime += stepDur
      state.step = (state.step + 1) % track.melody.length
    }
  }, 120)
  current = state
}
