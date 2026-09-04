import { describe, it, expect } from 'vitest'
import { bestVoice, isMaleVoice, isFemaleVoice } from '../match/speak.js'

const v = (name, lang = 'he-IL') => ({ name, lang })

describe('voice classification', () => {
  // /male/ without word boundaries matches inside "female", which once made the
  // app pick a female voice while believing it had found a male one
  it('does not read "female" as male', () => {
    expect(isMaleVoice('Hebrew (Israel) Female')).toBe(false)
    expect(isMaleVoice('Hebrew Female 1')).toBe(false)
    expect(isFemaleVoice('Hebrew (Israel) Female')).toBe(true)
  })

  it('recognises the male voices devices actually ship', () => {
    expect(isMaleVoice('Microsoft Asaf - Hebrew (Israel)')).toBe(true)
    expect(isMaleVoice('Male Hebrew')).toBe(true)
    expect(isMaleVoice('אסף')).toBe(true)
  })

  it('knows the common female Hebrew voices by name', () => {
    for (const n of ['Carmit', 'Google עברית Karmit', 'Microsoft Zira', 'כרמית']) {
      expect(isFemaleVoice(n), n).toBe(true)
      expect(isMaleVoice(n), n).toBe(false)
    }
  })
})

describe('bestVoice', () => {
  const he = /^he/i

  it('prefers a male voice over a female one, whatever the order', () => {
    expect(bestVoice([v('Carmit'), v('Microsoft Asaf')], he).name).toBe('Microsoft Asaf')
    expect(bestVoice([v('Microsoft Asaf'), v('Carmit')], he).name).toBe('Microsoft Asaf')
  })

  it('avoids a female voice when an unnamed one exists', () => {
    expect(bestVoice([v('Carmit'), v('Hebrew Israel')], he).name).toBe('Hebrew Israel')
  })

  it('falls back to a female voice rather than going silent', () => {
    expect(bestVoice([v('Carmit')], he).name).toBe('Carmit')
  })

  it('prefers a natural or online voice within the chosen group', () => {
    expect(bestVoice([v('Asaf'), v('Asaf Online Natural')], he).name).toBe('Asaf Online Natural')
  })

  it('ignores other languages and returns null when none match', () => {
    expect(bestVoice([v('Daniel', 'en-GB')], he)).toBeNull()
    expect(bestVoice([], he)).toBeNull()
  })
})
