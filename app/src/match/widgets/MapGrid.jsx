import { PLACES } from './israelCities.js'

// Rough Israel outline for a kid-friendly tap map (viewBox 0 0 200 420)
const ISRAEL_PATH =
  'M62,18 L57,55 L52,100 L48,150 L43,195 L38,240 L58,300 L80,400 L95,300 L105,250 L112,215 L115,170 L118,120 L115,70 L108,30 Z'

// Geography: tap the right place on the map of Israel
export default function MapGrid({ question, disabled, onAnswer }) {
  const handleTap = (place) => {
    if (disabled) return
    onAnswer(place.id === question.answer)
  }

  return (
    <div className="flex justify-center w-full">
      <svg viewBox="0 0 200 420" className="h-[52vh] max-h-[480px] drop-shadow-lg select-none">
        {/* sea */}
        <rect x="0" y="0" width="200" height="420" rx="16" fill="#bae6fd" />
        {/* land */}
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
              {/* generous invisible hit area for small fingers */}
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
      </svg>
    </div>
  )
}
