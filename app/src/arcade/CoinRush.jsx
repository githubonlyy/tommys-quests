import { useEffect, useRef, useState } from 'react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

const ROUND_SEC = 60
const START_LIVES = 3

/**
 * Coin Rush — pure-fun arcade. Drag the treasure cart, catch coins (+10),
 * gems (+50), dodge bombs (-1 life). 60s round or 3 bomb hits.
 * No learning content, no coin economy — just high score (via onScore).
 */
export default function CoinRush({ highScore, onClose, onScore, onRestart }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  // all game state lives in a ref — the RAF loop mutates it without re-renders
  const g = useRef(null)
  const [hud, setHud] = useState({ score: 0, lives: START_LIVES, time: ROUND_SEC })
  const [over, setOver] = useState(null) // { score, isRecord }
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
      cartX: canvas.width / 2,
      items: [],
      score: 0,
      lives: START_LIVES,
      startTs: performance.now(),
      lastSpawn: 0,
      hitFlash: 0,
      done: false,
    }

    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect()
      g.current.cartX = (e.clientX - r.left) * dpr
    }
    canvas.addEventListener('pointerdown', onPointer)
    canvas.addEventListener('pointermove', onPointer)

    let raf
    const loop = (now) => {
      const s = g.current
      if (!s || s.done) return
      const W = canvas.width
      const H = canvas.height
      const elapsed = (now - s.startTs) / 1000
      const timeLeft = Math.max(0, ROUND_SEC - elapsed)
      const difficulty = 1 + elapsed / 22 // speed + spawn ramp

      // spawn
      if (now - s.lastSpawn > 650 / difficulty) {
        s.lastSpawn = now
        const roll = Math.random()
        const kind = roll < 0.62 ? 'coin' : roll < 0.72 ? 'gem' : 'bomb'
        s.items.push({
          kind,
          x: (0.08 + Math.random() * 0.84) * W,
          y: -20 * dpr,
          vy: (2.1 + Math.random() * 1.4) * difficulty * dpr,
          wob: Math.random() * Math.PI * 2,
        })
      }

      const cartW = 96 * dpr
      const cartH = 34 * dpr
      const cartY = H - 62 * dpr
      const cartX = Math.max(cartW / 2, Math.min(W - cartW / 2, s.cartX))

      // move + collide
      for (const it of s.items) {
        it.y += it.vy
        it.x += Math.sin(it.wob + it.y / (40 * dpr)) * 0.6 * dpr
        const caught = it.y > cartY - 8 * dpr && it.y < cartY + cartH && Math.abs(it.x - cartX) < cartW / 2 + 8 * dpr
        if (caught && !it.dead) {
          it.dead = true
          if (it.kind === 'coin') { s.score += 10; sfx.coin() }
          else if (it.kind === 'gem') { s.score += 50; sfx.ding() }
          else { s.lives -= 1; s.hitFlash = now; sfx.thud() }
        }
      }
      s.items = s.items.filter((it) => !it.dead && it.y < H + 30 * dpr)

      /* ---- draw ---- */
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#1e3a8a')
      grad.addColorStop(1, '#2563eb')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // bomb-hit red flash
      if (now - s.hitFlash < 180) {
        ctx.fillStyle = 'rgba(239,68,68,0.28)'
        ctx.fillRect(0, 0, W, H)
      }

      for (const it of s.items) {
        if (it.kind === 'bomb') {
          ctx.fillStyle = '#1e293b'
          ctx.beginPath()
          ctx.arc(it.x, it.y, 13 * dpr, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 3 * dpr
          ctx.beginPath()
          ctx.moveTo(it.x + 6 * dpr, it.y - 10 * dpr)
          ctx.lineTo(it.x + 12 * dpr, it.y - 18 * dpr)
          ctx.stroke()
        } else {
          const R = it.kind === 'gem' ? 12 * dpr : 11 * dpr
          ctx.fillStyle = it.kind === 'gem' ? '#a855f7' : '#facc15'
          ctx.strokeStyle = it.kind === 'gem' ? '#6b21a8' : '#a16207'
          ctx.lineWidth = 2.5 * dpr
          ctx.beginPath()
          if (it.kind === 'gem') {
            ctx.moveTo(it.x, it.y - R)
            ctx.lineTo(it.x + R, it.y)
            ctx.lineTo(it.x, it.y + R)
            ctx.lineTo(it.x - R, it.y)
            ctx.closePath()
          } else {
            ctx.arc(it.x, it.y, R, 0, Math.PI * 2)
          }
          ctx.fill()
          ctx.stroke()
        }
      }

      // cart
      ctx.fillStyle = '#92400e'
      ctx.strokeStyle = '#451a03'
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.roundRect(cartX - cartW / 2, cartY, cartW, cartH, 8 * dpr)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.roundRect(cartX - cartW / 2 + 6 * dpr, cartY + 6 * dpr, cartW - 12 * dpr, 10 * dpr, 4 * dpr)
      ctx.fill()
      ctx.fillStyle = '#1e293b'
      for (const wx of [-cartW / 3, cartW / 3]) {
        ctx.beginPath()
        ctx.arc(cartX + wx, cartY + cartH + 6 * dpr, 8 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      // update HUD only when a visible value changes (avoids 60fps re-renders)
      const tl = Math.ceil(timeLeft)
      setHud((h) => (h.score === s.score && h.lives === s.lives && h.time === tl ? h : { score: s.score, lives: s.lives, time: tl }))

      if (timeLeft <= 0 || s.lives <= 0) {
        s.done = true
        const isRecord = s.score > highScore
        if (isRecord) sfx.fanfare()
        setOver({ score: s.score, isRecord })
        return
      }
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

  // report score once when the round ends
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
