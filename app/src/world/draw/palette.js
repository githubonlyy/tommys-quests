// Colors, brush sizes and sticker sets for the drawing board. Pure data and
// builders (no DOM) so the palette can be unit-tested.

// 12 fixed crayons: rainbow + black/white/brown/pink + two skin tones.
export const BASE_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#fde047', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f472b6', // pink
  '#92400e', // brown
  '#000000', // black
  '#ffffff', // white
  '#fcd9c4', // skin, light
  '#c68642', // skin, tan
]

export const PALETTE_SIZE = 14
export const DEFAULT_COLOR = BASE_COLORS[0]

const HEX = /^#[0-9a-f]{6}$/i
// used only if a theme somehow contributes fewer than two fresh colors
const FILLERS = ['#0ea5e9', '#14b8a6', '#fb7185', '#facc15']

/**
 * The 12 base crayons plus two colors taken from the active world (accent,
 * gradient, confetti) — deduplicated so the palette is always 14 unique hexes.
 */
export function buildPalette(theme) {
  const out = [...BASE_COLORS]
  const seen = new Set(out.map((c) => c.toLowerCase()))
  const vars = theme?.vars ?? {}
  const candidates = [
    vars['--t-accent-deep'],
    vars['--t-bg-from'],
    ...(theme?.confetti ?? []),
    vars['--t-accent'],
    vars['--t-bg-to'],
    ...FILLERS,
  ]
  for (const c of candidates) {
    if (out.length >= PALETTE_SIZE) break
    if (typeof c !== 'string' || !HEX.test(c)) continue
    const key = c.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

// Sizes are in logical canvas units (1000 = the shorter side of the canvas), so
// a stroke keeps its proportion when the tablet rotates. `dot` is the preview
// circle in the size button (CSS px); sticker/doll are the stamp heights.
export const BRUSH_SIZES = [
  { id: 's', label: 'דק', width: 14, dot: 10, sticker: 100, doll: 280 },
  { id: 'm', label: 'בינוני', width: 30, dot: 18, sticker: 160, doll: 400 },
  { id: 'l', label: 'עבה', width: 60, dot: 28, sticker: 240, doll: 540 },
]
export const DEFAULT_SIZE = 'm'
export const ERASER_SCALE = 1.6

export const EXTRA_STICKERS = ['⭐', '🚀', '🦖', '⚽', '🥷', '🤖', '🌟', '🏆', '🐶', '⚡', '👑', '🔥', '🛸', '🎈', '🦅', '💥']
export const MAX_STICKERS = 16

/** Theme particles first, then the shared favourites — unique, capped. */
export function stickerList(theme) {
  const out = []
  for (const s of [...(theme?.particles ?? []), ...EXTRA_STICKERS]) {
    if (out.length >= MAX_STICKERS) break
    if (typeof s === 'string' && s && !out.includes(s)) out.push(s)
  }
  return out
}
