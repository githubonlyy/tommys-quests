import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { EVENTS } from '../data/events.js'

const HEBREW = /[֐-׿]/
const src = (f) => readFileSync(new URL(`../match/widgets/${f}`, import.meta.url), 'utf8')
const bank = (id) =>
  JSON.parse(readFileSync(new URL(`../data/questions/${id}.json`, import.meta.url), 'utf8'))

// A widget shared by English and Hebrew subjects cannot hardcode a direction:
// a Hebrew sentence laid out ltr puts its full stop on the wrong end, and a
// Hebrew letter sequence comes out in reverse reading order.
describe('mixed-language widgets pick their own direction', () => {
  it.each(['ReadPick.jsx', 'PatternPick.jsx'])('%s derives direction from its content', (file) => {
    const code = src(file)
    expect(code).toMatch(/\u0590-\u05FF/) // detects Hebrew
    expect(code).toMatch(/dir=\{/) // and uses the result
  })

  it('ReadPick speaks its text in the language it is written in', () => {
    const code = src('ReadPick.jsx')
    expect(code).toMatch(/lang: textLang/)
    expect(code).not.toMatch(/speak\(question\.text, \{ lang: 'en'/)
  })
})

describe('subjects that mix scripts', () => {
  const readpick = EVENTS.filter((e) => e.widget === 'readpick').map((e) => e.id)

  it('ReadPick really does serve both scripts, so the fix is load-bearing', () => {
    const hasHebrewPassage = readpick.some((id) => bank(id).some((q) => HEBREW.test(q.text ?? '')))
    const hasLatinPassage = readpick.some((id) => bank(id).some((q) => !HEBREW.test(q.text ?? '')))
    expect(hasHebrewPassage && hasLatinPassage, readpick.join(',')).toBe(true)
  })

  it('no bank leaves a passage empty', () => {
    for (const id of readpick) {
      for (const [i, q] of bank(id).entries()) {
        expect(String(q.text ?? '').trim().length, `${id}[${i}]`).toBeGreaterThan(0)
      }
    }
  })
})

describe('no widget file was left behind', () => {
  it('every widget referenced by a subject exists', () => {
    const files = new Set(readdirSync(new URL('../match/widgets', import.meta.url)))
    const named = {
      readpick: 'ReadPick.jsx', patternpick: 'PatternPick.jsx', fractionpick: 'FractionPick.jsx',
      listenpick: 'ListenPick.jsx', sentenceorder: 'SentenceOrder.jsx', numberpad: 'NumberPad.jsx',
      lettertiles: 'LetterTiles.jsx', wordtap: 'WordTap.jsx', mapgrid: 'MapGrid.jsx',
      clockread: 'ClockRead.jsx', moneycount: 'MoneyCount.jsx', balloon: 'BalloonPop.jsx',
    }
    for (const e of EVENTS) expect(files, `${e.id} -> ${e.widget}`).toContain(named[e.widget])
  })
})
