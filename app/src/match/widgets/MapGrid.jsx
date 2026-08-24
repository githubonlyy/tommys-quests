import { useRef, useState } from 'react'
import { PLACES } from './israelCities.js'
import { sfx } from '../sounds.js'

// Rough Israel outline for a kid-friendly tap map (viewBox 0 0 200 420)
const ISRAEL_PATH =
  'M62,18 L57,55 L52,100 L48,150 L43,195 L38,240 L58,300 L80,400 L95,300 L105,250 L112,215 L115,170 L118,120 L115,70 L108,30 Z'

const svgFx = { transformBox: 'fill-box', transformOrigin: 'center' }

function Ripples({ x, y, color }) {
  return [0, 0.25, 0.5].map((delay) => (
    <circle
      key={delay}
      cx={x}
      cy={y}
      r="10"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      className="anim-ripple-ring"
      style={{ ...svgFx, animationDelay: `${delay}s` }}
    />
  ))
}

function Pin({ x, y }) {
  return (
    <g className="anim-pin-drop" style={svgFx}>
      <path
        d={`M${x},${y} c-6,-9 -9,-13 -9,-18 a9,9 0 1 1 18,0 c0,5 -3,9 -9,18 z`}
        fill="#22c55e"
        stroke="#14532d"
        strokeWidth="2"
      />
      <circle cx={x} cy={y - 17} r="3.5" fill="#dcfce7" />
    </g>
  )
}

// Geography: tap the right place on the map of Israel.
// Correct: a pin drops with ripple rings. Wrong: red X + the right place pulses green.
export default function MapGrid({ question, disabled, onAnswer }) {
  const [hit, setHit] = useState(null) // { id, correct }
  const lockRef = useRef(false)

  const target = PLACES.find((p) => p.id === question.answer)

  const handleTap = (place) => {
    if (disabled || lockRef.current) return
    lockRef.current = true
    const correct = place.id === question.answer
    setHit({ id: place.id, correct })
    if (correct) sfx.click()
    onAnswer(correct, correct ? 800 : 1200)
  }

  const tappedPlace = hit ? PLACES.find((p) => p.id === hit.id) : null

  return (
    <div className="flex justify-center w-full">
      <svg viewBox="0 0 200 420" className="h-[46vh] md:h-[52vh] max-h-[480px] drop-shadow-lg select-none">
        <rect x="0" y="0" width="200" height="420" rx="16" fill="#bae6fd" />
        <path d={ISRAEL_PATH} fill="#fef3c7" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" />

        {PLACES.map((place) =>
          place.kind === 'water' ? (
            <g key={place.id} onClick={() => handleTap(place)} className="cursor-pointer">
              <ellipse cx={place.x} cy={place.y} rx={place.rx} ry={place.ry} fill="#38bdf8" stroke="#0369a1" strokeWidth="1.5" />
              <text x={place.x + place.rx + 3} y={place.y + 3} fontSize="9" fontWeight="900" fill="#0c4a6e">
                {place.name}
              </text>
            </g>
          ) : (
            <g key={place.id} onClick={() => handleTap(place)} className="cursor-pointer">
              <circle cx={place.x} cy={place.y} r="14" fill="transparent" />
              <circle cx={place.x} cy={place.y} r="5" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1.5" />
              <text
                x={place.x <= 70 ? place.x - 8 : place.x + 8}
                y={place.y + 3}
                fontSize="9"
                fontWeight="900"
                fill="#1e293b"
                textAnchor={place.x <= 70 ? 'end' : 'start'}
              >
                {place.name}
              </text>
            </g>
          ),
        )}

        {/* hit feedback overlays */}
        {hit && hit.correct && tappedPlace && (
          <g pointerEvents="none">
            <Ripples x={tappedPlace.x} y={tappedPlace.y} color="#16a34a" />
            <Pin x={tappedPlace.x} y={tappedPlace.y} />
          </g>
        )}
        {hit && !hit.correct && tappedPlace && target && (
          <g pointerEvents="none">
            {/* red X on the miss */}
            <g className="anim-pop" style={svgFx}>
              <line x1={tappedPlace.x - 7} y1={tappedPlace.y - 7} x2={tappedPlace.x + 7} y2={tappedPlace.y + 7} stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
              <line x1={tappedPlace.x - 7} y1={tappedPlace.y + 7} x2={tappedPlace.x + 7} y2={tappedPlace.y - 7} stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
            </g>
            {/* green pulse where the answer really is */}
            <Ripples x={target.x} y={target.y} color="#16a34a" />
            <circle cx={target.x} cy={target.y} r="6" fill="#22c55e" stroke="#14532d" strokeWidth="2" className="anim-pop" style={svgFx} />
          </g>
        )}
      </svg>
    </div>
  )
}
