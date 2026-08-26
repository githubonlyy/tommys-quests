import CoinRush from '../arcade/CoinRush.jsx'
import FlappyZap from '../arcade/FlappyZap.jsx'
import BrickBreaker from '../arcade/BrickBreaker.jsx'
import MoleSmash from '../arcade/MoleSmash.jsx'

// Arcade catalog. price 0 = free starter game. Daily study-goal gate applies to all.
export const ARCADE_GAMES = [
  {
    id: 'coinrush',
    title: 'Coin Rush',
    he: 'תפסו מטבעות, תתחמקו מפצצות!',
    price: 0,
    color: 'bg-pink-500',
    borderColor: 'border-pink-700',
    textColor: 'text-pink-500',
    lightBg: 'bg-pink-100',
    Component: CoinRush,
  },
  {
    id: 'flappy',
    title: 'Flappy Zap',
    he: 'הקישו כדי לעוף בין הצינורות!',
    price: 1500,
    color: 'bg-sky-500',
    borderColor: 'border-sky-700',
    textColor: 'text-sky-500',
    lightBg: 'bg-sky-100',
    Component: FlappyZap,
  },
  {
    id: 'bricks',
    title: 'Brick Breaker',
    he: 'שברו את כל הלבנים עם הכדור!',
    price: 2000,
    color: 'bg-violet-500',
    borderColor: 'border-violet-700',
    textColor: 'text-violet-500',
    lightBg: 'bg-violet-100',
    Component: BrickBreaker,
  },
  {
    id: 'moles',
    title: 'Mole Smash',
    he: 'תפסו את החפרפרות — לא את הפצצות!',
    price: 2500,
    color: 'bg-lime-600',
    borderColor: 'border-lime-800',
    textColor: 'text-lime-600',
    lightBg: 'bg-lime-100',
    Component: MoleSmash,
  },
]
