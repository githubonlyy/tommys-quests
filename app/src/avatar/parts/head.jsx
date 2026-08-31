// Head gear — drawn after the fringe, around the top of the head
// (head top is y 44, the hair cap reaches ~y 20).
import { palette, starPath } from './util.js'

const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

const cap = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      {/* crown + peak pointing to the doll's left */}
      <path d="M 50 62 C 50 22 150 22 150 62 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 50 62 Q 20 60 14 72 Q 34 78 52 70 Z" fill={p.accent} {...o(p.dark)} />
      <rect x="49" y="58" width="102" height="9" rx="4.5" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <circle cx="100" cy="26" r="4.5" fill={p.trim} stroke={p.dark} strokeWidth="1.5" />
      <path d="M 100 30 L 100 60" stroke={p.dark} strokeWidth="1.5" opacity="0.4" />
    </g>
  )
}

const beanie = ({ item }) => {
  const p = palette(item, '#0ea5e9')
  return (
    <g>
      <path d="M 46 66 C 46 20 154 20 154 66 Z" fill={p.main} {...o(p.dark)} />
      <rect x="44" y="60" width="112" height="14" rx="7" fill={p.accent} stroke={p.dark} strokeWidth="2.5" />
      <circle cx="100" cy="16" r="11" fill={p.trim} {...o(p.dark)} />
      <path d="M 70 34 Q 100 24 130 34" stroke={p.accent} strokeWidth="3" fill="none" opacity="0.7" />
    </g>
  )
}

const helmet = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      {/* full-face racing helmet: shell, visor, chin bar */}
      <path d="M 38 96 C 34 18 166 18 162 96 C 162 116 148 128 130 128 L 70 128 C 52 128 38 116 38 96 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 52 84 Q 100 70 148 84 L 146 106 Q 100 116 54 106 Z" fill="#1f2937" stroke={p.dark} strokeWidth="2.5" />
      <path d="M 58 88 Q 80 80 96 82" stroke="#93c5fd" strokeWidth="4" fill="none" opacity="0.6" strokeLinecap="round" />
      <path d="M 40 68 h 120" stroke={p.accent} strokeWidth="8" opacity="0.95" />
      <path d="M 96 24 h 8 v 44 h -8 Z" fill={p.accent} opacity="0.9" />
    </g>
  )
}

const spacehelmet = ({ item }) => {
  const p = palette(item, '#e2e8f0')
  return (
    <g>
      {/* glass bubble over the whole head, ring at the neck */}
      <circle cx="100" cy="92" r="66" fill="#bae6fd" opacity="0.35" stroke={p.dark} strokeWidth="3" />
      <path d="M 34 92 C 34 20 166 20 166 92 L 166 76 C 166 24 34 24 34 76 Z" fill={p.main} {...o(p.dark)} />
      <rect x="40" y="132" width="120" height="16" rx="8" fill={p.main} stroke={p.dark} strokeWidth="2.5" />
      <path d="M 58 74 Q 74 48 100 44" stroke="#ffffff" strokeWidth="7" fill="none" opacity="0.7" strokeLinecap="round" />
      <circle cx="160" cy="104" r="7" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <circle cx="40" cy="104" r="7" fill={p.accent} stroke={p.dark} strokeWidth="2" />
    </g>
  )
}

const dinohood = ({ item }) => {
  const p = palette(item, '#22c55e')
  return (
    <g>
      {/* hood shell with a row of spikes and two little eyes on top */}
      <path d="M 40 100 C 36 20 164 20 160 100 C 154 78 142 68 126 74 Q 100 84 74 74 C 58 68 46 78 40 100 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 66 40 l 8 -16 l 8 16 Z M 92 26 l 8 -18 l 8 18 Z M 118 40 l 8 -16 l 8 16 Z" fill={p.accent} {...o(p.dark)} />
      <circle cx="74" cy="56" r="7" fill="#ffffff" stroke={p.dark} strokeWidth="2" />
      <circle cx="126" cy="56" r="7" fill="#ffffff" stroke={p.dark} strokeWidth="2" />
      <circle cx="74" cy="57" r="3" fill="#1f2340" />
      <circle cx="126" cy="57" r="3" fill="#1f2340" />
    </g>
  )
}

const goggles = ({ item }) => {
  const p = palette(item, '#f59e0b')
  return (
    <g>
      <path d="M 44 74 Q 100 56 156 74" stroke={p.dark} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M 44 74 Q 100 56 156 74" stroke={p.main} strokeWidth="8" fill="none" strokeLinecap="round" />
      <circle cx="74" cy="70" r="17" fill="#7dd3fc" stroke={p.dark} strokeWidth="3" opacity="0.9" />
      <circle cx="126" cy="70" r="17" fill="#7dd3fc" stroke={p.dark} strokeWidth="3" opacity="0.9" />
      <path d="M 91 68 h 18" stroke={p.main} strokeWidth="5" strokeLinecap="round" />
      <path d="M 66 62 Q 74 56 82 60" stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.8" strokeLinecap="round" />
    </g>
  )
}

const headphones = ({ item }) => {
  const p = palette(item, '#8b5cf6')
  return (
    <g>
      <path d="M 44 82 C 48 26 152 26 156 82" stroke={p.dark} strokeWidth="13" fill="none" strokeLinecap="round" />
      <path d="M 44 82 C 48 26 152 26 156 82" stroke={p.main} strokeWidth="9" fill="none" strokeLinecap="round" />
      <rect x="32" y="74" width="24" height="34" rx="10" fill={p.main} {...o(p.dark)} />
      <rect x="144" y="74" width="24" height="34" rx="10" fill={p.main} {...o(p.dark)} />
      <rect x="38" y="82" width="12" height="18" rx="6" fill={p.accent} />
      <rect x="150" y="82" width="12" height="18" rx="6" fill={p.accent} />
    </g>
  )
}

const crown = ({ item }) => {
  const p = palette(item, '#facc15')
  return (
    <g>
      <path d="M 62 66 L 64 32 L 80 50 L 100 22 L 120 50 L 136 32 L 138 66 Z" fill={p.main} {...o(p.dark)} />
      <rect x="62" y="58" width="76" height="11" rx="3" fill={p.main} {...o(p.dark)} />
      <path d={starPath(100, 40, 6)} fill={p.accent} />
      <circle cx="80" cy="63.5" r="2.5" fill={p.accent} />
      <circle cx="120" cy="63.5" r="2.5" fill={p.accent} />
    </g>
  )
}

export const HEAD = { cap, beanie, helmet, spacehelmet, dinohood, goggles, headphones, crown }
