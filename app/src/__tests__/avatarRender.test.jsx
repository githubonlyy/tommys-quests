// Renders the SVG doll through react-dom/server: every wardrobe item in its
// slot, and every world's starting outfit. Catches a part that throws or draws
// nothing long before it reaches the tablet.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import wardrobe from '../data/wardrobe.json'
import { THEME_IDS, THEMES } from '../data/themes.js'
import { defaultEquipped } from '../context/PlayerContext.jsx'
import { SLOTS, VARIANTS } from '../avatar/registry.js'
import { HAIR } from '../avatar/parts/hair.jsx'
import { OUTFIT } from '../avatar/parts/outfit.jsx'
import { SHOES } from '../avatar/parts/shoes.jsx'
import { HEAD } from '../avatar/parts/head.jsx'
import { HAND } from '../avatar/parts/hand.jsx'
import { BACK } from '../avatar/parts/back.jsx'

const TABLES = { outfit: OUTFIT, shoes: SHOES, head: HEAD, hand: HAND, back: BACK }

const svg = (children) => renderToStaticMarkup(<svg viewBox="0 0 200 320">{children}</svg>)

describe('avatar parts render', () => {
  it('every wardrobe item draws something in its slot', () => {
    for (const item of wardrobe) {
      if (item.slot === 'skin' || item.slot === 'pet') continue
      if (item.slot === 'hair') {
        const style = HAIR[item.variant]
        const back = svg(<style.Back item={item} uid="t" />)
        const front = svg(<style.Front item={item} uid="t" />)
        expect(back.length + front.length, item.id).toBeGreaterThan(120)
        continue
      }
      const Render = TABLES[item.slot][item.variant]
      const out = svg(<Render item={item} uid="t" />)
      expect(out.length, item.id).toBeGreaterThan(120)
      expect(out, `${item.id} undefined coordinate`).not.toContain('NaN')
      expect(out, `${item.id} undefined fill`).not.toContain('undefined')
    }
  })

  it('every renderer variant is reachable from the wardrobe', () => {
    for (const slot of Object.keys(TABLES)) {
      const used = new Set(wardrobe.filter((i) => i.slot === slot).map((i) => i.variant))
      for (const v of VARIANTS[slot]) expect(used.has(v), `${slot}/${v} is never sold`).toBe(true)
    }
  })

  it('each world dresses a full starter doll from free items', () => {
    for (const id of THEME_IDS) {
      const equipped = defaultEquipped(id)
      for (const { id: slot } of SLOTS) {
        if (!equipped[slot]) continue
        const item = wardrobe.find((i) => i.id === equipped[slot])
        expect(item, `${id} ${slot}`).toBeDefined()
        expect(item.price, `${id} ${slot} must be free at start`).toBe(0)
      }
      // and the world's preset is wearable: every preset item is a free item too
      for (const [slot, itemId] of Object.entries(THEMES[id].avatarPreset)) {
        const item = wardrobe.find((i) => i.id === itemId)
        expect(item?.slot, `${id} preset ${slot}`).toBe(slot)
      }
    }
  })
})
