import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'
import Avatar from '../avatar/Avatar.jsx'

/**
 * Runner — endless runner. Tommy runs on the spot on the left while the world
 * scrolls right to left. Tap anywhere to jump (a second tap mid-air does
 * nothing), press and drag down to slide under a hanging beam. One life; the
 * score is distance + coins. Sky, ground and obstacle colours come from the
 * active world's CSS vars.
 *
 * The canvas is sized like CoinRush (backing store x dpr) but the context is
 * scaled once per resize, so every simulation value below is in CSS pixels —
 * that lets the DOM <Avatar> overlay share the canvas coordinate space the way
 * Drive.jsx layers its doll over the road.
 */

const ROUND_SEC = 90 // hard cap: a round is 45-90s
const MAX_DT = 0.05 // clamp frame delta (tab switches, hiccups)
const GRACE_SEC = 1.5 // empty runway before the first obstacle
const BAR_AFTER_SEC = 9 // only jumps for the first stretch, then beams appear
const CRASH_MS = 800 // crash animation before the game-over card
const HINT_MS = 5000
const TOAST_MS = 2400
const DRAG_PX = 24 // downward drag that means "slide"
const CONVERT_MS = 230 // a jump this fresh can still turn into a slide
const SLIDE_MIN_MS = 400 // a flick still gives a usable slide
const SLIDE_MAX_MS = 1900 // never let a held finger lock him down forever
const COIN_POINTS = 10
const CLEAR_POINTS = 5
const PX_PER_POINT = 60 // distance scoring
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'

// runner metrics, all in "units" (unit = the avatar's height in px)
const RUN_H = 0.92
const SLIDE_H = 0.42
const HALF_W = 0.22 // forgiving: hitbox is far narrower than the doll
const BAR_CLEAR = 0.6 // gap under a beam — above SLIDE_H, below RUN_H
const jumpV = (u) => 9.2 * u // apex ~1.6 units, ~0.71s of air
const gravity = (u) => 26 * u
const speedAt = (u, t) => u * (3.1 + 2.3 * Math.min(1, t / 65))

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function Runner({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const heroRef = useRef(null)
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, time: ROUND_SEC, lives: 1, maxLives: 1 })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [heroSize, setHeroSize] = useState(88)
  const [hint, setHint] = useState(true)
  const [toast, setToast] = useState(null)
  const reportedRef = useRef(false)

  // world colours — vars/confetti/particles only, never theme.arcade
  const palette = useMemo(() => {
    const v = theme?.vars ?? {}
    return {
      skyTop: v['--t-bg-to'] ?? '#0f172a',
      skyLow: v['--t-bg-from'] ?? '#3b82f6',
      ground: v['--t-side-deep'] ?? '#0f172a',
      groundSoft: v['--t-side'] ?? '#1e293b',
      accent: v['--t-accent'] ?? '#fde047',
      accentDeep: v['--t-accent-deep'] ?? '#b45309',
      confetti: theme?.confetti?.length ? theme.confetti : ['#fde047', '#f472b6', '#38bdf8', '#ffffff'],
      scenery: theme?.particles?.length ? theme.particles : ['⭐', '✨', '☁️'],
    }
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
      worldX: 0,
      elapsed: 0,
      airY: 0, // height above the ground line
      vy: 0,
      runPhase: 0,
      sliding: false,
      slideFrom: 0,
      slideUntil: 0,
      slideOnLand: false,
      pointerDown: false,
      downY: 0,
      downAt: 0,
      dragUsed: false,
      obstacles: [],
      coins: [],
      bits: [], // dust + sparkles
      pops: [], // floating "+10"
      lastKind: null,
      sawBar: false,
      nextSpawn: 0,
      score: 0, // distance + bonus, recomputed every frame
      bonus: 0, // coins and cleared obstacles
      crashAt: 0,
      finished: false,
      done: false,
      last: performance.now(),
    }

    // canvas sizing + geometry; ctx is scaled so the sim works in CSS px
    const measure = () => {
      const r = wrap.getBoundingClientRect()
      const W = Math.max(1, r.width)
      const H = Math.max(1, r.height)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const unit = clamp(Math.min(H * 0.2, W * 0.2), 48, 112)
      g.current.geo = {
        W,
        H,
        unit,
        groundY: H - Math.max(58, H * 0.15),
        runnerX: Math.max(58, W * 0.22),
      }
      setHeroSize((u) => (Math.abs(u - unit) < 0.5 ? u : unit))
    }
    measure()
    window.addEventListener('resize', measure)

    /* ---- controls: tap = jump, drag down = slide ---- */
    const jump = () => {
      const s = g.current
      if (!s || s.done || s.crashAt || s.airY > 0) return // mid-air taps do nothing
      s.sliding = false
      s.airY = 0.01
      s.vy = jumpV(s.geo.unit)
      sfx.pop()
    }

    const slide = (now) => {
      const s = g.current
      if (!s || s.done || s.crashAt || s.sliding) return
      s.airY = 0
      s.vy = 0
      s.sliding = true
      s.slideFrom = now
      s.slideUntil = now + SLIDE_MIN_MS
      sfx.flip()
    }

    const onDown = (e) => {
      const s = g.current
      if (!s || s.done) return
      s.pointerDown = true
      s.downY = e.clientY
      s.downAt = performance.now()
      s.dragUsed = false
      if (s.sliding) {
        if (s.downAt - s.slideFrom < SLIDE_MIN_MS) return // let the slide finish first
        s.sliding = false // a fresh tap always gets him back on his feet
      }
      jump()
    }

    const onMove = (e) => {
      const s = g.current
      if (!s || s.done || !s.pointerDown || s.dragUsed) return
      if (e.clientY - s.downY < DRAG_PX) return
      s.dragUsed = true
      const now = performance.now()
      if (now - s.downAt < CONVERT_MS) {
        // the drag was the real intent — undo the hop it just started
        s.airY = 0
        s.vy = 0
      }
      if (s.airY > 0) {
        s.vy = Math.min(s.vy, -0.35 * jumpV(s.geo.unit)) // drop fast, then slide on landing
        s.slideOnLand = true
      } else {
        slide(now)
      }
    }

    const onUp = () => {
      const s = g.current
      if (s) s.pointerDown = false
    }

    // keyboard is a desktop bonus only — everything works with pointer alone
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp') jump()
      else if (e.key === 'ArrowDown') slide(performance.now())
      else return
      e.preventDefault()
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)

    later(() => setHint(false), HINT_MS)

    /* ---- spawning: gaps are measured in seconds of travel, so ramping the
       speed never shortens the player's reaction time ---- */
    const addCoinArc = (x, baseH, n, spread, peak) => {
      const s = g.current
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0.5 : i / (n - 1)
        s.coins.push({
          x: x + (k - 0.5) * spread,
          hy: baseH + Math.sin(k * Math.PI) * peak,
          ph: Math.random() * Math.PI,
          dead: false,
        })
      }
    }

    const spawn = () => {
      const s = g.current
      const { W, unit } = s.geo
      const x = W + 40
      const canBar = s.elapsed > BAR_AFTER_SEC && s.lastKind !== 'bar'
      const roll = Math.random()
      const kind = roll < 0.5 ? 'block' : canBar && roll < 0.78 ? 'bar' : 'coins'

      if (kind === 'block') {
        const w = unit * rnd(0.4, 0.6)
        const h = unit * rnd(0.4, 0.62)
        s.obstacles.push({ kind: 'block', x, w, h, cleared: false })
        if (Math.random() < 0.55) addCoinArc(x + w / 2, h + unit * 0.55, 5, unit * 2.2, unit * 0.5)
      } else if (kind === 'bar') {
        const w = unit * rnd(0.5, 0.7)
        s.obstacles.push({ kind: 'bar', x, w, h: 0, cleared: false })
        if (!s.sawBar) {
          s.sawBar = true
          setToast('גררו למטה!')
          later(() => setToast(null), TOAST_MS)
        }
      } else {
        addCoinArc(x + unit, unit * 0.5, 4, unit * 1.6, unit * 0.15)
      }
      s.lastKind = kind
    }

    /* ---- helpers ---- */
    const bits = (x, y, colors, n, up) => {
      const s = g.current
      for (let i = 0; i < n; i++) {
        s.bits.push({
          x,
          y,
          vx: rnd(-70, 40),
          vy: rnd(-up, -up * 0.25),
          r: rnd(2, 4.5),
          life: rnd(0.3, 0.7),
          age: 0,
          c: colors[Math.floor(Math.random() * colors.length)],
        })
      }
    }

    const finish = () => {
      const s = g.current
      if (!s || s.finished) return
      s.finished = true
      s.done = true
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      setHud({ score: s.score, time: Math.max(0, Math.ceil(ROUND_SEC - s.elapsed)), lives: s.crashAt ? 0 : 1, maxLives: 1 })
      setOver({ score: s.score, isRecord })
    }

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now
      const pal = palRef.current
      const { W, H, unit, groundY, runnerX } = s.geo
      const crashing = s.crashAt > 0
      const crashP = crashing ? clamp((now - s.crashAt) / CRASH_MS, 0, 1) : 0

      if (!crashing) s.elapsed += dt
      const timeLeft = Math.max(0, ROUND_SEC - s.elapsed)
      const speed = crashing ? speedAt(unit, s.elapsed) * (1 - crashP) : speedAt(unit, s.elapsed)
      s.worldX += speed * dt

      /* ---- runner ---- */
      if (!crashing) {
        if (s.airY > 0 || s.vy > 0) {
          s.vy -= gravity(unit) * dt
          s.airY += s.vy * dt
          if (s.airY <= 0) {
            s.airY = 0
            s.vy = 0
            bits(runnerX, groundY, ['#ffffff'], 5, 60)
            sfx.click()
            if (s.slideOnLand && s.pointerDown) slide(now)
            s.slideOnLand = false
          }
        }
        if (s.sliding && ((!s.pointerDown && now >= s.slideUntil) || now - s.slideFrom > SLIDE_MAX_MS)) {
          s.sliding = false
        }
        s.runPhase += dt * (6 + speed / unit)
        if (s.airY === 0 && Math.random() < 0.5) {
          bits(runnerX - unit * 0.25, groundY, ['#ffffff'], 1, s.sliding ? 45 : 25)
        }
      }

      const runH = s.sliding ? SLIDE_H * unit : RUN_H * unit
      const foot = groundY - s.airY
      const box = { x0: runnerX - HALF_W * unit, x1: runnerX + HALF_W * unit, y0: foot - runH, y1: foot }

      /* ---- world ---- */
      if (!crashing && s.elapsed > GRACE_SEC && s.worldX >= s.nextSpawn) {
        spawn()
        s.nextSpawn = s.worldX + speed * rnd(1.15, 1.75)
      }

      for (const o of s.obstacles) {
        o.x -= speed * dt
        if (crashing) continue
        const ox0 = o.x + 4
        const ox1 = o.x + o.w - 4
        const overlapX = box.x1 > ox0 && box.x0 < ox1
        const hit =
          o.kind === 'block'
            ? overlapX && box.y1 > groundY - o.h + 4
            : overlapX && box.y0 < groundY - BAR_CLEAR * unit - 4
        if (hit) {
          s.crashAt = now
          s.pointerDown = false
          sfx.thud()
          sfx.buzz()
          bits(runnerX, foot - runH / 2, ['#ffffff', ...pal.confetti], 16, 220)
          break
        }
        if (!o.cleared && ox1 < box.x0) {
          o.cleared = true
          s.bonus += CLEAR_POINTS
          s.pops.push({ x: runnerX, hy: unit * 1.1, life: 0, txt: `+${CLEAR_POINTS}` })
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -60)

      for (const c of s.coins) {
        c.x -= speed * dt
        c.ph += dt * 6
        if (crashing || c.dead) continue
        const cy = groundY - c.hy
        const near = Math.abs(c.x - runnerX) < unit * 0.36
        if (near && cy > box.y0 - unit * 0.14 && cy < box.y1 + unit * 0.12) {
          c.dead = true
          s.bonus += COIN_POINTS
          sfx.coin()
          bits(c.x, cy, pal.confetti, 6, 120)
          s.pops.push({ x: c.x, hy: c.hy + unit * 0.3, life: 0, txt: `+${COIN_POINTS}` })
        }
      }
      s.coins = s.coins.filter((c) => !c.dead && c.x > -40)

      for (const b of s.bits) {
        b.age += dt
        b.vy += 420 * dt
        b.x += (b.vx - speed * 0.35) * dt
        b.y += b.vy * dt
      }
      s.bits = s.bits.filter((b) => b.age < b.life)
      for (const p of s.pops) {
        p.life += dt
        p.x -= speed * dt
      }
      s.pops = s.pops.filter((p) => p.life < 0.9)

      // score = distance travelled + pickups/clears
      if (!crashing) s.score = Math.floor(s.worldX / PX_PER_POINT) + s.bonus

      /* ---- draw ---- */
      ctx.save()
      if (crashing) ctx.translate(rnd(-4, 4) * (1 - crashP), rnd(-4, 4) * (1 - crashP))

      const sky = ctx.createLinearGradient(0, 0, 0, groundY)
      sky.addColorStop(0, pal.skyTop)
      sky.addColorStop(1, pal.skyLow)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = 'rgba(255,255,255,0.13)'
      ctx.beginPath()
      ctx.arc(W * 0.78, groundY * 0.26, unit * 0.55, 0, Math.PI * 2)
      ctx.fill()

      // scrolling scenery emoji (far parallax)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const stepS = Math.max(150, W / 3)
      const offS = (s.worldX * 0.18) % stepS
      for (let i = -1; i * stepS - offS < W + stepS; i++) {
        const px = i * stepS - offS
        const idx = ((i % pal.scenery.length) + pal.scenery.length) % pal.scenery.length
        const size = unit * (0.34 + (idx % 3) * 0.08)
        ctx.globalAlpha = 0.55
        ctx.font = `${size}px ${EMOJI_FONT}`
        ctx.fillText(pal.scenery[idx], px, groundY - unit * (1.5 + (idx % 4) * 0.55))
        ctx.globalAlpha = 1
      }

      // two hill layers, drawn as one path each so overlaps do not seam
      const hills = (par, step, amp, color) => {
        const off = (s.worldX * par) % step
        ctx.fillStyle = color
        ctx.beginPath()
        for (let x = -off - step; x < W + step; x += step) {
          ctx.moveTo(x, groundY)
          ctx.arc(x + step / 2, groundY, amp, Math.PI, 0)
          ctx.closePath()
        }
        ctx.fill()
      }
      hills(0.22, unit * 3.4, unit * 1.15, 'rgba(0,0,0,0.16)')
      hills(0.45, unit * 2.1, unit * 0.7, 'rgba(0,0,0,0.26)')

      // ground
      ctx.fillStyle = pal.ground
      ctx.fillRect(0, groundY, W, H - groundY)
      ctx.fillStyle = pal.accentDeep
      ctx.fillRect(0, groundY, W, Math.max(4, unit * 0.06))
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      const stepG = unit * 0.8
      const offG = s.worldX % stepG
      for (let x = -offG; x < W; x += stepG) ctx.fillRect(x, groundY + unit * 0.22, stepG * 0.45, Math.max(3, unit * 0.05))
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      const offG2 = (s.worldX * 0.6) % (stepG * 1.7)
      for (let x = -offG2; x < W; x += stepG * 1.7) ctx.fillRect(x, groundY + unit * 0.5, stepG * 0.7, Math.max(3, unit * 0.05))

      // obstacles
      ctx.lineWidth = Math.max(2, unit * 0.03)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      for (const o of s.obstacles) {
        if (o.kind === 'block') {
          const top = groundY - o.h
          ctx.fillStyle = pal.accentDeep
          ctx.beginPath()
          ctx.roundRect(o.x, top, o.w, o.h, unit * 0.09)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = pal.accent
          ctx.beginPath()
          ctx.roundRect(o.x + o.w * 0.14, top + o.h * 0.13, o.w * 0.72, Math.max(4, o.h * 0.16), unit * 0.04)
          ctx.fill()
        } else {
          const bottom = groundY - BAR_CLEAR * unit
          const lipH = Math.max(14, unit * 0.22)
          ctx.fillStyle = pal.accentDeep
          ctx.fillRect(o.x + o.w * 0.22, 0, o.w * 0.56, bottom - lipH)
          ctx.strokeRect(o.x + o.w * 0.22, -4, o.w * 0.56, bottom - lipH + 4)
          ctx.fillStyle = pal.accent
          ctx.beginPath()
          ctx.roundRect(o.x, bottom - lipH, o.w, lipH, unit * 0.05)
          ctx.fill()
          ctx.stroke()
          ctx.save()
          ctx.beginPath()
          ctx.rect(o.x, bottom - lipH, o.w, lipH)
          ctx.clip()
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'
          ctx.lineWidth = Math.max(3, unit * 0.05)
          for (let x = o.x - lipH; x < o.x + o.w + lipH; x += lipH * 0.7) {
            ctx.beginPath()
            ctx.moveTo(x, bottom)
            ctx.lineTo(x + lipH, bottom - lipH)
            ctx.stroke()
          }
          ctx.restore()
          ctx.lineWidth = Math.max(2, unit * 0.03)
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'
        }
      }

      // coins — squashed on the x axis so they read as spinning
      const cr = unit * 0.14
      for (const c of s.coins) {
        const cy = groundY - c.hy
        ctx.save()
        ctx.translate(c.x, cy)
        ctx.scale(Math.max(0.22, Math.abs(Math.cos(c.ph))), 1)
        ctx.fillStyle = '#facc15'
        ctx.strokeStyle = '#a16207'
        ctx.lineWidth = Math.max(2, unit * 0.028)
        ctx.beginPath()
        ctx.arc(0, 0, cr, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, cr * 0.45, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // shadow under the runner
      ctx.fillStyle = `rgba(0,0,0,${0.3 * clamp(1 - s.airY / (unit * 1.6), 0.15, 1)})`
      ctx.beginPath()
      ctx.ellipse(runnerX, groundY + unit * 0.05, unit * 0.3 * clamp(1 - s.airY / (unit * 2.4), 0.4, 1), unit * 0.08, 0, 0, Math.PI * 2)
      ctx.fill()

      for (const b of s.bits) {
        ctx.globalAlpha = clamp(1 - b.age / b.life, 0, 1)
        ctx.fillStyle = b.c
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      ctx.font = `900 ${unit * 0.28}px Rubik, system-ui, sans-serif`
      ctx.textAlign = 'center'
      for (const p of s.pops) {
        ctx.globalAlpha = clamp(1 - p.life / 0.9, 0, 1)
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = Math.max(3, unit * 0.045)
        const py = groundY - p.hy - p.life * unit * 0.6
        ctx.strokeText(p.txt, p.x, py)
        ctx.fillText(p.txt, p.x, py)
      }
      ctx.globalAlpha = 1

      if (crashing) {
        ctx.fillStyle = `rgba(239,68,68,${0.3 * (1 - crashP)})`
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()

      /* ---- the doll, layered over the canvas as DOM ---- */
      const hero = heroRef.current
      if (hero) {
        const bob = s.airY > 0 || s.sliding || crashing ? 0 : Math.abs(Math.sin(s.runPhase)) * unit * 0.05
        let rot
        if (crashing) rot = -(18 + 62 * crashP)
        else if (s.sliding) rot = -76
        else if (s.airY > 0) rot = clamp((-s.vy / jumpV(unit)) * 11, -11, 11)
        else rot = Math.sin(s.runPhase) * 5
        const hx = runnerX - (unit * 0.625) / 2
        const hy = groundY - unit - s.airY - bob + (s.sliding ? unit * 0.06 : 0)
        hero.style.transform = `translate3d(${hx}px, ${hy}px, 0) rotate(${rot}deg)`
      }

      // HUD only re-renders when a visible value changes
      const tl = Math.ceil(timeLeft)
      const lives = crashing ? 0 : 1
      setHud((h) => (h.score === s.score && h.time === tl && h.lives === lives ? h : { score: s.score, time: tl, lives, maxLives: 1 }))

      if (crashing ? crashP >= 1 : timeLeft <= 0) {
        if (!crashing) sfx.ding()
        finish()
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('pointerdown', onDown)
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

      {/* HIS doll, positioned by the loop over the canvas (Drive.jsx pattern) */}
      <div
        ref={heroRef}
        aria-hidden="true"
        className="absolute left-0 top-0 flex items-end justify-center pointer-events-none will-change-transform drop-shadow-lg"
        style={{ width: heroSize * 0.625, height: heroSize, transformOrigin: '50% 96%' }}
      >
        <Avatar size={heroSize} />
      </div>

      {!over && hint && (
        <div dir="rtl" className="absolute inset-x-0 top-6 flex justify-center px-4 pointer-events-none">
          <div className="anim-pop bg-white/95 text-slate-800 font-black text-lg sm:text-xl px-5 py-3 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl text-center leading-tight">
            הקישו כדי לקפוץ 👆
            <br />
            גררו למטה כדי לגלוש 👇
          </div>
        </div>
      )}

      {!over && toast && (
        <div dir="rtl" className="absolute inset-x-0 top-6 flex justify-center px-4 pointer-events-none">
          <div className="anim-pop bg-(--t-accent) text-slate-900 font-black text-2xl px-6 py-3 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl">
            {toast} 👇
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
