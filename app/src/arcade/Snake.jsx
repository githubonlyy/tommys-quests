import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const GRID = 13 // small board — a kid can see the whole snake at a glance
const START_LEN = 3
const BASE_TICK = 0.2 // seconds per step = 5 steps/sec at the start
const MIN_TICK = 0.1
const SPEED_STEP = 0.015 // shaved off the tick every LEVEL_FRUIT fruit
const LEVEL_FRUIT = 5
const GROW_PER_FRUIT = 2
const SWIPE_PX = 26 // finger travel (CSS px) that counts as one swipe
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const FRUIT_POINTS = 10

const lerp = (a, b, t) => a + (b - a) * t

// rounded-rect path via arcTo — works on every canvas impl, unlike ctx.roundRect
function rrect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

// Snake (נחש) — swipe anywhere (or thumb the D-pad) to steer, eat fruit, grow.
export default function Snake({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#facc15'
  const confetti = theme?.confetti?.length ? theme.confetti : ['#fde047', '#f472b6', '#38bdf8', '#ffffff', '#4ade80']

  const canvasRef = useRef(null)
  const boardRef = useRef(null)
  const g = useRef(null)
  const timersRef = useRef([])
  const [hud, setHud] = useState({ score: 0 })
  const [over, setOver] = useState(null)
  const [hint, setHint] = useState(true)
  const [toast, setToast] = useState(null)
  const reportedRef = useRef(false)

  const flashToast = (text) => {
    setToast(text)
    const id = setTimeout(() => setToast(null), 950)
    timersRef.current.push(id)
  }

  // queue a turn: ignore a 180° flip and repeats of the pending direction,
  // but keep up to two turns so a fast double-swipe (right-then-up) both land
  const pushDir = (dx, dy) => {
    const s = g.current
    if (!s || s.done) return
    // any deliberate input gets him going, even one whose turn is filtered out below —
    // otherwise a first left/right press or swipe would be a silent no-op
    let heard = false
    if (!s.started) {
      s.started = true
      s.acc = 0
      setHint(false)
      heard = true
    }
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir
    const flip = dx === -last.x && dy === -last.y
    const same = dx === last.x && dy === last.y
    if (!flip && !same && s.queue.length < 2) {
      s.queue.push({ x: dx, y: dy })
      heard = true
    }
    if (heard) sfx.click()
  }

  useEffect(() => () => {
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current = []
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const board = boardRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = board.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const mid = Math.floor(GRID / 2)
    const cells = []
    for (let i = 0; i < START_LEN; i++) cells.push({ x: mid - i, y: mid })

    g.current = {
      cells, // head first
      dir: { x: 1, y: 0 },
      queue: [],
      tailPrev: { ...cells[cells.length - 1] },
      fruit: { x: mid + 4, y: mid },
      eaten: 0,
      grow: 0,
      score: 0,
      acc: 0,
      t: 1, // 0..1 progress between the last step and the next one
      stepped: false,
      started: false,
      done: false,
      flash: 0,
      particles: [],
      floaters: [],
    }

    const tickSec = (s) => Math.max(MIN_TICK, BASE_TICK - Math.floor(s.eaten / LEVEL_FRUIT) * SPEED_STEP)

    // board geometry in device px — the square play field centred in the canvas
    const geo = () => {
      const cell = Math.floor(Math.min(canvas.width, canvas.height) / GRID)
      const size = cell * GRID
      return { cell, size, ox: Math.round((canvas.width - size) / 2), oy: Math.round((canvas.height - size) / 2) }
    }
    const cx = (x, gm) => gm.ox + (x + 0.5) * gm.cell
    const cy = (y, gm) => gm.oy + (y + 0.5) * gm.cell

    const spawnFruit = (s) => {
      const taken = new Set(s.cells.map((c) => `${c.x},${c.y}`))
      const free = []
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y })
      }
      if (!free.length) return false
      s.fruit = free[Math.floor(Math.random() * free.length)]
      return true
    }

    const finish = (s, won) => {
      s.done = true
      const isRecord = s.score > highScore
      if (won) {
        s.fruit = null
        if (!isRecord) sfx.ding()
      } else {
        s.flash = 1
        sfx.thud()
      }
      if (isRecord) sfx.fanfare()
      setOver(won ? { score: s.score, isRecord, won: true } : { score: s.score, isRecord })
    }

    const eat = (s) => {
      const gm = geo()
      s.score += FRUIT_POINTS
      s.eaten += 1
      s.grow += GROW_PER_FRUIT
      sfx.pop()
      const fx = cx(s.cells[0].x, gm)
      const fy = cy(s.cells[0].y, gm)
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (90 + Math.random() * 190) * dpr
        s.particles.push({
          x: fx, y: fy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90 * dpr,
          r: (2 + Math.random() * 3) * dpr,
          life: 0.5 + Math.random() * 0.3,
          color: confetti[i % confetti.length],
        })
      }
      s.floaters.push({ x: fx, y: fy - gm.cell * 0.6, life: 0.75 })
      if (s.eaten % LEVEL_FRUIT === 0 && tickSec(s) > MIN_TICK) {
        sfx.ding()
        flashToast('מהר יותר! ⚡')
      }
      if (!spawnFruit(s)) finish(s, true) // whole board covered — he actually won
    }

    const step = (s) => {
      s.stepped = true
      if (s.queue.length) {
        const nd = s.queue.shift()
        if (!(nd.x === -s.dir.x && nd.y === -s.dir.y)) s.dir = nd
      }
      const head = s.cells[0]
      const nx = head.x + s.dir.x
      const ny = head.y + s.dir.y
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return finish(s, false)
      // the tail cell frees up on this same step unless the snake is growing
      const limit = s.grow > 0 ? s.cells.length : s.cells.length - 1
      for (let i = 0; i < limit; i++) {
        if (s.cells[i].x === nx && s.cells[i].y === ny) return finish(s, false)
      }
      s.tailPrev = s.cells[s.cells.length - 1]
      s.cells.unshift({ x: nx, y: ny })
      if (s.grow > 0) s.grow -= 1
      else s.cells.pop()
      if (s.fruit && nx === s.fruit.x && ny === s.fruit.y) eat(s)
    }

    const draw = (now) => {
      const s = g.current
      const W = canvas.width
      const H = canvas.height
      const gm = geo()
      const { cell } = gm

      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#065f46')
      bg.addColorStop(1, '#022c22')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // play field: rounded slab with a checker so movement is readable
      rrect(ctx, gm.ox, gm.oy, gm.size, gm.size, cell * 0.4)
      ctx.fillStyle = '#0b3b2c'
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.fillStyle = '#0e4735'
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(gm.ox + x * cell, gm.oy + y * cell, cell, cell)
        }
      }
      ctx.restore()
      rrect(ctx, gm.ox, gm.oy, gm.size, gm.size, cell * 0.4)
      ctx.lineWidth = 6 * dpr
      ctx.strokeStyle = '#04241b'
      ctx.stroke()

      // fruit: a bouncing apple
      if (s.fruit) {
        const pulse = 1 + Math.sin(now / 160) * 0.1
        const bob = Math.sin(now / 220) * cell * 0.07
        const fx = cx(s.fruit.x, gm)
        const fy = cy(s.fruit.y, gm) + bob
        const r = cell * 0.32 * pulse
        ctx.strokeStyle = '#3f2b1a'
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        ctx.moveTo(fx, fy - r * 0.7)
        ctx.lineTo(fx + r * 0.15, fy - r * 1.5)
        ctx.stroke()
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.ellipse(fx + r * 0.7, fy - r * 1.35, r * 0.5, r * 0.26, -0.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ef4444'
        ctx.strokeStyle = '#7f1d1d'
        ctx.lineWidth = 4 * dpr
        ctx.beginPath()
        ctx.arc(fx, fy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.beginPath()
        ctx.ellipse(fx - r * 0.35, fy - r * 0.35, r * 0.22, r * 0.14, -0.7, 0, Math.PI * 2)
        ctx.fill()
      }

      /* snake: interpolate every segment toward the cell in front of it, so the
         chain glides instead of jumping a whole cell per step */
      const n = s.cells.length
      const pts = []
      for (let i = 0; i < n; i++) {
        const a = s.cells[i]
        const b = s.cells[i + 1] ?? s.tailPrev
        pts.push({ x: lerp(cx(b.x, gm), cx(a.x, gm), s.t), y: lerp(cy(b.y, gm), cy(a.y, gm), s.t) })
      }
      const rHead = cell * 0.42
      const rTail = cell * 0.22
      const radAt = (i) => (n < 2 ? rHead : lerp(rHead, rTail, i / (n - 1)))

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? '#1a2e05' : '#a3e635'
        for (let i = n - 1; i > 0; i--) {
          const w = radAt(i) + radAt(i - 1) // avg diameter of the two ends
          ctx.lineWidth = pass === 0 ? w + 7 * dpr : w
          ctx.beginPath()
          ctx.moveTo(pts[i].x, pts[i].y)
          ctx.lineTo(pts[i - 1].x, pts[i - 1].y)
          ctx.stroke()
        }
        ctx.fillStyle = pass === 0 ? '#1a2e05' : '#bef264'
        ctx.beginPath()
        ctx.arc(pts[0].x, pts[0].y, rHead + (pass === 0 ? 3.5 * dpr : 0), 0, Math.PI * 2)
        ctx.fill()
      }
      // belly scales on every other segment
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      for (let i = 2; i < n; i += 2) {
        ctx.beginPath()
        ctx.arc(pts[i].x, pts[i].y, radAt(i) * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }

      // head faces the way it is actually travelling (uses the drawn points so
      // the eyes swing around mid-turn)
      let hx = s.dir.x
      let hy = s.dir.y
      if (n > 1) {
        const dx = pts[0].x - pts[1].x
        const dy = pts[0].y - pts[1].y
        const len = Math.hypot(dx, dy)
        if (len > 0.001) { hx = dx / len; hy = dy / len }
      }
      const px = -hy
      const py = hx
      for (const sgn of [-1, 1]) {
        const ex = pts[0].x + hx * cell * 0.1 + px * sgn * cell * 0.18
        const ey = pts[0].y + hy * cell * 0.1 + py * sgn * cell * 0.18
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex, ey, cell * 0.14, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(ex + hx * cell * 0.05, ey + hy * cell * 0.05, cell * 0.07, 0, Math.PI * 2)
        ctx.fill()
      }
      // tongue flick once a second-ish
      if (!s.done && now % 1400 < 240) {
        const tx = pts[0].x + hx * rHead
        const ty = pts[0].y + hy * rHead
        ctx.strokeStyle = '#fb7185'
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx + hx * cell * 0.3, ty + hy * cell * 0.3)
        ctx.moveTo(tx + hx * cell * 0.3, ty + hy * cell * 0.3)
        ctx.lineTo(tx + hx * cell * 0.45 + px * cell * 0.14, ty + hy * cell * 0.45 + py * cell * 0.14)
        ctx.moveTo(tx + hx * cell * 0.3, ty + hy * cell * 0.3)
        ctx.lineTo(tx + hx * cell * 0.45 - px * cell * 0.14, ty + hy * cell * 0.45 - py * cell * 0.14)
        ctx.stroke()
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2))
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.textAlign = 'center'
      ctx.font = `900 ${Math.round(cell * 0.5)}px Rubik, sans-serif`
      for (const f of s.floaters) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2))
        ctx.fillStyle = accent
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'
        ctx.lineWidth = 4 * dpr
        ctx.strokeText(`+${FRUIT_POINTS}`, f.x, f.y)
        ctx.fillText(`+${FRUIT_POINTS}`, f.x, f.y)
      }
      ctx.globalAlpha = 1

      if (s.flash > 0) {
        ctx.fillStyle = `rgba(239,68,68,${0.45 * s.flash})`
        ctx.fillRect(0, 0, W, H)
      }
    }

    let raf = 0
    let last = 0
    const loop = (now) => {
      const s = g.current
      if (!s) return
      if (!last) last = now
      const dt = Math.min(MAX_DT, (now - last) / 1000)
      last = now

      if (!s.done && s.started) {
        s.acc += dt
        let tick = tickSec(s)
        while (!s.done && s.acc >= tick) {
          s.acc -= tick
          step(s)
          tick = tickSec(s)
        }
        // before the very first step the body has no "previous" pose to glide
        // out of, so hold it still instead of drawing it a cell behind
        s.t = s.done || !s.stepped ? 1 : Math.min(1, s.acc / tick)
      }

      for (const p of s.particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 900 * dpr * dt
        p.life -= dt
      }
      s.particles = s.particles.filter((p) => p.life > 0)
      for (const f of s.floaters) {
        f.y -= 60 * dpr * dt
        f.life -= dt
      }
      s.floaters = s.floaters.filter((f) => f.life > 0)

      draw(now)
      setHud((h) => (h.score === s.score ? h : { score: s.score }))
      if (!s.done) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    /* swipe steering: every SWIPE_PX of travel commits one direction and resets
       the anchor, so a long curved drag can chain several turns */
    let anchor = null
    const onDown = (e) => {
      e.preventDefault()
      anchor = { x: e.clientX, y: e.clientY, moved: false }
    }
    const onMove = (e) => {
      if (!anchor) return
      e.preventDefault()
      const dx = e.clientX - anchor.x
      const dy = e.clientY - anchor.y
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return
      if (Math.abs(dx) > Math.abs(dy)) pushDir(Math.sign(dx), 0)
      else pushDir(0, Math.sign(dy))
      anchor = { x: e.clientX, y: e.clientY, moved: true }
    }
    const onUp = () => {
      // a plain tap just gets him moving in the direction he is already facing
      if (anchor && !anchor.moved) {
        const s = g.current
        if (s && !s.started && !s.done) {
          s.started = true
          s.acc = 0
          sfx.click()
          setHint(false)
        }
      }
      anchor = null
    }
    canvas.addEventListener('pointerdown', onDown, { passive: false })
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerdown', onDown)
      if (g.current) g.current.done = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const padBtn =
    'w-14 h-14 flex items-center justify-center rounded-2xl bg-lime-400 text-lime-950 border-b-8 border-lime-700 active:border-b-0 active:translate-y-2 transition-all shadow-lg'

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div className="absolute inset-0 flex flex-col bg-emerald-950">
        <div ref={boardRef} className="flex-1 relative touch-none" style={{ touchAction: 'none' }}>
          <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ touchAction: 'none' }} />

          {hint && !over && (
            <div dir="rtl" className="absolute inset-x-0 top-6 flex justify-center px-4 pointer-events-none">
              <div className="anim-pop bg-white/95 text-slate-800 font-black text-xl sm:text-2xl text-center leading-snug px-6 py-3 rounded-3xl border-b-8 border-lime-600 shadow-xl">
                🐍 החלק לאן שבא לך ובוא נאכל תפוחים!
                <br />
                <span className="text-base sm:text-lg">אפשר גם ללחוץ על החצים 👇</span>
              </div>
            </div>
          )}

          {toast && !over && (
            <div dir="rtl" className="absolute inset-x-0 top-6 flex justify-center px-4 pointer-events-none">
              <div className="anim-pop bg-yellow-300 text-slate-900 font-black text-2xl px-6 py-3 rounded-3xl border-b-8 border-yellow-600 shadow-xl">
                {toast}
              </div>
            </div>
          )}
        </div>

        {/* thumb pad — physical arrows, so it stays LTR even inside an RTL app */}
        <div dir="ltr" className="shrink-0 flex flex-col items-center gap-2 py-3 select-none">
          <button type="button" aria-label="למעלה" onPointerDown={() => pushDir(0, -1)} className={padBtn}>
            <ChevronUp size={32} strokeWidth={4} />
          </button>
          <div className="flex gap-2">
            <button type="button" aria-label="שמאלה" onPointerDown={() => pushDir(-1, 0)} className={padBtn}>
              <ChevronLeft size={32} strokeWidth={4} />
            </button>
            <button type="button" aria-label="למטה" onPointerDown={() => pushDir(0, 1)} className={padBtn}>
              <ChevronDown size={32} strokeWidth={4} />
            </button>
            <button type="button" aria-label="ימינה" onPointerDown={() => pushDir(1, 0)} className={padBtn}>
              <ChevronRight size={32} strokeWidth={4} />
            </button>
          </div>
        </div>
      </div>
    </ArcadeShell>
  )
}
