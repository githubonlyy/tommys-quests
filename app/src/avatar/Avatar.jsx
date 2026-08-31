// The layered SVG doll. Reads the player's equipped items (or an override map
// for Closet previews) and composes one part per slot.
//
// Props:
//   size      rendered height in px (width follows the 200x320 aspect)
//   className extra classes on the <svg>
//   equipped  optional { slot: itemId } map overriding player state
//   themeId   optional world whose outfit to show (defaults to the active world)
//
// Layer order (bottom -> top): back item -> hair back -> legs/arms/torso ->
// shoes -> outfit -> head + face -> fringe -> head gear -> hand item -> pet.
import { useId } from 'react'
import { usePlayer, getEquipped } from '../context/PlayerContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { DEFAULT_THEME } from '../data/themes.js'
import { resolveEquipped } from './registry.js'
import { Body, Head } from './parts/body.jsx'
import { HAIR } from './parts/hair.jsx'
import { OUTFIT } from './parts/outfit.jsx'
import { SHOES } from './parts/shoes.jsx'
import { HEAD } from './parts/head.jsx'
import { HAND } from './parts/hand.jsx'
import { BACK } from './parts/back.jsx'
import { Pet } from './parts/pet.jsx'

const DEFAULT_SKIN = '#fcd9c4'

// renders a slot's variant component, or nothing if the item/variant is unknown
function Part({ table, item, uid }) {
  const Render = item ? table[item.variant] : null
  return Render ? <Render item={item} uid={uid} /> : null
}

export default function Avatar({ size = 64, className = '', equipped, themeId }) {
  const { state } = usePlayer()
  const { themeId: activeTheme } = useTheme()
  // gradient ids must be unique per doll (many dolls on one Closet page)
  const uid = 'av' + useId().replace(/[^a-zA-Z0-9]/g, '')
  // each world has its own outfit; `themeId` lets the picker show all three dolls
  const items = resolveEquipped(equipped ?? getEquipped(state, themeId ?? activeTheme ?? DEFAULT_THEME))

  const skin = items.skin?.colors?.skin ?? DEFAULT_SKIN
  const eyes = items.skin?.colors?.eyes ?? '#4f7fe0'
  const hair = items.hair ? HAIR[items.hair.variant] : null

  return (
    <svg
      viewBox="0 0 200 320"
      className={className}
      style={{ height: size, width: 'auto', maxHeight: '100%', display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <Part table={BACK} item={items.back} uid={uid} />
      {hair?.Back && <hair.Back item={items.hair} uid={uid} />}
      <Body skin={skin} />
      <Part table={SHOES} item={items.shoes} uid={uid} />
      <Part table={OUTFIT} item={items.outfit} uid={uid} />
      <Head skin={skin} eyes={eyes} />
      {hair?.Front && <hair.Front item={items.hair} uid={uid} />}
      <Part table={HEAD} item={items.head} uid={uid} />
      <Part table={HAND} item={items.hand} uid={uid} />
      {items.pet && <Pet item={items.pet} />}
    </svg>
  )
}
