import { usePlayer } from '../context/PlayerContext.jsx'
import { avatarById, frameById } from '../data/avatars.js'
import { gearById } from '../data/gear.js'

// Where each slot's accessory sits relative to the hero
const SLOT_POS = {
  head: '-top-1.5 left-1/2 -translate-x-1/2 -rotate-12',
  item: '-bottom-1 -start-1.5',
  pet: '-bottom-1 -end-1.5',
}

/**
 * The hero as he is currently kitted out: character emoji in his frame, with
 * equipped gear pinned around the box. Used everywhere the avatar appears so
 * accessories show up in one place only.
 */
export default function HeroAvatar({ size = 'md', className = '', avatar }) {
  const { state } = usePlayer()
  const a = avatar ?? state.avatar
  const frame = frameById(a.frameId)
  const box = {
    sm: 'w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl text-2xl md:text-3xl',
    md: 'w-16 h-16 rounded-2xl text-4xl',
    lg: 'w-20 h-20 md:w-24 md:h-24 rounded-2xl text-5xl md:text-6xl',
  }[size] ?? size
  const badge = { sm: 'text-sm', md: 'text-lg', lg: 'text-xl' }[size] ?? 'text-lg'

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span className={`${box} border-4 flex items-center justify-center leading-none shadow-lg ${frame.classes}`}>
        {avatarById(a.avatarId).emoji}
      </span>
      {Object.entries(a.gear ?? {}).map(([slot, id]) => {
        const g = id && gearById(id)
        if (!g || !SLOT_POS[slot]) return null
        return (
          <span
            key={slot}
            className={`absolute ${SLOT_POS[slot]} ${badge} leading-none drop-shadow pointer-events-none`}
          >
            {g.emoji}
          </span>
        )
      })}
    </span>
  )
}
