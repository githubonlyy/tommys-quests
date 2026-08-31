// Outfits — shirt + trousers drawn over the torso/arms, under the head.
// Colors: main (shirt), accent (trousers / trim), optional trim (details).
import { palette, starPath } from './util.js'

const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

// torso block; trousers hang off its hem at y 208
const SHIRT = 'M 76 158 Q 100 152 124 158 L 122 210 Q 100 216 78 210 Z'
const LONG_PANTS = 'M 78 206 L 122 206 L 126 286 L 106 286 L 100 228 L 94 286 L 74 286 Z'
const SHORTS = 'M 78 206 L 122 206 L 126 248 L 107 248 L 100 224 L 93 248 L 74 248 Z'

// short sleeves = a cuff ball on each shoulder; long = a stroke down the arm
function Sleeves({ color, dark, long = false, r = 13 }) {
  return (
    <g>
      {long && (
        <>
          <path d="M 90 170 L 60 228 M 110 170 L 140 228" stroke={dark} strokeWidth="19" strokeLinecap="round" fill="none" />
          <path d="M 90 170 L 60 228 M 110 170 L 140 228" stroke={color} strokeWidth="15" strokeLinecap="round" fill="none" />
        </>
      )}
      <circle cx="75" cy="166" r={r} fill={color} {...o(dark)} />
      <circle cx="125" cy="166" r={r} fill={color} {...o(dark)} />
    </g>
  )
}

function Collar({ dark }) {
  return <path d="M 88 156 L 100 168 L 112 156" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />
}

function Pants({ d, color, dark, cuff }) {
  return (
    <g>
      <path d={d} fill={color} {...o(dark)} />
      {cuff && (
        <>
          <rect x="74" y={cuff - 6} width="22" height="6" rx="3" fill={cuff ? dark : color} opacity="0.5" />
          <rect x="104" y={cuff - 6} width="22" height="6" rx="3" fill={dark} opacity="0.5" />
        </>
      )}
    </g>
  )
}

const tshirt = ({ item }) => {
  const p = palette(item, '#3b82f6')
  return (
    <g>
      <Pants d={SHORTS} color={p.accent} dark={p.dark} />
      <Sleeves color={p.main} dark={p.dark} />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      <rect x="78" y="184" width="44" height="7" rx="3.5" fill={p.trim} opacity="0.9" />
      <Collar dark={p.dark} />
    </g>
  )
}

const hoodie = ({ item }) => {
  const p = palette(item, '#64748b')
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.accent} dark={p.dark} cuff={286} />
      <Sleeves color={p.main} dark={p.dark} long />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      {/* hood bunched behind the neck */}
      <path d="M 80 158 Q 100 178 120 158 Q 112 148 100 148 Q 88 148 80 158 Z" fill={p.accent} {...o(p.dark)} />
      {/* kangaroo pocket + drawstrings */}
      <path d="M 84 188 L 116 188 L 112 204 L 88 204 Z" fill={p.accent} opacity="0.85" stroke={p.dark} strokeWidth="2" />
      <path d="M 94 166 L 92 180 M 106 166 L 108 180" stroke={p.trim} strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

const racer = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.main} dark={p.dark} />
      <Sleeves color={p.main} dark={p.dark} long />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      {/* racing stripes down the middle */}
      <path d="M 96 154 L 96 286 M 104 154 L 104 286" stroke={p.accent} strokeWidth="5" opacity="0.95" />
      <rect x="76" y="200" width="48" height="10" rx="5" fill={p.trim} stroke={p.dark} strokeWidth="2" />
      {/* number patch on the chest */}
      <circle cx="86" cy="176" r="9" fill="#ffffff" stroke={p.dark} strokeWidth="2" />
      <text x="86" y="181" fontSize="13" fontWeight="900" textAnchor="middle" fill={p.dark}>4</text>
    </g>
  )
}

const dinosuit = ({ item }) => {
  const p = palette(item, '#22c55e')
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.main} dark={p.dark} />
      <Sleeves color={p.main} dark={p.dark} long />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      {/* pale belly + spikes over the shoulders */}
      <ellipse cx="100" cy="188" rx="19" ry="26" fill={p.accent} opacity="0.9" />
      <path d="M 90 190 h 20 M 90 200 h 20 M 92 180 h 16" stroke={p.dark} strokeWidth="1.6" opacity="0.35" />
      <path d="M 78 160 l 6 -12 l 6 12 Z M 110 160 l 6 -12 l 6 12 Z" fill={p.trim} {...o(p.dark)} />
      <path d="M 74 214 l 8 -12 l 6 12 Z M 112 214 l 6 -12 l 8 12 Z" fill={p.trim} opacity="0.9" />
    </g>
  )
}

const spacesuit = ({ item }) => {
  const p = palette(item, '#e2e8f0')
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.main} dark={p.dark} cuff={286} />
      <Sleeves color={p.main} dark={p.dark} long r={14} />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      {/* chest control panel + hose */}
      <rect x="84" y="172" width="32" height="24" rx="6" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <circle cx="92" cy="180" r="3" fill="#ef4444" />
      <circle cx="101" cy="180" r="3" fill="#22c55e" />
      <circle cx="110" cy="180" r="3" fill="#facc15" />
      <rect x="89" y="188" width="22" height="4" rx="2" fill={p.dark} opacity="0.5" />
      <rect x="76" y="200" width="48" height="9" rx="4.5" fill={p.trim} stroke={p.dark} strokeWidth="2" />
      <path d="M 118 172 Q 132 186 126 206" stroke={p.dark} strokeWidth="3" fill="none" opacity="0.6" />
    </g>
  )
}

const overalls = ({ item }) => {
  const p = palette(item, '#3b82f6')
  const shirt = p.accent
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.main} dark={p.dark} />
      <Sleeves color={shirt} dark={p.dark} r={12} />
      <path d={SHIRT} fill={shirt} {...o(p.dark)} />
      <path d="M 86 174 L 80 156 M 114 174 L 120 156" stroke={p.main} strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="84" y="170" width="32" height="36" rx="4" fill={p.main} {...o(p.dark)} />
      <rect x="94" y="180" width="12" height="10" rx="2" fill={p.dark} opacity="0.5" />
      <circle cx="86" cy="172" r="2.5" fill={p.trim} />
      <circle cx="114" cy="172" r="2.5" fill={p.trim} />
    </g>
  )
}

const jersey = ({ item }) => {
  const p = palette(item, '#0ea5e9')
  return (
    <g>
      <Pants d={SHORTS} color="#ffffff" dark={p.dark} />
      {/* long socks under the shorts */}
      <path d="M 82 262 h 14 v 24 h -14 Z M 104 262 h 14 v 24 h -14 Z" fill={p.main} {...o(p.dark)} />
      <Sleeves color={p.accent} dark={p.dark} />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      <path d="M 88 154 L 88 212 M 112 154 L 112 212" stroke={p.accent} strokeWidth="6" opacity="0.9" />
      <text x="100" y="196" fontSize="24" fontWeight="900" textAnchor="middle" fill="#ffffff" stroke={p.dark} strokeWidth="1">4</text>
      <Collar dark={p.dark} />
    </g>
  )
}

const STARS = [[86, 176, 4], [114, 184, 3.5], [96, 202, 3.5], [84, 238, 4], [116, 250, 3.5], [98, 268, 3]]
const pajamas = ({ item }) => {
  const p = palette(item, '#6366f1')
  return (
    <g>
      <Pants d={LONG_PANTS} color={p.main} dark={p.dark} cuff={286} />
      <Sleeves color={p.main} dark={p.dark} long />
      <path d={SHIRT} fill={p.main} {...o(p.dark)} />
      <g fill={p.trim}>
        {STARS.map(([x, y, r]) => (
          <path key={`${x}-${y}`} d={starPath(x, y, r, r * 0.45)} />
        ))}
      </g>
      <path d="M 100 156 L 100 210" stroke={p.accent} strokeWidth="2.5" opacity="0.7" />
      <Collar dark={p.dark} />
    </g>
  )
}

export const OUTFIT = { tshirt, hoodie, racer, dinosuit, spacesuit, overalls, jersey, pajamas }
