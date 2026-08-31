import { describe, it, expect } from 'vitest'
import { THEMES, THEME_IDS } from '../data/themes.js'
import { TEMPLATES, BLANK_TEMPLATE, TEMPLATE_VIEW, templateById, ellipsePath, cloudPath } from '../world/draw/templates.js'
import { buildPalette, BASE_COLORS, PALETTE_SIZE, BRUSH_SIZES, stickerList, MAX_STICKERS } from '../world/draw/palette.js'
import {
  addDrawing,
  removeDrawing,
  loadGallery,
  saveGallery,
  persistNewDrawing,
  GALLERY_MAX,
  GALLERY_KEY,
} from '../world/draw/gallery.js'
import {
  makeView,
  toLogical,
  fromLogical,
  logicalRect,
  segmentsOf,
  lastSegment,
  tailSegment,
  farEnough,
  hueAt,
  fitWithin,
  squareRect,
  containRect,
  bytesOfDataUrl,
  lastBg,
  drawStrokeOp,
} from '../world/draw/canvasUtils.js'

const HEBREW = /[֐-׿]/
const HEX = /^#[0-9a-f]{6}$/i

// in-memory localStorage stand-in; `limit` makes setItem throw like a full quota
function fakeStorage(limit = Infinity) {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (v.length > limit) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k) => map.delete(k),
  }
}
const entry = (i) => ({ id: `d${i}`, at: i, dataUrl: `data:image/jpeg;base64,${'A'.repeat(20)}${i}`, w: 4, h: 3 })

// --------------------------------------------------------------------------

describe('gallery list rules', () => {
  it('prepends the newest and caps at 12, dropping the oldest', () => {
    let list = []
    for (let i = 1; i <= 15; i++) {
      const r = addDrawing(list, entry(i))
      list = r.list
      expect(r.dropped).toBe(i > GALLERY_MAX ? 1 : 0)
    }
    expect(GALLERY_MAX).toBe(12)
    expect(list).toHaveLength(12)
    expect(list[0].id).toBe('d15')
    expect(list.at(-1).id).toBe('d4')
    expect(list.map((d) => d.id)).not.toContain('d3')
  })

  it('re-adding an id moves it to the front instead of duplicating', () => {
    const list = addDrawing(addDrawing([], entry(1)).list, entry(2)).list
    const r = addDrawing(list, { ...entry(1), at: 99 })
    expect(r.list.map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(r.list[0].at).toBe(99)
  })

  it('removeDrawing drops exactly that id', () => {
    const list = [entry(3), entry(2), entry(1)]
    expect(removeDrawing(list, 'd2').map((d) => d.id)).toEqual(['d3', 'd1'])
    expect(removeDrawing(list, 'nope')).toHaveLength(3)
  })
})

describe('gallery storage', () => {
  it('round-trips through storage, newest first', () => {
    const s = fakeStorage()
    const list = [entry(2), entry(1)]
    expect(saveGallery(list, s)).toBe(true)
    expect(loadGallery(s)).toEqual(list)
    expect(JSON.parse(s.getItem(GALLERY_KEY))).toHaveLength(2)
  })

  it('never throws: missing storage, corrupt JSON and junk entries yield []', () => {
    expect(loadGallery(null)).toEqual([]) // node has no localStorage
    const s = fakeStorage()
    s.setItem(GALLERY_KEY, '{not json')
    expect(loadGallery(s)).toEqual([])
    s.setItem(GALLERY_KEY, JSON.stringify([{ id: 'x' }, null, 5, entry(1), { id: 'y', dataUrl: 'http://evil' }]))
    expect(loadGallery(s).map((d) => d.id)).toEqual(['d1'])
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadGallery(broken)).toEqual([])
    expect(saveGallery([entry(1)], broken)).toBe(false)
  })

  it('persistNewDrawing drops the oldest until the quota fits', () => {
    const s = fakeStorage(JSON.stringify([entry(1), entry(2), entry(3)]).length + 10)
    let list = []
    for (let i = 1; i <= 5; i++) {
      const r = persistNewDrawing(list, entry(i), s)
      expect(r.saved).toBe(true)
      list = r.list
    }
    expect(list.map((d) => d.id)).toEqual(['d5', 'd4', 'd3'])
    expect(loadGallery(s).map((d) => d.id)).toEqual(['d5', 'd4', 'd3'])
  })

  it('persistNewDrawing reports failure (and keeps the old list) when even one drawing cannot fit', () => {
    const s = fakeStorage(5)
    const before = [entry(1)]
    const r = persistNewDrawing(before, entry(2), s)
    expect(r.saved).toBe(false)
    expect(r.list).toBe(before)
  })
})

// --------------------------------------------------------------------------

describe('coloring templates', () => {
  it('has the blank page plus 8 outlines with unique ids, Hebrew names and emoji', () => {
    expect(TEMPLATES[0]).toBe(BLANK_TEMPLATE)
    expect(TEMPLATES.filter((t) => t.paths.length > 0)).toHaveLength(8)
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length)
    for (const t of TEMPLATES) {
      expect(t.name, t.id).toMatch(HEBREW)
      expect(t.emoji, t.id).toBeTruthy()
      expect(Array.isArray(t.paths), t.id).toBe(true)
    }
    expect(templateById('nope')).toBe(BLANK_TEMPLATE)
    expect(templateById('rocket').id).toBe('rocket')
  })

  it('every path is a valid-looking d string that stays inside the 400x400 box', () => {
    for (const t of TEMPLATES) {
      for (const d of t.paths) {
        expect(typeof d).toBe('string')
        expect(d.trim().startsWith('M'), `${t.id}: ${d}`).toBe(true)
        // arc rotation/flags are also numbers, all of which are in range
        for (const n of d.match(/-?\d+(?:\.\d+)?/g)) {
          expect(Number(n), `${t.id}: ${d}`).toBeGreaterThanOrEqual(0)
          expect(Number(n), `${t.id}: ${d}`).toBeLessThanOrEqual(TEMPLATE_VIEW)
        }
      }
    }
  })

  it('generated ellipses close on themselves and clouds close with Z', () => {
    const e = ellipsePath(100, 100, 40, 20, 30)
    const [start] = e.match(/M(-?[\d.]+ -?[\d.]+)/).slice(1)
    expect(e.endsWith(`${start} Z`)).toBe(true)
    expect(cloudPath(50, 50, 1)).toMatch(/Z$/)
  })
})

// --------------------------------------------------------------------------

describe('palette', () => {
  it('is 14 unique hex colors for every world and includes every base crayon', () => {
    for (const id of THEME_IDS) {
      const p = buildPalette(THEMES[id])
      expect(p, id).toHaveLength(PALETTE_SIZE)
      expect(new Set(p.map((c) => c.toLowerCase())).size, id).toBe(PALETTE_SIZE)
      for (const c of p) expect(c, id).toMatch(HEX)
      for (const c of BASE_COLORS) expect(p, id).toContain(c)
    }
  })

  it('the two extra colors really come from the world', () => {
    const extras = (id) => buildPalette(THEMES[id]).slice(BASE_COLORS.length)
    expect(extras('soccer')).toContain('#eab308')
    expect(extras('space')[0]).toBe('#0891b2')
    expect(extras('ninja')[0]).toBe('#dc2626')
    expect(new Set(THEME_IDS.map((id) => extras(id).join())).size).toBe(THEME_IDS.length)
  })

  it('still fills 14 slots without a theme', () => {
    expect(buildPalette(null)).toHaveLength(PALETTE_SIZE)
  })

  it('brush sizes are three, ascending, with stamp sizes', () => {
    expect(BRUSH_SIZES).toHaveLength(3)
    for (let i = 1; i < BRUSH_SIZES.length; i++) {
      expect(BRUSH_SIZES[i].width).toBeGreaterThan(BRUSH_SIZES[i - 1].width)
      expect(BRUSH_SIZES[i].sticker).toBeGreaterThan(BRUSH_SIZES[i - 1].sticker)
    }
    for (const s of BRUSH_SIZES) expect(s.label).toMatch(HEBREW)
  })

  it('stickers start with the world particles and are unique and capped', () => {
    for (const id of THEME_IDS) {
      const list = stickerList(THEMES[id])
      expect(list.length).toBeLessThanOrEqual(MAX_STICKERS)
      expect(new Set(list).size).toBe(list.length)
      expect(list.slice(0, THEMES[id].particles.length)).toEqual(THEMES[id].particles)
    }
  })
})

// --------------------------------------------------------------------------

describe('canvas coordinate math', () => {
  it('logical space is centred and 1000 units across the shorter side', () => {
    const v = makeView(800, 500, 2)
    expect(v.unit).toBe(500)
    expect(toLogical(400, 250, v)).toEqual({ x: 0, y: 0 })
    expect(toLogical(400, 500, v).y).toBe(500)
    const p = fromLogical(-800, 500, v)
    expect(p).toEqual({ x: 0, y: 500 })
    const rt = toLogical(p.x, p.y, v)
    expect(rt.x).toBeCloseTo(-800)
    expect(rt.y).toBeCloseTo(500)
    expect(logicalRect(v)).toEqual({ x: -800, y: -500, w: 1600, h: 1000 })
  })

  it('a point keeps its place relative to the template square after rotating the tablet', () => {
    const landscape = makeView(1000, 600, 1)
    const portrait = makeView(600, 1000, 1)
    // the centre of the template square: same logical point in both orientations
    const lp = toLogical(500, 300, landscape)
    const pp = toLogical(300, 500, portrait)
    expect(lp).toEqual(pp)
    // template square corner: (200, 0) in landscape maps to (0, 200) in portrait
    const corner = toLogical(200, 0, landscape)
    const back = fromLogical(corner.x, corner.y, portrait)
    expect(back.x).toBeCloseTo(0)
    expect(back.y).toBeCloseTo(200)
  })
})

describe('stroke smoothing', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 20, y: 20 },
  ]

  it('needs at least three points for a curve, two for a tail line', () => {
    expect(segmentsOf([])).toEqual([])
    expect(segmentsOf([pts[0]], { tail: true })).toEqual([])
    expect(segmentsOf(pts.slice(0, 2))).toEqual([])
    expect(segmentsOf(pts.slice(0, 2), { tail: true })).toEqual([{ from: pts[0], ctrl: null, to: pts[1] }])
  })

  it('curves run between midpoints with the sample as control point', () => {
    const segs = segmentsOf(pts)
    expect(segs).toHaveLength(pts.length - 2)
    expect(segs[0]).toEqual({ from: pts[0], ctrl: pts[1], to: { x: 10, y: 5 } })
    expect(segs[1]).toEqual({ from: { x: 10, y: 5 }, ctrl: pts[2], to: { x: 15, y: 10 } })
    // consecutive segments join exactly
    for (let i = 1; i < segs.length; i++) expect(segs[i].from).toEqual(segs[i - 1].to)
    const withTail = segmentsOf(pts, { tail: true })
    expect(withTail).toHaveLength(pts.length - 1)
    expect(withTail.at(-1)).toEqual({ from: { x: 20, y: 15 }, ctrl: null, to: pts[4] })
  })

  it('live incremental segments equal the full replay (what she sees is what gets saved)', () => {
    const live = []
    for (let n = 1; n <= pts.length; n++) {
      const seg = lastSegment(pts.slice(0, n))
      if (seg) live.push(seg)
    }
    live.push(tailSegment(pts))
    expect(live).toEqual(segmentsOf(pts, { tail: true }))
    expect(lastSegment(pts.slice(0, 2))).toBeNull()
    expect(tailSegment([pts[0]])).toBeNull()
  })

  it('farEnough filters jitter and accepts the first point', () => {
    expect(farEnough(null, pts[0])).toBe(true)
    expect(farEnough({ x: 0, y: 0 }, { x: 1, y: 1 }, 2)).toBe(false)
    expect(farEnough({ x: 0, y: 0 }, { x: 2, y: 0 }, 2)).toBe(true)
  })

  it('rainbow hue cycles within [0, 360)', () => {
    for (const len of [0, 100, 719, 720, 5000, -10]) {
      const h = hueAt(len)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
    expect(hueAt(0)).toBe(0)
    expect(hueAt(720)).toBe(0)
    expect(hueAt(100)).not.toBe(hueAt(200))
  })

  it('replays a stroke as one dot plus a stroke per segment, rainbow changing color', () => {
    const rec = (op) => {
      const calls = { arc: 0, stroke: 0, colors: new Set() }
      const ctx = {
        beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, fill() {},
        arc() { calls.arc++ },
        stroke() { calls.stroke++; calls.colors.add(ctx.strokeStyle) },
      }
      drawStrokeOp(ctx, op)
      return calls
    }
    const plain = rec({ type: 'stroke', tool: 'brush', color: '#ff0000', width: 10, points: pts })
    expect(plain.arc).toBe(1)
    expect(plain.stroke).toBe(pts.length - 1)
    expect([...plain.colors]).toEqual(['#ff0000'])
    const rainbow = rec({ type: 'stroke', tool: 'rainbow', color: '#ff0000', width: 10, points: pts })
    expect(rainbow.colors.size).toBeGreaterThan(1)
    expect(rec({ type: 'stroke', tool: 'brush', color: '#000', width: 10, points: [] }).arc).toBe(0)
  })
})

describe('save / reopen sizing', () => {
  it('fitWithin downscales the long side to the max and never upscales', () => {
    expect(fitWithin(1280, 800, 640)).toEqual({ w: 640, h: 400, scale: 0.5 })
    expect(fitWithin(800, 1280, 640)).toEqual({ w: 400, h: 640, scale: 0.5 })
    expect(fitWithin(300, 200, 640)).toEqual({ w: 300, h: 200, scale: 1 })
    expect(fitWithin(1000, 333, 640).h).toBe(213)
  })

  it('squareRect is the centred template square', () => {
    expect(squareRect(640, 400)).toEqual({ x: 120, y: 0, s: 400 })
    expect(squareRect(400, 640)).toEqual({ x: 0, y: 120, s: 400 })
  })

  it('containRect fits and centres an image inside a box', () => {
    const box = { x: -800, y: -500, w: 1600, h: 1000 }
    expect(containRect(640, 400, box)).toEqual({ x: -800, y: -500, w: 1600, h: 1000 })
    expect(containRect(400, 400, box)).toEqual({ x: -500, y: -500, w: 1000, h: 1000 })
    expect(containRect(0, 0, box).w).toBe(0)
  })

  it('bytesOfDataUrl measures the decoded payload', () => {
    expect(bytesOfDataUrl('data:image/png;base64,AAAA')).toBe(3)
    expect(bytesOfDataUrl('data:image/png;base64,AAA=')).toBe(2)
    expect(bytesOfDataUrl('data:image/png;base64,AA==')).toBe(1)
    expect(bytesOfDataUrl('nope')).toBe(0)
    // a 150 KB budget corresponds to ~200 KB of base64 text
    expect(bytesOfDataUrl('data:image/jpeg;base64,' + 'A'.repeat(204800))).toBe(153600)
  })

  it('lastBg is the latest bucket fill, white by default', () => {
    expect(lastBg([])).toBe('#ffffff')
    expect(lastBg([{ type: 'bg', color: '#123456' }, { type: 'stroke' }, { type: 'bg', color: '#abcdef' }, { type: 'sticker' }])).toBe('#abcdef')
  })
})
