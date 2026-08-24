// Tiny WebAudio SFX engine — everything synthesized, no audio files.
// AudioContext is created lazily on first play (browser autoplay policy).

const MUTE_KEY = 'tommys-quests-muted'
let ctx = null
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
})()

export const isMuted = () => muted
export function setMuted(v) {
  muted = v
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// one enveloped oscillator note
function tone({ freq, endFreq, type = 'sine', dur = 0.15, vol = 0.25, delay = 0 }) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// short white-noise burst (pop / thud texture)
function noise({ dur = 0.12, vol = 0.3, delay = 0, highpass = 1000 }) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + delay
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = highpass
  const gain = c.createGain()
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(t0)
}

export const sfx = {
  pop() {
    noise({ dur: 0.09, vol: 0.4, highpass: 800 })
    tone({ freq: 320, endFreq: 90, type: 'square', dur: 0.1, vol: 0.15 })
  },
  ding() {
    tone({ freq: 880, type: 'sine', dur: 0.12, vol: 0.2 })
    tone({ freq: 1318, type: 'sine', dur: 0.18, vol: 0.18, delay: 0.08 })
  },
  buzz() {
    tone({ freq: 160, endFreq: 110, type: 'sawtooth', dur: 0.25, vol: 0.15 })
  },
  flip() {
    noise({ dur: 0.05, vol: 0.12, highpass: 2000 })
  },
  click() {
    tone({ freq: 520, type: 'triangle', dur: 0.05, vol: 0.15 })
  },
  coin() {
    tone({ freq: 1568, type: 'square', dur: 0.06, vol: 0.08 })
    tone({ freq: 2093, type: 'square', dur: 0.09, vol: 0.08, delay: 0.05 })
  },
  fanfare() {
    const notes = [523, 659, 784, 1046]
    notes.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.2, delay: i * 0.12 }))
    tone({ freq: 1318, type: 'triangle', dur: 0.4, vol: 0.22, delay: 0.5 })
  },
  thud() {
    noise({ dur: 0.15, vol: 0.35, highpass: 60 })
    tone({ freq: 90, endFreq: 50, type: 'sine', dur: 0.2, vol: 0.3 })
  },
}
