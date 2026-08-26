import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

const ROW_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7']
const START_LIVES = 3

// Brick Breaker — drag the paddle, smash the wall. Clear a board: +200 and a faster one.
export default function BrickBreaker({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES })
  const [over, setOver] = useState(null)
  const reportedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const buildBricks = (W) => {
      const cols = 6
      const rows = 6
      const pad = 6 * dpr
      const top = 56 * dpr
      const bw = (W - pad * (cols + 1)) / cols
      const bh = 22 * dpr
      const bricks = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          bricks.push({ x: pad + c * (bw + pad), y: top + r * (bh + pad), w: bw, h: bh, color: ROW_COLORS[r], alive: true })
      return bricks
    }

    g.current = {
      paddleX: canvas.width / 2,
      ball: null, // set on serve
      bricks: buildBricks(canvas.width),
      score: 0,
      lives: START_LIVES,
      level: 1,
      serveAt: performance.now() + 700,
      done: false,
    }

    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect()
      g.current.paddleX = (e.clientX - r.left) * dpr
    }
    canvas.addEventListener('pointerdown', onPointer)
    canvas.addEventListener('pointermove', onPointer)

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const W = canvas.width
      const H = canvas.height
      const padW = 110 * dpr
      const padH = 16 * dpr
      const padY = H - 48 * dpr
      const R = 9 * dpr
      const px = Math.max(padW / 2, Math.min(W - padW / 2, s.paddleX))

      // serve
      if (!s.ball && now >= s.serveAt) {
        const speed = (4.6 + s.level * 0.7) * dpr
        const ang = -Math.PI / 4 - Math.random() * (Math.PI / 2) * 0.5
        s.ball = { x: px, y: padY - R - 2, vx: Math.cos(ang) * speed * (Math.random() < 0.5 ? 1 : -1), vy: Math.sin(ang) * speed }
      }

      if (s.ball) {
        const b = s.ball
        b.x += b.vx
        b.y += b.vy
        if (b.x - R < 0) { b.x = R; b.vx = Math.abs(b.vx) }
        if (b.x + R > W) { b.x = W - R; b.vx = -Math.abs(b.vx) }
        if (b.y - R < 0) { b.y = R; b.vy = Math.abs(b.vy) }

        // paddle bounce, angle by hit position
        if (b.vy > 0 && b.y + R > padY && b.y + R < padY + padH && Math.abs(b.x - px) < padW / 2 + R) {
          const rel = (b.x - px) / (padW / 2)
          const speed = Math.hypot(b.vx, b.vy)
          const ang = rel * (Math.PI / 3)
          b.vx = Math.sin(ang) * speed
          b.vy = -Math.abs(Math.cos(ang) * speed)
          sfx.flip()
        }

        // brick hits
        for (const br of s.bricks) {
          if (!br.alive) continue
          if (b.x + R > br.x && b.x - R < br.x + br.w && b.y + R > br.y && b.y - R < br.y + br.h) {
            br.alive = false
            s.score += 10
            sfx.click()
            // bounce off the nearer axis
            const overlapX = Math.min(b.x + R - br.x, br.x + br.w - (b.x - R))
            const overlapY = Math.min(b.y + R - br.y, br.y + br.h - (b.y - R))
            if (overlapX < overlapY) b.vx = -b.vx
            else b.vy = -b.vy
            break
          }
        }

        // board cleared
        if (s.bricks.every((br) => !br.alive)) {
          s.score += 200
          s.level += 1
          s.bricks = buildBricks(W)
          s.ball = null
          s.serveAt = now + 900
          sfx.fanfare()
        }

        // dropped
        if (b.y - R > H) {
          s.lives -= 1
          s.ball = null
          s.serveAt = now + 900
          sfx.thud()
          if (s.lives <= 0) {
            s.done = true
            const isRecord = s.score > highScore
            if (isRecord) sfx.fanfare()
            setOver({ score: s.score, isRecord })
            return
          }
        }
      }

      /* draw */
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#1e3a8a')
      grad.addColorStop(1, '#0f172a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      for (const br of s.bricks) {
        if (!br.alive) continue
        ctx.fillStyle = br.color
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.roundRect(br.x, br.y, br.w, br.h, 5 * dpr)
        ctx.fill()
        ctx.stroke()
      }

      ctx.fillStyle = '#facc15'
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.roundRect(px - padW / 2, padY, padW, padH, 8 * dpr)
      ctx.fill()
      ctx.stroke()

      if (s.ball) {
        ctx.fillStyle = 'white'
        ctx.strokeStyle = '#94a3b8'
        ctx.beginPath()
        ctx.arc(s.ball.x, s.ball.y, R, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      setHud((h) => (h.score === s.score && h.lives === s.lives ? h : { score: s.score, lives: s.lives }))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointer)
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
      <canvas ref={canvasRef} className="absolute inset-0" />
    </ArcadeShell>
  )
}
