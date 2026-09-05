import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

/**
 * Race Car — top-down four lane race. Tommy's car chases his finger between the
 * lanes while the road scrolls under him; rivals crawl backwards down the
 * screen and every one he leaves behind is worth +50. Arrow pads painted on the
 * tarmac hand him a few seconds of turbo. One crash ends the race.
 *
 * The backing store is dpr-scaled once per resize and the context is scaled
 * with it, so every number in the simulation below is plain CSS pixels.
 */

const LANES = 4
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const GRACE_SEC = 1.5 // empty road before the first rival shows up
const HINT_MS = 4500
const BANNER_MS = 1100
const CRASH_MS = 800 // wreck animation before the game-over card
const BOOST_SEC = 3.2
const OVERTAKE_POINTS = 50
const PX_PER_POINT = 32 // distance scoring
const LANE_PULL = 11 // exponential pull toward the aimed lane (per second)
const BASE_SPEED = 320 // px/s on the start line
const TOP_GAIN = 330 // extra px/s once he is deep into the race
const RAMP_PX = 16000 // distance over which the speed ramp tops out
const BOOST_MUL = 1.75
const KMH = 0.42 // px/s -> the number on the dial
const MAX_KMH = 460 // dial full scale; only turbo pins the needle

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const rnd = (a, b) => a + Math.random() * (b - a)

export default function RaceCar({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0 })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [hint, setHint] = useState(true)
  const [banner, setBanner] = useState(null)
  const [gauge, setGauge] = useState({ x: 0, y: 0, r: 0 })
  const reportedRef = useRef(false)

  // world colours — accent + confetti only, never theme.arcade
  const palette = useMemo(() => {
    const accent = theme?.vars?.['--t-accent'] ?? '#fde047'
    const rivals = theme?.confetti?.length
      ? theme.confetti
      : ['#38bdf8', '#a855f7', '#f472b6', '#22c55e', '#fb923c']
    return { accent, rivals }
  }, [theme])
  const palRef = useRef(palette)
  useEffect(() => {
    palRef.current = palette
  }, [palette])

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
      geo: null,
      x: 0, // player car centre in css px
      lane: 1,
      tilt: 0,
      spin: 0,
      dragging: false,
      dist: 0,
      scroll: 0,
      elapsed: 0,
      base: BASE_SPEED,
      speed: BASE_SPEED,
      boostUntil: -1,
      rivals: [],
      pads: [],
      trees: [],
      smoke: [],
      streaks: [],
      pops: [],
      topTree: null,
      nextRival: GRACE_SEC,
      nextPad: 6,
      overtakes: 0,
      score: 0,
      shake: 0,
      crashAt: 0,
      done: false,
      last: performance.now(),
    }

    /* ---- sizing: sim runs in css px, gauge geometry is shared with the DOM ---- */
    const measure = () => {
      const r = wrap.getBoundingClientRect()
      const W = Math.max(1, r.width)
      const H = Math.max(1, r.height)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const roadW = clamp(W * 0.72, 200, 520)
      const roadX = (W - roadW) / 2
      const laneW = roadW / LANES
      const carW = clamp(laneW * 0.66, 22, 62)
      const carH = carW * 1.8
      const gr = clamp(Math.min(W, H) * 0.085, 32, 50)
      const s = g.current
      s.geo = {
        W,
        H,
        roadX,
        roadW,
        laneW,
        carW,
        carH,
        grassW: roadX,
        playerY: H - carH * 0.72 - 24,
        gx: 16 + gr,
        gy: H - 16 - gr,
        gr,
      }
      s.x = roadX + laneW * (s.lane + 0.5)
      setGauge((p) => (p.r === gr && p.y === H - 16 - gr ? p : { x: 16 + gr, y: H - 16 - gr, r: gr }))
    }
    measure()
    window.addEventListener('resize', measure)

    /* ---- controls: the car aims at whatever lane the finger sits over ---- */
    const aim = (clientX) => {
      const s = g.current
      if (!s || s.done || s.crashAt) return
      const rect = canvas.getBoundingClientRect()
      const lane = clamp(Math.floor((clientX - rect.left - s.geo.roadX) / s.geo.laneW), 0, LANES - 1)
      if (lane !== s.lane) {
        s.lane = lane
        sfx.flip()
      }
    }

    const onDown = (e) => {
      if (e.cancelable) e.preventDefault()
      const s = g.current
      if (!s) return
      s.dragging = true
      setHint(false)
      aim(e.clientX)
    }
    const onMove = (e) => {
      const s = g.current
      if (!s || !s.dragging) return
      if (e.cancelable) e.preventDefault()
      aim(e.clientX)
    }
    const onUp = () => {
      const s = g.current
      if (s) s.dragging = false
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    later(() => setHint(false), HINT_MS)

    const crash = () => {
      const s = g.current
      if (!s || s.done || s.crashAt) return
      s.crashAt = s.elapsed
      s.shake = 1
      s.boostUntil = -1
      sfx.thud()
      for (let i = 0; i < 18; i++) {
        s.smoke.push({
          x: s.x + rnd(-s.geo.carW * 0.5, s.geo.carW * 0.5),
          y: s.geo.playerY + rnd(-s.geo.carH * 0.3, s.geo.carH * 0.4),
          r: rnd(6, 14),
          life: rnd(0.6, 1),
          vx: rnd(-120, 120),
          vy: rnd(-90, 120),
        })
      }
      later(() => {
        const st = g.current
        if (!st || st.done) return
        st.done = true
        const isRecord = st.score > highScore
        if (isRecord) sfx.fanfare()
        setOver({ score: st.score, isRecord })
      }, CRASH_MS)
    }

    /* ---- painting helpers ---- */
    const rr = (x, y, w, h, r) => {
      const rad = Math.min(r, w / 2, h / 2)
      ctx.beginPath()
      ctx.moveTo(x + rad, y)
      ctx.arcTo(x + w, y, x + w, y + h, rad)
      ctx.arcTo(x + w, y + h, x, y + h, rad)
      ctx.arcTo(x, y + h, x, y, rad)
      ctx.arcTo(x, y, x + w, y, rad)
      ctx.closePath()
    }

    const drawCar = (x, y, w, h, body, tilt) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(tilt)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      rr(-w / 2 + 2, -h / 2 + 7, w, h, w * 0.32)
      ctx.fill()
      // tyres poke out of the shell on all four corners
      const tw = w * 0.2
      const th = h * 0.24
      ctx.fillStyle = '#111827'
      rr(-w / 2 - tw * 0.45, -h * 0.36, tw, th, 3)
      ctx.fill()
      rr(w / 2 - tw * 0.55, -h * 0.36, tw, th, 3)
      ctx.fill()
      rr(-w / 2 - tw * 0.45, h * 0.12, tw, th, 3)
      ctx.fill()
      rr(w / 2 - tw * 0.55, h * 0.12, tw, th, 3)
      ctx.fill()
      // shell + racing stripe
      ctx.fillStyle = body
      rr(-w / 2, -h / 2, w, h, w * 0.32)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(-w * 0.09, -h * 0.46, w * 0.18, h * 0.92)
      ctx.fillStyle = 'rgba(15,23,42,0.8)'
      rr(-w * 0.33, -h * 0.3, w * 0.66, h * 0.22, 4)
      ctx.fill()
      rr(-w * 0.3, h * 0.08, w * 0.6, h * 0.17, 4)
      ctx.fill()
      ctx.fillStyle = '#fef9c3'
      rr(-w * 0.44, -h * 0.5, w * 0.26, h * 0.07, 2)
      ctx.fill()
      rr(w * 0.18, -h * 0.5, w * 0.26, h * 0.07, 2)
      ctx.fill()
      ctx.fillStyle = '#ef4444'
      rr(-w * 0.44, h * 0.43, w * 0.26, h * 0.07, 2)
      ctx.fill()
      rr(w * 0.18, h * 0.43, w * 0.26, h * 0.07, 2)
      ctx.fill()
      ctx.restore()
    }

    let raf = 0
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const geo = s.geo
      const pal = palRef.current
      const dt = Math.min(MAX_DT, Math.max(0, (now - s.last) / 1000))
      s.last = now
      const { W, H, roadX, roadW, laneW, carW, carH, playerY, grassW, gx, gy, gr } = geo
      const laneX = (i) => roadX + laneW * (i + 0.5)
      const crashing = s.crashAt > 0
      s.elapsed += dt
      const boostLeft = crashing ? 0 : Math.max(0, s.boostUntil - s.elapsed)
      const boosting = boostLeft > 0

      /* ---- speed: ramps with distance, eased in and out of turbo ---- */
      s.base = BASE_SPEED + TOP_GAIN * Math.min(1, s.dist / RAMP_PX)
      const wanted = s.base * (boosting ? BOOST_MUL : 1)
      if (crashing) s.speed = Math.max(0, s.speed - 1100 * dt)
      else s.speed += (wanted - s.speed) * Math.min(1, dt * 6)
      s.dist += s.speed * dt
      s.scroll += s.speed * dt

      /* ---- steering: ease toward the aimed lane, lean into the move ---- */
      const tx = laneX(s.lane)
      s.x += (tx - s.x) * (1 - Math.exp(-LANE_PULL * dt))
      s.tilt = crashing ? s.spin : clamp(((tx - s.x) / laneW) * 0.3, -0.3, 0.3)
      if (crashing) s.spin += dt * 5.5

      /* ---- roadside scenery, recycled as it falls off the bottom ---- */
      if (s.topTree === null) s.topTree = H
      s.topTree += s.speed * dt
      let guard = 0
      while (s.topTree > -40 && guard++ < 40) {
        s.topTree -= rnd(70, 150)
        if (grassW > 18) {
          const left = Math.random() < 0.5
          const size = clamp(grassW * 0.42, 10, 30)
          const x = left
            ? rnd(size * 0.6, Math.max(size * 0.7, grassW - size * 0.6))
            : rnd(roadX + roadW + size * 0.6, Math.max(roadX + roadW + size * 0.7, W - size * 0.6))
          s.trees.push({ x, y: s.topTree, size, kind: Math.random() < 0.3 ? 'bush' : 'pine' })
        }
      }
      for (const t of s.trees) t.y += s.speed * dt
      s.trees = s.trees.filter((t) => t.y < H + 80)

      /* ---- spawning: never more than two rivals in the top half, so with
         four lanes there is always a gap he can thread ---- */
      const openLane = (minY) => {
        const busy = new Set()
        for (const r of s.rivals) if (r.y < minY) busy.add(r.lane)
        for (const p of s.pads) if (p.y < minY) busy.add(p.lane)
        const open = []
        for (let i = 0; i < LANES; i++) if (!busy.has(i)) open.push(i)
        return open.length ? open[Math.floor(Math.random() * open.length)] : -1
      }

      if (!crashing && s.elapsed > s.nextRival) {
        const fresh = s.rivals.filter((r) => r.y < H * 0.55).length
        if (fresh < 2) {
          const lane = openLane(H * 0.5)
          if (lane >= 0) {
            s.rivals.push({
              lane,
              y: -carH,
              v: Math.min(s.base * rnd(0.4, 0.66), s.base - 90),
              color: pal.rivals[Math.floor(Math.random() * pal.rivals.length)],
              passed: false,
            })
          }
        }
        s.nextRival = s.elapsed + clamp(1.7 - s.elapsed * 0.012, 0.7, 1.7)
      }
      if (!crashing && s.elapsed > s.nextPad) {
        const lane = openLane(H * 0.5)
        if (lane >= 0) s.pads.push({ lane, y: -carH })
        s.nextPad = s.elapsed + rnd(7, 12)
      }

      /* ---- move traffic, count overtakes, check the crash box ---- */
      for (const r of s.rivals) {
        r.y += Math.max(40, s.speed - r.v) * dt
        if (!r.passed && r.y > playerY + carH * 0.5) {
          r.passed = true
          s.overtakes += 1
          sfx.coin()
          s.pops.push({ x: laneX(r.lane), y: playerY - carH * 0.2, life: 1, text: `+${OVERTAKE_POINTS}` })
        }
        if (
          !crashing &&
          Math.abs(r.y - playerY) < carH * 0.84 &&
          Math.abs(laneX(r.lane) - s.x) < carW * 0.8
        ) {
          crash()
        }
      }
      s.rivals = s.rivals.filter((r) => r.y < H + carH * 2)

      for (const p of s.pads) {
        p.y += s.speed * dt
        if (!crashing && !p.used && Math.abs(p.y - playerY) < carH * 0.8 && Math.abs(laneX(p.lane) - s.x) < laneW * 0.45) {
          p.used = true
          s.boostUntil = s.elapsed + BOOST_SEC
          sfx.ding()
          setBanner({ id: now, text: 'טורבו! 🔥' })
          later(() => setBanner(null), BANNER_MS)
        }
      }
      s.pads = s.pads.filter((p) => !p.used && p.y < H + 40)

      /* ---- tyre smoke off the rear wheels while the turbo burns ---- */
      if (boosting) {
        for (let i = 0; i < 2; i++) {
          s.smoke.push({
            x: s.x + (i ? 1 : -1) * carW * 0.42 + rnd(-2, 2),
            y: playerY + carH * 0.42,
            r: rnd(4, 8),
            life: 1,
            vx: rnd(-30, 30),
            vy: rnd(120, 220),
          })
        }
        if (s.streaks.length < 26) {
          for (let i = 0; i < 2; i++) {
            s.streaks.push({ x: rnd(0, W), y: rnd(-140, 0), len: rnd(50, 150), v: rnd(1.2, 2) })
          }
        }
      }
      for (const p of s.smoke) {
        p.life -= dt * 1.5
        p.x += p.vx * dt
        p.y += (p.vy + s.speed * 0.3) * dt
        p.r += dt * 26
      }
      s.smoke = s.smoke.filter((p) => p.life > 0)
      for (const st of s.streaks) st.y += s.speed * st.v * dt
      s.streaks = s.streaks.filter((st) => st.y < H + 20)
      for (const p of s.pops) {
        p.life -= dt * 1.1
        p.y -= 60 * dt
      }
      s.pops = s.pops.filter((p) => p.life > 0)
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 2)

      if (!crashing) s.score = Math.floor(s.dist / PX_PER_POINT) + s.overtakes * OVERTAKE_POINTS

      /* ================= draw ================= */
      ctx.save()
      if (s.shake > 0) ctx.translate(rnd(-6, 6) * s.shake, rnd(-6, 6) * s.shake)

      // grass + mown bands (the bands are the cheapest speed cue there is)
      ctx.fillStyle = '#166534'
      ctx.fillRect(-10, -10, W + 20, H + 20)
      ctx.fillStyle = '#15803d'
      const bandH = 46
      for (let y = -bandH * 2 + (s.scroll % (bandH * 2)); y < H; y += bandH * 2) {
        ctx.fillRect(-10, y, W + 20, bandH)
      }

      for (const t of s.trees) {
        const sz = t.size
        if (t.kind === 'bush') {
          ctx.fillStyle = '#14532d'
          ctx.beginPath()
          ctx.ellipse(t.x, t.y, sz * 0.55, sz * 0.42, 0, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = '#78350f'
          ctx.fillRect(t.x - sz * 0.09, t.y, sz * 0.18, sz * 0.45)
          ctx.fillStyle = '#14532d'
          ctx.beginPath()
          ctx.moveTo(t.x, t.y - sz)
          ctx.lineTo(t.x + sz * 0.6, t.y + sz * 0.12)
          ctx.lineTo(t.x - sz * 0.6, t.y + sz * 0.12)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = '#166534'
          ctx.beginPath()
          ctx.moveTo(t.x, t.y - sz * 0.55)
          ctx.lineTo(t.x + sz * 0.52, t.y + sz * 0.4)
          ctx.lineTo(t.x - sz * 0.52, t.y + sz * 0.4)
          ctx.closePath()
          ctx.fill()
        }
      }

      // tarmac, kerbs, dashed lane lines
      ctx.fillStyle = '#3f3f46'
      ctx.fillRect(roadX, -10, roadW, H + 20)
      const kb = 26
      for (let y = -kb * 2 + (s.scroll % (kb * 2)); y < H; y += kb * 2) {
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(roadX - 9, y, 9, kb)
        ctx.fillRect(roadX + roadW, y, 9, kb)
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(roadX - 9, y + kb, 9, kb)
        ctx.fillRect(roadX + roadW, y + kb, 9, kb)
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      const dash = 34
      const gap = 30
      for (let i = 1; i < LANES; i++) {
        const lx = roadX + laneW * i
        for (let y = -dash + (s.scroll % (dash + gap)); y < H; y += dash + gap) {
          ctx.fillRect(lx - 3, y, 6, dash)
        }
      }

      // boost pads: three pulsing chevrons painted on the lane
      ctx.save()
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const p of s.pads) {
        const px = laneX(p.lane)
        for (let k = 0; k < 3; k++) {
          const yy = p.y + k * 18
          ctx.globalAlpha = clamp(0.55 + 0.12 * k + 0.25 * Math.sin(now / 160 + k), 0.25, 1)
          ctx.beginPath()
          ctx.moveTo(px - laneW * 0.26, yy + 14)
          ctx.lineTo(px, yy)
          ctx.lineTo(px + laneW * 0.26, yy + 14)
          ctx.stroke()
        }
      }
      ctx.restore()

      // motion-blur streaks
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      for (const st of s.streaks) {
        ctx.beginPath()
        ctx.moveTo(st.x, st.y)
        ctx.lineTo(st.x, st.y + st.len)
        ctx.stroke()
      }
      ctx.restore()

      for (const p of s.smoke) {
        ctx.globalAlpha = clamp(p.life * 0.5, 0, 1)
        ctx.fillStyle = '#e2e8f0'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      for (const r of s.rivals) drawCar(laneX(r.lane), r.y, carW, carH, r.color, 0)

      if (boosting) {
        const glow = ctx.createRadialGradient(s.x, playerY, carW * 0.2, s.x, playerY, carW * 1.7)
        glow.addColorStop(0, 'rgba(253,224,71,0.4)')
        glow.addColorStop(1, 'rgba(253,224,71,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(s.x, playerY, carW * 1.7, 0, Math.PI * 2)
        ctx.fill()
      }
      drawCar(s.x, playerY, carW, carH, '#dc2626', s.tilt)

      for (const p of s.pops) {
        ctx.globalAlpha = clamp(p.life, 0, 1)
        ctx.font = `900 ${Math.round(carW * 0.55)}px Rubik, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.strokeText(p.text, p.x, p.y)
        ctx.fillStyle = '#fde047'
        ctx.fillText(p.text, p.x, p.y)
      }
      ctx.globalAlpha = 1

      /* ---- speedometer: dial, ticks, needle, and a turbo ring ---- */
      ctx.save()
      ctx.beginPath()
      ctx.arc(gx, gy, gr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(15,23,42,0.72)'
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.stroke()
      const a0 = Math.PI * 0.75
      const a1 = Math.PI * 2.25
      for (let i = 0; i <= 8; i++) {
        const a = a0 + ((a1 - a0) * i) / 8
        ctx.beginPath()
        ctx.moveTo(gx + Math.cos(a) * gr * 0.76, gy + Math.sin(a) * gr * 0.76)
        ctx.lineTo(gx + Math.cos(a) * gr * 0.92, gy + Math.sin(a) * gr * 0.92)
        ctx.strokeStyle = i > 5 ? '#f87171' : 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (boostLeft > 0) {
        ctx.beginPath()
        ctx.arc(gx, gy, gr - 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (boostLeft / BOOST_SEC))
        ctx.strokeStyle = pal.accent
        ctx.lineWidth = 4
        ctx.stroke()
      }
      const kmh = Math.round(s.speed * KMH)
      const na = a0 + (a1 - a0) * clamp(kmh / MAX_KMH, 0, 1)
      ctx.beginPath()
      ctx.moveTo(gx, gy)
      ctx.lineTo(gx + Math.cos(na) * gr * 0.7, gy + Math.sin(na) * gr * 0.7)
      ctx.strokeStyle = '#f87171'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(gx, gy, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `900 ${Math.round(gr * 0.42)}px Rubik, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(String(kmh), gx, gy + gr * 0.36)
      ctx.restore()

      if (s.shake > 0) {
        ctx.fillStyle = `rgba(255,255,255,${(s.shake * 0.3).toFixed(3)})`
        ctx.fillRect(-10, -10, W + 20, H + 20)
      }
      ctx.restore()

      setHud((h) => (h.score === s.score ? h : { score: s.score }))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      timers.clear()
      window.removeEventListener('resize', measure)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
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

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart} wrapRef={wrapRef}>
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ touchAction: 'none' }} />

      {gauge.r > 0 && (
        <span
          dir="rtl"
          className="absolute font-black text-white/70 pointer-events-none select-none"
          style={{
            left: gauge.x,
            top: gauge.y + gauge.r * 0.42,
            fontSize: Math.round(gauge.r * 0.26),
            transform: 'translateX(-50%)',
          }}
        >
          קמ״ש
        </span>
      )}

      {hint && !over && (
        <div className="absolute inset-x-0 top-[14%] flex justify-center px-4 pointer-events-none" dir="rtl">
          <div className="anim-fade-in bg-black/65 text-white font-black text-xl rounded-3xl px-6 py-4 text-center leading-snug">
            הזז את האצבע כדי לנהוג 🏎️
            <br />
            עקוף מכוניות ואסוף חצים לטורבו!
          </div>
        </div>
      )}

      {banner && (
        <div key={banner.id} className="absolute inset-x-0 top-[34%] flex justify-center pointer-events-none" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 text-3xl font-black italic rounded-3xl border-b-8 border-yellow-500 shadow-xl px-7 py-3">
            {banner.text}
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
