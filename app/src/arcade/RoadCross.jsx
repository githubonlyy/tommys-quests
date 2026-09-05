import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import Avatar from '../avatar/Avatar.jsx'
import ArcadeShell from './ArcadeShell.jsx'

// Road Cross — Frogger. Tap above / below / left / right of the doll to hop one
// square. Dodge the traffic, ride the logs, reach the far bank.

const COLS = 9
const START_LIVES = 3
const MAX_EXTRA = 4 // the board stops growing at 9 lanes so squares stay tappable
const BANK_SCORE = 100
const STEP_SCORE = 10
const HOP_SEC = 0.13
const SQUASH_SEC = 0.16
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const HALF_W = 0.3 // player half-width in cells — a forgiving hitbox
const VEH_INSET = 0.12 // shave the bumpers so a near-miss stays a miss
const GRIP = 0.18 // extra grip past both ends of a log or turtle
const DEATH_SEC = 0.9
const WIN_SEC = 1.0
const HINT_MS = 5200

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const rnd = (a, b) => a + Math.random() * (b - a)
const mod = (a, n) => ((a % n) + n) % n

// [body, darker lip] pairs — the chunky two-tone every sprite in the arcade uses
const CAR_PAINT = [
  ['#ef4444', '#991b1b'],
  ['#f97316', '#9a3412'],
  ['#facc15', '#a16207'],
  ['#22c55e', '#15803d'],
  ['#38bdf8', '#0369a1'],
  ['#a855f7', '#6b21a8'],
  ['#ec4899', '#9d174d'],
  ['#e2e8f0', '#94a3b8'],
]

/**
 * One lane of endlessly repeating bodies. They ride a ring of length
 * `count * period`, so the spacing is fixed: `gap` cells of clear road between
 * every car. That is the whole difficulty knob — never let it drop below the
 * width he needs to stand in.
 */
function makeLane(kind, idx, len, gap, speed, variant) {
  const period = len + gap
  const count = Math.ceil((COLS + len + 3) / period)
  return {
    kind,
    variant,
    len,
    period,
    speed,
    count,
    span: count * period,
    dir: idx % 2 === 0 ? 1 : -1, // neighbouring lanes always flow opposite ways
    phase: Math.random() * count * period,
    seed: Math.floor(Math.random() * CAR_PAINT.length),
  }
}

/**
 * A crossing is: start bank -> roads -> grass median -> river -> goal bank.
 * Each level adds one lane (alternating road / river) until the board is full,
 * after which only the speed keeps climbing.
 */
function buildRows(level) {
  const extra = Math.min(level, MAX_EXTRA)
  const roads = 2 + Math.ceil(extra / 2)
  const rivers = 2 + Math.floor(extra / 2)
  const sp = 1 + Math.min(level, 10) * 0.085
  const rows = [{ kind: 'bank' }]

  for (let i = 0; i < roads; i++) {
    const truck = Math.random() < 0.34
    const len = truck ? rnd(2.4, 2.9) : rnd(1.4, 1.7)
    const gap = Math.max(1.9, rnd(3.5, 4.3) - level * 0.16)
    rows.push(makeLane('road', i, len, gap, rnd(1.15, 1.85) * sp, truck ? 'truck' : 'car'))
  }
  rows.push({ kind: 'grass' })
  for (let i = 0; i < rivers; i++) {
    const turtle = i % 2 === 1
    const len = turtle ? rnd(1.9, 2.3) : rnd(2.7, 3.4)
    // river gaps stay small — a straight hop must nearly always land on something
    rows.push(makeLane('river', i, len, rnd(1.15, 1.75), rnd(0.85, 1.4) * sp, turtle ? 'turtle' : 'log'))
  }
  rows.push({ kind: 'goal' })
  return rows
}

// left edge of the k-th body of a lane, in cell units, at world time t
const bodyX = (lane, k, t) =>
  mod(lane.phase + lane.dir * lane.speed * t + k * lane.period, lane.span) - (lane.len + 1.5)

export default function RoadCross({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const heroRef = useRef(null)
  const sizeRef = useRef(96)
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, maxLives: START_LIVES })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [heroSize, setHeroSize] = useState(96)
  const [hint, setHint] = useState(true)
  const [banner, setBanner] = useState(null) // { id, text }
  const reportedRef = useRef(false)

  // world colours — vars/confetti only, never theme.arcade
  const palette = useMemo(
    () => ({
      accent: theme?.vars?.['--t-accent'] ?? '#fde047',
      confetti: theme?.confetti?.length ? theme.confetti : ['#fde047', '#f472b6', '#38bdf8', '#ffffff', '#34d399'],
    }),
    [theme],
  )
  const palRef = useRef(palette)
  useEffect(() => {
    palRef.current = palette
  }, [palette])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const view = { w: 1, h: 1 }
    const timers = new Set()
    let bannerId = 0
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      view.w = Math.max(1, r.width)
      view.h = Math.max(1, r.height)
      canvas.width = Math.round(view.w * dpr)
      canvas.height = Math.round(view.h * dpr)
      canvas.style.width = `${view.w}px`
      canvas.style.height = `${view.h}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const rows0 = buildRows(0)
    g.current = {
      rows: rows0,
      R: rows0.length,
      level: 0,
      t: 0,
      x: Math.floor(COLS / 2), // column of the player's square (float while riding)
      row: 0,
      best: 0, // furthest row this crossing — step points are paid once
      face: 1,
      hop: null, // { fromX, fromRow, toX, toRow, t }
      squash: 0,
      dead: null, // { reason, t }
      win: null, // { t }
      lives: START_LIVES,
      score: 0,
      bits: [], // splash droplets + confetti
      pops: [], // floating "+10"
      geo: null,
      done: false,
    }

    const syncHud = () => {
      const s = g.current
      setHud((h) =>
        h.score === s.score && h.lives === Math.max(0, s.lives)
          ? h
          : { score: s.score, lives: Math.max(0, s.lives), maxLives: START_LIVES },
      )
    }

    const burst = (cx, cy, colors, n, spread) => {
      const s = g.current
      for (let i = 0; i < n; i++) {
        const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15)
        const v = rnd(spread * 0.4, spread)
        s.bits.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * v + rnd(-40, 40),
          vy: Math.sin(a) * v,
          r: rnd(3, 7),
          life: rnd(0.5, 0.95),
          max: 0.95,
          color: colors[i % colors.length],
        })
      }
    }

    const resetPlayer = () => {
      const s = g.current
      s.x = Math.floor(COLS / 2)
      s.row = 0
      s.hop = null
      s.squash = 0
      s.dead = null
    }

    const endGame = () => {
      const s = g.current
      if (!s || s.done) return
      s.done = true
      setBanner(null)
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      setOver({ score: s.score, isRecord })
    }

    const die = (reason) => {
      const s = g.current
      if (!s || s.done || s.dead || s.win) return
      s.dead = { reason, t: 0 }
      s.lives -= 1
      sfx.thud()
      const geo = s.geo
      if (geo) {
        const cx = geo.bx + (s.x + 0.5) * geo.cell
        const cy = geo.by + (s.R - 1 - s.row) * geo.cell + geo.cell * 0.5
        burst(cx, cy, reason === 'water' ? ['#bae6fd', '#7dd3fc', '#ffffff'] : ['#fca5a5', '#fbbf24', '#ffffff'], 16, 260)
      }
      syncHud()
      setBanner({ id: ++bannerId, text: reason === 'water' ? 'נפלת למים! 💦' : 'אאוץ\'! 💥' })
      later(() => {
        if (s.lives <= 0) {
          endGame()
        } else {
          setBanner(null)
          resetPlayer()
        }
      }, DEATH_SEC * 1000)
    }

    const nextLevel = () => {
      const s = g.current
      if (!s || s.done) return
      s.level += 1
      s.rows = buildRows(s.level)
      s.R = s.rows.length
      s.best = 0
      s.win = null
      resetPlayer()
      setBanner({ id: ++bannerId, text: `שלב ${s.level + 1}` })
      later(() => setBanner(null), 900)
    }

    const winCrossing = () => {
      const s = g.current
      s.score += BANK_SCORE
      s.win = { t: 0 }
      sfx.fanfare()
      syncHud()
      const geo = s.geo
      if (geo) {
        const cx = geo.bx + (s.x + 0.5) * geo.cell
        const cy = geo.by + geo.cell * 0.6
        burst(cx, cy, palRef.current.confetti, 26, 380)
        s.pops.push({ x: cx, y: cy, text: `+${BANK_SCORE}`, life: 1.1 })
      }
      setBanner({ id: ++bannerId, text: 'כל הכבוד! 🎉' })
      later(nextLevel, WIN_SEC * 1000)
    }

    const startHop = (dx, drow) => {
      const s = g.current
      if (!s || s.done || s.hop || s.dead || s.win) return
      // hops that start on land snap back onto the grid; on water he keeps the
      // float x the log gave him
      const baseX = s.rows[s.row].kind === 'river' ? s.x : Math.round(s.x)
      const toRow = clamp(s.row + drow, 0, s.R - 1)
      const toX = clamp(baseX + dx, 0, COLS - 1)
      if (toRow === s.row && Math.abs(toX - s.x) < 0.02) return
      s.hop = { fromX: s.x, fromRow: s.row, toX, toRow, t: 0 }
      if (dx !== 0) s.face = dx > 0 ? 1 : -1
      sfx.click()
      setHint(false)
    }

    const land = () => {
      const s = g.current
      s.x = s.hop.toX
      s.row = s.hop.toRow
      s.hop = null
      s.squash = 1
      if (s.row === s.R - 1) {
        winCrossing()
        return
      }
      if (s.row > s.best) {
        const gain = STEP_SCORE * (s.row - s.best)
        s.best = s.row
        s.score += gain
        sfx.coin()
        const geo = s.geo
        if (geo) {
          s.pops.push({
            x: geo.bx + (s.x + 0.5) * geo.cell,
            y: geo.by + (s.R - 1 - s.row) * geo.cell + geo.cell * 0.4,
            text: `+${gain}`,
            life: 0.8,
          })
        }
        syncHud()
      }
      hazards(0) // a car already sitting on the square kills on touchdown
    }

    // standing on a lane: traffic hits him, water carries him or swallows him
    const hazards = (dt) => {
      const s = g.current
      const row = s.rows[s.row]
      const cx = s.x + 0.5
      if (row.kind === 'road') {
        for (let k = 0; k < row.count; k++) {
          const bx0 = bodyX(row, k, s.t)
          if (cx + HALF_W > bx0 + VEH_INSET && cx - HALF_W < bx0 + row.len - VEH_INSET) {
            die('hit')
            return
          }
        }
      } else if (row.kind === 'river') {
        let riding = null
        for (let k = 0; k < row.count; k++) {
          const bx0 = bodyX(row, k, s.t)
          if (cx > bx0 - GRIP && cx < bx0 + row.len + GRIP) {
            riding = true
            break
          }
        }
        if (!riding) {
          die('water')
          return
        }
        s.x += row.dir * row.speed * dt
        if (s.x + 0.5 < 0.25 || s.x + 0.5 > COLS - 0.25) die('water') // rode off the bank
      }
    }

    const onDown = (e) => {
      e.preventDefault()
      const s = g.current
      if (!s || !s.geo || s.done) return
      const r = canvas.getBoundingClientRect()
      const tx = e.clientX - r.left
      const ty = e.clientY - r.top
      const { cell, bx, by } = s.geo
      const px = bx + (s.x + 0.5) * cell
      const py = by + (s.R - 1 - s.row) * cell + cell * 0.5
      const dx = tx - px
      const dy = ty - py
      // a tap right on top of him means "forward" — the move he wants anyway
      if (Math.abs(dx) < cell * 0.45 && Math.abs(dy) < cell * 0.45) startHop(0, 1)
      else if (Math.abs(dx) > Math.abs(dy)) startHop(dx > 0 ? 1 : -1, 0)
      else startHop(0, dy < 0 ? 1 : -1)
    }
    canvas.addEventListener('pointerdown', onDown)
    later(() => setHint(false), HINT_MS)

    /* ---------- drawing ---------- */

    const roundBox = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fill()
    }

    const drawCar = (x, y, w, h, dir, paint) => {
      const top = y + h * 0.2
      const bh = h * 0.6
      const r = Math.max(3, h * 0.16)
      ctx.fillStyle = '#111827' // wheels peek out below the body
      const ww = w * 0.2
      const wh = h * 0.2
      roundBox(x + w * 0.08, top + bh - wh * 0.35, ww, wh, wh * 0.45)
      roundBox(x + w * 0.72, top + bh - wh * 0.35, ww, wh, wh * 0.45)
      ctx.fillStyle = paint[1]
      roundBox(x, top + bh * 0.32, w, bh * 0.68, r)
      ctx.fillStyle = paint[0]
      roundBox(x, top, w, bh * 0.78, r)
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      roundBox(dir > 0 ? x + w * 0.52 : x + w * 0.16, top + bh * 0.12, w * 0.32, bh * 0.34, r * 0.5)
      ctx.fillStyle = '#fef08a'
      roundBox(dir > 0 ? x + w - h * 0.2 : x + h * 0.08, top + bh * 0.44, h * 0.12, h * 0.14, 2)
    }

    const drawTruck = (x, y, w, h, dir, paint) => {
      const top = y + h * 0.12
      const bh = h * 0.7
      const r = Math.max(3, h * 0.14)
      const cabW = w * 0.3
      const cabX = dir > 0 ? x + w - cabW : x
      const boxX = dir > 0 ? x : x + cabW
      ctx.fillStyle = '#111827'
      const wh = h * 0.2
      roundBox(x + w * 0.06, top + bh - wh * 0.35, w * 0.14, wh, wh * 0.45)
      roundBox(x + w * 0.44, top + bh - wh * 0.35, w * 0.14, wh, wh * 0.45)
      roundBox(x + w * 0.8, top + bh - wh * 0.35, w * 0.14, wh, wh * 0.45)
      ctx.fillStyle = '#94a3b8' // trailer
      roundBox(boxX, top + bh * 0.26, w - cabW, bh * 0.72, r)
      ctx.fillStyle = '#e2e8f0'
      roundBox(boxX, top + bh * 0.14, w - cabW, bh * 0.62, r)
      ctx.fillStyle = paint[1] // cab
      roundBox(cabX, top + bh * 0.34, cabW, bh * 0.64, r)
      ctx.fillStyle = paint[0]
      roundBox(cabX, top + bh * 0.02, cabW, bh * 0.8, r)
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      roundBox(dir > 0 ? cabX + cabW * 0.42 : cabX + cabW * 0.18, top + bh * 0.16, cabW * 0.4, bh * 0.3, r * 0.5)
    }

    const drawLog = (x, y, w, h) => {
      const top = y + h * 0.22
      const bh = h * 0.56
      const r = bh * 0.34
      ctx.fillStyle = '#4a2c14'
      roundBox(x, top + bh * 0.3, w, bh * 0.7, r)
      ctx.fillStyle = '#8b5e34'
      roundBox(x, top, w, bh * 0.84, r)
      ctx.fillStyle = '#a97142' // cut end, so it reads as a log and not a plank
      ctx.beginPath()
      ctx.ellipse(x + bh * 0.34, top + bh * 0.42, bh * 0.18, bh * 0.33, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'
      ctx.lineWidth = Math.max(1, h * 0.035)
      for (let i = 1; i < 4; i++) {
        const lx = x + (w * i) / 4
        ctx.beginPath()
        ctx.moveTo(lx, top + bh * 0.18)
        ctx.lineTo(lx + bh * 0.1, top + bh * 0.66)
        ctx.stroke()
      }
    }

    const drawTurtles = (x, y, w, h, dir, t) => {
      const n = Math.max(2, Math.round(w / (h * 0.85)))
      const dw = w / n
      for (let i = 0; i < n; i++) {
        const cx = x + dw * (i + 0.5)
        const cy = y + h * 0.58 + Math.sin(t * 3 + i * 0.9) * h * 0.035
        const rr = Math.min(dw, h) * 0.38
        ctx.fillStyle = '#16a34a'
        ctx.beginPath()
        ctx.arc(cx + dir * rr * 0.95, cy - rr * 0.08, rr * 0.34, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#14532d'
        ctx.beginPath()
        ctx.ellipse(cx, cy + rr * 0.1, rr, rr * 0.74, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.ellipse(cx, cy - rr * 0.06, rr * 0.86, rr * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#166534'
        ctx.beginPath()
        ctx.arc(cx, cy - rr * 0.04, rr * 0.24, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // the game's own icon, pressed into the grass
    const drawFoot = (fx, fy, r, up) => {
      ctx.beginPath()
      ctx.ellipse(fx, fy, r * 0.4, r * 0.6, 0, 0, Math.PI * 2)
      ctx.fill()
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.arc(fx + i * r * 0.3, fy + (up ? -1 : 1) * r * 0.7, r * 0.15, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const draw = () => {
      const s = g.current
      const W = view.w
      const H = view.h
      const R = s.R
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cell = Math.min(W / COLS, H / R)
      const bx = (W - cell * COLS) / 2
      const by = (H - cell * R) / 2
      s.geo = { cell, bx, by }
      const rowY = (r) => by + (R - 1 - r) * cell

      ctx.fillStyle = '#0b1220'
      ctx.fillRect(0, 0, W, H)

      for (let r = 0; r < R; r++) {
        const row = s.rows[r]
        const y = rowY(r)
        // the two end rows bleed into the letterbox so the scene has no seams
        const fy = r === R - 1 ? 0 : y
        const fh = r === R - 1 ? y + cell : r === 0 ? H - y : cell

        if (row.kind === 'road') {
          ctx.fillStyle = '#3f4a5a'
          ctx.fillRect(0, fy, W, fh)
          ctx.fillStyle = 'rgba(0,0,0,0.22)'
          ctx.fillRect(0, y, W, cell * 0.06)
          ctx.fillRect(0, y + cell * 0.94, W, cell * 0.06)
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          const dash = cell * 0.34
          for (let dx = ((s.t * 12) % (dash * 2)) - dash * 2; dx < W; dx += dash * 2) {
            ctx.fillRect(dx, y + cell * 0.48, dash, cell * 0.045)
          }
        } else if (row.kind === 'river') {
          const grad = ctx.createLinearGradient(0, y, 0, y + cell)
          grad.addColorStop(0, '#0284c7')
          grad.addColorStop(1, '#075985')
          ctx.fillStyle = grad
          ctx.fillRect(0, fy, W, fh)
          // shimmer: three slow sine ripples per lane
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'
          ctx.lineWidth = Math.max(1.5, cell * 0.04)
          for (let w = 0; w < 3; w++) {
            const yy = y + cell * (0.25 + w * 0.25)
            ctx.beginPath()
            for (let px = 0; px <= W; px += 14) {
              const v = yy + Math.sin(px / (cell * 0.6) + s.t * (1.5 + w * 0.5) + r) * cell * 0.045
              if (px === 0) ctx.moveTo(px, v)
              else ctx.lineTo(px, v)
            }
            ctx.stroke()
          }
        } else {
          const goal = row.kind === 'goal'
          ctx.fillStyle = goal ? '#15803d' : '#166534'
          ctx.fillRect(0, fy, W, fh)
          ctx.fillStyle = 'rgba(255,255,255,0.1)'
          for (let i = 0; i < COLS + 2; i++) {
            drawFoot(bx + (i - 0.5) * cell, y + cell * (i % 2 ? 0.36 : 0.64), cell * 0.2, i % 2 === 0)
          }
          if (goal) {
            ctx.fillStyle = palRef.current.accent
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(s.t * 4)
            ctx.fillRect(0, y + cell * 0.92, W, cell * 0.08)
            ctx.globalAlpha = 1
          }
        }

        if (row.kind === 'road' || row.kind === 'river') {
          for (let k = 0; k < row.count; k++) {
            const x = bx + bodyX(row, k, s.t) * cell
            const w = row.len * cell
            if (x > W || x + w < 0) continue
            const paint = CAR_PAINT[(row.seed + k) % CAR_PAINT.length]
            if (row.variant === 'car') drawCar(x, y, w, cell, row.dir, paint)
            else if (row.variant === 'truck') drawTruck(x, y, w, cell, row.dir, paint)
            else if (row.variant === 'log') drawLog(x, y, w, cell)
            else drawTurtles(x, y, w, cell, row.dir, s.t)
          }
        }
      }

      // player shadow, so the hop reads as height and not just movement
      if (!s.dead) {
        let cx = s.x + 0.5
        let rf = s.row
        let shrink = 1
        if (s.hop) {
          const p = clamp(s.hop.t / HOP_SEC, 0, 1)
          const e = p * p * (3 - 2 * p)
          cx = s.hop.fromX + (s.hop.toX - s.hop.fromX) * e + 0.5
          rf = s.hop.fromRow + (s.hop.toRow - s.hop.fromRow) * e
          shrink = 1 - 0.35 * Math.sin(p * Math.PI)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(bx + cx * cell, by + (R - 1 - rf) * cell + cell * 0.92, cell * 0.24 * shrink, cell * 0.09 * shrink, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const b of s.bits) {
        ctx.globalAlpha = clamp(b.life / b.max, 0, 1)
        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.textAlign = 'center'
      ctx.font = `900 ${Math.round(cell * 0.36)}px Rubik, system-ui, sans-serif`
      for (const p of s.pops) {
        ctx.globalAlpha = clamp(p.life, 0, 1)
        ctx.fillStyle = '#0f172a'
        ctx.fillText(p.text, p.x + 2, p.y + 2)
        ctx.fillStyle = palRef.current.accent
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1

      /* the doll is a DOM overlay (Runner pattern) — the loop drives its transform */
      const want = Math.round(cell * 1.2)
      if (Math.abs(want - sizeRef.current) > 1) {
        sizeRef.current = want
        setHeroSize(want)
      }
      const hero = heroRef.current
      if (hero) {
        const hh = sizeRef.current
        const hw = hh * 0.625
        let cx = s.x + 0.5
        let rf = s.row
        let lift = 0
        let sx = 1
        let sy = 1
        if (s.hop) {
          const p = clamp(s.hop.t / HOP_SEC, 0, 1)
          const e = p * p * (3 - 2 * p)
          cx = s.hop.fromX + (s.hop.toX - s.hop.fromX) * e + 0.5
          rf = s.hop.fromRow + (s.hop.toRow - s.hop.fromRow) * e
          lift = Math.sin(p * Math.PI) * cell * 0.36
          sy = 1 + 0.22 * Math.sin(p * Math.PI) // stretch up in the air...
          sx = 1 - 0.14 * Math.sin(p * Math.PI)
        } else if (s.squash > 0) {
          sy = 1 - 0.26 * s.squash // ...and pancake on the landing frame
          sx = 1 + 0.26 * s.squash
        }
        let rot = 0
        let op = 1
        if (s.dead) {
          const p = clamp(s.dead.t / 0.5, 0, 1)
          if (s.dead.reason === 'water') {
            sx *= 1 - p * 0.85
            sy *= 1 - p * 0.85
            op = 1 - p * 0.75
          } else {
            rot = -s.face * p * 85
            sy *= 1 - p * 0.3
            op = 1 - p * 0.55
          }
        }
        const px = bx + cx * cell - hw / 2
        const py = by + (R - 1 - rf) * cell + cell - lift - hh
        hero.style.opacity = op
        hero.style.transform = `translate(${px}px, ${py}px) rotate(${rot}deg) scale(${sx}, ${sy})`
      }
    }

    /* ---------- loop ---------- */

    let raf = 0
    let last = 0
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = last ? Math.min(MAX_DT, (now - last) / 1000) : 0
      last = now
      s.t += dt

      if (s.hop) {
        s.hop.t += dt
        if (s.hop.t >= HOP_SEC) land()
      } else if (!s.dead && !s.win) {
        hazards(dt)
      }
      if (s.dead) s.dead.t += dt
      if (s.win) s.win.t += dt
      s.squash = Math.max(0, s.squash - dt / SQUASH_SEC)

      for (const b of s.bits) {
        b.vy += 900 * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.life -= dt
      }
      if (s.bits.length) s.bits = s.bits.filter((b) => b.life > 0)
      for (const p of s.pops) {
        p.y -= 60 * dt
        p.life -= dt * 1.1
      }
      if (s.pops.length) s.pops = s.pops.filter((p) => p.life > 0)

      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      for (const id of timers) clearTimeout(id)
      timers.clear()
      if (g.current) g.current.done = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // report the score once when the run ends
  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart} wrapRef={wrapRef}>
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ touchAction: 'none' }} />

      <div
        ref={heroRef}
        aria-hidden="true"
        className="absolute left-0 top-0 flex items-end justify-center pointer-events-none will-change-transform drop-shadow-lg"
        style={{ width: heroSize * 0.625, height: heroSize, transformOrigin: '50% 96%', transform: 'translate(-9999px, 0)' }}
      >
        <Avatar size={heroSize} />
      </div>

      {!over && hint && (
        <div dir="rtl" className="absolute inset-x-0 top-4 flex justify-center px-4 pointer-events-none">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-lg sm:text-2xl text-center leading-snug px-6 py-3 rounded-3xl border-b-8 border-amber-500 shadow-xl">
            👆 הקש לאן לקפוץ
            <br />
            🚗 היזהר ממכוניות · 🪵 קפוץ על בולי העץ
          </div>
        </div>
      )}

      {!over && banner && (
        <div key={banner.id} dir="rtl" className="absolute inset-x-0 top-[42%] flex justify-center px-4 pointer-events-none">
          <div className="anim-pop bg-white/95 text-slate-800 font-black italic text-3xl sm:text-4xl px-7 py-4 rounded-3xl border-b-8 border-amber-500 shadow-xl">
            {banner.text}
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
