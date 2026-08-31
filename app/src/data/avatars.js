// Cosmetics unlock by LEVEL (XP), never by coins — coins stay for real rewards + arcade.
export const AVATARS = [
  { id: 'hero', emoji: '🦸', name: 'Hero', level: 1 },
  { id: 'fox', emoji: '🦊', name: 'Fox', level: 1 },
  { id: 'robot', emoji: '🤖', name: 'Robot', level: 1 },
  { id: 'lion', emoji: '🦁', name: 'Lion', level: 3 },
  { id: 'panda', emoji: '🐼', name: 'Panda', level: 3 },
  { id: 'wizard', emoji: '🧙', name: 'Wizard', level: 5 },
  { id: 'dragon', emoji: '🐉', name: 'Dragon', level: 5 },
  { id: 'alien', emoji: '👾', name: 'Alien', level: 8 },
  { id: 'rocket', emoji: '🚀', name: 'Rocket', level: 8 },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn', level: 12 },
]

export const FRAMES = [
  { id: 'steel', name: 'Steel', level: 1, classes: 'bg-slate-200 border-slate-300' },
  { id: 'ocean', name: 'Ocean', level: 2, classes: 'bg-gradient-to-br from-cyan-300 to-blue-500 border-blue-700' },
  { id: 'jungle', name: 'Jungle', level: 4, classes: 'bg-gradient-to-br from-lime-300 to-green-600 border-green-800' },
  { id: 'lava', name: 'Lava', level: 6, classes: 'bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 border-red-800' },
  { id: 'galaxy', name: 'Galaxy', level: 10, classes: 'bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-800 border-purple-950' },
]

export const DEFAULT_AVATAR = { avatarId: 'hero', frameId: 'steel', name: 'TOMMY', gear: { head: null, item: null, pet: null } }

export const avatarById = (id) => AVATARS.find((a) => a.id === id) ?? AVATARS[0]
export const frameById = (id) => FRAMES.find((f) => f.id === id) ?? FRAMES[0]

// cosmetics that become available exactly at `level`
export const unlocksAtLevel = (level) => [
  ...AVATARS.filter((a) => a.level === level),
  ...FRAMES.filter((f) => f.level === level),
]
