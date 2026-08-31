import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'
import { sfx } from '../match/sounds.js'
import { speak } from '../match/speak.js'
import ArcadeShell from '../arcade/ArcadeShell.jsx'
import { usePlayer } from '../context/PlayerContext.jsx'
import { avatarById } from '../data/avatars.js'
import Car, { CAR_W, CAR_H, DRIVER_SIZE } from './drive/Car.jsx'
import {
  START_LIVES,
  HITBOX,
  INVULN_MS,
  POINTS,
  moveLane,
  speedForRow,
  rowIntervalMs,
  hazardChanceForRow,
  generateRow,
  hitTest,
  scoreFor,
  laneCenterX,
} from './drive/logic.js'

const TITLE = 'נהיגה 🚗'
const SPRITE = 46 // emoji sprite box (px)
const POOL = 16 // reusable sprite nodes — rows are far apart, ~9 objects on screen at most
const BOTTOM_BAR = 108 // control strip height (px)
const CROSS_SEC = 2.6 // seconds for an object to cross the play area at speed 1
const DASH_PERIOD = 80 // lane-dash repeat (px) — keep in sync with the CSS below
const FIRST_ROW_DELAY = 1400 // breathing room after "יאללה נוסעים!"
const MAX_DT = 0.05 // clamp frame delta (tab switches, hiccups)
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
const TREES = ['🌳', '🌲', '🌴']
// roadside decoration spots, % of one scenery half (physical left/top — the
// play area is a top-down space, RTL does not apply)
const SIDE_DECOR = [
  { top: 3, x: 50, s: 30 },
  { top: 16, x: 30, s: 22 },
  { top: 29, x: 65, s: 34 },
  { top: 43, x: 40, s: 24 },
  { top: 57, x: 60, s: 30 },
  { top: 71, x: 30, s: 22 },
  { top: 85, x: 55, s: 34 },
]
const BURST_DIRS = [
  [-38, -30],
  [38, -30],
  [-46, 6],
  [46, 6],
  [-22, -50],
  [22, -50],
]

// Scoped keyframes for the road + scenery; durations are set per row from the
// loop so the dashes and trees always move at the same speed as the sprites.
const CSS = `
@keyframes drv-dash { from { background-position-y: 0; } to { background-position-y: ${DASH_PERIOD}px; } }
@keyframes drv-scroll { from { transform: translateY(-50%); } to { transform: translateY(0); } }
@keyframes drv-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.drv-dash {
  background-image: linear-gradient(to bottom, rgba(255,255,255,0.9) 0 ${DASH_PERIOD / 2}px, transparent ${DASH_PERIOD / 2}px ${DASH_PERIOD}px);
  background-size: 100% ${DASH_PERIOD}px;
  animation: drv-dash 0.3s linear infinite;
}
.drv-scroll { animation: drv-scroll 3s linear infinite; will-change: transform; }
.drv-blink { animation: drv-blink 0.25s linear infinite; }
@media (prefers-reduced-motion: reduce) { .drv-dash, .drv-scroll { animation: none; } }
`

function Grass({ side, particles }) {
  const off = side === 'left' ? 0 : 2
  const items = SIDE_DECOR.map((d, i) => ({
    ...d,
    ch: (i + off) % 3 === 0 ? TREES[(i + off) % TREES.length] : particles[(i + off) % particles.length],
  }))
  return (
    <div className={`absolute inset-y-0 ${side === 'left' ? 'left-0' : 'right-0'} w-[15%] overflow-hidden bg-black/10`} aria-hidden="true">
      <div data-speed="scene" className="drv-scroll absolute inset-x-0 top-0" style={{ height: '200%' }}>
        {[0, 1].map((half) => (
          <div key={half} className="relative w-full" style={{ height: '50%' }}>
            {items.map((d, i) => (
              <span
                key={i}
                className="absolute leading-none select-none"
                style={{ top: `${d.top}%`, left: `${d.x}%`, fontSize: d.s, transform: 'translateX(-50%)', fontFamily: EMOJI_FONT }}
              >
                {d.ch}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Drive — her doll drives a themed car down an endless three-lane road.
 * Tap left/right (or the big arrows) to change lane, collect the theme's
 * `good` emoji (+10) and gems (+30), dodge soft hazards. Score = distance
 * (1/row) + pickups, three hearts, gentle speed ramp. Object positions live in
 * a ref and are written to a pool of DOM nodes each frame; React state only
 * changes on events (HUD, sparkle bursts, game over).
 */
export default function Drive({ highScore, onClose, onScore, onRestart }) {
  const { state } = usePlayer()
  const heroEmoji = avatarById(state.avatar.avatarId).emoji
  const { theme } = useTheme()
  const skin = theme.arcade.catch
  const areaRef = useRef(null)
  const roadRef = useRef(null)
  const carRef = useRef(null) // positioned wrapper (inline transform)
  const carBodyRef = useRef(null) // inner wrapper (shake class)
  const poolRef = useRef([])
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [bursts, setBursts] = useState([])
  const [intro, setIntro] = useState(true)
  const reportedRef = useRef(false)

  // sprites: theme collectible, a gem (🌟 when the theme's collectible already is 💎),
  // and three soft hazards — theme `bad`, a cone, a teddy in the road
  const gem = skin.good === '💎' ? '🌟' : '💎'
  const hazards = [skin.bad, '🚧', '🧸']
  const emojiFor = (o) => (o.kind === 'hazard' ? hazards[o.v] : o.kind === 'gem' ? gem : skin.good)

  const move = (dir) => {
    const s = g.current
    if (!s || s.done) return
    const next = moveLane(s.lane, dir)
    if (next === s.lane) return
    s.lane = next
    sfx.flip()
  }

  useEffect(() => {
    const area = areaRef.current
    const road = roadRef.current
    const scrollers = [...area.querySelectorAll('[data-speed]')]
    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t)
        fn()
      }, ms)
      timers.add(t)
    }

    g.current = {
      lane: 1,
      carX: 0,
      objects: [],
      rows: [], // row markers — score +1 when one passes the car
      prevRow: null,
      rowIndex: 0,
      speed: 1,
      nextRowAt: performance.now() + FIRST_ROW_DELAY,
      score: 0,
      lives: START_LIVES,
      invulnUntil: 0,
      blinking: false,
      done: false,
      last: performance.now(),
      nextId: 1,
      geo: null,
    }

    const measure = () => {
      const ar = area.getBoundingClientRect()
      const rr = road.getBoundingClientRect()
      const laneW = rr.width / 3
      const scale = Math.min(1, (laneW * 0.9) / CAR_W)
      g.current.geo = {
        H: ar.height,
        laneW,
        scale,
        carY: ar.height - BOTTOM_BAR - (CAR_H * scale) / 2 - 8,
      }
    }
    measure()
    g.current.carX = laneCenterX(1, g.current.geo.laneW)
    window.addEventListener('resize', measure)

    // dashes + scenery scroll at the same px/s as the sprites
    const applySpeed = (speed) => {
      const { H } = g.current.geo
      const v = (H / CROSS_SEC) * speed
      for (const el of scrollers) {
        el.style.animationDuration = `${(el.dataset.speed === 'dash' ? DASH_PERIOD : H) / v}s`
      }
    }
    const pauseScroll = () => {
      for (const el of scrollers) el.style.animationPlayState = 'paused'
    }
    applySpeed(1)

    const burst = (x, y, chars, label) => {
      const id = g.current.nextId++
      const parts = BURST_DIRS.map(([dx, dy], i) => ({ dx, dy, ch: chars[i % chars.length] }))
      setBursts((b) => [...b, { id, x, y, parts, label }])
      later(() => setBursts((b) => b.filter((it) => it.id !== id)), 900)
    }

    const onKey = (e) => {
      if (e.key === 'ArrowLeft') move(-1)
      else if (e.key === 'ArrowRight') move(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)

    speak('יאללה נוסעים!', { delay: 700 })
    later(() => setIntro(false), 1600)

    const finish = () => {
      const s = g.current
      s.done = true
      pauseScroll()
      const isRecord = s.score > highScore
      if (isRecord) sfx.fanfare()
      setHud({ score: s.score, lives: s.lives })
      setOver({ score: s.score, isRecord })
    }

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = Math.min(MAX_DT, (now - s.last) / 1000)
      s.last = now
      const { H, laneW, scale, carY } = s.geo
      const v = (H / CROSS_SEC) * s.speed

      // spawn a row
      if (now >= s.nextRowAt) {
        const row = generateRow(Math.random, { hazardChance: hazardChanceForRow(s.rowIndex), prev: s.prevRow })
        row.forEach((cell, lane) => {
          if (cell) s.objects.push({ id: s.nextId++, lane, y: -SPRITE, kind: cell.kind, v: cell.v ?? 0, dead: false })
        })
        s.rows.push({ y: -SPRITE })
        s.prevRow = row
        s.rowIndex += 1
        s.speed = speedForRow(s.rowIndex)
        s.nextRowAt = now + rowIntervalMs(s.speed)
        applySpeed(s.speed)
      }

      // car eases toward its lane and tilts into the turn
      const tx = laneCenterX(s.lane, laneW)
      s.carX += (tx - s.carX) * Math.min(1, dt * 12)
      const tilt = Math.max(-14, Math.min(14, ((tx - s.carX) / laneW) * 22))
      carRef.current.style.transform = `translate3d(${s.carX - CAR_W / 2}px, ${carY - CAR_H / 2}px, 0) rotate(${tilt}deg) scale(${scale})`
      if (s.blinking && now >= s.invulnUntil) {
        s.blinking = false
        carRef.current.classList.remove('drv-blink')
      }
      const carBox = { x: s.carX, y: carY, w: CAR_W * scale, h: CAR_H * scale }

      // move + collide
      for (const o of s.objects) {
        o.y += v * dt
        if (o.dead) continue
        const ox = laneCenterX(o.lane, laneW)
        if (!hitTest(carBox, { x: ox, y: o.y, w: SPRITE, h: SPRITE }, HITBOX)) continue
        if (o.kind === 'hazard') {
          if (now < s.invulnUntil) continue // blinking through — no double hits
          o.dead = true
          s.lives -= 1
          s.invulnUntil = now + INVULN_MS
          s.blinking = true
          sfx.buzz()
          carRef.current.classList.add('drv-blink')
          const body = carBodyRef.current
          body.classList.add('anim-shake')
          later(() => body.classList.remove('anim-shake'), 450)
          burst(ox, o.y, ['💫', '💨'], '')
        } else {
          o.dead = true
          s.score += scoreFor(o.kind)
          if (o.kind === 'gem') sfx.ding()
          else sfx.coin()
          burst(ox, o.y, o.kind === 'gem' ? ['✨', '⭐'] : ['✨', '💛'], `+${scoreFor(o.kind)}`)
        }
      }
      s.objects = s.objects.filter((o) => !o.dead && o.y < H + SPRITE)

      // distance: a row counts once it has passed the car
      for (const r of s.rows) {
        r.y += v * dt
        if (!r.passed && r.y > carY) {
          r.passed = true
          s.score += POINTS.row
        }
      }
      s.rows = s.rows.filter((r) => !r.passed)

      // write sprites into the DOM pool
      const pool = poolRef.current
      const n = Math.min(POOL, s.objects.length)
      for (let i = 0; i < n; i++) {
        const o = s.objects[i]
        const el = pool[i]
        if (!el) continue
        const key = `${o.kind}${o.v}`
        if (el.dataset.k !== key) {
          el.textContent = emojiFor(o)
          el.dataset.k = key
          el.style.display = 'flex'
        }
        el.style.transform = `translate3d(${laneCenterX(o.lane, laneW) - SPRITE / 2}px, ${o.y - SPRITE / 2}px, 0)`
      }
      for (let i = n; i < POOL; i++) {
        const el = pool[i]
        if (el && el.dataset.k) {
          el.dataset.k = ''
          el.style.display = 'none'
        }
      }

      // HUD only re-renders when a visible value changes
      setHud((h) => (h.score === s.score && h.lives === s.lives ? h : { score: s.score, lives: s.lives }))

      if (s.lives <= 0) {
        finish()
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKey)
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

  // the road is a physical space: left half = move left, whatever the text direction
  const onAreaTap = (e) => {
    const r = areaRef.current.getBoundingClientRect()
    move(e.clientX - r.left < r.width / 2 ? -1 : 1)
  }
  const press = (dir) => (e) => {
    e.stopPropagation()
    move(dir)
  }

  return (
    <ArcadeShell title={TITLE} hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <style>{CSS}</style>
      <div dir="ltr" className="absolute inset-0 flex justify-center select-none touch-none">
        <div ref={areaRef} onPointerDown={onAreaTap} className="relative h-full w-full max-w-[520px] overflow-hidden touch-none">
          <Grass side="left" particles={theme.particles} />
          <Grass side="right" particles={theme.particles} />

          {/* ROAD */}
          <div ref={roadRef} className="absolute inset-y-0 left-[15%] right-[15%] bg-slate-600 border-x-4 border-white/80 overflow-hidden">
            <div data-speed="dash" className="drv-dash absolute top-0 bottom-0 w-1.5" style={{ left: 'calc(33.333% - 3px)' }} aria-hidden="true" />
            <div data-speed="dash" className="drv-dash absolute top-0 bottom-0 w-1.5" style={{ left: 'calc(66.667% - 3px)' }} aria-hidden="true" />

            {/* sprite pool — positioned by the loop via refs */}
            {Array.from({ length: POOL }).map((_, i) => (
              <div
                key={i}
                ref={(el) => {
                  poolRef.current[i] = el
                }}
                aria-hidden="true"
                className="absolute left-0 top-0 items-center justify-center leading-none will-change-transform drop-shadow"
                style={{ width: SPRITE, height: SPRITE, fontSize: SPRITE * 0.86, fontFamily: EMOJI_FONT, display: 'none' }}
              />
            ))}

            {/* CAR — outer: position/tilt + blink, inner: shake */}
            <div ref={carRef} className="absolute left-0 top-0 will-change-transform" style={{ width: CAR_W, height: CAR_H }} aria-label="המכונית של מלאני">
              <div ref={carBodyRef}>
                <Car themeId={theme.id}>
                  <span style={{ fontSize: DRIVER_SIZE * 0.6, lineHeight: 1 }}>{heroEmoji}</span>
                </Car>
              </div>
            </div>

            {/* sparkle bursts + floating score */}
            {bursts.map((b) => (
              <div key={b.id} className="absolute left-0 top-0 pointer-events-none" style={{ transform: `translate(${b.x}px, ${b.y}px)` }} aria-hidden="true">
                {b.parts.map((p, i) => (
                  <span
                    key={i}
                    className="absolute anim-star-burst text-2xl leading-none"
                    style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, left: -14, top: -14, fontFamily: EMOJI_FONT }}
                  >
                    {p.ch}
                  </span>
                ))}
                {b.label && (
                  <span className="absolute anim-float-up text-center font-black text-white text-2xl drop-shadow-md tabular-nums" style={{ left: -30, top: -16, width: 60 }}>
                    {b.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* start banner */}
          {intro && (
            <div className="absolute inset-x-0 top-[22%] flex justify-center pointer-events-none" dir="rtl">
              <div className="anim-pop bg-white/95 text-slate-800 font-black text-3xl px-8 py-4 rounded-3xl border-b-8 border-(--t-accent-deep) shadow-xl">
                🚗 יאללה נוסעים!
              </div>
            </div>
          )}

          {/* CONTROLS — physical left/right, big enough for small thumbs */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-3 pointer-events-none" style={{ height: BOTTOM_BAR }}>
            <button
              type="button"
              onPointerDown={press(-1)}
              aria-label="שמאלה"
              className="pointer-events-auto w-20 h-20 rounded-3xl bg-white/95 border-b-8 border-(--t-accent-deep) shadow-xl text-5xl leading-none flex items-center justify-center active:border-b-0 active:translate-y-2 transition-all"
              style={{ fontFamily: EMOJI_FONT }}
            >
              ⬅️
            </button>
            <button
              type="button"
              onPointerDown={press(1)}
              aria-label="ימינה"
              className="pointer-events-auto w-20 h-20 rounded-3xl bg-white/95 border-b-8 border-(--t-accent-deep) shadow-xl text-5xl leading-none flex items-center justify-center active:border-b-0 active:translate-y-2 transition-all"
              style={{ fontFamily: EMOJI_FONT }}
            >
              ➡️
            </button>
          </div>
        </div>
      </div>
    </ArcadeShell>
  )
}
