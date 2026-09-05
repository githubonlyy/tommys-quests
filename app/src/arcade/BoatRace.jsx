import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const RACE_SEC = 75
const START_LIVES = 3
const GATE_POINTS = 20
const RING_POINTS = 5
const FINISH_BONUS = 50
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const MERCY_MS = 1100 // no-damage window after a crash
const BOOST_MS = 2200
const FINISH_LEAD = 4 // seconds before the clock runs out that the finish band drops in

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// deterministic pseudo-random — scenery keeps its shape while the river scrolls
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 11.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Boat Race — top-down river slalom. Drag left/right to steer the speedboat,
 * thread the buoy gates for +20, grab rings for a speed boost, and keep off the
 * banks and rocks. The river narrows and bends harder the longer he survives.
 */
export default function BoatRace({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  // the whole simulation lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const { theme } = useTheme()
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, time: RACE_SEC })
  const [over, setOver] = useState(null)
  const [banner, setBanner] = useState(null) // { id, text }
  const [intro, setIntro] = useState(true)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const accent = theme?.vars?.['--t-accent'] ?? '#f59e0b'

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const prevW = canvas.width
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      // keep the boat at the same relative spot across an orientation change
      const s = g.current
      if (s && prevW > 0) {
        const k = canvas.width / prevW
        s.boatX *= k
        s.targetX *= k
      }
    }
    resize()
    window.addEventListener('resize', resize)

    /* ---------- river geometry ----------
       The centreline is one long meander (F1) plus a tighter wiggle (F2).
       `amp` is capped so both banks always stay on screen, and grows with
       `prog` (0..1 race progress) while the channel itself narrows. */
    const F1 = (Math.PI * 2) / (1100 * dpr)
    const F2 = (Math.PI * 2) / (520 * dpr)
    const riverAt = (wy, prog) => {
      const W = canvas.width
      const halfW = W * (0.33 - 0.11 * prog)
      const amp = (W / 2 - halfW - W * 0.07) * (0.45 + 0.55 * prog)
      const shape = 0.62 * Math.sin(wy * F1) + 0.38 * Math.sin(wy * F2 + 1.7)
      return { cx: W / 2 + shape * amp, halfW }
    }

    const startTs = performance.now()
    g.current = {
      dist: 0, // world distance travelled upstream, in canvas px
      simTime: 0, // accumulated *clamped* dt — always <= wall-clock elapsed
      boatX: riverAt(0, 0).cx,
      targetX: riverAt(0, 0).cx,
      vx: 0,
      score: 0,
      lives: START_LIVES,
      streak: 0,
      gates: [],
      rocks: [],
      rings: [],
      wake: [],
      splash: [],
      pops: [],
      nextGate: 900 * dpr,
      nextRock: 2600 * dpr,
      nextRing: 1800 * dpr,
      mercyUntil: startTs + 1500,
      boostUntil: 0,
      flash: 0,
      lastWake: 0,
      finishWy: null,
      dragging: false,
      bannerId: 0,
      banner: null,
      introHidden: false,
      done: false,
    }

    const say = (text, ms, now) => {
      const s = g.current
      s.banner = { id: ++s.bannerId, text, until: now + ms }
      setBanner({ id: s.banner.id, text })
    }

    /* ---------- steering: finger position drives the boat, drag only ---------- */
    const pointAt = (e) => {
      const r = canvas.getBoundingClientRect()
      return (e.clientX - r.left) * dpr
    }
    const onDown = (e) => {
      e.preventDefault()
      const s = g.current
      if (!s || s.done) return
      s.dragging = true
      s.targetX = pointAt(e)
      canvas.setPointerCapture?.(e.pointerId)
      if (!s.introHidden) {
        s.introHidden = true
        setIntro(false)
      }
    }
    const onMove = (e) => {
      e.preventDefault()
      const s = g.current
      if (!s || s.done || !s.dragging) return
      s.targetX = pointAt(e)
    }
    const onUp = (e) => {
      e.preventDefault()
      const s = g.current
      if (s) s.dragging = false
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const finish = (won, now) => {
      const s = g.current
      if (s.done) return
      s.done = true
      if (won) {
        s.score += FINISH_BONUS
        sfx.ding()
        say('סיימת את המרוץ! 🏁', 1600, now)
      }
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      setHud({ score: s.score, lives: Math.max(0, s.lives), time: won ? 0 : Math.max(0, s.hudTime ?? 0) })
      setOver(won ? { score: s.score, isRecord, won: true } : { score: s.score, isRecord })
    }

    const crash = (now) => {
      const s = g.current
      if (now < s.mercyUntil || s.done) return false
      s.lives -= 1
      s.streak = 0
      s.mercyUntil = now + MERCY_MS
      s.flash = now
      s.boostUntil = 0
      sfx.thud()
      if (s.lives <= 0) {
        finish(false, now)
      } else {
        say('אוי! 💥', 800, now)
      }
      return true
    }

    let raf
    let last = startTs
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const W = canvas.width
      const H = canvas.height
      const boatY = H * 0.74
      const dt = Math.min(MAX_DT, (now - last) / 1000)
      last = now
      s.simTime += dt

      const elapsed = (now - startTs) / 1000
      const timeLeft = Math.max(0, RACE_SEC - elapsed)
      const prog = clamp(elapsed / RACE_SEC, 0, 1)
      const baseSpeed = (200 + 150 * prog) * dpr
      const boosting = now < s.boostUntil
      s.dist += baseSpeed * (boosting ? 1.55 : 1) * dt

      // auto-hide the opening hint even if he never lifts a finger
      if (!s.introHidden && elapsed > 5) {
        s.introHidden = true
        setIntro(false)
      }
      if (s.banner && now > s.banner.until) {
        s.banner = null
        setBanner(null)
      }

      /* ---------- steering ---------- */
      const prevX = s.boatX
      const step = clamp((s.targetX - s.boatX) * Math.min(1, dt * 11), -760 * dpr * dt, 760 * dpr * dt)
      s.boatX = clamp(s.boatX + step, 6 * dpr, W - 6 * dpr)
      s.vx = dt > 0 ? (s.boatX - prevX) / dt : 0

      const here = riverAt(s.dist, prog)
      const boatR = 13 * dpr
      const aheadWy = s.dist + boatY + 200 * dpr // spawn just past the top edge

      /* ---------- spawning ---------- */
      while (s.nextGate < aheadWy) {
        const wy = s.nextGate
        const { halfW } = riverAt(wy, prog)
        const gapHalf = Math.max(40 * dpr, halfW * (0.44 - 0.13 * prog))
        s.gates.push({
          wy,
          off: (Math.random() * 2 - 1) * Math.max(0, halfW - gapHalf - 14 * dpr),
          gapHalf,
          state: 0, // 0 pending, 1 passed, 2 missed
        })
        s.nextGate += (640 - 130 * prog) * dpr
      }
      while (s.nextRock < aheadWy) {
        let wy = s.nextRock
        // never park a rock right in a gate's mouth — that is not a fair choice
        if (s.gates.some((gate) => Math.abs(gate.wy - wy) < 150 * dpr)) wy += 180 * dpr
        if (elapsed > 8) {
          const { halfW } = riverAt(wy, prog)
          const r = (16 + Math.random() * 8) * dpr
          s.rocks.push({ wy, off: (Math.random() * 2 - 1) * (halfW - r - 10 * dpr), r, seed: Math.random() * 99 })
        }
        s.nextRock += (1300 - 520 * prog) * dpr
      }
      while (s.nextRing < aheadWy) {
        const wy = s.nextRing
        const { halfW } = riverAt(wy, prog)
        s.rings.push({ wy, off: (Math.random() * 2 - 1) * halfW * 0.7, r: 20 * dpr })
        s.nextRing += (1500 + Math.random() * 700) * dpr
      }

      /* ---------- gates ---------- */
      for (const gate of s.gates) {
        if (gate.state !== 0 || s.dist < gate.wy) continue
        const { cx, halfW } = riverAt(gate.wy, prog)
        const gx = cx + clamp(gate.off, -(halfW - gate.gapHalf - 8 * dpr), halfW - gate.gapHalf - 8 * dpr)
        if (Math.abs(s.boatX - gx) < gate.gapHalf) {
          gate.state = 1
          s.score += GATE_POINTS
          s.streak += 1
          sfx.ding()
          s.pops.push({ x: s.boatX, wy: s.dist, text: `+${GATE_POINTS}`, born: now, color: '#fde047' })
          if (s.streak === 3) say('רצף! 🔥', 900, now)
          else if (s.streak === 6) say('אלוף! 🏆', 900, now)
        } else {
          gate.state = 2
          s.streak = 0
        }
      }

      /* ---------- rings (speed boost) ---------- */
      for (const ring of s.rings) {
        if (ring.dead) continue
        const { cx, halfW } = riverAt(ring.wy, prog)
        const rx = cx + clamp(ring.off, -(halfW - ring.r), halfW - ring.r)
        if (Math.abs(s.boatX - rx) < ring.r + boatR && Math.abs(s.dist - ring.wy) < ring.r + 18 * dpr) {
          ring.dead = true
          s.score += RING_POINTS
          s.boostUntil = now + BOOST_MS
          sfx.coin()
          s.pops.push({ x: rx, wy: ring.wy, text: '⚡', born: now, color: '#67e8f9' })
        }
      }

      /* ---------- rocks ---------- */
      for (const rock of s.rocks) {
        if (rock.dead) continue
        const { cx, halfW } = riverAt(rock.wy, prog)
        const rx = cx + clamp(rock.off, -(halfW - rock.r), halfW - rock.r)
        const dx = s.boatX - rx
        const dy = s.dist - rock.wy
        const reach = rock.r + boatR
        if (dx * dx + dy * dy < reach * reach) {
          if (crash(now)) {
            rock.dead = true
            for (let i = 0; i < 12; i++) {
              s.splash.push({
                x: rx, wy: rock.wy,
                vx: (Math.random() * 2 - 1) * 260 * dpr,
                vwy: (Math.random() * 2 - 1) * 260 * dpr,
                born: now, life: 0.55, r: (3 + Math.random() * 4) * dpr,
              })
            }
          }
          if (s.done) return
        }
      }

      /* ---------- banks ---------- */
      if (Math.abs(s.boatX - here.cx) > here.halfW - boatR) {
        const side = s.boatX > here.cx ? 1 : -1
        s.boatX = here.cx + side * (here.halfW - boatR - 2 * dpr)
        s.targetX = s.boatX
        crash(now)
        if (s.done) return
      }

      /* ---------- wake + bow spray ---------- */
      if (now - s.lastWake > 40) {
        s.lastWake = now
        s.wake.push({ x: s.boatX, wy: s.dist - 26 * dpr, born: now })
      }
      if (Math.random() < (boosting ? 1 : 0.7)) {
        s.splash.push({
          x: s.boatX + (Math.random() * 2 - 1) * 12 * dpr,
          wy: s.dist + 22 * dpr,
          vx: (Math.random() * 2 - 1) * 110 * dpr - s.vx * 0.25,
          vwy: (30 + Math.random() * 60) * dpr,
          born: now, life: 0.45, r: (2 + Math.random() * 3) * dpr,
        })
      }
      for (const p of s.splash) {
        p.x += p.vx * dt
        p.wy += p.vwy * dt
        p.vwy -= p.vwy * 3 * dt
      }

      /* ---------- housekeeping: drop anything behind the boat ---------- */
      const cullWy = s.dist - (H - boatY) - 120 * dpr
      s.gates = s.gates.filter((o) => o.wy > cullWy)
      s.rocks = s.rocks.filter((o) => !o.dead && o.wy > cullWy)
      s.rings = s.rings.filter((o) => !o.dead && o.wy > cullWy)
      s.wake = s.wake.filter((o) => now - o.born < 1400 && o.wy > cullWy)
      s.splash = s.splash.filter((o) => now - o.born < o.life * 1000)
      s.pops = s.pops.filter((o) => now - o.born < 900)

      /* ---------- finish line ----------
         dt is clamped to MAX_DT, so on a device that sustains under ~29fps the
         boat covers less ground per wall-clock second than baseSpeed implies,
         while the HUD clock runs on real time. `pace` is the measured ratio of
         simulated to real time (1.0 on a healthy device, ~0.5 at 15fps), so the
         band drops where the boat will actually be when the clock hits zero
         instead of somewhere it can never reach. */
      if (s.finishWy === null && timeLeft <= FINISH_LEAD) {
        const pace = elapsed > 0 ? clamp(s.simTime / elapsed, 0.25, 1) : 1
        s.finishWy = s.dist + timeLeft * pace * baseSpeed
      }
      if (s.finishWy !== null && s.dist >= s.finishWy) {
        finish(true, now)
        return
      }
      // Belt and braces: the clock is the referee. Without this the race ran on
      // for seconds after the HUD read 0 — rocks still spawning, so a last life
      // (and the finish bonus) could be lost on a timer that already expired.
      if (timeLeft <= 0) {
        s.finishWy = s.dist
        finish(true, now)
        return
      }

      /* =================== draw =================== */
      const sy = (wy) => boatY - (wy - s.dist)

      const water = ctx.createLinearGradient(0, 0, 0, H)
      water.addColorStop(0, '#0e7490')
      water.addColorStop(0.55, '#0891b2')
      water.addColorStop(1, '#075985')
      ctx.fillStyle = water
      ctx.fillRect(0, 0, W, H)

      // drifting light streaks so the water reads as moving even when he stands still
      const STREAK = 110 * dpr
      const wyTop = s.dist + boatY
      const wyBot = wyTop - H
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      for (let n = Math.floor(wyBot / STREAK); n <= Math.ceil(wyTop / STREAK); n++) {
        const wy = n * STREAK
        const { cx, halfW } = riverAt(wy, prog)
        const x = cx + (hash(n) * 2 - 1) * halfW * 0.85
        const len = (18 + hash(n + 3) * 34) * dpr
        ctx.beginPath()
        ctx.ellipse(x + Math.sin(now / 900 + n) * 6 * dpr, sy(wy), len, 2.6 * dpr, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // wake ripples trailing the stern
      for (const wpt of s.wake) {
        const age = (now - wpt.born) / 1400
        ctx.strokeStyle = `rgba(255,255,255,${0.34 * (1 - age)})`
        ctx.lineWidth = 2.5 * dpr
        ctx.beginPath()
        ctx.ellipse(wpt.x, sy(wpt.wy), (8 + age * 40) * dpr, (4 + age * 12) * dpr, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // banks: sample the centreline down the screen and fill the land outside it
      const STEP = 10 * dpr
      const leftPts = []
      const rightPts = []
      for (let y = -STEP; y <= H + STEP; y += STEP) {
        const { cx, halfW } = riverAt(s.dist + boatY - y, prog)
        leftPts.push([cx - halfW, y])
        rightPts.push([cx + halfW, y])
      }
      const grass = ctx.createLinearGradient(0, 0, 0, H)
      grass.addColorStop(0, '#3f8b3a')
      grass.addColorStop(1, '#2b6b2d')
      ctx.fillStyle = grass
      ctx.beginPath()
      ctx.moveTo(0, -STEP)
      for (const [x, y] of leftPts) ctx.lineTo(x, y)
      ctx.lineTo(0, H + STEP)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(W, -STEP)
      for (const [x, y] of rightPts) ctx.lineTo(x, y)
      ctx.lineTo(W, H + STEP)
      ctx.closePath()
      ctx.fill()

      // sandy shore + surf line straddling each bank edge
      for (const pts of [leftPts, rightPts]) {
        ctx.strokeStyle = '#e6d3a3'
        ctx.lineWidth = 13 * dpr
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = 3 * dpr
        ctx.setLineDash([16 * dpr, 12 * dpr])
        ctx.lineDashOffset = -(s.dist % (28 * dpr))
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.stroke()
        ctx.setLineDash([])
      }

      // trees on the banks
      const TREE = 150 * dpr
      for (let n = Math.floor(wyBot / TREE); n <= Math.ceil(wyTop / TREE); n++) {
        const wy = n * TREE
        const { cx, halfW } = riverAt(wy, prog)
        const side = hash(n) < 0.5 ? -1 : 1
        const x = cx + side * (halfW + (26 + hash(n + 5) * 90) * dpr)
        if (x < -30 * dpr || x > W + 30 * dpr) continue
        const y = sy(wy)
        const r = (13 + hash(n + 9) * 9) * dpr
        ctx.fillStyle = 'rgba(0,0,0,0.20)'
        ctx.beginPath()
        ctx.ellipse(x + 4 * dpr, y + 5 * dpr, r, r * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1f7a35'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.arc(x - r * 0.6, y + r * 0.4, r * 0.7, 0, Math.PI * 2)
        ctx.arc(x + r * 0.6, y + r * 0.3, r * 0.65, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.42, 0, Math.PI * 2)
        ctx.fill()
      }

      // finish band
      if (s.finishWy !== null) {
        const y = sy(s.finishWy)
        const { cx, halfW } = riverAt(s.finishWy, prog)
        const sq = 22 * dpr
        for (let i = -1; i * sq < halfW * 2 + sq; i++) {
          for (let row = 0; row < 2; row++) {
            ctx.fillStyle = (i + row) % 2 === 0 ? '#ffffff' : '#111827'
            ctx.fillRect(cx - halfW + i * sq, y - sq + row * sq, sq, sq)
          }
        }
      }

      // rings
      for (const ring of s.rings) {
        const { cx, halfW } = riverAt(ring.wy, prog)
        const rx = cx + clamp(ring.off, -(halfW - ring.r), halfW - ring.r)
        const y = sy(ring.wy)
        const pulse = 1 + Math.sin(now / 200 + ring.wy) * 0.09
        ctx.strokeStyle = accent
        ctx.lineWidth = 7 * dpr
        ctx.beginPath()
        ctx.ellipse(rx, y, ring.r * pulse, ring.r * 0.72 * pulse, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2.5 * dpr
        ctx.beginPath()
        ctx.ellipse(rx, y, ring.r * 0.72 * pulse, ring.r * 0.5 * pulse, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // gates: red buoy left, green buoy right, dashed line across the mouth
      for (const gate of s.gates) {
        const { cx, halfW } = riverAt(gate.wy, prog)
        const lim = Math.max(0, halfW - gate.gapHalf - 8 * dpr)
        const gx = cx + clamp(gate.off, -lim, lim)
        const y = sy(gate.wy)
        const bob = Math.sin(now / 320 + gate.wy) * 2.5 * dpr
        ctx.strokeStyle = gate.state === 1 ? 'rgba(253,224,71,0.95)' : gate.state === 2 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 3 * dpr
        ctx.setLineDash([9 * dpr, 8 * dpr])
        ctx.beginPath()
        ctx.moveTo(gx - gate.gapHalf, y)
        ctx.lineTo(gx + gate.gapHalf, y)
        ctx.stroke()
        ctx.setLineDash([])
        for (const side of [-1, 1]) {
          const bx = gx + side * gate.gapHalf
          const br = 12 * dpr
          ctx.fillStyle = 'rgba(0,0,0,0.25)'
          ctx.beginPath()
          ctx.ellipse(bx + 3 * dpr, y + 6 * dpr, br, br * 0.55, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = gate.state === 1 ? '#fbbf24' : side < 0 ? '#ef4444' : '#22c55e'
          ctx.beginPath()
          ctx.arc(bx, y + bob, br, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.fillRect(bx - br, y + bob - 2.5 * dpr, br * 2, 5 * dpr)
          ctx.strokeStyle = 'rgba(15,23,42,0.55)'
          ctx.lineWidth = 2.5 * dpr
          ctx.beginPath()
          ctx.arc(bx, y + bob, br, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // rocks with a foam collar on the upstream side
      for (const rock of s.rocks) {
        const { cx, halfW } = riverAt(rock.wy, prog)
        const rx = cx + clamp(rock.off, -(halfW - rock.r), halfW - rock.r)
        const y = sy(rock.wy)
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'
        ctx.lineWidth = 3 * dpr
        ctx.beginPath()
        ctx.arc(rx, y, rock.r + 6 * dpr + Math.sin(now / 260 + rock.seed) * 2 * dpr, Math.PI * 0.15, Math.PI * 0.85)
        ctx.stroke()
        ctx.fillStyle = '#64748b'
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          const rr = rock.r * (0.78 + hash(rock.seed + i) * 0.42)
          const px = rx + Math.cos(a) * rr
          const py = y + Math.sin(a) * rr * 0.8
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 2.5 * dpr
        ctx.stroke()
        ctx.fillStyle = '#94a3b8'
        ctx.beginPath()
        ctx.ellipse(rx - rock.r * 0.2, y - rock.r * 0.25, rock.r * 0.4, rock.r * 0.26, -0.4, 0, Math.PI * 2)
        ctx.fill()
      }

      /* ---------- the boat ---------- */
      ctx.save()
      ctx.translate(s.boatX, boatY)
      ctx.rotate(clamp(s.vx / (900 * dpr), -0.42, 0.42))
      if (now < s.mercyUntil && Math.floor(now / 90) % 2 === 0) ctx.globalAlpha = 0.4

      // foam V spraying off the stern
      ctx.fillStyle = `rgba(255,255,255,${boosting ? 0.55 : 0.4})`
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(side * 9 * dpr, 16 * dpr)
        ctx.quadraticCurveTo(side * 26 * dpr, 44 * dpr, side * 14 * dpr, (boosting ? 84 : 62) * dpr)
        ctx.quadraticCurveTo(side * 8 * dpr, 42 * dpr, side * 2 * dpr, 18 * dpr)
        ctx.closePath()
        ctx.fill()
      }

      const L = 48 * dpr
      const B = 13 * dpr
      ctx.beginPath()
      ctx.moveTo(0, -L * 0.56)
      ctx.bezierCurveTo(B * 0.85, -L * 0.34, B, -L * 0.05, B * 0.92, L * 0.3)
      ctx.lineTo(B * 0.8, L * 0.44)
      ctx.lineTo(-B * 0.8, L * 0.44)
      ctx.lineTo(-B * 0.92, L * 0.3)
      ctx.bezierCurveTo(-B, -L * 0.05, -B * 0.85, -L * 0.34, 0, -L * 0.56)
      ctx.closePath()
      ctx.fillStyle = '#f8fafc'
      ctx.fill()
      ctx.save()
      ctx.clip()
      ctx.fillStyle = accent
      ctx.fillRect(-B, -L * 0.2, B * 2, L * 0.16)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(-B * 0.7, L * 0.02, B * 1.4, L * 0.3)
      ctx.restore()
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3 * dpr
      ctx.stroke()
      // windshield
      ctx.fillStyle = '#7dd3fc'
      ctx.beginPath()
      ctx.ellipse(0, -L * 0.02, B * 0.62, L * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      ctx.restore()

      // bow spray + rock splash
      for (const p of s.splash) {
        const a = 1 - (now - p.born) / (p.life * 1000)
        ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`
        ctx.beginPath()
        ctx.arc(p.x, sy(p.wy), p.r * (1 + (1 - a)), 0, Math.PI * 2)
        ctx.fill()
      }

      // floating score pops
      ctx.textAlign = 'center'
      ctx.font = `900 ${20 * dpr}px Rubik, sans-serif`
      for (const p of s.pops) {
        const a = 1 - (now - p.born) / 900
        ctx.globalAlpha = clamp(a, 0, 1)
        ctx.fillStyle = p.color
        ctx.strokeStyle = 'rgba(15,23,42,0.7)'
        ctx.lineWidth = 4 * dpr
        const py = sy(p.wy) - (1 - a) * 46 * dpr
        ctx.strokeText(p.text, p.x, py)
        ctx.fillText(p.text, p.x, py)
      }
      ctx.globalAlpha = 1

      if (boosting) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 3 * dpr
        for (let i = 0; i < 6; i++) {
          const x = ((now / 2 + i * 137) % W)
          const y = ((now / 1.2 + i * 311) % H)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + 26 * dpr)
          ctx.stroke()
        }
      }
      if (now - s.flash < 240) {
        ctx.fillStyle = 'rgba(239,68,68,0.28)'
        ctx.fillRect(0, 0, W, H)
      }

      const tLeft = Math.ceil(timeLeft)
      s.hudTime = tLeft
      setHud((h) =>
        h.score === s.score && h.lives === s.lives && h.time === tLeft
          ? h
          : { score: s.score, lives: Math.max(0, s.lives), time: tLeft },
      )
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

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart} wrapRef={wrapRef}>
      <canvas ref={canvasRef} className="absolute inset-0 touch-none select-none" style={{ touchAction: 'none' }} />

      {banner && (
        <div key={banner.id} className="absolute inset-x-0 top-[22%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-pop bg-white/95 text-slate-800 text-3xl font-black italic rounded-3xl border-b-8 border-cyan-600 shadow-xl px-7 py-4">
            {banner.text}
          </div>
        </div>
      )}

      {intro && (
        <div className="absolute inset-x-0 bottom-[16%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-fade-in bg-black/65 text-white text-xl font-black rounded-2xl px-5 py-3 text-center leading-snug">
            גרור ימינה ושמאלה כדי לנווט 🚤
            <br />
            עבור בין המצופים ואסוף טבעות!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
