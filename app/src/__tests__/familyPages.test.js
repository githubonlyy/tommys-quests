// Family coloring pages: which files in app/coloring-pages/ become a page, what
// they are called, and that nothing is ever dropped without saying so.
//
// vitest runs in the node environment, so there is no DOM here: the discovery
// half of familyPages.js is pure and tested directly, and the loading half gets
// the few browser globals it uses stubbed at the bottom of the file.

import { describe, it, expect, afterEach } from 'vitest'
import {
  pageMetaFromPath,
  pagesFromGlob,
  SKIP_REASONS,
  hasTransparency,
  loadPageOverlay,
  loadPageThumb,
  clearPageCache,
  PAGE_STATUS,
  PageOverlayError,
} from '../world/draw/familyPages.js'

const DIR = '../../../coloring-pages/'
const glob = (...files) => Object.fromEntries(files.map((f) => [DIR + f, '/assets/' + f]))

/** run the folder through the filter and keep what was left out */
function scan(...files) {
  const skipped = []
  const pages = pagesFromGlob(glob(...files), { onSkip: (s) => skipped.push(s) })
  return { pages, skipped, ids: pages.map((p) => p.id), names: pages.map((p) => p.name) }
}

/** which file got which id, keyed by the file's own url */
const idsByUrl = (...files) => Object.fromEntries(scan(...files).pages.map((p) => [p.url, p.id]))

/** the same folder listed several fixed ways — no randomness, so a failure repeats */
function reorderings(files) {
  return [
    [...files].reverse(),
    [...files.slice(3), ...files.slice(0, 3)], // rotated
    [...files].sort((a, b) => a.length - b.length),
    [...files.filter((_, i) => i % 2 === 0), ...files.filter((_, i) => i % 2 === 1)],
  ]
}

describe('which files become pages', () => {
  it('accepts an image whatever the case of its extension', () => {
    const { pages, skipped } = scan('scan.Jpg', 'photo.JPeg', 'art.PNG', 'kite.WebP', 'פרפר.SVG')
    expect(pages).toHaveLength(5)
    expect(skipped).toEqual([])
    expect(pages.find((p) => p.file === 'פרפר.SVG').vector).toBe(true)
    expect(pages.filter((p) => p.vector)).toHaveLength(1)
  })

  it('finds a picture inside a subfolder', () => {
    const { names, ids } = scan('2026/פרח.png')
    expect(names).toEqual(['פרח'])
    expect(ids).toEqual(['family-פרח-png'])
  })

  it('keeps the url and marks the page as an image', () => {
    const { pages } = scan('חד-קרן.jpg')
    expect(pages[0]).toMatchObject({ url: '/assets/חד-קרן.jpg', kind: 'image', name: 'חד קרן', vector: false })
  })

  it('reports a HEIC instead of dropping it, and says what to do', () => {
    const { pages, skipped } = scan('IMG_4021.HEIC')
    expect(pages).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ file: 'IMG_4021.HEIC', ext: 'heic', reason: SKIP_REASONS.undecodable })
    expect(skipped[0].message).toMatch(/JPEG/)
  })

  it('reports any other unreadable or unknown file', () => {
    const { pages, skipped } = scan('דף.docx', 'סריקה.tiff', 'noextension')
    expect(pages).toEqual([])
    expect(Object.fromEntries(skipped.map((s) => [s.file, s.reason]))).toEqual({
      'דף.docx': SKIP_REASONS.unknown,
      'סריקה.tiff': SKIP_REASONS.undecodable,
      noextension: SKIP_REASONS.unknown,
    })
    expect(skipped.every((s) => s.file && s.message)).toBe(true)
  })

  it('stays quiet about the housekeeping files that live in the folder', () => {
    const { pages, skipped } = scan('README.md', '.gitkeep', 'Thumbs.db', 'desktop.ini')
    expect(pages).toEqual([])
    expect(skipped).toEqual([])
  })

  it('handles an empty folder', () => {
    expect(pagesFromGlob({})).toEqual([])
    expect(pagesFromGlob(undefined)).toEqual([])
  })
})

describe('page ids are unique', () => {
  it('does not collide two files whose stems are the same', () => {
    const { pages, ids } = scan('סבתא.png', 'סבתא.jpg')
    expect(pages).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(pages.map((p) => p.name)).toEqual(['סבתא', 'סבתא'])
  })

  it('does not collide a space with a dash', () => {
    const { ids } = scan('דף 1.png', 'דף-1.jpeg')
    expect(new Set(ids).size).toBe(2)
  })

  it('qualifies both files when even the extension is the same', () => {
    const { pages, ids } = scan('2025/דף.png', '2026/דף.png')
    expect(pages).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    // both are qualified, so neither one holds the plain id that the other
    // would inherit if this file were ever removed from the folder
    expect(ids.every((id) => id.startsWith('family-דף-png-'))).toBe(true)
  })

  it('gives an emoji-only filename a real id', () => {
    const { pages, ids } = scan('🦄.png', '🐶.png')
    expect(ids.every((id) => id !== 'family-' && id !== 'family--png')).toBe(true)
    expect(new Set(ids).size).toBe(2)
    // emoji have no meaningful order in a Hebrew collator, so compare as a set
    expect(new Set(pages.map((p) => p.name))).toEqual(new Set(['🐶', '🦄']))
  })

  it('is stable — the same filename always gives the same id', () => {
    expect(pageMetaFromPath(DIR + '🦄.png').id).toBe(pageMetaFromPath('/somewhere/else/🦄.png').id)
  })
})

describe('page ids do not move', () => {
  // Draw remembers the open page by id, so an id that shifts when the folder
  // changes reopens a different picture than the one he was coloring. Nothing
  // below may depend on the order Vite hands the folder over in — that order is
  // the file system's business, not ours.
  //
  // One of each awkward case: the same stem twice, the same name in two
  // subfolders, a space against a dash, emoji, a vector, and a skipped file.
  const folder = [
    'סבתא.png',
    'סבתא.jpg',
    '2025/דף.png',
    '2026/דף.png',
    'דף 1.png',
    'דף-1.png',
    '🦄.png',
    'פרפר.SVG',
    'IMG_4021.HEIC',
  ]

  it('gives each picture the same id however the folder is listed', () => {
    const expected = idsByUrl(...folder)
    expect(Object.keys(expected)).toHaveLength(8) // the HEIC is reported, not a page
    expect(new Set(Object.values(expected)).size).toBe(8)

    for (const order of reorderings(folder)) {
      expect(idsByUrl(...order)).toEqual(expected)
      // and the picker itself comes out in one fixed order too
      expect(scan(...order).ids).toEqual(scan(...folder).ids)
    }
  })

  it('leaves every existing id alone when another picture is added', () => {
    const before = idsByUrl(...folder)
    // added at the end and at the front: neither may disturb what is there
    for (const listing of [[...folder, 'חתול.png'], ['חתול.png', ...folder]]) {
      const after = idsByUrl(...listing)
      for (const [url, id] of Object.entries(before)) expect(after[url]).toBe(id)
      expect(after['/assets/חתול.png']).toBe('family-חתול-png')
    }
  })

  it('leaves every remaining id alone when an unrelated picture is removed', () => {
    const before = idsByUrl(...folder)
    const after = idsByUrl(...folder.filter((f) => f !== 'פרפר.SVG'))
    expect(Object.keys(after)).toHaveLength(7)
    for (const [url, id] of Object.entries(after)) expect(before[url]).toBe(id)
  })

  it('does not hand the plain id to whichever twin happened to come first', () => {
    const listed = idsByUrl('2025/דף.png', '2026/דף.png')
    const reversed = idsByUrl('2026/דף.png', '2025/דף.png')
    expect(reversed).toEqual(listed)
    expect(listed['/assets/2025/דף.png']).not.toBe(listed['/assets/2026/דף.png'])
    expect(Object.values(listed)).not.toContain('family-דף-png')
  })

  it('tells apart two names that slug the same inside one folder', () => {
    const listed = idsByUrl('דף 1.png', 'דף-1.png')
    expect(new Set(Object.values(listed)).size).toBe(2)
    expect(idsByUrl('דף-1.png', 'דף 1.png')).toEqual(listed)
  })
})

describe('page names', () => {
  it('turns underscores and dashes into spaces and leaves the rest alone', () => {
    expect(pageMetaFromPath(DIR + 'בית-הקסמים.png')).toMatchObject({ name: 'בית הקסמים', ext: 'png' })
    expect(pageMetaFromPath(DIR + 'the_dog.svg')).toMatchObject({ name: 'the dog', vector: true })
  })

  it('keeps spaces and parentheses in a Hebrew name and slugs them out of the id', () => {
    const meta = pageMetaFromPath(DIR + 'דף 1 (עותק).jpg')
    expect(meta.name).toBe('דף 1 (עותק)')
    expect(meta.id).toBe('family-דף-1-עותק-jpg')
  })

  it('sorts by name with a Hebrew collator', () => {
    const { names } = scan('ב.png', 'א.png', 'ג.png')
    expect(names).toEqual(['א', 'ב', 'ג'])
  })
})

describe('already-keyed art is left alone', () => {
  it('sees a transparent pixel', () => {
    const opaque = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    expect(hasTransparency(opaque)).toBe(false)
    const soft = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 254])
    expect(hasTransparency(soft)).toBe(true)
    const empty = new Uint8ClampedArray([0, 0, 0, 0])
    expect(hasTransparency(empty)).toBe(true)
  })
})

describe('loadPageOverlay contract', () => {
  it('passes vector art through untouched', async () => {
    const page = { id: 'family-פרפר-svg', name: 'פרפר', vector: true, url: '/assets/פרפר.svg' }
    const res = await loadPageOverlay(page)
    expect(res).toMatchObject({ url: '/assets/פרפר.svg', processed: false, status: PAGE_STATUS.passthrough })
  })

  it('answers nothing for no page', async () => {
    expect(await loadPageOverlay(null)).toBe(null)
  })

  it('tells a file that could not be read apart from one that merely was not keyed', () => {
    const page = { id: 'family-x-heic', name: 'תמונה', url: '/assets/x.png' }
    const decode = new PageOverlayError('nope', { reason: 'decode', page })
    expect(decode).toMatchObject({ status: PAGE_STATUS.failed, processed: false, canShowRaw: false, url: null })
    expect(decode.pageName).toBe('תמונה')

    const later = new PageOverlayError('nope', { reason: 'process', page })
    expect(later).toMatchObject({ status: PAGE_STATUS.failed, canShowRaw: true, url: '/assets/x.png' })
  })
})

/* ---------------------------------------------------------------------------
 * The loading pipeline needs a canvas, so stand up just enough of a browser to
 * exercise it: what gets decoded, how often, and what comes back.
 * ------------------------------------------------------------------------- */

const saved = new Map()

function setGlobal(name, value) {
  if (!saved.has(name)) saved.set(name, { had: name in globalThis, value: globalThis[name] })
  globalThis[name] = value
}

function restoreGlobals() {
  for (const [name, { had, value }] of saved) {
    if (had) globalThis[name] = value
    else delete globalThis[name]
  }
  saved.clear()
}

/** a page of white paper with one dark stroke, at the given alpha */
function pixels(w, h, alpha) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    const dark = p % w === 1
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = dark ? 20 : 250
    data[p * 4 + 3] = alpha
  }
  return data
}

function fakeBrowser({ alpha = 255, decode = 'ok' } = {}) {
  const state = { decodes: 0 }
  setGlobal('fetch', async (url) => {
    state.decodes++
    if (decode === 'fail') throw new Error('offline: ' + url)
    return { ok: true, blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) }
  })
  setGlobal('createImageBitmap', async () => ({ width: 3000, height: 2000, close() {} }))
  setGlobal('ImageData', class { constructor(data, width, height) { Object.assign(this, { data, width, height }) } })
  setGlobal('OffscreenCanvas', class {
    constructor(width, height) { Object.assign(this, { width, height }) }
    getContext() {
      return {
        drawImage() {},
        getImageData: (x, y, w, h) => ({ data: pixels(w, h, alpha), width: w, height: h }),
        putImageData() {},
      }
    }
    async convertToBlob() { return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) }
  })
  return state
}

const rasterPage = (id) => ({ id, name: id, vector: false, url: `/assets/${id}.png` })

describe('loading a page', () => {
  afterEach(() => {
    clearPageCache()
    restoreGlobals()
  })

  it('keys a photographed page and hands back a url that is not a megabyte of base64', async () => {
    fakeBrowser()
    const res = await loadPageOverlay(rasterPage('p-keyed'))
    expect(res).toMatchObject({ processed: true, status: PAGE_STATUS.processed })
    expect(typeof res.url).toBe('string')
    expect(res.url.startsWith('blob:')).toBe(true)
    expect(res.width).toBeGreaterThan(0)
  })

  it('leaves a transparent PNG alone instead of keying it into a blank page', async () => {
    fakeBrowser({ alpha: 0 })
    const page = rasterPage('p-alpha')
    const res = await loadPageOverlay(page)
    expect(res).toMatchObject({
      url: page.url,
      processed: false,
      status: PAGE_STATUS.passthrough,
      reason: 'alpha',
    })
  })

  it('decodes once when the picker and the page ask at the same time', async () => {
    const state = fakeBrowser()
    const page = rasterPage('p-shared')
    const [a, b] = await Promise.all([loadPageOverlay(page), loadPageOverlay(page)])
    expect(state.decodes).toBe(1)
    expect(a).toBe(b)
    // and again from the cache, still without touching the file
    expect(await loadPageOverlay(page)).toBe(a)
    expect(state.decodes).toBe(1)
  })

  it('keeps the thumbnail and the full page apart', async () => {
    const state = fakeBrowser()
    const page = rasterPage('p-two-sizes')
    const full = await loadPageOverlay(page)
    const thumb = await loadPageThumb(page)
    expect(state.decodes).toBe(2)
    expect(thumb.width).toBeLessThan(full.width)
  })

  it('says a file could not be read at all, so the screen can stop showing a broken picture', async () => {
    fakeBrowser({ decode: 'fail' })
    const page = rasterPage('p-broken')
    await expect(loadPageOverlay(page)).rejects.toThrow(PageOverlayError)
    const err = await loadPageOverlay(page).catch((e) => e)
    expect(err).toMatchObject({
      status: PAGE_STATUS.failed,
      processed: false,
      reason: 'decode',
      canShowRaw: false,
      pageId: 'p-broken',
    })
  })

  it('lets a failed page be tried again rather than caching the failure', async () => {
    const failing = fakeBrowser({ decode: 'fail' })
    const page = rasterPage('p-retry')
    await loadPageOverlay(page).catch(() => {})
    expect(failing.decodes).toBe(1)
    restoreGlobals()
    const working = fakeBrowser()
    expect(await loadPageOverlay(page)).toMatchObject({ processed: true })
    expect(working.decodes).toBe(1)
  })
})
