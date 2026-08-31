// Pure rules for the driving game: lanes, row generation, speed ramp,
// collisions and score. No DOM, no React — unit-tested in
// src/__tests__/drive.test.js. Drive.jsx owns the render loop.

export const LANES = 3
export const START_LIVES = 3
export const ROW_INTERVAL_MS = 1700 // one row every ~1.7s at speed 1
export const SPEED_RAMP = 0.015 // +1.5% per row…
export const SPEED_CAP = 1.8 // …capped at 1.8×
export const HITBOX = 0.7 // collision boxes are 70% of the sprite — forgiving
export const INVULN_MS = 1200 // blink time after a hit
export const HAZARD_VARIANTS = 3 // theme `bad`, 🚧, 🧸 — the renderer maps v → emoji
export const POINTS = { row: 1, good: 10, gem: 30 }

// Per-lane spawn odds. Hazards get a little more common as rows go by; the
// rest of the odds stay flat so there is always plenty to collect.
export const SPAWN = { hazardStart: 0.2, hazardMax: 0.34, hazardStep: 0.003, good: 0.32, gem: 0.04 }

export function clampLane(lane) {
  return Math.max(0, Math.min(LANES - 1, lane))
}

// dir: -1 (left) / +1 (right); anything else is a no-op
export function moveLane(lane, dir) {
  return clampLane(lane + Math.sign(dir))
}

export function speedForRow(row) {
  return Math.min(SPEED_CAP, Math.pow(1 + SPEED_RAMP, Math.max(0, row)))
}

export function rowIntervalMs(speed) {
  return ROW_INTERVAL_MS / speed
}

export function hazardChanceForRow(row) {
  return Math.min(SPAWN.hazardMax, SPAWN.hazardStart + Math.max(0, row) * SPAWN.hazardStep)
}

export const isHazard = (cell) => !!cell && cell.kind === 'hazard'

export function freeLanes(row) {
  const out = []
  for (let l = 0; l < LANES; l++) if (!isHazard(row[l])) out.push(l)
  return out
}

export const hasFreeLane = (row) => freeLanes(row).length > 0

// Lanes the car can be in when this row arrives, given it was in a free lane
// of the previous row: one move left/right per row is all we ever require.
export function reachableLanes(prevRow) {
  if (!prevRow) return Array.from({ length: LANES }, (_, i) => i)
  const set = new Set()
  for (const l of freeLanes(prevRow)) {
    for (const d of [-1, 0, 1]) {
      const n = l + d
      if (n >= 0 && n < LANES) set.add(n)
    }
  }
  return [...set].sort((a, b) => a - b)
}

// True when at least one free lane of `row` is reachable from `prevRow`.
export function hasPath(prevRow, row) {
  return reachableLanes(prevRow).some((l) => !isHazard(row[l]))
}

/**
 * One row of LANES cells: null | { kind: 'good' } | { kind: 'gem' } |
 * { kind: 'hazard', v }. Guarantees a free lane the car can actually reach
 * from the previous row (never three hazards, never a dead end).
 * `rng` is injectable so tests are deterministic.
 */
export function generateRow(rng = Math.random, { hazardChance = SPAWN.hazardStart, goodChance = SPAWN.good, gemChance = SPAWN.gem, prev = null } = {}) {
  const row = []
  for (let l = 0; l < LANES; l++) {
    const r = rng()
    if (r < hazardChance) row.push({ kind: 'hazard', v: Math.floor(rng() * HAZARD_VARIANTS) % HAZARD_VARIANTS })
    else if (r < hazardChance + gemChance) row.push({ kind: 'gem' })
    else if (r < hazardChance + gemChance + goodChance) row.push({ kind: 'good' })
    else row.push(null)
  }
  if (!hasPath(prev, row)) {
    const reach = reachableLanes(prev)
    const l = reach[Math.floor(rng() * reach.length) % reach.length]
    row[l] = rng() < 0.5 ? null : { kind: 'good' }
  }
  return row
}

/**
 * Axis-aligned overlap of two center-anchored boxes { x, y, w, h }, each
 * shrunk to `factor` of its size so near-misses stay misses.
 */
export function hitTest(a, b, factor = HITBOX) {
  return Math.abs(a.x - b.x) < ((a.w + b.w) / 2) * factor && Math.abs(a.y - b.y) < ((a.h + b.h) / 2) * factor
}

export function laneCenterX(lane, laneW) {
  return laneW * (lane + 0.5)
}

export function scoreFor(kind) {
  return kind === 'good' ? POINTS.good : kind === 'gem' ? POINTS.gem : 0
}

// Score = distance (one point per row passed) + pickups.
export function tallyScore({ rows = 0, good = 0, gems = 0 }) {
  return rows * POINTS.row + good * POINTS.good + gems * POINTS.gem
}
