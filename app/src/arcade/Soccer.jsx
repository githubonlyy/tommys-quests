import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

const TOTAL_SHOTS = 10 // a round is ten penalties
const MAX_MISS = 3 // ...or three misses in a row
const AV_H = 128 // kicker height in css px (Avatar keeps the 200x320 box)
const AV_W = AV_H * 0.625
const FALLBACK_CONFETTI = ['#facc15', '#22c55e', '#38bdf8', '#ffffff', '#f472b6', '#fb923c']
const MAX_DT = 0.05 // clamp frame delta (tab switches, hiccups)

// short, plural-imperative Hebrew — the banner is the only prose on screen
const MSG = {
  goal: { text: 'גול! ⚽', cls: 'bg-green-500 border-green-700' },
  save: { text: 'השוער עצר!', cls: 'bg-slate-700 border-slate-900' },
  wide: { text: 'החוצה!', cls: 'bg-orange-500 border-orange-700' },
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * Soccer — penalty shootout. Drag from the ball to aim (angle = where in the
 * goal, drag length = how hard and how high), release to shoot. A keeper sways
 * across the line and dives; he reads the shot better with every goal scored.
 * Ten penalties, or three misses in a row. Score: 100 a goal, +50 for a top
 * corner, +25 per goal in the current streak.
 *
 * Same shape as the other arcade games: all play state lives in a ref that the
 * RAF loop mutates, React state only changes on real events (HUD, banner).
 */
export default function Soccer({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const avatarRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: MAX_MISS, maxLives: MAX_MISS })
  const [over, setOver] = useState(null) // { score, isRecord }
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
      const goalW = Math.min(W * 0.82, H * 0.9)
      const goalH = Math.min(goalW * 0.4, H * 0.24)
      const gy0 = Math.max(44 * dpr, H * 0.13) // crossbar
      const gy1 = gy0 + goalH // goal line
      const homeY = clamp(H - 128 * dpr, gy1 + 120 * dpr, H - 54 * dpr)
      return {
        W,
        H,
        goalW,
        goalH,
        gx0: (W - goalW) / 2,
        gx1: (W + goalW) / 2,
        gy0,
        gy1,
        cx: W / 2,
        homeX: W / 2,
        homeY,
        ballR: 15 * dpr,
      }
    }

    // aim vector -> where the ball ends up. Angle picks the side, drag length
    // picks the speed *and* the height in the goal, so both are visible on the
    // guide before the kid lets go.
    const aimFrom = (p, G) => {
      const dx = p.x - G.homeX
      const dy = Math.min(p.y - G.homeY, -1) // always kick towards the goal
      const rise = G.homeY - G.gy1
      const maxOff = G.goalW * 0.68
      const slope = clamp(dx / -dy, -maxOff / rise, maxOff / rise)
      const power = clamp(Math.hypot(dx, dy) / (Math.min(G.W, G.H) * 0.4), 0.14, 1)
      const tx = G.homeX + slope * rise
      const ty = G.gy1 - power * G.goalH * 0.86 // never above the crossbar
      return {
        tx,
        ty,
        power,
        onTarget: tx > G.gx0 + 8 * dpr && tx < G.gx1 - 8 * dpr,
        dur: 0.78 - 0.3 * power,
      }
    }

    g.current = {
      phase: 'aim', // aim -> fly -> result -> aim...
      G: geom(),
      ball: { x: 0, y: 0, r: 12 },
      trail: [],
      keeper: { x: 0, startX: 0, toX: 0, diveAt: 0, speed: 1, cover: 0.54, lean: 0 },
      aim: null, // live pointer while dragging
      aiming: false,
      shot: null,
      deflect: null,
      parts: [], // confetti
      pops: [], // floating "+150"
      results: [], // 'goal' | 'save' | 'wide' per shot — drawn as dots
      shots: 0,
      goals: 0,
      streak: 0,
      straightMiss: 0,
      score: 0,
      lastKind: null,
      kickAt: -9999,
      resultAt: 0,
      resultUntil: 0,
      reset: true,
      last: performance.now(),
      done: false,
    }

    const toAim = (G) => {
      const s = g.current
      s.phase = 'aim'
      s.ball = { x: G.homeX, y: G.homeY, r: G.ballR }
      s.trail = []
      s.shot = null
      s.deflect = null
      s.aim = null
      s.aiming = false
      setMsg(null)
    }

    // ---- pointer: drag from the ball, release to shoot (touch + mouse) ----
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }
    }
    const onDown = (e) => {
      const s = g.current
      if (!s || s.done || s.phase !== 'aim') return
      s.aim = toLocal(e)
      s.aiming = true
      try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      sfx.click()
    }
    const onMove = (e) => {
      const s = g.current
      if (!s || !s.aiming) return
      s.aim = toLocal(e)
    }
    const onUp = () => {
      const s = g.current
      if (!s || !s.aiming) return
      const p = s.aim
      s.aiming = false
      s.aim = null
      if (!p || s.phase !== 'aim') return
      const G = s.G
      // a tap is not a kick — never burn a shot on a stray touch
      if (Math.hypot(p.x - G.homeX, p.y - G.homeY) < 30 * dpr) return
      shoot(p, G)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const shoot = (p, G) => {
      const s = g.current
      const a = aimFrom(p, G)
      const now = performance.now()
      s.shot = { ...a, fromX: s.ball.x, fromY: s.ball.y, start: now }
      s.phase = 'fly'
      s.trail = []
      s.kickAt = now

      // keeper reads the shot better with every goal — capped so it stays fair
      const lvl = s.goals
      const acc = Math.min(0.8, 0.26 + lvl * 0.075)
      const guessed = Math.random() < acc
      const jitter = (Math.random() - 0.5) * G.goalW * (guessed ? 0.12 : 0.3)
      const toX = guessed ? a.tx + jitter : 2 * G.cx - a.tx + jitter
      const k = s.keeper
      k.startX = k.x
      k.toX = clamp(toX, G.gx0 + 12 * dpr, G.gx1 - 12 * dpr)
      k.diveAt = now + Math.max(50, 200 - lvl * 14)
      k.speed = (G.goalW * (0.9 + lvl * 0.06)) / 0.55
      k.cover = Math.min(0.74, 0.54 + lvl * 0.024)
      setHint(false)
      sfx.pop()
    }

    const burst = (x, y) => {
      const s = g.current
      const colors = themeRef.current?.confetti ?? FALLBACK_CONFETTI
      for (let i = 0; i < 30; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6
        const sp = (180 + Math.random() * 340) * dpr
        s.parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 12,
          size: (4 + Math.random() * 5) * dpr,
          color: colors[i % colors.length],
          life: 0.9 + Math.random() * 0.4,
          age: 0,
        })
      }
    }

    const resolve = (kind, now) => {
      const s = g.current
      const G = s.G
      const sh = s.shot
      s.shots += 1
      s.results.push(kind)
      s.lastKind = kind
      s.phase = 'result'
      s.resultAt = now

      if (kind === 'goal') {
        s.goals += 1
        s.streak += 1
        s.straightMiss = 0
        const corner = sh.ty < G.gy1 - G.goalH * 0.5 && Math.abs(sh.tx - G.cx) > G.goalW * 0.26
        const gained = 100 + (corner ? 50 : 0) + Math.min(100, (s.streak - 1) * 25)
        s.score += gained
        s.ball = { x: sh.tx, y: sh.ty, r: G.ballR * 0.58 }
        burst(sh.tx, sh.ty)
        s.pops.push({ x: sh.tx, y: sh.ty - 26 * dpr, text: `+${gained}`, age: 0 })
        sfx.fanfare()
        if (corner) sfx.coin()
        s.resultUntil = now + 1400
      } else {
        s.streak = 0
        s.straightMiss += 1
        if (kind === 'save') {
          const away = Math.sign(s.ball.x - s.keeper.x) || (Math.random() < 0.5 ? -1 : 1)
          s.deflect = { vx: away * (220 + Math.random() * 180) * dpr, vy: -120 * dpr }
          sfx.thud()
        } else {
          s.deflect = { vx: Math.sign(sh.tx - G.cx) * 90 * dpr, vy: -60 * dpr }
          sfx.buzz()
        }
        s.resultUntil = now + 1150
      }
      setMsg({ kind, id: s.shots })
    }

    const finish = () => {
      const s = g.current
      s.done = true
      s.phase = 'done'
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      else sfx.ding()
      setHud({ score: s.score, lives: Math.max(0, MAX_MISS - s.straightMiss), maxLives: MAX_MISS })
      setOver({ score: s.score, isRecord })
    }

    /* ------------------------------ drawing ------------------------------ */
    const drawPitch = (G) => {
      const { W, H } = G
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#14532d')
      grad.addColorStop(1, '#22c55e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      // mown stripes
      ctx.fillStyle = 'rgba(255,255,255,0.045)'
      const band = H / 9
      for (let i = 0; i < 9; i += 2) ctx.fillRect(0, i * band, W, band)

      // penalty box + spot
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 4 * dpr
      const bw = Math.min(G.goalW * 1.7, W - 24 * dpr)
      const bh = Math.min(G.H * 0.42, G.homeY - G.gy1 + 40 * dpr)
      ctx.strokeRect(G.cx - bw / 2, G.gy1, bw, bh)
      ctx.beginPath()
      ctx.arc(G.cx, G.gy1 + bh, bw * 0.22, Math.PI, 0)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath()
      ctx.arc(G.homeX, G.homeY + 26 * dpr, 4 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }

    const drawNet = (G) => {
      ctx.fillStyle = 'rgba(15,23,42,0.42)'
      ctx.fillRect(G.gx0, G.gy0, G.goalW, G.goalH)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      for (let i = 1; i < 16; i++) {
        const x = G.gx0 + (G.goalW * i) / 16
        ctx.moveTo(x, G.gy0)
        ctx.lineTo(x, G.gy1)
      }
      for (let i = 1; i < 7; i++) {
        const y = G.gy0 + (G.goalH * i) / 7
        ctx.moveTo(G.gx0, y)
        ctx.lineTo(G.gx1, y)
      }
      ctx.stroke()
    }

    const drawFrame = (G) => {
      const p = 9 * dpr
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
      // goal line
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 4 * dpr
      ctx.beginPath()
      ctx.moveTo(G.gx0 - p, G.gy1)
      ctx.lineTo(G.gx1 + p, G.gy1)
      ctx.stroke()
    }

    // one dot per penalty: green scored, red missed, dim still to take
    const drawDots = (G, s) => {
      const gap = 20 * dpr
      const y = Math.max(20 * dpr, G.gy0 * 0.5)
      const x0 = G.cx - ((TOTAL_SHOTS - 1) * gap) / 2
      for (let i = 0; i < TOTAL_SHOTS; i++) {
        const r = s.results[i]
        ctx.fillStyle = r === 'goal' ? '#22c55e' : r ? '#ef4444' : 'rgba(255,255,255,0.28)'
        ctx.strokeStyle = 'rgba(15,23,42,0.35)'
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.arc(x0 + i * gap, y, 6 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    const drawKeeper = (G, s) => {
      const k = s.keeper
      const w = G.goalW * 0.17
      const h = G.goalH * k.cover
      ctx.save()
      ctx.translate(k.x, G.gy1)
      ctx.rotate((k.lean * Math.PI) / 180)
      // gloves
      ctx.fillStyle = '#fde047'
      for (const gx of [-w * 0.78, w * 0.78]) {
        ctx.beginPath()
        ctx.arc(gx, -h * 0.72, w * 0.24, 0, Math.PI * 2)
        ctx.fill()
      }
      // arms
      ctx.strokeStyle = '#e11d48'
      ctx.lineWidth = w * 0.26
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-w * 0.72, -h * 0.7)
      ctx.lineTo(w * 0.72, -h * 0.7)
      ctx.stroke()
      // body + shorts
      ctx.fillStyle = '#e11d48'
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h * 0.86, w, h * 0.62, w * 0.28)
      ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h * 0.3, w, h * 0.3, w * 0.2)
      ctx.fill()
      // head
      ctx.fillStyle = '#fcd9c4'
      ctx.beginPath()
      ctx.arc(0, -h * 0.98, w * 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const drawBall = (G, s) => {
      // ground shadow — drops towards the goal line as the ball flies away
      const t = s.shot && s.phase === 'fly' ? clamp((performance.now() - s.shot.start) / (s.shot.dur * 1000), 0, 1) : 0
      const sy = G.homeY + 26 * dpr + (G.gy1 - G.homeY) * t
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.beginPath()
      ctx.ellipse(s.ball.x, sy, s.ball.r * 1.1, s.ball.r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()

      for (let i = 0; i < s.trail.length; i++) {
        const p = s.trail[i]
        ctx.fillStyle = `rgba(255,255,255,${0.05 + (i / s.trail.length) * 0.16})`
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

    const drawGuide = (G, s, now) => {
      const p = s.aim
      if (!p) return
      const a = aimFrom(p, G)
      const accent = themeRef.current?.vars?.['--t-accent'] ?? '#67e8f9'
      const color = a.onTarget ? accent : '#ef4444'
      // dotted flight preview
      ctx.strokeStyle = color
      ctx.lineWidth = 4 * dpr
      ctx.setLineDash([10 * dpr, 12 * dpr])
      ctx.beginPath()
      ctx.moveTo(G.homeX, G.homeY)
      ctx.lineTo(a.tx, a.ty)
      ctx.stroke()
      ctx.setLineDash([])
      // drag handle
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, 12 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.globalAlpha = 1
      // target ring, pulsing with power
      const pulse = 1 + Math.sin(now / 140) * 0.08
      ctx.strokeStyle = color
      ctx.lineWidth = 5 * dpr
      ctx.beginPath()
      ctx.arc(a.tx, a.ty, 20 * dpr * pulse, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(a.tx - 9 * dpr, a.ty)
      ctx.lineTo(a.tx + 9 * dpr, a.ty)
      ctx.moveTo(a.tx, a.ty - 9 * dpr)
      ctx.lineTo(a.tx, a.ty + 9 * dpr)
      ctx.stroke()
      // power bar under the ball
      const bw = 88 * dpr
      const by = G.homeY + 40 * dpr
      ctx.fillStyle = 'rgba(15,23,42,0.45)'
      ctx.beginPath()
      ctx.roundRect(G.homeX - bw / 2, by, bw, 10 * dpr, 5 * dpr)
      ctx.fill()
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(G.homeX - bw / 2, by, bw * a.power, 10 * dpr, 5 * dpr)
      ctx.fill()
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
        const k = clamp(1 - p.age / 1.1, 0, 1)
        ctx.globalAlpha = k
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

    // the kicker: idles beside the spot, swings through on the kick, hops on a goal
    const placeAvatar = (G, s, now) => {
      const el = avatarRef.current
      if (!el) return
      const hx = G.homeX / dpr
      const hy = G.homeY / dpr
      let ax = Math.min(hx + AV_W * 0.5 + 26, G.W / dpr - AV_W / 2 - 6)
      let ay = hy + 22
      let rot = 0
      let scale = 1
      if (s.phase === 'aim') ay += Math.sin(now / 420) * 3
      const since = now - s.kickAt
      if (since >= 0 && since < 620) {
        const swing = Math.sin(Math.PI * clamp(since / 300, 0, 1))
        ax -= swing * 30
        rot = -18 * swing
      }
      if (s.phase === 'result' && s.lastKind === 'goal') {
        const hop = Math.abs(Math.sin((now - s.resultAt) / 160))
        ay -= hop * 26
        rot = Math.sin((now - s.resultAt) / 130) * 12
        scale = 1 + hop * 0.07
      }
      el.style.transform = `translate3d(${ax - AV_W / 2}px, ${ay - AV_H}px, 0) rotate(${rot}deg) scale(${scale})`
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
        s.keeper.x = G.cx
        toAim(G)
      }

      if (s.phase === 'aim') {
        // keeper paces the line — gives the kid a rhythm to shoot against
        s.keeper.x = G.cx + Math.sin(now / 820) * G.goalW * 0.26
        s.keeper.lean = Math.cos(now / 820) * 5
        s.ball.x = G.homeX
        s.ball.y = G.homeY
        s.ball.r = G.ballR
      } else if (s.phase === 'fly') {
        const sh = s.shot
        const t = clamp((now - sh.start) / (sh.dur * 1000), 0, 1)
        const e = 1 - Math.pow(1 - t, 1.6)
        s.ball.x = sh.fromX + (sh.tx - sh.fromX) * e
        s.ball.y = sh.fromY + (sh.ty - sh.fromY) * e - Math.sin(Math.PI * t) * G.goalH * 0.16
        s.ball.r = G.ballR * (1 - 0.42 * e)
        s.trail.push({ x: s.ball.x, y: s.ball.y, r: s.ball.r })
        if (s.trail.length > 9) s.trail.shift()

        const k = s.keeper
        if (now >= k.diveAt) {
          const d = k.toX - k.x
          const step = k.speed * dt
          k.x += Math.abs(d) <= step ? d : Math.sign(d) * step
        }
        const spread = clamp(Math.abs(k.x - k.startX) / (G.goalW * 0.3), 0, 1)
        k.lean = clamp((k.x - k.startX) / (G.goalW * 0.3), -1, 1) * 34

        // the save is decided as the ball reaches the goal — a hard shot can
        // simply beat the dive, and a shot up near the bar clears him
        if (t > 0.74) {
          const kw = G.goalW * 0.17 * (1 + 0.55 * spread)
          const kh = G.goalH * k.cover
          const hit =
            s.ball.x + s.ball.r > k.x - kw / 2 &&
            s.ball.x - s.ball.r < k.x + kw / 2 &&
            s.ball.y + s.ball.r > G.gy1 - kh &&
            s.ball.y - s.ball.r < G.gy1 + 10 * dpr
          if (hit) resolve('save', now)
        }
        if (s.phase === 'fly' && t >= 1) resolve(sh.onTarget ? 'goal' : 'wide', now)
      } else if (s.phase === 'result') {
        if (s.deflect) {
          s.deflect.vy += 1500 * dpr * dt
          s.ball.x += s.deflect.vx * dt
          s.ball.y += s.deflect.vy * dt
        }
        s.keeper.lean += (0 - s.keeper.lean) * Math.min(1, dt * 4)
        if (now >= s.resultUntil) {
          if (s.shots >= TOTAL_SHOTS || s.straightMiss >= MAX_MISS) {
            finish()
            return
          }
          toAim(G)
          sfx.flip()
        }
      }

      /* ---- draw ---- */
      drawPitch(G)
      drawNet(G)
      drawKeeper(G, s)
      drawFrame(G)
      drawDots(G, s)
      drawBall(G, s)
      drawFx(s, dt)
      if (s.aiming) drawGuide(G, s, now)
      placeAvatar(G, s, now)

      const lives = Math.max(0, MAX_MISS - s.straightMiss)
      setHud((h) => (h.score === s.score && h.lives === lives ? h : { score: s.score, lives, maxLives: MAX_MISS }))

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
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* the kicker — SVG doll layered over the canvas, moved by the loop */}
      <div
        ref={avatarRef}
        aria-hidden="true"
        className="absolute pointer-events-none will-change-transform drop-shadow-lg"
        style={{ left: 0, top: 0, width: AV_W, height: AV_H, transformOrigin: '50% 100%' }}
      >
        <Avatar size={AV_H} />
      </div>

      {/* result banner */}
      {msg && (
        <div dir="rtl" className="absolute inset-x-0 top-[46%] flex justify-center pointer-events-none">
          <div
            key={msg.id}
            className={`anim-pop ${MSG[msg.kind].cls} text-white font-black text-4xl px-8 py-3 rounded-3xl border-b-8 shadow-xl`}
          >
            {MSG[msg.kind].text}
          </div>
        </div>
      )}

      {/* one-off nudge — the guide line teaches the rest */}
      {hint && (
        <div dir="rtl" className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-xl px-5 py-2 rounded-2xl shadow-lg">
            גררו מהכדור ושחררו כדי לבעוט 👆
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
