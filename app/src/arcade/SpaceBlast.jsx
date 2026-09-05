import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const START_LIVES = 3
const SHOT_MS = 190 // auto-fire cadence — there is no fire button to hunt for
const BULLET_SPEED = 700 // css px/s (scaled by dpr where it is used)
const SHIP_R = 20 // css px
const FINGER_LIFT = 46 // ship rides above the fingertip so his hand never hides it
const INV_SEC = 1.2 // mercy window after a hit

// Space Blast — his ship tails his finger across the lower half and fires by
// itself; meteors and saucers fall, every third wave brings a splitting rock.
export default function SpaceBlast({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, maxLives: START_LIVES })
  const [over, setOver] = useState(null)
  const [started, setStarted] = useState(false)
  const [waveNo, setWaveNo] = useState(0)
  const [bannerOn, setBannerOn] = useState(false)
  const reportedRef = useRef(false)

  const { theme } = useTheme()
  const accentRef = useRef('#67e8f9')
  accentRef.current = theme?.vars?.['--t-accent'] ?? '#67e8f9'

  // wave banner hides itself; the timeout dies with the effect
  useEffect(() => {
    if (!waveNo) return undefined
    setBannerOn(true)
    const t = setTimeout(() => setBannerOn(false), 1100)
    return () => clearTimeout(t)
  }, [waveNo])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const W0 = canvas.width
    const H0 = canvas.height

    const stars = []
    for (let i = 0; i < 90; i++) {
      stars.push({ x: Math.random() * W0, y: Math.random() * H0, z: Math.random() }) // z = parallax depth
    }

    const s = {
      ship: { x: W0 / 2, y: H0 * 0.82, tx: W0 / 2, ty: H0 * 0.82 },
      bullets: [],
      enemies: [],
      toSpawn: [],
      parts: [],
      score: 0,
      lives: START_LIVES,
      wave: 0,
      gap: 800,
      nextSpawn: 0,
      waveAt: 0,
      lastShot: 0,
      shake: 0,
      hurt: 0,
      inv: 0,
      started: false,
      done: false,
    }
    g.current = s

    /* ---------- enemies ---------- */

    const lumpyShape = () => Array.from({ length: 9 }, () => 0.78 + Math.random() * 0.38)

    const makeEnemy = (type) => {
      const W = canvas.width
      // fall speed ramps with the wave but stops climbing so it stays beatable
      const ramp = Math.min(115, s.wave * 7)
      const base = { type, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 1.6, flash: 0, seed: Math.random() * 9 }
      if (type === 'alien') {
        const r = 18 * dpr
        return { ...base, r, hp: 1, pts: 15, sway: (28 + Math.random() * 34) * dpr, x: r + Math.random() * (W - r * 2), y: -r, vy: (52 + ramp + Math.random() * 20) * dpr, shape: null }
      }
      if (type === 'rock') {
        const r = 44 * dpr
        return { ...base, r, hp: 4, pts: 45, sway: 0, x: r + Math.random() * (W - r * 2), y: -r, vy: (40 + ramp * 0.55) * dpr, shape: lumpyShape() }
      }
      if (type === 'chunk') {
        const r = 24 * dpr
        return { ...base, r, hp: 1, pts: 20, sway: 0, x: 0, y: 0, vy: (70 + ramp * 0.7) * dpr, shape: lumpyShape() }
      }
      const r = (18 + Math.random() * 9) * dpr
      return { ...base, r, hp: 1, pts: 10, sway: 0, x: r + Math.random() * (W - r * 2), y: -r, vy: (50 + ramp + Math.random() * 26) * dpr, shape: lumpyShape() }
    }

    const startWave = (now) => {
      s.wave += 1
      setWaveNo(s.wave)
      sfx.ding()
      const n = Math.min(9, 3 + Math.floor(s.wave * 0.7))
      const list = []
      for (let i = 0; i < n; i++) list.push(makeEnemy(Math.random() < 0.45 ? 'alien' : 'meteor'))
      if (s.wave % 3 === 0) list.splice(Math.floor(n / 2), 0, makeEnemy('rock'))
      s.toSpawn = list
      s.gap = Math.max(300, 820 - s.wave * 45)
      s.nextSpawn = now
    }

    /* ---------- fx ---------- */

    const boom = (x, y, color, count, power) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (50 + Math.random() * power) * dpr
        const life = 0.35 + Math.random() * 0.35
        s.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, life0: life, color, size: (3 + Math.random() * 5) * dpr })
      }
    }

    const kill = (e) => {
      sfx.pop()
      s.score += e.pts
      boom(e.x, e.y, e.type === 'alien' ? '#c4b5fd' : '#fbbf24', 14, 190)
      if (e.type === 'rock') {
        // a big rock breaks into two chunks that drift apart
        for (const dir of [-1, 1]) {
          const c = makeEnemy('chunk')
          c.x = e.x + dir * e.r * 0.45
          c.y = e.y
          c.vx = dir * 55 * dpr
          s.enemies.push(c)
        }
      }
    }

    const damage = () => {
      if (s.inv > 0 || s.done) return
      s.lives -= 1
      s.inv = INV_SEC
      s.hurt = 0.45
      s.shake = 16 * dpr
      sfx.buzz()
      // shockwave: everything already low on the screen is cleared, for free
      const H = canvas.height
      for (const e of s.enemies) {
        if (e.y > H * 0.55) boom(e.x, e.y, '#fca5a5', 10, 150)
      }
      s.enemies = s.enemies.filter((e) => e.y <= H * 0.55)
      if (s.lives <= 0) {
        s.done = true
        sfx.thud()
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        setHud({ score: s.score, lives: 0, maxLives: START_LIVES })
        setOver({ score: s.score, isRecord })
      }
    }

    /* ---------- input ---------- */

    let dragging = false
    const aimAt = (e) => {
      const r = canvas.getBoundingClientRect()
      const H = canvas.height
      const W = canvas.width
      const R = SHIP_R * dpr
      s.ship.tx = Math.max(R, Math.min(W - R, (e.clientX - r.left) * dpr))
      s.ship.ty = Math.max(H * 0.45, Math.min(H - R - 8 * dpr, (e.clientY - r.top) * dpr - FINGER_LIFT * dpr))
    }
    const onDown = (e) => {
      e.preventDefault()
      if (s.done) return
      dragging = true
      if (!s.started) {
        s.started = true
        s.waveAt = performance.now()
        setStarted(true)
      }
      aimAt(e)
    }
    const onMove = (e) => {
      e.preventDefault()
      if (dragging && !s.done) aimAt(e)
    }
    const onUp = (e) => {
      e.preventDefault()
      dragging = false
    }
    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup', onUp, { passive: false })
    canvas.addEventListener('pointercancel', onUp, { passive: false })

    /* ---------- draw helpers ---------- */

    const drawRock = (e, fill, stroke) => {
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.rot)
      ctx.beginPath()
      for (let i = 0; i < e.shape.length; i++) {
        const a = (i / e.shape.length) * Math.PI * 2
        const rr = e.r * e.shape[i]
        const px = Math.cos(a) * rr
        const py = Math.sin(a) * rr
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = stroke
      ctx.stroke()
      ctx.fillStyle = stroke
      ctx.beginPath()
      ctx.arc(-e.r * 0.25, -e.r * 0.15, e.r * 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(e.r * 0.3, e.r * 0.22, e.r * 0.13, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const drawAlien = (e) => {
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = '#3b0764'
      ctx.beginPath()
      ctx.ellipse(0, e.r * 0.18, e.r, e.r * 0.42, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#a78bfa'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, e.r * 0.05, e.r * 0.52, Math.PI, 0)
      ctx.fillStyle = '#86efac'
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -e.r * 0.16, e.r * 0.17, 0, Math.PI * 2)
      ctx.fillStyle = '#0f172a'
      ctx.fill()
      ctx.restore()
    }

    const drawShip = (x, y, R) => {
      ctx.save()
      ctx.translate(x, y)
      const flame = (0.6 + Math.random() * 0.6) * R
      ctx.beginPath()
      ctx.moveTo(-R * 0.32, R * 0.5)
      ctx.lineTo(0, R * 0.5 + flame)
      ctx.lineTo(R * 0.32, R * 0.5)
      ctx.closePath()
      ctx.fillStyle = '#fb923c'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(0, -R * 1.3)
      ctx.lineTo(R, R * 0.75)
      ctx.lineTo(0, R * 0.35)
      ctx.lineTo(-R, R * 0.75)
      ctx.closePath()
      ctx.fillStyle = '#e2e8f0'
      ctx.fill()
      ctx.lineWidth = 3 * dpr
      ctx.strokeStyle = '#0f172a'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -R * 0.3, R * 0.36, 0, Math.PI * 2)
      ctx.fillStyle = accentRef.current
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    /* ---------- loop ---------- */

    let raf = 0
    let last = 0
    const loop = (now) => {
      if (!g.current || s.done) return
      const dt = last ? Math.min(0.034, (now - last) / 1000) : 0
      last = now
      const W = canvas.width
      const H = canvas.height
      const R = SHIP_R * dpr

      if (!s.started) {
        // idle hover until his first touch
        s.ship.tx = W / 2
        s.ship.ty = H * 0.8 + Math.sin(now / 420) * 8 * dpr
      }
      // exponential chase keeps the ship glued to his finger without jitter
      const k = 1 - Math.exp(-16 * dt)
      s.ship.x += (s.ship.tx - s.ship.x) * k
      s.ship.y += (s.ship.ty - s.ship.y) * k

      if (s.started) {
        if (s.toSpawn.length === 0 && s.enemies.length === 0 && now >= s.waveAt) startWave(now)
        while (s.toSpawn.length && now >= s.nextSpawn) {
          s.enemies.push(s.toSpawn.shift())
          s.nextSpawn = now + s.gap
        }

        if (now - s.lastShot >= SHOT_MS) {
          s.lastShot = now
          s.bullets.push({ x: s.ship.x, y: s.ship.y - R * 1.3 })
          sfx.click()
        }
      }

      for (const b of s.bullets) b.y -= BULLET_SPEED * dpr * dt
      s.bullets = s.bullets.filter((b) => b.y > -20 * dpr)

      for (const e of s.enemies) {
        e.y += e.vy * dt
        e.rot += e.spin * dt
        if (e.flash > 0) e.flash -= dt
        if (e.sway) e.x += Math.sin(now / 520 + e.seed) * e.sway * dt * 4
        if (e.vx) e.x += e.vx * dt
        // bounce off the walls so nothing sneaks down the edge
        if (e.x < e.r) { e.x = e.r; if (e.vx) e.vx = Math.abs(e.vx) }
        if (e.x > W - e.r) { e.x = W - e.r; if (e.vx) e.vx = -Math.abs(e.vx) }
      }

      // bullets vs enemies
      for (const b of s.bullets) {
        for (const e of s.enemies) {
          if (e.hp <= 0) continue
          const dx = b.x - e.x
          const dy = b.y - e.y
          if (dx * dx + dy * dy > e.r * e.r) continue
          b.y = -999
          e.hp -= 1
          e.flash = 0.12
          if (e.hp > 0) {
            s.score += 2
            sfx.flip()
            boom(b.x, b.y, '#fde68a', 5, 90)
          } else {
            kill(e)
          }
          break
        }
      }
      s.bullets = s.bullets.filter((b) => b.y > -20 * dpr)
      s.enemies = s.enemies.filter((e) => e.hp > 0)

      // enemies vs ship, then enemies leaking off the bottom
      if (s.inv > 0) s.inv -= dt
      for (const e of s.enemies) {
        const dx = e.x - s.ship.x
        const dy = e.y - s.ship.y
        const reach = e.r + R * 0.7
        if (s.inv <= 0 && dx * dx + dy * dy < reach * reach) {
          e.hp = 0
          boom(e.x, e.y, '#fca5a5', 16, 210)
          damage()
          break
        }
      }
      s.enemies = s.enemies.filter((e) => e.hp > 0)
      const leaked = s.enemies.filter((e) => e.y - e.r > H)
      if (leaked.length) {
        s.enemies = s.enemies.filter((e) => e.y - e.r <= H)
        if (s.inv <= 0) damage()
      }

      for (const p of s.parts) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.94
        p.vy *= 0.94
        p.life -= dt
      }
      s.parts = s.parts.filter((p) => p.life > 0)

      if (s.shake > 0) s.shake = Math.max(0, s.shake - 60 * dpr * dt)
      if (s.hurt > 0) s.hurt -= dt

      /* ---- draw ---- */
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#1e1b4b')
      sky.addColorStop(1, '#020617')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      ctx.save()
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake)

      for (const st of stars) {
        st.y += (18 + st.z * 90) * dpr * dt
        if (st.y > H) { st.y = -2 * dpr; st.x = Math.random() * W }
        ctx.globalAlpha = 0.3 + st.z * 0.7
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(st.x, st.y, (1 + st.z * 2) * dpr, (1 + st.z * 2) * dpr)
      }
      ctx.globalAlpha = 1

      for (const e of s.enemies) {
        if (e.type === 'alien') drawAlien(e)
        else if (e.type === 'rock') drawRock(e, '#b45309', '#7c2d12')
        else if (e.type === 'chunk') drawRock(e, '#d97706', '#7c2d12')
        else drawRock(e, '#94a3b8', '#334155')
        if (e.flash > 0) {
          ctx.globalAlpha = Math.min(1, e.flash * 7)
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      ctx.fillStyle = accentRef.current
      for (const b of s.bullets) {
        ctx.fillRect(b.x - 2.5 * dpr, b.y - 11 * dpr, 5 * dpr, 16 * dpr)
      }

      for (const p of s.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.life0)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
      ctx.globalAlpha = 1

      // muzzle flash right after a shot leaves the nose
      if (s.started && now - s.lastShot < 70) {
        ctx.globalAlpha = 0.75
        ctx.fillStyle = '#fef9c3'
        ctx.beginPath()
        ctx.arc(s.ship.x, s.ship.y - R * 1.3, 9 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // blink through the mercy window
      if (s.inv <= 0 || Math.floor(now / 90) % 2 === 0) drawShip(s.ship.x, s.ship.y, R)
      ctx.restore()

      // danger strip along the floor
      const floor = ctx.createLinearGradient(0, H - 26 * dpr, 0, H)
      floor.addColorStop(0, 'rgba(239,68,68,0)')
      floor.addColorStop(1, 'rgba(239,68,68,0.45)')
      ctx.fillStyle = floor
      ctx.fillRect(0, H - 26 * dpr, W, 26 * dpr)

      if (s.hurt > 0) {
        ctx.fillStyle = `rgba(239,68,68,${Math.min(0.4, s.hurt * 0.7)})`
        ctx.fillRect(0, 0, W, H)
      }

      setHud((h) => (h.score === s.score && h.lives === s.lives ? h : { score: s.score, lives: Math.max(0, s.lives), maxLives: START_LIVES }))
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

      {!started && !over && (
        <div className="absolute inset-x-0 bottom-[16%] flex justify-center px-4 pointer-events-none" dir="rtl">
          <div className="anim-fade-in bg-black/70 text-white font-black text-xl rounded-3xl border-b-8 border-cyan-500 px-6 py-4 text-center leading-snug">
            הזז את האצבע — הספינה עוקבת ויורה לבד!
            <br />
            <span className="text-cyan-300">אל תיתן לאף מטאור לרדת למטה</span>
            <br />
            <span className="text-yellow-300 text-2xl italic">בוא, גע במסך כדי להתחיל</span>
          </div>
        </div>
      )}

      {bannerOn && !over && (
        <div key={waveNo} className="absolute inset-x-0 top-[22%] flex justify-center pointer-events-none" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 font-black italic text-4xl rounded-3xl border-b-8 border-cyan-500 shadow-xl px-8 py-4">
            גל {waveNo}
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
