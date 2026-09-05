import { useEffect, useRef, useState } from 'react'
import { Flag, Star } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const SIZES = [9, 13, 17] // three mazes, each one bigger than the last
const WALL = 0.3 // wall thickness, measured in corridor widths
const PITCH = 1 + WALL // distance from one corridor to the next
const HALF = 0.3 // player half-size — 0.6 wide inside a 1.0 corridor leaves slack
const SPEED = 11 // corridors per second: fast enough to keep up with a dragging finger
const MAX_DT = 0.034 // clamp the frame delta (tab switches, hiccups)
const LEVEL_PAUSE = 1300 // ms of celebration between mazes
const BASE_POINTS = 100
const STAR_POINTS = 50
const MAX_TIME_BONUS = 150
const STEP_GAP = 60 // ms between footstep clicks
// Tiles are half-open [tileMin, tileMax), so tileIndex() of an exact boundary
// already belongs to the NEXT tile. A collision clamp parks the leading edge
// exactly on a wall boundary, so the perpendicular span has to be measured
// slightly inside the body — otherwise a wall he is merely touching counts as
// one he is standing in, and the next move "resolves" it by flinging him a
// whole corridor away, straight through the wall.
const EPS = 1e-6

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/* ---------- world geometry ----------
 * Everything lives in "corridor units" so a resize only changes the scale.
 * A maze of n cells becomes a grid of 2n+1 tiles: odd indices are corridors
 * (width 1), even indices are walls (width WALL). Tile m therefore starts at a
 * regular pitch and the lookups below stay pure arithmetic — no per-tile table.
 */
const cellCenter = (i) => i * PITCH + WALL + 0.5
const laneCenter = (v, n) => clamp(Math.round((v - WALL - 0.5) / PITCH), 0, n - 1) * PITCH + WALL + 0.5
const tileMin = (m) => (m % 2 === 0 ? (m / 2) * PITCH : ((m - 1) / 2) * PITCH + WALL)
const tileMax = (m) => (m % 2 === 0 ? (m / 2) * PITCH + WALL : ((m - 1) / 2) * PITCH + WALL + 1)
const tileIndex = (v) => {
  const k = Math.floor(v / PITCH)
  return v - k * PITCH < WALL ? k * 2 : k * 2 + 1
}

/**
 * Recursive backtracker (iterative, so a 17x17 can never blow the call stack).
 * It carves until every cell has been seen, which makes a *perfect* maze:
 * exactly one path between any two cells, so it is always solvable and there
 * are no loops to get lost in. Also picks three stars spread along the way,
 * using BFS depth from the start so they are never all bunched together.
 */
function makeLevel(n) {
  const open = new Uint8Array(n * n) // bitmask of carved sides: 1=N 2=E 4=S 8=W
  const seen = new Uint8Array(n * n)
  const stack = [0]
  seen[0] = 1
  while (stack.length) {
    const cur = stack[stack.length - 1]
    const cx = cur % n
    const cy = (cur - cx) / n
    const opts = []
    if (cy > 0 && !seen[cur - n]) opts.push([cur - n, 1, 4])
    if (cx < n - 1 && !seen[cur + 1]) opts.push([cur + 1, 2, 8])
    if (cy < n - 1 && !seen[cur + n]) opts.push([cur + n, 4, 1])
    if (cx > 0 && !seen[cur - 1]) opts.push([cur - 1, 8, 2])
    if (!opts.length) {
      stack.pop()
      continue
    }
    const [nxt, bit, opp] = opts[(Math.random() * opts.length) | 0]
    open[cur] |= bit
    open[nxt] |= opp
    seen[nxt] = 1
    stack.push(nxt)
  }

  // blow the cell graph up into the tile grid the collision code reads
  const TN = n * 2 + 1
  const solid = new Uint8Array(TN * TN).fill(1)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = open[j * n + i]
      solid[(j * 2 + 1) * TN + (i * 2 + 1)] = 0
      if (c & 2) solid[(j * 2 + 1) * TN + (i * 2 + 2)] = 0
      if (c & 4) solid[(j * 2 + 2) * TN + (i * 2 + 1)] = 0
    }
  }

  // how deep each cell sits from the start, for spreading the stars out
  const dist = new Int32Array(n * n).fill(-1)
  const queue = [0]
  dist[0] = 0
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]
    const o = open[c]
    if (o & 1 && dist[c - n] < 0) { dist[c - n] = dist[c] + 1; queue.push(c - n) }
    if (o & 2 && dist[c + 1] < 0) { dist[c + 1] = dist[c] + 1; queue.push(c + 1) }
    if (o & 4 && dist[c + n] < 0) { dist[c + n] = dist[c] + 1; queue.push(c + n) }
    if (o & 8 && dist[c - 1] < 0) { dist[c - 1] = dist[c] + 1; queue.push(c - 1) }
  }
  let maxD = 1
  for (let i = 0; i < n * n; i++) if (dist[i] > maxD) maxD = dist[i]

  const exit = n * n - 1
  const stars = []
  const taken = new Set([0, exit])
  for (const [lo, hi] of [[0.2, 0.45], [0.45, 0.7], [0.7, 1]]) {
    const pool = []
    for (let i = 0; i < n * n; i++) {
      if (taken.has(i)) continue
      const f = dist[i] / maxD
      if (f > lo && f <= hi) pool.push(i)
    }
    if (!pool.length) continue
    const pick = pool[(Math.random() * pool.length) | 0]
    taken.add(pick)
    stars.push({ cell: pick, got: false })
  }
  for (let guard = 0; stars.length < 3 && guard < 200; guard++) {
    const pick = (Math.random() * n * n) | 0
    if (taken.has(pick)) continue
    taken.add(pick)
    stars.push({ cell: pick, got: false })
  }

  return { n, TN, solid, stars, world: n * PITCH + WALL }
}

/**
 * Maze — three hand-drawn-looking mazes in a row. He drags a finger and his
 * hero follows it down the corridors, never through a wall, leaving a glowing
 * trail behind. Collect the stars, reach the flag, and the maze gets bigger.
 * No clock and no way to lose: the run ends when the third maze is solved.
 */
export default function Maze({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const areaRef = useRef(null)
  const g = useRef(null) // all game state — the RAF loop mutates it without re-rendering
  const [hud, setHud] = useState({ score: 0 })
  const [over, setOver] = useState(null) // { score, isRecord, won }
  const [info, setInfo] = useState({ level: 0, stars: 0 })
  const [banner, setBanner] = useState(null)
  const [hint, setHint] = useState(true)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const area = areaRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const vars = theme?.vars ?? {}
    const accent = vars['--t-accent'] ?? '#67e8f9'
    const confetti = theme?.confetti ?? ['#facc15', '#f472b6', '#38bdf8', '#ffffff', '#34d399']
    const hero = theme?.emoji ?? '🐭'

    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t)
        fn()
      }, ms)
      timers.add(t)
    }

    g.current = {
      level: null,
      lvl: 0,
      view: { sc: 1, ox: 0, oy: 0 },
      walls: null,
      px: 0,
      py: 0,
      target: null,
      dragging: false,
      pointerId: null,
      visited: new Set(),
      lastCell: -1,
      lastStep: 0,
      banked: 0,
      starsGot: 0,
      levelStart: 0,
      sparks: [],
      phase: 'play', // play -> clear -> play ... -> done
      clearAt: 0,
      last: performance.now(),
      done: false,
    }

    /* ---------- layout ---------- */
    const buildWalls = () => {
      const s = g.current
      const { sc, ox, oy } = s.view
      const L = s.level
      const cv = document.createElement('canvas')
      cv.width = canvas.width
      cv.height = canvas.height
      const c2 = cv.getContext('2d')
      // one merged path of every solid tile; the 0.8px bleed hides the seams
      const path = () => {
        c2.beginPath()
        for (let ty = 0; ty < L.TN; ty++) {
          for (let tx = 0; tx < L.TN; tx++) {
            if (!L.solid[ty * L.TN + tx]) continue
            c2.rect(
              ox + tileMin(tx) * sc,
              oy + tileMin(ty) * sc,
              (tileMax(tx) - tileMin(tx)) * sc + 0.8,
              (tileMax(ty) - tileMin(ty)) * sc + 0.8,
            )
          }
        }
      }
      c2.save()
      c2.translate(0, 3 * dpr)
      path()
      c2.fillStyle = '#312e81'
      c2.fill()
      c2.restore()
      path()
      c2.fillStyle = '#4f46e5'
      c2.fill()
      s.walls = cv
    }

    const measure = () => {
      const s = g.current
      const r = area.getBoundingClientRect()
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      const pad = 10 * dpr
      const chip = 52 * dpr // headroom for the level chip
      const availW = canvas.width - pad * 2
      const availH = canvas.height - pad * 2 - chip
      const sc = Math.max(4, Math.min(availW, availH) / s.level.world)
      s.view = {
        sc,
        ox: (canvas.width - s.level.world * sc) / 2,
        oy: chip + pad + Math.max(0, (availH - s.level.world * sc) / 2),
      }
      buildWalls()
    }

    const startLevel = (idx) => {
      const s = g.current
      s.lvl = idx
      s.level = makeLevel(SIZES[idx])
      s.px = cellCenter(0)
      s.py = cellCenter(0)
      s.target = null
      s.dragging = false
      s.pointerId = null
      s.visited = new Set()
      s.lastCell = -1
      s.starsGot = 0
      s.sparks = []
      s.phase = 'play'
      s.levelStart = performance.now()
      measure()
      setInfo({ level: idx, stars: 0 })
      setBanner(null)
    }

    const onResize = () => {
      if (g.current?.level) measure()
    }
    window.addEventListener('resize', onResize)

    /* ---------- collision: axis-separated box vs. tile grid ---------- */
    const tileSolid = (tx, ty) => {
      const L = g.current.level
      if (tx < 0 || ty < 0 || tx >= L.TN || ty >= L.TN) return true
      return L.solid[ty * L.TN + tx] === 1
    }

    // Each call moves less than one wall thickness, so only the leading edge's
    // row/column can be newly entered — one strip of tiles is enough to test.
    const moveX = (dx) => {
      const s = g.current
      s.px += dx
      // perpendicular span, shrunk by EPS so a merely-touched wall row is out
      const t0 = tileIndex(s.py - HALF + EPS)
      const t1 = tileIndex(s.py + HALF - EPS)
      if (dx > 0) {
        const m = tileIndex(s.px + HALF)
        for (let ty = t0; ty <= t1; ty++) {
          if (tileSolid(m, ty)) {
            s.px = tileMin(m) - HALF
            return true
          }
        }
      } else if (dx < 0) {
        const m = tileIndex(s.px - HALF)
        for (let ty = t0; ty <= t1; ty++) {
          if (tileSolid(m, ty)) {
            s.px = tileMax(m) + HALF
            return true
          }
        }
      }
      return false
    }

    const moveY = (dy) => {
      const s = g.current
      s.py += dy
      // perpendicular span, shrunk by EPS so a merely-touched wall column is out
      const t0 = tileIndex(s.px - HALF + EPS)
      const t1 = tileIndex(s.px + HALF - EPS)
      if (dy > 0) {
        const m = tileIndex(s.py + HALF)
        for (let tx = t0; tx <= t1; tx++) {
          if (tileSolid(tx, m)) {
            s.py = tileMin(m) - HALF
            return true
          }
        }
      } else if (dy < 0) {
        const m = tileIndex(s.py - HALF)
        for (let tx = t0; tx <= t1; tx++) {
          if (tileSolid(tx, m)) {
            s.py = tileMax(m) + HALF
            return true
          }
        }
      }
      return false
    }

    const stepPlayer = (dt) => {
      const s = g.current
      if (!s.dragging || !s.target) return
      const dx = s.target.x - s.px
      const dy = s.target.y - s.py
      const d = Math.hypot(dx, dy)
      if (d < 0.015) return
      const ux = dx / d
      const uy = dy / d
      const move = Math.min(d, SPEED * dt)
      // substep so a fast flick can never hop over a wall
      const steps = Math.min(24, Math.max(1, Math.ceil(move / (WALL * 0.45))))
      const len = move / steps
      let blockedX = false
      let blockedY = false
      for (let k = 0; k < steps; k++) {
        if (moveX(ux * len)) blockedX = true
        if (moveY(uy * len)) blockedY = true
      }
      // Corner assist: a wall stopped him, so ease him onto the middle of the
      // corridor. Without this an 8-year-old's diagonal drag keeps snagging on
      // doorway corners. It still goes through the collision test, so the
      // nudge can never push him into a wall.
      const a = Math.min(SPEED * dt * 0.7, WALL * 0.4)
      const n = s.level.n
      if (blockedX && Math.abs(ux) >= Math.abs(uy)) moveY(clamp(laneCenter(s.py, n) - s.py, -a, a))
      else if (blockedY && Math.abs(uy) > Math.abs(ux)) moveX(clamp(laneCenter(s.px, n) - s.px, -a, a))
    }

    /* ---------- pickups & progress ---------- */
    const burst = (x, y, count) => {
      const s = g.current
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2
        const sp = 1.2 + Math.random() * 2.6
        s.sparks.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 1,
          age: 0,
          life: 0.7 + Math.random() * 0.5,
          r: 0.05 + Math.random() * 0.07,
          c: confetti[i % confetti.length],
        })
      }
    }

    const trackTiles = (now) => {
      const s = g.current
      const L = s.level
      const tx = tileIndex(s.px)
      const ty = tileIndex(s.py)
      s.visited.add(ty * L.TN + tx)
      if (tx % 2 === 1 && ty % 2 === 1) {
        const cell = ((ty - 1) / 2) * L.n + (tx - 1) / 2
        if (cell !== s.lastCell) {
          s.lastCell = cell
          if (now - s.lastStep > STEP_GAP) {
            s.lastStep = now
            sfx.flip() // footstep
          }
        }
      }
    }

    const checkPickups = (now) => {
      const s = g.current
      const L = s.level
      for (const st of L.stars) {
        if (st.got) continue
        const i = st.cell % L.n
        const j = (st.cell - i) / L.n
        if (Math.abs(s.px - cellCenter(i)) < 0.45 && Math.abs(s.py - cellCenter(j)) < 0.45) {
          st.got = true
          s.starsGot += 1
          sfx.coin()
          burst(cellCenter(i), cellCenter(j), 14)
          setInfo({ level: s.lvl, stars: s.starsGot })
        }
      }
      const goal = cellCenter(L.n - 1)
      if (Math.abs(s.px - goal) < 0.4 && Math.abs(s.py - goal) < 0.4) finishLevel(now)
    }

    const finishLevel = (now) => {
      const s = g.current
      const secs = (now - s.levelStart) / 1000
      const par = s.level.n * 6 // a fair pace for this size, in seconds
      const bonus = clamp(Math.round((par - secs) * 4), 0, MAX_TIME_BONUS)
      s.banked += BASE_POINTS + s.starsGot * STAR_POINTS + bonus
      s.starsGot = 0 // already banked — the chip keeps showing them until the next maze
      s.dragging = false
      s.target = null
      burst(cellCenter(s.level.n - 1), cellCenter(s.level.n - 1), 22)
      setHud({ score: s.banked })

      if (s.lvl >= SIZES.length - 1) {
        s.phase = 'done'
        s.done = true
        // solving the third maze IS the win — always worth a fanfare
        sfx.fanfare()
        const score = s.banked
        const isRecord = score > highScore
        setOver({ score, isRecord, won: true })
        return
      }
      s.phase = 'clear'
      s.clearAt = now + LEVEL_PAUSE
      sfx.ding()
      setHint(false)
      setBanner(`יצאת! מבוך ${s.lvl + 2}`)
    }

    /* ---------- input: his finger is the target, the hero walks to it ---------- */
    const toWorld = (e) => {
      const s = g.current
      const r = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - r.left) * dpr - s.view.ox) / s.view.sc,
        y: ((e.clientY - r.top) * dpr - s.view.oy) / s.view.sc,
      }
    }

    const onDown = (e) => {
      const s = g.current
      if (!s || s.done || s.phase !== 'play') return
      s.dragging = true
      s.pointerId = e.pointerId
      s.target = toWorld(e)
      setHint(false)
      sfx.click()
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      e.preventDefault()
    }
    const onMove = (e) => {
      const s = g.current
      if (!s || !s.dragging || e.pointerId !== s.pointerId) return
      s.target = toWorld(e)
      e.preventDefault()
    }
    const onUp = (e) => {
      const s = g.current
      if (!s || e.pointerId !== s.pointerId) return
      s.dragging = false
      s.target = null
      s.pointerId = null
    }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    /* ---------- drawing ---------- */
    const draw = (now) => {
      const s = g.current
      const L = s.level
      const { sc, ox, oy } = s.view
      const W = canvas.width
      const H = canvas.height

      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#1e293b')
      bg.addColorStop(1, '#0f172a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // the paper the maze is printed on
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(ox, oy, L.world * sc, L.world * sc)

      // faint trail of every tile he has already walked
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.fillStyle = accent
      for (const key of s.visited) {
        const tx = key % L.TN
        const ty = (key - tx) / L.TN
        ctx.fillRect(
          ox + tileMin(tx) * sc,
          oy + tileMin(ty) * sc,
          (tileMax(tx) - tileMin(tx)) * sc + 0.7,
          (tileMax(ty) - tileMin(ty)) * sc + 0.7,
        )
      }
      ctx.restore()

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // start pad
      ctx.fillStyle = 'rgba(100,116,139,0.22)'
      ctx.beginPath()
      ctx.arc(ox + cellCenter(0) * sc, oy + cellCenter(0) * sc, sc * 0.42, 0, Math.PI * 2)
      ctx.fill()

      // exit flag, breathing so it pulls the eye
      const gx = ox + cellCenter(L.n - 1) * sc
      const gy = oy + cellCenter(L.n - 1) * sc
      ctx.fillStyle = '#22c55e'
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.arc(gx, gy, sc * (0.5 + Math.sin(now / 260) * 0.06), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.font = `${sc * 0.66}px system-ui, sans-serif`
      ctx.fillText('🏁', gx, gy)

      // stars
      ctx.font = `${sc * 0.6}px system-ui, sans-serif`
      for (const st of L.stars) {
        if (st.got) continue
        const i = st.cell % L.n
        const j = (st.cell - i) / L.n
        ctx.fillText(
          '⭐',
          ox + cellCenter(i) * sc,
          oy + cellCenter(j) * sc + Math.sin(now / 300 + st.cell) * sc * 0.07,
        )
      }

      ctx.drawImage(s.walls, 0, 0)

      for (const sp of s.sparks) {
        ctx.globalAlpha = Math.max(0, 1 - sp.age / sp.life)
        ctx.fillStyle = sp.c
        ctx.beginPath()
        ctx.arc(ox + sp.x * sc, oy + sp.y * sc, sp.r * sc, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // the hero
      const hx = ox + s.px * sc
      const hy = oy + s.py * sc
      const idle = !s.dragging && s.phase === 'play'
      ctx.globalAlpha = idle ? 0.45 + Math.sin(now / 200) * 0.2 : 0.35
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(hx, hy, sc * (idle ? 0.5 + Math.sin(now / 200) * 0.06 : 0.46), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(2, 3 * dpr)
      ctx.beginPath()
      ctx.arc(hx, hy, sc * HALF, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `${sc * 0.4}px system-ui, sans-serif`
      ctx.fillText(hero, hx, hy)
    }

    /* ---------- loop ---------- */
    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now

      if (s.phase === 'play') {
        stepPlayer(dt)
        trackTiles(now)
        checkPickups(now)
      } else if (s.phase === 'clear' && now >= s.clearAt) {
        startLevel(s.lvl + 1)
      }
      if (s.done) return // finishLevel may have ended the run this frame

      for (const sp of s.sparks) {
        sp.age += dt
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
        sp.vy += 7 * dt
      }
      s.sparks = s.sparks.filter((sp) => sp.age < sp.life)

      draw(now)
      const live = s.banked + s.starsGot * STAR_POINTS
      setHud((h) => (h.score === live ? h : { score: live }))
      raf = requestAnimationFrame(loop)
    }

    startLevel(0)
    raf = requestAnimationFrame(loop)
    later(() => setHint(false), 7000)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      for (const t of timers) clearTimeout(t)
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
      <div ref={areaRef} className="absolute inset-0 overflow-hidden select-none touch-none" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} className="absolute inset-0" />

        <div dir="rtl" className="absolute inset-x-0 top-2 flex justify-center pointer-events-none px-3">
          <div className="flex items-center gap-4 bg-black/50 rounded-full px-5 py-2 border-b-4 border-black/40">
            <span className="flex items-center gap-2 text-white font-black italic text-lg">
              <Flag size={18} className="text-green-400" strokeWidth={3} />
              מבוך {info.level + 1}/3
            </span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <Star
                  key={i}
                  size={22}
                  strokeWidth={3}
                  className={i < info.stars ? 'text-yellow-400 fill-yellow-400' : 'text-white/25'}
                />
              ))}
            </span>
          </div>
        </div>

        {banner && (
          <div dir="rtl" className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
            <div className="anim-pop bg-white/95 text-slate-800 font-black text-4xl rounded-3xl border-b-8 border-indigo-700 shadow-xl px-8 py-5 text-center">
              {banner}
            </div>
          </div>
        )}

        {hint && !banner && (
          <div dir="rtl" className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none px-4">
            <div className="anim-fade-in bg-black/65 text-white font-black text-xl rounded-2xl px-5 py-3 text-center leading-snug">
              גרור את האצבע דרך המבוך
              <br />
              אסוף כוכבים ⭐ והגע לדגל 🏁
            </div>
          </div>
        )}
      </div>
    </ArcadeShell>
  )
}
