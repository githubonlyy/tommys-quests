import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const BH = 30 // block height in CSS px — one tower row
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const PERFECT_TOL = 9 // px of slop that still counts as a perfect drop
const GROW = 10 // px the block wins back for every perfect drop
const MIN_W = 16 // any thinner and the tower stops being playable — count it as a miss
const GRAVITY = 1600 // px/s^2 for the sliced-off pieces
const FALL_MS = 850 // let him watch the miss tumble before the modal covers it
const EDGE = 10 // px the slider keeps clear of the screen edges
const BASE_GAP = 54 // px between the bottom of the tower and the bottom of the screen
const HOVER = 26 // px the sliding block floats above the tower, so it reads as separate
const STARS = 54

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// rainbow cycle — every row is a new hue, so the tower reads as a colour ladder
const hueFor = (row) => (200 + row * 26) % 360

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), rad)
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h))
}

// chunky block: dark bottom lip + bright face + top highlight (the CSS border-b-8 look)
function drawBlock(ctx, x, y, w, h, hue) {
  ctx.fillStyle = `hsl(${hue} 80% 34%)`
  rr(ctx, x, y, w, h, 8)
  ctx.fill()
  ctx.fillStyle = `hsl(${hue} 88% 58%)`
  rr(ctx, x, y, w, h - 6, 8)
  ctx.fill()
  ctx.fillStyle = `hsl(${hue} 95% 76%)`
  rr(ctx, x + 4, y + 3, w - 8, 5, 3)
  ctx.fill()
}

// Tower Stack — a block slides overhead, tap to drop it. Overhang gets sliced off.
export default function Stack({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const accent = theme?.vars?.['--t-accent'] ?? '#67e8f9'
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0 })
  const [banner, setBanner] = useState(null)
  const [over, setOver] = useState(null)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const s = {
      W: 1,
      H: 1,
      stack: [], // [{ x, w }] bottom-up
      mov: null, // the block currently sliding
      slices: [], // sheared-off pieces falling away
      stars: [],
      cam: 0, // how far the camera has climbed, in px
      score: 0,
      combo: 0,
      maxW: 0,
      flash: 0, // white burst after a perfect drop, decays to 0
      banner: null,
      bannerSeq: 0,
      missAt: 0, // timestamp at which the game-over modal may appear
      done: false,
      overSent: false,
    }
    g.current = s

    // screen y of the top edge of row `row` — rows stack upward from the base
    const rowY = (row) => s.H - BASE_GAP - (row + 1) * BH + s.cam

    // keep the working rows in the lower half of the screen; the camera climbs after that
    const camTarget = () => {
      const keep = Math.max(3, Math.floor((s.H * 0.5) / BH))
      return Math.max(0, (s.stack.length - keep) * BH)
    }

    const spawn = () => {
      const top = s.stack[s.stack.length - 1]
      const w = Math.min(top.w, s.W - 2 * EDGE)
      const fromLeft = s.stack.length % 2 === 1 // alternate sides so it never feels samey
      s.mov = {
        x: fromLeft ? EDGE : s.W - EDGE - w,
        w,
        dir: fromLeft ? 1 : -1,
        speed: Math.min(340, 105 + s.stack.length * 7), // ramps up as the tower grows
      }
    }

    const start = () => {
      const w = clamp(s.W * 0.46, 110, 240)
      s.maxW = w
      s.stack = [{ x: (s.W - w) / 2, w }]
      s.slices = []
      s.stars = Array.from({ length: STARS }, () => ({
        x: Math.random(),
        y: Math.random(),
        par: 0.25 + Math.random() * 0.5, // parallax factor against the camera
        r: 0.6 + Math.random() * 1.6,
      }))
      spawn()
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      s.W = Math.max(1, r.width)
      s.H = Math.max(1, r.height)
      canvas.width = s.W * dpr
      canvas.height = s.H * dpr
      canvas.style.width = `${s.W}px`
      canvas.style.height = `${s.H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS px from here on
      // Every x/w below is absolute CSS px, so a rotation has to reflow the tower too.
      // Without this a block laid out for a wider screen sits past the slider's reach
      // (max m.x + m.w is W - EDGE), the next overlap comes out under MIN_W and the
      // tap is a forced game over with the tower off-screen.
      s.maxW = clamp(s.W * 0.46, 110, 240)
      const refit = (b) => {
        b.w = Math.min(b.w, s.W - 2 * EDGE)
        b.x = clamp(b.x, EDGE, Math.max(EDGE, s.W - EDGE - b.w))
      }
      for (const b of s.stack) refit(b)
      if (s.mov) refit(s.mov)
      if (!s.stack.length) start()
    }
    resize()
    window.addEventListener('resize', resize)

    const makeSlice = (x, y, w, hue, vx) => ({
      x,
      y,
      w,
      hue,
      vx,
      vy: -90, // little upward kick so the piece pops before it drops
      rot: 0,
      spin: (vx > 0 ? 3.4 : -3.4) + (Math.random() - 0.5) * 2,
    })

    const say = (text, now) => {
      s.banner = { id: ++s.bannerSeq, text, until: now + 950 }
    }

    const drop = () => {
      if (s.done || s.missAt || !s.mov) return
      const now = performance.now()
      const m = s.mov
      const top = s.stack[s.stack.length - 1]
      const row = s.stack.length
      const hue = hueFor(row)
      const left = Math.max(m.x, top.x)
      const right = Math.min(m.x + m.w, top.x + top.w)
      const overlap = right - left

      if (overlap < MIN_W) {
        // nothing to land on: the whole block tumbles away and the run ends
        s.slices.push(makeSlice(m.x, rowY(row), m.w, hue, m.dir * 70))
        s.mov = null
        s.combo = 0
        s.missAt = now + FALL_MS
        sfx.thud()
        say('אוי!', now)
        return
      }

      if (Math.abs(m.x - top.x) <= PERFECT_TOL) {
        // perfect: keep the width and win a little of it back, centred on the block below
        const w = Math.min(s.maxW, top.w + GROW)
        s.stack.push({ x: clamp(top.x - (w - top.w) / 2, EDGE, Math.max(EDGE, s.W - EDGE - w)), w })
        s.combo += 1
        s.score += 1 + s.combo // consecutive perfects pay more and more
        s.flash = 1
        sfx.ding()
        if (s.combo >= 3) sfx.coin()
        say(s.combo >= 2 ? `מושלם! ×${s.combo}` : 'מושלם!', now)
      } else {
        s.stack.push({ x: left, w: overlap })
        // the overhang shears off toward whichever side it stuck out
        if (m.x < left) s.slices.push(makeSlice(m.x, rowY(row), left - m.x, hue, -80))
        else s.slices.push(makeSlice(right, rowY(row), m.x + m.w - right, hue, 80))
        s.combo = 0
        s.score += 1
        sfx.thud()
      }
      spawn()
    }

    const onDown = (e) => {
      e.preventDefault()
      drop()
    }
    canvas.addEventListener('pointerdown', onDown)

    const finish = () => {
      if (s.overSent) return
      s.overSent = true
      s.done = true
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      setOver({ score: s.score, isRecord })
    }

    let raf
    let last = performance.now()
    const loop = (now) => {
      if (!g.current || s.done) return
      const dt = Math.min(MAX_DT, (now - last) / 1000)
      last = now
      const { W, H } = s

      /* update */
      s.cam += (camTarget() - s.cam) * Math.min(1, dt * 7)
      s.flash = Math.max(0, s.flash - dt * 3)

      const m = s.mov
      if (m) {
        m.x += m.dir * m.speed * dt
        if (m.x < EDGE) {
          m.x = EDGE
          m.dir = 1
        } else if (m.x + m.w > W - EDGE) {
          m.x = W - EDGE - m.w
          m.dir = -1
        }
      }

      for (const p of s.slices) {
        p.vy += GRAVITY * dt
        p.y += p.vy * dt
        p.x += p.vx * dt
        p.rot += p.spin * dt
      }
      s.slices = s.slices.filter((p) => p.y < H + 140)

      if (s.missAt && now >= s.missAt) {
        finish()
        return
      }

      /* draw */
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#0b1030')
      sky.addColorStop(0.55, '#1e1b4b')
      sky.addColorStop(1, '#312e81')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // stars drift down as the camera climbs — the only cue for how high he is
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (const st of s.stars) {
        const y = (((st.y * H + s.cam * st.par) % H) + H) % H
        ctx.beginPath()
        ctx.arc(st.x * W, y, st.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // ground glow in the theme accent
      const glow = ctx.createLinearGradient(0, H - 200, 0, H)
      glow.addColorStop(0, 'rgba(0,0,0,0)')
      glow.addColorStop(1, accent)
      ctx.globalAlpha = 0.22
      ctx.fillStyle = glow
      ctx.fillRect(0, H - 200, W, 200)
      ctx.globalAlpha = 1

      const top = s.stack[s.stack.length - 1]

      // alignment rails across the hover gap — the aiming aid that makes timing readable
      if (top && s.mov) {
        const ty = rowY(s.stack.length - 1)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 8])
        ctx.beginPath()
        ctx.moveTo(top.x, ty)
        ctx.lineTo(top.x, ty - HOVER)
        ctx.moveTo(top.x + top.w, ty)
        ctx.lineTo(top.x + top.w, ty - HOVER)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // the platform the whole tower stands on
      const baseY = rowY(0) + BH
      if (baseY < H + 40) {
        ctx.fillStyle = '#0f172a'
        rr(ctx, 12, baseY, W - 24, 22, 10)
        ctx.fill()
      }

      for (let i = 0; i < s.stack.length; i++) {
        const y = rowY(i)
        if (y > H + BH || y < -BH) continue // off-camera rows cost nothing to skip
        const b = s.stack[i]
        drawBlock(ctx, b.x, y, b.w, BH, hueFor(i))
      }

      if (s.mov) drawBlock(ctx, s.mov.x, rowY(s.stack.length) - HOVER, s.mov.w, BH, hueFor(s.stack.length))

      for (const p of s.slices) {
        ctx.save()
        ctx.translate(p.x + p.w / 2, p.y + BH / 2)
        ctx.rotate(p.rot)
        drawBlock(ctx, -p.w / 2, -BH / 2, p.w, BH, p.hue)
        ctx.restore()
      }

      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.35})`
        ctx.fillRect(0, 0, W, H)
      }

      /* push to react */
      setHud((h) => (h.score === s.score ? h : { score: s.score }))
      const b = s.banner && now < s.banner.until ? s.banner : null
      setBanner((prev) => (prev?.id === (b?.id ?? null) ? prev : b))

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      s.done = true
      g.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart} wrapRef={wrapRef}>
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ touchAction: 'none' }} />

      {banner && (
        <div key={banner.id} className="absolute inset-x-0 top-[16%] flex justify-center pointer-events-none" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 text-3xl font-black italic rounded-3xl border-b-8 border-yellow-500 shadow-xl px-7 py-3">
            {banner.text}
          </div>
        </div>
      )}

      {hud.score === 0 && !over && (
        <div className="absolute inset-x-0 bottom-[10%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-fade-in bg-black/70 text-white font-black text-xl rounded-2xl px-6 py-4 text-center leading-snug">
            בוא נבנה מגדל! 🧱
            <br />
            לחץ כדי להפיל את הקובייה
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
