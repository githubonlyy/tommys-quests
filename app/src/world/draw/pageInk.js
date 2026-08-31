// Turning a family picture into a coloring overlay.
//
// The template layer sits ABOVE the drawing canvas so the black lines stay crisp
// while she colors underneath. A raw picture used that way would cover her work
// with an opaque rectangle, so every raster page goes through here first:
//
//   auto-trim   -> drop the table/desk visible past the edge of a photographed page
//   flat-field  -> kill the lighting gradient and normalise cream paper to white
//   key-to-alpha-> paper becomes transparent, ink becomes solid black
//
// Order matters: trimming runs on the ORIGINAL luminance, because flat-fielding
// divides by a local background and would normalise the dark table to white
// right along with the paper. Cropping first also keeps the desk out of the
// blur that estimates the lighting.
//
// Everything here is pure math over {data, width, height} buffers (ImageData
// shaped) so it can be unit-tested without a DOM.

export const BLUR_DIVISOR = 16 // blur radius = min(w,h) / this
export const PAPER_CUT = 0.86 // corrected luminance at/above this is paper
export const INK_CUT = 0.62 // at/below this is solid ink
export const TRIM_MAX = 0.15 // never trim more than this fraction off a side
export const TRIM_PAPER_RATIO = 0.6 // a border line is "page" once this much is paper
export const TRIM_PAPER_FRAC = 0.72 // ...and a pixel counts as paper at this fraction of the paper level

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Rec. 601 luma, one byte per pixel. */
export function toGray({ data, width, height }) {
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }
  return out
}

/**
 * Separable box blur over a single-channel buffer. Two passes approximate a
 * Gaussian well enough for background estimation and stay O(n) via a running sum.
 */
export function boxBlurGray(src, width, height, radius) {
  if (radius < 1) return Uint8ClampedArray.from(src)
  const tmp = new Uint8ClampedArray(src.length)
  const out = new Uint8ClampedArray(src.length)
  const span = radius * 2 + 1

  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = src[row] * (radius + 1)
    for (let x = 1; x <= radius; x++) sum += src[row + Math.min(x, width - 1)]
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / span
      sum += src[row + Math.min(x + radius + 1, width - 1)] - src[row + Math.max(x - radius, 0)]
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = tmp[x] * (radius + 1)
    for (let y = 1; y <= radius; y++) sum += tmp[Math.min(y, height - 1) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span
      sum += tmp[Math.min(y + radius + 1, height - 1) * width + x] - tmp[Math.max(y - radius, 0) * width + x]
    }
  }
  return out
}

/**
 * Divide the image by a heavily blurred copy of itself. The blur radius is far
 * larger than a pen stroke, so lines survive while a lighting gradient and the
 * paper's own tint are flattened to uniform white. Returns 0..1 per pixel.
 */
export function flatField(gray, width, height, divisor = BLUR_DIVISOR) {
  const radius = Math.max(1, Math.floor(Math.min(width, height) / divisor))
  const bg = boxBlurGray(gray, width, height, radius)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const b = bg[i]
    out[i] = b <= 1 ? 1 : Math.min(1, gray[i] / b)
  }
  return out
}

/** Brightest populated luminance mode — the paper, on any page that has some. */
export function paperLevel(gray) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  let best = 255
  let bestCount = 0
  for (let v = 255; v >= 0; v--) {
    if (hist[v] > bestCount) {
      bestCount = hist[v]
      best = v
    }
    // stop once we are clearly into the dark half; paper is the bright mode
    if (v < 128 && bestCount > 0) break
  }
  return best
}

/**
 * Border rows/columns that are mostly NOT paper are the desk around a
 * photographed page. Walk in from each side until a line is mostly paper again,
 * capped so a legitimately dark drawing is never eaten.
 */
export function autoTrimBounds(gray, width, height, { paperMin, max = TRIM_MAX, ratio = TRIM_PAPER_RATIO } = {}) {
  const cut = paperMin ?? paperLevel(gray) * TRIM_PAPER_FRAC
  const isPaperRow = (y) => {
    let n = 0
    for (let x = 0; x < width; x++) if (gray[y * width + x] >= cut) n++
    return n / width >= ratio
  }
  const isPaperCol = (x) => {
    let n = 0
    for (let y = 0; y < height; y++) if (gray[y * width + x] >= cut) n++
    return n / height >= ratio
  }
  const maxY = Math.floor(height * max)
  const maxX = Math.floor(width * max)
  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1
  while (top < maxY && !isPaperRow(top)) top++
  while (bottom > height - 1 - maxY && !isPaperRow(bottom)) bottom--
  while (left < maxX && !isPaperCol(left)) left++
  while (right > width - 1 - maxX && !isPaperCol(right)) right--
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 }
}

/** copy a rectangle out of a single-channel buffer */
export function cropGray(gray, width, b) {
  const out = new Uint8ClampedArray(b.width * b.height)
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) out[y * b.width + x] = gray[(y + b.top) * width + (x + b.left)]
  }
  return out
}

/**
 * Paper -> transparent, ink -> opaque black, with a soft ramp between so a
 * light pencil line still reads. Colour is forced to black: the source may be a
 * blue-ish photo of a black pen and we want line art, not tint.
 */
export function keyToAlpha(flat, width, height, { paperCut = PAPER_CUT, inkCut = INK_CUT } = {}) {
  const out = new Uint8ClampedArray(width * height * 4)
  const span = Math.max(1e-6, paperCut - inkCut)
  for (let i = 0; i < flat.length; i++) {
    const v = flat[i]
    const a = v >= paperCut ? 0 : v <= inkCut ? 255 : Math.round(((paperCut - v) / span) * 255)
    const o = i * 4
    out[o] = 0
    out[o + 1] = 0
    out[o + 2] = 0
    out[o + 3] = a
  }
  return { data: out, width, height }
}

/**
 * Full pipeline. `image` is ImageData-shaped; returns ImageData-shaped RGBA with
 * transparent paper, plus the bounds that were kept.
 */
export function processPage(image, opts = {}) {
  const gray = toGray(image)
  const full = { left: 0, top: 0, right: image.width - 1, bottom: image.height - 1, width: image.width, height: image.height }
  const bounds = opts.trim === false ? full : autoTrimBounds(gray, image.width, image.height, opts)
  const cropped = bounds.width === image.width && bounds.height === image.height
    ? gray
    : cropGray(gray, image.width, bounds)
  const flat = flatField(cropped, bounds.width, bounds.height, opts.divisor)
  const out = keyToAlpha(flat, bounds.width, bounds.height, opts)
  return { ...out, bounds }
}

export { clamp255 }
