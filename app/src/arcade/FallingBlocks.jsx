import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsDown, RotateCw } from 'lucide-react'
import { sfx } from '../match/sounds.js'
import ArcadeShell from './ArcadeShell.jsx'

const COLS = 8
const ROWS = 16
const START_MS = 900 // very slow first drop — the kid gets time to think
const STEP_MS = 70 // shaved off the drop interval per level
const MIN_MS = 260
const ROWS_PER_LEVEL = 10
const FLASH_MS = 300 // how long a completed row glows white before it vanishes
const LOCK_POINTS = 10 // small reward for every piece that lands, so the score always moves
const LINE_SCORE = [0, 100, 250, 450, 800] // by number of rows cleared at once
const KICKS = [0, -1, 1, -2, 2] // sideways nudges tried when a rotation is blocked

// Each shape is drawn in its own square box so rotation is a plain matrix turn.
const SHAPE_SRC = {
  I: ['....', 'XXXX', '....', '....'],
  O: ['XX', 'XX'],
  T: ['.X.', 'XXX', '...'],
  S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
}

const rotateCW = (m) => m.map((row, y) => row.map((_, x) => m[m.length - 1 - x][y]))

// Pre-compute the four rotations of a shape as lists of [x, y] offsets.
function buildRots(src) {
  let m = src.map((row) => row.split('').map((ch) => ch === 'X'))
  const rots = []
  for (let i = 0; i < 4; i++) {
    const cells = []
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m.length; x++) if (m[y][x]) cells.push([x, y])
    }
    rots.push(cells)
    m = rotateCW(m)
  }
  return rots
}

const PIECES = {
  I: { fill: '#22d3ee', deep: '#0e7490', rots: buildRots(SHAPE_SRC.I) },
  O: { fill: '#fbbf24', deep: '#b45309', rots: buildRots(SHAPE_SRC.O) },
  T: { fill: '#c084fc', deep: '#7e22ce', rots: buildRots(SHAPE_SRC.T) },
  S: { fill: '#4ade80', deep: '#15803d', rots: buildRots(SHAPE_SRC.S) },
  Z: { fill: '#fb7185', deep: '#be123c', rots: buildRots(SHAPE_SRC.Z) },
  J: { fill: '#60a5fa', deep: '#1d4ed8', rots: buildRots(SHAPE_SRC.J) },
  L: { fill: '#fb923c', deep: '#c2410c', rots: buildRots(SHAPE_SRC.L) },
}

// Weighted bag: the friendly shapes show up far more often than S and Z.
const BAG = ['O', 'O', 'O', 'I', 'I', 'L', 'L', 'J', 'J', 'T', 'T', 'S', 'Z']
const randKey = () => BAG[Math.floor(Math.random() * BAG.length)]

const emptyGrid = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(null))

function collides(grid, key, rot, px, py) {
  for (const [dx, dy] of PIECES[key].rots[rot]) {
    const x = px + dx
    const y = py + dy
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true
    if (grid[y][x]) return true
  }
  return false
}

// Spawn centred and pushed down just enough that no cell sits above row 0.
function spawnPiece(key) {
  const cells = PIECES[key].rots[0]
  let minX = COLS
  let maxX = 0
  let minY = ROWS
  for (const [x, y] of cells) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
  }
  const w = maxX - minX + 1
  return { key, rot: 0, x: Math.floor((COLS - w) / 2) - minX, y: -minY }
}

function landingY(g) {
  let y = g.cur.y
  while (!collides(g.grid, g.cur.key, g.cur.rot, g.cur.x, y + 1)) y++
  return y
}

function makeGame() {
  return {
    grid: emptyGrid(),
    cur: spawnPiece(randKey()),
    next: randKey(),
    score: 0,
    rows: 0,
    level: 1,
    interval: START_MS,
    paused: false,
    done: false,
    flash: null,
  }
}

// Flatten the board plus the live piece and its landing ghost into one draw list.
function snapshot(g) {
  const cells = new Array(ROWS * COLS).fill(null)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const k = g.grid[y][x]
      if (k) cells[y * COLS + x] = { key: k, ghost: false }
    }
  }
  if (g.cur) {
    const shape = PIECES[g.cur.key].rots[g.cur.rot]
    const gy = landingY(g)
    if (gy > g.cur.y) {
      for (const [dx, dy] of shape) {
        const i = (gy + dy) * COLS + g.cur.x + dx
        if (!cells[i]) cells[i] = { key: g.cur.key, ghost: true }
      }
    }
    for (const [dx, dy] of shape) {
      cells[(g.cur.y + dy) * COLS + g.cur.x + dx] = { key: g.cur.key, ghost: false }
    }
  }
  return { cells, flash: g.flash, next: g.next, level: g.level, rows: g.rows }
}

// Trim a shape to its tight bounding box for the little "next" preview.
function previewOf(key) {
  const cells = PIECES[key].rots[0]
  let minX = COLS
  let maxX = 0
  let minY = ROWS
  let maxY = 0
  for (const [x, y] of cells) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const filled = new Set(cells.map(([x, y]) => `${x - minX},${y - minY}`))
  const out = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out.push(filled.has(`${x},${y}`))
  }
  return { w, h, out }
}

// Falling Blocks — an 8-wide well, chunky on-screen buttons, and a ghost outline
// so an 8-year-old can always see exactly where the piece is about to land.
export default function FallingBlocks({ highScore, onClose, onScore, onRestart }) {
  const G = useRef(null)
  if (G.current === null) G.current = makeGame()

  const [view, setView] = useState(() => snapshot(G.current))
  const [hud, setHud] = useState({ score: 0 })
  const [over, setOver] = useState(null)
  const [toast, setToast] = useState(null)
  const [hint, setHint] = useState(true)

  const tickRef = useRef(0)
  const flashRef = useRef(0)
  const toastRef = useRef(0)
  const hintRef = useRef(0)
  const toastId = useRef(0)
  const reportedRef = useRef(false)

  const paint = () => setView(snapshot(G.current))

  const dismissHint = () => {
    clearTimeout(hintRef.current)
    setHint(false)
  }

  const popToast = (text) => {
    toastId.current += 1
    setToast({ id: toastId.current, text })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 1000)
  }

  const nextPiece = () => {
    const g = G.current
    const p = spawnPiece(g.next)
    g.next = randKey()
    if (collides(g.grid, p.key, p.rot, p.x, p.y)) {
      g.cur = null
      g.done = true
      g.paused = true
      paint()
      sfx.buzz()
      const isRecord = g.score > highScore
      if (isRecord) sfx.fanfare()
      setOver({ score: g.score, isRecord })
      return
    }
    g.cur = p
    paint()
  }

  const lockPiece = () => {
    const g = G.current
    const { key, rot, x, y } = g.cur
    for (const [dx, dy] of PIECES[key].rots[rot]) g.grid[y + dy][x + dx] = key
    g.cur = null
    g.score += LOCK_POINTS
    sfx.thud()

    const full = []
    for (let r = 0; r < ROWS; r++) if (g.grid[r].every(Boolean)) full.push(r)
    if (!full.length) {
      setHud({ score: g.score })
      nextPiece()
      return
    }

    const gained = LINE_SCORE[full.length] ?? full.length * 100
    g.score += gained
    g.flash = full
    g.paused = true // gravity waits while the row glows
    setHud({ score: g.score })
    popToast(`+${gained}`)
    sfx.ding()
    paint()

    flashRef.current = setTimeout(() => {
      const gg = G.current
      if (!gg || gg.done) return
      gg.grid = gg.grid.filter((_, r) => !full.includes(r))
      while (gg.grid.length < ROWS) gg.grid.unshift(new Array(COLS).fill(null))
      gg.rows += full.length
      const lvl = Math.floor(gg.rows / ROWS_PER_LEVEL) + 1
      if (lvl > gg.level) {
        gg.level = lvl
        gg.interval = Math.max(MIN_MS, START_MS - (lvl - 1) * STEP_MS)
        popToast(`שלב ${lvl}!`)
        sfx.coin()
      }
      gg.flash = null
      gg.paused = false
      nextPiece()
    }, FLASH_MS)
  }

  const stepDown = () => {
    const g = G.current
    if (!g.cur) return
    if (collides(g.grid, g.cur.key, g.cur.rot, g.cur.x, g.cur.y + 1)) lockPiece()
    else {
      g.cur.y += 1
      paint()
    }
  }

  const move = (dir) => {
    const g = G.current
    if (!g.cur || g.done || g.paused) return
    dismissHint()
    if (collides(g.grid, g.cur.key, g.cur.rot, g.cur.x + dir, g.cur.y)) return
    g.cur.x += dir
    sfx.flip()
    paint()
  }

  const rotate = () => {
    const g = G.current
    if (!g.cur || g.done || g.paused) return
    dismissHint()
    const nr = (g.cur.rot + 1) % 4
    for (const dx of KICKS) {
      if (collides(g.grid, g.cur.key, nr, g.cur.x + dx, g.cur.y)) continue
      g.cur.rot = nr
      g.cur.x += dx
      sfx.click()
      paint()
      return
    }
  }

  const hardDrop = () => {
    const g = G.current
    if (!g.cur || g.done || g.paused) return
    dismissHint()
    const y = landingY(g)
    if (y !== g.cur.y) {
      g.cur.y = y
      sfx.flip()
    }
    lockPiece()
  }

  const tapWell = (e) => {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    move(e.clientX < r.left + r.width / 2 ? -1 : 1)
  }

  // gravity: a self-rescheduling timeout so a level-up takes effect immediately
  useEffect(() => {
    // `alive` (not game state) gates the loop, so StrictMode's remount in dev
    // restarts gravity instead of permanently freezing the board.
    let alive = true
    const tickFn = () => {
      const g = G.current
      if (!alive || !g || g.done) return
      if (!g.paused) stepDown()
      if (!alive || G.current.done) return
      tickRef.current = setTimeout(tickFn, G.current.interval)
    }
    tickRef.current = setTimeout(tickFn, G.current.interval)
    return () => {
      alive = false
      clearTimeout(tickRef.current)
      clearTimeout(flashRef.current)
      clearTimeout(toastRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    hintRef.current = setTimeout(() => setHint(false), 6000)
    return () => clearTimeout(hintRef.current)
  }, [])

  useEffect(() => {
    if (!over || reportedRef.current) return
    reportedRef.current = true
    onScore(over.score)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  const flashSet = view.flash ? new Set(view.flash) : null
  const preview = previewOf(view.next)
  const previewColor = PIECES[view.next]

  return (
    <ArcadeShell hud={hud} over={over} highScore={highScore} onClose={onClose} onRestart={onRestart}>
      <div dir="rtl" className="absolute inset-0 flex flex-col select-none bg-gradient-to-b from-indigo-800 via-indigo-950 to-slate-950">
        {/* next piece + level strip */}
        <div className="shrink-0 flex items-center justify-center gap-3 px-3 pt-2">
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl border-b-4 border-black/40 px-3 py-2">
            <span className="text-white/80 font-black text-sm">הבא</span>
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${preview.w}, 13px)`,
                gridTemplateRows: `repeat(${preview.h}, 13px)`,
              }}
            >
              {preview.out.map((on, i) => (
                <div
                  key={i}
                  className="rounded-[3px]"
                  style={
                    on
                      ? { background: previewColor.fill, boxShadow: `inset 0 -3px 0 ${previewColor.deep}` }
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl border-b-4 border-black/40 px-3 py-2 text-center">
            <div className="text-white font-black text-lg leading-none tabular-nums">שלב {view.level}</div>
            <div className="text-white/60 font-bold text-xs tabular-nums">שורות {view.rows}</div>
          </div>
        </div>

        {/* the well — tap its left or right half to nudge the piece */}
        <div className="flex-1 min-h-0 flex items-center justify-center px-2 py-2">
          <div
            onPointerDown={tapWell}
            style={{ touchAction: 'none' }}
            className="relative h-full max-w-full aspect-[1/2] rounded-3xl bg-slate-950/70 border-4 border-b-8 border-indigo-500/50 shadow-2xl p-1.5"
          >
            <div
              className="grid gap-[2px] w-full h-full"
              style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
            >
              {view.cells.map((c, i) => {
                const row = Math.floor(i / COLS)
                if (flashSet && flashSet.has(row)) {
                  return (
                    <div
                      key={i}
                      className="rounded-md bg-white"
                      style={{ boxShadow: '0 0 14px 4px rgba(255,255,255,0.85)' }}
                    />
                  )
                }
                if (!c) return <div key={i} className="rounded-md bg-white/5" />
                const p = PIECES[c.key]
                if (c.ghost) {
                  return (
                    <div
                      key={i}
                      className="rounded-md"
                      style={{ border: `3px dashed ${p.fill}`, opacity: 0.45 }}
                    />
                  )
                }
                return (
                  <div
                    key={i}
                    className="rounded-md"
                    style={{
                      background: `linear-gradient(180deg, ${p.fill} 0%, ${p.deep} 100%)`,
                      boxShadow: `inset 0 3px 0 rgba(255,255,255,0.45), inset 0 -4px 0 ${p.deep}`,
                    }}
                  />
                )
              })}
            </div>

            {toast && (
              <div key={toast.id} className="absolute inset-x-0 top-1/3 flex justify-center pointer-events-none">
                <div className="anim-float-up bg-yellow-300 text-slate-900 font-black text-2xl px-5 py-2 rounded-2xl border-b-8 border-amber-600 shadow-xl tabular-nums">
                  {toast.text}
                </div>
              </div>
            )}

            {hint && (
              <div className="absolute inset-x-0 bottom-4 flex justify-center px-3 pointer-events-none">
                <div className="anim-pop bg-white/95 text-slate-800 font-black text-lg px-5 py-3 rounded-3xl border-b-8 border-indigo-500 shadow-xl text-center leading-tight">
                  בוא נמלא שורה שלמה!
                  <br />
                  הקש על צד הלוח כדי לזוז 👇
                </div>
              </div>
            )}
          </div>
        </div>

        {/* controls — forced to LTR so the arrows sit where they physically point */}
        <div dir="ltr" className="shrink-0 grid grid-cols-4 gap-2 px-3 pb-3 pt-1">
          <button
            onPointerDown={() => move(-1)}
            style={{ touchAction: 'manipulation' }}
            className="h-[68px] flex items-center justify-center rounded-3xl bg-sky-500 text-white border-b-8 border-sky-700 active:border-b-0 active:translate-y-2 transition-all"
          >
            <ChevronLeft size={40} strokeWidth={3.5} />
          </button>
          <button
            onPointerDown={rotate}
            style={{ touchAction: 'manipulation' }}
            className="h-[68px] flex items-center justify-center rounded-3xl bg-purple-500 text-white border-b-8 border-purple-700 active:border-b-0 active:translate-y-2 transition-all"
          >
            <RotateCw size={36} strokeWidth={3.5} />
          </button>
          <button
            onPointerDown={() => move(1)}
            style={{ touchAction: 'manipulation' }}
            className="h-[68px] flex items-center justify-center rounded-3xl bg-sky-500 text-white border-b-8 border-sky-700 active:border-b-0 active:translate-y-2 transition-all"
          >
            <ChevronRight size={40} strokeWidth={3.5} />
          </button>
          <button
            onPointerDown={hardDrop}
            style={{ touchAction: 'manipulation' }}
            className="h-[68px] flex items-center justify-center rounded-3xl bg-green-500 text-white border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all"
          >
            <ChevronsDown size={40} strokeWidth={3.5} />
          </button>
        </div>
      </div>
    </ArcadeShell>
  )
}
