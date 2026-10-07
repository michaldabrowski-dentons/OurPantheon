-- 0012: the hex map. The altar becomes a hexagon of radius 5 (91 fields, axial q, r, centre 0,0)
-- generated when the game starts. Creatures and avatars stand on fields (three corner slots), a city
-- lies in the middle of its field as a pyramid of dots, and every dot belongs to a god (its followers).
-- Terraforming, life and the civilisation actions act on the map; factions and religions are gone
-- (the enum values stay, unused). Contests (Nawracanie, Święta Wojna) wait for the defender to answer
-- in their own client. Every action row carries `outcome` (what happened) so the client composes the
-- verse and the player may rewrite it through edit_log_summary. Old games are not migrated.

-- ---------- schema ----------
alter table entities add column if not exists emoji text;
alter table entities add column if not exists hp smallint;
create unique index if not exists entities_game_emoji_idx on entities (game_id, emoji) where emoji is not null;

alter table actions_log add column if not exists outcome jsonb;

create table if not exists hexes (
  game_id uuid not null references games (id) on delete cascade,
  q smallint not null,
  r smallint not null,
  biome text not null check (biome in ('woda', 'gory', 'puszcza', 'dzungla', 'trawa', 'pustynia', 'tundra', 'bagno', 'sawanna', 'wzgorza', 'zima')),
  decor jsonb not null default '[]'::jsonb,
  primary key (game_id, q, r)
);

create table if not exists hex_occupants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  q smallint not null,
  r smallint not null,
  slot smallint not null check (slot between 0 and 2),
  entity_id uuid not null references entities (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, q, r, slot),
  unique (game_id, q, r, entity_id),
  foreign key (game_id, q, r) references hexes (game_id, q, r) on delete cascade
);
create index if not exists hex_occupants_entity_idx on hex_occupants (entity_id);

create table if not exists cities (
  entity_id uuid primary key references entities (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  q smallint not null,
  r smallint not null,
  unique (game_id, q, r),
  foreign key (game_id, q, r) references hexes (game_id, q, r) on delete cascade
);

create table if not exists city_followers (
  game_id uuid not null references games (id) on delete cascade,
  city_id uuid not null references entities (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  dots int not null check (dots > 0),
  primary key (city_id, player_id)
);

create table if not exists city_gifts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  city_id uuid not null references entities (id) on delete cascade,
  player_id uuid references players (id) on delete set null,
  text text not null,
  accepted boolean not null default true,
  dots_gained smallint not null default 0,
  round_number int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists city_gifts_city_idx on city_gifts (city_id);

create table if not exists contests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  round_number int not null,
  era smallint not null,
  kind text not null check (kind in ('convert', 'holy_war')),
  attacker_id uuid not null references players (id) on delete cascade,
  defender_id uuid not null references players (id) on delete cascade,
  target_city_id uuid not null references entities (id) on delete cascade,
  source_city_id uuid references entities (id) on delete set null,
  army int,
  cost int not null default 0,
  attacker_attr text not null,
  attacker_d1 smallint not null,
  attacker_d2 smallint not null,
  attacker_mod int not null default 0,
  attacker_total int not null,
  defender_attr text,
  defender_d1 smallint,
  defender_d2 smallint,
  defender_mod int,
  defender_total int,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'committed', 'cancelled')),
  outcome jsonb,
  log_id uuid references actions_log (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists contests_one_pending_idx on contests (game_id) where status = 'pending';

alter table hexes enable row level security;
alter table hex_occupants enable row level security;
alter table cities enable row level security;
alter table city_followers enable row level security;
alter table city_gifts enable row level security;
alter table contests enable row level security;
drop policy if exists "hexes readable" on hexes;
drop policy if exists "hex_occupants readable" on hex_occupants;
drop policy if exists "cities readable" on cities;
drop policy if exists "city_followers readable" on city_followers;
drop policy if exists "city_gifts readable" on city_gifts;
drop policy if exists "contests readable" on contests;
create policy "hexes readable" on hexes for select to authenticated using (is_game_member(game_id));
create policy "hex_occupants readable" on hex_occupants for select to authenticated using (is_game_member(game_id));
create policy "cities readable" on cities for select to authenticated using (is_game_member(game_id));
create policy "city_followers readable" on city_followers for select to authenticated using (is_game_member(game_id));
create policy "city_gifts readable" on city_gifts for select to authenticated using (is_game_member(game_id));
create policy "contests readable" on contests for select to authenticated using (is_game_member(game_id));

alter table hexes replica identity full;
alter table hex_occupants replica identity full;
alter table cities replica identity full;
alter table city_followers replica identity full;
alter table city_gifts replica identity full;
alter table contests replica identity full;
do $$
declare t text;
begin
  foreach t in array array['hexes', 'hex_occupants', 'cities', 'city_followers', 'city_gifts', 'contests'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ---------- geometry ----------
create or replace function hex_distance(q1 int, r1 int, q2 int, r2 int)
returns int language sql immutable as $$
  select (abs(q1 - q2) + abs(r1 - r2) + abs((q1 + r1) - (q2 + r2))) / 2;
$$;

create or replace function hex_in_map(q int, r int)
returns boolean language sql immutable as $$
  select hex_distance(0, 0, q, r) <= 5;
$$;

create or replace function hex_blocked(p_biome text)
returns boolean language sql immutable as $$
  select p_biome in ('woda', 'gory');
$$;

-- ---------- attributes (mirrors scoresFor in src/data/pantheon.ts) ----------
create or replace function attr_opposite(p_attr text)
returns text language sql immutable as $$
  select case p_attr
    when 'wrath' then 'grace' when 'grace' then 'wrath'
    when 'majesty' then 'whisper' when 'whisper' then 'majesty'
    when 'wisdom' then 'element' when 'element' then 'wisdom'
    else null end;
$$;

create or replace function attr_name(p_attr text)
returns text language sql immutable as $$
  select case p_attr
    when 'wrath' then 'Gniew' when 'grace' then 'Łaska'
    when 'majesty' then 'Majestat' when 'whisper' then 'Podszept'
    when 'wisdom' then 'Mądrość' when 'element' then 'Żywioł'
    else p_attr end;
$$;

create or replace function attr_score(p players, p_attr text)
returns int language plpgsql immutable as $$
declare
  mains text[];
  s int := 0;
begin
  if p.domain_key is null then return 0; end if;
  mains := domain_mains(p.domain_key);
  if p_attr = any(mains) then s := 1;
  elsif attr_opposite(p_attr) = any(mains) then s := -1;
  end if;
  if p.attr_primary = p_attr then s := s + 1; end if;
  if p.attr_bonus = p_attr then s := s + 1; end if;
  return s;
end $$;

create or replace function is_sapient(e entities)
returns boolean language sql immutable as $$
  select e.kind = 'creature' and ('Rozumne' = any(e.traits) or 'Umysł roju' = any(e.traits));
$$;

-- ---------- the map ----------
create or replace function random_land_biome()
returns text language sql volatile as $$
  select case
    when x < 0.30 then 'trawa'
    when x < 0.50 then 'puszcza'
    when x < 0.65 then 'wzgorza'
    when x < 0.77 then 'gory'
    when x < 0.87 then 'dzungla'
    when x < 0.95 then 'pustynia'
    when x < 0.98 then 'sawanna'
    else 'bagno' end
  from (select random() as x) t;
$$;

-- a few emoji scattered on forests, jungles and mountains; positions in units of the hex radius
create or replace function hex_decor(p_biome text)
returns jsonb language plpgsql volatile as $$
declare
  pool text[];
  n int;
  acc jsonb := '[]'::jsonb;
begin
  pool := case p_biome
    when 'puszcza' then array['🌲', '🌲', '🎄', '🌳', '🪾']
    when 'dzungla' then array['🌴', '🌴', '🌳', '🪾']
    when 'gory' then array['⛰️', '🗻', '🏔️']
    else null end;
  if pool is null then return acc; end if;
  n := 2 + floor(random() * 2)::int;
  for i in 1..n loop
    acc := acc || jsonb_build_array(jsonb_build_object(
      'e', pool[1 + floor(random() * array_length(pool, 1))::int],
      'x', round((random() * 0.9 - 0.45)::numeric, 2),
      'y', round((random() * 0.6 - 0.3)::numeric, 2)));
  end loop;
  return acc;
end $$;

create or replace function generate_map(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b text;
begin
  delete from hexes where game_id = p_game_id;
  for q in -5..5 loop
    for r in -5..5 loop
      if hex_in_map(q, r) then
        if hex_distance(0, 0, q, r) >= 4 and random() < 0.8 then b := 'woda'; else b := random_land_biome(); end if;
        insert into hexes (game_id, q, r, biome, decor) values (p_game_id, q, r, b, hex_decor(b));
      end if;
    end loop;
  end loop;
end $$;

create or replace function hex_free_slot(p_game_id uuid, p_q int, p_r int)
returns int language sql stable as $$
  select s::int from generate_series(0, 2) s
  where not exists (select 1 from hex_occupants o where o.game_id = p_game_id and o.q = p_q and o.r = p_r and o.slot = s)
  order by s limit 1;
$$;

-- ---------- cities and their followers ----------
create or replace function city_dots(p_city uuid)
returns int language sql stable as $$
  select coalesce(sum(dots), 0)::int from city_followers where city_id = p_city;
$$;

create or replace function player_dots(p_city uuid, p_player uuid)
returns int language sql stable as $$
  select coalesce((select dots from city_followers where city_id = p_city and player_id = p_player), 0);
$$;

-- adds up to n dots for the god; a city holds ten at most; returns how many were added
create or replace function city_add_dots(p_city uuid, p_player uuid, n int)
returns int language plpgsql as $$
declare
  room int;
  added int;
  gid uuid;
begin
  if n <= 0 or p_player is null then return 0; end if;
  room := greatest(0, 10 - city_dots(p_city));
  added := least(n, room);
  if added = 0 then return 0; end if;
  select game_id into gid from entities where id = p_city;
  insert into city_followers (game_id, city_id, player_id, dots) values (gid, p_city, p_player, added)
  on conflict (city_id, player_id) do update set dots = city_followers.dots + excluded.dots;
  return added;
end $$;

create or replace function city_remove_dots(p_city uuid, p_player uuid, n int)
returns int language plpgsql as $$
declare
  cur int;
  removed int;
begin
  if n <= 0 then return 0; end if;
  select dots into cur from city_followers where city_id = p_city and player_id = p_player;
  if cur is null then return 0; end if;
  removed := least(n, cur);
  if removed = cur then
    delete from city_followers where city_id = p_city and player_id = p_player;
  else
    update city_followers set dots = dots - removed where city_id = p_city and player_id = p_player;
  end if;
  return removed;
end $$;

-- takes one dot at random (every dot equally likely); returns the god who lost it
create or replace function city_remove_random_dot(p_city uuid)
returns uuid language plpgsql as $$
declare
  total int := city_dots(p_city);
  k int;
  acc int := 0;
  rec record;
  pid uuid;
begin
  if total = 0 then return null; end if;
  k := 1 + floor(random() * total)::int;
  for rec in select player_id, dots from city_followers where city_id = p_city order by player_id loop
    acc := acc + rec.dots;
    if acc >= k then pid := rec.player_id; exit; end if;
  end loop;
  perform city_remove_dots(p_city, pid, 1);
  return pid;
end $$;

-- the god with the most dots; a tie is settled by chance
create or replace function city_majority(p_city uuid)
returns uuid language sql volatile as $$
  select player_id from city_followers where city_id = p_city order by dots desc, random() limit 1;
$$;

-- a city without a single dot is wiped off the map; the verse is composed in the client from the outcome
create or replace function destroy_city_if_empty(p_city uuid, p_round int, p_era smallint)
returns boolean language plpgsql as $$
declare
  e entities;
  c cities;
begin
  if city_dots(p_city) > 0 then return false; end if;
  select * into e from entities where id = p_city;
  select * into c from cities where entity_id = p_city;
  if e.id is null or c.entity_id is null then return false; end if;
  update entities set status = 'destroyed' where id = p_city;
  delete from cities where entity_id = p_city;
  insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, outcome, summary)
  values (e.game_id, p_round, p_era, null, 'city_destroyed', p_city,
          jsonb_build_object('name', e.name, 'q', c.q, 'r', c.r), '');
  return true;
end $$;

create or replace function assert_no_contest(p_game_id uuid)
returns void language plpgsql stable as $$
begin
  if exists (select 1 from contests where game_id = p_game_id and status = 'pending') then
    raise exception 'Trwa starcie. Najpierw musi odpowiedzieć broniące się bóstwo.';
  end if;
end $$;

-- ---------- turn: frozen while a contest waits for its answer ----------
create or replace function recompute_turn(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
  next_id uuid;
begin
  if exists (select 1 from contests where game_id = p_game_id and status = 'pending') then return; end if;
  select * into g from games where id = p_game_id for update;
  if g.phase <> 'gods' then return; end if;

  select p.id into next_id
  from players p
  where p.game_id = p_game_id and not p.is_resting and p.logos > 0
  order by p.logos desc,
           (case when p.id = g.current_turn_player_id then 0 else 1 end),
           p.seat_order asc
  limit 1;

  if next_id is null then
    update games set phase = 'chaos', current_turn_player_id = null where id = p_game_id;
  elsif next_id is distinct from g.current_turn_player_id then
    update games set current_turn_player_id = next_id where id = p_game_id;
  end if;
end $$;

-- ---------- costs: distance actions cost their distance, paid on top ----------
create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'           then (array[2, 5, 12])[p_era]
    when 'catastrophe'          then 10
    when 'great_miracle'        then (array[15, 30, 50])[p_era]
    when 'create_creature'      then (array[10, 3, 12])[p_era]
    when 'create_sapient'       then (array[15, 4, 18])[p_era]
    when 'change_creature'      then (array[5, 1, 6])[p_era]
    when 'migrate'              then 0
    when 'create_civilization'  then (array[22, 12, 6])[p_era]
    when 'develop_civilization' then (array[12, 8, 4])[p_era]
    when 'exodus'               then 0
    when 'convert'              then (array[6, 4, 3])[p_era]
    when 'holy_war'             then 0
    when 'create_avatar'        then (array[10, 12, 15])[p_era]
    when 'command_avatar'       then 2
    when 'resurrect_avatar'     then (array[12, 15, 25])[p_era]
    else null
  end;
$$;

-- ---------- start: the map is drawn, nobody has a Word ----------
create or replace function start_game(p_game_id uuid, p_prologue jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
  line jsonb;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może rozpocząć grę.' using errcode = '42501'; end if;
  if g.status not in ('lobby', 'palette', 'creation') then raise exception 'Gra już trwa.'; end if;
  update games
     set status = 'playing', era = 1, round_number = 1, era_started_round = 1,
         phase = 'rolling', current_turn_player_id = null
   where id = p_game_id;
  update players set logos = 0, has_rolled = false, is_resting = false,
                     low_logos_streak = 0, avatar_action_used = false
   where game_id = p_game_id;
  perform generate_map(p_game_id);
  for line in select * from jsonb_array_elements(coalesce(p_prologue, '[]'::jsonb)) loop
    if length(trim(coalesce(line->>'text', ''))) > 0 then
      insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
      values (p_game_id, 0, 1, null, 'prologue', trim(line->>'text'));
    end if;
  end loop;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, 1, 1, null, 'game_start', 'Zaczyna się Pierwsza Era. Bóstwa nie mają jeszcze ani jednego Słowa i sięgają po kości.');
end $$;

-- ---------- logos roll: no religions any more ----------
create or replace function roll_logos(p_game_id uuid)
returns logos_rolls language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d1 smallint := roll_d6();
  d2 smallint := roll_d6();
  total int;
  r logos_rolls;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'rolling' then raise exception 'To nie jest czas Rzutu Logos.'; end if;
  if me.has_rolled then raise exception 'Już rzuciłeś w tej rundzie.'; end if;

  total := d1 + d2 + me.low_logos_streak;
  update players set logos = logos + total, has_rolled = true where id = me.id;

  insert into logos_rolls (game_id, round_number, player_id, die1, die2, bonus_streak, bonus_orthodoxy, total)
  values (p_game_id, g.round_number, me.id, d1, d2, me.low_logos_streak, 0, total)
  returning * into r;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'logos_roll', total,
          jsonb_build_object('d1', d1, 'd2', d2, 'bonus_streak', me.low_logos_streak, 'bonus_orthodoxy', 0, 'total', total),
          format('%s budzi się i śni nowe Słowa. Kości mówią: %s i %s%s. Nowych Słów jest %s.',
                 god_name_of(me), d1, d2,
                 case when me.low_logos_streak > 0 then format(', skromność dodaje %s', me.low_logos_streak) else '' end,
                 total));

  if not exists (select 1 from players where game_id = p_game_id and not has_rolled) then
    update games set phase = 'gods' where id = p_game_id;
    perform recompute_turn(p_game_id);
  end if;
  return r;
end $$;

-- ---------- rest, tribute, transfer: not while a contest waits ----------
create or replace function rest(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  perform assert_no_contest(p_game_id);
  if me.is_resting then return; end if;
  update players set is_resting = true where id = me.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'rest',
          format('%s odpoczywa. Zachowuje swoje Słowa i milczy do końca rundy.', god_name_of(me)));
  perform recompute_turn(p_game_id);
end $$;

create or replace function adjust_logos(p_game_id uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  new_logos int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  perform assert_no_contest(p_game_id);
  if p_delta = 0 or abs(p_delta) > 7 then raise exception 'Zmiana Logos musi mieścić się w zakresie od -7 do +7.'; end if;
  new_logos := greatest(0, me.logos + p_delta);
  update players set logos = new_logos where id = me.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, summary)
  values (p_game_id, g.round_number, g.era, me.id, case when p_delta > 0 then 'followers_gain' else 'followers_loss' end,
          new_logos - me.logos, coalesce(p_reason, ''));
  perform recompute_turn(p_game_id);
end $$;

create or replace function transfer_logos(p_game_id uuid, p_to_player_id uuid, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  target players;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' then raise exception 'Gra nie trwa.'; end if;
  perform assert_no_contest(p_game_id);
  if p_amount <= 0 then raise exception 'Kwota musi być dodatnia.'; end if;
  if p_amount > me.logos then raise exception 'Nie masz tyle Logos.'; end if;
  select * into target from players where id = p_to_player_id and game_id = p_game_id;
  if target.id is null or target.id = me.id then raise exception 'Nieprawidłowy odbiorca.'; end if;
  update players set logos = logos - p_amount where id = me.id;
  update players set logos = logos + p_amount where id = target.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'transfer', -p_amount, god_name_of(target));
  perform recompute_turn(p_game_id);
end $$;

-- ---------- actions on the map ----------
-- Payloads (all keys optional unless the branch needs them):
--   shape_land           {biome, hexes:[{q,r}]}             up to three fields, each touching an earlier one
--   catastrophe          {type, q, r}                       d6 + Gniew damage, at least 1, spread at random
--   great_miracle        {summary}
--   create_creature,     {entity:{name,description,traits,co_god_ids}, emoji, q, r, slot}
--   create_sapient
--   change_creature      {occupant_id, entity:{name,description,traits}, emoji}   that one field's kind becomes a variant
--   migrate              {entity_id, from:{q,r}, to:{q,r}}  the species spreads; cost = distance
--   create_civilization  {entity:{name,description,traits,specialties,flaws,co_god_ids}, q, r, species_id}
--   develop_civilization {city_id, attr: grace|wisdom, gift}   2d6 + attribute: 10+ two dots, 7..9 one
--   exodus               {city_id, dots, species_id, to:{q,r}, name, description}   cost = distance
--   create_avatar        {entity:{name,description,conditions,co_god_ids}, emoji, q, r, slot}
--   command_avatar       {avatar_id, summary, to:{q,r}}      cost 2, plus 1 per field moved (up to 3)
--   resurrect_avatar     {entity:{op:'update', id, description, conditions}, q, r, slot}
create or replace function perform_action(p_game_id uuid, p_action_key text, p_payload jsonb default '{}'::jsonb)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  cost int;
  free_avatar boolean := coalesce((p_payload->>'use_avatar_action')::boolean, false);
  ent jsonb := p_payload->'entity';
  ent_id uuid;
  log_row actions_log;
  gid uuid;
  av entities;
  n_cond int;
  outcome jsonb := '{}'::jsonb;
  summary text := coalesce(p_payload->>'summary', '');
  -- map work
  hq int; hr int; hslot int; hx hexes; dist int; emo text;
  tq int; tr int;
  occ hex_occupants; src entities; city entities; cty cities;
  qs int[] := '{}'; rs int[] := '{}'; item jsonb; ok boolean; hexes_out jsonb := '[]'::jsonb;
  d6 int; dmg int; hits jsonb := '[]'::jsonb; n_dots int; creatures uuid[]; av_occ hex_occupants; n_targets int; pick int; pid uuid; victim entities;
  city_gone boolean := false; wasted int := 0;
  d1 int; d2 int; total int; tier text; gained int; added int; attr text; score int;
  n int; moved int; new_city boolean := false;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);

  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;

  if free_avatar then
    if me.avatar_action_used then raise exception 'Darmowa akcja awatara już wykorzystana w tej rundzie.'; end if;
    select e.* into av
    from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active'
      and (nullif(p_payload->>'avatar_id', '') is null or e.id = (p_payload->>'avatar_id')::uuid)
    order by e.created_at limit 1;
    if av.id is null then raise exception 'Nie masz żywego awatara.'; end if;
    if p_action_key in ('create_creature', 'create_sapient') and exists (
      select 1 from actions_log
      where game_id = p_game_id and player_id = me.id and era = g.era and is_avatar_free_action
        and action_key in ('create_creature', 'create_sapient')
    ) then
      raise exception 'Awatar może stworzyć istotę tylko raz na Erę.';
    end if;
  end if;

  -- ----- validation and the distance part of the cost -----
  hq := nullif(p_payload->>'q', '')::int;
  hr := nullif(p_payload->>'r', '')::int;
  emo := nullif(trim(coalesce(p_payload->>'emoji', '')), '');

  if p_action_key = 'shape_land' then
    if (p_payload->>'biome') is null or not exists (select 1 from unnest(array['woda','gory','puszcza','dzungla','trawa','pustynia','tundra','bagno','sawanna','wzgorza','zima']) b where b = p_payload->>'biome') then
      raise exception 'Wybierz biom.';
    end if;
    n := coalesce(jsonb_array_length(p_payload->'hexes'), 0);
    if n < 1 or n > 3 then raise exception 'Wybierz od jednego do trzech heksów.'; end if;
    for item in select * from jsonb_array_elements(p_payload->'hexes') loop
      tq := (item->>'q')::int; tr := (item->>'r')::int;
      if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
      if array_length(qs, 1) is not null then
        ok := false;
        for i in 1..array_length(qs, 1) loop
          if hex_distance(qs[i], rs[i], tq, tr) = 1 then ok := true; end if;
          if qs[i] = tq and rs[i] = tr then raise exception 'Ten sam heks wybrany dwa razy.'; end if;
        end loop;
        if not ok then raise exception 'Heksy muszą ze sobą sąsiadować.'; end if;
      end if;
      if hex_blocked(p_payload->>'biome') and (
        exists (select 1 from cities c where c.game_id = p_game_id and c.q = tq and c.r = tr)
        or exists (select 1 from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = tq and o.r = tr and e.kind = 'avatar')
      ) then
        raise exception 'Nie da się zatopić miasta ani awatara.';
      end if;
      qs := qs || tq; rs := rs || tr;
    end loop;

  elsif p_action_key = 'catastrophe' then
    if nullif(trim(coalesce(p_payload->>'type', '')), '') is null then raise exception 'Wybierz rodzaj kataklizmu.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;

  elsif p_action_key in ('create_creature', 'create_sapient', 'create_avatar') then
    if emo is null then raise exception 'Wybierz emotikonę.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if p_action_key = 'create_avatar' and hex_blocked(hx.biome) then raise exception 'Awatar nie stanie na wodzie ani w górach.'; end if;
    hslot := coalesce(nullif(p_payload->>'slot', '')::int, hex_free_slot(p_game_id, hq, hr));
    if hslot is null then raise exception 'Na tym heksie nie ma już miejsca.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = hq and r = hr and slot = hslot) then raise exception 'To miejsce jest zajęte.'; end if;
    if p_action_key = 'create_avatar' then
      n_cond := coalesce(jsonb_array_length(ent->'conditions'), 0);
      if n_cond < 1 or n_cond > 3 then raise exception 'Awatar potrzebuje od 1 do 3 uwarunkowań.'; end if;
    end if;

  elsif p_action_key = 'change_creature' then
    if emo is null then raise exception 'Wybierz emotikonę dla odmiany.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż istotę na mapie.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'To nie jest istota.'; end if;

  elsif p_action_key = 'migrate' then
    select * into occ from hex_occupants
    where game_id = p_game_id and entity_id = nullif(p_payload->>'entity_id', '')::uuid
      and q = (p_payload->'from'->>'q')::int and r = (p_payload->'from'->>'r')::int;
    if occ.id is null then raise exception 'Na tym heksie nie ma tej istoty.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'Migrują tylko istoty.'; end if;
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    dist := hex_distance(occ.q, occ.r, tq, tr);
    if dist < 1 then raise exception 'Wskaż inny heks.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) then raise exception 'Ta istota już tam żyje.'; end if;
    hslot := hex_free_slot(p_game_id, tq, tr);
    if hslot is null then raise exception 'Na tym heksie nie ma już miejsca.'; end if;
    cost := cost + dist;

  elsif p_action_key = 'create_civilization' then
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nie powstanie miasto.'; end if;
    if exists (select 1 from cities where game_id = p_game_id and q = hq and r = hr) then raise exception 'Tu już stoi miasto.'; end if;
    select e.* into src from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = hq and o.r = hr and e.id = nullif(p_payload->>'species_id', '')::uuid;
    if src.id is null or not is_sapient(src) then raise exception 'Cywilizację zakłada istota rozumna żyjąca na tym heksie.'; end if;

  elsif p_action_key = 'develop_civilization' then
    select * into city from entities where id = nullif(p_payload->>'city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    if city.id is null or not exists (select 1 from cities where entity_id = city.id) then raise exception 'Wskaż miasto na mapie.'; end if;
    attr := p_payload->>'attr';
    if attr not in ('grace', 'wisdom') then raise exception 'Rozwój wspiera Łaska albo Mądrość.'; end if;
    if nullif(trim(coalesce(p_payload->>'gift', '')), '') is null then raise exception 'Napisz, co ofiarowujesz wyznawcom.'; end if;

  elsif p_action_key = 'exodus' then
    select * into city from entities where id = nullif(p_payload->>'city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    select * into cty from cities where entity_id = city.id;
    if city.id is null or cty.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
    n := coalesce(nullif(p_payload->>'dots', '')::int, 0);
    if n < 1 or n > player_dots(city.id, me.id) then raise exception 'Tylu wyznawców tam nie masz.'; end if;
    select e.* into src from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = cty.q and o.r = cty.r and e.id = nullif(p_payload->>'species_id', '')::uuid;
    if src.id is null or not is_sapient(src) then raise exception 'Wybierz istotę rozumną z tego miasta.'; end if;
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nie powstanie miasto.'; end if;
    dist := hex_distance(cty.q, cty.r, tq, tr);
    if dist < 1 then raise exception 'Wskaż inny heks.'; end if;
    new_city := not exists (select 1 from cities where game_id = p_game_id and q = tq and r = tr);
    if not exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) and hex_free_slot(p_game_id, tq, tr) is null then
      raise exception 'Na tym heksie nie ma miejsca dla tej istoty.';
    end if;
    if new_city and nullif(trim(coalesce(p_payload->>'name', '')), '') is null then raise exception 'Nazwij nowe miasto.'; end if;
    cost := cost + dist;

  elsif p_action_key = 'command_avatar' then
    select e.* into src from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'avatar_id', '')::uuid;
    if src.id is null then raise exception 'Wskaż żywego awatara.'; end if;
    if p_payload ? 'to' and p_payload->'to' is not null and p_payload->'to' <> 'null'::jsonb then
      select * into occ from hex_occupants where game_id = p_game_id and entity_id = src.id;
      if occ.id is null then raise exception 'Ten awatar nie stoi na mapie.'; end if;
      tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
      if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
      dist := hex_distance(occ.q, occ.r, tq, tr);
      if dist < 1 or dist > 3 then raise exception 'Awatar przejdzie od jednego do trzech heksów.'; end if;
      select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
      if hex_blocked(hx.biome) then raise exception 'Awatar nie stanie na wodzie ani w górach.'; end if;
      hslot := hex_free_slot(p_game_id, tq, tr);
      if hslot is null then raise exception 'Na tym heksie nie ma już miejsca.'; end if;
      cost := cost + dist;
    else
      dist := 0;
    end if;

  elsif p_action_key = 'resurrect_avatar' then
    select * into src from entities where id = nullif(ent->>'id', '')::uuid and game_id = p_game_id and kind = 'avatar';
    if src.id is null then raise exception 'Nie ma takiego awatara.'; end if;
    if src.status = 'active' then raise exception 'Ten awatar żyje.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hex_blocked(hx.biome) then raise exception 'Awatar nie stanie na wodzie ani w górach.'; end if;
    hslot := coalesce(nullif(p_payload->>'slot', '')::int, hex_free_slot(p_game_id, hq, hr));
    if hslot is null then raise exception 'Na tym heksie nie ma już miejsca.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = hq and r = hr and slot = hslot) then raise exception 'To miejsce jest zajęte.'; end if;
  end if;

  if free_avatar then
    cost := 0;
    update players set avatar_action_used = true where id = me.id;
  end if;
  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;

  -- ----- effects -----
  if p_action_key = 'shape_land' then
    for i in 1..array_length(qs, 1) loop
      select biome into tier from hexes where game_id = p_game_id and q = qs[i] and r = rs[i];
      update hexes set biome = p_payload->>'biome', decor = hex_decor(p_payload->>'biome') where game_id = p_game_id and q = qs[i] and r = rs[i];
      hexes_out := hexes_out || jsonb_build_array(jsonb_build_object('q', qs[i], 'r', rs[i], 'from', tier));
    end loop;
    outcome := jsonb_build_object('biome', p_payload->>'biome', 'hexes', hexes_out);

  elsif p_action_key = 'catastrophe' then
    d6 := roll_d6();
    score := attr_score(me, 'wrath');
    dmg := greatest(1, d6 + score);
    select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = hq and c.r = hr;
    for i in 1..dmg loop
      n_dots := case when city.id is not null and not city_gone then city_dots(city.id) else 0 end;
      select coalesce(array_agg(o.entity_id order by o.slot), '{}') into creatures
      from hex_occupants o join entities e on e.id = o.entity_id
      where o.game_id = p_game_id and o.q = hq and o.r = hr and e.kind = 'creature'
        and (not is_sapient(e) or city.id is null or city_gone);
      select o.* into av_occ from hex_occupants o join entities e on e.id = o.entity_id
      where o.game_id = p_game_id and o.q = hq and o.r = hr and e.kind = 'avatar' and e.status = 'active' and coalesce(e.hp, 0) > 0 limit 1;
      n_targets := n_dots + coalesce(array_length(creatures, 1), 0) + (case when av_occ.id is not null then 1 else 0 end);
      if n_targets = 0 then wasted := dmg - i + 1; exit; end if;
      pick := 1 + floor(random() * n_targets)::int;
      if pick <= n_dots then
        pid := city_remove_random_dot(city.id);
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'dot', 'player_id', pid, 'city_id', city.id));
        if destroy_city_if_empty(city.id, g.round_number, g.era) then city_gone := true; end if;
      elsif pick <= n_dots + coalesce(array_length(creatures, 1), 0) then
        select * into victim from entities where id = creatures[pick - n_dots];
        delete from hex_occupants where game_id = p_game_id and q = hq and r = hr and entity_id = victim.id;
        ok := not exists (select 1 from hex_occupants where entity_id = victim.id);
        if ok then update entities set status = 'dead' where id = victim.id; end if;
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'creature', 'entity_id', victim.id, 'name', victim.name, 'emoji', victim.emoji, 'extinct', ok));
      else
        select * into victim from entities where id = av_occ.entity_id;
        update entities set hp = greatest(0, coalesce(hp, 0) - 1) where id = victim.id returning * into victim;
        if victim.hp = 0 then
          update entities set status = 'dead' where id = victim.id;
          delete from hex_occupants where id = av_occ.id;
          insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
          values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', victim.id, format('I zginął awatar %s.', victim.name));
        end if;
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'avatar', 'entity_id', victim.id, 'name', victim.name, 'hp', victim.hp));
      end if;
    end loop;
    outcome := jsonb_build_object('type', p_payload->>'type', 'q', hq, 'r', hr, 'd6', d6, 'wrath', score, 'damage', dmg,
                                  'hits', hits, 'city_id', city.id, 'city_name', city.name, 'city_destroyed', city_gone, 'wasted', wasted);
    ent_id := city.id;

  elsif p_action_key in ('create_creature', 'create_sapient', 'create_avatar') then
    insert into entities (game_id, kind, name, description, emoji, hp, traits, conditions, created_round, created_era, created_by_player_id)
    values (p_game_id, case when p_action_key = 'create_avatar' then 'avatar' else 'creature' end::entity_kind,
            coalesce(nullif(trim(ent->>'name'), ''), 'Bez imienia'), coalesce(ent->>'description', ''), emo,
            case when p_action_key = 'create_avatar' then 3 else null end,
            coalesce(array(select jsonb_array_elements_text(ent->'traits')), '{}'),
            coalesce(array(select jsonb_array_elements_text(ent->'conditions')), '{}'),
            g.round_number, g.era, me.id)
    returning id into ent_id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
    for gid in select (jsonb_array_elements_text(coalesce(ent->'co_god_ids', '[]'::jsonb)))::uuid loop
      if gid <> me.id and exists (select 1 from players where id = gid and game_id = p_game_id) then
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, gid, p_game_id, 'co_creator') on conflict do nothing;
      end if;
    end loop;
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, hq, hr, hslot, ent_id);
    outcome := jsonb_build_object('q', hq, 'r', hr, 'slot', hslot, 'emoji', emo, 'biome', hx.biome);

  elsif p_action_key = 'change_creature' then
    insert into entities (game_id, kind, name, description, emoji, traits, created_round, created_era, created_by_player_id)
    values (p_game_id, 'creature', coalesce(nullif(trim(ent->>'name'), ''), src.name), coalesce(ent->>'description', ''), emo,
            case when ent ? 'traits' then array(select jsonb_array_elements_text(ent->'traits')) else src.traits end,
            g.round_number, g.era, me.id)
    returning id into ent_id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
    insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'variant_of') on conflict do nothing;
    update hex_occupants set entity_id = ent_id where id = occ.id;
    outcome := jsonb_build_object('q', occ.q, 'r', occ.r, 'from_entity_id', src.id, 'from_name', src.name, 'emoji', emo);

  elsif p_action_key = 'migrate' then
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, hslot, src.id);
    ent_id := src.id;
    outcome := jsonb_build_object('from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'name', src.name, 'emoji', src.emoji);

  elsif p_action_key = 'create_civilization' then
    insert into entities (game_id, kind, name, description, traits, specialties, flaws, created_round, created_era, created_by_player_id)
    values (p_game_id, 'civilization', coalesce(nullif(trim(ent->>'name'), ''), 'Bez imienia'), coalesce(ent->>'description', ''),
            coalesce(array(select jsonb_array_elements_text(ent->'traits')), '{}'),
            coalesce(array(select jsonb_array_elements_text(ent->'specialties')), '{}'),
            coalesce(array(select jsonb_array_elements_text(ent->'flaws')), '{}'),
            g.round_number, g.era, me.id)
    returning id into ent_id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
    for gid in select (jsonb_array_elements_text(coalesce(ent->'co_god_ids', '[]'::jsonb)))::uuid loop
      if gid <> me.id and exists (select 1 from players where id = gid and game_id = p_game_id) then
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, gid, p_game_id, 'co_creator') on conflict do nothing;
      end if;
    end loop;
    insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'member_species') on conflict do nothing;
    insert into cities (entity_id, game_id, q, r) values (ent_id, p_game_id, hq, hr);
    perform city_add_dots(ent_id, me.id, 1);
    outcome := jsonb_build_object('q', hq, 'r', hr, 'species_id', src.id, 'species_name', src.name, 'biome', hx.biome);

  elsif p_action_key = 'develop_civilization' then
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, attr);
    total := d1 + d2 + score + (case when free_avatar then -2 else 0 end);
    tier := case when total >= 10 then 'strong' when total >= 7 then 'mixed' else 'weak' end;
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    added := city_add_dots(city.id, me.id, gained);
    insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
    values (p_game_id, city.id, me.id, trim(p_payload->>'gift'), gained > 0, added, g.round_number);
    ent_id := city.id;
    outcome := jsonb_build_object('city_id', city.id, 'city_name', city.name, 'd1', d1, 'd2', d2, 'attr', attr, 'score', score,
                                  'avatar', free_avatar, 'total', total, 'tier', tier, 'gained', gained, 'added', added,
                                  'wasted', gained - added, 'gift', trim(p_payload->>'gift'), 'level', city_dots(city.id));

  elsif p_action_key = 'exodus' then
    moved := city_remove_dots(city.id, me.id, n);
    if new_city then
      insert into entities (game_id, kind, name, description, traits, specialties, flaws, parent_civilization_id, created_round, created_era, created_by_player_id)
      values (p_game_id, 'civilization', trim(p_payload->>'name'), coalesce(p_payload->>'description', ''),
              city.traits, city.specialties, city.flaws, city.id, g.round_number, g.era, me.id)
      returning id into ent_id;
      insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
      insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'member_species') on conflict do nothing;
      insert into cities (entity_id, game_id, q, r) values (ent_id, p_game_id, tq, tr);
      insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
      select p_game_id, ent_id, player_id, text, accepted, 0, g.round_number from city_gifts where city_id = city.id and accepted order by created_at;
    else
      select entity_id into ent_id from cities where game_id = p_game_id and q = tq and r = tr;
    end if;
    added := city_add_dots(ent_id, me.id, moved);
    if not exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, hex_free_slot(p_game_id, tq, tr), src.id);
    end if;
    city_gone := destroy_city_if_empty(city.id, g.round_number, g.era);
    outcome := jsonb_build_object('from_city_id', city.id, 'from_name', city.name, 'to_city_id', ent_id,
                                  'to_name', (select name from entities where id = ent_id), 'new', new_city,
                                  'dots', moved, 'added', added, 'wasted', moved - added, 'distance', dist, 'q', tq, 'r', tr,
                                  'species_name', src.name, 'emoji', src.emoji, 'source_destroyed', city_gone);

  elsif p_action_key = 'command_avatar' then
    ent_id := src.id;
    if dist > 0 then
      update hex_occupants set q = tq, r = tr, slot = hslot where id = occ.id;
      outcome := jsonb_build_object('avatar_id', src.id, 'name', src.name, 'from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist);
    else
      outcome := jsonb_build_object('avatar_id', src.id, 'name', src.name, 'distance', 0);
    end if;

  elsif p_action_key = 'resurrect_avatar' then
    ent_id := src.id;
    update entities set
      status = 'active', hp = 3,
      description = coalesce(ent->>'description', description),
      conditions = case when ent ? 'conditions' then array(select jsonb_array_elements_text(ent->'conditions')) else conditions end
    where id = src.id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (src.id, me.id, p_game_id, 'co_creator') on conflict do nothing;
    delete from hex_occupants where entity_id = src.id;
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, hq, hr, hslot, src.id);
    outcome := jsonb_build_object('q', hq, 'r', hr, 'slot', hslot, 'name', src.name);
  end if;

  update players set logos = logos - cost where id = me.id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, free_avatar, outcome, summary)
  returning * into log_row;

  if free_avatar and p_action_key in ('great_miracle', 'resurrect_avatar') and av.id is distinct from ent_id then
    update entities set status = 'dead', hp = 0 where id = av.id;
    delete from hex_occupants where entity_id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', av.id,
            case p_action_key
              when 'great_miracle' then format('I spłonął awatar %s w Wielkim Cudzie, i nie było go więcej.', av.name)
              else format('I poświęcił się awatar %s, by tamten mógł powrócić.', av.name) end);
  end if;

  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- the verse is the player's: the owner of an action row may rewrite its summary
create or replace function edit_log_summary(p_log_id uuid, p_summary text)
returns void language plpgsql security definer set search_path = public as $$
declare
  lr actions_log;
  me players;
begin
  select * into lr from actions_log where id = p_log_id;
  if lr.id is null then raise exception 'Nie ma takiego wersetu.'; end if;
  me := require_player(lr.game_id);
  if lr.player_id is distinct from me.id then raise exception 'To nie twój werset.' using errcode = '42501'; end if;
  if action_cost(lr.action_key, 1::smallint) is null and lr.action_key not in ('convert', 'holy_war') then
    raise exception 'Ten werset pisze sama księga.';
  end if;
  update actions_log set summary = coalesce(trim(p_summary), '') where id = p_log_id;
end $$;

-- ---------- contests: Nawracanie and Święta Wojna wait for the defender ----------
create or replace function declare_contest(p_game_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb)
returns contests language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  def players;
  target entities;
  tcity cities;
  source entities;
  scity cities;
  army int := 0;
  cost int;
  attr text;
  mod int;
  d1 int := roll_d6();
  d2 int := roll_d6();
  c contests;
  log_row actions_log;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  if p_kind not in ('convert', 'holy_war') then raise exception 'Nieznane starcie.'; end if;

  select * into def from players where id = nullif(p_payload->>'defender_id', '')::uuid and game_id = p_game_id;
  if def.id is null or def.id = me.id then raise exception 'Wskaż inne bóstwo.'; end if;
  select * into target from entities
  where id = nullif(p_payload->>(case when p_kind = 'convert' then 'city_id' else 'target_city_id' end), '')::uuid
    and game_id = p_game_id and kind = 'civilization' and status = 'active';
  select * into tcity from cities where entity_id = target.id;
  if target.id is null or tcity.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
  if player_dots(target.id, def.id) = 0 then raise exception 'To bóstwo nie ma tam wyznawców.'; end if;

  if p_kind = 'convert' then
    attr := p_payload->>'attr';
    if attr not in ('majesty', 'whisper') then raise exception 'Nawracanie to Majestat albo Podszept.'; end if;
    cost := action_cost('convert', g.era);
    mod := attr_score(me, attr);
  else
    select * into source from entities where id = nullif(p_payload->>'source_city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    select * into scity from cities where entity_id = source.id;
    if source.id is null or scity.entity_id is null then raise exception 'Wskaż swoje miasto.'; end if;
    if source.id = target.id then raise exception 'Miasto nie wyruszy na siebie.'; end if;
    if player_dots(source.id, me.id) <= coalesce((select max(dots) from city_followers where city_id = source.id and player_id <> me.id), 0) then
      raise exception 'Armię wystawia miasto, w którym masz większość.';
    end if;
    army := coalesce(nullif(p_payload->>'army', '')::int, 0);
    if army < 1 or army > player_dots(source.id, me.id) - 1 then raise exception 'Armia to od 1 do liczby twoich wyznawców pomniejszonej o 1.'; end if;
    cost := hex_distance(scity.q, scity.r, tcity.q, tcity.r);
    attr := 'wrath';
    mod := attr_score(me, 'wrath') + army;
  end if;

  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
  update players set logos = logos - cost where id = me.id;
  if p_kind = 'holy_war' then perform city_remove_dots(source.id, me.id, army); end if;

  insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                        attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total)
  values (p_game_id, g.round_number, g.era, p_kind, me.id, def.id, target.id, source.id, nullif(army, 0), cost,
          attr, d1, d2, mod, d1 + d2 + mod)
  returning * into c;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, target.id,
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr),
          jsonb_build_object('kind', p_kind, 'contest_id', c.id, 'defender_id', def.id, 'target_city_id', target.id, 'target_name', target.name,
                             'source_city_id', source.id, 'source_name', source.name, 'army', nullif(army, 0), 'cost', cost),
          '')
  returning * into log_row;
  update contests set log_id = log_row.id where id = c.id;
  return c;
end $$;

create or replace function answer_contest(p_contest_id uuid, p_attr text)
returns contests language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
  att players;
  g games;
  target entities;
  d1 int := roll_d6();
  d2 int := roll_d6();
  mod int;
  def_dots int;
  diff int;
  removed int := 0;
  converted int := 0;
  lost int := 0;
  returned int := 0;
  att_lost int := 0;
  def_lost int := 0;
  k int;
  target_gone boolean := false;
  source_gone boolean := false;
  oc jsonb;
  log_row actions_log;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.defender_id then raise exception 'Odpowiada tylko broniące się bóstwo.' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'To starcie już rozstrzygnięto.'; end if;
  if c.kind = 'convert' and p_attr not in ('majesty', 'whisper') then raise exception 'Obrona to Majestat albo Podszept.'; end if;
  if p_attr not in ('wrath', 'majesty', 'grace', 'whisper', 'element', 'wisdom') then raise exception 'Nie ma takiego atrybutu.'; end if;
  select * into g from games where id = c.game_id for update;
  select * into att from players where id = c.attacker_id;
  select * into target from entities where id = c.target_city_id;

  def_dots := player_dots(c.target_city_id, me.id);
  mod := attr_score(me, p_attr) + (case when c.kind = 'holy_war' then def_dots else 0 end);
  diff := c.attacker_total - (d1 + d2 + mod);

  if c.kind = 'convert' then
    k := case when diff >= 3 then 2 when diff >= 1 then 1 else 0 end;
    converted := city_remove_dots(c.target_city_id, me.id, k);
    perform city_add_dots(c.target_city_id, c.attacker_id, converted);
    oc := jsonb_build_object('kind', 'convert', 'diff', diff, 'converted', converted);
  else
    if diff >= 3 then
      removed := city_remove_dots(c.target_city_id, me.id, c.army);
      converted := city_add_dots(c.target_city_id, c.attacker_id, ceil(removed / 2.0)::int);
      returned := c.army;
    elsif diff >= 1 then
      removed := city_remove_dots(c.target_city_id, me.id, c.army);
      converted := city_add_dots(c.target_city_id, c.attacker_id, ceil(removed / 2.0)::int);
      att_lost := ceil(c.army / 2.0)::int;
      returned := c.army - att_lost;
    elsif diff = 0 then
      def_lost := city_remove_dots(c.target_city_id, me.id, 1);
      att_lost := 1;
      returned := c.army - 1;
    elsif diff >= -2 then
      def_lost := city_remove_dots(c.target_city_id, me.id, 1);
      att_lost := c.army - 1;
      returned := 1;
    else
      att_lost := c.army;
      returned := 0;
    end if;
    if returned > 0 and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
      perform city_add_dots(c.source_city_id, c.attacker_id, returned);
    end if;
    source_gone := c.source_city_id is not null and destroy_city_if_empty(c.source_city_id, g.round_number, g.era);
    oc := jsonb_build_object('kind', 'holy_war', 'diff', diff, 'army', c.army, 'removed', removed, 'converted', converted,
                                  'defender_lost', removed + def_lost, 'attacker_lost', att_lost, 'returned', returned,
                                  'source_city_id', c.source_city_id, 'source_destroyed', source_gone);
  end if;
  target_gone := destroy_city_if_empty(c.target_city_id, g.round_number, g.era);
  oc := oc || jsonb_build_object('target_city_id', c.target_city_id, 'target_name', target.name, 'target_destroyed', target_gone,
                                           'attacker_id', c.attacker_id, 'defender_id', c.defender_id,
                                           'attacker_total', c.attacker_total, 'defender_total', d1 + d2 + mod, 'defender_dots', def_dots);

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (c.game_id, g.round_number, g.era, c.attacker_id, c.kind, 0, c.target_city_id,
          jsonb_build_object('att', jsonb_build_object('d1', c.attacker_d1, 'd2', c.attacker_d2, 'modifier', c.attacker_mod, 'total', c.attacker_total, 'attr', c.attacker_attr),
                             'def', jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', p_attr)),
          oc, '')
  returning * into log_row;

  update contests set
    defender_attr = p_attr, defender_d1 = d1, defender_d2 = d2, defender_mod = mod, defender_total = d1 + d2 + mod,
    status = 'resolved', outcome = oc, log_id = log_row.id, resolved_at = now()
  where id = c.id
  returning * into c;

  perform recompute_turn(c.game_id);
  return c;
end $$;

create or replace function commit_contest(p_contest_id uuid, p_summary text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.attacker_id then raise exception 'Werset dopisuje bóstwo, które zaczęło starcie.' using errcode = '42501'; end if;
  if c.status <> 'resolved' then raise exception 'To starcie nie czeka na werset.'; end if;
  if c.log_id is not null then update actions_log set summary = coalesce(trim(p_summary), '') where id = c.log_id; end if;
  update contests set status = 'committed' where id = c.id;
end $$;

create or replace function cancel_contest(p_contest_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
  g games;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.attacker_id then raise exception 'Starcie odwołuje bóstwo, które je zaczęło.' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'Tego starcia nie da się już odwołać.'; end if;
  select * into g from games where id = c.game_id;
  update players set logos = logos + c.cost where id = me.id;
  if c.kind = 'holy_war' and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
    perform city_add_dots(c.source_city_id, me.id, c.army);
  end if;
  update contests set status = 'cancelled', resolved_at = now() where id = c.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, outcome, summary)
  values (c.game_id, g.round_number, g.era, me.id, 'contest_cancelled', c.cost, c.target_city_id,
          jsonb_build_object('kind', c.kind, 'target_city_id', c.target_city_id), '');
  perform recompute_turn(c.game_id);
end $$;

-- ---------- end of Chaos: cities grow, the faithful reward their gods ----------
create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  notes text;
  rec record;
  grown jsonb := '[]'::jsonb;
  rewards jsonb := '[]'::jsonb;
  owner uuid;
  prize int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;

  for notes in
    select resolution_notes from chaos_draws
    where game_id = p_game_id and round_number = g.round_number and length(trim(resolution_notes)) > 0
    order by seq
  loop
    insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
    values (p_game_id, g.round_number, g.era, null, 'chaos_notes', trim(notes));
  end loop;

  -- every city grows by one dot, for the god who holds it (a tie is settled by chance)
  for rec in
    select c.entity_id, e.name from cities c join entities e on e.id = c.entity_id
    where c.game_id = p_game_id and e.status = 'active' order by e.created_at
  loop
    owner := city_majority(rec.entity_id);
    if owner is not null and city_add_dots(rec.entity_id, owner, 1) > 0 then
      grown := grown || jsonb_build_array(jsonb_build_object('city_id', rec.entity_id, 'name', rec.name, 'player_id', owner, 'level', city_dots(rec.entity_id)));
    end if;
  end loop;
  if jsonb_array_length(grown) > 0 then
    insert into actions_log (game_id, round_number, era, player_id, action_key, outcome, summary)
    values (p_game_id, g.round_number, g.era, null, 'cities_grow', grown, '');
  end if;

  update players set
    low_logos_streak = case when logos <= 5 then least(3, low_logos_streak + 1) else 0 end,
    has_rolled = false,
    is_resting = false,
    avatar_action_used = false
  where game_id = p_game_id;

  -- the most followed gods are paid: +3, +2, +1 (ties share the rank)
  for rec in
    select f.player_id, sum(f.dots)::int as total, dense_rank() over (order by sum(f.dots) desc) as rnk
    from city_followers f join cities c on c.entity_id = f.city_id
    where f.game_id = p_game_id group by f.player_id
  loop
    prize := case rec.rnk when 1 then 3 when 2 then 2 when 3 then 1 else 0 end;
    if prize > 0 then update players set logos = logos + prize where id = rec.player_id; end if;
    rewards := rewards || jsonb_build_array(jsonb_build_object('player_id', rec.player_id, 'total', rec.total, 'rank', rec.rnk, 'logos', prize));
  end loop;
  if jsonb_array_length(rewards) > 0 then
    insert into actions_log (game_id, round_number, era, player_id, action_key, outcome, summary)
    values (p_game_id, g.round_number, g.era, null, 'dots_reward', rewards, '');
  end if;

  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'round_end',
          format('I minęła runda %s. Bóstwa zapadają w sen, a świat toczy się dalej.', g.round_number));

  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null
  where id = p_game_id;
end $$;

-- ---------- grants ----------
do $$
declare fn text;
begin
  foreach fn in array array[
    'hex_distance(int, int, int, int)', 'hex_in_map(int, int)', 'hex_blocked(text)',
    'attr_opposite(text)', 'attr_name(text)', 'attr_score(players, text)', 'is_sapient(entities)',
    'random_land_biome()', 'hex_decor(text)', 'generate_map(uuid)', 'hex_free_slot(uuid, int, int)',
    'city_dots(uuid)', 'player_dots(uuid, uuid)', 'city_add_dots(uuid, uuid, int)', 'city_remove_dots(uuid, uuid, int)',
    'city_remove_random_dot(uuid)', 'city_majority(uuid)', 'destroy_city_if_empty(uuid, int, smallint)', 'assert_no_contest(uuid)',
    'recompute_turn(uuid)', 'action_cost(text, smallint)', 'start_game(uuid, jsonb)', 'roll_logos(uuid)',
    'rest(uuid)', 'adjust_logos(uuid, int, text)', 'transfer_logos(uuid, uuid, int)',
    'perform_action(uuid, text, jsonb)', 'edit_log_summary(uuid, text)',
    'declare_contest(uuid, text, jsonb)', 'answer_contest(uuid, text)', 'commit_contest(uuid, text)', 'cancel_contest(uuid)',
    'end_chaos_phase(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
