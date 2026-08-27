import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase.js'
import { cloudApi, syncAction } from '../lib/cloud.js'

const ACTIVE_KEY = 'tommys-quests-active-player'
const QUEUE_KEY = 'tommys-quests-sync-queue'

const CloudContext = createContext(null)

/**
 * Family/cloud layer. When Supabase env is absent this provides
 * { enabled: false } and the app behaves exactly like Phase 1.
 */
export function CloudProvider({ children }) {
  const enabled = cloudEnabled()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [familyId, setFamilyId] = useState(null)
  const [players, setPlayers] = useState([])
  const [activePlayerId, setActivePlayerIdState] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
  })
  const [shopItems, setShopItems] = useState([])
  const [settings, setSettings] = useState(null)
  const [online, setOnline] = useState(true)

  // auth session
  useEffect(() => {
    if (!enabled) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setFamilyId(null); setPlayers([]); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [enabled])

  const refreshFamily = useCallback(async () => {
    const fid = await cloudApi.ensureFamily()
    setFamilyId(fid)
    const [ps, items, st] = await Promise.all([cloudApi.listPlayers(), cloudApi.listShop(), cloudApi.getSettings()])
    setPlayers(ps)
    setShopItems(items)
    setSettings(st)
    return ps
  }, [])

  // bootstrap family after sign-in
  useEffect(() => {
    if (!enabled || !session) return
    let cancelled = false
    setLoading(true)
    refreshFamily()
      .then((ps) => {
        if (cancelled) return
        // drop a stale active id (player deleted / different account)
        if (activePlayerId && !ps.some((p) => p.id === activePlayerId)) setActivePlayerId(null)
      })
      .catch((e) => console.error('family bootstrap failed', e))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session])

  const setActivePlayerId = (id) => {
    setActivePlayerIdState(id)
    try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY) } catch { /* ignore */ }
  }

  /* ---- offline queue: failed syncs replay in order when back online ---- */
  const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] } }
  const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* ignore */ } }

  const flushQueue = useCallback(async () => {
    const q = readQueue()
    if (q.length === 0) return null
    let lastRow = null
    const remaining = [...q]
    for (const entry of q) {
      try {
        const row = await syncAction(entry.action, entry.playerId)
        if (row) lastRow = row
        remaining.shift()
      } catch {
        break // keep order; retry later
      }
    }
    writeQueue(remaining)
    return lastRow
  }, [])

  useEffect(() => {
    const up = () => { setOnline(true); flushQueue() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [flushQueue])

  /** Push one action; returns fresh players row or null. Queues on failure. */
  const sync = useCallback(async (action, playerId) => {
    if (!enabled || !session || !playerId) return null
    try {
      await flushQueue()
      const row = await syncAction(action, playerId)
      if (row) setPlayers((ps) => ps.map((p) => (p.id === row.id ? row : p)))
      return row
    } catch (e) {
      console.warn('sync failed, queued', action.type, e?.message)
      writeQueue([...readQueue(), { action, playerId }])
      setOnline(false)
      return null
    }
  }, [enabled, session, flushQueue])

  const value = {
    enabled,
    session,
    loading,
    online,
    familyId,
    players,
    activePlayerId,
    activePlayer: players.find((p) => p.id === activePlayerId) ?? null,
    setActivePlayerId,
    shopItems,
    settings,
    sync,
    refreshFamily,
    api: cloudApi,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signOut: () => { setActivePlayerId(null); return supabase.auth.signOut() },
    addPlayer: async (name, avatar) => {
      const row = await cloudApi.addPlayer(familyId, name, avatar)
      setPlayers((ps) => [...ps, row])
      return row
    },
    importLocal: async (name, state) => {
      const row = await cloudApi.importLocal(name, state)
      setPlayers((ps) => [...ps, row])
      return row
    },
    refreshShop: async () => setShopItems(await cloudApi.listShop()),
    updateSettings: async (patch) => {
      await cloudApi.updateSettings(familyId, patch)
      setSettings((s) => ({ ...s, ...patch }))
    },
  }

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>
}

export const useCloud = () => useContext(CloudContext) ?? { enabled: false }
