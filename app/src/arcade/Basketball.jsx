import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

const ROUND_SEC = 60
const AV_BASE = 200 // the doll svg is 200x320 — rendered once at this height, then CSS-scaled
const AV_W0 = AV_BASE * 0.625 // svg width at AV_BASE height
const MAX_DT = 0.034 // clamp frame delta (tab switches, hiccups)
const STEP = 0.008 // physics sub-step — stops a fast ball tunnelling through the rim
const PULL_K = 6.6 // drag length (px) -> launch speed (px/s)
const MIN_PULL = 14 // a shorter drag is a mis-tap, not a shot
const GRAV = 2.05 // gravity, in play-area heights per second^2
const SWISH = 50 // straight through, no metal
const BANK = 25 // dropped in after clanging off the rim, worth less than a swish
const STREAK_STEP = 10 // bonus per basket in a row
const STREAK_MAX = 4 // ...capped, so it never turns into pressure
const MAKE_MS = 780 // ball stays visible falling through the net
const MISS_MS = 820 // ...and bouncing on the floor
const FLIGHT_MAX = 6000 // ms before a stuck ball is handed back

const DEFAULT_PAL = {
  from: '#1e3a8a',
  to: '#0b1233',
  accent: '#67e8f9',
  deep: '#0d0733',
  confetti: ['#facc15', '#f472b6', '#67e8f9', '#a78bfa', '#34d399'],
}

// only theme.vars / theme.confetti — never theme.arcade.<key>
function paletteOf(theme) {
  const v = theme?.vars ?? {}
  return {
    from: v['--t-bg-from'] ?? DEFAULT_PAL.from,
    to: v['--t-bg-to'] ?? DEFAULT_PAL.to,
    accent: v['--t-accent'] ?? DEFAULT_PAL.accent,
    deep: v['--t-side-deep'] ?? DEFAULT_PAL.deep,
    confetti: theme?.confetti?.length ? theme.confetti : DEFAULT_PAL.confetti,
  }
}

// drag vector, capped at `max` px
function clampPull(dx, dy, max) {
  const d = Math.hypot(dx, dy)
  if (d <= max || d === 0) return { x: dx, y: dy }
  return { x: (dx / d) * max, y: (dy / d) * max }
}

// circle vs circle — push-out normal + depth, or null
function hitCircle(cx, cy, r, px, py, pr) {
  const dx = cx - px
  const dy = cy - py
  const d = Math.hypot(dx, dy)
  if (d > r + pr) return null
  if (d === 0) return { nx: 0, ny: -1, push: r + pr }
  return { nx: dx / d, ny: dy / d, push: r + pr - d }
}

/**
 * Basketball — his doll stands on the court holding the ball. Drag back from
 * anywhere and let go: a faint dotted arc previews the shot, the ball flies on
 * simple gravity, and the hoop slides side to side (faster with every basket).
 * Straight through 50, in off the rim 25, plus a small streak bonus. 60s round.
 *
 * This is a face-on view: the backboard hangs behind the hoop and is painted
 * before the ball, so the ball always passes in front of it — only the two rim
 * ends are solid.
 *
 * All geometry is in CSS px (the canvas is scaled once by dpr), so the SVG doll
 * layered over the canvas shares one coordinate space with the physics.
 */
export default function Basketball({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const avatarRef = useRef(null)
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const palRef = useRef(paletteOf(theme))
  const [hud, setHud] = useState({ score: 0, time: ROUND_SEC })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [hint, setHint] = useState(true)
  const reportedRef = useRef(false)

  useEffect(() => {
    palRef.current = paletteOf(theme)
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const measure = () => {
      const r = wrap.getBoundingClientRect()
      const W = Math.max(200, r.width)
      const H = Math.max(240, r.height)
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS px from here on

      const floorY = H - Math.max(34, H * 0.07)
      const avH = Math.max(92, Math.min(180, H * 0.28))
      const rimW = Math.max(66, Math.min(124, W * 0.24))
      const boardW = rimW * 0.86
      const boardH = Math.max(42, H * 0.1)
      const boardTop = Math.max(10, H * 0.07)
      const rimY = boardTop + boardH + 10
      const pal = palRef.current
      return {
        W,
        H,
        floorY,
        avH,
        avW: avH * 0.625,
        ballR: Math.max(11, Math.min(19, H * 0.028)),
        rimW,
        rimRy: Math.max(5, rimW * 0.1),
        boardW,
        boardH,
        boardTop,
        rimY,
        ampX: Math.max(0, W / 2 - rimW * 0.62 - 8),
        maxPull: H * 0.3,
        gravity: GRAV * H,
        // a few faint spectators on the back wall
        crowd: Array.from({ length: 30 }, (_, i) => ({
          x: (0.04 + ((i * 0.137) % 0.92)) * W,
          y: rimY + boardH + 24 + ((i * 37) % Math.max(30, floorY - rimY - boardH - 110)),
          r: 4 + ((i * 5) % 4),
          c: pal.confetti[i % pal.confetti.length],
        })),
      }
    }

    const homeOf = (s) => ({
      x: Math.max(s.geo.ballR + 4, Math.min(s.geo.W - s.geo.ballR - 4, s.avX + s.geo.avW * 0.5)),
      y: s.geo.floorY - s.geo.avH * 0.58,
    })

    const geo0 = measure()
    g.current = {
      geo: geo0,
      score: 0,
      made: 0,
      streak: 0,
      hoopPhase: 0,
      hoopX: geo0.W / 2,
      avX: geo0.W / 2,
      avTargetX: geo0.W / 2,
      throwAt: -9999,
      makeAt: -9999,
      lastThud: 0,
      netWave: 0,
      drag: null,
      pops: [],
      bits: [],
      ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, flying: false, banked: false, scored: false, resetAt: 0, launchAt: 0 },
      startTs: performance.now(),
      last: performance.now(),
      done: false,
    }
    const h0 = homeOf(g.current)
    g.current.ball.x = h0.x
    g.current.ball.y = h0.y

    const onResize = () => {
      const s = g.current
      if (!s) return
      s.geo = measure()
      s.avX = Math.min(Math.max(s.geo.W * 0.24, s.avX), s.geo.W * 0.76)
      s.avTargetX = Math.min(Math.max(s.geo.W * 0.24, s.avTargetX), s.geo.W * 0.76)
      s.drag = null
    }
    window.addEventListener('resize', onResize)

    /* ---- controls: pull back anywhere, release to shoot (touch + mouse) ---- */
    const posOf = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e) => {
      const s = g.current
      if (!s || s.done || s.ball.flying) return
      const p = posOf(e)
      s.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y }
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch { /* not capturable — plain mouse events still work */ }
      sfx.click()
    }
    const onMove = (e) => {
      const s = g.current
      if (!s || !s.drag) return
      const p = posOf(e)
      s.drag.x = p.x
      s.drag.y = p.y
    }
    const release = (e) => {
      const s = g.current
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch { /* nothing captured */ }
      if (!s || !s.drag || s.done) {
        if (s) s.drag = null
        return
      }
      const d = s.drag
      s.drag = null
      const pull = clampPull(d.x - d.sx, d.y - d.sy, s.geo.maxPull)
      if (Math.hypot(pull.x, pull.y) < MIN_PULL) return // mis-tap: keep the ball
      const b = s.ball
      const home = homeOf(s)
      b.x = home.x + pull.x
      b.y = home.y + pull.y
      b.vx = -pull.x * PULL_K
      b.vy = -pull.y * PULL_K
      b.flying = true
      b.banked = false
      b.scored = false
      b.resetAt = 0
      b.launchAt = performance.now()
      s.throwAt = performance.now()
      setHint(false)
      sfx.pop()
    }
    const onCancel = (e) => {
      const s = g.current
      if (s) s.drag = null
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch { /* nothing captured */ }
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', onCancel)

    const pop = (x, y, text, color) => {
      g.current.pops.push({ x, y, text, color, born: performance.now() })
    }
    const burst = (x, y) => {
      const pal = palRef.current
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        g.current.bits.push({
          x,
          y,
          vx: Math.cos(a) * (60 + Math.random() * 90),
          vy: Math.sin(a) * (60 + Math.random() * 90) - 40,
          c: pal.confetti[i % pal.confetti.length],
          born: performance.now(),
        })
      }
    }

    const resetBall = () => {
      const s = g.current
      const b = s.ball
      b.flying = false
      b.vx = 0
      b.vy = 0
      b.spin = 0
      b.scored = false
      b.banked = false
      b.resetAt = 0
      // he strolls to a new spot so every shot is a fresh angle
      s.avTargetX = (0.24 + Math.random() * 0.52) * s.geo.W
    }

    // one physics sub-step: gravity, rim, board, walls, floor, and the basket test
    const stepBall = (s, dt, now) => {
      const b = s.ball
      const { W, H, floorY, rimY, rimW, gravity } = s.geo
      const R = s.geo.ballR
      const hoopX = s.hoopX
      const y0 = b.y

      b.vy += gravity * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.spin += b.vx * dt * 0.035

      // gentle guide: a descending ball close to the rim leans towards the middle
      if (b.vy > 0 && !b.scored && b.y > rimY - R * 3.2 && b.y < rimY && Math.abs(b.x - hoopX) < rimW * 0.7) {
        b.x += (hoopX - b.x) * Math.min(1, dt * 2.6)
      }

      const thud = () => {
        if (now - s.lastThud > 90) {
          s.lastThud = now
          sfx.thud()
        }
      }

      // the two rim ends are the only solid parts of the hoop
      for (const side of [-1, 1]) {
        const rim = hitCircle(b.x, b.y, R, hoopX + (side * rimW) / 2, rimY, 4)
        if (!rim) continue
        b.x += rim.nx * rim.push
        b.y += rim.ny * rim.push
        const dot = b.vx * rim.nx + b.vy * rim.ny
        b.vx = (b.vx - 2 * dot * rim.nx) * 0.6
        b.vy = (b.vy - 2 * dot * rim.ny) * 0.6
        b.rimmed = true // it still counts, just not as a clean one
        thud()
      }

      // through the hoop, downwards
      if (!b.scored && b.vy > 0 && y0 <= rimY && b.y > rimY && Math.abs(b.x - hoopX) < rimW / 2 - R * 0.5) {
        b.scored = true
        s.made += 1
        s.streak += 1
        const bonus = Math.min(STREAK_MAX, s.streak - 1) * STREAK_STEP
        const gain = (b.banked ? BANK : SWISH) + bonus
        s.score += gain
        s.netWave = 1
        s.makeAt = now
        b.resetAt = now + MAKE_MS
        b.vx *= 0.35
        pop(hoopX, rimY - 26, `+${gain}`, b.banked ? '#ffffff' : '#fde047')
        burst(hoopX, rimY + 8)
        if (b.banked) sfx.coin()
        else sfx.ding()
      }

      // side walls + ceiling keep the ball on court
      if (b.x < R) {
        b.x = R
        b.vx = Math.abs(b.vx) * 0.6
      } else if (b.x > W - R) {
        b.x = W - R
        b.vx = -Math.abs(b.vx) * 0.6
      }
      if (b.y < R) {
        b.y = R
        b.vy = Math.abs(b.vy) * 0.5
      }

      // floor
      if (b.y > floorY - R) {
        b.y = floorY - R
        if (!b.resetAt) {
          if (!b.scored) {
            s.streak = 0
            thud()
          }
          b.resetAt = now + MISS_MS
        }
        b.vy = -Math.abs(b.vy) * 0.45
        b.vx *= 0.82
        if (Math.abs(b.vy) < 40) b.vy = 0
      }
      if (b.y > H + 120 && !b.resetAt) b.resetAt = now
    }

    /* ---- draw ---- */
    const draw = (s, now) => {
      const P = palRef.current
      const { W, H, floorY, rimY, rimW, rimRy, boardW, boardH, boardTop, crowd } = s.geo
      const R = s.geo.ballR
      const b = s.ball
      const hoopX = s.hoopX

      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, P.to)
      grad.addColorStop(1, P.from)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // crowd on the back wall
      ctx.globalAlpha = 0.3
      for (const c of crowd) {
        ctx.fillStyle = c.c
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // court
      const wood = ctx.createLinearGradient(0, floorY, 0, H)
      wood.addColorStop(0, '#c2853f')
      wood.addColorStop(1, '#8a5a24')
      ctx.fillStyle = wood
      ctx.fillRect(0, floorY, W, H - floorY)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, floorY)
      ctx.lineTo(W, floorY)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.ellipse(W / 2, floorY, W * 0.42, Math.max(22, H * 0.07), 0, Math.PI, Math.PI * 2)
      ctx.stroke()

      // hoop: post, backboard, net, rim (back half behind the ball, front half in front)
      ctx.fillStyle = P.deep
      ctx.fillRect(hoopX - 5, 0, 10, boardTop + 8)
      ctx.fillRect(hoopX - 4, boardTop + boardH, 8, rimY - boardTop - boardH + 2)

      ctx.fillStyle = '#f8fafc'
      ctx.strokeStyle = P.accent
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.roundRect(hoopX - boardW / 2, boardTop, boardW, boardH, 6)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = '#ea580c'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(hoopX - boardW * 0.22, boardTop + boardH * 0.34, boardW * 0.44, boardH * 0.48, 3)
      ctx.stroke()

      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.ellipse(hoopX, rimY, rimW / 2, rimRy, 0, Math.PI, Math.PI * 2)
      ctx.stroke()

      const netH = rimW * 0.52
      const wave = s.netWave * 10
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i <= 7; i++) {
        const t = i / 7
        const tx = hoopX - rimW / 2 + rimW * t
        const bx = hoopX - rimW * 0.26 + rimW * 0.52 * t + Math.sin(t * Math.PI) * wave
        ctx.moveTo(tx, rimY)
        ctx.lineTo(bx, rimY + netH)
      }
      for (const f of [0.45, 0.8]) {
        const w = (rimW / 2) * (1 - f * 0.5)
        ctx.moveTo(hoopX - w, rimY + netH * f)
        ctx.lineTo(hoopX + w, rimY + netH * f)
      }
      ctx.stroke()

      // trajectory preview while pulling back
      if (s.drag) {
        const pull = clampPull(s.drag.x - s.drag.sx, s.drag.y - s.drag.sy, s.geo.maxPull)
        const home = homeOf(s)
        let px = home.x + pull.x
        let py = home.y + pull.y
        let vx = -pull.x * PULL_K
        let vy = -pull.y * PULL_K
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 3
        ctx.setLineDash([6, 8])
        ctx.beginPath()
        ctx.moveTo(home.x, home.y)
        ctx.lineTo(px, py)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#ffffff'
        for (let i = 0; i < 96; i++) {
          vy += s.geo.gravity * 0.016
          px += vx * 0.016
          py += vy * 0.016
          if (py > floorY - R || px < -20 || px > W + 20) break
          if (i % 5 !== 0) continue
          ctx.globalAlpha = Math.max(0.08, 0.5 - i * 0.005)
          ctx.beginPath()
          ctx.arc(px, py, R * 0.26, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // ball
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.spin)
      const skin = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.15, 0, 0, R)
      skin.addColorStop(0, '#fdba74')
      skin.addColorStop(1, '#ea580c')
      ctx.fillStyle = skin
      ctx.beginPath()
      ctx.arc(0, 0, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#7c2d12'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-R, 0)
      ctx.lineTo(R, 0)
      ctx.moveTo(0, -R)
      ctx.lineTo(0, R)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(0, 0, R * 0.55, R, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      // rim front half — the ball drops behind it
      ctx.strokeStyle = '#fb923c'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.ellipse(hoopX, rimY, rimW / 2, rimRy, 0, 0, Math.PI)
      ctx.stroke()

      // confetti bits + floating score
      for (const p of s.bits) {
        const age = (now - p.born) / 700
        ctx.globalAlpha = Math.max(0, 1 - age)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      for (const p of s.pops) {
        const age = (now - p.born) / 900
        ctx.globalAlpha = Math.max(0, 1 - age)
        ctx.fillStyle = p.color
        ctx.font = `900 ${Math.round(26 + R)}px Rubik, sans-serif`
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = 4
        ctx.strokeText(p.text, p.x, p.y - age * 40)
        ctx.fillText(p.text, p.x, p.y - age * 40)
      }
      ctx.globalAlpha = 1
    }

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, Math.max(0, (now - s.last) / 1000))
      s.last = now
      const timeLeft = Math.max(0, ROUND_SEC - (now - s.startTs) / 1000)

      // the hoop slides side to side, quicker with every basket
      s.hoopPhase += Math.min(1.5, 0.45 + s.made * 0.075) * dt
      s.hoopX = s.geo.W / 2 + s.geo.ampX * Math.sin(s.hoopPhase)

      // he walks to his next spot between shots
      s.avX += (s.avTargetX - s.avX) * Math.min(1, dt * 5)

      const b = s.ball
      if (b.flying) {
        let left = dt
        while (left > 0) {
          const step = Math.min(STEP, left)
          stepBall(s, step, now)
          left -= step
        }
        if (b.resetAt && now >= b.resetAt) resetBall()
        if (now - b.launchAt > FLIGHT_MAX) resetBall()
      } else {
        const home = homeOf(s)
        const pull = s.drag ? clampPull(s.drag.x - s.drag.sx, s.drag.y - s.drag.sy, s.geo.maxPull) : { x: 0, y: 0 }
        b.x = home.x + pull.x
        b.y = home.y + pull.y + (s.drag ? 0 : Math.sin(now / 520) * 2)
        b.spin = 0
      }

      s.netWave *= Math.max(0, 1 - dt * 4)
      s.pops = s.pops.filter((p) => now - p.born < 900)
      s.bits = s.bits.filter((p) => now - p.born < 700)
      for (const p of s.bits) {
        p.vy += s.geo.gravity * 0.35 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }

      draw(s, now)

      // the doll: leans into the pull, pops on release, jumps on a basket
      const el = avatarRef.current
      if (el) {
        const pullX = s.drag ? s.drag.x - s.drag.sx : 0
        let tilt = Math.max(-14, Math.min(14, -pullX * 0.06))
        let lift = Math.sin(now / 560) * 2
        let scale = s.geo.avH / AV_BASE
        const sinceThrow = now - s.throwAt
        if (sinceThrow < 240) scale *= 1 + 0.08 * Math.sin((sinceThrow / 240) * Math.PI)
        const sinceMake = now - s.makeAt
        if (sinceMake < 700) {
          const t = sinceMake / 700
          lift -= Math.sin(t * Math.PI) * s.geo.avH * 0.2
          tilt += Math.sin(t * Math.PI * 3) * 8
        }
        el.style.transform =
          `translate(${s.avX - AV_W0 / 2}px, ${s.geo.floorY - AV_BASE + lift}px) scale(${scale}) rotate(${tilt}deg)`
      }

      // HUD re-renders only when a visible value changes
      const tl = Math.ceil(timeLeft)
      setHud((h) => (h.score === s.score && h.time === tl ? h : { score: s.score, time: tl }))

      if (timeLeft <= 0) {
        s.done = true
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        else sfx.buzz()
        setOver({ score: s.score, isRecord })
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', release)
      canvas.removeEventListener('pointercancel', onCancel)
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

      {/* his doll, over the canvas — the loop writes the transform every frame */}
      <div
        ref={avatarRef}
        aria-label="טומי עם הכדור"
        className="absolute left-0 top-0 will-change-transform pointer-events-none drop-shadow-lg"
        style={{ width: AV_W0, height: AV_BASE, transformOrigin: '50% 100%' }}
      >
        <Avatar size={AV_BASE} />
      </div>

      {hint && (
        <div dir="rtl" className="absolute inset-x-0 top-[52%] flex justify-center px-4 pointer-events-none">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-2xl text-center px-6 py-3 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl">
            🏀 גררו אחורה ושחררו — קלעו לסל!
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
