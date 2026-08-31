// Hand-held things, held in the right hand at (140, 230).
import { palette, starPath } from './util.js'

const o = (dark) => ({ stroke: dark, strokeWidth: 2.5, strokeLinejoin: 'round' })

const ball = ({ item }) => {
  const p = palette(item, '#ffffff')
  return (
    <g>
      <circle cx="158" cy="242" r="21" fill={p.main} {...o(p.dark)} />
      {/* football patches */}
      <path d="M 158 230 l 8 6 l -3 10 h -10 l -3 -10 Z" fill={p.accent} />
      <path d="M 158 221 v 9 M 145 236 l 8 3 M 171 236 l -8 3 M 152 259 l 3 -9 M 164 259 l -3 -9" stroke={p.dark} strokeWidth="2" />
    </g>
  )
}

const toycar = ({ item }) => {
  const p = palette(item, '#ef4444')
  return (
    <g>
      <rect x="136" y="228" width="44" height="16" rx="6" fill={p.main} {...o(p.dark)} />
      <path d="M 146 228 L 152 218 L 168 218 L 172 228 Z" fill={p.accent} {...o(p.dark)} />
      <circle cx="147" cy="246" r="6" fill="#1f2937" stroke={p.dark} strokeWidth="2" />
      <circle cx="169" cy="246" r="6" fill="#1f2937" stroke={p.dark} strokeWidth="2" />
      <circle cx="178" cy="234" r="2.5" fill={p.trim} />
    </g>
  )
}

const wrench = ({ item }) => {
  const p = palette(item, '#94a3b8')
  return (
    <g>
      <path d="M 138 238 L 172 200" stroke={p.dark} strokeWidth="10" strokeLinecap="round" />
      <path d="M 138 238 L 172 200" stroke={p.main} strokeWidth="6" strokeLinecap="round" />
      <path d="M 168 196 a 11 11 0 1 1 12 12 l -6 -6 Z" fill={p.main} {...o(p.dark)} />
      <circle cx="140" cy="240" r="6" fill={p.accent} stroke={p.dark} strokeWidth="2" />
    </g>
  )
}

const bone = ({ item }) => {
  const p = palette(item, '#f5f5f4')
  return (
    <g>
      <path d="M 140 240 L 172 210" stroke={p.dark} strokeWidth="12" strokeLinecap="round" />
      <path d="M 140 240 L 172 210" stroke={p.main} strokeWidth="8" strokeLinecap="round" />
      {[[136, 244], [146, 234], [166, 206], [176, 216]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill={p.main} {...o(p.dark)} />
      ))}
    </g>
  )
}

const flag = ({ item }) => {
  const p = palette(item, '#111827')
  const squares = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if ((r + c) % 2 === 0) squares.push(<rect key={`${r}-${c}`} x={146 + c * 8} y={186 + r * 8} width="8" height="8" fill={p.main} />)
    }
  }
  return (
    <g>
      <path d="M 142 244 L 142 182" stroke="#78716c" strokeWidth="4" strokeLinecap="round" />
      <rect x="146" y="186" width="32" height="32" fill="#ffffff" stroke={p.dark} strokeWidth="2" />
      {squares}
    </g>
  )
}

const raygun = ({ item }) => {
  const p = palette(item, '#38bdf8')
  return (
    <g>
      <rect x="140" y="222" width="34" height="14" rx="6" fill={p.main} {...o(p.dark)} />
      <rect x="142" y="234" width="12" height="16" rx="5" fill={p.main} {...o(p.dark)} />
      <circle cx="176" cy="229" r="8" fill={p.accent} stroke={p.dark} strokeWidth="2" />
      <path d={starPath(190, 229, 7, 3)} fill={p.trim} />
      <circle cx="156" cy="228" r="3" fill={p.trim} />
    </g>
  )
}

const icecream = ({ item }) => {
  const p = palette(item, '#fbcfe8')
  const cone = item.colors?.accent ?? '#d6a06b'
  return (
    <g>
      <path d="M 150 264 L 139 232 L 161 232 Z" fill={cone} stroke="#8b5a2b" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M 143 240 L 157 248 M 145 248 L 155 240" stroke="#8b5a2b" strokeWidth="1.5" opacity="0.6" />
      <circle cx="150" cy="226" r="12" fill={p.main} {...o(p.dark)} />
      <circle cx="150" cy="210" r="10" fill="#fff7ed" stroke="#e7c9a5" strokeWidth="2.5" />
      <circle cx="150" cy="198" r="3.5" fill="#ef4444" />
    </g>
  )
}

export const HAND = { ball, toycar, wrench, bone, flag, raygun, icecream }
