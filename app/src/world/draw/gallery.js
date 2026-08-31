// Saved drawings live in localStorage as small JPEG/PNG data URLs. Pure list
// helpers (addDrawing / removeDrawing) are separated from the storage I/O so
// the cap-and-trim rules can be unit-tested; every storage touch is try/catch.

export const GALLERY_KEY = 'tommys-quests-drawings'
export const GALLERY_MAX = 12

function storageOf(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const isEntry = (d) =>
  d && typeof d === 'object' && typeof d.id === 'string' && typeof d.dataUrl === 'string' && d.dataUrl.startsWith('data:image/')

/** newest-first list; corrupt or missing data yields [] */
export function loadGallery(storage) {
  try {
    const s = storageOf(storage)
    if (!s) return []
    const raw = s.getItem(GALLERY_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter(isEntry).slice(0, GALLERY_MAX) : []
  } catch {
    return []
  }
}

/** true when written, false when storage is missing/full/blocked */
export function saveGallery(list, storage) {
  try {
    const s = storageOf(storage)
    if (!s) return false
    s.setItem(GALLERY_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** prepend `entry`, keep at most `max` (newest first); reports how many fell off */
export function addDrawing(list, entry, max = GALLERY_MAX) {
  const next = [entry, ...list.filter((d) => d.id !== entry.id)]
  const dropped = next.splice(max)
  return { list: next, dropped: dropped.length }
}

export function removeDrawing(list, id) {
  return list.filter((d) => d.id !== id)
}

export function newDrawingId() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Add + persist. If the browser refuses (quota), drop the oldest drawing and
 * retry until it fits; never throws. `saved: false` means even the new drawing
 * alone did not fit.
 */
export function persistNewDrawing(list, entry, storage) {
  let { list: next, dropped } = addDrawing(list, entry)
  for (;;) {
    if (saveGallery(next, storage)) return { list: next, dropped, saved: true }
    if (next.length <= 1) return { list, dropped: 0, saved: false }
    next = next.slice(0, -1)
    dropped++
  }
}
