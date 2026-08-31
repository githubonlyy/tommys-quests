// Trophy definitions. `check(state)` runs against the freshly-updated player
// state inside the reducer; a trophy is earned once and keeps its timestamp.
export const TROPHIES = [
  {
    id: 'first-win',
    icon: 'trophy',
    title: 'First Win',
    heTitle: 'ניצחון ראשון',
    he: 'הניצחון הראשון שלך!',
    check: (s) => s.stats.totalWins >= 1,
  },
  {
    id: 'perfect',
    icon: 'target',
    title: 'Perfect!',
    heTitle: 'מושלם!',
    he: 'משחק מושלם — בלי אף טעות!',
    check: (s) => s.stats.perfectCount >= 1,
  },
  {
    id: 'streak-3',
    icon: 'flame',
    title: 'On Fire x3',
    heTitle: 'שלושה ברצף',
    he: '3 ימים ברצף של משחק!',
    check: (s) => s.streak.best >= 3,
  },
  {
    id: 'streak-7',
    icon: 'crown',
    title: 'Week Warrior',
    heTitle: 'לוחם השבוע',
    he: 'שבוע שלם ברצף!',
    check: (s) => s.streak.best >= 7,
  },
  {
    id: 'master-math',
    icon: 'calculator',
    title: 'Math Master',
    heTitle: 'אלוף החשבון',
    he: '5 ניצחונות במתמטיקה',
    check: (s) => (s.stats.winsBySubject.math || 0) >= 5,
  },
  {
    id: 'master-english',
    icon: 'message',
    title: 'English Master',
    heTitle: 'אלוף האנגלית',
    he: '5 ניצחונות באנגלית',
    check: (s) => (s.stats.winsBySubject.english || 0) >= 5,
  },
  {
    id: 'master-hebrew',
    icon: 'book',
    title: 'Hebrew Master',
    heTitle: 'אלוף העברית',
    he: '5 ניצחונות בעברית',
    check: (s) => (s.stats.winsBySubject.hebrew || 0) >= 5,
  },
  {
    id: 'master-geography',
    icon: 'map',
    title: 'Map Master',
    heTitle: 'אלוף המפות',
    he: '5 ניצחונות במולדת',
    check: (s) => (s.stats.winsBySubject.geography || 0) >= 5,
  },
  {
    id: 'rich',
    icon: 'coins',
    title: 'Rich Kid',
    heTitle: 'עשיר!',
    he: 'הגעת ל-1,000 מטבעות!',
    check: (s) => s.coins >= 1000,
  },
  {
    id: 'shopper',
    icon: 'bag',
    title: 'First Prize',
    heTitle: 'הפרס הראשון',
    he: 'הפרס האמיתי הראשון שלך!',
    check: (s) => s.purchases.length >= 1,
  },
  {
    id: 'chest-hunter',
    icon: 'gift',
    title: 'Chest Hunter',
    heTitle: 'צייד אוצרות',
    he: 'פתחת את תיבת האוצר היומית!',
    check: (s) => s.stats.chestsOpened >= 1,
  },
]

// returns an updated {id: ts} map including any newly-earned trophies
export function evaluateTrophies(state) {
  let changed = false
  const next = { ...state.trophies }
  for (const t of TROPHIES) {
    if (!next[t.id] && t.check(state)) {
      next[t.id] = Date.now()
      changed = true
    }
  }
  return changed ? next : state.trophies
}
