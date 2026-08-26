# Tommy's Quests — Phase 2: Backend & Family Sync

**Date:** 2026-08-26
**Status:** Proposed — blocked on Supabase project credentials
**Builds on:** [MVP spec](2026-08-22-tommys-quests-design.md)

## Goals

1. Progress syncs across devices (tablet ↔ phone).
2. Coins cannot be tampered with from the client.
3. Parent controls remotely from their phone: shop items, prices, daily goal, PIN, purchase approval.
4. Multiple kids on one family account (Tommy, Melanie, Michael), each with own progress.

## Locked Decisions

| Topic | Decision |
|---|---|
| Backend | Supabase free tier: Postgres + Auth + Row Level Security. No custom server. |
| Auth | One **parent** account (email + password). Kids never log in — the parent signs the device in once, then a PIN-free profile picker selects the active kid. Session persists on device. |
| Keys | Only the **anon** key ships in the client (public by design; RLS is the guard). Service-role key never leaves Supabase. Values in `app/.env.local` (gitignored) and GitHub Actions secrets for CI builds. |
| Coins integrity | Client never writes `coins` directly. Postgres RPC functions compute rewards server-side from the match payload and config; purchases check balance inside the function. RLS denies direct UPDATE on money columns. |
| Offline | localStorage stays as cache + write queue. Matches played offline replay to the server on reconnect. |
| Migration | First sign-in on the current tablet offers "upload this device's progress" to seed Tommy's profile. |

## Data Model

```
families        id, parent_user_id (auth.users), created_at
players         id, family_id, name, avatar jsonb, level, xp, coins, streak jsonb,
                stats jsonb, trophies jsonb, owned_games text[], high_scores jsonb,
                daily_plays jsonb, lessons_read jsonb, chest_claimed date
matches         id, player_id, ts, event_id, mode, result, correct, total,
                coins_earned, xp_earned, avg_time_sec, practice
purchases       id, player_id, ts, item_title, cost, kind (reward|game),
                status (pending|approved|fulfilled)
shop_items      id, family_id, title, type, desc_he, cost, rarity, icon, active
settings        family_id, pin_hash, daily_goal, daily_chest_coins, config_overrides jsonb
```

## Server Functions (RPC)

- `record_match(player_id, payload)` — validates payload shape, recomputes coins/xp from `correct`, `total`, `speed_bonus_count`, applies win bonus, daily-first-play rule, streak, stats, trophies. Returns new player row.
- `buy_item(player_id, item_id)` — balance check, deduct, insert purchase as `pending`.
- `buy_game(player_id, game_id)` — same for arcade games.
- `claim_chest(player_id)` — verifies daily goal met server-side, once per business day.
- `approve_purchase(purchase_id)` — parent only (RLS: family owner).

## RLS Rules

- Parent user can read/write everything in their own family.
- Device with parent session can read players + call RPCs; no direct writes to `players.coins/xp/level`.
- `settings.pin_hash` readable only via `verify_pin(family_id, pin)` RPC.

## Client Changes

- `PlayerContext` becomes a thin cache: actions dispatch locally (optimistic) **and** call the matching RPC; server response overwrites local state. On RPC failure, queue and retry.
- New `ProfilePicker` screen after sign-in: choose kid, add kid.
- `CoachStats` gains: kid switcher, shop editor (add/edit/deactivate items, prices), purchase approval list, daily-goal + chest tuning, change PIN.
- `Shop` shows purchase status badges (pending → approved → fulfilled).

## Rollout

1. Supabase project + SQL migration (tables, RLS, RPCs). Migration file committed to `supabase/migrations/`.
2. Auth + profile picker + sync layer (read path first, then write-through).
3. Move economy math into RPCs; client keeps display-only copies.
4. Parent remote controls in Coach tab.
5. Migrate Tommy's existing tablet progress.

## Needed From the Parent

- Create a free Supabase project (supabase.com → New project, region EU).
- Provide **Project URL** and **anon public key** (Settings → API). Nothing else.
- Set the same two values as GitHub repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or hand them over and I will).

## Out of Scope (Phase 3 ideas)

Push notifications, weekly parent email report, teacher-assigned homework import, leaderboards between siblings.
