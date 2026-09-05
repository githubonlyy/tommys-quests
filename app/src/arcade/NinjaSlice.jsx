import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

const START_LIVES = 3
const MAX_DT = 0.05 // clamp frame delta (tab switches, hiccups)
const GRAV = 620 // css px/s² — gentle arcs, ~2s of hang time per throw
const TRAIL_MS = 260 // how long a swipe trail segment stays visible
const COMBO_GAP = 450 // ms without a cut and the combo chain restarts
const LABEL_MS = 850
const GROUND = 26 // rooftop band the ninja stands on (css px)
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
// used only if a theme is missing its skin (the game must never crash on a key)
const FALLBACK_PARTICLES = ['⭐', '🍉', '🍎', '🍋', '🍇']
const FALLBACK_CONFETTI = ['#facc15', '#f472b6', '#38bdf8', '#34d399', '#ffffff']

// distance from point (px,py) to segment (ax,ay)-(bx,by)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * Ninja Slice — his doll stands on the rooftop as the ninja while the theme's
 * particles are tossed up from below in arcs. Drag a finger (or the mouse)
 * across them to cut: the swipe leaves a fading blade trail, several cuts in one
 * swipe chain into a combo bonus, and slicing a bomb costs one of three hearts.
 * No timer — the round ends on the third bomb.
 *
 * All motion lives in a ref that the RAF loop mutates; React state only changes
 * for the HUD, the intro banner and game over.
 */
export default function NinjaSlice({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const ninjaRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, maxLives: START_LIVES })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [ninjaH, setNinjaH] = useState(140) // doll height in css px, follows the play area
  const [intro, setIntro] = useState(true)
  const reportedRef = useRef(false)

  const particles = theme?.particles?.length ? theme.particles : FALLBACK_PARTICLES
  const confetti = theme?.confetti?.length ? theme.confetti : FALLBACK_CONFETTI
  const accent = theme?.vars?.['--t-accent'] ?? '#67e8f9'
  const accentDeep = theme?.vars?.['--t-accent-deep'] ?? '#0891b2'
  const bgFrom = theme?.vars?.['--t-bg-from'] ?? '#3b3bd6'
  const bgTo = theme?.vars?.['--t-bg-to'] ?? '#140b4d'

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

    g.current = {
      objects: [],
      halves: [],
      puffs: [],
      labels: [],
      trail: [], // { x, y, t }
      score: 0,
      lives: START_LIVES,
      combo: 0,
      lastSliceTs: -9999,
      startTs: performance.now(),
      last: performance.now(),
      nextWave: performance.now() + 900,
      flash: -9999,
      pop: 0, // doll squash-and-stretch after a cut
      lean: 0,
      blade: -0.6, // katana angle (rad), eases toward the finger
      pointerId: null,
      px: 0,
      py: 0,
      nextId: 1,
      ninja: { h: 140, w: 88, left: 8, bottom: GROUND - 6 },
      cssH: 0,
      done: false,
    }

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      const h = Math.round(Math.max(96, Math.min(180, r.height * 0.3)))
      g.current.ninja = { h, w: h * 0.625, left: 8, bottom: GROUND - 6 }
      g.current.cssH = r.height
      setNinjaH(h)
    }
    resize()
    window.addEventListener('resize', resize)

    /* ---------- spawning ---------- */
    const spawn = (now, elapsed) => {
      const s = g.current
      const W = canvas.width
      const H = canvas.height
      const bombChance = Math.min(0.26, 0.08 + elapsed / 450)
      let n = 1
      if (Math.random() < Math.min(0.55, elapsed / 55)) n += 1
      if (Math.random() < Math.min(0.3, elapsed / 120)) n += 1
      // keep the throws clear of the rooftop the ninja is standing on
      const minX = Math.min(W * 0.45, (s.ninja.left + s.ninja.w + 26) * dpr)
      const maxX = W * 0.92
      const used = []
      for (let i = 0; i < n; i++) {
        let x = 0
        for (let tries = 0; tries < 6; tries++) {
          x = minX + Math.random() * Math.max(1, maxX - minX)
          if (used.every((u) => Math.abs(u - x) > W * 0.13)) break
        }
        used.push(x)
        const isBomb = Math.random() < bombChance
        const isGold = !isBomb && Math.random() < 0.1
        const grav = GRAV * dpr
        const rise = (isBomb ? 0.42 + Math.random() * 0.16 : 0.5 + Math.random() * 0.28) * H
        const vy = -Math.sqrt(2 * grav * rise)
        const flight = (2 * Math.abs(vy)) / grav
        const drift = ((W * (0.32 + Math.random() * 0.4) - x) / flight) * 0.6
        s.objects.push({
          id: s.nextId++,
          kind: isBomb ? 'bomb' : isGold ? 'gold' : 'good',
          ch: particles[Math.floor(Math.random() * particles.length)],
          x,
          y: H + 30 * dpr,
          vx: Math.max(-W * 0.22, Math.min(W * 0.22, drift)),
          vy,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 2.4,
          r: (isBomb ? 24 : 26) * dpr,
          dead: false,
        })
      }
      s.nextWave = now + Math.max(760, 1500 - elapsed * 8) + Math.random() * 260
    }

    /* ---------- cutting ---------- */
    const burst = (o, colors, count) => {
      const s = g.current
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (60 + Math.random() * 220) * dpr
        s.puffs.push({
          x: o.x,
          y: o.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60 * dpr,
          r: (2.5 + Math.random() * 4) * dpr,
          color: colors[Math.floor(Math.random() * colors.length)],
          t0: performance.now(),
        })
      }
    }

    const cut = (o, now) => {
      const s = g.current
      o.dead = true
      if (o.kind === 'bomb') {
        s.lives -= 1
        s.flash = now
        s.combo = 0
        burst(o, ['#f97316', '#ef4444', '#fde68a', '#7f1d1d'], 18)
        sfx.thud()
        const el = ninjaRef.current
        if (el) {
          el.classList.add('anim-shake')
          later(() => el.classList.remove('anim-shake'), 450)
        }
        return
      }
      // chain cuts inside one swipe into a combo
      if (now - s.lastSliceTs > COMBO_GAP) s.combo = 0
      s.lastSliceTs = now
      s.combo += 1
      s.pop = 1
      const base = o.kind === 'gold' ? 30 : 10
      const bonus = s.combo >= 2 ? 10 * (s.combo - 1) : 0
      s.score += base + bonus
      s.labels.push({
        x: o.x,
        y: o.y,
        t0: now,
        main: bonus ? 'קומבו!' : null,
        sub: `+${base + bonus}`,
        color: bonus ? '#fde047' : o.kind === 'gold' ? '#fbbf24' : '#ffffff',
      })
      // the two halves fly apart along the blade
      for (const side of [-1, 1]) {
        s.halves.push({
          ch: o.ch,
          x: o.x,
          y: o.y,
          vx: o.vx + side * (90 + Math.random() * 70) * dpr,
          vy: o.vy * 0.45 - 40 * dpr,
          rot: o.rot,
          vr: side * (1.6 + Math.random()),
          side,
          size: o.r,
          t0: now,
        })
      }
      burst(o, confetti, o.kind === 'gold' ? 16 : 10)
      if (bonus) sfx.ding()
      else if (o.kind === 'gold') sfx.coin()
      else sfx.pop()
    }

    const slice = (ax, ay, bx, by, now) => {
      const s = g.current
      for (const o of s.objects) {
        if (o.dead) continue
        if (segDist(o.x, o.y, ax, ay, bx, by) <= o.r + 8 * dpr) cut(o, now)
        if (s.lives <= 0) return
      }
    }

    /* ---------- pointer (touch + mouse, one finger at a time) ---------- */
    const at = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }
    }
    const onDown = (e) => {
      const s = g.current
      if (!s || s.done || s.pointerId !== null) return
      s.pointerId = e.pointerId
      const p = at(e)
      s.px = p.x
      s.py = p.y
      s.combo = 0
      s.trail = [{ x: p.x, y: p.y, t: performance.now() }]
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch { /* capture is a nicety, not required */ }
    }
    const onMove = (e) => {
      const s = g.current
      if (!s || s.done || s.pointerId !== e.pointerId) return
      const now = performance.now()
      const p = at(e)
      s.trail.push({ x: p.x, y: p.y, t: now })
      slice(s.px, s.py, p.x, p.y, now)
      s.px = p.x
      s.py = p.y
    }
    const onUp = (e) => {
      const s = g.current
      if (!s || s.pointerId !== e.pointerId) return
      s.pointerId = null
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch { /* already released */ }
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    later(() => setIntro(false), 2600)

    /* ---------- loop ---------- */
    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const W = canvas.width
      const H = canvas.height
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now
      const elapsed = (now - s.startTs) / 1000
      const grav = GRAV * dpr
      const groundY = H - GROUND * dpr

      if (now >= s.nextWave) spawn(now, elapsed)

      // move everything
      for (const o of s.objects) {
        o.vy += grav * dt
        o.x += o.vx * dt
        o.y += o.vy * dt
        o.rot += o.vr * dt
      }
      s.objects = s.objects.filter((o) => !o.dead && o.y < H + 80 * dpr)
      for (const h of s.halves) {
        h.vy += grav * dt
        h.x += h.vx * dt
        h.y += h.vy * dt
        h.rot += h.vr * dt
      }
      s.halves = s.halves.filter((h) => now - h.t0 < 1400 && h.y < H + 80 * dpr)
      for (const p of s.puffs) {
        p.vy += grav * 0.7 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
      s.puffs = s.puffs.filter((p) => now - p.t0 < 700)
      s.labels = s.labels.filter((l) => now - l.t0 < LABEL_MS)
      s.trail = s.trail.filter((p) => now - p.t < TRAIL_MS)

      /* ---- draw ---- */
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, bgTo)
      sky.addColorStop(1, bgFrom)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // moon + bamboo silhouettes
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.beginPath()
      ctx.arc(W * 0.78, H * 0.2, 46 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      for (let i = 0; i < 5; i++) {
        const bx = W * (0.08 + i * 0.21)
        ctx.fillRect(bx, H * 0.32, 12 * dpr, H)
      }

      // targets
      for (const o of s.objects) {
        ctx.save()
        ctx.translate(o.x, o.y)
        if (o.kind === 'bomb') {
          const pulse = 1 + Math.sin(now / 110) * 0.08
          ctx.strokeStyle = 'rgba(239,68,68,0.75)'
          ctx.lineWidth = 3 * dpr
          ctx.beginPath()
          ctx.arc(0, 0, o.r * 1.35 * pulse, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = '#111827'
          ctx.beginPath()
          ctx.arc(0, 0, o.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.beginPath()
          ctx.arc(-o.r * 0.32, -o.r * 0.34, o.r * 0.22, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 4 * dpr
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(o.r * 0.45, -o.r * 0.8)
          ctx.lineTo(o.r * 0.95, -o.r * 1.45)
          ctx.stroke()
          ctx.fillStyle = Math.sin(now / 60) > 0 ? '#fde047' : '#f97316'
          ctx.beginPath()
          ctx.arc(o.r * 1.05, -o.r * 1.6, 5 * dpr, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.rotate(o.rot)
          if (o.kind === 'gold') {
            ctx.strokeStyle = '#fbbf24'
            ctx.lineWidth = 4 * dpr
            ctx.beginPath()
            ctx.arc(0, 0, o.r * 1.25, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.font = `${o.r * 1.9}px ${EMOJI_FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(o.ch, 0, 0)
        }
        ctx.restore()
      }

      // sliced halves
      for (const h of s.halves) {
        const age = (now - h.t0) / 1400
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - age)
        ctx.translate(h.x, h.y)
        ctx.rotate(h.rot)
        ctx.beginPath()
        ctx.rect(h.side < 0 ? -h.size * 1.2 : 0, -h.size * 1.2, h.size * 1.2, h.size * 2.4)
        ctx.clip()
        ctx.font = `${h.size * 1.9}px ${EMOJI_FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(h.ch, 0, 0)
        ctx.restore()
      }

      // juice splash
      for (const p of s.puffs) {
        ctx.globalAlpha = Math.max(0, 1 - (now - p.t0) / 700)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // rooftop the ninja stands on — throws rise from behind it
      ctx.fillStyle = 'rgba(0,0,0,0.42)'
      ctx.fillRect(0, groundY, W, H - groundY)
      ctx.fillStyle = accentDeep
      ctx.fillRect(0, groundY, W, 4 * dpr)

      // katana: anchored at his hand, swings toward the finger
      const ax = (s.ninja.left + s.ninja.w * 0.82) * dpr
      const ay = (s.cssH - s.ninja.bottom - s.ninja.h * 0.5) * dpr
      let want = -0.6
      if (s.pointerId !== null) {
        want = Math.max(-2.2, Math.min(0.9, Math.atan2(s.py - ay, s.px - ax)))
        s.lean = Math.max(-9, Math.min(9, ((s.px - ax) / W) * 16))
      } else {
        s.lean += (0 - s.lean) * Math.min(1, dt * 6)
      }
      s.blade += (want - s.blade) * Math.min(1, dt * 14)
      const bl = s.ninja.h * 0.8 * dpr
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(s.blade)
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 8 * dpr
      ctx.beginPath()
      ctx.moveTo(-14 * dpr, 0)
      ctx.lineTo(6 * dpr, 0)
      ctx.stroke()
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 6 * dpr
      ctx.beginPath()
      ctx.moveTo(6 * dpr, 0)
      ctx.lineTo(bl, -bl * 0.12)
      ctx.stroke()
      ctx.restore()

      // swipe trail — a tapering, fading blade streak
      for (let i = 1; i < s.trail.length; i++) {
        const a = s.trail[i - 1]
        const b = s.trail[i]
        const k = 1 - (now - b.t) / TRAIL_MS
        if (k <= 0) continue
        ctx.strokeStyle = accent
        ctx.globalAlpha = k * 0.55
        ctx.lineWidth = 16 * dpr * k
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.globalAlpha = k
        ctx.lineWidth = 6 * dpr * k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // floating score / combo labels
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.direction = 'rtl'
      for (const l of s.labels) {
        const k = (now - l.t0) / LABEL_MS
        ctx.globalAlpha = Math.max(0, 1 - k)
        ctx.fillStyle = l.color
        ctx.strokeStyle = 'rgba(15,23,42,0.85)'
        ctx.lineWidth = 5 * dpr
        const y = l.y - k * 46 * dpr
        if (l.main) {
          ctx.font = `900 ${26 * dpr}px system-ui, sans-serif`
          ctx.strokeText(l.main, l.x, y - 22 * dpr)
          ctx.fillText(l.main, l.x, y - 22 * dpr)
        }
        ctx.font = `900 ${24 * dpr}px system-ui, sans-serif`
        ctx.strokeText(l.sub, l.x, y)
        ctx.fillText(l.sub, l.x, y)
      }
      ctx.direction = 'ltr'
      ctx.globalAlpha = 1

      // bomb flash
      if (now - s.flash < 260) {
        ctx.fillStyle = `rgba(239,68,68,${0.32 * (1 - (now - s.flash) / 260)})`
        ctx.fillRect(0, 0, W, H)
      }

      // the doll reacts: bob, lean into the swipe, pop on every cut
      s.pop *= Math.exp(-dt * 6)
      const el = ninjaRef.current
      if (el) {
        const bob = Math.sin(now / 420) * 3
        el.style.transform = `translate3d(0, ${bob - s.pop * 8}px, 0) rotate(${s.lean}deg) scale(${1 + s.pop * 0.12})`
      }

      setHud((h) => (h.score === s.score && h.lives === s.lives ? h : { score: s.score, lives: s.lives, maxLives: START_LIVES }))

      if (s.lives <= 0) {
        s.done = true
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        setOver({ score: s.score, isRecord })
        return
      }
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
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* THE NINJA — SVG doll layered over the canvas, physical left edge */}
      <div
        ref={ninjaRef}
        aria-label="הנינג׳ה של טומי"
        className="absolute pointer-events-none will-change-transform drop-shadow-lg"
        style={{ left: 8, bottom: GROUND - 6, height: ninjaH, transformOrigin: 'bottom center' }}
      >
        <Avatar size={ninjaH} />
      </div>

      {/* start hint */}
      {intro && (
        <div className="absolute inset-x-0 top-[18%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-2xl text-center px-6 py-3 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl">
            🥷 החליקו את האצבע וחתכו!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
