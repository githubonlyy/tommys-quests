// The worlds Tommy picks from on every launch. Everything visual that is not
// subject-specific reads from here: shell colors (as CSS vars), confetti,
// floating particles, and the arcade sprite skins.
//
// CSS vars are applied inline on the app root by ThemeContext and consumed with
// Tailwind v4 arbitrary-var classes, e.g. `bg-(--t-side)`.

export const THEME_VAR_KEYS = [
  '--t-bg-from', // main area gradient start
  '--t-bg-to', // main area gradient end
  '--t-side', // sidebar / bottom-nav background
  '--t-side-deep', // sidebar borders, darkest shade
  '--t-nav', // inactive nav button background
  '--t-panel', // translucent panel background over the main gradient
  '--t-panel-border', // panel border
  '--t-accent', // theme highlight (title span, active indicators)
  '--t-accent-deep', // pressed / border shade of accent
  '--t-text-soft', // muted text on side/panel surfaces
  '--t-overlay', // modal / match backdrop
]

export const THEMES = {
  space: {
    id: 'space',
    label: 'חלל',
    en: 'Space',
    subtitle: 'כוכבים, רקטות וחייזרים',
    enSubtitle: 'Stars, rockets and aliens',
    emoji: '🚀',
    vars: {
      '--t-bg-from': '#3b3bd6',
      '--t-bg-to': '#140b4d',
      '--t-side': '#1b1160',
      '--t-side-deep': '#0d0733',
      '--t-nav': '#241a7a',
      '--t-panel': 'rgba(13, 7, 51, 0.5)',
      '--t-panel-border': '#2a1f7d',
      '--t-accent': '#67e8f9',
      '--t-accent-deep': '#0891b2',
      '--t-text-soft': '#c7d2fe',
      '--t-overlay': 'rgba(8, 4, 38, 0.95)',
    },
    confetti: ['#67e8f9', '#a78bfa', '#facc15', '#ffffff', '#f472b6', '#38bdf8'],
    particles: ['🚀', '⭐', '🪐', '👾', '✨'],
    arcade: {
      coinrush: { good: '⭐', bad: '☄️', title: 'ציד כוכבים', he: 'תפסו כוכבים, תתחמקו ממטאורים!' },
      flappy: { hero: '🚀', wall: '#7c3aed', title: 'רקטה בטיסה', he: 'הקישו כדי לעוף בין האסטרואידים!' },
      bricks: { emoji: '🛸', title: 'פלישת חייזרים', he: 'נפצו את צי החייזרים עם הכדור!', bricks: ['#67e8f9', '#a78bfa', '#38bdf8', '#f472b6', '#facc15', '#34d399'] },
      moles: { good: '👾', bad: '☄️', title: 'תפסו חייזרים', he: 'תפסו חייזרים — לא מטאורים!' },
    },
  },
  dino: {
    id: 'dino',
    label: 'דינוזאורים',
    en: 'Dinos',
    subtitle: 'ג׳ונגל, ביצים ודינוזאורים',
    enSubtitle: 'Jungle, eggs and dinosaurs',
    emoji: '🦖',
    vars: {
      '--t-bg-from': '#4d9e3f',
      '--t-bg-to': '#14401a',
      '--t-side': '#1c5223',
      '--t-side-deep': '#0e2f13',
      '--t-nav': '#276b30',
      '--t-panel': 'rgba(14, 47, 19, 0.5)',
      '--t-panel-border': '#2c6b33',
      '--t-accent': '#fbbf24',
      '--t-accent-deep': '#d97706',
      '--t-text-soft': '#bbf7d0',
      '--t-overlay': 'rgba(8, 32, 12, 0.95)',
    },
    confetti: ['#fbbf24', '#84cc16', '#f97316', '#ffffff', '#22c55e', '#a16207'],
    particles: ['🦖', '🦕', '🌿', '🥚', '🌋'],
    arcade: {
      coinrush: { good: '🥚', bad: '🌋', title: 'איסוף ביצים', he: 'תפסו ביצים, תתחמקו מהרי געש!' },
      flappy: { hero: '🦅', wall: '#166534', title: 'פטרוזאור', he: 'הקישו כדי לעוף בין העצים!' },
      bricks: { emoji: '🪨', title: 'שוברים סלעים', he: 'נפצו את כל הסלעים עם הכדור!', bricks: ['#84cc16', '#fbbf24', '#f97316', '#a16207', '#22c55e', '#65a30d'] },
      moles: { good: '🦖', bad: '🌋', title: 'תפסו דינוזאור', he: 'תפסו דינוזאורים — לא הרי געש!' },
    },
  },
  soccer: {
    id: 'soccer',
    label: 'כדורגל',
    en: 'Soccer',
    subtitle: 'מגרש, גולים וגביעים',
    enSubtitle: 'Pitch, goals and trophies',
    emoji: '⚽',
    vars: {
      '--t-bg-from': '#22c55e',
      '--t-bg-to': '#064e3b',
      '--t-side': '#065f46',
      '--t-side-deep': '#022c22',
      '--t-nav': '#047857',
      '--t-panel': 'rgba(2, 44, 34, 0.5)',
      '--t-panel-border': '#0f766e',
      '--t-accent': '#fde047',
      '--t-accent-deep': '#eab308',
      '--t-text-soft': '#a7f3d0',
      '--t-overlay': 'rgba(2, 30, 24, 0.95)',
    },
    confetti: ['#fde047', '#ffffff', '#22c55e', '#38bdf8', '#ef4444', '#f97316'],
    particles: ['⚽', '🥅', '🏆', '👟', '🎽'],
    arcade: {
      coinrush: { good: '⚽', bad: '🟥', title: 'איסוף כדורים', he: 'תפסו כדורים, תתחמקו מכרטיסים אדומים!' },
      flappy: { hero: '⚽', wall: '#065f46', title: 'כדור מעופף', he: 'הקישו כדי לעוף בין השערים!' },
      bricks: { emoji: '🥅', title: 'קיר הגנה', he: 'פרצו את קיר ההגנה עם הכדור!', bricks: ['#fde047', '#ffffff', '#22c55e', '#38bdf8', '#ef4444', '#f97316'] },
      moles: { good: '⚽', bad: '🟥', title: 'תפסו את הכדור', he: 'תפסו כדורים — לא כרטיסים אדומים!' },
    },
  },
  ninja: {
    id: 'ninja',
    label: 'נינג׳ה',
    en: 'Ninja',
    subtitle: 'לילה, כוכבי נינג׳ה וקרב',
    enSubtitle: 'Night, shurikens and stealth',
    emoji: '🥷',
    vars: {
      '--t-bg-from': '#4b5563',
      '--t-bg-to': '#0f172a',
      '--t-side': '#1e293b',
      '--t-side-deep': '#020617',
      '--t-nav': '#334155',
      '--t-panel': 'rgba(2, 6, 23, 0.5)',
      '--t-panel-border': '#334155',
      '--t-accent': '#f87171',
      '--t-accent-deep': '#dc2626',
      '--t-text-soft': '#cbd5e1',
      '--t-overlay': 'rgba(2, 6, 23, 0.95)',
    },
    confetti: ['#f87171', '#ffffff', '#facc15', '#64748b', '#dc2626', '#38bdf8'],
    particles: ['🥷', '⭐', '🗡️', '🏮', '🌙'],
    arcade: {
      coinrush: { good: '⭐', bad: '💣', title: 'איסוף כוכבים', he: 'תפסו כוכבי נינג׳ה, תתחמקו מפצצות!' },
      flappy: { hero: '🥷', wall: '#1e293b', title: 'נינג׳ה מעופף', he: 'הקישו כדי לקפוץ בין הגגות!' },
      bricks: { emoji: '🏯', title: 'פריצת המצודה', he: 'שברו את חומות המצודה!', bricks: ['#f87171', '#facc15', '#ffffff', '#64748b', '#38bdf8', '#dc2626'] },
      moles: { good: '🥷', bad: '💣', title: 'תפסו נינג׳ה', he: 'תפסו נינג׳ות — לא פצצות!' },
    },
  },
}

export const THEME_IDS = Object.keys(THEMES)
export const DEFAULT_THEME = 'space'
