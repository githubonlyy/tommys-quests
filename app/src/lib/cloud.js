import { supabase } from './supabase.js'

// players row (snake_case, server shape) -> PlayerContext state slice
export function rowToState(row) {
  if (!row) return {}
  return {
    cloudPlayerId: row.id,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    streak: row.streak,
    stats: row.stats,
    trophies: row.trophies,
    ownedGames: row.owned_games,
    arcadeHighScores: row.high_scores,
    dailyPlays: row.daily_plays,
    lessonsRead: row.lessons_read,
    chestClaimed: row.chest_claimed,
    avatar: { ...row.avatar, name: row.name },
  }
}

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

/**
 * Maps a reducer action to its server call. Returns the fresh players row
 * (or null when the action has no server side). Throws on failure so the
 * caller can queue it.
 */
export async function syncAction(action, playerId) {
  switch (action.type) {
    case 'MATCH_RESULT':
      return rpc('record_match', {
        p_player: playerId,
        p_event: action.eventId,
        p_mode: action.mode ?? 'classic',
        p_correct: action.correct,
        p_total: action.total ?? 10,
        p_speed_bonus_count: action.speedBonusCount ?? 0,
        p_avg_time: action.avgTimeSec ?? 0,
        p_practice: action.practice,
        p_wrong_flips: action.wrongFlips ?? 0,
        p_timed_out: action.timedOut ?? false,
      })
    case 'BUY':
      return rpc('buy_item', { p_player: playerId, p_item: action.item.id })
    case 'ARCADE_BUY':
      return rpc('buy_game', { p_player: playerId, p_game: action.game.id, p_price: action.game.price, p_title: action.game.title })
    case 'CHEST_CLAIM':
      return rpc('claim_chest', { p_player: playerId })
    case 'ARCADE_SCORE':
      return rpc('arcade_score', { p_player: playerId, p_game: action.game, p_score: action.score })
    case 'SET_AVATAR': {
      const patch = {}
      if (action.avatar.name) patch.name = action.avatar.name
      const cosmetic = { ...(action.avatar.avatarId && { avatarId: action.avatar.avatarId }), ...(action.avatar.frameId && { frameId: action.avatar.frameId }) }
      if (Object.keys(cosmetic).length) {
        const { data: cur } = await supabase.from('players').select('avatar').eq('id', playerId).single()
        patch.avatar = { ...(cur?.avatar ?? {}), ...cosmetic }
      }
      const { data, error } = await supabase.from('players').update(patch).eq('id', playerId).select().single()
      if (error) throw error
      return data
    }
    case 'LESSON_READ': {
      const { data: cur } = await supabase.from('players').select('lessons_read').eq('id', playerId).single()
      const { data, error } = await supabase
        .from('players')
        .update({ lessons_read: { ...(cur?.lessons_read ?? {}), [action.eventId]: action.date } })
        .eq('id', playerId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    case 'SET_PIN':
      await rpc('set_pin', { p_pin: action.pin })
      return null
    default:
      return null
  }
}

/* ---- family-level queries used by the cloud provider / coach screen ---- */
export const cloudApi = {
  ensureFamily: () => rpc('ensure_family', {}),
  listPlayers: async () => {
    const { data, error } = await supabase.from('players').select('*').order('created_at')
    if (error) throw error
    return data
  },
  addPlayer: async (familyId, name, avatar) => {
    const { data, error } = await supabase.from('players').insert({ family_id: familyId, name, avatar }).select().single()
    if (error) throw error
    return data
  },
  importLocal: (name, state) => rpc('import_local_progress', { p_name: name, p_state: state }),
  getPlayer: async (id) => {
    const { data, error } = await supabase.from('players').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },
  listShop: async () => {
    const { data, error } = await supabase.from('shop_items').select('*').order('sort')
    if (error) throw error
    return data
  },
  upsertShopItem: async (item) => {
    const { data, error } = await supabase.from('shop_items').upsert(item).select().single()
    if (error) throw error
    return data
  },
  listPurchases: async () => {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, players(name)')
      .order('ts', { ascending: false })
      .limit(100)
    if (error) throw error
    return data
  },
  setPurchaseStatus: async (id, status) => {
    const { error } = await supabase.from('purchases').update({ status }).eq('id', id)
    if (error) throw error
  },
  listMatches: async (playerId) => {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('player_id', playerId)
      .order('ts', { ascending: false })
      .limit(100)
    if (error) throw error
    return data
  },
  getSettings: async () => {
    const { data, error } = await supabase.from('settings').select('daily_goal, daily_chest_coins').single()
    if (error) throw error
    return data
  },
  updateSettings: async (familyId, patch) => {
    const { error } = await supabase.from('settings').update(patch).eq('family_id', familyId)
    if (error) throw error
  },
  verifyPin: (pin) => rpc('verify_pin', { p_pin: pin }),
}
