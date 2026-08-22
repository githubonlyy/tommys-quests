// Shared by MapGrid (rendering) and MatchEngine (showing the correct answer text)
export const PLACES = [
  { id: 'kiryat-shmona', name: 'קריית שמונה', x: 108, y: 32, kind: 'city' },
  { id: 'haifa', name: 'חיפה', x: 64, y: 62, kind: 'city' },
  { id: 'tiberias', name: 'טבריה', x: 99, y: 66, kind: 'city' },
  { id: 'kinneret', name: 'הכנרת', x: 110, y: 62, kind: 'water', rx: 7, ry: 10 },
  { id: 'netanya', name: 'נתניה', x: 54, y: 108, kind: 'city' },
  { id: 'tel-aviv', name: 'תל אביב', x: 50, y: 138, kind: 'city' },
  { id: 'jerusalem', name: 'ירושלים', x: 82, y: 160, kind: 'city' },
  { id: 'ashdod', name: 'אשדוד', x: 46, y: 170, kind: 'city' },
  { id: 'dead-sea', name: 'ים המלח', x: 110, y: 198, kind: 'water', rx: 6, ry: 18 },
  { id: 'beer-sheva', name: 'באר שבע', x: 62, y: 218, kind: 'city' },
  { id: 'eilat', name: 'אילת', x: 77, y: 392, kind: 'city' },
]

export const placeName = (id) => PLACES.find((p) => p.id === id)?.name ?? id
