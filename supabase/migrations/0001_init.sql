-- Tommy's Quests — Phase 2 schema. Run once in Supabase SQL Editor.
-- Money/XP/level are written ONLY by security-definer functions below;
-- clients can never update those columns directly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  family_id uuid primary key references families(id) on delete cascade,
  pin_hash text not null default crypt('1234', gen_salt('bf')),
  daily_goal int not null default 4,
  daily_chest_coins int not null default 100
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  avatar jsonb not null default '{"avatarId":"hero","frameId":"steel"}',
  level int not null default 1,
  xp int not null default 0,
  coins int not null default 0 check (coins >= 0),
  streak jsonb not null default '{"count":0,"best":0,"lastDate":null}',
  stats jsonb not null default '{"totalWins":0,"perfectCount":0,"winsBySubject":{},"chestsOpened":0}',
  trophies jsonb not null default '{}',
  owned_games text[] not null default '{coinrush}',
  high_scores jsonb not null default '{}',
  daily_plays jsonb not null default '{}',
  lessons_read jsonb not null default '{}',
  chest_claimed date,
  created_at timestamptz not null default now()
);
create index if not exists players_family_idx on players(family_id);

create table if not exists matches (
  id bigint generated always as identity primary key,
  player_id uuid not null references players(id) on delete cascade,
  ts timestamptz not null default now(),
  event_id text not null,
  mode text not null,
  result text not null,
  correct int not null,
  total int not null,
  coins_earned int not null,
  xp_earned int not null,
  avg_time_sec numeric(6,1),
  practice boolean not null default false
);
create index if not exists matches_player_ts_idx on matches(player_id, ts desc);

create table if not exists shop_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  type text not null default '',
  desc_he text not null default '',
  cost int not null check (cost > 0),
  rarity text not null default 'RARE',
  icon text not null default 'award',
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists purchases (
  id bigint generated always as identity primary key,
  player_id uuid not null references players(id) on delete cascade,
  ts timestamptz not null default now(),
  title text not null,
  cost int not null,
  kind text not null check (kind in ('reward','game')),
  status text not null default 'pending' check (status in ('pending','approved','fulfilled'))
);

-- ------------------------------------------------------------- helpers
-- Game day flips at 05:00 Israel time
create or replace function business_date() returns date
language sql stable as $$
  select ((now() at time zone 'Asia/Jerusalem') - interval '5 hours')::date
$$;

create or replace function family_of_player(p uuid) returns uuid
language sql stable security definer as $$
  select family_id from players where id = p
$$;

create or replace function my_family_id() returns uuid
language sql stable security definer as $$
  select id from families where parent_user_id = auth.uid()
$$;

create or replace function level_cost(lvl int) returns int
language sql immutable as $$ select 200 + 100 * lvl $$;

-- ------------------------------------------------------------------ RLS
alter table families enable row level security;
alter table settings enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table shop_items enable row level security;
alter table purchases enable row level security;

create policy families_own on families for all
  using (parent_user_id = auth.uid()) with check (parent_user_id = auth.uid());

create policy settings_own on settings for all
  using (family_id = my_family_id()) with check (family_id = my_family_id());

create policy players_own on players for all
  using (family_id = my_family_id()) with check (family_id = my_family_id());

create policy matches_own on matches for select
  using (family_of_player(player_id) = my_family_id());

create policy shop_own on shop_items for all
  using (family_id = my_family_id()) with check (family_id = my_family_id());

create policy purchases_own on purchases for select
  using (family_of_player(player_id) = my_family_id());
create policy purchases_update_own on purchases for update
  using (family_of_player(player_id) = my_family_id());

-- Column-level lockdown: clients may only touch cosmetic/progress-tracking
-- columns on players. Money, XP, level, streak, stats, trophies, games,
-- scores, chest are RPC-only.
revoke update on players from authenticated;
grant update (name, avatar, lessons_read) on players to authenticated;
revoke insert on matches from authenticated;
revoke insert on purchases from authenticated;

-- ------------------------------------------------------- bootstrap family
-- First sign-in: create family + settings + default shop.
create or replace function ensure_family() returns uuid
language plpgsql security definer as $$
declare fid uuid;
begin
  select id into fid from families where parent_user_id = auth.uid();
  if fid is null then
    insert into families(parent_user_id) values (auth.uid()) returning id into fid;
    insert into settings(family_id) values (fid);
    insert into shop_items(family_id, title, type, desc_he, cost, rarity, icon, sort) values
      (fid, 'Extra Serve!', 'Padel Perk', 'הגשה נוספת חינם במשחק הפאדל המשפחתי הבא!', 500, 'RARE', 'award', 1),
      (fid, 'Trail Boss', 'Weekend Hike', 'אתה בוחר בדיוק לאן הולכים לטייל בשבת הקרובה.', 1200, 'EPIC', 'flag', 2),
      (fid, 'Lego Set', 'Hardware', 'בוחרים סט לגו חדש לגמרי בביקור הבא בחנות!', 5000, 'LEGENDARY', 'zap', 3);
  end if;
  return fid;
end $$;

-- ---------------------------------------------------------- trophies
-- adds trophy k (timestamped) when cond holds and it is not already earned
create or replace function award_trophy(t jsonb, k text, cond boolean) returns jsonb
language sql immutable as $$
  select case when cond and not (t ? k)
    then t || jsonb_build_object(k, (extract(epoch from now()) * 1000)::bigint)
    else t end
$$;

create or replace function eval_trophies(p players) returns jsonb
language plpgsql stable as $$
declare t jsonb := p.trophies; wins jsonb := p.stats->'winsBySubject';
begin
  t := award_trophy(t, 'first-win', (p.stats->>'totalWins')::int >= 1);
  t := award_trophy(t, 'perfect', (p.stats->>'perfectCount')::int >= 1);
  t := award_trophy(t, 'streak-3', (p.streak->>'best')::int >= 3);
  t := award_trophy(t, 'streak-7', (p.streak->>'best')::int >= 7);
  t := award_trophy(t, 'master-math', coalesce((wins->>'math')::int, 0) >= 5);
  t := award_trophy(t, 'master-english', coalesce((wins->>'english')::int, 0) >= 5);
  t := award_trophy(t, 'master-hebrew', coalesce((wins->>'hebrew')::int, 0) >= 5);
  t := award_trophy(t, 'master-geography', coalesce((wins->>'geography')::int, 0) >= 5);
  t := award_trophy(t, 'rich', p.coins >= 1000);
  t := award_trophy(t, 'chest-hunter', (p.stats->>'chestsOpened')::int >= 1);
  t := award_trophy(t, 'shopper', exists (select 1 from purchases where player_id = p.id and kind = 'reward'));
  return t;
end $$;

-- ---------------------------------------------------------- record_match
-- Server computes coins/xp/result from raw counts; client values are never trusted.
create or replace function record_match(
  p_player uuid, p_event text, p_mode text,
  p_correct int, p_total int, p_speed_bonus_count int,
  p_avg_time numeric, p_practice boolean,
  p_wrong_flips int default 0, p_timed_out boolean default false
) returns players
language plpgsql security definer as $$
declare
  p players; today date := business_date(); yesterday date := business_date() - 1;
  is_pairs boolean := p_mode = 'pairs';
  win boolean; draw boolean; res text; coins_e int; xp_e int; paid boolean;
  st jsonb; sk jsonb; cnt int; best int; lvl int; xpv int;
begin
  select * into p from players where id = p_player and family_id = my_family_id() for update;
  if p.id is null then raise exception 'player not found'; end if;
  if p_correct < 0 or p_total <= 0 or p_correct > p_total or p_speed_bonus_count > p_correct then
    raise exception 'invalid match payload';
  end if;

  if is_pairs then
    win := p_correct = p_total and not p_timed_out and p_wrong_flips <= 5;
    draw := not win and p_correct = p_total;
    coins_e := p_correct * 15 + case when win then 50 else 0 end;
    xp_e := p_correct * 15;
  else
    win := p_correct >= 7; draw := not win and p_correct >= 5;
    coins_e := p_correct * 10 + p_speed_bonus_count * 5 + case when win then 50 else 0 end;
    xp_e := p_correct * 10;
  end if;
  res := case when win then 'WIN' when draw then 'DRAW' else 'LOSS' end;

  -- practice = replay after today's paid play (or client says so)
  paid := not p_practice and coalesce(p.daily_plays->>p_event, '') <> today::text;
  if not paid then coins_e := 0; end if;

  -- xp / level
  xpv := p.xp + xp_e; lvl := p.level;
  while xpv >= level_cost(lvl) loop xpv := xpv - level_cost(lvl); lvl := lvl + 1; end loop;

  -- stats
  st := p.stats;
  if win then
    st := jsonb_set(st, '{totalWins}', to_jsonb((st->>'totalWins')::int + 1));
    st := jsonb_set(st, array['winsBySubject', p_event],
      to_jsonb(coalesce((st->'winsBySubject'->>p_event)::int, 0) + 1), true);
  end if;
  if p_correct = p_total then
    st := jsonb_set(st, '{perfectCount}', to_jsonb((st->>'perfectCount')::int + 1));
  end if;

  -- streak (paid plays only)
  sk := p.streak;
  if paid and coalesce(sk->>'lastDate', '') <> today::text then
    cnt := case when sk->>'lastDate' = yesterday::text then (sk->>'count')::int + 1 else 1 end;
    best := greatest((sk->>'best')::int, cnt);
    sk := jsonb_build_object('count', cnt, 'best', best, 'lastDate', today::text);
  end if;

  update players set
    coins = coins + coins_e, xp = xpv, level = lvl, stats = st, streak = sk,
    daily_plays = case when paid then daily_plays || jsonb_build_object(p_event, today::text) else daily_plays end
  where id = p_player returning * into p;

  update players set trophies = eval_trophies(p) where id = p_player returning * into p;

  insert into matches(player_id, event_id, mode, result, correct, total, coins_earned, xp_earned, avg_time_sec, practice)
  values (p_player, p_event, p_mode, res, p_correct, p_total, coins_e, xp_e, p_avg_time, not paid);

  return p;
end $$;

-- ------------------------------------------------------------- purchases
create or replace function buy_item(p_player uuid, p_item uuid) returns players
language plpgsql security definer as $$
declare p players; it shop_items;
begin
  select * into p from players where id = p_player and family_id = my_family_id() for update;
  select * into it from shop_items where id = p_item and family_id = p.family_id and active;
  if it.id is null then raise exception 'item not found'; end if;
  if p.coins < it.cost then raise exception 'not enough coins'; end if;
  update players set coins = coins - it.cost where id = p_player;
  insert into purchases(player_id, title, cost, kind) values (p_player, it.title, it.cost, 'reward');
  select * into p from players where id = p_player;
  update players set trophies = eval_trophies(p) where id = p_player returning * into p;
  return p;
end $$;

create or replace function buy_game(p_player uuid, p_game text, p_price int, p_title text) returns players
language plpgsql security definer as $$
declare p players; allowed int;
begin
  -- server-side price list; client-sent price is ignored
  allowed := case p_game when 'flappy' then 1500 when 'bricks' then 2000 when 'moles' then 2500 else null end;
  if allowed is null then raise exception 'unknown game'; end if;
  select * into p from players where id = p_player and family_id = my_family_id() for update;
  if p_game = any(p.owned_games) then return p; end if;
  if p.coins < allowed then raise exception 'not enough coins'; end if;
  update players set coins = coins - allowed, owned_games = owned_games || p_game
  where id = p_player returning * into p;
  insert into purchases(player_id, title, cost, kind, status) values (p_player, '🎮 ' || p_title, allowed, 'game', 'fulfilled');
  return p;
end $$;

create or replace function claim_chest(p_player uuid) returns players
language plpgsql security definer as $$
declare p players; s settings; done int; today date := business_date();
begin
  select * into p from players where id = p_player and family_id = my_family_id() for update;
  select * into s from settings where family_id = p.family_id;
  if p.chest_claimed = today then return p; end if;
  select count(*) into done from jsonb_each_text(p.daily_plays) where value = today::text;
  if done < s.daily_goal then raise exception 'daily goal not met'; end if;
  update players set
    coins = coins + s.daily_chest_coins, chest_claimed = today,
    stats = jsonb_set(stats, '{chestsOpened}', to_jsonb((stats->>'chestsOpened')::int + 1))
  where id = p_player returning * into p;
  update players set trophies = eval_trophies(p) where id = p_player returning * into p;
  return p;
end $$;

create or replace function arcade_score(p_player uuid, p_game text, p_score int) returns players
language plpgsql security definer as $$
declare p players;
begin
  select * into p from players where id = p_player and family_id = my_family_id() for update;
  if p_score > coalesce((p.high_scores->>p_game)::int, 0) then
    update players set high_scores = high_scores || jsonb_build_object(p_game, p_score)
    where id = p_player returning * into p;
  end if;
  return p;
end $$;

-- ---------------------------------------------------------------- PIN
create or replace function verify_pin(p_pin text) returns boolean
language sql stable security definer as $$
  select pin_hash = crypt(p_pin, pin_hash) from settings where family_id = my_family_id()
$$;

create or replace function set_pin(p_pin text) returns void
language sql security definer as $$
  update settings set pin_hash = crypt(p_pin, gen_salt('bf')) where family_id = my_family_id()
$$;

-- ----------------------------------------------------- one-time migration
-- Seeds a player from the tablet's localStorage blob (Phase 1 shape).
create or replace function import_local_progress(p_name text, p_state jsonb) returns players
language plpgsql security definer as $$
declare fid uuid := ensure_family(); p players;
begin
  insert into players(family_id, name, avatar, level, xp, coins, streak, stats, trophies,
    owned_games, high_scores, daily_plays, lessons_read)
  values (
    fid, p_name,
    coalesce(p_state->'avatar', '{"avatarId":"hero","frameId":"steel"}'),
    coalesce((p_state->>'level')::int, 1), coalesce((p_state->>'xp')::int, 0),
    greatest(coalesce((p_state->>'coins')::int, 0), 0),
    coalesce(p_state->'streak', '{"count":0,"best":0,"lastDate":null}'),
    coalesce(p_state->'stats', '{"totalWins":0,"perfectCount":0,"winsBySubject":{},"chestsOpened":0}'),
    coalesce(p_state->'trophies', '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_state->'ownedGames') x), '{coinrush}'),
    coalesce(p_state->'arcadeHighScores', '{}'),
    coalesce(p_state->'dailyPlays', '{}'), coalesce(p_state->'lessonsRead', '{}')
  ) returning * into p;
  return p;
end $$;

grant execute on function ensure_family, record_match, buy_item, buy_game, claim_chest,
  arcade_score, verify_pin, set_pin, import_local_progress, business_date to authenticated;
