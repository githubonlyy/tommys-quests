// Coloring-page outlines. Each template is a list of SVG path `d` strings in a
// 400x400 box, drawn as thick black strokes with no fill so she colors inside.
// Pure data (no DOM) so the catalog can be validated by unit tests.

export const TEMPLATE_VIEW = 400
export const TEMPLATE_STROKE = 8

const rad = (deg) => (deg * Math.PI) / 180
const f = (n) => Math.round(n * 10) / 10

/** ellipse as two arcs; `rot` in degrees */
export function ellipsePath(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rad(rot))
  const s = Math.sin(rad(rot))
  const x1 = f(cx + rx * c)
  const y1 = f(cy + rx * s)
  const x2 = f(cx - rx * c)
  const y2 = f(cy - rx * s)
  return `M${x1} ${y1} A${rx} ${ry} ${rot} 1 0 ${x2} ${y2} A${rx} ${ry} ${rot} 1 0 ${x1} ${y1} Z`
}
export const circlePath = (cx, cy, r) => ellipsePath(cx, cy, r, r)

/** puffy cloud with a flat base, centred on (cx, cy), scaled by `s` */
export function cloudPath(cx, cy, s = 1) {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`
  const r = (n) => f(n * s)
  return [
    `M${p(-62, 22)} L${p(62, 22)}`,
    `A${r(24)} ${r(24)} 0 0 0 ${p(58, -14)}`,
    `A${r(32)} ${r(32)} 0 0 0 ${p(8, -40)}`,
    `A${r(34)} ${r(34)} 0 0 0 ${p(-46, -22)}`,
    `A${r(28)} ${r(28)} 0 0 0 ${p(-62, 22)} Z`,
  ].join(' ')
}

const mirrorX = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(TEMPLATE_VIEW - Number(x))} ${y}`)

// --- individual pages -------------------------------------------------------

const rainbow = [
  ...[170, 138, 106, 74, 42].map((r) => `M${200 - r} 300 A${r} ${r} 0 0 1 ${200 + r} 300`),
  cloudPath(72, 300, 1),
  cloudPath(328, 300, 1),
]

const car = [
  'M55 255 L55 195 L105 185 L145 125 L265 125 L315 185 L345 195 L345 255 Z',
  'M155 137 L200 137 L200 183 L125 183 Z',
  'M215 137 L258 137 L293 183 L215 183 Z',
  'M207 183 L207 255',
  circlePath(120, 258, 34),
  circlePath(280, 258, 34),
  circlePath(120, 258, 13),
  circlePath(280, 258, 13),
  circlePath(335, 222, 9),
  'M20 305 L380 305',
]

const rocket = [
  // body
  'M200 40 C232 78 248 128 248 186 L248 268 L152 268 L152 186 C152 128 168 78 200 40 Z',
  // window
  circlePath(200, 146, 30),
  // fins
  'M152 214 L106 268 L106 300 L152 274 Z',
  'M248 214 L294 268 L294 300 L248 274 Z',
  // flame
  'M172 268 C176 316 188 344 200 366 C212 344 224 316 228 268',
]

const planet = [
  circlePath(200, 190, 96),
  // ring
  ellipsePath(200, 200, 170, 44, 342),
  // craters
  circlePath(168, 158, 20),
  circlePath(228, 214, 14),
]

const ball = (() => {
  const out = [circlePath(200, 200, 130)]
  // centre pentagon
  const pts = []
  for (let i = 0; i < 5; i++) {
    const a = rad(-90 + i * 72)
    pts.push([f(200 + Math.cos(a) * 52), f(200 + Math.sin(a) * 52)])
  }
  out.push('M' + pts.map((q) => q.join(' ')).join(' L') + ' Z')
  // seams running out to the edge
  for (const [x, y] of pts) {
    const dx = x - 200
    const dy = y - 200
    const len = Math.hypot(dx, dy)
    out.push(`M${x} ${y} L${f(200 + (dx / len) * 130)} ${f(200 + (dy / len) * 130)}`)
  }
  return out
})()

const dino = [
  // body + tail + head in one outline
  'M60 300 C96 286 120 268 140 244 C150 200 176 168 214 160 C224 128 252 112 280 122 C306 132 316 160 306 186 C330 196 342 220 336 244 C328 282 292 302 250 300 Z',
  // legs
  'M170 296 L166 356 L204 356 L206 300',
  'M256 298 L254 356 L292 356 L294 292',
  // eye + smile
  circlePath(286, 148, 7),
  'M296 172 C286 182 272 182 262 174',
  // back spikes
  'M214 160 L228 132 L242 158',
  'M248 152 L262 124 L274 148',
]

const shuriken = (() => {
  const out = []
  const pts = []
  for (let i = 0; i < 8; i++) {
    const a = rad(-90 + i * 45)
    const r = i % 2 === 0 ? 150 : 54
    pts.push(`${f(200 + Math.cos(a) * r)} ${f(200 + Math.sin(a) * r)}`)
  }
  out.push('M' + pts.join(' L') + ' Z')
  out.push(circlePath(200, 200, 26))
  return out
})()

const robot = [
  // head
  'M130 96 L270 96 L270 196 L130 196 Z',
  // antenna
  'M200 96 L200 64',
  circlePath(200, 54, 12),
  // eyes + mouth
  circlePath(168, 138, 16),
  circlePath(232, 138, 16),
  'M164 170 L236 170',
  // body
  'M148 196 L252 196 L252 302 L148 302 Z',
  // arms
  'M148 216 L100 216 L100 288',
  'M252 216 L300 216 L300 288',
  // legs
  'M172 302 L172 356 L200 356',
  'M228 302 L228 356 L256 356',
]

export const BLANK_TEMPLATE = { kind: 'paths', id: 'blank', name: 'דף ריק', emoji: '⬜', paths: [] }

export const TEMPLATES = [
  BLANK_TEMPLATE,
  { id: 'rocket', name: 'רקטה', emoji: '🚀', paths: rocket },
  { id: 'planet', name: 'כוכב לכת', emoji: '🪐', paths: planet },
  { id: 'dino', name: 'דינוזאור', emoji: '🦖', paths: dino },
  { id: 'ball', name: 'כדורגל', emoji: '⚽', paths: ball },
  { id: 'shuriken', name: 'כוכב נינג׳ה', emoji: '🥷', paths: shuriken },
  { id: 'robot', name: 'רובוט', emoji: '🤖', paths: robot },
  { id: 'car', name: 'מכונית', emoji: '🚗', paths: car },
  { id: 'rainbow', name: 'קשת בענן', emoji: '🌈', paths: rainbow },
]

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) ?? BLANK_TEMPLATE
