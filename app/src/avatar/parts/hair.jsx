// Hair styles. Each variant has a `Back` (drawn behind the body, before the
// head) and a `Front` (the fringe, drawn after the face). Colors:
// item.colors.hair, optional item.colors.accent for streaks and tips.
import { shade } from './util.js'

// cap hugging the skull, with a boyish side-swept fringe over the forehead
const CAP_FRONT = 'M 44 100 C 40 20 160 20 156 100 C 150 80 140 70 126 76 Q 108 88 84 78 C 70 72 50 80 44 100 Z'
// what shows behind the head: a short shell down to the nape
// stops above the jaw — hair past it reads as a bob
const SHORT_BACK = 'M 44 94 C 42 26 158 26 156 94 L 156 108 Q 100 118 44 108 Z'
const BUZZ_BACK = 'M 46 94 C 44 32 156 32 154 94 L 154 110 Q 100 120 46 110 Z'

function paint(item) {
  const color = item.colors?.hair ?? '#6b3f1d'
  return {
    fill: color,
    dark: shade(color, -0.32),
    light: shade(color, 0.35),
    tip: item.colors?.accent ?? shade(color, 0.4),
  }
}

const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

// ---- variants ---------------------------------------------------------------

const short = {
  Back: ({ item }) => {
    const p = paint(item)
    return <path d={SHORT_BACK} fill={p.fill} {...o(p.dark)} />
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d={CAP_FRONT} fill={p.fill} {...o(p.dark)} />
        {/* short fringe sweep, not a side part */}
        <path d="M 74 44 Q 100 34 126 44" stroke={p.light} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>
    )
  },
}

const SPIKES = 'M 44 96 C 42 40 60 24 72 34 L 76 14 L 92 34 L 100 8 L 110 34 L 126 14 L 130 34 C 142 24 158 40 156 96 C 150 78 140 70 126 76 Q 108 88 84 78 C 70 72 50 80 44 96 Z'
const spiky = {
  Back: ({ item }) => {
    const p = paint(item)
    return <path d={SHORT_BACK} fill={p.fill} {...o(p.dark)} />
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d={SPIKES} fill={p.fill} {...o(p.dark)} />
        <path d="M 76 20 L 78 34 M 100 14 L 100 32 M 126 20 L 124 34" stroke={p.tip} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      </g>
    )
  },
}

const buzz = {
  Back: ({ item }) => {
    const p = paint(item)
    return <path d={BUZZ_BACK} fill={p.fill} {...o(p.dark)} />
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d="M 46 94 C 44 30 156 30 154 94 C 148 78 140 72 126 76 Q 100 84 74 76 C 60 72 52 78 46 94 Z" fill={p.fill} {...o(p.dark)} />
        <path d="M 66 60 h 68 M 60 72 h 80" stroke={p.light} strokeWidth="2" opacity="0.35" />
      </g>
    )
  },
}

const CURLS_TOP = [[58, 66, 15], [78, 48, 17], [102, 42, 18], [126, 50, 17], [144, 68, 15], [46, 88, 13], [154, 88, 13]]
const CURLS_SIDE = [[38, 106, 13], [162, 106, 13], [42, 124, 11], [158, 124, 11]]
const curly = {
  Back: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d={SHORT_BACK} fill={p.fill} {...o(p.dark)} />
        {CURLS_SIDE.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={p.fill} {...o(p.dark)} />
        ))}
      </g>
    )
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d={CAP_FRONT} fill={p.fill} {...o(p.dark)} />
        {CURLS_TOP.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={p.fill} {...o(p.dark)} />
        ))}
      </g>
    )
  },
}

const mohawk = {
  Back: ({ item }) => {
    const p = paint(item)
    return <path d={BUZZ_BACK} fill={shade(p.fill, -0.15)} {...o(p.dark)} />
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        {/* shaved sides stay dark, the strip stands up in three spikes */}
        <path d="M 46 92 C 46 34 154 34 154 92 C 146 76 138 70 126 74 Q 100 82 74 74 C 62 70 54 76 46 92 Z" fill={shade(p.fill, -0.25)} {...o(p.dark)} />
        <path d="M 86 60 L 82 22 L 96 44 L 100 6 L 108 44 L 120 20 L 116 62 Q 100 52 86 60 Z" fill={p.tip} {...o(p.dark)} />
      </g>
    )
  },
}

const wavy = {
  Back: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path d={SHORT_BACK} fill={p.fill} {...o(p.dark)} />
        <path d="M 40 100 Q 36 118 44 132 L 58 127 Q 52 116 54 104 Z" fill={p.fill} {...o(p.dark)} />
        <path d="M 160 100 Q 164 118 156 132 L 142 127 Q 148 116 146 104 Z" fill={p.fill} {...o(p.dark)} />
      </g>
    )
  },
  Front: ({ item }) => {
    const p = paint(item)
    return (
      <g>
        <path
          d="M 44 100 C 40 20 160 20 156 100 C 150 82 140 72 128 78 Q 118 62 104 76 Q 92 60 80 78 C 68 72 50 80 44 100 Z"
          fill={p.fill}
          {...o(p.dark)}
        />
        <path d="M 72 60 Q 86 50 98 60 Q 112 50 128 62" stroke={p.light} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      </g>
    )
  },
}

export const HAIR = { short, spiky, buzz, curly, mohawk, wavy }
