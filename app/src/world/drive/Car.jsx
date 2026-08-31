// Top-down SVG car with an open cabin the doll sits in. One colour scheme per
// world; the parent drops an <Avatar> in as children and only her top half
// shows through the cabin cut-out.

export const CAR_W = 88
export const CAR_H = 136
// cabin cut-out (design px) — the doll is clipped to this box
const CABIN = { x: 14, y: 46, w: 60, h: 60 }
// doll height so that her top ~45% (head + shoulders) fills the 60px cabin box
export const DRIVER_SIZE = 132

const SKINS = {
  space: { body: '#38bdf8', dark: '#0369a1', seat: '#e0f2fe', glass: '#cffafe', deco: 'star' },
  dino: { body: '#84cc16', dark: '#4d7c0f', seat: '#ecfccb', glass: '#d9f99d', deco: 'star' },
  soccer: { body: '#ef4444', dark: '#b91c1c', seat: '#fee2e2', glass: '#fecaca', deco: 'star' },
  ninja: { body: '#334155', dark: '#0f172a', seat: '#e2e8f0', glass: '#cbd5e1', deco: 'star' },
}
const RAINBOW = ['#f87171', '#fb923c', '#fde047', '#4ade80', '#60a5fa', '#a78bfa']

const carSkin = (themeId) => SKINS[themeId] || SKINS.space

function Deco({ kind }) {
  if (kind === 'rainbow') {
    // stripe running down the hood
    return (
      <g>
        {RAINBOW.map((c, i) => (
          <rect key={c} x={32 + i * 4} y="12" width="4" height="30" fill={c} opacity="0.95" />
        ))}
      </g>
    )
  }
  if (kind === 'daisy') {
    return (
      <g transform="translate(44 27)">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <ellipse key={a} cx="0" cy="-7" rx="3.2" ry="5.5" fill="#ffffff" transform={`rotate(${a})`} />
        ))}
        <circle r="3.5" fill="#fde047" />
      </g>
    )
  }
  // a racing star on the hood
  return (
    <path
      d="M44 20 l3.2 7.4 8 .7 -6.1 5.3 1.9 7.9 -7 -4.2 -7 4.2 1.9 -7.9 -6.1 -5.3 8 -.7 z"
      fill="#ffffff"
      opacity="0.92"
    />
  )
}

export default function Car({ themeId, children }) {
  const s = carSkin(themeId)
  return (
    <div className="relative" style={{ width: CAR_W, height: CAR_H }}>
      <svg viewBox={`0 0 ${CAR_W} ${CAR_H}`} width={CAR_W} height={CAR_H} className="absolute inset-0" aria-hidden="true" focusable="false">
        {/* wheels */}
        {[
          [2, 24],
          [74, 24],
          [2, 94],
          [74, 94],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="12" height="26" rx="4" fill="#1f2937" />
        ))}
        {/* body */}
        <rect x="8" y="6" width="72" height="124" rx="24" fill={s.body} stroke={s.dark} strokeWidth="3" />
        {/* hood sheen + headlights */}
        <rect x="16" y="14" width="56" height="26" rx="12" fill="#ffffff" opacity="0.2" />
        <circle cx="22" cy="12" r="4" fill="#fef9c3" stroke={s.dark} strokeWidth="1.5" />
        <circle cx="66" cy="12" r="4" fill="#fef9c3" stroke={s.dark} strokeWidth="1.5" />
        <Deco kind={s.deco} />
        {/* windshield */}
        <path d="M16 42 h56 l-4 10 h-48 z" fill={s.glass} opacity="0.95" stroke={s.dark} strokeWidth="1.5" />
        {/* open cabin / seat */}
        <rect x={CABIN.x + 2} y={CABIN.y + 8} width={CABIN.w - 4} height={CABIN.h - 6} rx="12" fill={s.seat} stroke={s.dark} strokeWidth="2" />
        {/* trunk + tail lights */}
        <rect x="16" y="112" width="56" height="10" rx="5" fill="#ffffff" opacity="0.15" />
        <rect x="18" y="122" width="12" height="5" rx="2.5" fill="#fb7185" />
        <rect x="58" y="122" width="12" height="5" rx="2.5" fill="#fb7185" />
      </svg>
      {/* the doll: her head and shoulders peek over the seat */}
      <div
        className="absolute overflow-hidden flex justify-center"
        style={{ left: CABIN.x, top: CABIN.y, width: CABIN.w, height: CABIN.h, borderRadius: 14 }}
      >
        {/* Avatar caps itself at maxHeight:100%, so give it a box of its own height */}
        <div style={{ height: DRIVER_SIZE, flex: 'none', display: 'grid', placeItems: 'center' }}>{children}</div>
      </div>
    </div>
  )
}
