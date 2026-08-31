// Small helpers shared by the SVG doll parts. Pure functions, no React.

/**
 * Lighten (amt > 0) or darken (amt < 0) a 6-digit hex color. Non-hex input
 * (e.g. an `url(#gradient)` fill) is returned untouched.
 */
export function shade(hex, amt) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)))
  const r = ch(n >> 16)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/** Outline props for a filled shape: a darker version of its own fill. */
export function outline(color, width = 2.5) {
  return { stroke: shade(color, -0.3), strokeWidth: width, strokeLinejoin: 'round', strokeLinecap: 'round' }
}

/** SVG path for a star centred at (cx, cy). */
export function starPath(cx, cy, outer, inner = outer * 0.45, points = 5) {
  let d = ''
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1)
  }
  return d + 'Z'
}

/** Read item colors with defaults; `accent` falls back to a lighter `main`. */
export function palette(item, fallbackMain = '#f472b6') {
  const c = item?.colors ?? {}
  const main = c.main ?? fallbackMain
  return { main, accent: c.accent ?? shade(main, 0.45), trim: c.trim ?? '#facc15', dark: shade(main, -0.3) }
}
