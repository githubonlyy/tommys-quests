import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { STRINGS, LANGS } from '../i18n/strings.js'

const SRC = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function jsxFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== '__tests__') jsxFiles(p, out)
    } else if (name.endsWith('.jsx')) {
      out.push(p)
    }
  }
  return out
}

// Keys look like `group.name` — enough to tell an i18n call from `setSheet('gallery')`
const KEY_CALL = /\bt\('([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+)'/g

const usedKeys = (() => {
  const keys = new Set()
  for (const file of jsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(KEY_CALL)) keys.add(m[1])
  }
  return [...keys].sort()
})()

describe('i18n coverage', () => {
  it('finds translation calls to check', () => {
    expect(usedKeys.length).toBeGreaterThan(20)
  })

  // a missing key renders as the raw key ("NAV.WORLD"), so this must never fail
  it.each(LANGS)('%s defines every key the UI asks for', (lang) => {
    const missing = usedKeys.filter((k) => STRINGS[lang][k] === undefined)
    expect(missing).toEqual([])
  })

  it('both languages define the same keys', () => {
    const he = Object.keys(STRINGS.he).sort()
    const en = Object.keys(STRINGS.en).sort()
    expect(he).toEqual(en)
  })

  it('no value is left empty', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(typeof value === 'function' || value.length > 0, `${lang}.${key}`).toBe(true)
      }
    }
  })
})
