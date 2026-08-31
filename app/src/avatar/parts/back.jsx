// Things worn on the back — the very first layer, behind hair and body.
import { palette } from './util.js'

const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

const backpack = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      <path d="M 86 154 Q 100 134 114 154" stroke={p.dark} strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="56" y="152" width="88" height="84" rx="18" fill={p.main} {...o(p.dark)} />
      <rect x="62" y="200" width="76" height="30" rx="10" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <path d="M 72 166 L 62 200 M 128 166 L 138 200" stroke={p.dark} strokeWidth="5" strokeLinecap="round" />
    </g>
  )
}

const jetpack = ({ item }) => {
  const p = palette(item, '#94a3b8')
  return (
    <g>
      {/* two tanks with flames licking out the bottom */}
      {[62, 122].map((x) => (
        <g key={x}>
          <rect x={x} y="150" width="30" height="76" rx="15" fill={p.main} {...o(p.dark)} />
          <rect x={x + 6} y="158" width="8" height="46" rx="4" fill={p.accent} opacity="0.8" />
          <rect x={x + 4} y="226" width="22" height="10" rx="4" fill={p.dark} />
          <path d={`M ${x + 8} 236 Q ${x + 15} 268 ${x + 22} 236 Q ${x + 15} 250 ${x + 8} 236 Z`} fill="#fb923c" />
          <path d={`M ${x + 11} 236 Q ${x + 15} 256 ${x + 19} 236 Z`} fill="#fde047" />
        </g>
      ))}
      <rect x="86" y="164" width="28" height="14" rx="6" fill={p.dark} opacity="0.7" />
    </g>
  )
}

const dinotail = ({ item }) => {
  const p = palette(item, '#22c55e')
  return (
    <g>
      {/* thick tail curling out to the doll's left, spikes along the top */}
      <path d="M 96 200 C 40 210 12 250 22 292 L 52 288 C 46 258 66 236 104 232 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 70 214 l -4 -14 l 14 6 Z M 44 232 l -8 -12 l 14 2 Z M 26 258 l -12 -6 l 10 -8 Z" fill={p.accent} {...o(p.dark)} />
      <path d="M 92 216 Q 60 226 44 250" stroke={p.accent} strokeWidth="3" fill="none" opacity="0.6" />
    </g>
  )
}

const cape = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      <path d="M 70 156 L 130 156 L 176 292 Q 100 308 24 292 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 100 160 L 90 292 M 100 160 L 110 292" stroke={p.dark} strokeWidth="1.5" opacity="0.35" />
      <path d="M 70 158 Q 100 148 130 158 L 130 168 Q 100 158 70 168 Z" fill={p.accent} {...o(p.dark)} />
    </g>
  )
}

const wings = ({ item }) => {
  const p = palette(item, '#a5b4fc')
  return (
    <g>
      <path d="M 92 174 C 62 96 -2 104 6 172 C -2 238 54 254 92 210 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 108 174 C 138 96 202 104 194 172 C 202 238 146 254 108 210 Z" fill={p.main} {...o(p.dark)} />
      <path d="M 80 182 C 58 130 20 134 22 178 C 18 226 56 236 80 206 Z" fill={p.accent} opacity="0.8" />
      <path d="M 120 182 C 142 130 180 134 178 178 C 182 226 144 236 120 206 Z" fill={p.accent} opacity="0.8" />
    </g>
  )
}

export const BACK = { backpack, jetpack, dinotail, cape, wings }
