// Family coloring pages: every image file in ./family/ becomes a page she can
// color. No manifest — drop a file in the folder, commit, and it shows up.
// The filename is the page name, so name them in Hebrew (סבתא.png -> "סבתא").

import { processPage } from './pageInk.js'

const VECTOR = /\.svg$/i

/** filename -> { id, name, vector }; exported so it can be tested without Vite */
export function pageMetaFromPath(path) {
  const file = path.split('/').pop() ?? path
  const stem = file.replace(/\.[^.]+$/, '')
  return {
    id: 'family-' + stem.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase(),
    name: stem.replace(/[_-]+/g, ' ').trim(),
    vector: VECTOR.test(file),
  }
}

/** glob result ({ path: url }) -> sorted page list */
export function pagesFromGlob(globResult) {
  return Object.entries(globResult ?? {})
    .map(([path, url]) => ({ ...pageMetaFromPath(path), url, kind: 'image' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
}

const files = import.meta.glob('./family/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP,svg,SVG}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const FAMILY_PAGES = pagesFromGlob(files)
export const hasFamilyPages = FAMILY_PAGES.length > 0
export const familyPageById = (id) => FAMILY_PAGES.find((p) => p.id === id) ?? null

const MAX_SIDE = 1400
const THUMB_SIDE = 220 // picker tiles: same cleanup, cheap enough to run for every page
const cache = new Map() // id -> { url, width, height } processed overlay
const thumbCache = new Map()

/**
 * Load a page and turn it into a transparent-paper overlay. Vector art is
 * already clean, so it passes through untouched. Raster art (including a photo
 * of a printed page) goes through the ink pipeline. Cached per session.
 */
export async function loadPageOverlay(page, { thumb = false } = {}) {
  if (!page) return null
  if (page.vector) return { url: page.url, processed: false }
  const store = thumb ? thumbCache : cache
  const hit = store.get(page.id)
  if (hit) return hit

  const img = await loadImage(page.url)
  const scale = Math.min(1, (thumb ? THUMB_SIDE : MAX_SIDE) / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sctx = src.getContext('2d', { willReadFrequently: true })
  sctx.drawImage(img, 0, 0, w, h)

  const out = processPage(sctx.getImageData(0, 0, w, h))

  const dst = document.createElement('canvas')
  dst.width = out.width
  dst.height = out.height
  dst.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0)

  const result = { url: dst.toDataURL('image/png'), processed: true, width: out.width, height: out.height }
  store.set(page.id, result)
  return result
}

/** Small cleaned-up preview for the page picker. */
export const loadPageThumb = (page) => loadPageOverlay(page, { thumb: true })

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed: ' + url))
    img.src = url
  })
}

/* ---- per-page display mode (קווים / שקוף), remembered across sessions ---- */

const MODE_KEY = 'tommys-quests-page-modes'
export const PAGE_MODES = { lines: 'lines', trace: 'trace' }
export const DEFAULT_PAGE_MODE = PAGE_MODES.lines
export const MODE_OPACITY = { lines: 1, trace: 0.22 }

export function loadPageModes(storage) {
  try {
    const s = storage ?? globalThis.localStorage
    const raw = s?.getItem(MODE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function savePageMode(modes, id, mode, storage) {
  const next = { ...modes, [id]: mode }
  try {
    const s = storage ?? globalThis.localStorage
    s?.setItem(MODE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable — the choice still applies for this session
  }
  return next
}
