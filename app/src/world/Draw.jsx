// The drawing board: a full-screen overlay with a big canvas, chunky tools and
// coloring pages. Props: { onClose }.
//
// Layers (bottom -> top): background color div -> drawing <canvas> -> template
// <svg> outline (pointer-events: none). The outline sits above the paint so the
// black lines stay crisp while he colors, and the eraser can never eat it.
//
// The drawing itself is a list of ops in logical coordinates (see
// draw/canvasUtils.js). Live strokes paint straight onto the canvas; undo,
// clear, reopen and resize replay the ops from scratch.
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Undo2, Trash2, Save, Images, Brush, Eraser, PaintBucket, Rainbow, Check, BookOpen, Pencil, Ghost } from 'lucide-react'
import { useTheme } from '../context/ThemeContext.jsx'
import { speak } from '../match/speak.js'
import { sfx } from '../match/sounds.js'
import Avatar from '../avatar/Avatar.jsx'
import { TEMPLATES, TEMPLATE_VIEW, TEMPLATE_STROKE, templateById } from './draw/templates.js'
import {
  FAMILY_PAGES,
  hasFamilyPages,
  familyPageById,
  loadPageOverlay,
  loadPageThumb,
  loadPageModes,
  savePageMode,
  PAGE_MODES,
  DEFAULT_PAGE_MODE,
  MODE_OPACITY,
} from './draw/familyPages.js'
import { buildPalette, BRUSH_SIZES, DEFAULT_COLOR, DEFAULT_SIZE, ERASER_SCALE, stickerList } from './draw/palette.js'
import { loadGallery, persistNewDrawing, removeDrawing, saveGallery, newDrawingId } from './draw/gallery.js'
import {
  makeView,
  toLogical,
  logicalRect,
  applyView,
  farEnough,
  lastSegment,
  tailSegment,
  dist,
  drawDot,
  drawSegment,
  drawOp,
  styleAt,
  renderOps,
  lastBg,
  containRect,
  loadImage,
  svgToImage,
  composeDrawing,
} from './draw/canvasUtils.js'

const MAX_OPS = 120 // beyond this the oldest ops are baked into one image...
const KEEP_OPS = 40 // ...keeping this many undo steps live
const MIN_POINT_GAP = 1.5 // logical units; drops jittery duplicate samples

// The board is remounted with a fresh key every time it opens, so the picked
// page has to live in storage or closing the board silently drops him back to
// the blank sheet. Same key family as the other saved preferences.
const PAGE_KEY = 'tommys-quests-draw-page'

// shown (and read aloud, without the emoji) when a picture cannot be displayed
const PAGE_FAILED_NOTE = 'הדף הזה לא נטען 😕'
const PAGE_FAILED_SAY = 'הדף הזה לא נטען'

/* ---- overlays we already prepared ---------------------------------------- */

// A MIRROR of the full-size cache inside familyPages.js: same cap, same order,
// same module-level lifetime. familyPages hands out blob URLs and revokes an
// evicted page's URL ten seconds later, so a cache here that outlived that one
// would sooner or later point an <img> at a dead URL — which is exactly how a
// healthy picture used to end up declared broken. The two are kept in step by
// construction: an entry is written here only when loadPageOverlay() actually
// ran, which is the same event that moves the id to the front over there, and a
// hit here calls loadPageOverlay() not at all, which touches neither. So this
// map can only ever evict a page EARLIER than familyPages does (a vector page
// takes a slot here that familyPages never fills), never later — and evicting
// early costs one cheap re-request, not a broken page.
//
// It lives at module scope, not in a ref, for two reasons: the board is
// remounted with a fresh key every time it opens and the keying work should
// survive that just as familyPages' cache does, and reading a ref while
// rendering is exactly what React tells you not to do — the overlay for a page
// we already prepared has to be readable during render or the previous page
// stays on screen while the new one is keyed.
const PAGE_CACHE_MAX = 6 // keep in step with FULL_CACHE_MAX in familyPages.js
const pageCache = new Map() // page id -> the overlay object loadPageOverlay resolved with

/**
 * Insertion-ordered, capped like familyPages' cache. Re-storing an id moves it
 * to the end, so the eviction order here matches the order over there. Nothing
 * is revoked: familyPages owns those blob URLs and releases them on its own
 * schedule; this map only forgets.
 */
function rememberPage(id, overlay) {
  pageCache.delete(id)
  pageCache.set(id, overlay)
  for (const key of pageCache.keys()) {
    if (pageCache.size <= PAGE_CACHE_MAX) break
    if (key === id) continue
    pageCache.delete(key)
  }
}

/**
 * What the family tiles say. Two different pictures can reduce to the same
 * visible name — "סבתא רחל.png", "סבתא-רחל.png" and "סבתא_רחל.png" are three
 * separate pages that all read "סבתא רחל", and three identical tiles are a coin
 * toss for an eight-year-old. Where the names collide the file name is shown
 * instead: it carries the extension, which is the honest difference between
 * סבתא.png and סבתא.jpg, plus whatever else the name threw away. Two files with
 * the same name in different subfolders fall back to a counter, because nothing
 * about the file itself tells them apart. A name that is already unique — most
 * of the shelf — is left exactly as it was. Only what he SEES changes; the page
 * is still read aloud by its plain name, since ".png" is not worth saying.
 */
function pageLabels(pages) {
  const tally = (list) => list.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())
  const names = pages.map((p) => p.name)
  const byName = tally(names)
  const shown = pages.map((p, i) => (byName.get(names[i]) > 1 ? p.file || names[i] : names[i]))
  const byShown = tally(shown)
  const seen = new Map()
  return new Map(
    pages.map((p, i) => {
      const label = shown[i]
      if ((byShown.get(label) ?? 0) < 2) return [p.id, label]
      const n = (seen.get(label) ?? 0) + 1
      seen.set(label, n)
      return [p.id, `${label} ${n}`]
    }),
  )
}

const PAGE_LABELS = pageLabels(FAMILY_PAGES)
const pageLabel = (page) => PAGE_LABELS.get(page.id) ?? page.name

/** last picked page, or 'blank' if it is gone (file deleted) or unreadable */
function loadTemplateId() {
  try {
    const id = globalThis.localStorage?.getItem(PAGE_KEY)
    if (!id) return 'blank'
    const known = Boolean(familyPageById(id)) || TEMPLATES.some((t) => t.id === id)
    return known ? id : 'blank'
  } catch {
    return 'blank'
  }
}

function saveTemplateId(id) {
  try {
    globalThis.localStorage?.setItem(PAGE_KEY, id)
  } catch {
    // storage unavailable — the choice still holds for this session
  }
}

/**
 * שקוף is forgiving: every time a page becomes the current one — picked from
 * the shelf, or restored when the board reopens — it starts with dark lines, so
 * one stray tap can never leave it nearly invisible tomorrow.
 */
function withLinesBack(modes, id) {
  return modes[id] && modes[id] !== DEFAULT_PAGE_MODE ? savePageMode(modes, id, DEFAULT_PAGE_MODE) : modes
}

const TOOLS = [
  { id: 'brush', label: 'מכחול', Icon: Brush },
  { id: 'rainbow', label: 'קשת', Icon: Rainbow },
  { id: 'eraser', label: 'מחק', Icon: Eraser },
  { id: 'bucket', label: 'רקע', Icon: PaintBucket },
]

export default function Draw({ onClose }) {
  const { theme } = useTheme()
  const palette = buildPalette(theme)
  const stickers = stickerList(theme)

  const [tool, setTool] = useState('brush')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [sizeId, setSizeId] = useState(DEFAULT_SIZE)
  const [sticker, setSticker] = useState(stickers[0])
  const [templateId, setTemplateId] = useState(loadTemplateId)
  const [sheet, setSheet] = useState(null) // 'stickers' | 'templates' | 'gallery'
  const [confirm, setConfirm] = useState(null) // { emoji, text, onYes }
  const [note, setNote] = useState(null)
  const [gallery, setGallery] = useState([])
  const [saving, setSaving] = useState(false)
  // render-side mirror of the ops list (count for button states, bg for the layer)
  const [opInfo, setOpInfo] = useState({ count: 0, bg: '#ffffff' })
  // family pages: the cleaned-up overlay, plus his per-page קווים/שקוף choice.
  // The overlay is stored WITH the id it belongs to and everything on screen is
  // derived from that below, so the page he just tapped can never be shown
  // wearing the previous page's lines.
  const [loaded, setLoaded] = useState(null) // { id, overlay: { url } | null, cached } | null
  const [reloadTick, setReloadTick] = useState(0) // bumped to re-ask for a page (see onOverlayError)
  // `templateId` is already initialized above, so the page he reopens on comes
  // back with its lines dark even if he left it faded yesterday
  const [pageModes, setPageModes] = useState(() => withLinesBack(loadPageModes(), templateId))

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const templateSvgRef = useRef(null)
  const templateImgRef = useRef(null)
  const dollBtnRef = useRef(null)
  const dollImgRef = useRef(null)
  const opsRef = useRef([])
  const viewRef = useRef(makeView(1, 1, 1))
  const strokeRef = useRef(null) // { op, pointerId, len } while a finger is down
  const dirtyRef = useRef(false) // painting happened since the last save/open
  const retriedRef = useRef(new Set()) // pages waiting to prove a re-fetch worked (see onOverlayLoad)

  const size = BRUSH_SIZES.find((s) => s.id === sizeId) ?? BRUSH_SIZES[1]
  // a page is either the built-in path art or a family picture
  const template = familyPageById(templateId) ?? templateById(templateId)
  const isImagePage = template.kind === 'image'
  const pageMode = pageModes[template.id] ?? DEFAULT_PAGE_MODE
  const overlayAlpha = MODE_OPACITY[pageMode] ?? 1
  // What is on screen is derived, never assigned in the effect below: a page we
  // prepared earlier is on the very first render after the tap (no flash of the
  // spinner), a page we have not prepared shows nothing but the spinner (no
  // flash of the PREVIOUS page's lines), and switching away needs no cleanup at
  // all because `loaded` only counts while its id is the current one.
  //
  // For a page that went into pageCache, `loaded` is only the nudge to re-render
  // and pageCache holds the truth — so an entry evicted underneath us reads as
  // "gone, fetch it again", never as a URL familyPages may since have revoked.
  // That is the one direction these two must never drift in. What `loaded` does
  // own is the result that was deliberately NOT cached: the un-keyed fallback
  // picture, whose URL is the static asset and outlives every cache here.
  const ready = isImagePage ? (pageCache.get(template.id) ?? null) : null
  const loadedHere = isImagePage && loaded?.id === template.id ? loaded : null
  const overlay = ready ?? (loadedHere && !loadedHere.cached ? loadedHere.overlay : null)
  // "still keying" — including a cached page that was evicted and is on its way
  // back. A finished load with nothing to show ends the wait too, or the spinner
  // would sit there forever.
  const overlayBusy = isImagePage && !overlay && (!loadedHere || loadedHere.cached)
  // A page we could not key still carries its white paper, so it always shows
  // faint — at full strength the photo would bury his painting. Art that needed
  // no keying (vector, or a picture that arrived transparent already) follows
  // his own קווים/שקוף choice like a keyed page does.
  const overlayFailed = !!overlay && (overlay.failed === true || overlay.status === 'failed')
  // exactly what he sees on screen; composeDrawing gets this same number so
  // the saved picture matches the board
  const shownAlpha = overlayFailed ? MODE_OPACITY.trace : overlayAlpha
  const isBlank = !isImagePage && (template.paths?.length ?? 0) === 0
  const bg = opInfo.bg
  const hasOps = opInfo.count > 0

  const ctx2d = () => canvasRef.current?.getContext('2d')
  const sync = () => setOpInfo({ count: opsRef.current.length, bg: lastBg(opsRef.current) })

  // The browser cannot paint this picture at all — a .heic renamed to .jpg, a
  // truncated file, an image past Safari's decode ceiling. The overlay is
  // aria-hidden with an empty alt, so nothing whatsoever would appear: say so
  // out loud and put him back on the blank page instead of a white void.
  // Reached from a decode failure and from the <img> itself giving up.
  const failPage = useCallback(() => {
    pageCache.delete(templateId)
    setLoaded(null) // whatever we were holding for this page is not showable
    setTemplateId('blank') // no longer an image page, so the overlay derives to nothing
    sfx.buzz()
    setNote(PAGE_FAILED_NOTE)
    speak(PAGE_FAILED_SAY)
  }, [templateId])

  // An overlay we are re-showing from the cache can have had its URL released
  // underneath us; that is a stale link, not a broken picture, so ask for the
  // page once more. Only a page that fails on a fresh load is really unusable.
  //
  // The marker below is a budget of one reload PER FAILURE, not per session:
  // onOverlayLoad clears it as soon as the page actually appears. It used to be
  // per session, and the eighth page he opened was enough to spend it, so the
  // second time a page was evicted a perfectly good picture got the buzz and he
  // was dumped on the blank sheet. What still cannot happen is a reload loop: a
  // file the browser cannot decode never fires onLoad, so its marker survives
  // the retry and the second error goes straight to failPage().
  const onOverlayError = () => {
    if (pageCache.delete(templateId) && !retriedRef.current.has(templateId)) {
      retriedRef.current.add(templateId)
      setLoaded(null) // drop the dead URL, or the <img> keeps it and never re-errors
      setReloadTick((n) => n + 1)
      return
    }
    failPage()
  }

  // It rendered, so the entry we were holding was fine after all: hand the page
  // its retry back for the next time a blob URL is pulled out from under it.
  const onOverlayLoad = () => {
    retriedRef.current.delete(templateId)
  }

  const replay = useCallback(() => {
    const ctx = ctx2d()
    if (!ctx) return
    renderOps(ctx, opsRef.current, viewRef.current)
    // a stroke in progress during a rotate must survive the redraw
    if (strokeRef.current) drawOp(ctx, strokeRef.current.op)
  }, [])

  // size the canvas to its box (dpr-aware) and redraw; observes orientation changes
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = () => {
      const r = wrap.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      if (!w || !h) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const v = viewRef.current
      if (v.w === w && v.h === h && v.dpr === dpr && canvas.width) return
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      viewRef.current = makeView(w, h, dpr)
      replay()
    }
    fit()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fit)
      return () => window.removeEventListener('resize', fit)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [replay])

  useEffect(() => {
    speak('בואו נצייר!', { delay: 600 })
  }, [])

  // Turn the picked family picture into a transparent-paper overlay. Cached in
  // familyPages and mirrored in pageCache, so flipping back to a page is instant.
  //
  // This effect fetches and nothing else — no setState runs synchronously inside
  // it (react/set-state-in-effect), because everything on screen is derived from
  // `ready`/`loaded` above. Clearing the previous page used to need a
  // synchronous setOverlay(null) here, and being an effect it landed a frame
  // late anyway; deriving does it before the first paint instead.
  //
  // Walking the shelf, with both caches holding six pages:
  //
  //   1st page  — a miss on both sides. loadPageOverlay keys the photo,
  //               familyPages files the blob URL under the page id, the resolve
  //               below files the same result in pageCache, the <img> loads and
  //               onOverlayLoad clears a retry marker that was never set.
  //   8th page  — opening pages 2..7 pushed page 1 out of BOTH caches at the
  //               same moment (same cap, same order), and familyPages revoked
  //               its blob URL ten seconds later. So going back to page 1 now is
  //               a clean miss: keyed again, fresh blob URL, nothing errors.
  //               This is what an unbounded cache here got wrong — it kept the
  //               revoked URL, the <img> errored, and the one retry was spent.
  //   15th page — the same as the 8th, every time, which is the whole point. The
  //               retry budget is per failure now: even if a stale URL does slip
  //               through, the <img> errors once, we drop the entry, reload, and
  //               the successful load hands the retry back. A file that is
  //               genuinely unreadable still stops after exactly one reload.
  useEffect(() => {
    if (!isImagePage || pageCache.has(template.id)) return
    let alive = true
    loadPageOverlay(template)
      .then((res) => {
        if (!alive) return
        if (res) rememberPage(template.id, res)
        // `cached` says where the truth lives; recorded even when there is
        // nothing to show at all, so the spinner stops
        setLoaded({ id: template.id, overlay: res ?? null, cached: Boolean(res) })
      })
      .catch((err) => {
        if (!alive) return
        // Keying failed — fall back to the untouched picture, faint, so he can
        // still trace it rather than facing a blank page. Not cached, so picking
        // the page again retries. When the DECODE is what failed the raw <img>
        // cannot render either (canShowRaw === false), so say so out loud
        // instead of leaving him staring at white.
        const raw = err?.canShowRaw === false ? null : (err?.url ?? template.url)
        if (raw) setLoaded({ id: template.id, overlay: { url: raw, processed: false, failed: true }, cached: false })
        else failPage()
      })
    return () => {
      alive = false
    }
  }, [isImagePage, template, failPage, reloadTick])

  // the picked page outlives the board; closing it must not drop him to blank
  useEffect(() => {
    saveTemplateId(templateId)
  }, [templateId])

  // the doll image is cached per outfit; a new world means a new outfit
  useEffect(() => {
    dollImgRef.current = null
  }, [theme.id])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 2600)
    return () => clearTimeout(t)
  }, [note])

  const notify = (text, say = text) => {
    setNote(text)
    speak(say)
  }

  const ask = (emoji, text, onYes) => {
    sfx.click()
    speak(text)
    setConfirm({ emoji, text, onYes })
  }

  // --- ops --------------------------------------------------------------

  // keeps replay cheap on a long session: flatten old ops into one bitmap
  const bakeIfNeeded = () => {
    const ops = opsRef.current
    const canvas = canvasRef.current
    if (ops.length <= MAX_OPS || !canvas) return
    const view = viewRef.current
    const old = ops.slice(0, ops.length - KEEP_OPS)
    const off = document.createElement('canvas')
    off.width = canvas.width
    off.height = canvas.height
    renderOps(off.getContext('2d'), old, view)
    const bgOps = old.some((o) => o.type === 'bg') ? [{ type: 'bg', color: lastBg(old) }] : []
    opsRef.current = [...bgOps, { type: 'image', img: off, ...logicalRect(view) }, ...ops.slice(-KEEP_OPS)]
  }

  const pushOp = (op) => {
    opsRef.current.push(op)
    bakeIfNeeded()
    dirtyRef.current = true
    sync()
  }

  const paintLive = (op) => {
    const ctx = ctx2d()
    if (!ctx) return
    applyView(ctx, viewRef.current)
    drawOp(ctx, op)
  }

  const undo = () => {
    if (!opsRef.current.length) {
      sfx.buzz()
      return
    }
    opsRef.current.pop()
    dirtyRef.current = true
    replay()
    sync()
    sfx.click()
  }

  const clearAll = () => {
    if (!hasOps) {
      sfx.buzz()
      return
    }
    ask('🗑️', 'למחוק את כל הציור?', () => {
      opsRef.current = []
      dirtyRef.current = false // an empty board has nothing left to lose
      replay()
      sync()
      sfx.pop()
    })
  }

  // The board is thrown away when it closes, so an unsaved painting is gone for
  // good — ask first, exactly like clear-all and reopen-from-gallery do.
  const closeBoard = () => {
    if (!hasOps || !dirtyRef.current) {
      sfx.click()
      onClose()
      return
    }
    ask('👋', 'לצאת מהציור? מה שלא שמרת ייעלם', onClose)
  }

  // --- the doll ----------------------------------------------------------

  const getDollImage = async () => {
    if (dollImgRef.current) return dollImgRef.current
    const svg = dollBtnRef.current?.querySelector('svg')
    if (!svg) return null
    const img = await svgToImage(svg, 200, 320)
    dollImgRef.current = img
    return img
  }

  const stampDoll = async (p) => {
    try {
      const img = await getDollImage()
      if (!img) return
      const h = size.doll
      const w = (h * 200) / 320
      const op = { type: 'image', img, x: p.x - w / 2, y: p.y - h / 2, w, h }
      paintLive(op)
      pushOp(op)
      sfx.pop()
    } catch {
      sfx.buzz()
    }
  }

  // --- pointer -----------------------------------------------------------

  const pointOf = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return toLogical(e.clientX - rect.left, e.clientY - rect.top, viewRef.current)
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (overlayBusy) return // the new page's lines are about to land here
    if (strokeRef.current) return // one finger at a time
    const p = pointOf(e)
    if (tool === 'sticker') {
      const op = { type: 'sticker', emoji: sticker, x: p.x, y: p.y, size: size.sticker }
      paintLive(op)
      pushOp(op)
      sfx.pop()
      return
    }
    if (tool === 'doll') {
      stampDoll(p)
      return
    }
    if (tool === 'bucket') {
      pushOp({ type: 'bg', color })
      sfx.pop()
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const width = tool === 'eraser' ? size.width * ERASER_SCALE : size.width
    const op = { type: 'stroke', tool, color, width, points: [p] }
    const ctx = ctx2d()
    if (ctx) {
      applyView(ctx, viewRef.current)
      drawDot(ctx, p, styleAt(op, 0))
    }
    strokeRef.current = { op, pointerId: e.pointerId, len: 0 }
  }

  const onPointerMove = (e) => {
    const s = strokeRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const ctx = ctx2d()
    if (!ctx) return
    applyView(ctx, viewRef.current)
    const native = e.nativeEvent
    const coalesced = native.getCoalescedEvents?.()
    const samples = coalesced?.length ? coalesced : [native]
    const pts = s.op.points
    for (const ev of samples) {
      const p = pointOf(ev)
      if (!farEnough(pts[pts.length - 1], p, MIN_POINT_GAP)) continue
      pts.push(p)
      const seg = lastSegment(pts)
      if (seg) {
        drawSegment(ctx, seg, styleAt(s.op, s.len))
        s.len += dist(seg.from, seg.to)
      }
    }
  }

  const endStroke = (e) => {
    const s = strokeRef.current
    if (!s || (e && s.pointerId !== e.pointerId)) return
    strokeRef.current = null
    const tail = tailSegment(s.op.points)
    const ctx = ctx2d()
    if (tail && ctx) {
      applyView(ctx, viewRef.current)
      drawSegment(ctx, tail, styleAt(s.op, s.len))
    }
    pushOp(s.op)
  }

  // --- tools -------------------------------------------------------------

  const pickTool = (id, label) => {
    setTool(id)
    sfx.click()
    if (label) speak(label)
  }

  const pickColor = (c) => {
    setColor(c)
    sfx.click()
    if (tool === 'eraser') setTool('brush')
    if (tool === 'bucket') pushOp({ type: 'bg', color: c })
  }

  const pickSize = (id) => {
    setSizeId(id)
    sfx.click()
  }

  const pickSticker = (s) => {
    setSticker(s)
    setTool('sticker')
    setSheet(null)
    sfx.click()
  }

  const togglePageMode = () => {
    const next = pageMode === PAGE_MODES.lines ? PAGE_MODES.trace : PAGE_MODES.lines
    setPageModes((m) => savePageMode(m, template.id, next))
    sfx.click()
    speak(next === PAGE_MODES.lines ? 'קווים כהים' : 'דף שקוף')
  }

  const pickTemplate = (t) => {
    // picking a page is also the way back from a faded one: lines come back
    setPageModes((m) => withLinesBack(m, t.id))
    setTemplateId(t.id)
    setSheet(null)
    sfx.ding()
    speak(t.name)
  }

  // --- gallery -----------------------------------------------------------

  const save = async () => {
    if (saving) return
    if (!hasOps && isBlank) {
      sfx.buzz()
      notify('הדף ריק — ציירו משהו קודם!')
      return
    }
    setSaving(true)
    try {
      const view = viewRef.current
      const { dataUrl, w, h } = await composeDrawing({
        canvas: canvasRef.current,
        bg,
        templateSvg: !isImagePage && template.paths.length ? templateSvgRef.current : null,
        templateImg: isImagePage ? templateImgRef.current : null,
        // bake the page at the opacity he is looking at, not at full black
        templateAlpha: shownAlpha,
        w: view.w,
        h: view.h,
      })
      const entry = { id: newDrawingId(), at: Date.now(), dataUrl, w, h, template: templateId }
      const res = persistNewDrawing(loadGallery(), entry)
      if (!res.saved) {
        sfx.buzz()
        notify('אוי, אין מקום לשמור 😕')
        return
      }
      setGallery(res.list)
      dirtyRef.current = false // safely in the gallery; closing now loses nothing
      sfx.fanfare()
      notify(res.dropped ? 'שמרתי! מחקתי ציור ישן כדי לפנות מקום' : 'שמרתי את הציור! 💾', 'שמרתי את הציור!')
    } catch {
      sfx.buzz()
      notify('אוי, משהו השתבש 😕')
    } finally {
      setSaving(false)
    }
  }

  const openGallery = () => {
    sfx.click()
    speak('הציורים שלי')
    setGallery(loadGallery())
    setSheet('gallery')
  }

  const reopen = (entry) => {
    const go = async () => {
      try {
        const img = await loadImage(entry.dataUrl)
        const box = logicalRect(viewRef.current)
        const r = containRect(img.naturalWidth || entry.w || 4, img.naturalHeight || entry.h || 3, box)
        opsRef.current = [{ type: 'image', img, ...r }]
        dirtyRef.current = false // this is the saved picture, unchanged so far
        setTemplateId('blank') // the outline is already baked into the picture
        setSheet(null)
        replay()
        sync()
        sfx.ding()
        speak('הנה הציור!')
      } catch {
        sfx.buzz()
      }
    }
    if (hasOps) ask('🖼️', 'לפתוח את הציור הזה? הציור הנוכחי ייעלם', go)
    else go()
  }

  const deleteEntry = (entry) => {
    ask('🗑️', 'למחוק את הציור הזה?', () => {
      const list = removeDrawing(gallery, entry.id)
      saveGallery(list)
      setGallery(list)
      sfx.pop()
    })
  }

  const dollTool = () => {
    pickTool('doll', 'הוסיפו אותי')
    getDollImage().catch(() => {})
  }

  const swatchColor = tool === 'eraser' ? '#ffffff' : color

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-(--t-side-deep) select-none"
      dir="rtl"
      style={{ WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* TOP BAR */}
      <div className="flex items-center gap-2 px-2 py-2 bg-(--t-side) border-b-4 border-(--t-side-deep) shrink-0">
        <IconBtn onClick={closeBoard} label="יציאה">
          <X size={32} strokeWidth={3} />
        </IconBtn>
        {/* title text hides on narrow phones where six 64px buttons already fill the bar */}
        <h1 className="flex-1 min-w-0 text-white font-black text-2xl md:text-3xl drop-shadow-md truncate">
          <span className="hidden sm:inline">🎨 ציור</span>
        </h1>
        {isImagePage &&
          (pageMode === PAGE_MODES.lines ? (
            // the label names what the tap DOES, not what the page already is
            <LabeledBtn onClick={togglePageMode} label="דף שקוף" hint="דף שקוף — הקווים יחווירו כדי שתוכל לצייר מעליהם">
              <Ghost size={24} strokeWidth={2.5} />
            </LabeledBtn>
          ) : (
            <LabeledBtn onClick={togglePageMode} label="קווים כהים" hint="קווים כהים — הקווים יחזרו להיות כהים" tone="accent">
              <Pencil size={24} strokeWidth={2.5} />
            </LabeledBtn>
          ))}
        <IconBtn onClick={undo} label="ביטול" disabled={!hasOps}>
          <Undo2 size={30} strokeWidth={3} />
        </IconBtn>
        <IconBtn onClick={clearAll} label="מחיקת הכל" disabled={!hasOps}>
          <Trash2 size={28} strokeWidth={2.5} />
        </IconBtn>
        <IconBtn onClick={save} label="שמירה" disabled={saving} tone="accent">
          <Save size={30} strokeWidth={2.5} />
        </IconBtn>
        <IconBtn onClick={openGallery} label="הציורים שלי">
          <Images size={30} strokeWidth={2.5} />
        </IconBtn>
      </div>

      {/* BODY: canvas + toolbar (toolbar at the side in landscape, below in portrait) */}
      <div className="flex-1 min-h-0 flex flex-col landscape:flex-row">
        <div ref={wrapRef} className="relative flex-1 min-h-0 min-w-0 overflow-hidden bg-white touch-none">
          <div className="absolute inset-0" style={{ background: bg }} aria-hidden="true" />
          <canvas
            ref={canvasRef}
            className="absolute top-0 start-0 touch-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onLostPointerCapture={endStroke}
            aria-label="לוח ציור"
          />
          {isImagePage ? (
            overlay && (
              <img
                ref={templateImgRef}
                src={overlay.url}
                alt=""
                aria-hidden="true"
                draggable="false"
                onLoad={onOverlayLoad}
                onError={onOverlayError}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{ opacity: shownAlpha }}
              />
            )
          ) : (
            <TemplateSvg ref={templateSvgRef} template={template} className="absolute inset-0 w-full h-full pointer-events-none" />
          )}
          {/* swallows touches on purpose: painting now lands where the new lines are about to appear */}
          {overlayBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 touch-none" style={{ touchAction: 'none' }}>
              <span className="bg-white/90 rounded-2xl px-5 py-3 font-black text-slate-700 text-xl anim-pop">מכינים את הדף…</span>
            </div>
          )}
        </div>

        <div
          className="shrink-0 bg-(--t-side) border-(--t-side-deep) border-t-4 landscape:border-t-0 landscape:border-s-4 landscape:order-first landscape:w-52 max-h-[42%] landscape:max-h-none overflow-y-auto overflow-x-hidden p-2 flex flex-col gap-2"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* tools */}
          <div className="flex flex-wrap justify-center gap-2">
            {TOOLS.map((t) => (
              <ToolBtn key={t.id} active={tool === t.id} onClick={() => pickTool(t.id, t.label)} label={t.label}>
                <t.Icon size={26} strokeWidth={2.5} />
              </ToolBtn>
            ))}
            <ToolBtn
              active={tool === 'sticker'}
              label="מדבקות"
              onClick={() => {
                pickTool('sticker', 'מדבקות')
                setSheet('stickers')
              }}
            >
              <span className="text-2xl leading-none">{sticker}</span>
            </ToolBtn>
            <ToolBtn ref={dollBtnRef} active={tool === 'doll'} label="הוסיפו אותי" onClick={dollTool}>
              <Avatar size={34} />
            </ToolBtn>
            <ToolBtn
              active={template.id !== 'blank'}
              label="דפי צביעה"
              onClick={() => {
                sfx.click()
                speak('דפי צביעה')
                setSheet('templates')
              }}
            >
              <BookOpen size={26} strokeWidth={2.5} />
            </ToolBtn>
          </div>

          {/* sizes */}
          <div className="flex flex-wrap justify-center gap-2">
            {BRUSH_SIZES.map((s) => (
              <button
                key={s.id}
                onClick={() => pickSize(s.id)}
                aria-label={s.label}
                aria-pressed={sizeId === s.id}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-b-4 flex items-center justify-center transition-all active:translate-y-0.5 active:border-b-2
                  ${sizeId === s.id ? 'bg-(--t-accent) border-(--t-accent-deep)' : 'bg-white/15 border-black/30'}`}
              >
                <span
                  className="rounded-full border-2 border-black/30"
                  style={{ width: s.dot, height: s.dot, background: swatchColor }}
                />
              </button>
            ))}
          </div>

          {/* colors */}
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => pickColor(c)}
                aria-label={`צבע ${c}`}
                aria-pressed={color === c && tool !== 'eraser'}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 transition-transform active:scale-90
                  ${color === c && tool !== 'eraser' ? 'border-white ring-4 ring-(--t-accent) scale-110' : 'border-black/25'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* NOTE */}
      {note && (
        <div className="absolute top-20 inset-x-0 z-40 flex justify-center pointer-events-none px-4">
          <div className="anim-pop bg-green-500 border-4 border-green-700 text-white font-black text-xl px-6 py-3 rounded-2xl shadow-2xl text-center">
            {note}
          </div>
        </div>
      )}

      {/* SHEETS */}
      {sheet === 'stickers' && (
        <Sheet title="מדבקות" emoji="✨" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {stickers.map((s) => (
              <button
                key={s}
                onClick={() => pickSticker(s)}
                aria-label={s}
                className={`h-20 rounded-2xl border-b-8 text-5xl flex items-center justify-center transition-all active:translate-y-1 active:border-b-2
                  ${sticker === s && tool === 'sticker' ? 'bg-(--t-accent) border-(--t-accent-deep)' : 'bg-slate-100 border-slate-300'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'templates' && (
        <Sheet title="דפי צביעה" emoji="🖍️" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {TEMPLATES.map((t) => (
              <PageTile key={t.id} active={templateId === t.id} onClick={() => pickTemplate(t)} label={`${t.emoji} ${t.name}`} name={t.name}>
                {t.paths.length ? <TemplateSvg template={t} className="w-full h-full" /> : <span className="text-5xl">{t.emoji}</span>}
              </PageTile>
            ))}
          </div>

          {/* pictures Lior drops into app/coloring-pages/ — see that folder's README */}
          {hasFamilyPages && (
            <>
              <h3 className="mt-5 mb-2 text-2xl font-black text-slate-700">המשפחה שלי 💕</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {FAMILY_PAGES.map((t) => {
                  // two files can share a name — the tile has to say which is which
                  const label = pageLabel(t)
                  return (
                    <PageTile key={t.id} active={templateId === t.id} onClick={() => pickTemplate(t)} label={label} name={label}>
                      <FamilyThumb page={t} />
                    </PageTile>
                  )
                })}
              </div>
            </>
          )}
        </Sheet>
      )}

      {sheet === 'gallery' && (
        <Sheet title="הציורים שלי" emoji="🖼️" onClose={() => setSheet(null)}>
          {gallery.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="text-7xl">🎨</span>
              <p className="text-2xl font-black text-slate-700">עוד אין ציורים — בואו נצייר!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallery.map((g) => (
                <GalleryCard key={g.id} entry={g} onOpen={() => reopen(g)} onDelete={() => deleteEntry(g)} />
              ))}
            </div>
          )}
        </Sheet>
      )}

      {confirm && (
        <Confirm
          emoji={confirm.emoji}
          text={confirm.text}
          onYes={() => {
            const fn = confirm.onYes
            setConfirm(null)
            fn()
          }}
          onNo={() => {
            sfx.click()
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}

// --- small pieces -----------------------------------------------------------

function IconBtn({ onClick, label, disabled, tone, children }) {
  const skin =
    tone === 'accent'
      ? 'bg-(--t-accent) text-slate-900 border-b-4 border-(--t-accent-deep)'
      : 'bg-white/15 text-white border-b-4 border-black/30'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center transition-all active:translate-y-0.5 active:border-b-2 disabled:opacity-40 ${skin}`}
    >
      {children}
    </button>
  )
}

/**
 * Top-bar button that carries words. "שקוף" cannot be guessed from an icon, and
 * an unlabelled button between undo and delete-all is a trap for a beginning
 * reader — so this one shows its Hebrew label like the toolbar buttons do.
 */
function LabeledBtn({ onClick, label, hint, tone, children }) {
  const skin =
    tone === 'accent'
      ? 'bg-(--t-accent) text-slate-900 border-b-4 border-(--t-accent-deep)'
      : 'bg-white/15 text-white border-b-4 border-black/30'
  return (
    <button
      onClick={onClick}
      aria-label={hint ?? label}
      title={hint ?? label}
      className={`w-16 sm:w-20 h-14 sm:h-16 shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all active:translate-y-0.5 active:border-b-2 ${skin}`}
    >
      {children}
      <span className="text-[11px] font-black leading-none whitespace-nowrap">{label}</span>
    </button>
  )
}

function ToolBtn({ ref, active, onClick, label, children }) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`w-14 h-14 rounded-2xl border-b-4 flex flex-col items-center justify-center gap-0.5 transition-all active:translate-y-0.5 active:border-b-2
        ${active ? 'bg-(--t-accent) text-slate-900 border-(--t-accent-deep) scale-105' : 'bg-white/15 text-white border-black/30'}`}
    >
      {children}
      <span className="text-[11px] font-black leading-none">{label}</span>
    </button>
  )
}

/** Picker tile art: the cleaned-up page, so the thumbnail matches what he gets. */
function FamilyThumb({ page }) {
  const [url, setUrl] = useState(page.vector ? page.url : null)
  useEffect(() => {
    let alive = true
    loadPageThumb(page)
      .then((r) => alive && r && setUrl(r.url))
      .catch(() => alive && setUrl(page.url)) // fall back to the raw picture
    return () => {
      alive = false
    }
  }, [page])
  if (!url) return <span className="text-3xl opacity-40">🖼️</span>
  return <img src={url} alt="" aria-hidden="true" className="w-full h-full object-contain" />
}

function PageTile({ active, onClick, label, name, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={name}
      className={`rounded-2xl border-b-8 p-2 flex flex-col items-center gap-1 transition-all active:translate-y-1 active:border-b-2
        ${active ? 'bg-(--t-accent) border-(--t-accent-deep)' : 'bg-slate-100 border-slate-300'}`}
    >
      <div className="w-full aspect-square bg-white rounded-xl border-2 border-slate-200 flex items-center justify-center overflow-hidden">
        {children}
      </div>
      {/* Two lines, not one: "סבתא רחל" and "סבתא רבקה" must not clip to the same
          word, and a name that had to grow its file name to stay unique needs the
          room as well (see pageLabels). */}
      <span className="text-lg font-black text-slate-800 leading-tight text-center line-clamp-2 break-words">{label}</span>
    </button>
  )
}

function TemplateSvg({ ref, template, className }) {
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${TEMPLATE_VIEW} ${TEMPLATE_VIEW}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="#111111" strokeWidth={TEMPLATE_STROKE} strokeLinecap="round" strokeLinejoin="round">
        {template.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}

function Sheet({ title, emoji, onClose, children }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-(--t-overlay) backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="anim-zoom-in bg-white rounded-3xl border-8 border-(--t-side-deep) shadow-2xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-2 bg-(--t-side) border-b-4 border-(--t-side-deep) shrink-0">
          <IconBtn onClick={onClose} label="סגירה">
            <X size={32} strokeWidth={3} />
          </IconBtn>
          <h2 className="flex-1 text-white font-black text-2xl drop-shadow-md">
            {emoji} {title}
          </h2>
        </div>
        <div className="p-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Confirm({ emoji, text, onYes, onNo }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-(--t-overlay) p-4">
      <div className="anim-pop bg-white rounded-3xl border-8 border-(--t-side-deep) shadow-2xl w-full max-w-md p-6 flex flex-col items-center gap-5 text-center">
        <div className="text-7xl">{emoji}</div>
        <p className="text-2xl font-black text-slate-800">{text}</p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onYes}
            className="flex-1 min-h-16 bg-green-500 text-white text-2xl font-black rounded-2xl border-b-8 border-green-700 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-2"
          >
            <Check size={30} strokeWidth={3} /> כן
          </button>
          <button
            onClick={onNo}
            className="flex-1 min-h-16 bg-red-500 text-white text-2xl font-black rounded-2xl border-b-8 border-red-700 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-2"
          >
            <X size={30} strokeWidth={3} /> לא
          </button>
        </div>
      </div>
    </div>
  )
}

// thumbnail: tap opens, long-press (or the bin button) deletes
function GalleryCard({ entry, onOpen, onDelete }) {
  const timer = useRef(null)
  const longPressed = useRef(false)
  const down = () => {
    longPressed.current = false
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      longPressed.current = true
      onDelete()
    }, 650)
  }
  const cancel = () => clearTimeout(timer.current)
  return (
    <div className="relative">
      <button
        onPointerDown={down}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onClick={() => {
          if (!longPressed.current) onOpen()
        }}
        aria-label="פתיחת ציור"
        className="w-full aspect-[4/3] bg-slate-100 rounded-2xl border-4 border-slate-200 overflow-hidden transition-transform active:scale-95"
      >
        <img src={entry.dataUrl} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
      </button>
      <button
        onClick={onDelete}
        aria-label="מחיקת ציור"
        className="absolute top-1 start-1 w-14 h-14 rounded-xl bg-red-500 border-b-4 border-red-700 text-white flex items-center justify-center active:translate-y-0.5 active:border-b-2"
      >
        <Trash2 size={26} strokeWidth={2.5} />
      </button>
    </div>
  )
}
