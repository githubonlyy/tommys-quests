import { useEffect, useRef, useState } from 'react'
import { Shield } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

const ROUND_SEC = 45 // one round is 45 seconds...
const MAX_GOALS = 3 // ...or three goals conceded
const SAVE_POINTS = 10
const AV_H = 150 // keeper doll height in css px (Avatar keeps the 200x320 box)
const AV_W = AV_H * 0.625
const GLOVE_W = 62 // css px, the two-glove sprite at scale 1
const GLOVE_H = 34
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const FALLBACK_CONFETTI = ['#facc15', '#22c55e', '#38bdf8', '#ffffff', '#f472b6', '#fb923c']

// the six spots a striker aims at, as fractions of the goal mouth
const ZONE_X = [0.19, 0.5, 0.81]
const ZONE_Y = [0.33, 0.75]

// short Hebrew banners — the only prose on screen
const MSG = {
  save: { text: 'עצירה! 🧤', cls: 'bg-sky-500 border-sky-700' },
  big: { text: 'עצירת ענק! 🔥', cls: 'bg-green-500 border-green-700' },
  goal: { text: 'גול… 😖', cls: 'bg-red-600 border-red-800' },
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * Goalie — the other half of the penalty game: here he keeps goal. A striker
 * jogs up the pitch, a glow telegraphs roughly which zone he is aiming at, then
 * the ball comes in growing as it nears the goal mouth. Slide a finger to throw
 * the gloves at it; if the reach circle covers the ball when it arrives, it is
 * saved. 45 seconds, +10 a save, three goals conceded ends the round. Shots get
 * quicker and the telegraph shorter as the clock runs down.
 *
 * Same shape as the other arcade games: all play state lives in a ref the RAF
 * loop mutates, React state only moves on real events (HUD, banner).
 */
export default function Goalie({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const avatarRef = useRef(null)
  const gloveRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, time: ROUND_SEC, lives: MAX_GOALS, maxLives: MAX_GOALS })
  const [over, setOver] = useState(null) // { score, isRecord, won }
  const [msg, setMsg] = useState(null) // { kind, id } — result banner
  const [hint, setHint] = useState(true)
  const reportedRef = useRef(false)
  // theme is read from the loop; keep it fresh without restarting the game
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      if (g.current) g.current.reset = true // re-centre everything after a rotate
    }
    resize()
    window.addEventListener('resize', resize)

    // ---- geometry, derived from the canvas every frame so resize is free ----
    const geom = () => {
      const W = canvas.width
      const H = canvas.height
      const goalW = Math.min(W * 0.9, H * 1.45)
      const goalH = Math.min(goalW * 0.44, H * 0.4)
      const gy1 = H * 0.84 // goal line
      return {
        W,
        H,
        goalW,
        goalH,
        gx0: (W - goalW) / 2,
        gx1: (W + goalW) / 2,
        gy0: gy1 - goalH, // crossbar
        gy1,
        cx: W / 2,
        ballR: clamp(goalH * 0.085, 8 * dpr, 30 * dpr),
        reachR: goalH * 0.36,
      }
    }

    const restGlove = (G) => ({ x: G.cx, y: G.gy1 - G.goalH * 0.45 })

    g.current = {
      phase: 'idle', // idle -> runup -> fly -> result -> idle...
      G: geom(),
      glove: { x: 0, y: 0 },
      target: null, // where the finger last was, null = back to the middle
      ball: { x: 0, y: 0, r: 0 },
      trail: [],
      shot: null,
      pending: null,
      tele: null, // { x, y } — the coarse "he's aiming here" glow
      striker: { x: 0, kick: -9999 },
      runT: 0, // wind-up progress 0..1
      runStart: 0,
      runDur: 900,
      sx: 0, // striker feet, recomputed every frame
      sy: 0,
      sh: 0,
      deflect: null,
      parts: [], // confetti
      pops: [], // floating "+10"
      score: 0,
      conceded: 0,
      lastKind: null,
      nextAt: performance.now() + 1600, // a beat to read the hint before shot one
      resultUntil: 0,
      startAt: performance.now(),
      timeUp: false,
      reset: true,
      last: performance.now(),
      done: false,
    }

    // ---- pointer: drag anywhere to throw the gloves (touch + mouse) --------
    let pressed = false
    const aimAt = (e) => {
      const s = g.current
      if (!s || s.done) return
      e.preventDefault()
      const G = s.G
      const r = canvas.getBoundingClientRect()
      s.target = {
        // let him reach a little past the posts, the way a real dive does
        x: clamp((e.clientX - r.left) * dpr, G.gx0 - G.goalW * 0.04, G.gx1 + G.goalW * 0.04),
        y: clamp((e.clientY - r.top) * dpr, G.gy0 - G.goalH * 0.1, G.gy1 + G.goalH * 0.06),
      }
      setHint(false)
    }
    const onDown = (e) => {
      const s = g.current
      if (!s || s.done) return
      pressed = true
      try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      aimAt(e)
      sfx.click()
    }
    const onMove = (e) => {
      if (pressed) aimAt(e)
    }
    const onUp = () => {
      pressed = false // gloves stay where he left them
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    /* ------------------------------- rounds ------------------------------ */
    // difficulty rides the clock, not the score, so the ramp is always the same
    const ramp = (now) => clamp((now - g.current.startAt) / (ROUND_SEC * 1000), 0, 1)

    const startRunUp = (now) => {
      const s = g.current
      const G = s.G
      const p = ramp(now)
      const tx = G.gx0 + G.goalW * ZONE_X[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * G.goalW * 0.06
      const ty = G.gy0 + G.goalH * ZONE_Y[Math.random() < 0.5 ? 0 : 1] + (Math.random() - 0.5) * G.goalH * 0.1
      s.pending = { tx, ty, flyDur: 1.12 - 0.5 * p }
      // the tell is honest but deliberately coarse — never the exact spot
      s.tele = {
        x: tx + (Math.random() - 0.5) * G.goalW * 0.13,
        y: ty + (Math.random() - 0.5) * G.goalH * 0.22,
      }
      s.striker.x = G.cx + (Math.random() - 0.5) * G.goalW * 0.34
      s.runStart = now
      s.runDur = 950 - 520 * p
      s.runT = 0
      s.phase = 'runup'
    }

    const launch = (now) => {
      const s = g.current
      const pd = s.pending
      s.shot = { fromX: s.sx, fromY: s.sy - s.sh * 0.12, tx: pd.tx, ty: pd.ty, dur: pd.flyDur, start: now }
      s.ball = { x: s.shot.fromX, y: s.shot.fromY, r: s.G.ballR * 0.3 }
      s.trail = []
      s.tele = null
      s.striker.kick = now
      s.phase = 'fly'
      sfx.flip()
    }

    const burst = (x, y) => {
      const s = g.current
      const colors = themeRef.current?.confetti ?? FALLBACK_CONFETTI
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8
        const sp = (170 + Math.random() * 320) * dpr
        s.parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 12,
          size: (4 + Math.random() * 5) * dpr,
          color: colors[i % colors.length],
          life: 0.85 + Math.random() * 0.4,
          age: 0,
        })
      }
    }

    const resolve = (now) => {
      const s = g.current
      const G = s.G
      const d = Math.hypot(s.ball.x - s.glove.x, s.ball.y - s.glove.y)
      const saved = d < G.reachR + s.ball.r
      s.phase = 'result'
      s.resultUntil = now + (saved ? 1000 : 1250)

      if (saved) {
        // a fingertip save (ball out near the edge of the reach) is the big one
        const big = d > G.reachR * 0.55
        s.score += SAVE_POINTS
        s.lastKind = big ? 'big' : 'save'
        const away = Math.sign(s.ball.x - G.cx) || 1
        s.deflect = { vx: away * (280 + Math.random() * 240) * dpr, vy: -(240 + Math.random() * 170) * dpr, grow: 1.7 }
        burst(s.ball.x, s.ball.y)
        s.pops.push({ x: s.ball.x, y: s.ball.y - 26 * dpr, text: `+${SAVE_POINTS}`, age: 0 })
        if (big) sfx.fanfare()
        else { sfx.pop(); sfx.ding() }
      } else {
        s.conceded += 1
        s.lastKind = 'goal'
        s.deflect = { vx: (Math.random() - 0.5) * 60 * dpr, vy: 70 * dpr, grow: 0.6 } // rolls on into the net
        sfx.thud()
        sfx.buzz()
      }
      setMsg({ kind: s.lastKind, id: now })
    }

    const finish = () => {
      const s = g.current
      if (s.done) return
      s.done = true
      s.phase = 'done'
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      else sfx.ding()
      setMsg(null)
      setOver({ score: s.score, isRecord, won: s.conceded === 0 })
    }

    /* ------------------------------ drawing ------------------------------ */
    const drawPitch = (G) => {
      const { W, H } = G
      const grad = ctx.createLinearGradient(0, G.gy0 * 0.2, 0, H)
      grad.addColorStop(0, '#14532d')
      grad.addColorStop(1, '#22c55e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // stand behind the pitch: dark band + a deterministic speckle of a crowd
      const hz = G.gy0 * 0.22
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, W, hz)
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      for (let i = 0; i < 120; i++) {
        ctx.fillRect((((i * 37) % 120) / 120) * W, (((i * 53) % 17) / 17) * hz, 3 * dpr, 3 * dpr)
      }

      // mown bands, deeper apart as the pitch comes forward
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      for (let i = 0; i < 5; i++) {
        const y0 = hz + (H - hz) * Math.pow(i / 5, 1.5)
        const y1 = hz + (H - hz) * Math.pow((i + 0.5) / 5, 1.5)
        ctx.fillRect(0, y0, W, y1 - y0)
      }

      // goal line + penalty spot in front of it
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillRect(0, G.gy1 - 2 * dpr, W, 5 * dpr)
      ctx.beginPath()
      ctx.arc(G.cx, G.gy1 + (H - G.gy1) * 0.55, 5 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }

    const drawNet = (G) => {
      ctx.fillStyle = 'rgba(8,20,40,0.55)'
      ctx.fillRect(G.gx0, G.gy0, G.goalW, G.goalH)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      for (let i = 1; i < 22; i++) {
        const x = G.gx0 + (G.goalW * i) / 22
        ctx.moveTo(x, G.gy0)
        ctx.lineTo(x, G.gy1)
      }
      for (let i = 1; i < 9; i++) {
        const y = G.gy0 + (G.goalH * i) / 9
        ctx.moveTo(G.gx0, y)
        ctx.lineTo(G.gx1, y)
      }
      ctx.stroke()
    }

    const drawFrame = (G) => {
      const p = 11 * dpr
      ctx.fillStyle = '#f8fafc'
      ctx.strokeStyle = 'rgba(15,23,42,0.35)'
      ctx.lineWidth = 2 * dpr
      for (const x of [G.gx0 - p / 2, G.gx1 - p / 2]) {
        ctx.beginPath()
        ctx.roundRect(x, G.gy0 - p, p, G.goalH + p, p / 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.roundRect(G.gx0 - p, G.gy0 - p, G.goalW + p * 2, p, p / 2)
      ctx.fill()
      ctx.stroke()
    }

    // the tell: a soft pulsing blob over the part of the goal he is eyeing
    const drawTele = (G, s, now) => {
      if (!s.tele) return
      const accent = themeRef.current?.vars?.['--t-accent'] ?? '#67e8f9'
      const pulse = 0.72 + Math.sin(now / 110) * 0.14
      const r = G.goalH * 0.46 * pulse
      const glow = ctx.createRadialGradient(s.tele.x, s.tele.y, r * 0.15, s.tele.x, s.tele.y, r)
      glow.addColorStop(0, accent)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(s.tele.x, s.tele.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = accent
      ctx.lineWidth = 4 * dpr
      ctx.setLineDash([12 * dpr, 12 * dpr])
      ctx.beginPath()
      ctx.arc(s.tele.x, s.tele.y, r * 0.66, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const drawStriker = (s, now) => {
      const x = s.sx
      const y = s.sy
      const h = s.sh
      const w = h * 0.4
      const since = now - s.striker.kick
      const swing = since >= 0 && since < 320 ? Math.sin(Math.PI * (since / 320)) : 0
      // legs scissor while he runs up, then one snaps through on the kick
      const stride = s.phase === 'runup' ? Math.sin(now / 85) * w * 0.5 : 0

      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.beginPath()
      ctx.ellipse(x, y + 2 * dpr, w * 0.7, w * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = w * 0.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y - h * 0.4)
      ctx.lineTo(x - stride - swing * w * 0.9, y)
      ctx.moveTo(x, y - h * 0.4)
      ctx.lineTo(x + stride + swing * w * 0.3, y)
      ctx.stroke()

      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.roundRect(x - w / 2, y - h * 0.86, w, h * 0.5, w * 0.3)
      ctx.fill()
      ctx.fillStyle = '#fcd9c4'
      ctx.beginPath()
      ctx.arc(x, y - h * 0.98, w * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }

    const drawBall = (s) => {
      for (let i = 0; i < s.trail.length; i++) {
        const p = s.trail[i]
        ctx.fillStyle = `rgba(255,255,255,${0.04 + (i / s.trail.length) * 0.15})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      const r = s.ball.r
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()
      ctx.arc(s.ball.x, s.ball.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(s.ball.x, s.ball.y, r * 0.34, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + s.ball.y / (60 * dpr)
        ctx.beginPath()
        ctx.arc(s.ball.x + Math.cos(a) * r * 0.72, s.ball.y + Math.sin(a) * r * 0.72, r * 0.19, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // hands travel further than the feet — that spread is what reads as a dive
    const keeperPose = (G, s) => {
      const off = clamp((s.glove.x - G.cx) / (G.goalW * 0.5), -1, 1)
      const hi = clamp((G.gy1 - s.glove.y) / G.goalH, 0, 1.1)
      const lift = G.goalH * (0.26 * Math.abs(off) + 0.14 * Math.max(0, hi - 0.6))
      return {
        x: G.cx + off * G.goalW * 0.33,
        y: G.gy1 + G.goalH * 0.04 - lift,
        rot: off * 56,
        h: G.goalH * 0.86,
      }
    }

    // reach ring + the stretched arm; the doll and the gloves are DOM layers on top
    const drawKeeperRig = (G, s) => {
      const accent = themeRef.current?.vars?.['--t-accent'] ?? '#67e8f9'
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.arc(s.glove.x, s.glove.y, G.reachR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 3 * dpr
      ctx.setLineDash([10 * dpr, 10 * dpr])
      ctx.beginPath()
      ctx.arc(s.glove.x, s.glove.y, G.reachR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      const k = keeperPose(G, s)
      const a = (k.rot * Math.PI) / 180
      // shoulder = a point k.h*0.62 above the feet, rotated with the body
      ctx.strokeStyle = '#0e7490'
      ctx.lineWidth = k.h * 0.12
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(k.x + Math.sin(a) * k.h * 0.62, k.y - Math.cos(a) * k.h * 0.62)
      ctx.lineTo(s.glove.x, s.glove.y)
      ctx.stroke()
    }

    const drawFx = (s, dt) => {
      for (const p of s.parts) {
        p.age += dt
        p.vy += 900 * dpr * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        const k = 1 - p.age / p.life
        if (k <= 0) continue
        ctx.save()
        ctx.globalAlpha = clamp(k, 0, 1)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6)
        ctx.restore()
      }
      s.parts = s.parts.filter((p) => p.age < p.life)

      ctx.textAlign = 'center'
      ctx.font = `900 ${30 * dpr}px system-ui, sans-serif`
      for (const p of s.pops) {
        p.age += dt
        ctx.globalAlpha = clamp(1 - p.age / 1.1, 0, 1)
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = 'rgba(15,23,42,0.6)'
        ctx.lineWidth = 5 * dpr
        ctx.strokeText(p.text, p.x, p.y - p.age * 46 * dpr)
        ctx.fillText(p.text, p.x, p.y - p.age * 46 * dpr)
      }
      ctx.globalAlpha = 1
      s.pops = s.pops.filter((p) => p.age < 1.1)
      ctx.textAlign = 'start'
    }

    const placeDom = (G, s) => {
      const el = avatarRef.current
      const gl = gloveRef.current
      if (!el || !gl) return
      const k = keeperPose(G, s)
      const scale = k.h / dpr / AV_H
      el.style.transform =
        `translate3d(${k.x / dpr - AV_W / 2}px, ${k.y / dpr - AV_H}px, 0) rotate(${k.rot}deg) scale(${scale})`
      gl.style.transform =
        `translate3d(${s.glove.x / dpr - GLOVE_W / 2}px, ${s.glove.y / dpr - GLOVE_H / 2}px, 0) ` +
        `rotate(${k.rot * 0.5}deg) scale(${scale})`
    }

    /* -------------------------------- loop -------------------------------- */
    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now
      const G = geom()
      s.G = G
      if (s.reset) {
        s.reset = false
        s.glove = restGlove(G)
        s.target = null
        s.striker.x = G.cx
      }

      const left = Math.max(0, Math.ceil(ROUND_SEC - (now - s.startAt) / 1000))
      if (left <= 0) s.timeUp = true

      // gloves chase the finger at a capped speed: crossing the goal costs time
      const tgt = s.target ?? restGlove(G)
      const dx = tgt.x - s.glove.x
      const dy = tgt.y - s.glove.y
      const gap = Math.hypot(dx, dy)
      const step = (G.goalW / 0.62) * dt
      if (gap > step) {
        s.glove.x += (dx / gap) * step
        s.glove.y += (dy / gap) * step
      } else {
        s.glove.x = tgt.x
        s.glove.y = tgt.y
      }

      // striker: jogs down the pitch through the wind-up, then holds his spot
      if (s.phase === 'runup') s.runT = clamp((now - s.runStart) / s.runDur, 0, 1)
      else if (s.phase === 'idle') s.runT += (0 - s.runT) * Math.min(1, dt * 6)
      s.sx = s.striker.x
      s.sy = G.gy0 * (0.5 + 0.24 * s.runT) // stays on the grass, never up in the stand
      s.sh = G.goalH * (0.3 + 0.1 * s.runT)

      if (s.phase === 'idle') {
        if (s.timeUp) { finish(); return }
        if (now >= s.nextAt) startRunUp(now)
      } else if (s.phase === 'runup') {
        if (s.timeUp) { finish(); return } // no ball in the air yet, cut it here
        if (s.runT >= 1) launch(now)
      } else if (s.phase === 'fly') {
        const sh = s.shot
        const t = clamp((now - sh.start) / (sh.dur * 1000), 0, 1)
        // pow(t,1.6): a ball at constant speed looks like it accelerates at you
        const e = Math.pow(t, 1.6)
        s.ball.x = sh.fromX + (sh.tx - sh.fromX) * e
        s.ball.y = sh.fromY + (sh.ty - sh.fromY) * e - Math.sin(Math.PI * t) * G.goalH * 0.1
        s.ball.r = G.ballR * (0.3 + 0.7 * e)
        s.trail.push({ x: s.ball.x, y: s.ball.y, r: s.ball.r })
        if (s.trail.length > 9) s.trail.shift()
        if (t >= 1) resolve(now)
      } else if (s.phase === 'result') {
        if (s.deflect) {
          s.deflect.vy += 1300 * dpr * dt
          s.ball.x += s.deflect.vx * dt
          s.ball.y += s.deflect.vy * dt
          s.ball.r *= 1 + (s.deflect.grow - 1) * dt // a parried ball comes at the camera
        }
        if (now >= s.resultUntil) {
          if (s.timeUp || s.conceded >= MAX_GOALS) { finish(); return }
          s.phase = 'idle'
          s.deflect = null
          s.trail = []
          s.ball.r = 0
          s.nextAt = now + 900 - 350 * ramp(now)
          setMsg(null)
        }
      }

      /* ---- draw ---- */
      drawPitch(G)
      drawStriker(s, now)
      drawNet(G)
      drawTele(G, s, now)
      drawFrame(G)
      if (s.ball.r > 0) drawBall(s)
      drawKeeperRig(G, s)
      drawFx(s, dt)
      placeDom(G, s)

      const lives = Math.max(0, MAX_GOALS - s.conceded)
      setHud((h) =>
        h.score === s.score && h.lives === lives && h.time === left
          ? h
          : { score: s.score, lives, maxLives: MAX_GOALS, time: left },
      )

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
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
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ touchAction: 'none' }} />

      {/* the keeper — SVG doll layered over the canvas, moved by the loop */}
      <div
        ref={avatarRef}
        aria-hidden="true"
        className="absolute pointer-events-none will-change-transform drop-shadow-lg"
        style={{ left: 0, top: 0, width: AV_W, height: AV_H, transformOrigin: '50% 100%' }}
      >
        <Avatar size={AV_H} />
      </div>

      {/* gloves ride above the doll so they never disappear behind it */}
      <div
        ref={gloveRef}
        aria-hidden="true"
        className="absolute flex items-center justify-center gap-1 pointer-events-none will-change-transform"
        style={{ left: 0, top: 0, width: GLOVE_W, height: GLOVE_H }}
      >
        <span className="w-6 h-8 rounded-xl bg-yellow-300 border-b-4 border-yellow-600 shadow-lg" />
        <span className="w-6 h-8 rounded-xl bg-yellow-300 border-b-4 border-yellow-600 shadow-lg" />
      </div>

      {/* result banner */}
      {msg && (
        <div dir="rtl" className="absolute inset-x-0 top-[16%] flex justify-center pointer-events-none">
          <div
            key={msg.id}
            className={`anim-pop ${MSG[msg.kind].cls} text-white font-black italic text-4xl px-8 py-3 rounded-3xl border-b-8 shadow-xl`}
          >
            {MSG[msg.kind].text}
          </div>
        </div>
      )}

      {/* one-off nudge — the glowing tell teaches the rest */}
      {hint && (
        <div dir="rtl" className="absolute inset-x-0 bottom-3 flex justify-center px-4 pointer-events-none">
          <div className="anim-pop flex items-center gap-2 bg-white/95 text-slate-800 font-black text-xl px-5 py-3 rounded-2xl shadow-lg text-center">
            <Shield size={26} className="text-sky-600 fill-sky-200 shrink-0" />
            החלק את האצבע לכיוון הזוהר ותפוס את הכדור!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
