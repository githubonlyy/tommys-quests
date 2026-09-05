import CoinRush from '../arcade/CoinRush.jsx'
import FlappyZap from '../arcade/FlappyZap.jsx'
import BrickBreaker from '../arcade/BrickBreaker.jsx'
import MoleSmash from '../arcade/MoleSmash.jsx'
import Soccer from '../arcade/Soccer.jsx'
import Basketball from '../arcade/Basketball.jsx'
import NinjaSlice from '../arcade/NinjaSlice.jsx'
import Runner from '../arcade/Runner.jsx'
import SkatePark from '../arcade/SkatePark.jsx'
import Bowling from '../arcade/Bowling.jsx'

// Fun games are grouped like the subjects are, and none of them cost coins:
// they are earned by learning, not bought. Coins stay for the real-world shop.
export const FUN_CATEGORIES = [
  { id: 'sport', he: 'ספורט', en: 'Sports', emoji: '⚽', color: 'bg-green-600', border: 'border-green-800' },
  { id: 'action', he: 'אקשן ומהירות', en: 'Action', emoji: '⚡', color: 'bg-orange-500', border: 'border-orange-700' },
  { id: 'classic', he: 'ארקייד קלאסי', en: 'Classic', emoji: '🕹️', color: 'bg-pink-500', border: 'border-pink-700' },
  { id: 'create', he: 'יצירה ונהיגה', en: 'Create', emoji: '🎨', color: 'bg-amber-500', border: 'border-amber-700' },
]

// Arcade catalog. Every game is free; the daily study goal is what opens them.
export const ARCADE_GAMES = [
  {
    id: 'coinrush',
    category: 'classic',
    title: 'Coin Rush',
    heTitle: 'מרוץ המטבעות',
    he: 'תפסו מטבעות, תתחמקו מפצצות!',
    color: 'bg-pink-500',
    borderColor: 'border-pink-700',
    textColor: 'text-pink-500',
    lightBg: 'bg-pink-100',
    Component: CoinRush,
  },
  {
    id: 'flappy',
    category: 'action',
    title: 'Flappy Zap',
    heTitle: 'ברק מעופף',
    he: 'הקישו כדי לעוף בין הצינורות!',
    color: 'bg-sky-500',
    borderColor: 'border-sky-700',
    textColor: 'text-sky-500',
    lightBg: 'bg-sky-100',
    Component: FlappyZap,
  },
  {
    id: 'bricks',
    category: 'classic',
    title: 'Brick Breaker',
    heTitle: 'שובר הלבנים',
    he: 'שברו את כל הלבנים עם הכדור!',
    color: 'bg-violet-500',
    borderColor: 'border-violet-700',
    textColor: 'text-violet-500',
    lightBg: 'bg-violet-100',
    Component: BrickBreaker,
  },
  {
    id: 'moles',
    category: 'classic',
    title: 'Mole Smash',
    heTitle: 'ציד חפרפרות',
    he: 'תפסו את החפרפרות — לא את הפצצות!',
    color: 'bg-lime-600',
    borderColor: 'border-lime-800',
    textColor: 'text-lime-600',
    lightBg: 'bg-lime-100',
    Component: MoleSmash,
  },
  {
    id: 'soccer',
    category: 'sport',
    title: 'Penalty Kicks',
    heTitle: 'בעיטות עונשין',
    he: 'כוונו ובעטו — השוער לא ישן!',
    color: 'bg-green-600',
    borderColor: 'border-green-800',
    textColor: 'text-green-600',
    lightBg: 'bg-green-100',
    Component: Soccer,
  },
  {
    id: 'basketball',
    category: 'sport',
    title: 'Hoops',
    heTitle: 'קליעה לסל',
    he: 'משכו, שחררו וקלעו לסל הנע!',
    color: 'bg-orange-500',
    borderColor: 'border-orange-700',
    textColor: 'text-orange-500',
    lightBg: 'bg-orange-100',
    Component: Basketball,
  },
  {
    id: 'ninjaslice',
    category: 'action',
    title: 'Ninja Slice',
    heTitle: 'חיתוך נינג׳ה',
    he: 'העבירו אצבע וחתכו — היזהרו מפצצות!',
    color: 'bg-red-600',
    borderColor: 'border-red-800',
    textColor: 'text-red-600',
    lightBg: 'bg-red-100',
    Component: NinjaSlice,
  },
  {
    id: 'runner',
    category: 'action',
    title: 'Endless Runner',
    heTitle: 'ריצה אינסופית',
    he: 'קפצו והחליקו — עד לאן תגיעו?',
    color: 'bg-lime-500',
    borderColor: 'border-lime-700',
    textColor: 'text-lime-500',
    lightBg: 'bg-lime-100',
    Component: Runner,
  },
  {
    id: 'skatepark',
    category: 'action',
    title: 'Skate Park',
    heTitle: 'סקייט פארק',
    he: 'קפצו, הסתובבו ונחתו יפה!',
    color: 'bg-violet-500',
    borderColor: 'border-violet-700',
    textColor: 'text-violet-500',
    lightBg: 'bg-violet-100',
    Component: SkatePark,
  },
  {
    id: 'bowling',
    category: 'sport',
    title: 'Bowling',
    heTitle: 'באולינג',
    he: 'כוונו וגלגלו — סטרייק!',
    color: 'bg-amber-500',
    borderColor: 'border-amber-700',
    textColor: 'text-amber-500',
    lightBg: 'bg-amber-100',
    Component: Bowling,
  },
]
