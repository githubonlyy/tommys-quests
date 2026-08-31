// Text-to-speech via the browser's SpeechSynthesis. Hebrew for prompts and
// instructions, English for vocabulary words so the pronunciation he hears in
// Alien Decode is correct. No-ops silently when the device has no engine or
// no matching voice.

const SPEAK_KEY = 'tommys-quests-speech'
let enabled = (() => {
  try { return localStorage.getItem(SPEAK_KEY) !== '0' } catch { return true }
})()
let voices = { he: null, en: null }
let voicesLoaded = false

function synth() {
  return typeof window !== 'undefined' ? window.speechSynthesis : null
}

// prefer a natural/online voice, else any voice for that language tag
function bestVoice(list, prefix) {
  return (
    list.find((v) => prefix.test(v.lang) && /natural|online|google/i.test(v.name)) ||
    list.find((v) => prefix.test(v.lang)) ||
    null
  )
}

function pickVoices() {
  const s = synth()
  if (!s) return
  const list = s.getVoices()
  if (!list.length) return
  voicesLoaded = true
  voices = { he: bestVoice(list, /^he/i), en: bestVoice(list, /^en/i) }
}

if (synth()) {
  pickVoices()
  synth().addEventListener?.('voiceschanged', pickVoices)
  // nothing should keep talking once the tablet is locked or the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) synth().cancel()
  })
}

export const isSpeechOn = () => enabled
export function setSpeechOn(v) {
  enabled = v
  try { localStorage.setItem(SPEAK_KEY, v ? '1' : '0') } catch { /* ignore */ }
  if (!v) stopSpeaking()
}

export const canSpeak = () => !!synth()

export function stopSpeaking() {
  synth()?.cancel()
}

/**
 * Speak `text`. `lang` is 'he' (default) or 'en'. Cancels anything still
 * playing so rapid taps don't queue up; `delay` (ms) lets an animation finish.
 */
export function speak(text, { delay = 0, rate = 0.9, lang = 'he' } = {}) {
  const s = synth()
  if (!s || !enabled || !text) return
  if (!voicesLoaded) pickVoices()
  const go = () => {
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'en' ? 'en-US' : 'he-IL'
    const v = voices[lang === 'en' ? 'en' : 'he']
    if (v) u.voice = v
    u.rate = lang === 'en' ? Math.min(1, rate) : rate
    u.pitch = 1.05
    s.speak(u)
  }
  if (delay > 0) setTimeout(go, delay)
  else go()
}
