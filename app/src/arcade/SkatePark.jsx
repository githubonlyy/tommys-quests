import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

const ROUND_SEC = 60
const MAX_DT = 0.05 // clamp frame delta (tab switches, hiccups)
const SPIN_RATE = 400 // deg/s while the finger is held down in the air
const TOL = 82 // how far from a whole turn still counts as a clean landing
const MIN_SPIN = 45 // below this the landing is always clean (a plain jump)
const AVATAR_RATIO = 0.625 // Avatar viewBox is 200x320
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
const FONT = 'Rubik, system-ui, sans-serif'

// deterministic pseudo-random so the scenery is stable across frames
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 11.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Skate Park — his doll rides a drawn board over a rolling ramp landscape.
 * Tap anywhere to ollie; keep the finger down in the air to spin. Land on a
 * whole turn (the ring gauge glows green) for trick points, land mid-turn and
 * he just loses speed — never a life, never a game over. 60s round,
 * score = distance + tricks. Everything is drawn: no images, no assets.
 */
export default function SkatePark({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const riderRef = useRef(null) // the SVG doll, moved by the loop over the canvas
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, time: ROUND_SEC })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [avSize, setAvSize] = useState(72) // css px, follows the play-area height
  const [intro, setIntro] = useState(true)
  const reportedRef = useRef(false)

  // theme colours, read fresh every render and consumed inside the loop.
  // NOTE: never theme.arcade.* — a missing skin key must not be able to crash us.
  const v = (k, fb) => theme?.vars?.[k] ?? fb
  const palRef = useRef(null)
  palRef.current = {
    skyTop: v('--t-bg-to', '#101a4d'),
    skyBot: v('--t-bg-from', '#3b6bd6'),
    hillFar: v('--t-side-deep', '#0d1033'),
    hillNear: v('--t-side', '#1b1f60'),
    accent: v('--t-accent', '#67e8f9'),
    accentDeep: v('--t-accent-deep', '#0891b2'),
    soft: v('--t-text-soft', '#c7d2fe'),
    confetti: theme?.confetti?.length ? theme.confetti : ['#facc15', '#f472b6', '#38bdf8', '#ffffff'],
    particles: theme?.particles?.length ? theme.particles : ['⭐', '✨', '🌟'],
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t)
        fn()
      }, ms)
      timers.add(t)
    }

    // ---- geometry (recomputed on resize) ----
    const geo = {}
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      if (!r.width || !r.height) return
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      const W = canvas.width
      const H = canvas.height
      geo.W = W
      geo.H = H
      geo.base = H * 0.74 // average ground line
      geo.amp = H * 0.12 // hill height
      geo.L1 = Math.max(300 * dpr, W * 0.62) // long rollers
      geo.L2 = Math.max(150 * dpr, W * 0.27) // ramps
      geo.L3 = Math.max(85 * dpr, W * 0.13) // small bumps
      geo.skaterX = W * 0.34 // he stays here; the world scrolls past
      geo.grav = H * 3.4
      geo.jumpV = H * 1.45
      geo.cruise = H * 0.5
      geo.unit = H * 0.1 // world px per distance point (~5/s at cruise)
      const cssAv = Math.max(54, Math.min(96, r.height * 0.17))
      geo.avPx = cssAv * dpr
      setAvSize((s) => (Math.abs(s - cssAv) < 0.5 ? s : cssAv))
    }
    resize()
    window.addEventListener('resize', resize)

    // the ground: a sum of sines, so it is always a smooth curve to follow
    const groundY = (x) =>
      geo.base -
      geo.amp * (0.54 * Math.sin(x / geo.L1) + 0.3 * Math.sin(x / geo.L2 + 1.7) + 0.16 * Math.sin(x / geo.L3 + 0.6))
    // dy/dx, sampled — positive means the ground drops away (downhill)
    const slopeAt = (x) => {
      const e = 2 * dpr
      return (groundY(x + e) - groundY(x - e)) / (2 * e)
    }
    // background ridges, drawn at their own parallax speed
    const hillY = (x, layer) =>
      layer === 0
        ? geo.base - geo.H * 0.07 - geo.H * 0.1 * Math.sin(x / (geo.W * 0.9)) - geo.H * 0.04 * Math.sin(x / (geo.W * 0.3) + 2.1)
        : geo.base - geo.H * 0.02 - geo.H * 0.07 * Math.sin(x / (geo.W * 0.5) + 1.1) - geo.H * 0.03 * Math.sin(x / (geo.W * 0.19) + 0.4)

    g.current = {
      x: 0, // world position
      y: groundY(0), // wheels-on-ground contact point
      vy: 0,
      v: geo.cruise, // forward speed, world px/s
      air: false,
      airT: 0,
      held: false,
      spun: false, // spin sound fires once per jump
      spin: 0, // degrees turned this jump
      launchTilt: 0,
      tilt: 0, // drawn board angle, radians
      combo: 0,
      wipeUntil: 0,
      distAcc: 0,
      distScore: 0,
      trickScore: 0,
      score: 0,
      parts: [], // dust + sparks, world coords
      labels: [], // floating "+120", world coords
      lastDust: 0,
      startTs: performance.now(),
      last: performance.now(),
      done: false,
    }

    const spark = (n, spread, colors) => {
      const s = g.current
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * spread
        const sp = (0.25 + Math.random() * 0.55) * geo.H
        s.parts.push({
          x: s.x,
          y: s.y - 6 * dpr,
          vx: Math.cos(a) * sp - s.v * 0.25,
          vy: Math.sin(a) * sp,
          life: 0.5 + Math.random() * 0.35,
          max: 0.85,
          r: (2 + Math.random() * 3) * dpr,
          c: colors[i % colors.length],
        })
      }
    }
    const label = (text, color) => {
      const s = g.current
      s.labels.push({ x: s.x, y: s.y - geo.avPx * 0.9, text, color, life: 1, max: 1 })
    }

    // ---- controls: tap to ollie, keep holding to spin ----
    const press = () => {
      const s = g.current
      if (!s || s.done) return
      s.held = true
      if (s.air) return // already flying — the hold just keeps the spin going
      const sl = slopeAt(s.x)
      const lip = Math.max(0, -sl) // launching off an upslope gives extra air
      s.air = true
      s.airT = 0
      s.spin = 0
      s.launchTilt = Math.atan(sl)
      s.vy = -geo.jumpV * (1 + Math.min(0.18, lip * 0.6))
      s.spun = false
      sfx.pop()
    }
    const release = () => {
      if (g.current) g.current.held = false
    }
    wrap.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)

    later(() => setIntro(false), 3200)

    // ---- the round ----
    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      if (!geo.W) {
        // play area not measured yet (hidden / zero-sized) — try again next frame
        resize()
        if (geo.W) {
          s.y = groundY(s.x)
          s.v = geo.cruise
        }
        s.last = now
        s.startTs = now // the clock starts once he can actually see the ramp
        raf = requestAnimationFrame(loop)
        return
      }
      const { W, H } = geo
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now
      const timeLeft = Math.max(0, ROUND_SEC - (now - s.startTs) / 1000)
      const pal = palRef.current
      const gy = groundY(s.x)
      const sl = slopeAt(s.x)

      /* ---- physics ---- */
      if (s.air) {
        s.airT += dt
        s.vy += geo.grav * dt
        s.y += s.vy * dt
        s.v -= s.v * 0.12 * dt // a little drag while flying
        if (s.y < H * 0.06) {
          s.y = H * 0.06
          if (s.vy < 0) s.vy = 0
        }
        if (s.held) {
          if (!s.spun) {
            s.spun = true
            sfx.flip()
          }
          s.spin += SPIN_RATE * dt
        }
        // level out of the launch tilt, then it is pure spin
        const lead = Math.max(0, 1 - s.airT * 3)
        s.tilt = s.launchTilt * lead + (s.spin * Math.PI) / 180
        const landY = groundY(s.x)
        if (s.y >= landY && s.vy > 0) {
          // ---- landing ----
          s.air = false
          s.y = landY
          s.vy = 0
          const turns = Math.max(1, Math.round(s.spin / 360))
          const err = Math.abs(s.spin - turns * 360)
          if (s.spin < MIN_SPIN) {
            sfx.click() // plain landing, nothing to judge
          } else if (err <= TOL) {
            s.combo += 1
            const pts = 50 * turns + 15 * Math.min(6, s.combo - 1)
            s.trickScore += pts
            s.v = Math.min(H * 0.95, s.v + geo.cruise * 0.12)
            label(`+${pts}`, pal.confetti[0])
            spark(12 + turns * 4, 2.4, pal.confetti)
            if (turns > 1 || s.combo > 2) sfx.coin()
            else sfx.ding()
          } else {
            s.combo = 0
            s.v = Math.max(geo.cruise * 0.35, s.v * 0.5)
            s.wipeUntil = now + 520
            label('אופס!', '#fca5a5')
            spark(10, 2.8, ['#f87171', '#fca5a5', '#ffffff'])
            sfx.thud()
          }
          s.spin = 0
          s.tilt = Math.atan(sl)
        }
      } else {
        // rolling: the board sticks to the curve, gravity does the rest
        s.y = gy
        s.tilt = Math.atan(sl)
        s.v += geo.grav * 0.3 * sl * dt
        s.v += (geo.cruise - s.v) * 1.1 * dt
        s.v = Math.max(geo.cruise * 0.42, Math.min(H * 0.95, s.v))
        if (now - s.lastDust > 70 && s.v > geo.cruise * 0.9) {
          s.lastDust = now
          s.parts.push({
            x: s.x - geo.avPx * 0.4,
            y: s.y,
            vx: -s.v * 0.18,
            vy: -H * 0.05 * Math.random(),
            life: 0.4,
            max: 0.4,
            r: (2 + Math.random() * 3) * dpr,
            c: pal.soft,
          })
        }
      }

      s.x += s.v * dt
      s.distAcc += s.v * dt
      while (s.distAcc >= geo.unit) {
        s.distAcc -= geo.unit
        s.distScore += 1
      }
      s.score = s.distScore + s.trickScore

      for (const p of s.parts) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += geo.grav * 0.35 * dt
        p.life -= dt
      }
      s.parts = s.parts.filter((p) => p.life > 0)
      for (const l of s.labels) l.life -= dt * 1.1
      s.labels = s.labels.filter((l) => l.life > 0)

      /* ---- draw ---- */
      const toScreen = (wx) => geo.skaterX + (wx - s.x)

      const sky = ctx.createLinearGradient(0, 0, 0, geo.base)
      sky.addColorStop(0, pal.skyTop)
      sky.addColorStop(1, pal.skyBot)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // sun + drifting clouds
      ctx.globalAlpha = 0.5
      ctx.fillStyle = pal.accent
      ctx.beginPath()
      ctx.arc(W * 0.78, H * 0.17, H * 0.075, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.16
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 4; i++) {
        const span = W * 1.7
        const cx = ((i * span) / 4 - s.x * 0.12) % span
        const x = cx < 0 ? cx + span : cx
        const y = H * (0.1 + rnd(i) * 0.16)
        const r = H * (0.035 + rnd(i + 9) * 0.03)
        for (const [ox, oy, k] of [[-r, 0, 0.8], [0, -r * 0.5, 1], [r, 0, 0.85], [r * 0.4, r * 0.2, 0.7]]) {
          ctx.beginPath()
          ctx.arc(x + ox, y + oy, r * k, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // parallax ridges
      for (const [layer, par, col, alpha] of [[0, 0.3, pal.hillFar, 0.85], [1, 0.6, pal.hillNear, 0.9]]) {
        ctx.globalAlpha = alpha
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let px = 0; px <= W + 12 * dpr; px += 12 * dpr) {
          ctx.lineTo(px, hillY(s.x * par + px, layer))
        }
        ctx.lineTo(W, H)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // the skate surface
      const step = 8 * dpr
      ctx.beginPath()
      ctx.moveTo(-step, groundY(s.x - geo.skaterX - step) + 0)
      for (let px = -step; px <= W + step; px += step) ctx.lineTo(px, groundY(s.x + px - geo.skaterX))
      ctx.lineTo(W + step, H)
      ctx.lineTo(-step, H)
      ctx.closePath()
      const dirt = ctx.createLinearGradient(0, geo.base - geo.amp, 0, H)
      dirt.addColorStop(0, pal.hillNear)
      dirt.addColorStop(1, pal.hillFar)
      ctx.fillStyle = dirt
      ctx.fill()

      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 5 * dpr
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let px = -step; px <= W + step; px += step) {
        const y = groundY(s.x + px - geo.skaterX)
        if (px === -step) ctx.moveTo(px, y)
        else ctx.lineTo(px, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 * dpr
      ctx.setLineDash([14 * dpr, 12 * dpr])
      ctx.beginPath()
      for (let px = -step; px <= W + step; px += step) {
        const y = groundY(s.x + px - geo.skaterX) + 16 * dpr
        if (px === -step) ctx.moveTo(px, y)
        else ctx.lineTo(px, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // themed scenery sitting on the curve
      const spacing = W * 0.42
      const first = Math.floor((s.x - geo.skaterX) / spacing) - 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      for (let i = first; i < first + Math.ceil(W / spacing) + 3; i++) {
        const wx = i * spacing + rnd(i) * spacing * 0.6
        const size = (22 + rnd(i + 3) * 14) * dpr
        ctx.font = `${size}px ${EMOJI_FONT}`
        ctx.fillText(pal.particles[((i % pal.particles.length) + pal.particles.length) % pal.particles.length], toScreen(wx), groundY(wx) + 2 * dpr)
      }

      // dust + sparks
      for (const p of s.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(toScreen(p.x), p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // landing shadow, so the height above the ramp is readable
      if (s.air) {
        const drop = Math.max(0, gy - s.y)
        ctx.globalAlpha = Math.max(0.12, 0.4 - drop / (H * 1.6))
        ctx.fillStyle = '#000000'
        ctx.beginPath()
        ctx.ellipse(geo.skaterX, gy + 3 * dpr, geo.avPx * 0.34, geo.avPx * 0.09, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // speed streaks
      if (s.v > geo.cruise * 1.15) {
        ctx.globalAlpha = 0.35
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3 * dpr
        for (let i = 0; i < 3; i++) {
          const y = s.y - geo.avPx * (0.35 + i * 0.28)
          ctx.beginPath()
          ctx.moveTo(geo.skaterX - geo.avPx * (0.7 + i * 0.15), y)
          ctx.lineTo(geo.skaterX - geo.avPx * (1.3 + i * 0.2), y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      /* ---- board (canvas) + rider (DOM) share one pivot: the contact point ---- */
      const wobble = now < s.wipeUntil ? Math.sin(now / 22) * 0.16 : 0
      const ang = s.tilt + wobble
      const bw = geo.avPx * 0.95
      const wheelR = geo.avPx * 0.075
      const deckH = geo.avPx * 0.055
      const deckTop = 2 * wheelR + deckH

      ctx.save()
      ctx.translate(geo.skaterX, s.y)
      ctx.rotate(ang)
      ctx.fillStyle = '#1f2937'
      for (const wx of [-bw * 0.3, bw * 0.3]) {
        ctx.beginPath()
        ctx.arc(wx, -wheelR, wheelR, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = pal.confetti[2 % pal.confetti.length]
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2.5 * dpr
      ctx.beginPath()
      ctx.roundRect(-bw / 2, -deckTop, bw, deckH, deckH * 0.6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = pal.confetti[1 % pal.confetti.length]
      ctx.beginPath()
      ctx.roundRect(-bw * 0.28, -deckTop + deckH * 0.28, bw * 0.56, deckH * 0.34, deckH * 0.2)
      ctx.fill()
      ctx.restore()

      // the doll rides on the deck: rotate the offset with the board
      const rider = riderRef.current
      if (rider) {
        const rx = (geo.skaterX + deckTop * Math.sin(ang)) / dpr
        const ry = (s.y - deckTop * Math.cos(ang)) / dpr
        rider.style.transform = `translate3d(${rx}px, ${ry}px, 0) rotate(${(ang * 180) / Math.PI}deg) translate(-50%, -100%)`
      }

      // spin gauge — the needle in the green band means "let go now"
      if (s.air && s.spin > 12) {
        const R = geo.avPx * 0.78
        const cx = geo.skaterX
        const cy = s.y - deckTop - geo.avPx * 0.55
        const turns = Math.max(1, Math.round(s.spin / 360))
        const good = Math.abs(s.spin - turns * 360) <= TOL
        const prog = ((s.spin % 360) / 360) * Math.PI * 2
        ctx.lineCap = 'round'
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 7 * dpr
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 0.85
        ctx.strokeStyle = '#22c55e' // the landing window, always at 12 o'clock
        ctx.lineWidth = 8 * dpr
        ctx.beginPath()
        ctx.arc(cx, cy, R, -Math.PI / 2 - (TOL * Math.PI) / 180, -Math.PI / 2 + (TOL * Math.PI) / 180)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.strokeStyle = good ? '#22c55e' : pal.accent
        ctx.lineWidth = 6 * dpr
        ctx.beginPath()
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + prog)
        ctx.stroke()
        ctx.fillStyle = good ? '#22c55e' : '#ffffff'
        ctx.beginPath()
        ctx.arc(cx + Math.cos(prog - Math.PI / 2) * R, cy + Math.sin(prog - Math.PI / 2) * R, 6 * dpr, 0, Math.PI * 2)
        ctx.fill()
        if (turns > 1) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `900 ${geo.avPx * 0.28}px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${turns}`, cx, cy)
        }
        ctx.lineCap = 'butt'
      }

      // floating scores
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `900 ${22 * dpr}px ${FONT}`
      ctx.lineWidth = 5 * dpr
      ctx.strokeStyle = 'rgba(15,23,42,0.7)'
      for (const l of s.labels) {
        ctx.globalAlpha = Math.max(0, Math.min(1, l.life / l.max))
        const ly = l.y - (1 - l.life / l.max) * 46 * dpr
        ctx.strokeText(l.text, toScreen(l.x), ly)
        ctx.fillStyle = l.color
        ctx.fillText(l.text, toScreen(l.x), ly)
      }
      ctx.globalAlpha = 1

      // combo ribbon
      if (s.combo > 1) {
        ctx.fillStyle = pal.confetti[0]
        ctx.font = `900 ${20 * dpr}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(`x${s.combo}`, geo.skaterX, s.y - deckTop - geo.avPx * 1.35)
      }

      // update HUD only when a visible value changes (avoids 60fps re-renders)
      const tl = Math.ceil(timeLeft)
      setHud((h) => (h.score === s.score && h.time === tl ? h : { score: s.score, time: tl }))

      if (timeLeft <= 0) {
        s.done = true
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        else sfx.ding()
        setOver({ score: s.score, isRecord })
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      wrap.removeEventListener('pointerdown', press)
      for (const t of timers) clearTimeout(t)
      if (g.current) g.current.done = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // report the score once when the round ends
  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart} wrapRef={wrapRef}>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* the doll rides the drawn board — placed by the loop, pivots on the deck */}
      <div
        ref={riderRef}
        className="absolute left-0 top-0 pointer-events-none will-change-transform drop-shadow-lg"
        style={{ width: avSize * AVATAR_RATIO, height: avSize, transformOrigin: '0 0' }}
        aria-label="טומי על הסקייטבורד"
      >
        <Avatar size={avSize} />
      </div>

      {intro && (
        <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-xl sm:text-2xl text-center px-6 py-3 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl">
            🛹 הקישו כדי לקפוץ — החזיקו באוויר כדי להסתובב!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
