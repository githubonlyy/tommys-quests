import {
  Coins, Zap, BrickWall, Rat, Goal, Target, Swords, Rabbit, Bike, CircleDot,
  Volleyball, Shield, Rocket, Layers, Orbit, Car, Sailboat, Worm, Blocks,
  Footprints, Grid3x3, Brain, Route, TowerControl, Grid2x2, Hash,
} from 'lucide-react'
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
import Tennis from '../arcade/Tennis.jsx'
import Goalie from '../arcade/Goalie.jsx'
import Jetpack from '../arcade/Jetpack.jsx'
import Stack from '../arcade/Stack.jsx'
import SpaceBlast from '../arcade/SpaceBlast.jsx'
import RaceCar from '../arcade/RaceCar.jsx'
import BoatRace from '../arcade/BoatRace.jsx'
import Snake from '../arcade/Snake.jsx'
import FallingBlocks from '../arcade/FallingBlocks.jsx'
import RoadCross from '../arcade/RoadCross.jsx'
import SlidePuzzle from '../arcade/SlidePuzzle.jsx'
import MemoryPairs from '../arcade/MemoryPairs.jsx'
import Maze from '../arcade/Maze.jsx'
import Hanoi from '../arcade/Hanoi.jsx'
import Merge2048 from '../arcade/Merge2048.jsx'
import MiniSudoku from '../arcade/MiniSudoku.jsx'

// Fun games are grouped like the subjects are, and none of them cost coins:
// they are earned by learning, not bought. Coins stay for the real-world shop.
//
// The puzzle group is `alwaysOpen`: quiet, thinking games never spend the play
// clock, so there is always something to do even on a day with no time left.
// Drawing lives in that group too (the screen adds its card), and driving sits
// with the other racing games where it belongs.
export const FUN_CATEGORIES = [
  { id: 'sport', he: 'ספורט', en: 'Sports', emoji: '⚽', color: 'bg-green-600', border: 'border-green-800' },
  { id: 'action', he: 'אקשן ומהירות', en: 'Action', emoji: '⚡', color: 'bg-orange-500', border: 'border-orange-700' },
  { id: 'race', he: 'מרוצים ונהיגה', en: 'Racing', emoji: '🏎️', color: 'bg-red-600', border: 'border-red-800' },
  { id: 'classic', he: 'ארקייד קלאסי', en: 'Classic', emoji: '🕹️', color: 'bg-pink-500', border: 'border-pink-700' },
  {
    id: 'puzzle', he: 'חידות ויצירה', en: 'Puzzles & Art', emoji: '🧩',
    color: 'bg-violet-600', border: 'border-violet-800', alwaysOpen: true,
  },
]

export const alwaysOpenCategory = (id) => Boolean(FUN_CATEGORIES.find((c) => c.id === id)?.alwaysOpen)

// Arcade catalog. Every game is free; the daily study goal is what opens the
// timed ones. Colours are literal Tailwind classes so the build keeps them.
export const ARCADE_GAMES = [
  /* ---------------- ספורט ---------------- */
  {
    id: 'soccer',
    category: 'sport',
    title: 'Penalty Kicks',
    heTitle: 'בעיטות עונשין',
    he: 'כוונו ובעטו — השוער לא ישן!',
    Icon: Goal,
    color: 'bg-green-600',
    borderColor: 'border-green-800',
    textColor: 'text-green-600',
    lightBg: 'bg-green-100',
    Component: Soccer,
  },
  {
    id: 'goalie',
    category: 'sport',
    title: 'Goalkeeper',
    heTitle: 'שוער',
    he: 'צא לשער ועצור את הבעיטות!',
    Icon: Shield,
    color: 'bg-cyan-600',
    borderColor: 'border-cyan-800',
    textColor: 'text-cyan-600',
    lightBg: 'bg-cyan-100',
    Component: Goalie,
  },
  {
    id: 'basketball',
    category: 'sport',
    title: 'Hoops',
    heTitle: 'קליעה לסל',
    he: 'משכו, שחררו וקלעו לסל הנע!',
    Icon: Target,
    color: 'bg-orange-500',
    borderColor: 'border-orange-700',
    textColor: 'text-orange-500',
    lightBg: 'bg-orange-100',
    Component: Basketball,
  },
  {
    id: 'tennis',
    category: 'sport',
    title: 'Tennis',
    heTitle: 'טניס',
    he: 'החזר את הכדור — מי יחזיק יותר?',
    Icon: Volleyball,
    color: 'bg-emerald-500',
    borderColor: 'border-emerald-700',
    textColor: 'text-emerald-500',
    lightBg: 'bg-emerald-100',
    Component: Tennis,
  },
  {
    id: 'bowling',
    category: 'sport',
    title: 'Bowling',
    heTitle: 'באולינג',
    he: 'כוונו וגלגלו — סטרייק!',
    Icon: CircleDot,
    color: 'bg-amber-500',
    borderColor: 'border-amber-700',
    textColor: 'text-amber-500',
    lightBg: 'bg-amber-100',
    Component: Bowling,
  },

  /* ------------- אקשן ומהירות ------------- */
  {
    id: 'runner',
    category: 'action',
    title: 'Endless Runner',
    heTitle: 'ריצה אינסופית',
    he: 'קפצו והחליקו — עד לאן תגיעו?',
    Icon: Rabbit,
    color: 'bg-lime-500',
    borderColor: 'border-lime-700',
    textColor: 'text-lime-500',
    lightBg: 'bg-lime-100',
    Component: Runner,
  },
  {
    id: 'flappy',
    category: 'action',
    title: 'Flappy Zap',
    heTitle: 'ברק מעופף',
    he: 'הקישו כדי לעוף בין הצינורות!',
    Icon: Zap,
    color: 'bg-sky-500',
    borderColor: 'border-sky-700',
    textColor: 'text-sky-500',
    lightBg: 'bg-sky-100',
    Component: FlappyZap,
  },
  {
    id: 'jetpack',
    category: 'action',
    title: 'Jetpack',
    heTitle: 'ג׳טפק',
    he: 'החזק כדי לעוף ואסוף מטבעות!',
    Icon: Rocket,
    color: 'bg-fuchsia-500',
    borderColor: 'border-fuchsia-700',
    textColor: 'text-fuchsia-500',
    lightBg: 'bg-fuchsia-100',
    Component: Jetpack,
  },
  {
    id: 'ninjaslice',
    category: 'action',
    title: 'Ninja Slice',
    heTitle: 'חיתוך נינג׳ה',
    he: 'העבירו אצבע וחתכו — היזהרו מפצצות!',
    Icon: Swords,
    color: 'bg-red-600',
    borderColor: 'border-red-800',
    textColor: 'text-red-600',
    lightBg: 'bg-red-100',
    Component: NinjaSlice,
  },
  {
    id: 'skatepark',
    category: 'action',
    title: 'Skate Park',
    heTitle: 'סקייט פארק',
    he: 'קפצו, הסתובבו ונחתו יפה!',
    Icon: Bike,
    color: 'bg-violet-500',
    borderColor: 'border-violet-700',
    textColor: 'text-violet-500',
    lightBg: 'bg-violet-100',
    Component: SkatePark,
  },
  {
    id: 'stack',
    category: 'action',
    title: 'Tower Stack',
    heTitle: 'מגדל קוביות',
    he: 'תזמן נכון ובנה מגדל ענק!',
    Icon: Layers,
    color: 'bg-teal-500',
    borderColor: 'border-teal-700',
    textColor: 'text-teal-500',
    lightBg: 'bg-teal-100',
    Component: Stack,
  },
  {
    id: 'space',
    category: 'action',
    title: 'Space Blast',
    heTitle: 'קרב חלל',
    he: 'הזז את החללית וירה במטאורים!',
    Icon: Orbit,
    color: 'bg-indigo-500',
    borderColor: 'border-indigo-700',
    textColor: 'text-indigo-500',
    lightBg: 'bg-indigo-100',
    Component: SpaceBlast,
  },

  /* ------------ מרוצים ונהיגה ------------ */
  {
    id: 'race',
    category: 'race',
    title: 'Car Race',
    heTitle: 'מרוץ מכוניות',
    he: 'עקוף את כולם בלי להתנגש!',
    Icon: Car,
    color: 'bg-red-500',
    borderColor: 'border-red-700',
    textColor: 'text-red-500',
    lightBg: 'bg-red-100',
    Component: RaceCar,
  },
  {
    id: 'boat',
    category: 'race',
    title: 'Boat Race',
    heTitle: 'מרוץ סירות',
    he: 'שוט בנהר ועבור בין הדגלים!',
    Icon: Sailboat,
    color: 'bg-blue-500',
    borderColor: 'border-blue-700',
    textColor: 'text-blue-500',
    lightBg: 'bg-blue-100',
    Component: BoatRace,
  },

  /* ------------ ארקייד קלאסי ------------ */
  {
    id: 'coinrush',
    category: 'classic',
    title: 'Coin Rush',
    heTitle: 'מרוץ המטבעות',
    he: 'תפסו מטבעות, תתחמקו מפצצות!',
    Icon: Coins,
    color: 'bg-pink-500',
    borderColor: 'border-pink-700',
    textColor: 'text-pink-500',
    lightBg: 'bg-pink-100',
    Component: CoinRush,
  },
  {
    id: 'bricks',
    category: 'classic',
    title: 'Brick Breaker',
    heTitle: 'שובר הלבנים',
    he: 'שברו את כל הלבנים עם הכדור!',
    Icon: BrickWall,
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
    Icon: Rat,
    color: 'bg-lime-600',
    borderColor: 'border-lime-800',
    textColor: 'text-lime-600',
    lightBg: 'bg-lime-100',
    Component: MoleSmash,
  },
  {
    id: 'snake',
    category: 'classic',
    title: 'Snake',
    heTitle: 'נחש',
    he: 'אכול ותגדל — בלי להתנגש בזנב!',
    Icon: Worm,
    color: 'bg-green-500',
    borderColor: 'border-green-700',
    textColor: 'text-green-500',
    lightBg: 'bg-green-100',
    Component: Snake,
  },
  {
    id: 'blocks',
    category: 'classic',
    title: 'Falling Blocks',
    heTitle: 'קוביות נופלות',
    he: 'סדר את הקוביות והשלם שורות!',
    Icon: Blocks,
    color: 'bg-purple-500',
    borderColor: 'border-purple-700',
    textColor: 'text-purple-500',
    lightBg: 'bg-purple-100',
    Component: FallingBlocks,
  },
  {
    id: 'frog',
    category: 'classic',
    title: 'Road Cross',
    heTitle: 'חציית כביש',
    he: 'עבור את הכביש בלי להידרס!',
    Icon: Footprints,
    color: 'bg-yellow-500',
    borderColor: 'border-yellow-700',
    textColor: 'text-yellow-500',
    lightBg: 'bg-yellow-100',
    Component: RoadCross,
  },

  /* ------------ חידות ויצירה ------------ */
  {
    id: 'slide',
    category: 'puzzle',
    title: 'Slide Puzzle',
    heTitle: 'פאזל הזזה',
    he: 'הזז את המשבצות וסדר את התמונה',
    Icon: Grid3x3,
    color: 'bg-rose-500',
    borderColor: 'border-rose-700',
    textColor: 'text-rose-500',
    lightBg: 'bg-rose-100',
    Component: SlidePuzzle,
  },
  {
    id: 'memory',
    category: 'puzzle',
    title: 'Memory',
    heTitle: 'משחק זיכרון',
    he: 'הפוך קלפים ומצא את הזוגות',
    Icon: Brain,
    color: 'bg-pink-500',
    borderColor: 'border-pink-700',
    textColor: 'text-pink-500',
    lightBg: 'bg-pink-100',
    Component: MemoryPairs,
  },
  {
    id: 'maze',
    category: 'puzzle',
    title: 'Maze',
    heTitle: 'מבוך',
    he: 'מצא את הדרך החוצה!',
    Icon: Route,
    color: 'bg-stone-500',
    borderColor: 'border-stone-700',
    textColor: 'text-stone-500',
    lightBg: 'bg-stone-100',
    Component: Maze,
  },
  {
    id: 'hanoi',
    category: 'puzzle',
    title: 'Tower of Hanoi',
    heTitle: 'מגדל האנוי',
    he: 'העבר את המגדל בכמה שפחות מהלכים',
    Icon: TowerControl,
    color: 'bg-orange-600',
    borderColor: 'border-orange-800',
    textColor: 'text-orange-600',
    lightBg: 'bg-orange-100',
    Component: Hanoi,
  },
  {
    id: 'n2048',
    category: 'puzzle',
    title: '2048',
    heTitle: '2048',
    he: 'החלק, מזג והגע ל-2048!',
    Icon: Grid2x2,
    color: 'bg-amber-600',
    borderColor: 'border-amber-800',
    textColor: 'text-amber-600',
    lightBg: 'bg-amber-100',
    Component: Merge2048,
  },
  {
    id: 'sudoku',
    category: 'puzzle',
    title: 'Mini Sudoku',
    heTitle: 'סודוקו קטן',
    he: 'מלא את הריבועים בלי לחזור על מספר',
    Icon: Hash,
    color: 'bg-sky-600',
    borderColor: 'border-sky-800',
    textColor: 'text-sky-600',
    lightBg: 'bg-sky-100',
    Component: MiniSudoku,
  },
]
