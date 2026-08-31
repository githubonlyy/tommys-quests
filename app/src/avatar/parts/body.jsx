// Skin-coloured parts of the chibi doll: limbs + torso (drawn under the
// outfit) and the head with its face (drawn over the outfit, under the fringe).
//
// Anatomy (viewBox 0 0 200 320):
//   head   x 45–155, y 44–145 (centre 100,95)
//   torso  y 156–220, arms end in hands at (60,230) / (140,230)
//   legs   x 89 / 111, feet around y 295
import { shade } from './util.js'

export function Body({ skin }) {
  const dark = shade(skin, -0.28)
  const o = { stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' }
  // limbs are round-capped lines; a wider dark line underneath gives the outline
  const legs = 'M 89 214 V 288 M 111 214 V 288'
  const arms = 'M 90 170 L 60 228 M 110 170 L 140 228'
  return (
    <g>
      <path d={legs} stroke={dark} strokeWidth="21" strokeLinecap="round" fill="none" />
      <path d={legs} stroke={skin} strokeWidth="17" strokeLinecap="round" fill="none" />
      <path d={arms} stroke={dark} strokeWidth="18" strokeLinecap="round" fill="none" />
      <path d={arms} stroke={skin} strokeWidth="14" strokeLinecap="round" fill="none" />
      <circle cx="60" cy="230" r="9" fill={skin} {...o} />
      <circle cx="140" cy="230" r="9" fill={skin} {...o} />
      <rect x="90" y="136" width="20" height="26" rx="7" fill={skin} {...o} />
      <path d="M 76 156 Q 100 150 124 156 L 121 220 Q 100 226 79 220 Z" fill={skin} {...o} />
    </g>
  )
}

function Eye({ cx, cy, iris }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="12" ry="14" fill="#ffffff" stroke="#3b2b3a" strokeWidth="2" />
      <circle cx={cx} cy={cy + 1.5} r="8.5" fill={iris} />
      <circle cx={cx} cy={cy + 2} r="5" fill="#1f2340" />
      <circle cx={cx - 3.5} cy={cy - 4} r="3.5" fill="#ffffff" />
      <circle cx={cx + 3} cy={cy + 4.5} r="1.7" fill="#ffffff" opacity="0.9" />
      {/* upper lid line, kept thin */}
      <path d={`M ${cx - 10} ${cy - 8} Q ${cx} ${cy - 18} ${cx + 10} ${cy - 8}`} stroke="#3b2b3a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  )
}

export function Head({ skin, eyes = '#4f7fe0' }) {
  const dark = shade(skin, -0.28)
  return (
    <g>
      <circle cx="46" cy="102" r="9" fill={skin} stroke={dark} strokeWidth="2.5" />
      <circle cx="154" cy="102" r="9" fill={skin} stroke={dark} strokeWidth="2.5" />
      <path
        d="M 45 85 C 45 30 155 30 155 85 C 155 120 130 145 100 145 C 70 145 45 120 45 85 Z"
        fill={skin}
        stroke={dark}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <ellipse cx="63" cy="118" rx="9" ry="5" fill="#ff8da1" opacity="0.3" />
      <ellipse cx="137" cy="118" rx="9" ry="5" fill="#ff8da1" opacity="0.3" />
      {/* brows */}
      <path d="M 68 80 Q 78 74 89 79" stroke={dark} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 111 79 Q 122 74 132 80" stroke={dark} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <Eye cx={78} cy={100} iris={eyes} />
      <Eye cx={122} cy={100} iris={eyes} />
      <circle cx="100" cy="113" r="1.8" fill={dark} opacity="0.6" />
      <path d="M 90 123 Q 100 133 110 123" stroke="#c0405f" strokeWidth="3" strokeLinecap="round" fill="none" />
    </g>
  )
}
