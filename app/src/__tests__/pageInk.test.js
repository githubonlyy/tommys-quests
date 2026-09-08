import { describe, it, expect } from 'vitest'
import {
  toGray,
  boxBlurGray,
  boxBlurF32,
  backgroundField,
  flatField,
  paperLevel,
  autoTrimBounds,
  paperIsIsland,
  clearOffPaper,
  adaptiveCuts,
  keyToAlpha,
  processPage,
  PAPER_CUT,
  INK_CUT,
  TRIM_MAX,
  TRIM_SAFE,
  TRIM_BLEED_KEEP,
  TRIM_MIN_PAPER,
  TRIM_PAPER_FRAC,
  clamp255,
} from '../world/draw/pageInk.js'
import { pageMetaFromPath, pagesFromGlob, loadPageModes, savePageMode, MODE_OPACITY } from '../world/draw/familyPages.js'

/** ImageData-shaped buffer from a (x,y) -> [r,g,b] function */
function make(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

/**
 * Stand-in for the reference photo: a printed coloring page shot on a table —
 * cream paper, a lighting gradient across it, black pen strokes, and the dark
 * table visible along the top and left edges.
 */
function photographedPage(w = 220, h = 300) {
  const bandTop = Math.round(h * 0.06)
  const bandLeft = Math.round(w * 0.05)
  return make(w, h, (x, y) => {
    if (y < bandTop || x < bandLeft) return [92, 68, 48] // wooden table
    // cream paper, brighter top-left, dimmer bottom-right
    const shade = 1 - 0.22 * ((x / w) * 0.5 + (y / h) * 0.5)
    const paper = [242 * shade, 237 * shade, 228 * shade]
    // strokes: a border box and a diagonal, 2px wide
    const inBox =
      (Math.abs(x - w * 0.25) < 1.5 || Math.abs(x - w * 0.75) < 1.5) && y > h * 0.25 && y < h * 0.75
    const inRule = Math.abs((y - h * 0.25) - (x - w * 0.25)) < 1.5 && x > w * 0.25 && x < w * 0.75
    return inBox || inRule ? [28, 26, 24] : paper
  })
}

/**
 * What a phone actually produces: the page lands in the MIDDLE of the frame,
 * filling about 55% of it, with desk all round — not edge to edge. `tilt` puts
 * the page on a slight angle, the way it lands on a table.
 */
const FRAME = { w: 300, h: 400, fill: 0.55 }
function pageInFrame({ w = FRAME.w, h = FRAME.h, fill = FRAME.fill, tilt = 0 } = {}) {
  const pw = w * fill
  const ph = h * fill
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const t = (tilt * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  return make(w, h, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const px = dx * cos + dy * sin // into the page's own frame
    const py = -dx * sin + dy * cos
    if (Math.abs(px) > pw / 2 || Math.abs(py) > ph / 2) return [58, 44, 34] // desk
    const shade = 1 - 0.18 * ((px / pw + 0.5) * 0.5 + (py / ph + 0.5) * 0.5)
    const ink =
      (Math.abs(px) < 1.5 && Math.abs(py) < ph * 0.3) || (Math.abs(py) < 1.5 && Math.abs(px) < pw * 0.3)
    return ink ? [26, 26, 24] : [243 * shade, 238 * shade, 229 * shade]
  })
}
/** where the paper really is in that frame */
const framePaper = ({ w = FRAME.w, h = FRAME.h, fill = FRAME.fill } = {}) => ({
  left: Math.round((w - 1) / 2 - (w * fill) / 2),
  top: Math.round((h - 1) / 2 - (h * fill) / 2),
})

/**
 * The other kind of page: a full-bleed scan, paper running off all four edges,
 * with a solid title band inked right to the top one. The band is not paper, so
 * it falls outside the paper's bounding box and the trim would like to eat it —
 * but it is somebody's artwork, not a desk.
 */
function bleedPage({ w = 240, h = 320, band = 0.3 } = {}) {
  const bandH = Math.round(h * band)
  return make(w, h, (x, y) => {
    if (y < bandH) return [18, 18, 18]
    const onLine = Math.abs(x - w * 0.5) < 2 || Math.abs(y - h * 0.7) < 2
    return onLine ? [24, 24, 22] : [246, 244, 240]
  })
}

/** A page with a solid filled shape on it — black hair, a title bar, a thick frame. */
function filledShape(w = 320, h = 320, side = 170) {
  const lo = Math.round((w - side) / 2)
  const hi = lo + side - 1
  return make(w, h, (x, y) => (x >= lo && x <= hi && y >= lo && y <= hi ? [22, 20, 20] : [245, 243, 238]))
}

const alphaAt = (out, x, y) => out.data[(y * out.width + x) * 4 + 3]
/** how much of a frame reads as paper — what TRIM_MIN_PAPER is measured against */
function paperArea(img) {
  const gray = toGray(img)
  const cut = paperLevel(gray) * TRIM_PAPER_FRAC
  let n = 0
  for (let i = 0; i < gray.length; i++) if (gray[i] >= cut) n++
  return n / gray.length
}
function opaqueFraction(out, over = 128) {
  let n = 0
  for (let i = 3; i < out.data.length; i += 4) if (out.data[i] > over) n++
  return n / (out.width * out.height)
}

describe('boxBlurGray', () => {
  it('leaves a flat field flat', () => {
    const g = new Uint8ClampedArray(40 * 40).fill(180)
    const out = boxBlurGray(g, 40, 40, 4)
    expect([...out].every((v) => Math.abs(v - 180) <= 1)).toBe(true)
  })

  it('spreads an impulse and conserves brightness order', () => {
    const g = new Uint8ClampedArray(21 * 21)
    g[10 * 21 + 10] = 255
    const out = boxBlurGray(g, 21, 21, 3)
    expect(out[10 * 21 + 10]).toBeGreaterThan(0)
    expect(out[10 * 21 + 10]).toBeLessThan(255)
    // compare against a pixel outside the kernel (radius 3), not inside it
    expect(out[10 * 21 + 10]).toBeGreaterThan(out[10 * 21 + 18])
  })

  it('radius 0 is a copy', () => {
    const g = Uint8ClampedArray.from({ length: 25 }, (_, i) => i * 10)
    expect([...boxBlurGray(g, 5, 5, 0)]).toEqual([...g])
  })
})

describe('flatField', () => {
  it('flattens a lighting gradient on blank paper', () => {
    const w = 120
    const h = 120
    const img = make(w, h, (x) => {
      const v = 240 - (x / w) * 60 // bright left, dim right
      return [v, v - 4, v - 10]
    })
    const flat = flatField(toGray(img), w, h)
    const mid = []
    for (let x = 10; x < w - 10; x++) mid.push(flat[60 * w + x])
    const min = Math.min(...mid)
    const max = Math.max(...mid)
    expect(max - min).toBeLessThan(0.03) // uniform after correction
    expect(min).toBeGreaterThan(PAPER_CUT) // and reads as paper
  })

  it('keeps thin dark strokes dark', () => {
    const w = 120
    const h = 120
    const img = make(w, h, (x) => (Math.abs(x - 60) < 1.5 ? [20, 20, 20] : [235, 232, 224]))
    const flat = flatField(toGray(img), w, h)
    expect(flat[60 * w + 60]).toBeLessThan(0.3)
    expect(flat[60 * w + 20]).toBeGreaterThan(PAPER_CUT)
  })
})

describe('paperLevel', () => {
  it('finds the bright mode of cream paper', () => {
    const img = photographedPage()
    const level = paperLevel(toGray(img))
    expect(level).toBeGreaterThan(150)
    expect(level).toBeLessThan(256)
  })
})

describe('autoTrimBounds', () => {
  it('crops the table band off a photographed page', () => {
    const img = photographedPage()
    const b = autoTrimBounds(toGray(img), img.width, img.height)
    expect(b.top).toBeGreaterThan(0)
    expect(b.left).toBeGreaterThan(0)
    expect(b.width).toBeLessThan(img.width)
  })

  it('never trims more than the cap, even on an all-dark image', () => {
    const w = 100
    const h = 100
    const dark = make(w, h, () => [20, 20, 20])
    const b = autoTrimBounds(toGray(dark), w, h)
    expect(b.top).toBeLessThanOrEqual(Math.floor(h * 0.15))
    expect(b.left).toBeLessThanOrEqual(Math.floor(w * 0.15))
    expect(b.width).toBeGreaterThan(w * 0.7)
  })

  it('leaves a clean page untouched', () => {
    const w = 80
    const h = 80
    const clean = make(w, h, () => [252, 252, 250])
    const b = autoTrimBounds(toGray(clean), w, h)
    expect(b).toMatchObject({ left: 0, top: 0, width: w, height: h })
  })
})

describe('keyToAlpha', () => {
  it('paper becomes transparent, ink becomes opaque black', () => {
    const w = 4
    const h = 1
    const flat = new Float32Array([1, 0.95, 0.5, 0.2])
    const { data } = keyToAlpha(flat, w, h)
    expect(data[3]).toBe(0) // pure white -> transparent
    expect(data[7]).toBe(0) // above paperCut -> transparent
    expect(data[11]).toBe(255) // below inkCut -> solid
    expect(data[15]).toBe(255)
    expect([data[8], data[9], data[10]]).toEqual([0, 0, 0]) // colour forced black
  })

  it('ramps mid-tones instead of clipping them', () => {
    const flat = new Float32Array([(0.86 + 0.62) / 2])
    const { data } = keyToAlpha(flat, 1, 1)
    expect(data[3]).toBeGreaterThan(100)
    expect(data[3]).toBeLessThan(160)
  })
})

describe('processPage on a photographed page', () => {
  const img = photographedPage()
  const out = processPage(img)

  it('trims the table and returns a smaller page', () => {
    expect(out.width).toBeLessThan(img.width)
    expect(out.height).toBeLessThan(img.height)
    expect(out.bounds.top).toBeGreaterThan(0)
  })

  it('makes the cream paper fully transparent', () => {
    // sample well inside the page, away from the strokes
    const at = (x, y) => out.data[(y * out.width + x) * 4 + 3]
    expect(at(Math.round(out.width * 0.5), Math.round(out.height * 0.1))).toBe(0)
    expect(at(Math.round(out.width * 0.9), Math.round(out.height * 0.9))).toBe(0)
  })

  it('keeps the strokes as opaque black ink', () => {
    let inked = 0
    for (let i = 3; i < out.data.length; i += 4) if (out.data[i] > 200) inked++
    expect(inked).toBeGreaterThan(100) // the strokes survived
    const ratio = inked / (out.width * out.height)
    expect(ratio).toBeLessThan(0.2) // but the page did not go black
  })

  it('every opaque pixel is black, not tinted', () => {
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] > 0) {
        expect(out.data[i]).toBe(0)
        expect(out.data[i + 1]).toBe(0)
        expect(out.data[i + 2]).toBe(0)
      }
    }
  })
})

describe('boxBlurF32', () => {
  it('keeps the fractions a mask blur is made of', () => {
    const mask = new Float32Array(9 * 9)
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) mask[y * 9 + x] = 1
    const out = boxBlurF32(mask, 9, 9, 2)
    const edge = out[4 * 9 + 4] // half in the mask, half out
    expect(edge).toBeGreaterThan(0.2)
    expect(edge).toBeLessThan(0.8)
    expect(out[4 * 9 + 0]).toBeCloseTo(1, 5) // deep inside is still fully supported
  })
})

describe('backgroundField', () => {
  // A mean of everything is BLACK in the middle of a filled shape, so the shape
  // divides itself back to white and keys to transparent. The estimate has to
  // stay at the paper's level there instead.
  it('does not follow the ink into the middle of a filled shape', () => {
    const img = filledShape()
    const gray = toGray(img)
    const bg = backgroundField(gray, img.width, img.height)
    const centre = bg[Math.round(img.height / 2) * img.width + Math.round(img.width / 2)]
    expect(centre).toBeGreaterThan(200) // the paper is ~244; the ink is 20
  })

  it('still follows a lighting gradient across blank paper', () => {
    const w = 160
    const h = 160
    const img = make(w, h, (x) => {
      const v = 240 - (x / w) * 60
      return [v, v - 4, v - 10]
    })
    const bg = backgroundField(toGray(img), w, h)
    expect(bg[80 * w + 10]).toBeGreaterThan(bg[80 * w + w - 10] + 30) // bright end vs dim end
  })
})

describe('a filled shape keeps its inside', () => {
  const img = filledShape()
  const out = processPage(img)
  const side = 170
  const lo = Math.round((img.width - side) / 2)
  const hi = lo + side - 1

  it('is solid in the middle, not a ring with a hole in it', () => {
    expect(alphaAt(out, Math.round(img.width / 2), Math.round(img.height / 2))).toBe(255)
  })

  it('is solid EVERYWHERE inside, not just near its edge', () => {
    let weakest = 255
    for (let y = lo + 4; y <= hi - 4; y++) {
      for (let x = lo + 4; x <= hi - 4; x++) weakest = Math.min(weakest, alphaAt(out, x, y))
    }
    expect(weakest).toBe(255)
  })

  it('leaves the paper around it transparent', () => {
    expect(alphaAt(out, 10, 10)).toBe(0)
    expect(alphaAt(out, img.width - 10, 10)).toBe(0)
  })
})

describe('a page that fills only the middle of the frame', () => {
  const img = pageInFrame()
  const paper = framePaper()
  const cap = Math.floor(FRAME.w * 0.15) // what the old 15% cap allowed

  it('trims all the way to the paper, far past the old 15% cap', () => {
    const b = autoTrimBounds(toGray(img), img.width, img.height)
    expect(cap).toBeLessThan(paper.left) // the fixture really does need more than 15%
    expect(b.left).toBeGreaterThan(cap)
    expect(Math.abs(b.left - paper.left)).toBeLessThanOrEqual(2)
    expect(Math.abs(b.top - paper.top)).toBeLessThanOrEqual(2)
    expect(b.width).toBeLessThanOrEqual(Math.round(FRAME.w * FRAME.fill) + 2)
  })

  it('leaves no black band of desk behind', () => {
    const out = processPage(img)
    expect(opaqueFraction(out)).toBeLessThan(0.03) // the strokes are well under 1%
  })

  it('keeps a tilted page whole instead of stopping at the first clipped corner', () => {
    const tilted = pageInFrame({ tilt: 3 })
    const b = autoTrimBounds(toGray(tilted), tilted.width, tilted.height)
    // a tilted page reaches FURTHER out than a straight one, and the box has to
    // hold all of it — but still nowhere near the whole frame
    expect(b.left).toBeGreaterThan(cap)
    expect(b.left).toBeLessThan(paper.left)
    expect(b.top).toBeLessThan(paper.top)
    expect(b.width).toBeLessThan(FRAME.w * 0.7)
    expect(opaqueFraction(processPage(tilted))).toBeLessThan(0.05)
  })

  it('leaves a dark drawing whole when there is barely any paper in the frame', () => {
    // not a photographed page at all — a drawing that happens to be dark, and
    // the safety net could only chew 35% off each side of it
    const w = 120
    const h = 120
    const dark = make(w, h, (x, y) => (x > 90 && y > 90 ? [245, 245, 240] : [30, 28, 28]))
    expect(autoTrimBounds(toGray(dark), w, h)).toMatchObject({ left: 0, top: 0, width: w, height: h })
  })

  it('still refuses to eat more than the cap when there is no paper at all', () => {
    const w = 100
    const h = 100
    const dark = make(w, h, () => [20, 20, 20])
    const b = autoTrimBounds(toGray(dark), w, h)
    expect(b.left).toBeLessThanOrEqual(Math.floor(w * TRIM_MAX))
    expect(b.width).toBeGreaterThan(w * (1 - 2 * TRIM_MAX))
  })
})

describe('paperIsIsland', () => {
  const cut = 176

  it('sees frame all round a page photographed on a desk', () => {
    expect(paperIsIsland(toGray(pageInFrame({ fill: 0.25 })), FRAME.w, FRAME.h, cut)).toBe(true)
  })

  it('says no when the paper runs off the edge of the picture', () => {
    // the dark drawing: its paper reaches the corner of the frame, so the dark
    // parts are artwork, not furniture
    const w = 120
    const h = 120
    const dark = make(w, h, (x, y) => (x > 90 && y > 90 ? [245, 245, 240] : [30, 28, 28]))
    expect(paperIsIsland(toGray(dark), w, h, cut)).toBe(false)
  })

  it('is not flipped by a highlight on the table edge', () => {
    // measured against the PAPER, not against the border, so a few bright pixels
    // at the edge of the frame cannot turn a page into a drawing
    const img = pageInFrame({ fill: 0.25 })
    for (let x = 20; x < 60; x++) {
      for (let y = 0; y < 3; y++) {
        const i = (y * FRAME.w + x) * 4
        img.data[i] = 244
        img.data[i + 1] = 242
        img.data[i + 2] = 236
      }
    }
    expect(paperIsIsland(toGray(img), FRAME.w, FRAME.h, cut)).toBe(true)
  })

  it('says no when there is no paper at all', () => {
    const dark = make(40, 40, () => [20, 20, 20])
    expect(paperIsIsland(toGray(dark), 40, 40, cut)).toBe(false)
  })
})

// REGRESSION: a photo taken from a distance keyed to a near-solid black sheet.
// Under TRIM_MIN_PAPER the trim keeps the whole frame, and a paper-only
// background then hands the DESK the page's paper level — the desk divides to
// about 0.16 and keys as solid ink. Measured over this sweep, the opaque
// fraction jumped from 0.023 to 0.72 the moment the page dropped under 8% of
// the frame: an almost entirely black rectangle over his painting.
describe('a page too small in the frame to trim to', () => {
  const sweep = [0.5, 0.45, 0.4, 0.35, 0.32, 0.3, 0.29, 0.285, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.15]

  it('crosses the threshold — the fixture really does exercise both sides', () => {
    const sides = sweep.map((fill) => autoTrimBounds(toGray(pageInFrame({ fill })), FRAME.w, FRAME.h).trusted)
    expect(sides).toContain(true)
    expect(sides).toContain(false)
    // and the guard is what does it: the paper area straddles 8% right there
    expect(paperArea(pageInFrame({ fill: 0.29 }))).toBeGreaterThan(TRIM_MIN_PAPER)
    expect(paperArea(pageInFrame({ fill: 0.285 }))).toBeLessThan(TRIM_MIN_PAPER)
  })

  it('has no cliff anywhere in the sweep', () => {
    let worst = 0
    let step = 0
    let prev = null
    for (const fill of sweep) {
      const opaque = opaqueFraction(processPage(pageInFrame({ fill })))
      worst = Math.max(worst, opaque)
      if (prev !== null) step = Math.max(step, Math.abs(opaque - prev))
      prev = opaque
    }
    expect(worst).toBeLessThan(0.12) // it was 0.72 and rising, right across the guard
    expect(step).toBeLessThan(0.1)
  })

  it('keys the untrimmed desk transparent instead of black', () => {
    const img = pageInFrame({ fill: 0.25 })
    const b = autoTrimBounds(toGray(img), FRAME.w, FRAME.h)
    expect(b).toMatchObject({ left: 0, top: 0, width: FRAME.w, height: FRAME.h, trusted: false, island: true })
    const out = processPage(img)
    expect(alphaAt(out, 10, 10)).toBe(0) // deep desk, far from the page
    expect(alphaAt(out, FRAME.w - 10, FRAME.h - 10)).toBe(0)
    expect(opaqueFraction(out)).toBeLessThan(0.05)
  })

  it('still keeps a dark drawing solid — that is artwork, not a desk', () => {
    // the same "barely any paper" frame, but the paper runs off the corner, so
    // the self-normalising fallback must NOT be used or the drawing vanishes
    const w = 120
    const h = 120
    const dark = make(w, h, (x, y) => (x > 90 && y > 90 ? [245, 245, 240] : [30, 28, 28]))
    const out = processPage(dark)
    expect(alphaAt(out, 20, 20)).toBe(255)
    expect(opaqueFraction(out)).toBeGreaterThan(0.5)
  })
})

// REGRESSION: raising TRIM_MAX from 15% to 35% raised the ceiling on how much
// real artwork the trim can eat. A solid band inked to the top of a full-bleed
// scan is not paper, so it falls outside the paper's bounding box: a 30% band
// was cropped away whole. The desk is what the big cap is for, and a desk
// SURROUNDS a page — so a side with paper running off both the others has no
// desk beside it and keeps the old conservative cap.
describe('a full-bleed page with a solid band inked to the top edge', () => {
  const w = 240
  const h = 320
  const cap = Math.floor(h * TRIM_SAFE)

  it('does not eat the band past the conservative cap', () => {
    for (const band of [0.2, 0.3, 0.4]) {
      const b = autoTrimBounds(toGray(bleedPage({ w, h, band })), w, h)
      expect(b.top).toBeLessThanOrEqual(cap) // 160px of a 320px page was going
      expect(Math.round(h * band)).toBeGreaterThan(b.top) // some band survives
    }
  })

  it('keeps the paper edges it was never meant to touch', () => {
    const b = autoTrimBounds(toGray(bleedPage({ w, h, band: 0.3 })), w, h)
    expect(b.left).toBe(0)
    expect(b.right).toBe(w - 1)
    expect(b.bottom).toBe(h - 1)
    expect(b.island).toBe(false) // paper runs off the frame: no desk anywhere
  })

  it('keys the band it kept as solid ink, not as paper', () => {
    const out = processPage(bleedPage({ w, h, band: 0.3 }))
    expect(alphaAt(out, Math.round(w / 2), 3)).toBe(255)
    expect(alphaAt(out, 4, 3)).toBe(255)
    expect(alphaAt(out, 20, out.height - 20)).toBe(0) // paper below it, away from the strokes
  })

  it('still lets the big cap eat a real desk band on a photographed page', () => {
    // the conservative cap is only for a side with no desk beside it. Here the
    // desk is genuinely 22% down the top of the frame and has to go.
    const img = pageInFrame()
    const b = autoTrimBounds(toGray(img), FRAME.w, FRAME.h)
    expect(b.top).toBeGreaterThan(Math.floor(FRAME.h * TRIM_SAFE))
    expect(Math.abs(b.top - framePaper().top)).toBeLessThanOrEqual(2)
  })
})

// REGRESSION: the cap on a bleed side limits how much of the strip goes and
// promises nothing about what stays, so a band THINNER than the cap sat inside
// it at full size and was cut away to the last row. Measured: crop.top came
// back exactly equal to the band for every band at or under the cap — 3%, 5%,
// 8%, 10%, 12%, 14%, 15% all lost 100% of themselves, while a 30% band kept two
// thirds. TRIM_BLEED_KEEP is the floor that was missing.
describe('a solid band too thin to reach the bleed cap', () => {
  const w = 240
  const h = 320
  const thin = [0.03, 0.05, 0.08, 0.1, 0.12, 0.14, 0.15]

  it('never eats a whole band, however thin', () => {
    for (const band of thin) {
      const px = Math.round(h * band)
      const b = autoTrimBounds(toGray(bleedPage({ w, h, band })), w, h)
      expect(b.top).toBeLessThan(px) // it was exactly px — the entire band
    }
  })

  it('keeps the same share of a thin band as of a thick one', () => {
    // the invariant the cap alone could not give: a bleed side always keeps
    // TRIM_BLEED_KEEP of its own strip, whether the cap binds or not
    for (const band of [...thin, 0.16, 0.2, 0.3, 0.4]) {
      const px = Math.round(h * band)
      const b = autoTrimBounds(toGray(bleedPage({ w, h, band })), w, h)
      expect(px - b.top).toBeGreaterThanOrEqual(Math.floor(px * TRIM_BLEED_KEEP))
    }
  })

  it('keys the surviving sliver as ink, so the band is still visible', () => {
    const out = processPage(bleedPage({ w, h, band: 0.1 }))
    expect(alphaAt(out, Math.round(w / 2), 1)).toBe(255)
    expect(alphaAt(out, 20, out.height - 20)).toBe(0) // paper below it
  })

  it('does the same on the bottom edge', () => {
    const bottomBand = ({ band }) => {
      const bandH = Math.round(h * band)
      return make(w, h, (x, y) =>
        y >= h - bandH ? [18, 18, 18] : Math.abs(x - w * 0.5) < 2 ? [24, 24, 22] : [246, 244, 240],
      )
    }
    for (const band of [0.05, 0.1, 0.2, 0.3]) {
      const px = Math.round(h * band)
      const b = autoTrimBounds(toGray(bottomBand({ band })), w, h)
      const eaten = h - 1 - b.bottom
      expect(eaten).toBeLessThan(px)
      expect(px - eaten).toBeGreaterThanOrEqual(Math.floor(px * TRIM_BLEED_KEEP))
    }
  })
})

/**
 * A page on a table light enough to be mistaken for paper. `desk` is the table's
 * own grey and `grain` its texture — a wooden table under room light is never
 * one flat tone, and the grain is what used to push the level over the edge.
 * Deterministic: the same call always produces the same picture.
 */
function pageOnLightDesk({ desk = 150, grain = 0, fill = 0.55 } = {}) {
  const { w, h } = FRAME
  const pw = Math.round(w * fill)
  const ph = Math.round(h * fill)
  const x0 = Math.round((w - pw) / 2)
  const y0 = Math.round((h - ph) / 2)
  let seed = 1
  const noise = new Float32Array(w * h)
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    noise[i] = ((seed / 0x7fffffff) * 2 - 1) * grain
  }
  return make(w, h, (x, y) => {
    if (x < x0 || x >= x0 + pw || y < y0 || y >= y0 + ph) {
      const v = clamp255(desk + noise[y * w + x])
      return [v, v, v]
    }
    const shade = 217 - ((y - y0) / ph) * 24 // a real sheet is never one tone either
    const v = Math.abs(x - (x0 + pw / 2)) < 2 ? 30 : shade
    return [v, v, v]
  })
}
const deskPaper = () => ({
  left: Math.round((FRAME.w - Math.round(FRAME.w * FRAME.fill)) / 2),
  top: Math.round((FRAME.h - Math.round(FRAME.h * FRAME.fill)) / 2),
})

// LATENT BUG, and the nastiest kind: nothing here was ever wrong on the pages it
// was tested with, because they were all photographed on a dark table. On a
// table brighter than PAPER_DARK the histogram has two bright modes and the
// TABLE's is the taller one — there is more table than page — so paperLevel came
// back with the furniture's brightness. Every threshold downstream is a fraction
// of that number: the crop then finds "paper" over the whole frame and never
// fires, and a table with any grain in it keys as ink. Worst measured before the
// fix: a quarter of the frame solid black on a grey table with texture, and the
// crop a no-op at every page size.
describe('the paper level on a page photographed on a light table', () => {
  const { w, h } = FRAME

  it('reads the table, not the page, from the histogram alone', () => {
    // the trap itself, pinned down: with nothing but the numbers to go on, the
    // tallest bright mode IS the table, and that is not a bug in the counting
    const gray = toGray(pageOnLightDesk({ desk: 150 }))
    expect(paperLevel(gray)).toBe(150)
  })

  it('reads the page once it can see where the bright pixels are', () => {
    for (const desk of [58, 90, 120, 140, 150]) {
      const gray = toGray(pageOnLightDesk({ desk }))
      expect(paperLevel(gray, w, h)).toBeGreaterThan(190) // the sheet is 193..217
    }
  })

  it('crops to the page on a light table, which it never used to', () => {
    for (const desk of [120, 140, 150]) {
      const b = autoTrimBounds(toGray(pageOnLightDesk({ desk })), w, h)
      expect(b.width).toBe(Math.round(w * FRAME.fill))
      expect(b.height).toBe(Math.round(h * FRAME.fill))
      expect(Math.abs(b.left - deskPaper().left)).toBeLessThanOrEqual(2)
      expect(Math.abs(b.top - deskPaper().top)).toBeLessThanOrEqual(2)
    }
  })

  it('is not thrown off by the grain in the table', () => {
    // this is what used to produce the black sheet: grain across PAPER_DARK
    for (const grain of [0, 8, 15, 25]) {
      const gray = toGray(pageOnLightDesk({ desk: 120, grain }))
      expect(paperLevel(gray, w, h)).toBeGreaterThan(190)
      const b = autoTrimBounds(gray, w, h)
      expect(b.width).toBe(Math.round(w * FRAME.fill))
    }
  })

  it('keeps the sheet transparent over the whole table-and-grain grid', () => {
    let worst = 0
    for (const desk of [58, 90, 120, 140, 150, 155, 160, 170, 190, 210]) {
      for (const grain of [0, 8, 15, 25]) {
        worst = Math.max(worst, opaqueFraction(processPage(pageOnLightDesk({ desk, grain }))))
      }
    }
    expect(worst).toBeLessThan(0.06) // it reached 0.12 here, and far more elsewhere
  })

  // The other half of the fix, and the important half: moving the level up is
  // only safe when the crop then removes the table. A table too bright to cut
  // away must keep the tall mode — it stays in frame either way, and a table
  // that no longer counts as background keys SOLID BLACK. Raising the level
  // without checking cost 70% of the frame in exactly this range.
  it('leaves the level alone when the table is too bright to crop away', () => {
    for (const desk of [155, 160, 165, 170, 180, 190, 210]) {
      const gray = toGray(pageOnLightDesk({ desk }))
      expect(paperLevel(gray, w, h)).toBe(desk)
      expect(opaqueFraction(processPage(pageOnLightDesk({ desk })))).toBeLessThan(0.02)
    }
  })

  it('leaves a dark drawing that runs off the frame alone', () => {
    // no table around it, so nothing to promote: the bright corner is not an
    // island and the level must not move, or the drawing keys away
    const dark = make(120, 120, (x, y) => (x > 90 && y > 90 ? [245, 245, 240] : [30, 28, 28]))
    const gray = toGray(dark)
    expect(paperLevel(gray, 120, 120)).toBe(paperLevel(gray))
    expect(alphaAt(processPage(dark), 20, 20)).toBe(255)
  })

  it('leaves a full-bleed scan alone', () => {
    const gray = toGray(bleedPage({ band: 0.3 }))
    expect(paperLevel(gray, 240, 320)).toBe(paperLevel(gray))
  })
})

describe('clearOffPaper', () => {
  const w = 10
  const h = 3
  // row 0: paper in the middle only; row 1: no paper at all; row 2: all paper
  const gray = new Uint8ClampedArray([
    30, 30, 30, 240, 240, 240, 240, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    240, 240, 240, 240, 240, 240, 240, 240, 240, 240,
  ])
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
  clearOffPaper(rgba, gray, w, h, { pad: 0 })
  const a = (x, y) => rgba[(y * w + x) * 4 + 3]

  it('clears the desk beside the paper', () => {
    expect(a(0, 0)).toBe(0)
    expect(a(9, 0)).toBe(0)
    expect(a(4, 0)).toBe(255) // on the paper
  })

  it('leaves a row with no paper alone — that is ink, not desk', () => {
    expect(a(0, 1)).toBe(255)
    expect(a(5, 1)).toBe(255)
  })

  it('leaves a full row of paper alone', () => {
    expect(a(0, 2)).toBe(255)
  })
})

describe('adaptiveCuts', () => {
  it('reproduces the fixed pair on a black-ink page', () => {
    const w = 160
    const h = 160
    const art = make(w, h, (x, y) =>
      Math.abs(x - 80) < 1.5 || Math.abs(y - 80) < 1.5 ? [0, 0, 0] : [255, 255, 255],
    )
    const cuts = adaptiveCuts(flatField(toGray(art), w, h))
    expect(cuts.inkCut).toBeCloseTo(INK_CUT, 1)
    expect(cuts.paperCut).toBeGreaterThanOrEqual(PAPER_CUT)
  })

  it('leaves the ramp alone on a page with nothing on it', () => {
    const blank = make(64, 64, () => [246, 244, 240])
    expect(adaptiveCuts(flatField(toGray(blank), 64, 64)).inkCut).toBe(INK_CUT)
  })
})

describe('a page drawn in light pencil', () => {
  const w = 200
  const h = 200
  const img = make(w, h, (x, y) => {
    const onLine = Math.abs(x - w * 0.5) < 2 || Math.abs(y - h * 0.6) < 2
    return onLine ? [188, 186, 184] : [246, 244, 240] // faint graphite on white
  })
  const out = processPage(img)

  it('comes out dark enough to see', () => {
    // fixed cuts put this line at ~95/255, and the faint display mode then
    // multiplied it down to ~21 — a page that looked blank
    expect(alphaAt(out, Math.round(w * 0.5), 20)).toBeGreaterThan(200)
  })

  it('is still visible in the faint display mode', () => {
    expect(alphaAt(out, Math.round(w * 0.5), 20) * MODE_OPACITY.trace).toBeGreaterThan(40)
  })

  it('does not drag the paper along with it', () => {
    expect(alphaAt(out, 20, 20)).toBe(0)
    expect(opaqueFraction(out)).toBeLessThan(0.05)
  })
})

describe('family page discovery', () => {
  it('derives a Hebrew-friendly name and slug id from the filename', () => {
    expect(pageMetaFromPath('../../../coloring-pages/סבתא.png')).toMatchObject({ name: 'סבתא', vector: false })
    expect(pageMetaFromPath('../../../coloring-pages/the_dog.svg')).toMatchObject({ name: 'the dog', vector: true })
    // upper-case extension, and the id carries the extension so סבתא.png and
    // סבתא.jpg stay two different pages
    expect(pageMetaFromPath('../../../coloring-pages/Tommy-2026.JPG').id).toBe('family-tommy-2026-jpg')
  })

  it('maps and sorts a glob result', () => {
    const pages = pagesFromGlob({ '../../../coloring-pages/ב.png': '/b.png', '../../../coloring-pages/א.png': '/a.png' })
    expect(pages.map((p) => p.name)).toEqual(['א', 'ב'])
    expect(pages[0]).toMatchObject({ url: '/a.png', kind: 'image' })
  })

  it('handles an empty folder', () => {
    expect(pagesFromGlob({})).toEqual([])
    expect(pagesFromGlob(undefined)).toEqual([])
  })
})

describe('page display modes', () => {
  const mem = () => {
    const store = new Map()
    return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  }

  it('remembers a per-page choice', () => {
    const s = mem()
    const next = savePageMode({}, 'family-סבתא', 'trace', s)
    expect(next['family-סבתא']).toBe('trace')
    expect(loadPageModes(s)).toEqual(next)
  })

  it('survives unusable storage', () => {
    const broken = { getItem: () => { throw new Error('nope') }, setItem: () => { throw new Error('nope') } }
    expect(loadPageModes(broken)).toEqual({})
    expect(savePageMode({}, 'x', 'lines', broken)).toEqual({ x: 'lines' })
  })

  it('trace is faint, lines are solid', () => {
    expect(MODE_OPACITY.lines).toBe(1)
    expect(MODE_OPACITY.trace).toBeLessThan(0.4)
  })
})
