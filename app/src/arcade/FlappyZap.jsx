import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

// Flappy Zap — tap to fly the lightning mascot between the pipes.
export default function FlappyZap({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0 })
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

    g.current = {
      y: canvas.height / 2,
      vy: 0,
      pipes: [],
      score: 0,
      started: false,
      lastSpawn: 0,
      done: false,
    }

    const flap = () => {
      const s = g.current
      if (!s || s.done) return
      s.started = true
      s.vy = -8.2 * dpr
      sfx.flip()
    }
    canvas.addEventListener('pointerdown', flap)

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const W = canvas.width
      const H = canvas.height
      const birdX = W * 0.28
      const R = 15 * dpr
      const speed = (2.6 + s.score * 0.05) * dpr
      const gap = Math.max(150 * dpr, (215 - s.score * 2) * dpr)
      const pipeW = 58 * dpr

      if (s.started) {
        s.vy += 0.42 * dpr
        s.y += s.vy

        if (now - s.lastSpawn > 1500) {
          s.lastSpawn = now
          const gapY = (0.22 + Math.random() * 0.5) * H
          s.pipes.push({ x: W + pipeW, gapY, passed: false })
        }
        for (const p of s.pipes) {
          p.x -= speed
          if (!p.passed && p.x + pipeW < birdX - R) {
            p.passed = true
            s.score += 1
            sfx.coin()
          }
        }
        s.pipes = s.pipes.filter((p) => p.x > -pipeW)

        // collisions: floor/ceiling + pipes
        const hitPipe = s.pipes.some(
          (p) =>
            birdX + R > p.x && birdX - R < p.x + pipeW &&
            (s.y - R < p.gapY - gap / 2 || s.y + R > p.gapY + gap / 2),
        )
        if (s.y + R > H || s.y - R < 0 || hitPipe) {
          s.done = true
          sfx.thud()
          const isRecord = s.score > highScore
          if (isRecord) sfx.fanfare()
          setOver({ score: s.score, isRecord })
          return
        }
      } else {
        s.y = H / 2 + Math.sin(now / 300) * 10 * dpr // idle hover
      }

      /* draw */
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#0ea5e9')
      grad.addColorStop(1, '#2563eb')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      for (const p of s.pipes) {
        ctx.fillStyle = '#16a34a'
        ctx.strokeStyle = '#14532d'
        ctx.lineWidth = 3 * dpr
        const topH = p.gapY - gap / 2
        const botY = p.gapY + gap / 2
        ctx.fillRect(p.x, 0, pipeW, topH)
        ctx.strokeRect(p.x, -4, pipeW, topH + 4)
        ctx.fillRect(p.x, botY, pipeW, H - botY)
        ctx.strokeRect(p.x, botY, pipeW, H - botY + 4)
        // lips
        ctx.fillRect(p.x - 5 * dpr, topH - 14 * dpr, pipeW + 10 * dpr, 14 * dpr)
        ctx.fillRect(p.x - 5 * dpr, botY, pipeW + 10 * dpr, 14 * dpr)
      }

      // zap mascot: yellow circle + bolt
      ctx.fillStyle = '#facc15'
      ctx.strokeStyle = '#a16207'
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.arc(birdX, s.y, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#a16207'
      ctx.beginPath()
      ctx.moveTo(birdX + 3 * dpr, s.y - 8 * dpr)
      ctx.lineTo(birdX - 5 * dpr, s.y + 2 * dpr)
      ctx.lineTo(birdX + 1 * dpr, s.y + 2 * dpr)
      ctx.lineTo(birdX - 3 * dpr, s.y + 9 * dpr)
      ctx.lineTo(birdX + 6 * dpr, s.y - 2 * dpr)
      ctx.lineTo(birdX, s.y - 2 * dpr)
      ctx.closePath()
      ctx.fill()

      if (!s.started) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.font = `900 ${20 * dpr}px Rubik, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO FLY!', W / 2, H * 0.35)
      }

      setHud((h) => (h.score === s.score ? h : { score: s.score }))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', flap)
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
