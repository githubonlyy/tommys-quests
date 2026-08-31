// The drawing board: a full-screen overlay with a big canvas, chunky tools and
// coloring pages. Props: { onClose }.
//
// Layers (bottom -> top): background color div -> drawing <canvas> -> template
// <svg> outline (pointer-events: none). The outline sits above the paint so the
// black lines stay crisp while she colors, and the eraser can never eat it.
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
  const [templateId, setTemplateId] = useState('blank')
  const [sheet, setSheet] = useState(null) // 'stickers' | 'templates' | 'gallery'
  const [confirm, setConfirm] = useState(null) // { emoji, text, onYes }
  const [note, setNote] = useState(null)
  const [gallery, setGallery] = useState([])
  const [saving, setSaving] = useState(false)
  // render-side mirror of the ops list (count for button states, bg for the layer)
  const [opInfo, setOpInfo] = useState({ count: 0, bg: '#ffffff' })
  // family pages: the cleaned-up overlay, plus her per-page קווים/שקוף choice
  const [overlay, setOverlay] = useState(null) // { url } once processed
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [pageModes, setPageModes] = useState(() => loadPageModes())

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const templateSvgRef = useRef(null)
  const templateImgRef = useRef(null)
  const dollBtnRef = useRef(null)
  const dollImgRef = useRef(null)
  const opsRef = useRef([])
  const viewRef = useRef(makeView(1, 1, 1))
  const strokeRef = useRef(null) // { op, pointerId, len } while a finger is down

  const size = BRUSH_SIZES.find((s) => s.id === sizeId) ?? BRUSH_SIZES[1]
  // a page is either the built-in path art or a family picture
  const template = familyPageById(templateId) ?? templateById(templateId)
  const isImagePage = template.kind === 'image'
  const pageMode = pageModes[template.id] ?? DEFAULT_PAGE_MODE
  const overlayAlpha = MODE_OPACITY[pageMode] ?? 1
  const isBlank = !isImagePage && (template.paths?.length ?? 0) === 0
  const bg = opInfo.bg
  const hasOps = opInfo.count > 0

  const ctx2d = () => canvasRef.current?.getContext('2d')
  const sync = () => setOpInfo({ count: opsRef.current.length, bg: lastBg(opsRef.current) })

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
    speak('בואי נצייר!', { delay: 600 })
  }, [])

  // Turn the picked family picture into a transparent-paper overlay. Cached per
  // session inside familyPages, so flipping back to a page is instant.
  useEffect(() => {
    if (!isImagePage) {
      setOverlay(null)
      setOverlayBusy(false)
      return
    }
    let alive = true
    setOverlayBusy(true)
    loadPageOverlay(template)
      .then((res) => alive && setOverlay(res))
      .catch(() => {
        // processing failed — fall back to the untouched picture, faint, so she
        // can still trace it rather than facing a blank page
        if (alive) setOverlay({ url: template.url, processed: false, failed: true })
      })
      .finally(() => alive && setOverlayBusy(false))
    return () => {
      alive = false
    }
  }, [isImagePage, template])

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
      replay()
      sync()
      sfx.pop()
    })
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
    speak(next === PAGE_MODES.lines ? 'קווים' : 'שקוף')
  }

  const pickTemplate = (t) => {
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
      notify('הדף ריק — ציירי משהו קודם!')
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
    pickTool('doll', 'הוסיפי אותי')
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
        <IconBtn onClick={onClose} label="יציאה">
          <X size={32} strokeWidth={3} />
        </IconBtn>
        {/* title text hides on narrow phones where six 64px buttons already fill the bar */}
        <h1 className="flex-1 min-w-0 text-white font-black text-2xl md:text-3xl drop-shadow-md truncate">
          <span className="hidden sm:inline">🎨 ציור</span>
        </h1>
        {isImagePage && (
          <IconBtn
            onClick={togglePageMode}
            label={pageMode === PAGE_MODES.lines ? 'קווים' : 'שקוף'}
            tone={pageMode === PAGE_MODES.trace ? 'accent' : undefined}
          >
            {pageMode === PAGE_MODES.lines ? <Pencil size={28} strokeWidth={2.5} /> : <Ghost size={28} strokeWidth={2.5} />}
          </IconBtn>
        )}
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
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{ opacity: overlay.failed ? MODE_OPACITY.trace : overlayAlpha }}
              />
            )
          ) : (
            <TemplateSvg ref={templateSvgRef} template={template} className="absolute inset-0 w-full h-full pointer-events-none" />
          )}
          {overlayBusy && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
            <ToolBtn ref={dollBtnRef} active={tool === 'doll'} label="הוסיפי אותי" onClick={dollTool}>
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

          {/* pictures Lior commits to src/world/draw/family/ — see that README */}
          {hasFamilyPages && (
            <>
              <h3 className="mt-5 mb-2 text-2xl font-black text-slate-700">המשפחה שלי 💕</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {FAMILY_PAGES.map((t) => (
                  <PageTile key={t.id} active={templateId === t.id} onClick={() => pickTemplate(t)} label={t.name} name={t.name}>
                    <FamilyThumb page={t} />
                  </PageTile>
                ))}
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
              <p className="text-2xl font-black text-slate-700">עוד אין ציורים — בואי נצייר!</p>
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

/** Picker tile art: the cleaned-up page, so the thumbnail matches what she gets. */
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
      <span className="text-lg font-black text-slate-800 leading-tight text-center line-clamp-1">{label}</span>
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
