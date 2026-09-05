import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { EVENTS, CATEGORIES, CATEGORY_IDS, MODES } from '../data/events.js'
import { ARCADE_GAMES, FUN_CATEGORIES, alwaysOpenCategory } from '../data/arcadeGames.js'

const bank = (id) =>
  JSON.parse(readFileSync(new URL(`../data/questions/${id}.json`, import.meta.url), 'utf8'))

// Which bank each subject actually reads, where it is not its own id
const BANK_OF = { listening: 'english', clock: 'clock', money: 'money' }

// What a bank item must look like for the widget that will render it. A subject
// whose bank drifts from its widget crashes mid-match, which no other test sees.
const SHAPE = {
  numberpad: (i) => typeof i.q === 'string' && typeof i.a === 'string',
  lettertiles: (i) => typeof i.word === 'string' && typeof i.hint === 'string',
  wordtap: (i) => Array.isArray(i.sentence) && Number.isInteger(i.target) && Boolean(i.sentence[i.target]),
  mapgrid: (i) => typeof i.q === 'string' && typeof i.answer === 'string',
  clockread: (i) => Number.isInteger(i.h) && Number.isInteger(i.m),
  moneycount: (i) => Array.isArray(i.items) && i.items.every((n) => typeof n === 'number'),
  balloon: (i) => typeof i.q === 'string' && typeof i.a === 'string' && Array.isArray(i.decoys),
  readpick: (i) => typeof i.text === 'string' && typeof i.q === 'string' && Array.isArray(i.decoys),
  listenpick: (i) => typeof i.word === 'string' && typeof i.hint === 'string',
  sentenceorder: (i) => Array.isArray(i.words) && i.words.length >= 2 && typeof i.he === 'string',
  fractionpick: (i) => Number.isInteger(i.num) && Number.isInteger(i.den) && Array.isArray(i.decoys),
  patternpick: (i) => Array.isArray(i.seq) && i.seq.length >= 3 && Array.isArray(i.decoys),
}

describe('subject catalog', () => {
  it('every subject has a unique id, a category and a known widget', () => {
    const ids = EVENTS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of EVENTS) {
      expect(CATEGORY_IDS, e.id).toContain(e.category)
      expect(Object.keys(SHAPE), e.id).toContain(e.widget)
      expect(e.modes.every((m) => m in MODES), e.id).toBe(true)
    }
  })

  it('every subject shows a Hebrew name, an English name and an emoji', () => {
    for (const e of EVENTS) {
      expect(e.heTitle, e.id).toBeTruthy()
      expect(e.title, e.id).toBeTruthy()
      expect(e.emoji, e.id).toBeTruthy()
      expect(e.description, e.id).toBeTruthy()
    }
  })

  it('every category holds at least two subjects', () => {
    for (const c of CATEGORIES) {
      expect(EVENTS.filter((e) => e.category === c.id).length, c.id).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('question banks', () => {
  it.each(EVENTS.map((e) => [e.id, e]))('%s has a bank matching its widget', (_id, e) => {
    const items = bank(BANK_OF[e.id] ?? e.id)
    expect(Array.isArray(items)).toBe(true)
    expect(items.length, `${e.id} needs enough items for a 10-question match`).toBeGreaterThanOrEqual(10)
    const check = SHAPE[e.widget]
    for (const [i, item] of items.entries()) expect(check(item), `${e.id}[${i}]`).toBe(true)
  })

  it('no multiple-choice bank repeats the answer among its decoys', () => {
    for (const e of EVENTS) {
      const items = bank(BANK_OF[e.id] ?? e.id)
      for (const [i, item] of items.entries()) {
        if (!Array.isArray(item.decoys)) continue
        expect(item.decoys, `${e.id}[${i}]`).not.toContain(item.a)
        expect(new Set(item.decoys).size, `${e.id}[${i}] duplicate decoys`).toBe(item.decoys.length)
      }
    }
  })

  // a "why" answer is legitimately a paraphrase, so the passage is checked for
  // substance rather than for containing the answer verbatim
  it('reading passages are real passages with real questions', () => {
    for (const item of bank('hebrewread')) {
      expect(item.text.length, item.q).toBeGreaterThan(25)
      expect(item.q.trim().endsWith('?'), item.q).toBe(true)
      expect(item.a.length, item.q).toBeGreaterThan(1)
    }
  })
})

describe('lesson cards', () => {
  const lessons = JSON.parse(readFileSync(new URL('../data/lessons.json', import.meta.url), 'utf8'))

  it('every subject has a pool the daily rotation can slice', () => {
    for (const e of EVENTS) {
      const pool = lessons[e.id]
      expect(pool, `${e.id} has no lesson pool`).toBeTruthy()
      expect(pool.length, e.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('every card is a complete card', () => {
    for (const [id, pool] of Object.entries(lessons)) {
      for (const [i, c] of pool.entries()) {
        expect(c.emoji, `${id}[${i}]`).toBeTruthy()
        expect(c.title?.trim(), `${id}[${i}]`).toBeTruthy()
        expect(c.text?.trim().length, `${id}[${i}]`).toBeGreaterThan(20)
      }
    }
  })

  it('no subject repeats a card title', () => {
    for (const [id, pool] of Object.entries(lessons)) {
      const titles = pool.map((c) => c.title)
      expect(new Set(titles).size, `${id} repeats a title`).toBe(titles.length)
    }
  })
})

describe('fun games', () => {
  it('every game is free — coins are for the real-world shop', () => {
    for (const g of ARCADE_GAMES) {
      expect(g.price, `${g.id} should not cost coins`).toBeUndefined()
    }
  })

  it('ids are unique — the screen keys cards and high scores by id', () => {
    const ids = ARCADE_GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    // the two screens that predate the registry own these ids
    expect(ids).not.toContain('draw')
    expect(ids).not.toContain('drive')
  })

  it('every game sits in a group, and every group has games', () => {
    const ids = FUN_CATEGORIES.map((c) => c.id)
    for (const g of ARCADE_GAMES) expect(ids, g.id).toContain(g.category)
    for (const c of FUN_CATEGORIES) {
      expect(ARCADE_GAMES.filter((g) => g.category === c.id).length, c.id).toBeGreaterThan(0)
    }
  })

  it('the quiet group is always open, so there is something to do with no play time left', () => {
    const open = FUN_CATEGORIES.filter((c) => c.alwaysOpen)
    expect(open.length).toBe(1)
    expect(open[0].id).toBe('puzzle')
    expect(alwaysOpenCategory('puzzle')).toBe(true)
    expect(alwaysOpenCategory('action')).toBe(false)
  })

  it('every group has a Hebrew and an English label, an emoji and colours', () => {
    for (const c of FUN_CATEGORIES) {
      expect(c.he, c.id).toBeTruthy()
      expect(c.en, c.id).toBeTruthy()
      expect(c.emoji, c.id).toBeTruthy()
      expect(c.color, c.id).toMatch(/^bg-/)
      expect(c.border, c.id).toMatch(/^border-/)
    }
  })

  it('every game has both names, a description, an icon, colours and a component', () => {
    for (const g of ARCADE_GAMES) {
      expect(g.heTitle, g.id).toBeTruthy()
      expect(g.title, g.id).toBeTruthy()
      expect(g.he, g.id).toBeTruthy()
      expect(typeof g.Icon, g.id).not.toBe('undefined')
      expect(g.color, g.id).toMatch(/^bg-/)
      expect(g.borderColor, g.id).toMatch(/^border-/)
      expect(g.textColor, g.id).toMatch(/^text-/)
      expect(g.lightBg, g.id).toMatch(/^bg-/)
      expect(typeof g.Component, g.id).toBe('function')
    }
  })

  // A game reading another child's theme key crashed on open once already
  // (Drive read theme.arcade.catch, which only Melanie's app defines).
  it('no game reads a per-theme sprite key that does not exist', () => {
    const KNOWN = ['coinrush', 'flappy', 'bricks', 'moles']
    const dir = new URL('../arcade/', import.meta.url)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsx')) continue
      const src = readFileSync(new URL(file, dir), 'utf8')
      for (const m of src.matchAll(/theme(?:\?)?\.arcade(?:\?)?\.([a-zA-Z]+)/g)) {
        expect(KNOWN, `${file} reads theme.arcade.${m[1]}`).toContain(m[1])
      }
    }
  })

  // Every game is handed the same four props and must report its score once.
  it('every game file keeps the ArcadeShell contract', () => {
    const dir = new URL('../arcade/', import.meta.url)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsx') || file === 'ArcadeShell.jsx') continue
      const src = readFileSync(new URL(file, dir), 'utf8')
      expect(src, `${file} props`).toMatch(/\{\s*highScore,\s*onClose,\s*onScore,\s*onRestart\s*\}/)
      expect(src, `${file} shell`).toContain('<ArcadeShell')
      expect(src.match(/onScore\(/g)?.length ?? 0, `${file} onScore calls`).toBe(1)
    }
  })
})
