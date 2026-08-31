// Registry of what the SVG doll can render. VARIANTS is derived from the part
// modules so a wardrobe item can never reference a style the renderer lacks
// (wardrobe.test.js enforces this).
import wardrobe from '../data/wardrobe.json'
import { HAIR } from './parts/hair.jsx'
import { OUTFIT } from './parts/outfit.jsx'
import { SHOES } from './parts/shoes.jsx'
import { HEAD } from './parts/head.jsx'
import { HAND } from './parts/hand.jsx'
import { BACK } from './parts/back.jsx'
import { PET } from './parts/pet.jsx'

// skin tones share one body renderer; the variant is just a name
export const SKIN_VARIANTS = ['light', 'medium', 'deep']

export const VARIANTS = {
  skin: SKIN_VARIANTS,
  hair: Object.keys(HAIR),
  outfit: Object.keys(OUTFIT),
  shoes: Object.keys(SHOES),
  head: Object.keys(HEAD),
  hand: Object.keys(HAND),
  back: Object.keys(BACK),
  pet: Object.keys(PET),
}

// Closet tab order + Hebrew labels (same order as PlayerContext AVATAR_SLOTS)
export const SLOTS = [
  { id: 'skin', label: 'עור', emoji: '🎨' },
  { id: 'hair', label: 'שיער', emoji: '💇' },
  { id: 'outfit', label: 'בגדים', emoji: '👕' },
  { id: 'shoes', label: 'נעליים', emoji: '👟' },
  { id: 'head', label: 'ראש', emoji: '🪖' },
  { id: 'hand', label: 'ביד', emoji: '⚽' },
  { id: 'back', label: 'גב', emoji: '🎒' },
  { id: 'pet', label: 'חיה', emoji: '🐾' },
]

export const ITEMS_BY_ID = new Map(wardrobe.map((i) => [i.id, i]))

export function getItem(id) {
  return ITEMS_BY_ID.get(id) ?? null
}

/**
 * slot -> wardrobe item (or null). Unknown ids, ids in the wrong slot and
 * unsupported variants are dropped so the doll never crashes on stale data.
 */
export function resolveEquipped(equipped) {
  const out = {}
  for (const { id: slot } of SLOTS) {
    const item = ITEMS_BY_ID.get(equipped?.[slot])
    out[slot] = item && item.slot === slot && VARIANTS[slot].includes(item.variant) ? item : null
  }
  return out
}
