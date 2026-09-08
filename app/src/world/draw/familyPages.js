// Family coloring pages: every image file in app/coloring-pages/ becomes a page
// he can color. No manifest — drop a file in the folder, commit, and it shows up.
// The filename is the page name, so name them in Hebrew (סבתא.png -> "סבתא").
//
// Three things this file is careful about, because each of them used to lose a
// picture silently:
//
//   discovery — the folder is globbed BROADLY and filtered here on a lowercased
//               extension, so scan.JPG and a file in a subfolder are found like
//               any other. Anything skipped is named in a console warning
//               (and listed in SKIPPED_PAGES) instead of just not existing.
//   ids       — the id carries the extension and is de-duplicated, so סבתא.png
//               and סבתא.jpg are two pages, not one shadowing the other. The id
//               is a function of the file alone, never of the order the folder
//               happened to be enumerated in: the selected page is remembered
//               across sessions, so an id that moves reopens the wrong picture.
//   loading   — one page is keyed at a time, off the render path, and the work
//               is shared between the picker thumbnail and the page itself.

import { processPage } from './pageInk.js'

/* ---- which files are pages ------------------------------------------------ */

// Raster art: goes through the ink pipeline (unless it turns out to be keyed
// already — see hasTransparency below).
const RASTER_EXT = new Set(['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'webp', 'gif', 'bmp', 'apng', 'avif', 'ico'])
// Vector art is already clean line art: passed through untouched.
const VECTOR_EXT = new Set(['svg'])
// Real image formats that no browser can decode. Worth a loud, specific warning:
// HEIC is the iPhone camera default, so it is the most likely thing in the folder.
const UNDECODABLE_EXT = new Map([
  ['heic', 'HEIC is the iPhone camera default and no browser can decode it — export it as JPEG (Photos → export, or set the camera to "תואם ביותר" / Most Compatible) and drop the .jpg in instead'],
  ['heif', 'HEIF cannot be decoded by any browser — export it as JPEG instead'],
  ['tif', 'TIFF cannot be decoded by Chrome or Android — export it as PNG or JPEG instead'],
  ['tiff', 'TIFF cannot be decoded by Chrome or Android — export it as PNG or JPEG instead'],
  ['psd', 'a Photoshop file is not an image the browser can open — export it as PNG instead'],
  ['pdf', 'a PDF cannot be used as a coloring page — export the page as PNG or JPEG instead'],
  ['ai', 'an Illustrator file is not an image the browser can open — export it as SVG or PNG instead'],
  ['eps', 'EPS cannot be decoded by a browser — export it as SVG or PNG instead'],
  ['cr2', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
  ['cr3', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
  ['nef', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
  ['arw', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
  ['dng', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
  ['raw', 'a camera RAW file cannot be decoded by a browser — export it as JPEG instead'],
])
// Housekeeping that legitimately lives in the folder — never a page, never a warning.
const IGNORED_EXT = new Set(['md', 'txt', 'json', 'yml', 'yaml', 'db', 'ini', 'gitkeep', 'gitignore', 'gitattributes'])

/** why a file in the folder did not become a page */
export const SKIP_REASONS = {
  undecodable: 'undecodable', // a real image the browser cannot open (HEIC…)
  unknown: 'unknown', // not an image extension we know
}

const slugify = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase()

/** FNV-1a, base36 — a short stable id for a stem that slugs to nothing (emoji). */
function hash36(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * The part of a glob key that identifies the file, used as the input to the
 * de-duplication hash. The `../../../` that Vite prefixes is where this module
 * sits, not where the picture sits, so it is dropped: moving this file must not
 * rename his pages.
 */
function stablePath(path) {
  return String(path)
    .split(/[\\/]/)
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
}

/**
 * filename -> { id, name, vector, ext, file, supported, skip }
 *
 * The id keeps the extension so סבתא.png and סבתא.jpg are different pages, and
 * falls back to a hash when the stem is all emoji and slugs to an empty string.
 * Exported so it can be tested without Vite.
 */
export function pageMetaFromPath(path) {
  const file = String(path).split(/[\\/]/).pop() || String(path)
  const dot = file.lastIndexOf('.')
  const hidden = file.startsWith('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : ''
  const extSlug = ext.replace(/[^a-z0-9]/g, '')

  const vector = VECTOR_EXT.has(ext)
  const supported = vector || RASTER_EXT.has(ext)
  const slug = slugify(stem) || 'x' + hash36(stem)

  return {
    id: 'family-' + slug + (extSlug ? '-' + extSlug : ''),
    name: stem.replace(/[_-]+/g, ' ').trim() || file,
    vector,
    ext,
    file,
    supported,
    // hidden files and housekeeping are not pictures anybody dropped in — no warning
    skip: supported || hidden || IGNORED_EXT.has(ext)
      ? null
      : UNDECODABLE_EXT.has(ext)
        ? { reason: SKIP_REASONS.undecodable, message: UNDECODABLE_EXT.get(ext) }
        : {
            reason: SKIP_REASONS.unknown,
            message: ext
              ? `.${ext} is not an image type the app reads — use .png, .jpg, .webp or .svg`
              : 'a file with no extension cannot be read as an image — use .png, .jpg, .webp or .svg',
          },
  }
}

/**
 * glob result ({ path: url }) -> sorted page list.
 *
 * Filters on the lowercased extension, so case never matters and a subfolder
 * works. `onSkip` is called once per file that was left out, with { file, path,
 * ext, reason, message } — the module-level call turns those into console
 * warnings.
 *
 * Ids are deterministic. The order Vite hands the folder over in is not
 * something anybody controls, so nothing here may depend on it: the same set of
 * filenames always produces the same file-to-id mapping, and dropping another
 * picture into the folder never renames the ones already there. Two files whose
 * names slug the same (2025/דף.png and 2026/דף.png) are therefore BOTH
 * qualified, each by a hash of its own path — handing the plain id to whichever
 * one came first is exactly the thing that moves when the folder changes, and
 * Draw remembers the open page by id from one session to the next.
 */
export function pagesFromGlob(globResult, { onSkip } = {}) {
  // by path, by code unit: a total order that is the same on every device,
  // unlike a collator, which is only ever used for what he reads.
  const entries = Object.entries(globResult ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const found = []
  const seenBase = new Map() // base id -> how many files want it

  for (const [path, url] of entries) {
    const meta = pageMetaFromPath(path)
    if (!meta.supported) {
      if (meta.skip && typeof onSkip === 'function') onSkip({ ...meta.skip, file: meta.file, path, ext: meta.ext })
      continue
    }
    found.push({ meta, path, url })
    seenBase.set(meta.id, (seenBase.get(meta.id) ?? 0) + 1)
  }

  const pages = []
  const used = new Set()

  for (const { meta, path, url } of found) {
    const base = seenBase.get(meta.id) > 1 ? `${meta.id}-${hash36(stablePath(path))}` : meta.id
    // Only reachable if two different paths hash alike, which needs a 1-in-4-
    // billion coincidence on top of a slug collision. Deterministic even so.
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    pages.push({ ...meta, id, url, kind: 'image' })
  }

  // Display order: Hebrew for the names he reads, then the id, so that two
  // pages the collator calls equal still come out in a fixed order.
  return pages.sort((a, b) => a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id))
}

// app/coloring-pages/ — deliberately shallow so the folder is easy to find and
// drop files into from Explorer, rather than buried five levels down in src/.
// Globbed wide on purpose: matching extensions in the glob pattern is
// case-sensitive, so scan.JPG and IMG.HEIC never matched and vanished without a
// word. Everything is picked up here and judged in pagesFromGlob instead.
// The one thing excluded up front is the folder's own paperwork (README.md and
// friends): a glob entry becomes a bundled asset, and there is no reason to ship
// those. Anything that could be a picture is let through and judged below.
const files = import.meta.glob(['../../../coloring-pages/**/*', '!**/*.{md,txt,json,yml,yaml,db,ini}', '!**/.*'], {
  eager: true,
  query: '?url',
  import: 'default',
})

const skipped = []
export const FAMILY_PAGES = pagesFromGlob(files, { onSkip: (s) => skipped.push(s) })
/** files sitting in the folder that did NOT become pages, with a reason each */
export const SKIPPED_PAGES = skipped
export const hasFamilyPages = FAMILY_PAGES.length > 0
export const familyPageById = (id) => FAMILY_PAGES.find((p) => p.id === id) ?? null

// A skipped file is committed, deployed and simply absent from the app, which is
// impossible to notice from the tablet. Say so in the console instead.
if (SKIPPED_PAGES.length && import.meta.env?.MODE !== 'test' && globalThis.console?.warn) {
  for (const s of SKIPPED_PAGES) {
    globalThis.console.warn(`[coloring-pages] "${s.file}" is not a coloring page: ${s.message}`)
  }
}

/* ---- loading a page as a transparent-paper overlay ------------------------ */

const MAX_SIDE = 1400
// Picker tiles render ~150px, but keying at that size averages thin strokes
// into near-white and dense line art comes out washed out. Process large and
// let the browser downscale the already-keyed image instead.
const THUMB_SIDE = 700
// Processed pages are cached as blob URLs; the cap keeps a long session from
// holding every page he ever opened. Thumbs are small and all on screen at
// once, so they get a much bigger allowance than full-size pages.
const FULL_CACHE_MAX = 6
const THUMB_CACHE_MAX = 48
// Revoking a blob URL breaks only a load that has not started yet, so give any
// <img> that already asked for an evicted page time to finish.
const REVOKE_DELAY_MS = 10000

/** what came back from loadPageOverlay — also carried on a PageOverlayError */
export const PAGE_STATUS = {
  processed: 'processed', // keyed: transparent paper, black ink
  passthrough: 'passthrough', // used as-is (vector, or a PNG that is keyed already)
  failed: 'failed', // could not be turned into an overlay at all
}

/**
 * Thrown when a page cannot be shown. `reason: 'decode'` means the file itself
 * could not be read, so falling back to the raw <img> will fail too —
 * `canShowRaw` says which fallback is worth trying.
 */
export class PageOverlayError extends Error {
  constructor(message, { reason = 'process', page = null, cause } = {}) {
    super(message, { cause })
    this.name = 'PageOverlayError'
    this.status = PAGE_STATUS.failed
    this.processed = false
    this.reason = reason
    this.canShowRaw = reason !== 'decode'
    this.pageId = page?.id ?? null
    this.pageName = page?.name ?? ''
    this.url = this.canShowRaw ? (page?.url ?? null) : null
  }
}

const cache = new Map() // id -> Promise<{ url, processed, status, ... }>
const thumbCache = new Map()

/**
 * Load a page and turn it into a transparent-paper overlay. Vector art, and
 * raster art that already has an alpha channel, are keyed already and pass
 * through untouched. Everything else (including a photo of a printed page) goes
 * through the ink pipeline.
 *
 * Always resolves to an object with at least { url, processed }; `status` says
 * which of the two happened. Rejects with a PageOverlayError when the file
 * cannot be shown at all. Runs are cached and shared: asking twice while the
 * first run is still going joins that run instead of starting a second one.
 */
export async function loadPageOverlay(page, { thumb = false } = {}) {
  if (!page) return null
  if (page.vector) {
    return { url: page.url, processed: false, status: PAGE_STATUS.passthrough, reason: 'vector' }
  }

  const store = thumb ? thumbCache : cache
  const hit = touch(store, page.id)
  if (hit) return hit

  // registered before the work starts, so a second caller shares this run
  const entry = enqueue(() => renderOverlay(page, thumb)).catch((err) => {
    if (store.get(page.id) === entry) store.delete(page.id) // let a retry try again
    throw err
  })
  cachePut(store, page.id, entry, thumb ? THUMB_CACHE_MAX : FULL_CACHE_MAX)
  return entry
}

/** Small cleaned-up preview for the page picker. */
export const loadPageThumb = (page) => loadPageOverlay(page, { thumb: true })

/** Drop every cached overlay and release its blob URL. */
export function clearPageCache() {
  for (const store of [cache, thumbCache]) {
    for (const entry of store.values()) release(entry, 0)
    store.clear()
  }
}

/**
 * True if any pixel is not fully opaque. Such a file is keyed art already —
 * keying it again is wrong twice over: the transparent paper composites to
 * black, so toGray sees a page of gray 0, flatField divides black by black and
 * the whole picture is classified as paper. The result is an invisible page.
 */
export function hasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true
  return false
}

async function renderOverlay(page, thumb) {
  let img
  try {
    img = await decodeImage(page.url)
  } catch (cause) {
    throw new PageOverlayError(`could not read "${page.name || page.url}"`, { reason: 'decode', page, cause })
  }

  try {
    const limit = thumb ? THUMB_SIDE : MAX_SIDE
    const scale = Math.min(1, limit / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))

    const src = make2d(w, h, { willReadFrequently: true })
    src.ctx.drawImage(img, 0, 0, w, h)
    const image = src.ctx.getImageData(0, 0, w, h)

    // Drawn onto a transparent canvas on purpose: the alpha channel is the only
    // way to tell keyed art from a photo, and it survives only until something
    // composites this over a background.
    if (hasTransparency(image.data)) {
      return { url: page.url, processed: false, status: PAGE_STATUS.passthrough, reason: 'alpha', width: w, height: h }
    }

    await yieldToHost() // the pipeline below is the expensive part; let the UI breathe
    const out = processPage(image)

    const dst = make2d(out.width, out.height)
    dst.ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
    const encoded = await encodePng(dst.canvas)

    return {
      url: encoded.url,
      processed: true,
      status: PAGE_STATUS.processed,
      width: out.width,
      height: out.height,
      objectUrl: encoded.objectUrl,
    }
  } catch (cause) {
    if (cause instanceof PageOverlayError) throw cause
    throw new PageOverlayError(`could not prepare "${page.name || page.url}"`, { reason: 'process', page, cause })
  } finally {
    img?.close?.() // ImageBitmap holds the decoded pixels until it is closed
  }
}

/* ---- one page at a time, off the render path ------------------------------ */

// Opening the picker asks for every thumbnail at once. Each one decodes a phone
// photo (a 4000x3000 JPEG is ~48MB of RGBA), downscales, keys and encodes it;
// run back to back on the main thread that freezes the tablet for seconds. This
// queue runs them one at a time and hands the browser a frame between each.
let queue = Promise.resolve()

function enqueue(job) {
  const run = queue.then(async () => {
    await yieldToHost()
    return job()
  })
  queue = run.then(noop, noop) // one failure must not stop the queue
  return run
}

function noop() {}

function yieldToHost() {
  const scheduler = globalThis.scheduler
  if (typeof scheduler?.yield === 'function') {
    try {
      return scheduler.yield()
    } catch {
      // fall through to the timer below
    }
  }
  return new Promise((resolve) => {
    const idle = globalThis.requestIdleCallback
    if (typeof idle === 'function') idle(() => resolve(), { timeout: 120 })
    else setTimeout(resolve, 0)
  })
}

/* ---- cache plumbing ------------------------------------------------------- */

function touch(store, id) {
  if (!store.has(id)) return null
  const hit = store.get(id)
  store.delete(id)
  store.set(id, hit) // most recently used goes last
  return hit
}

function cachePut(store, id, entry, limit) {
  store.set(id, entry)
  for (const key of store.keys()) {
    if (store.size <= limit) break
    if (key === id) continue
    const stale = store.get(key)
    store.delete(key)
    release(stale, REVOKE_DELAY_MS)
  }
}

function release(entry, delay) {
  Promise.resolve(entry).then((res) => {
    if (!res?.objectUrl || typeof globalThis.URL?.revokeObjectURL !== 'function') return
    if (delay > 0) setTimeout(() => globalThis.URL.revokeObjectURL(res.url), delay)
    else globalThis.URL.revokeObjectURL(res.url)
  }, noop)
}

/* ---- browser bits --------------------------------------------------------- */

async function decodeImage(url) {
  // createImageBitmap decodes off the main thread, which is the whole point here
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await createImageBitmap(await res.blob())
    } catch (err) {
      if (typeof Image !== 'function') throw err
      // fall through to the <img> path
    }
  }
  if (typeof Image !== 'function') throw new Error('no way to decode an image here')

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = url
  if (typeof img.decode === 'function') {
    await img.decode()
    return img
  }
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('image load failed: ' + url))
  })
  return img
}

/** A 2D canvas, off-screen when the browser has one. */
function make2d(w, h, opts) {
  const makers = []
  if (typeof OffscreenCanvas === 'function') makers.push(() => new OffscreenCanvas(w, h))
  const doc = globalThis.document
  if (doc?.createElement) {
    makers.push(() => {
      const c = doc.createElement('canvas')
      c.width = w
      c.height = h
      return c
    })
  }
  for (const make of makers) {
    try {
      const canvas = make()
      const ctx = canvas.getContext('2d', opts)
      if (ctx) return { canvas, ctx }
    } catch {
      // try the next kind of canvas
    }
  }
  throw new PageOverlayError('this device cannot open a drawing canvas', { reason: 'no-canvas' })
}

/**
 * PNG out of a canvas. convertToBlob/toBlob encode off the main thread and a
 * blob URL keeps the cache from holding a megabyte of base64 per page;
 * toDataURL is the last resort.
 */
async function encodePng(canvas) {
  const blob = await canvasBlob(canvas)
  if (blob && typeof globalThis.URL?.createObjectURL === 'function') {
    return { url: globalThis.URL.createObjectURL(blob), objectUrl: true }
  }
  if (typeof canvas.toDataURL === 'function') return { url: canvas.toDataURL('image/png'), objectUrl: false }
  throw new Error('no way to encode the keyed page')
}

async function canvasBlob(canvas) {
  try {
    if (typeof canvas.convertToBlob === 'function') return await canvas.convertToBlob({ type: 'image/png' })
    if (typeof canvas.toBlob === 'function') return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    // fall back to a data URL
  }
  return null
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
