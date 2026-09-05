import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import Avatar from '../avatar/Avatar.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const FRAMES = 10
const AVATAR_H = 104 // doll height in CSS px (Avatar keeps the 200x320 aspect)
const AVATAR_W = AVATAR_H * 0.66
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const SETTLE_MS = 800 // pins get at least this long to tumble before we count
const BANNER_MS = 1500
const POP_GAP = 70 // ms between pin pops so ten at once is not a wall of noise

// pin triangle in [row, sideways offset] units — row 0 is the head pin (1),
// row 3 is the back row (7-8-9-10). Rows sit further up the lane.
const PIN_HOME = [
  [0, 0],
  [1, -0.5],
  [1, 0.5],
  [2, -1],
  [2, 0],
  [2, 1],
  [3, -1.5],
  [3, -0.5],
  [3, 0.5],
  [3, 1.5],
]

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Running ten-pin score. Bonus rolls that have not happened yet count as 0, so
 * the number on screen only ever grows — a strike pays out again two rolls
 * later instead of showing a confusing blank.
 * Returns one entry per frame: { marks, total } (total null before the frame starts).
 */
function scoreFrames(rolls) {
  const out = []
  const digit = (n) => (n === 0 ? '-' : String(n))
  let i = 0
  let total = 0
  for (let f = 0; f < FRAMES; f++) {
    const a = rolls[i]
    if (a === undefined) {
      out.push({ marks: [], total: null })
      continue
    }
    const b = rolls[i + 1]
    const c = rolls[i + 2]
    if (f === FRAMES - 1) {
      const marks = [a === 10 ? 'X' : digit(a)]
      if (b !== undefined) marks.push(b === 10 ? 'X' : a !== 10 && a + b === 10 ? '/' : digit(b))
      if (c !== undefined) marks.push(c === 10 ? 'X' : a === 10 && b !== 10 && b + c === 10 ? '/' : digit(c))
      total += a + (b ?? 0) + (c ?? 0)
      out.push({ marks, total })
    } else if (a === 10) {
      total += 10 + (b ?? 0) + (c ?? 0)
      out.push({ marks: ['', 'X'], total })
      i += 1
    } else if (b !== undefined) {
      const spare = a + b === 10
      total += spare ? 10 + (c ?? 0) : a + b
      out.push({ marks: [digit(a), spare ? '/' : digit(b)], total })
      i += 2
    } else {
      total += a
      out.push({ marks: [digit(a)], total })
      i += 2
    }
  }
  return out
}

const boardTotal = (board) => {
  for (let i = board.length - 1; i >= 0; i--) if (board[i].total !== null) return board[i].total
  return 0
}

// bowling-pin silhouette, base at the origin, growing upwards
function pinPath(ctx, h) {
  ctx.beginPath()
  ctx.moveTo(-0.13 * h, -0.97 * h)
  ctx.bezierCurveTo(-0.27 * h, -0.88 * h, -0.24 * h, -0.7 * h, -0.15 * h, -0.6 * h)
  ctx.bezierCurveTo(-0.33 * h, -0.42 * h, -0.3 * h, -0.1 * h, -0.19 * h, 0)
  ctx.lineTo(0.19 * h, 0)
  ctx.bezierCurveTo(0.3 * h, -0.1 * h, 0.33 * h, -0.42 * h, 0.15 * h, -0.6 * h)
  ctx.bezierCurveTo(0.24 * h, -0.7 * h, 0.27 * h, -0.88 * h, 0.13 * h, -0.97 * h)
  ctx.quadraticCurveTo(0, -1.06 * h, -0.13 * h, -0.97 * h)
  ctx.closePath()
}

function drawPin(ctx, p, h, dpr) {
  ctx.save()
  ctx.translate(p.x, p.y)
  // ground shadow first, unrotated
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.ellipse(0, 0, h * (0.22 + 0.35 * p.fall), h * 0.075, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.rotate(p.angle)
  if (p.state === 'down') ctx.globalAlpha = 0.9
  pinPath(ctx, h)
  const grad = ctx.createLinearGradient(-0.3 * h, 0, 0.3 * h, 0)
  grad.addColorStop(0, '#d7dee8')
  grad.addColorStop(0.4, '#ffffff')
  grad.addColorStop(1, '#c3cbd8')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#ef4444'
  ctx.fillRect(-0.4 * h, -0.75 * h, 0.8 * h, 0.06 * h)
  ctx.fillRect(-0.4 * h, -0.64 * h, 0.8 * h, 0.06 * h)
  ctx.restore()
  ctx.lineWidth = Math.max(1, 1.6 * dpr)
  ctx.strokeStyle = 'rgba(30,41,59,0.55)'
  pinPath(ctx, h)
  ctx.stroke()
  ctx.restore()
}

/**
 * Bowling — his doll stands at the foul line of a bumpered lane. Drag sideways
 * to line the ball up, flick forward to roll: the flick's speed is the power and
 * its sideways angle puts a hook on the ball. Ten frames, two balls each, real
 * strike/spare scoring. No clock — the round ends when the tenth frame does.
 */
export default function Bowling({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const areaRef = useRef(null)
  const avatarRef = useRef(null) // positioned wrapper (inline transform)
  const avatarBodyRef = useRef(null) // inner wrapper (celebration class)
  const g = useRef(null) // all game state — the RAF loop mutates it without re-renders
  const [hud, setHud] = useState({ score: 0 })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [banner, setBanner] = useState(null) // { id, text, big }
  const [intro, setIntro] = useState(true)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const area = areaRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const vars = theme?.vars ?? {}
    const accent = vars['--t-accent'] ?? '#facc15'
    const accentDeep = vars['--t-accent-deep'] ?? '#b45309'
    const deep = vars['--t-side-deep'] ?? '#0d0733'
    const side = vars['--t-side'] ?? '#1b1160'
    const confetti = theme?.confetti ?? ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399']

    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t)
        fn()
      }, ms)
      timers.add(t)
    }

    /* ---------- geometry ---------- */
    const measure = () => {
      const r = area.getBoundingClientRect()
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      const W = canvas.width
      const H = canvas.height
      const boardH = 44 * dpr // frame scoreboard strip
      const approachH = 100 * dpr // strip below the foul line where the doll stands
      const laneTop = boardH + 8 * dpr
      const foulY = H - approachH
      const laneH = foulY - laneTop
      const spacing = Math.min((W * 0.8) / 3.5, laneH / 6.2)
      const rowGap = Math.min(spacing * 0.9, laneH * 0.085)
      const laneW = spacing * 3.5
      const cx = W / 2
      const ballR = spacing * 0.35
      const G = {
        W,
        H,
        boardH,
        laneTop,
        foulY,
        cx,
        spacing,
        rowGap,
        laneW,
        laneLeft: cx - laneW / 2,
        laneRight: cx + laneW / 2,
        ballR,
        pinR: spacing * 0.22,
        pinH: Math.min(spacing * 1.35, rowGap * 1.55),
        headPinY: laneTop + rowGap * 3.9,
        ballStartY: foulY - ballR - 14 * dpr, // clear of the doll's head
      }
      G.runDist = Math.max(60 * dpr, G.ballStartY - G.headPinY)
      return G
    }

    const homePos = (i, G) => ({
      x: G.cx + PIN_HOME[i][1] * G.spacing,
      y: G.headPinY - PIN_HOME[i][0] * G.rowGap,
    })

    const freshPins = (G) =>
      PIN_HOME.map((_, i) => {
        const h = homePos(i, G)
        return { x: h.x, y: h.y, vx: 0, vy: 0, angle: 0, fall: 0, dir: 1, state: 'up' }
      })

    const G0 = measure()

    g.current = {
      geo: G0,
      pins: freshPins(G0),
      ball: null,
      ballX: G0.cx,
      trail: [],
      sparks: [],
      drag: null,
      rolls: [],
      frameRolls: [],
      frame: 0,
      board: scoreFrames([]),
      total: 0,
      knocked: 0,
      hitPins: false,
      lastPop: 0,
      phase: 'aim', // aim -> roll -> settle -> reset -> aim
      settleAt: 0,
      resetAt: 0,
      sweep: false, // clear fallen pins on the next aim
      refill: false, // stand all ten back up on the next aim
      overAt: 0,
      last: performance.now(),
      done: false,
      bannerId: 0,
    }

    const onResize = () => {
      const s = g.current
      if (!s) return
      const old = s.geo
      const G = measure()
      const sx = G.spacing / old.spacing
      for (const p of s.pins) {
        p.x = G.cx + (p.x - old.cx) * sx
        p.y = G.headPinY - (old.headPinY - p.y) * sx
      }
      s.ballX = clamp(G.cx + (s.ballX - old.cx) * sx, G.laneLeft + G.ballR, G.laneRight - G.ballR)
      if (s.ball) {
        s.ball.x = clamp(G.cx + (s.ball.x - old.cx) * sx, G.laneLeft + G.ballR, G.laneRight - G.ballR)
        s.ball.y = G.headPinY - (old.headPinY - s.ball.y) * sx
      }
      s.trail = []
      s.geo = G
    }
    window.addEventListener('resize', onResize)

    /* ---------- banners ---------- */
    const say = (text, big) => {
      const s = g.current
      const id = ++s.bannerId
      setBanner({ id, text, big })
      later(() => setBanner((b) => (b && b.id === id ? null : b)), BANNER_MS)
    }

    const cheer = () => {
      const body = avatarBodyRef.current
      if (!body) return
      body.classList.remove('anim-wave-jump')
      // restart the animation even if it is already playing
      void body.offsetWidth
      body.classList.add('anim-wave-jump')
      later(() => body.classList.remove('anim-wave-jump'), 700)
    }

    const burst = (x, y, n) => {
      const s = g.current
      const { ballR } = s.geo
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
        const sp = (2 + Math.random() * 5) * ballR
        s.sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.9 + Math.random() * 0.5,
          age: 0,
          r: ballR * (0.12 + Math.random() * 0.16),
          c: confetti[i % confetti.length],
        })
      }
    }

    /* ---------- pin physics ---------- */
    const knock = (p, nx, ny, power, now) => {
      const s = g.current
      p.state = 'down'
      p.vx = nx * power + (Math.random() - 0.5) * power * 0.35
      p.vy = ny * power + (Math.random() - 0.5) * power * 0.2
      p.dir = nx >= 0 ? 1 : -1
      p.fall = 0.001
      s.knocked += 1
      if (now - s.lastPop > POP_GAP) {
        s.lastPop = now
        sfx.pop()
      }
    }

    const stepPins = (dt, now) => {
      const s = g.current
      const G = s.geo
      const drag = Math.max(0, 1 - dt * 2.6)
      for (const p of s.pins) {
        if (p.state !== 'down') continue
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= drag
        p.vy *= drag
        p.fall = Math.min(1, p.fall + dt * 3.4)
        p.angle = p.dir * p.fall * 1.45
        // keep the wreckage on the deck
        if (p.x < G.laneLeft + G.pinR) {
          p.x = G.laneLeft + G.pinR
          p.vx = Math.abs(p.vx) * 0.3
        }
        if (p.x > G.laneRight - G.pinR) {
          p.x = G.laneRight - G.pinR
          p.vx = -Math.abs(p.vx) * 0.3
        }
        if (p.y < G.laneTop + G.pinR) {
          p.y = G.laneTop + G.pinR
          p.vy = Math.abs(p.vy) * 0.3
        }
        // a sliding pin takes its neighbours with it
        const speed = Math.hypot(p.vx, p.vy)
        if (speed < G.spacing * 0.4) continue
        for (const q of s.pins) {
          if (q.state !== 'up') continue
          const dx = q.x - p.x
          const dy = q.y - p.y
          const d = Math.hypot(dx, dy)
          if (d > G.pinR * 2 || d === 0) continue
          knock(q, dx / d, dy / d, speed * 0.62, now)
          p.vx *= 0.7
          p.vy *= 0.7
        }
      }
    }

    /* ---------- rolling ---------- */
    const throwBall = (samples) => {
      const s = g.current
      const G = s.geo
      const now = performance.now()
      const last = samples[samples.length - 1]
      const recent = samples.filter((p) => now - p.t < 160)
      const first = recent.length > 1 ? recent[0] : last
      const dt = Math.max(0.016, (last.t - first.t) / 1000)
      // gesture speed in CSS px/s — a plain tap still bowls, just gently
      const up = (first.y - last.y) / dt
      const sideways = (last.x - first.x) / dt
      const power = clamp((up - 180) / 2200, 0, 1)
      const curve = clamp(sideways / 1500, -1, 1)
      const speed = G.runDist / (1.5 - 0.78 * power)
      s.ball = {
        x: s.ballX,
        y: G.ballStartY,
        vx: curve * G.laneW * 0.22,
        spin: curve * G.laneW * 1.15, // sideways acceleration = the hook
        vy: -speed,
      }
      s.trail = []
      s.hitPins = false
      s.knocked = 0
      s.phase = 'roll'
      sfx.flip()
      cheer()
      setIntro(false)
    }

    const stepBall = (dt, now) => {
      const s = g.current
      const G = s.geo
      const b = s.ball
      b.vx += b.spin * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vy *= Math.max(0, 1 - dt * 0.12)
      s.trail.push({ x: b.x, y: b.y })
      if (s.trail.length > 9) s.trail.shift()

      // bumper rails — no gutter balls, ever
      if (b.x - G.ballR < G.laneLeft) {
        b.x = G.laneLeft + G.ballR
        b.vx = Math.abs(b.vx) * 0.72
        b.spin *= -0.45
        sfx.click()
      } else if (b.x + G.ballR > G.laneRight) {
        b.x = G.laneRight - G.ballR
        b.vx = -Math.abs(b.vx) * 0.72
        b.spin *= -0.45
        sfx.click()
      }

      for (const p of s.pins) {
        if (p.state !== 'up') continue
        const dx = p.x - b.x
        const dy = p.y - b.y
        const d = Math.hypot(dx, dy)
        if (d > G.ballR + G.pinR || d === 0) continue
        const speed = Math.hypot(b.vx, b.vy)
        if (!s.hitPins) {
          s.hitPins = true
          sfx.thud()
        }
        knock(p, dx / d, dy / d, speed * 0.85, now)
        // the ball barely notices, but it does get nudged off line
        b.vx += (-dx / d) * speed * 0.06
        b.vy += (-dy / d) * speed * 0.03
      }

      if (b.y + G.ballR < G.laneTop || Math.hypot(b.vx, b.vy) < G.ballR * 1.2) {
        s.ball = null
        s.phase = 'settle'
        s.settleAt = now + SETTLE_MS
      }
    }

    /* ---------- frame bookkeeping ---------- */
    const finishRoll = (now) => {
      const s = g.current
      const knocked = s.knocked
      const standing = s.pins.filter((p) => p.state === 'up').length
      s.rolls.push(knocked)
      s.frameRolls.push(knocked)
      s.board = scoreFrames(s.rolls)
      s.total = boardTotal(s.board)

      const r = s.frameRolls
      const lastFrame = s.frame === FRAMES - 1
      let finished = false
      let refill = false

      if (!lastFrame) {
        if (r.length === 1 && knocked === 10) {
          refill = true
          s.frame += 1
          s.frameRolls = []
        } else if (r.length === 2) {
          refill = true
          s.frame += 1
          s.frameRolls = []
        }
      } else if (r.length === 1) {
        refill = r[0] === 10
      } else if (r.length === 2) {
        if (r[0] === 10) refill = r[1] === 10
        else if (r[0] + r[1] === 10) refill = true
        else finished = true
      } else {
        finished = true
      }

      // strike / spare celebration
      const strike = knocked === 10 && standing === 0 && (r.length === 1 || refill || r[r.length - 2] === 10)
      const spare = !strike && standing === 0 && knocked > 0
      let pause = 700
      if (strike) {
        sfx.fanfare()
        say('סטרייק!', true)
        burst(s.geo.cx, s.geo.headPinY - s.geo.rowGap, 26)
        cheer()
        pause = 1400
      } else if (spare) {
        sfx.ding()
        say('ספייר!', true)
        burst(s.geo.cx, s.geo.headPinY - s.geo.rowGap, 16)
        cheer()
        pause = 1300
      } else if (knocked === 0) {
        sfx.buzz()
        say('לא נורא, נסו שוב!', false)
        pause = 1100
      } else if (knocked >= 7) {
        sfx.coin()
        say('יופי, כמעט הכול!', false)
        pause = 1000
      }

      s.sweep = true
      s.refill = refill
      s.phase = 'reset'
      s.resetAt = now + pause
      if (finished) s.overAt = now + pause + 500
    }

    const startAim = () => {
      const s = g.current
      const G = s.geo
      if (s.refill) s.pins = freshPins(G)
      else if (s.sweep) for (const p of s.pins) if (p.state === 'down') p.state = 'gone'
      s.sweep = false
      s.refill = false
      s.ballX = G.cx
      s.phase = 'aim'
    }

    /* ---------- input: drag to aim, flick forward to bowl ---------- */
    const onDown = (e) => {
      const s = g.current
      if (!s || s.done || s.phase !== 'aim') return
      s.drag = {
        id: e.pointerId,
        x0: e.clientX,
        ballX0: s.ballX,
        samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }],
      }
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      sfx.click()
      e.preventDefault()
    }
    const onMove = (e) => {
      const s = g.current
      const d = s?.drag
      if (!d || e.pointerId !== d.id) return
      const G = s.geo
      s.ballX = clamp(d.ballX0 + (e.clientX - d.x0) * dpr, G.laneLeft + G.ballR, G.laneRight - G.ballR)
      d.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      if (d.samples.length > 14) d.samples.shift()
      e.preventDefault()
    }
    const onUp = (e) => {
      const s = g.current
      const d = s?.drag
      if (!d || e.pointerId !== d.id) return
      s.drag = null
      if (s.done || s.phase !== 'aim') return
      d.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      throwBall(d.samples)
    }
    const onCancel = () => {
      const s = g.current
      if (s) s.drag = null
    }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)

    /* ---------- drawing ---------- */
    const drawBoard = (s) => {
      const G = s.geo
      const cellW = G.W / FRAMES
      const top = 3 * dpr
      const h = G.boardH - 6 * dpr
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let f = 0; f < FRAMES; f++) {
        const x = f * cellW
        const activeFrame = f === s.frame && !s.done
        ctx.fillStyle = activeFrame ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.28)'
        ctx.beginPath()
        ctx.roundRect(x + 1.5 * dpr, top, cellW - 3 * dpr, h, 5 * dpr)
        ctx.fill()
        ctx.lineWidth = activeFrame ? 2.5 * dpr : 1 * dpr
        ctx.strokeStyle = activeFrame ? accent : 'rgba(255,255,255,0.22)'
        ctx.stroke()

        const cell = s.board[f]
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.font = `900 ${12 * dpr}px system-ui, sans-serif`
        const marks = cell.marks.filter((m) => m !== '')
        const slots = f === FRAMES - 1 ? 3 : 2
        marks.forEach((m, k) => {
          const slot = f === FRAMES - 1 ? k : cell.marks.length - marks.length + k
          const mx = x + cellW * ((slot + 0.5) / slots)
          ctx.fillText(m, mx, top + h * 0.3)
        })
        if (cell.total !== null) {
          ctx.fillStyle = accent
          ctx.font = `900 ${14 * dpr}px system-ui, sans-serif`
          ctx.fillText(String(cell.total), x + cellW / 2, top + h * 0.74)
        }
      }
    }

    const draw = (now) => {
      const s = g.current
      const G = s.geo

      // alley
      const bg = ctx.createLinearGradient(0, 0, 0, G.H)
      bg.addColorStop(0, deep)
      bg.addColorStop(1, side)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, G.W, G.H)

      // pit behind the pins
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, G.boardH, G.W, G.laneTop - G.boardH + G.rowGap * 0.6)

      // lane
      const wood = ctx.createLinearGradient(0, G.laneTop, 0, G.foulY)
      wood.addColorStop(0, '#b9782f')
      wood.addColorStop(0.35, '#e6b478')
      wood.addColorStop(1, '#f0c894')
      ctx.fillStyle = wood
      ctx.fillRect(G.laneLeft, G.laneTop, G.laneW, G.foulY - G.laneTop)
      ctx.strokeStyle = 'rgba(120,72,20,0.25)'
      ctx.lineWidth = 1 * dpr
      for (let i = 1; i < 8; i++) {
        const x = G.laneLeft + (G.laneW * i) / 8
        ctx.beginPath()
        ctx.moveTo(x, G.laneTop)
        ctx.lineTo(x, G.foulY)
        ctx.stroke()
      }
      // pin deck shading
      ctx.fillStyle = 'rgba(90,55,15,0.18)'
      ctx.fillRect(G.laneLeft, G.laneTop, G.laneW, G.rowGap * 4.4)

      // the seven aiming arrows every real lane has
      ctx.fillStyle = 'rgba(120,60,10,0.45)'
      for (let i = -3; i <= 3; i++) {
        const ax = G.cx + i * G.spacing * 0.5
        const ay = G.foulY - G.runDist * 0.42
        ctx.beginPath()
        ctx.moveTo(ax, ay - G.spacing * 0.26)
        ctx.lineTo(ax + G.spacing * 0.09, ay)
        ctx.lineTo(ax - G.spacing * 0.09, ay)
        ctx.closePath()
        ctx.fill()
      }

      // bumper rails
      const railW = G.spacing * 0.24
      for (const rx of [G.laneLeft - railW, G.laneRight]) {
        ctx.fillStyle = accentDeep
        ctx.beginPath()
        ctx.roundRect(rx, G.laneTop, railW, G.foulY - G.laneTop, railW / 2)
        ctx.fill()
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.roundRect(rx + railW * 0.2, G.laneTop, railW * 0.4, G.foulY - G.laneTop, railW / 4)
        ctx.fill()
      }

      // approach + foul line
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, G.foulY, G.W, G.H - G.foulY)
      ctx.fillStyle = '#f87171'
      ctx.fillRect(G.laneLeft - railW, G.foulY - 2 * dpr, G.laneW + railW * 2, 4 * dpr)

      // aiming guide
      if (s.phase === 'aim' && !s.done) {
        ctx.save()
        ctx.setLineDash([8 * dpr, 9 * dpr])
        ctx.lineWidth = 3 * dpr
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.beginPath()
        ctx.moveTo(s.ballX, G.ballStartY - G.ballR)
        ctx.lineTo(s.ballX, G.headPinY)
        ctx.stroke()
        ctx.restore()
        ctx.strokeStyle = accent
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        ctx.arc(s.ballX, G.headPinY, G.pinR * 1.5, 0, Math.PI * 2)
        ctx.stroke()
      }

      // pins — far rows first so the near ones overlap them
      const order = s.pins.filter((p) => p.state !== 'gone').sort((a, b) => a.y - b.y)
      for (const p of order) drawPin(ctx, p, G.pinH, dpr)

      // ball
      if (s.ball) {
        s.trail.forEach((t, i) => {
          ctx.globalAlpha = ((i + 1) / s.trail.length) * 0.28
          ctx.fillStyle = accent
          ctx.beginPath()
          ctx.arc(t.x, t.y, G.ballR * (0.4 + 0.5 * (i / s.trail.length)), 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
      }
      const bx = s.ball ? s.ball.x : s.ballX
      const by = s.ball ? s.ball.y : G.ballStartY
      if (s.ball || s.phase === 'aim' || s.phase === 'reset') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(bx, by + G.ballR * 0.55, G.ballR * 0.95, G.ballR * 0.4, 0, 0, Math.PI * 2)
        ctx.fill()
        const bg2 = ctx.createRadialGradient(
          bx - G.ballR * 0.35,
          by - G.ballR * 0.4,
          G.ballR * 0.15,
          bx,
          by,
          G.ballR,
        )
        bg2.addColorStop(0, accent)
        bg2.addColorStop(0.55, accentDeep)
        bg2.addColorStop(1, deep)
        ctx.fillStyle = bg2
        ctx.beginPath()
        ctx.arc(bx, by, G.ballR, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        for (const [hx, hy] of [
          [-0.3, -0.18],
          [0, -0.34],
          [0.3, -0.18],
        ]) {
          ctx.beginPath()
          ctx.arc(bx + hx * G.ballR, by + hy * G.ballR, G.ballR * 0.13, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // celebration sparks
      for (const sp of s.sparks) {
        ctx.globalAlpha = Math.max(0, 1 - sp.age / sp.life)
        ctx.fillStyle = sp.c
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      drawBoard(s)

      // doll follows the ball's launch spot
      const el = avatarRef.current
      if (el) {
        el.style.transform = `translate3d(${bx / dpr - AVATAR_W / 2}px, ${G.foulY / dpr - AVATAR_H + 14}px, 0)`
      }
      void now
    }

    /* ---------- loop ---------- */
    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now

      if (s.phase === 'roll' && s.ball) stepBall(dt, now)
      stepPins(dt, now)

      if (s.phase === 'settle') {
        const calm = s.pins.every((p) => p.state !== 'down' || Math.hypot(p.vx, p.vy) < s.geo.spacing * 0.25)
        if (now >= s.settleAt && calm) finishRoll(now)
      } else if (s.phase === 'reset') {
        s.ballX += (s.geo.cx - s.ballX) * Math.min(1, dt * 5)
        if (now >= s.resetAt && !s.overAt) startAim()
      }

      for (const sp of s.sparks) {
        sp.age += dt
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
        sp.vy += s.geo.ballR * 26 * dt
      }
      s.sparks = s.sparks.filter((sp) => sp.age < sp.life)

      draw(now)
      setHud((h) => (h.score === s.total ? h : { score: s.total }))

      if (s.overAt && now >= s.overAt) {
        s.done = true
        const score = s.total
        const isRecord = score > highScore
        if (isRecord) sfx.fanfare()
        setOver({ score, isRecord })
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    later(() => setIntro(false), 5200)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
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
      {/* the lane is a physical space — keep it LTR whatever the app direction is */}
      <div dir="ltr" className="absolute inset-0 flex justify-center">
        <div ref={areaRef} className="relative h-full w-full max-w-[560px] overflow-hidden touch-none select-none">
          <canvas ref={canvasRef} className="absolute inset-0" />

          {/* HIS doll, standing at the foul line — outer div positions, inner cheers */}
          <div
            ref={avatarRef}
            className="absolute left-0 top-0 pointer-events-none will-change-transform"
            style={{ width: AVATAR_W, height: AVATAR_H }}
          >
            <div ref={avatarBodyRef} className="w-full h-full flex items-end justify-center drop-shadow-lg">
              <Avatar size={AVATAR_H} />
            </div>
          </div>

          {banner && (
            <div key={banner.id} className="absolute inset-x-0 top-[26%] flex justify-center pointer-events-none" dir="rtl">
              <div
                className={`anim-pop bg-white/95 text-slate-800 font-black rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl px-7 py-4 ${
                  banner.big ? 'text-4xl' : 'text-2xl'
                }`}
              >
                {banner.text}
              </div>
            </div>
          )}

          {intro && !banner && (
            <div className="absolute inset-x-0 bottom-[14%] flex justify-center pointer-events-none px-4" dir="rtl">
              <div className="anim-fade-in bg-black/65 text-white font-black text-xl rounded-2xl px-5 py-3 text-center leading-snug">
                גררו כדי לכוון
                <br />
                החליקו קדימה כדי לזרוק 🎳
              </div>
            </div>
          )}
        </div>
      </div>
    </ArcadeShell>
  )
}
