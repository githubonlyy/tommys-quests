import { describe, it, expect } from 'vitest'
import wardrobe from '../data/wardrobe.json'
import { VARIANTS, SLOTS, resolveEquipped } from '../avatar/registry.js'
import { petEmoji } from '../avatar/parts/pet.jsx'
import { AVATAR_SLOTS, REQUIRED_SLOTS } from '../context/PlayerContext.jsx'
import { THEME_IDS } from '../data/themes.js'

const PRICE_BANDS = {
  FREE: [0, 0],
  RARE: [150, 400],
  EPIC: [500, 900],
  LEGENDARY: [1000, 1500],
}

describe('wardrobe data', () => {
  it('every item has the required fields and a kebab-case id', () => {
    for (const i of wardrobe) {
      expect(i.id, JSON.stringify(i)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(typeof i.name === 'string' && i.name.trim().length > 0, i.id).toBe(true)
      expect(/[֐-׿]/.test(i.name), `${i.id} name should be Hebrew`).toBe(true)
      expect(typeof i.price, i.id).toBe('number')
      expect(i.colors, i.id).toBeTypeOf('object')
    }
  })

  it("themes are the three worlds or 'all'", () => {
    for (const i of wardrobe) expect([...THEME_IDS, 'all'], i.id).toContain(i.theme)
  })

  it("every item's variant is supported by the renderer for its slot", () => {
    for (const i of wardrobe) {
      expect(VARIANTS[i.slot], `${i.id} slot ${i.slot}`).toBeDefined()
      expect(VARIANTS[i.slot], `${i.id} variant ${i.variant}`).toContain(i.variant)
    }
  })

  it('registry slots mirror AVATAR_SLOTS', () => {
    expect(SLOTS.map((s) => s.id)).toEqual(AVATAR_SLOTS)
    expect(Object.keys(VARIANTS).sort()).toEqual([...AVATAR_SLOTS].sort())
  })

  it('every theme has at least 8 items of its own', () => {
    for (const t of THEME_IDS) {
      expect(wardrobe.filter((i) => i.theme === t).length, t).toBeGreaterThanOrEqual(8)
    }
  })

  it('every slot has at least 2 items', () => {
    for (const slot of AVATAR_SLOTS) {
      expect(wardrobe.filter((i) => i.slot === slot).length, slot).toBeGreaterThanOrEqual(2)
    }
  })

  it('has three free skin tones and a free item per required slot', () => {
    expect(wardrobe.filter((i) => i.slot === 'skin' && i.price === 0)).toHaveLength(3)
    for (const slot of REQUIRED_SLOTS) {
      expect(wardrobe.some((i) => i.slot === slot && i.price === 0), slot).toBe(true)
    }
  })

  it('prices sit inside their rarity band and FREE <=> price 0', () => {
    for (const i of wardrobe) {
      const band = PRICE_BANDS[i.rarity]
      expect(band, `${i.id} rarity ${i.rarity}`).toBeDefined()
      expect(i.price, `${i.id} price`).toBeGreaterThanOrEqual(band[0])
      expect(i.price, `${i.id} price`).toBeLessThanOrEqual(band[1])
      expect(i.price === 0, `${i.id} FREE/price mismatch`).toBe(i.rarity === 'FREE')
    }
  })

  it('every pet resolves to an emoji', () => {
    const pets = wardrobe.filter((i) => i.slot === 'pet')
    expect(pets.length).toBeGreaterThanOrEqual(2)
    for (const p of pets) {
      expect(typeof p.emoji, p.id).toBe('string')
      expect(petEmoji(p), p.id).toBeTruthy()
    }
  })

  it('total size stays in the 55-80 range the Closet is tuned for', () => {
    expect(wardrobe.length).toBeGreaterThanOrEqual(55)
    expect(wardrobe.length).toBeLessThanOrEqual(80)
  })
})

describe('resolveEquipped', () => {
  it('maps ids to items and drops unknown / wrong-slot ids without throwing', () => {
    const r = resolveEquipped({ skin: 'skin-light', hair: 'ghost', outfit: 'skin-light', head: null, pet: 'pet-kitten' })
    expect(r.skin?.id).toBe('skin-light')
    expect(r.hair).toBeNull()
    expect(r.outfit).toBeNull() // skin item in the outfit slot
    expect(r.head).toBeNull()
    expect(r.pet?.id).toBe('pet-kitten')
    for (const slot of AVATAR_SLOTS) expect(slot in r).toBe(true)
    expect(() => resolveEquipped(undefined)).not.toThrow()
  })
})
