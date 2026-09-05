import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import { useTheme } from '../context/ThemeContext.jsx'
import ArcadeShell from './ArcadeShell.jsx'

const START_LIVES = 3
const MAX_DT = 0.034 // clamp the frame delta (tab switches, hiccups)
const SERVE_PAUSE = 900 // ms of "ready" between the point and the next serve
const RALLY_SPEEDUP = 1.045 // the ball gains 4.5% on every racket hit
const MAX_ANGLE = 0.62 // rad — how far off-centre the racket edge kicks the ball
const AI_COLOR = '#fb7185'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * Tennis — top-down rally. His racket lives on the baseline at the bottom and
 * follows his finger; the opponent up top chases the ball with a reaction delay
 * and a random aim error, both of which shrink slowly, so the first minute is a
 * gimme and it tightens from there. +1 a return, +5 when the opponent whiffs,
 * three misses and the match is over.
 *
 * Same shape as the other arcade games: all play state lives in a ref that the
 * RAF loop mutates; React state only moves on real events (HUD, banner, hint).
 */
export default function Tennis({ highScore, onClose, onScore, onRestart }) {
  const { theme } = useTheme()
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const g = useRef(null)
  const bannerTimer = useRef(null)
  const reportedRef = useRef(false)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, maxLives: START_LIVES })
  const [over, setOver] = useState(null) // { score, isRecord }
  const [banner, setBanner] = useState(null) // { kind, id } — point won / lost
  const [rally, setRally] = useState(0)
  const [hint, setHint] = useState(true)
  // the loop reads the accent through a ref so switching theme never restarts the match
  const accentRef = useRef('#facc15')
  accentRef.current = theme?.vars?.['--t-accent'] ?? '#facc15'

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
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

    g.current = {
      playerX: canvas.width / 2,
      playerTarget: canvas.width / 2,
      aiX: canvas.width / 2,
      aiTarget: canvas.width / 2,
      aiTimer: 0,
      ball: null, // null while the serve is pending
      trail: [],
      speed: 0,
      rally: 0,
      points: 0, // points played — nudges the serve speed up over the match
      play: 0, // seconds of live ball, drives the opponent's ramp
      score: 0,
      lives: START_LIVES,
      serveAt: Infinity, // set on his first touch
      serveDir: 1, // +1 serves at him, -1 serves at the opponent
      pSquash: 0,
      aSquash: 0,
      bSquash: 0,
      started: false,
      done: false,
    }

    let bannerId = 0
    const flash = (kind) => {
      bannerId += 1
      setBanner({ kind, id: bannerId })
      clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => setBanner(null), 900)
    }

    /* ---------------- input: the racket tracks the finger ---------------- */
    const onPointer = (e) => {
      e.preventDefault()
      const s = g.current
      if (!s || s.done) return
      const r = canvas.getBoundingClientRect()
      s.playerTarget = (e.clientX - r.left) * dpr
    }
    const onDown = (e) => {
      const s = g.current
      if (s && !s.started) {
        s.started = true
        s.serveAt = performance.now() + 700
        setHint(false)
        sfx.click()
      }
      try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      onPointer(e)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onPointer)

    /* ---------------- little drawing helpers ---------------- */
    const rr = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }

    // chunky racket: body, dark bottom lip, a few strings. squash stretches it
    // sideways and squeezes it flat, which reads as "it just smacked something".
    const racket = (cx, cy, w, h, squash, color, deep) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1 + squash * 0.35, 1 - squash * 0.4)
      ctx.fillStyle = deep
      rr(-w / 2, -h / 2 + 3 * dpr, w, h, h / 2)
      ctx.fill()
      ctx.fillStyle = color
      rr(-w / 2, -h / 2, w, h, h / 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2 * dpr
      for (let i = -2; i <= 2; i++) {
        const x = (i * w) / 7
        ctx.beginPath()
        ctx.moveTo(x, -h / 2 + 4 * dpr)
        ctx.lineTo(x, h / 2 - 4 * dpr)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(-w / 2 + 6 * dpr, 0)
      ctx.lineTo(w / 2 - 6 * dpr, 0)
      ctx.stroke()
      ctx.restore()
    }

    const drawBall = (x, y, r, squash, angle) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      ctx.scale(1 + squash * 0.45, 1 - squash * 0.3) // stretched along its flight
      ctx.fillStyle = '#e5ff4d'
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#a3b800'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
      // the two white seams of a real tennis ball
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2.2 * dpr
      ctx.beginPath()
      ctx.arc(-r * 1.15, 0, r * 1.1, -0.9, 0.9)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(r * 1.15, 0, r * 1.1, Math.PI - 0.9, Math.PI + 0.9)
      ctx.stroke()
      ctx.restore()
    }

    let raf
    let last = 0
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const dt = last ? Math.min(MAX_DT, (now - last) / 1000) : 0
      last = now

      const W = canvas.width
      const H = canvas.height
      const cx0 = 10 * dpr
      const cx1 = W - 10 * dpr
      const cy0 = 26 * dpr
      const cy1 = H - 26 * dpr
      const cw = cx1 - cx0
      const ch = cy1 - cy0
      const netY = (cy0 + cy1) / 2
      const R = 11 * dpr
      const padH = 16 * dpr
      const padW = clamp(W * 0.3, 92 * dpr, 168 * dpr)
      const aiW = padW * 0.9 // his racket is the bigger one on purpose
      const playerY = cy1 - 36 * dpr
      const aiY = cy0 + 36 * dpr

      s.playerX += (s.playerTarget - s.playerX) * Math.min(1, dt * 20)
      const px = clamp(s.playerX, cx0 + padW / 2, cx1 - padW / 2)

      /* ---------------- opponent: delayed, sloppy, and slowly improving ---- */
      const t = s.play
      const react = Math.max(0.14, 0.55 - t * 0.005) // re-aims this often
      const err = Math.max(14 * dpr, (95 - t * 0.7) * dpr) // and misjudges by this much
      const aiSpeed = Math.min(H * 0.95, H * (0.42 + t * 0.004))
      s.aiTimer += dt
      if (s.aiTimer >= react) {
        s.aiTimer = 0
        s.aiTarget = s.ball && s.ball.vy < 0
          ? s.ball.x + (Math.random() * 2 - 1) * err
          : W / 2 + (Math.random() * 2 - 1) * err * 0.5 // ball is away: stroll back to the middle
      }
      s.aiX += clamp(s.aiTarget - s.aiX, -aiSpeed * dt, aiSpeed * dt)
      s.aiX = clamp(s.aiX, cx0 + aiW / 2, cx1 - aiW / 2)

      /* ---------------- serve ---------------- */
      if (!s.ball && now >= s.serveAt) {
        s.speed = H * 0.5 * (1 + Math.min(0.5, s.points * 0.02))
        const ang = (Math.random() * 2 - 1) * 0.35
        s.ball = {
          x: W / 2,
          y: netY,
          vx: Math.sin(ang) * s.speed,
          vy: Math.cos(ang) * s.speed * s.serveDir,
        }
        s.trail = []
        s.rally = 0
        sfx.flip()
      }

      /* ---------------- ball + collisions ---------------- */
      const hitBack = (b, cx, w, dir) => {
        const off = clamp((b.x - cx) / (w / 2), -1, 1) // edge of the racket = sharper angle
        const ang = off * MAX_ANGLE
        s.speed = Math.min(H * 1.25, s.speed * RALLY_SPEEDUP)
        b.vx = Math.sin(ang) * s.speed
        b.vy = Math.cos(ang) * s.speed * dir
        s.bSquash = 1
        sfx.pop()
      }

      const endPoint = (dir) => {
        s.ball = null
        s.trail = []
        s.rally = 0
        s.points += 1
        s.serveAt = now + SERVE_PAUSE
        s.serveDir = dir
      }

      if (s.ball) {
        s.play += dt
        // a fast ball can jump a whole racket in one frame — walk it in slices
        const steps = Math.max(1, Math.ceil((s.speed * dt) / R))
        const sdt = dt / steps
        for (let i = 0; i < steps && s.ball; i++) {
          const b = s.ball
          b.x += b.vx * sdt
          b.y += b.vy * sdt

          if (b.x - R < cx0) {
            b.x = cx0 + R
            b.vx = Math.abs(b.vx)
            sfx.flip()
          } else if (b.x + R > cx1) {
            b.x = cx1 - R
            b.vx = -Math.abs(b.vx)
            sfx.flip()
          }

          if (b.vy > 0 && b.y + R >= playerY - padH / 2 && b.y - R <= playerY + padH / 2 && Math.abs(b.x - px) <= padW / 2 + R) {
            b.y = playerY - padH / 2 - R
            hitBack(b, px, padW, -1)
            s.score += 1
            s.rally += 1
            s.pSquash = 1
          } else if (b.vy < 0 && b.y - R <= aiY + padH / 2 && b.y + R >= aiY - padH / 2 && Math.abs(b.x - s.aiX) <= aiW / 2 + R) {
            b.y = aiY + padH / 2 + R
            hitBack(b, s.aiX, aiW, 1)
            s.aSquash = 1
          }

          if (b.y + R < 0) {
            // the opponent whiffed
            s.score += 5
            sfx.ding()
            flash('win')
            endPoint(-1)
          } else if (b.y - R > H) {
            s.lives -= 1
            s.rally = 0
            sfx.thud()
            if (s.lives <= 0) {
              s.ball = null
              s.done = true
              const isRecord = s.score > highScore
              if (isRecord) sfx.fanfare()
              setHud({ score: s.score, lives: 0, maxLives: START_LIVES })
              setRally(0)
              setOver({ score: s.score, isRecord })
              return
            }
            flash('lose')
            endPoint(1)
          }
        }
        if (s.ball) {
          s.trail.push({ x: s.ball.x, y: s.ball.y })
          if (s.trail.length > 12) s.trail.shift()
        }
      }

      s.pSquash = Math.max(0, s.pSquash - dt * 6)
      s.aSquash = Math.max(0, s.aSquash - dt * 6)
      s.bSquash = Math.max(0, s.bSquash - dt * 7)

      /* ---------------- draw ---------------- */
      ctx.fillStyle = '#14532d' // grass apron around the court
      ctx.fillRect(0, 0, W, H)
      const grad = ctx.createLinearGradient(0, cy0, 0, cy1)
      grad.addColorStop(0, '#2f9e5f')
      grad.addColorStop(0.5, '#38b26c')
      grad.addColorStop(1, '#2f9e5f')
      ctx.fillStyle = grad
      ctx.fillRect(cx0, cy0, cw, ch)

      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.lineWidth = 3 * dpr
      ctx.strokeRect(cx0, cy0, cw, ch)
      const line = (x0, y0, x1, y1) => {
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      const inX0 = cx0 + cw * 0.09
      const inX1 = cx1 - cw * 0.09
      line(inX0, cy0, inX0, cy1) // singles tramlines
      line(inX1, cy0, inX1, cy1)
      const svTop = netY - ch * 0.19
      const svBot = netY + ch * 0.19
      line(inX0, svTop, inX1, svTop) // service lines
      line(inX0, svBot, inX1, svBot)
      line(W / 2, svTop, W / 2, svBot) // centre service line
      line(W / 2, cy0, W / 2, cy0 + 12 * dpr) // centre marks on the baselines
      line(W / 2, cy1 - 12 * dpr, W / 2, cy1)

      // net: shadow, woven band, posts
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(cx0, netY + 4 * dpr, cw, 7 * dpr)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillRect(cx0, netY - 7 * dpr, cw, 14 * dpr)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5 * dpr
      for (let x = cx0; x <= cx1; x += 11 * dpr) line(x, netY - 7 * dpr, x, netY + 7 * dpr)
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(cx0, netY - 9 * dpr, cw, 4 * dpr)
      for (const post of [cx0, cx1]) {
        ctx.beginPath()
        ctx.arc(post, netY, 7 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      // motion trail — oldest sample is the faintest and smallest
      for (let i = 0; i < s.trail.length; i++) {
        const k = (i + 1) / s.trail.length
        ctx.fillStyle = `rgba(229,255,77,${k * 0.4})`
        ctx.beginPath()
        ctx.arc(s.trail[i].x, s.trail[i].y, R * (0.3 + k * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }

      if (s.ball) {
        drawBall(s.ball.x, s.ball.y, R, s.bSquash, Math.atan2(s.ball.vy, s.ball.vx))
      } else {
        drawBall(W / 2, netY, R * (1 + Math.sin(now / 160) * 0.14), 0, 0) // waiting to serve
      }

      racket(s.aiX, aiY, aiW, padH, s.aSquash, AI_COLOR, '#9f1239')
      racket(px, playerY, padW, padH, s.pSquash, accentRef.current, 'rgba(0,0,0,0.45)')

      setHud((h) => (h.score === s.score && h.lives === s.lives ? h : { score: s.score, lives: s.lives, maxLives: START_LIVES }))
      setRally((r) => (r === s.rally ? r : s.rally))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(bannerTimer.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onPointer)
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

      {rally >= 3 && !over && (
        <div className="absolute top-3 right-3 pointer-events-none" dir="rtl">
          <div className="anim-pop bg-black/55 text-white font-black text-lg rounded-2xl px-4 py-1.5 tabular-nums">
            רצף {rally}
          </div>
        </div>
      )}

      {banner && !over && (
        <div key={banner.id} className="absolute inset-x-0 top-[38%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div
            className={`anim-pop text-white font-black italic text-3xl rounded-3xl border-b-8 px-7 py-4 shadow-xl ${
              banner.kind === 'win' ? 'bg-green-500 border-green-700' : 'bg-orange-500 border-orange-700'
            }`}
          >
            {banner.kind === 'win' ? 'כל הכבוד! 5 נקודות' : 'אוי! נסה שוב'}
          </div>
        </div>
      )}

      {hint && !over && (
        <div className="absolute inset-x-0 bottom-[24%] flex justify-center pointer-events-none px-4" dir="rtl">
          <div className="anim-fade-in bg-black/65 text-white font-black text-xl rounded-2xl px-5 py-3 text-center leading-snug">
            בוא נשחק טניס! 🎾
            <br />
            הזז את האצבע על המסך והחזר את הכדור
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
