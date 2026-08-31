// Canvas math and rendering for the drawing board.
//
// The drawing is stored as a list of "ops" (strokes, sticker stamps, images,
// background fills) in LOGICAL coordinates: origin at the canvas centre and
// 1000 units across the shorter side. That makes strokes resolution- and
// orientation-independent — on resize we just replay the ops with a new view.
// Everything above the DOM helpers section is pure and unit-tested.

export const LOGICAL = 1000

// ---------------------------------------------------------------------------
// view / coordinates

/** view = pixel size of the canvas plus the logical<->pixel scale */
export function makeView(w, h, dpr = 1) {
  const unit = Math.max(1, Math.min(w, h))
  return { w, h, dpr, unit, scale: unit / LOGICAL }
}

export function toLogical(px, py, view) {
  return { x: (px - view.w / 2) / view.scale, y: (py - view.h / 2) / view.scale }
}

export function fromLogical(x, y, view) {
  return { x: x * view.scale + view.w / 2, y: y * view.scale + view.h / 2 }
}

/** the whole canvas as a rect in logical units */
export function logicalRect(view) {
  const w = view.w / view.scale
  const h = view.h / view.scale
  return { x: -w / 2, y: -h / 2, w, h }
}

/** set ctx transform so drawing calls can use logical coordinates */
export function applyView(ctx, view) {
  const s = view.dpr * view.scale
  ctx.setTransform(s, 0, 0, s, (view.w * view.dpr) / 2, (view.h * view.dpr) / 2)
}

// ---------------------------------------------------------------------------
// stroke geometry

export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/** drop pointer samples that barely moved (keeps the point list lean) */
export function farEnough(prev, p, min = 2) {
  return !prev || dist(prev, p) >= min
}

/**
 * Smooth path through `points`: quadratic curves whose end points are the
 * midpoints between samples and whose control points are the samples
 * themselves. Without `tail` the path stops at the last midpoint (what has
 * been drawn live so far); with `tail` a final straight piece reaches the last
 * point. Each segment: { from, ctrl | null, to }.
 */
export function segmentsOf(points, { tail = false } = {}) {
  const n = points.length
  const segs = []
  if (n < 2) return segs
  for (let i = 1; i <= n - 2; i++) {
    const from = i === 1 ? points[0] : mid(points[i - 1], points[i])
    segs.push({ from, ctrl: points[i], to: mid(points[i], points[i + 1]) })
  }
  if (tail) {
    const from = n === 2 ? points[0] : mid(points[n - 2], points[n - 1])
    segs.push({ from, ctrl: null, to: points[n - 1] })
  }
  return segs
}

/** the segment that became drawable when the last point was appended, or null */
export function lastSegment(points) {
  const n = points.length
  if (n < 3) return null
  const from = n === 3 ? points[0] : mid(points[n - 3], points[n - 2])
  return { from, ctrl: points[n - 2], to: mid(points[n - 2], points[n - 1]) }
}

/** the closing straight piece from the last midpoint to the last point */
export function tailSegment(points) {
  const n = points.length
  if (n < 2) return null
  const from = n === 2 ? points[0] : mid(points[n - 2], points[n - 1])
  return { from, ctrl: null, to: points[n - 1] }
}

// rainbow brush: hue advances with the distance travelled along the stroke
export const HUE_PER_UNIT = 0.5
export const hueAt = (len) => ((len * HUE_PER_UNIT) % 360 + 360) % 360
export const rainbowColor = (hue) => `hsl(${Math.round(hue)} 95% 55%)`

// ---------------------------------------------------------------------------
// sizing math (save / reopen)

/** scale (w, h) down so the longer side is <= max; never upscales */
export function fitWithin(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale }
}

/** the centred square (where the coloring template renders) inside w x h */
export function squareRect(w, h) {
  const s = Math.min(w, h)
  return { x: (w - s) / 2, y: (h - s) / 2, s }
}

/** fit an iw x ih image inside `box` keeping its aspect, centred */
export function containRect(iw, ih, box) {
  const scale = Math.min(box.w / Math.max(iw, 1), box.h / Math.max(ih, 1))
  const w = iw * scale
  const h = ih * scale
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** decoded byte size of a base64 data URL */
export function bytesOfDataUrl(dataUrl) {
  const i = dataUrl.indexOf(',')
  if (i < 0) return 0
  const b64 = dataUrl.slice(i + 1)
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

/** background color = the last bucket fill, else white */
export function lastBg(ops, fallback = '#ffffff') {
  for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'bg') return ops[i].color
  return fallback
}

// ---------------------------------------------------------------------------
// rendering (needs only a CanvasRenderingContext2D-like object)

function strokeSetup(ctx, style) {
  ctx.globalCompositeOperation = style.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  ctx.lineWidth = style.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

export function drawDot(ctx, p, style) {
  strokeSetup(ctx, style)
  ctx.beginPath()
  ctx.arc(p.x, p.y, style.width / 2, 0, Math.PI * 2)
  ctx.fill()
}

export function drawSegment(ctx, seg, style) {
  strokeSetup(ctx, style)
  ctx.beginPath()
  ctx.moveTo(seg.from.x, seg.from.y)
  if (seg.ctrl) ctx.quadraticCurveTo(seg.ctrl.x, seg.ctrl.y, seg.to.x, seg.to.y)
  else ctx.lineTo(seg.to.x, seg.to.y)
  ctx.stroke()
}

/** style for a stroke op at a given distance along it (rainbow cycles hue) */
export function styleAt(op, len) {
  return {
    width: op.width,
    erase: op.tool === 'eraser',
    color: op.tool === 'rainbow' ? rainbowColor(hueAt(len)) : op.color,
  }
}

/** replay a whole stroke exactly as it was drawn live (dot, segments, tail) */
export function drawStrokeOp(ctx, op) {
  const pts = op.points
  if (!pts.length) return
  drawDot(ctx, pts[0], styleAt(op, 0))
  let len = 0
  for (const seg of segmentsOf(pts, { tail: true })) {
    drawSegment(ctx, seg, styleAt(op, len))
    len += dist(seg.from, seg.to)
  }
}

export function drawStickerOp(ctx, op) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.font = `${op.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#000'
  ctx.fillText(op.emoji, op.x, op.y)
}

export function drawImageOp(ctx, op) {
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(op.img, op.x, op.y, op.w, op.h)
}

export function drawOp(ctx, op) {
  if (op.type === 'stroke') drawStrokeOp(ctx, op)
  else if (op.type === 'sticker') drawStickerOp(ctx, op)
  else if (op.type === 'image') drawImageOp(ctx, op)
  // 'bg' is a DOM layer under the canvas, nothing to paint here
}

/** wipe the canvas and replay every op under `view` */
export function renderOps(ctx, ops, view) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  applyView(ctx, view)
  for (const op of ops) drawOp(ctx, op)
}

// ---------------------------------------------------------------------------
// DOM helpers (browser only)

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

/** serialize a live <svg> element and load it as an Image of w x h px */
export function svgToImage(svgEl, w, h) {
  const clone = svgEl.cloneNode(true)
  clone.removeAttribute('class')
  clone.removeAttribute('style')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(clone)
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml))
}

/** JPEG data URL, lowering quality until it fits under maxBytes */
export function canvasToDataUrlUnder(canvas, maxBytes) {
  let url = ''
  for (const q of [0.85, 0.72, 0.6, 0.48, 0.36]) {
    url = canvas.toDataURL('image/jpeg', q)
    if (bytesOfDataUrl(url) <= maxBytes) return url
  }
  return url
}

/**
 * Flatten background + drawing + template outline into one downscaled JPEG.
 * `templateSvg` may be null for a blank page.
 */
export async function composeDrawing({ canvas, bg, templateSvg, templateImg, w, h, maxSide = 640, maxBytes = 150 * 1024 }) {
  const out = fitWithin(w, h, maxSide)
  const off = document.createElement('canvas')
  off.width = out.w
  off.height = out.h
  const ctx = off.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, out.w, out.h)
  ctx.drawImage(canvas, 0, 0, out.w, out.h)
  if (templateSvg) {
    const sq = squareRect(out.w, out.h)
    const img = await svgToImage(templateSvg, Math.round(sq.s), Math.round(sq.s))
    ctx.drawImage(img, sq.x, sq.y, sq.s, sq.s)
  } else if (templateImg) {
    // family pages keep their own aspect ratio; letterbox them like the screen does
    const r = containRect(templateImg.naturalWidth || templateImg.width, templateImg.naturalHeight || templateImg.height, { x: 0, y: 0, w: out.w, h: out.h })
    ctx.globalAlpha = templateImg.__alpha ?? 1
    ctx.drawImage(templateImg, r.x, r.y, r.w, r.h)
    ctx.globalAlpha = 1
  }
  return { dataUrl: canvasToDataUrlUnder(off, maxBytes), w: out.w, h: out.h }
}
