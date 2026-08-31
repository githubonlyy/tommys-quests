// Shoes — one shape per foot, mirrored on both legs (x = 89 / 111, feet ~y 295).
import { palette } from './util.js'

const FEET = [89, 111]
const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

function Pair({ children }) {
  return (
    <g>
      {FEET.map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          {children}
        </g>
      ))}
    </g>
  )
}

const flat = ({ item }) => {
  const p = palette(item, '#ffffff')
  return (
    <Pair>
      <ellipse cx="0" cy="296" rx="12.5" ry="7" fill={p.main} {...o(p.dark)} />
      <rect x="-9" y="286" width="18" height="3.5" rx="1.75" fill={p.dark} />
    </Pair>
  )
}

const sneakers = ({ item }) => {
  const p = palette(item, '#3b82f6')
  return (
    <Pair>
      <path d="M -12 300 L -12 288 Q -12 279 -4 279 L 5 279 Q 12 279 12 288 L 12 300 Z" fill={p.main} {...o(p.dark)} />
      <rect x="-13.5" y="296" width="27" height="7" rx="3.5" fill="#ffffff" stroke={p.dark} strokeWidth="2" />
      <path d="M -5 285 L 5 285 M -5 290 L 5 290" stroke={p.accent} strokeWidth="2" strokeLinecap="round" />
    </Pair>
  )
}

const boots = ({ item }) => {
  const p = palette(item, '#166534')
  return (
    <Pair>
      <rect x="-11" y="258" width="22" height="44" rx="6" fill={p.main} {...o(p.dark)} />
      <rect x="-12.5" y="255" width="25" height="9" rx="4.5" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <rect x="-13" y="296" width="26" height="7" rx="3.5" fill={p.dark} />
    </Pair>
  )
}

const cleats = ({ item }) => {
  const p = palette(item, '#0ea5e9')
  return (
    <Pair>
      <path d="M -12 296 L -12 286 Q -12 278 -3 278 L 6 278 Q 12 278 12 288 L 12 296 Z" fill={p.main} {...o(p.dark)} />
      <path d="M -8 282 L 8 290" stroke={p.accent} strokeWidth="3" strokeLinecap="round" />
      <rect x="-13" y="294" width="26" height="5" rx="2.5" fill={p.dark} />
      {/* studs */}
      <path d="M -8 299 v 4 M 0 299 v 4 M 8 299 v 4" stroke={p.dark} strokeWidth="3" strokeLinecap="round" />
    </Pair>
  )
}

const spaceboots = ({ item }) => {
  const p = palette(item, '#e2e8f0')
  return (
    <Pair>
      <rect x="-13" y="262" width="26" height="40" rx="9" fill={p.main} {...o(p.dark)} />
      <rect x="-14" y="258" width="28" height="10" rx="5" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <rect x="-15" y="294" width="30" height="9" rx="4" fill={p.dark} />
      <circle cx="0" cy="280" r="3.5" fill={p.trim} stroke={p.dark} strokeWidth="1.5" />
    </Pair>
  )
}

const sandals = ({ item }) => {
  const p = palette(item, '#d97706')
  return (
    <Pair>
      <ellipse cx="0" cy="298" rx="12.5" ry="5.5" fill={p.main} {...o(p.dark)} />
      <path d="M -10 296 L 0 286 L 10 296" stroke={p.dark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M -7 292 L 7 292" stroke={p.dark} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="0" cy="286" r="2.5" fill={p.accent} />
    </Pair>
  )
}

export const SHOES = { flat, sneakers, boots, cleats, spaceboots, sandals }
