import { describe, it, expect } from 'vitest'
import {
  LANES,
  SPEED_CAP,
  ROW_INTERVAL_MS,
  HITBOX,
  HAZARD_VARIANTS,
  POINTS,
  SPAWN,
  clampLane,
  moveLane,
  speedForRow,
  rowIntervalMs,
  hazardChanceForRow,
  generateRow,
  hasFreeLane,
  hasPath,
  freeLanes,
  reachableLanes,
  hitTest,
  scoreFor,
  tallyScore,
  laneCenterX,
} from '../world/drive/logic.js'

// deterministic rng (mulberry32) so row statistics are reproducible
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function manyRows(n, rng, opts = {}) {
  const rows = []
  let prev = null
  for (let i = 0; i < n; i++) {
    const row = generateRow(rng, { ...opts, prev })
    rows.push(row)
    prev = row
  }
  return rows
}

describe('lanes', () => {
  it('clamps to the three lanes', () => {
    expect(LANES).toBe(3)
    expect(clampLane(-5)).toBe(0)
    expect(clampLane(0)).toBe(0)
    expect(clampLane(2)).toBe(2)
    expect(clampLane(9)).toBe(2)
  })

  it('moves one lane per tap and stops at the edges', () => {
    expect(moveLane(1, -1)).toBe(0)
    expect(moveLane(1, 1)).toBe(2)
    expect(moveLane(0, -1)).toBe(0)
    expect(moveLane(2, 1)).toBe(2)
    expect(moveLane(1, 0)).toBe(1)
    expect(moveLane(0, 7)).toBe(1) // any positive is "right", one lane only
  })

  it('lane centers sit mid-lane', () => {
    expect(laneCenterX(0, 100)).toBe(50)
    expect(laneCenterX(2, 100)).toBe(250)
  })
})

describe('speed ramp', () => {
  it('starts at 1×, ramps ~1.5% per row and never exceeds the cap', () => {
    expect(speedForRow(0)).toBe(1)
    expect(speedForRow(1)).toBeCloseTo(1.015, 5)
    let last = 0
    for (let r = 0; r < 200; r++) {
      const s = speedForRow(r)
      expect(s).toBeGreaterThanOrEqual(last)
      expect(s).toBeLessThanOrEqual(SPEED_CAP)
      last = s
    }
    expect(speedForRow(500)).toBe(SPEED_CAP)
    expect(speedForRow(-3)).toBe(1)
  })

  it('row interval shrinks with speed', () => {
    expect(rowIntervalMs(1)).toBe(ROW_INTERVAL_MS)
    expect(rowIntervalMs(SPEED_CAP)).toBeCloseTo(ROW_INTERVAL_MS / SPEED_CAP, 5)
    expect(rowIntervalMs(SPEED_CAP)).toBeGreaterThan(900) // still gentle at full speed
  })

  it('hazard chance grows slowly and stays bounded', () => {
    expect(hazardChanceForRow(0)).toBe(SPAWN.hazardStart)
    expect(hazardChanceForRow(10)).toBeGreaterThan(SPAWN.hazardStart)
    expect(hazardChanceForRow(10_000)).toBe(SPAWN.hazardMax)
    expect(SPAWN.hazardMax).toBeLessThanOrEqual(0.4)
  })
})

describe('row generator', () => {
  const rows = manyRows(5000, seeded(42), { hazardChance: SPAWN.hazardMax })

  it('every row has three cells of known kinds', () => {
    for (const row of rows) {
      expect(row).toHaveLength(LANES)
      for (const cell of row) {
        if (cell === null) continue
        expect(['good', 'gem', 'hazard']).toContain(cell.kind)
        if (cell.kind === 'hazard') {
          expect(cell.v).toBeGreaterThanOrEqual(0)
          expect(cell.v).toBeLessThan(HAZARD_VARIANTS)
        }
      }
    }
  })

  it('every row leaves at least one free lane (never three hazards)', () => {
    for (const row of rows) {
      expect(hasFreeLane(row)).toBe(true)
      expect(row.filter((c) => c?.kind === 'hazard').length).toBeLessThanOrEqual(2)
    }
  })

  it('consecutive rows always keep a path one lane-move apart', () => {
    for (let i = 1; i < rows.length; i++) expect(hasPath(rows[i - 1], rows[i]), `row ${i}`).toBe(true)
  })

  it('hazard ratio stays within gentle bounds', () => {
    const cells = rows.flat()
    const ratio = cells.filter((c) => c?.kind === 'hazard').length / cells.length
    expect(ratio).toBeGreaterThan(0.12)
    expect(ratio).toBeLessThan(0.42)
  })

  it('spawns plenty to collect and the occasional gem', () => {
    const cells = rows.flat()
    const good = cells.filter((c) => c?.kind === 'good').length / cells.length
    const gems = cells.filter((c) => c?.kind === 'gem').length / cells.length
    expect(good).toBeGreaterThan(0.2)
    expect(gems).toBeGreaterThan(0.01)
    expect(gems).toBeLessThan(0.1)
  })

  it('still leaves a reachable lane when the odds are stacked against her', () => {
    const extreme = manyRows(500, seeded(7), { hazardChance: 1 })
    for (let i = 0; i < extreme.length; i++) {
      expect(hasFreeLane(extreme[i])).toBe(true)
      if (i > 0) expect(hasPath(extreme[i - 1], extreme[i])).toBe(true)
    }
  })

  it('does not break a valid path when one already exists', () => {
    // rng returning values that produce hazards in lanes 0 and 1 only
    const seq = [0.1, 0.5, 0.1, 0.5, 0.99]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const row = generateRow(rng, { hazardChance: 0.3 })
    expect(row[0].kind).toBe('hazard')
    expect(row[1].kind).toBe('hazard')
    expect(row[2]).toBeNull()
  })

  it('reachable lanes widen from the previous free lanes', () => {
    const h = { kind: 'hazard', v: 0 }
    expect(freeLanes([h, null, h])).toEqual([1])
    expect(reachableLanes([h, null, h])).toEqual([0, 1, 2])
    expect(reachableLanes([null, h, h])).toEqual([0, 1])
    expect(reachableLanes(null)).toEqual([0, 1, 2])
    // a free lane on the far side is not a path if she was boxed in on the left
    expect(hasPath([null, h, h], [h, h, null])).toBe(false)
  })
})

describe('collision', () => {
  const car = { x: 100, y: 500, w: 88, h: 136 }

  it('hits when the sprite overlaps the car', () => {
    expect(hitTest(car, { x: 100, y: 500, w: 46, h: 46 })).toBe(true)
    expect(hitTest(car, { x: 110, y: 460, w: 46, h: 46 })).toBe(true)
  })

  it('misses a sprite in the next lane', () => {
    const laneW = 120
    expect(hitTest(car, { x: 100 + laneW, y: 500, w: 46, h: 46 })).toBe(false)
  })

  it('misses a sprite that is still above the car', () => {
    expect(hitTest(car, { x: 100, y: 500 - 136, w: 46, h: 46 })).toBe(false)
  })

  it('shrinks both boxes to the forgiving factor', () => {
    // vertical gap: full boxes would overlap (91 < 91 is false at exactly the edge, so use 85)
    const grazing = { x: 100, y: 500 - 85, w: 46, h: 46 }
    expect(hitTest(car, grazing, 1)).toBe(true)
    expect(hitTest(car, grazing, HITBOX)).toBe(false)
    expect(HITBOX).toBeCloseTo(0.7, 5)
  })
})

describe('score', () => {
  it('awards pickups by kind and nothing for hazards', () => {
    expect(scoreFor('good')).toBe(POINTS.good)
    expect(scoreFor('gem')).toBe(POINTS.gem)
    expect(scoreFor('hazard')).toBe(0)
    expect(scoreFor(undefined)).toBe(0)
  })

  it('score = distance + pickups', () => {
    expect(tallyScore({ rows: 10, good: 3, gems: 1 })).toBe(10 + 30 + 30)
    expect(tallyScore({})).toBe(0)
    expect(POINTS.row).toBe(1)
  })
})
