import { useEffect, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

/* Tuning lives in CSS pixels and seconds, so the flight feels identical on every dpr. */
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const GRAVITY = 1550
const THRUST = -3150 // while held the net accel is GRAVITY + THRUST = -1600, so rising is slower than falling
const VY_MIN = -580
const VY_MAX = 760
const BASE_SPEED = 245
const MAX_SPEED = 470
const PX_PER_METER = 26 // 26px of scrolled cave = 1 point of distance
const COIN_BONUS = 5
const R = 17 // rocket radius used for art + pickup range
const HIT_R = R * 0.76 // hitbox is smaller than the art — misses feel fair
const CEIL_H = 30
const FLOOR_H = 40
const GRACE_PX = 460 // no beams until the cave has scrolled this far
const CRASH_MS = 760 // shake + tumble before the game-over card

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// Stable pseudo-random per world index — keeps the parallax scenery from flickering
// as it scrolls, without storing an array of shapes.
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// circle vs axis-aligned rect: nearest point on the rect, then a radius test
const hitsRect = (cx, cy, r, rx, ry, rw, rh) => {
  const dx = cx - clamp(cx, rx, rx + rw)
  const dy = cy - clamp(cy, ry, ry + rh)
  return dx * dx + dy * dy < r * r
}

// A laser: glowing capsule with a hot white core and metal emitter caps on both ends.
function drawBeam(ctx, o, t) {
  const vertical = o.h > o.w
  const pulse = 0.7 + Math.sin(t * 11 + o.x * 0.02) * 0.3
  ctx.save()
  ctx.shadowColor = 'rgba(244,63,94,0.85)'
  ctx.shadowBlur = 18 * pulse
  ctx.fillStyle = '#f43f5e'
  ctx.beginPath()
  ctx.roundRect(o.x, o.y, o.w, o.h, Math.min(o.w, o.h) / 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = `rgba(255,255,255,${0.75 + pulse * 0.2})`
  ctx.beginPath()
  if (vertical) ctx.roundRect(o.x + 3, o.y, o.w - 6, o.h, (o.w - 6) / 2)
  else ctx.roundRect(o.x, o.y + 3, o.w, o.h - 6, (o.h - 6) / 2)
  ctx.fill()
  ctx.restore()

  const caps = vertical
    ? [[o.x + o.w / 2, o.y], [o.x + o.w / 2, o.y + o.h]]
    : [[o.x, o.y + o.h / 2], [o.x + o.w, o.y + o.h / 2]]
  for (const [cx, cy] of caps) {
    ctx.fillStyle = '#334155'
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = '#fca5a5'
    ctx.beginPath()
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

// The hero, drawn in local coords: nose at +x, tail at -x. `flame` is the smoothed 0..1 thrust.
function drawRocket(ctx, flame, t) {
  const len = 12 + flame * 32 + Math.sin(t * 45) * 3 * flame
  const plume = (l, color) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-16, -7)
    ctx.quadraticCurveTo(-16 - l * 0.5, -5, -16 - l, 0)
    ctx.quadraticCurveTo(-16 - l * 0.5, 5, -16, 7)
    ctx.closePath()
    ctx.fill()
  }
  plume(len, '#f97316')
  plume(len * 0.62, '#fbbf24')
  plume(len * 0.3, '#fff7ed')

  // fins
  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.moveTo(-6, -9)
  ctx.lineTo(-20, -21)
  ctx.lineTo(-17, -5)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-6, 9)
  ctx.lineTo(-20, 21)
  ctx.lineTo(-17, 5)
  ctx.closePath()
  ctx.fill()

  // hull
  ctx.beginPath()
  ctx.moveTo(26, 0)
  ctx.quadraticCurveTo(6, -14, -13, -12)
  ctx.quadraticCurveTo(-20, -6, -20, 0)
  ctx.quadraticCurveTo(-20, 6, -13, 12)
  ctx.quadraticCurveTo(6, 14, 26, 0)
  ctx.closePath()
  const body = ctx.createLinearGradient(0, -14, 0, 14)
  body.addColorStop(0, '#ffffff')
  body.addColorStop(1, '#cbd5e1')
  ctx.fillStyle = body
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#ef4444' // nose cone + tail band, clipped to the hull
  ctx.fillRect(11, -16, 20, 32)
  ctx.fillRect(-21, -16, 5, 32)
  ctx.restore()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#0f172a'
  ctx.stroke()

  // porthole
  ctx.fillStyle = '#38bdf8'
  ctx.beginPath()
  ctx.arc(0, 0, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#0f172a'
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(-2.2, -2.2, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

// Jetpack — hold to fire the rocket upward, release to drop. Weave the laser cave, grab coins.
export default function Jetpack({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [hud, setHud] = useState({ score: 0 })
  const [coins, setCoins] = useState(0)
  const [started, setStarted] = useState(false)
  const [over, setOver] = useState(null)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let W = 0
    let H = 0

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const s = {
      t: 0,
      dist: 0,
      coins: 0,
      score: 0,
      milestone: 100,
      y: H / 2,
      vy: 0,
      tilt: 0,
      spin: 0,
      flame: 0.15,
      emit: 0,
      thrust: false,
      started: false,
      obst: [],
      pickups: [],
      parts: [],
      spawnIn: GRACE_PX,
      crashAt: 0,
      shake: 0,
      finished: false,
    }

    const addParts = (n, make) => {
      for (let i = 0; i < n; i++) s.parts.push(make())
    }

    // Coin arcs ride a half sine so they read as a swoop the player can trace with one hold.
    const spawnCoinArc = (x0, top, bot) => {
      const dir = Math.random() < 0.5 ? -1 : 1
      const cy = top + (bot - top) * (0.3 + Math.random() * 0.4)
      for (let i = 0; i < 4; i++) {
        const y = cy + dir * Math.sin((i / 3) * Math.PI) * 48
        s.pickups.push({ x: x0 + i * 36, y: clamp(y, top + 26, bot - 26), got: false })
      }
    }

    // One obstacle per event, with a coin swoop parked in the gap behind it.
    const spawnObstacle = (spacing, top, bot) => {
      const playH = bot - top
      const x = W + 40
      const roll = Math.random()
      if (roll < 0.46) {
        // beam hanging from the ceiling or standing on the floor — never more than 45% of the shaft
        const len = playH * (0.2 + Math.random() * 0.25)
        const fromTop = Math.random() < 0.5
        s.obst.push({ x, y: fromTop ? top : bot - len, w: 12, h: len, amp: 0 })
      } else {
        // floating bar: fly over or under it. It only starts bobbing once the run is warmed up.
        const w = 90 + Math.random() * 60
        const baseY = top + playH * (0.3 + Math.random() * 0.4)
        const amp = s.dist > 2600 ? playH * 0.12 : 0
        s.obst.push({ x, y: baseY, baseY, w, h: 12, amp, rate: 1.4 + Math.random(), phase: Math.random() * 6.28 })
      }
      if (Math.random() < 0.72) spawnCoinArc(x + spacing * 0.45, top, bot)
    }

    spawnCoinArc(W + 140, CEIL_H, H - FLOOR_H)

    const down = (e) => {
      e.preventDefault()
      if (s.finished) return
      s.thrust = true
      if (!s.started) {
        s.started = true
        setStarted(true)
        sfx.flip()
      }
    }
    const up = () => {
      s.thrust = false
    }
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)

    let raf = 0
    let last = 0
    let stopped = false

    const loop = (now) => {
      if (stopped) return
      const dt = last ? Math.min(MAX_DT, (now - last) / 1000) : 0
      last = now
      s.t += dt

      const top = CEIL_H
      const bot = H - FLOOR_H
      const px = Math.max(64, W * 0.26)
      const speed = Math.min(MAX_SPEED, BASE_SPEED + s.dist * 0.011)
      const crashed = s.crashAt > 0

      /* ---- update ---- */
      if (!s.started) {
        s.y = H / 2 + Math.sin(s.t * 2.2) * 9 // idle hover on the launch pad
      } else if (!crashed) {
        s.dist += speed * dt
        s.vy = clamp(s.vy + (GRAVITY + (s.thrust ? THRUST : 0)) * dt, VY_MIN, VY_MAX)
        s.y += s.vy * dt

        s.spawnIn -= speed * dt
        if (s.spawnIn <= 0) {
          const spacing = Math.max(255, 440 - s.dist * 0.006)
          spawnObstacle(spacing, top, bot)
          s.spawnIn = spacing
        }
      } else {
        s.vy = clamp(s.vy + GRAVITY * dt, VY_MIN, VY_MAX)
        s.y = clamp(s.y + s.vy * dt, -200, H + 200)
        s.spin += dt * 7
      }

      if (s.started && !crashed) {
        for (const o of s.obst) {
          o.x -= speed * dt
          if (o.amp) o.y = o.baseY + Math.sin(s.t * o.rate + o.phase) * o.amp
        }
        if (s.obst.length && s.obst[0].x + s.obst[0].w < -40) s.obst.shift()

        for (const c of s.pickups) {
          c.x -= speed * dt
          if (!c.got) {
            const dx = c.x - px
            const dy = c.y - s.y
            if (dx * dx + dy * dy < (R + 14) * (R + 14)) {
              c.got = true
              s.coins += 1
              setCoins(s.coins)
              sfx.coin()
              addParts(7, () => ({
                kind: 'spark',
                color: '#fde047',
                x: c.x,
                y: c.y,
                vx: (Math.random() - 0.5) * 220,
                vy: (Math.random() - 0.5) * 220,
                r: 2.5 + Math.random() * 2.5,
                t: 0,
                life: 0.35,
              }))
            }
          }
        }
        s.pickups = s.pickups.filter((c) => c.x > -40 && !c.got)

        let hit = s.y - HIT_R < top || s.y + HIT_R > bot
        if (!hit) {
          for (const o of s.obst) {
            if (hitsRect(px, s.y, HIT_R, o.x, o.y, o.w, o.h)) {
              hit = true
              break
            }
          }
        }
        if (hit) {
          s.crashAt = s.t
          s.shake = 24
          s.vy = -160 // small bounce so the tumble reads
          sfx.thud()
          addParts(20, () => ({
            kind: 'debris',
            color: Math.random() < 0.5 ? '#f97316' : '#e2e8f0',
            x: px,
            y: s.y,
            vx: (Math.random() - 0.5) * 420,
            vy: (Math.random() - 0.6) * 420,
            r: 2.5 + Math.random() * 4,
            t: 0,
            life: 0.6 + Math.random() * 0.3,
          }))
        }

        const meters = Math.floor(s.dist / PX_PER_METER)
        if (meters >= s.milestone) {
          s.milestone += 100
          sfx.ding()
          s.parts.push({ kind: 'ring', x: px, y: s.y, vx: -speed, vy: 0, r: 0, t: 0, life: 0.6, color: '#fde047' })
        }
      }

      // exhaust: thicker while the finger is down, a lazy pilot flame otherwise
      s.flame += ((s.thrust && !crashed ? 1 : crashed ? 0 : 0.18) - s.flame) * Math.min(1, dt * 14)
      s.tilt = crashed ? s.spin : clamp(s.vy / 1100, -0.42, 0.42)
      if (s.started && !crashed && s.thrust) {
        s.emit -= dt
        while (s.emit <= 0) {
          s.emit += 0.014
          const c = Math.cos(s.tilt)
          const sn = Math.sin(s.tilt)
          const nx = px + -12 * c - 11 * sn // nozzle sits under the tail, rotated with the hull
          const ny = s.y + -12 * sn + 11 * c
          s.parts.push({
            kind: 'flame',
            x: nx + (Math.random() - 0.5) * 7,
            y: ny + (Math.random() - 0.5) * 7,
            vx: -speed * 0.5 - Math.random() * 40,
            vy: 110 + Math.random() * 150,
            r: 3.5 + Math.random() * 4,
            t: 0,
            life: 0.3 + Math.random() * 0.22,
          })
        }
      }
      for (const p of s.parts) {
        p.t += dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.kind === 'debris') p.vy += 900 * dt
      }
      s.parts = s.parts.filter((p) => p.t < p.life)
      if (s.parts.length > 280) s.parts.splice(0, s.parts.length - 280)
      s.shake = Math.max(0, s.shake - dt * 42)

      s.score = Math.floor(s.dist / PX_PER_METER) + s.coins * COIN_BONUS
      setHud((h) => (h.score === s.score ? h : { score: s.score }))

      if (crashed && !s.finished && s.t - s.crashAt > CRASH_MS / 1000) {
        s.finished = true
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        setOver({ score: s.score, isRecord })
      }

      /* ---- draw ---- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#1e1b4b')
      sky.addColorStop(0.55, '#312e81')
      sky.addColorStop(1, '#0f172a')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      ctx.save()
      if (s.shake > 0.2) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake)

      // parallax: far humps, closer spikes, then dust motes riding just behind the action
      const layer = (factor, step, fn) => {
        const scrolled = s.dist * factor
        const off = scrolled % step
        const k0 = Math.floor(scrolled / step)
        for (let i = -1; i * step - off < W + step; i++) fn(i * step - off, k0 + i)
      }
      ctx.fillStyle = '#191650'
      layer(0.22, 150, (x, k) => {
        const hgt = 40 + hash(k) * 90
        ctx.beginPath()
        ctx.moveTo(x - 20, bot)
        ctx.quadraticCurveTo(x + 55, bot - hgt, x + 130, bot)
        ctx.closePath()
        ctx.fill()
      })
      ctx.fillStyle = '#3b3792'
      layer(0.5, 115, (x, k) => {
        const a = 30 + hash(k) * 60
        const b = 30 + hash(k + 99) * 60
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x + 34, top)
        ctx.lineTo(x + 17, top + a)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(x + 58, bot)
        ctx.lineTo(x + 92, bot)
        ctx.lineTo(x + 75, bot - b)
        ctx.closePath()
        ctx.fill()
      })
      ctx.fillStyle = 'rgba(165,180,252,0.35)'
      layer(0.85, 70, (x, k) => {
        const y = top + hash(k + 7) * (bot - top)
        ctx.beginPath()
        ctx.arc(x, y, 1.6 + hash(k + 13) * 1.8, 0, Math.PI * 2)
        ctx.fill()
      })

      // electrified floor + ceiling plates
      const plate = (y, hgt, edgeY) => {
        ctx.fillStyle = '#1f2937'
        ctx.fillRect(-30, y, W + 60, hgt)
        ctx.fillStyle = '#0b1220'
        for (let x = -((s.dist * 0.9) % 44); x < W + 44; x += 44) ctx.fillRect(x, y + 6, 22, hgt - 12)
        ctx.save()
        ctx.shadowColor = 'rgba(244,63,94,0.9)'
        ctx.shadowBlur = 14
        ctx.fillStyle = '#f43f5e'
        ctx.fillRect(-30, edgeY - 3, W + 60, 6)
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(-30, edgeY - 1, W + 60, 2)
        ctx.restore()
      }
      plate(-30, top + 30, top)
      plate(bot, H - bot + 30, bot)

      for (const c of s.pickups) {
        const bob = Math.sin(s.t * 4 + c.x * 0.04) * 3
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath()
        ctx.arc(c.x, c.y + bob, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fde047'
        ctx.beginPath()
        ctx.arc(c.x, c.y + bob, 7.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath()
        ctx.arc(c.x - 3, c.y + bob - 3, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const o of s.obst) drawBeam(ctx, o, s.t)

      for (const p of s.parts) {
        const k = p.t / p.life
        ctx.globalAlpha = 1 - k
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color
          ctx.lineWidth = 5 * (1 - k)
          ctx.beginPath()
          ctx.arc(p.x, p.y, 16 + k * 54, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle =
            p.kind === 'flame'
              ? k < 0.25
                ? '#fff7ed'
                : k < 0.55
                  ? '#fbbf24'
                  : k < 0.82
                    ? '#f97316'
                    : '#7c2d12'
              : p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.5, p.r * (1 - k * 0.6)), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      ctx.save()
      ctx.translate(px, s.y)
      ctx.rotate(s.tilt)
      drawRocket(ctx, s.flame, s.t)
      ctx.restore()
      ctx.restore()

      if (crashed) {
        const k = clamp((s.t - s.crashAt) / 0.3, 0, 1)
        ctx.fillStyle = `rgba(248,113,113,${0.45 * (1 - k)})`
        ctx.fillRect(0, 0, W, H)
      }

      if (!s.finished) raf = requestAnimationFrame(loop) // the modal covers the canvas — stop burning frames
    }
    raf = requestAnimationFrame(loop)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerdown', down)
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

      <div
        className="absolute top-3 right-3 flex items-center gap-2 bg-black/55 text-yellow-300 font-black text-xl rounded-2xl px-3 py-1.5 tabular-nums pointer-events-none"
        dir="rtl"
      >
        <Coins size={20} strokeWidth={3} />
        {coins}
      </div>

      {!started && (
        <div className="absolute inset-x-0 bottom-[16%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-fade-in bg-black/65 text-white font-black text-xl rounded-3xl border-b-8 border-rose-500 px-6 py-4 text-center leading-snug">
            החזק את המסך כדי לעוף 🚀
            <br />
            שחרר כדי לרדת — אסוף מטבעות!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
