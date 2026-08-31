// Accessories his hero wears. Bought with coins — deliberately cheap next to
// the real-world shop (a Lego set is 5,000) so gear is a quick win between
// savings goals, never a competitor to it. A few are level-locked instead of
// priced, so leveling still unlocks something to look forward to.
//
// Three slots, each drawn as a small emoji pinned to the avatar box.
export const GEAR_SLOTS = ['head', 'item', 'pet']

export const GEAR = [
  // --- head -----------------------------------------------------------------
  { id: 'cap', slot: 'head', emoji: '🧢', he: 'כובע מצחייה', en: 'Cap', cost: 150 },
  { id: 'helmet', slot: 'head', emoji: '⛑️', he: 'קסדה', en: 'Helmet', cost: 250 },
  { id: 'headband', slot: 'head', emoji: '🎧', he: 'אוזניות', en: 'Headphones', cost: 300 },
  { id: 'crown', slot: 'head', emoji: '👑', he: 'כתר', en: 'Crown', cost: 600 },
  { id: 'halo', slot: 'head', emoji: '🎓', he: 'כובע בוגר', en: 'Grad Cap', level: 10 },

  // --- item (hand / back) ---------------------------------------------------
  { id: 'sword', slot: 'item', emoji: '⚔️', he: 'חרב', en: 'Sword', cost: 200 },
  { id: 'shield', slot: 'item', emoji: '🛡️', he: 'מגן', en: 'Shield', cost: 250 },
  { id: 'skateboard', slot: 'item', emoji: '🛹', he: 'סקייטבורד', en: 'Skateboard', cost: 350 },
  { id: 'jetpack', slot: 'item', emoji: '🚀', he: 'מזחלת רקטה', en: 'Jetpack', cost: 500 },
  { id: 'guitar', slot: 'item', emoji: '🎸', he: 'גיטרה', en: 'Guitar', cost: 400 },
  { id: 'wand', slot: 'item', emoji: '🪄', he: 'שרביט קסמים', en: 'Magic Wand', level: 7 },

  // --- pet ------------------------------------------------------------------
  { id: 'dog', slot: 'pet', emoji: '🐕', he: 'כלב', en: 'Dog', cost: 300 },
  { id: 'cat', slot: 'pet', emoji: '🐈', he: 'חתול', en: 'Cat', cost: 300 },
  { id: 'dragon', slot: 'pet', emoji: '🐲', he: 'דרקון', en: 'Dragon', cost: 700 },
  { id: 'robot', slot: 'pet', emoji: '🤖', he: 'רובוט עוזר', en: 'Robot Buddy', cost: 550 },
  { id: 'falcon', slot: 'pet', emoji: '🦅', he: 'נץ', en: 'Falcon', level: 5 },
]

export const gearById = (id) => GEAR.find((g) => g.id === id) ?? null
export const gearInSlot = (slot) => GEAR.filter((g) => g.slot === slot)

/** Level-locked gear becomes available at `level`; priced gear is always buyable. */
export const isGearLocked = (gear, level) => Boolean(gear.level) && level < gear.level
