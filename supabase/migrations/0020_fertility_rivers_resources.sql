-- 0020: the land has fertility (żyzność), gods pour rivers from the mountains and bless fields with a
-- resource, creatures are herds (herbivores) or beasts (carnivores with a strength rolled on 2d6 + Gniew),
-- sapients without a city are tribes, the corner slots of a field have roles (herd top-left, beast or
-- tribe at the bottom, avatars in the lower corners, resource top-right), and cities may hold godless
-- groups (atheists). Functions replaced: action_cost, perform_action, answer_contest, city_dots,
-- city_remove_random_dot. New: hex_neighbours, hex_is_mountain, fertility_base, hex_has_river,
-- creature_role, hex_has_herbivore, hex_fertility, hex_slot_for_role, hex_slot_for, river_at,
-- river_validate_path, river_cut_at, continue_river, beast_strength, city_believers,
-- city_add_atheists, city_remove_atheists, city_remove_groups. Dropped: hex_free_slot.

-- ---------- schema ----------
alter table hexes add column if not exists resource text;
alter table hexes drop constraint if exists hexes_resource_check;
alter table hexes add constraint hexes_resource_check check (resource is null or resource in ('💎', '🌾', '🪵', '⚙️', '🍇', '🍋', '🌽', '🏺', '🪙', '🪨', '🥔'));

create table if not exists rivers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  path jsonb not null default '[]'::jsonb,
  mouth_kind text not null default 'none' check (mouth_kind in ('water', 'river', 'none')),
  mouth_q smallint,
  mouth_r smallint,
  into_river_id uuid references rivers (id) on delete set null,
  reroute_by uuid references players (id) on delete set null,
  created_round int not null default 0,
  created_by_player_id uuid references players (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rivers_game_idx on rivers (game_id);
alter table rivers enable row level security;
drop policy if exists "rivers readable" on rivers;
create policy "rivers readable" on rivers for select to authenticated using (is_game_member(game_id));
alter table rivers replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rivers') then
    alter publication supabase_realtime add table rivers;
  end if;
end $$;

-- slots by role: 0 herd (top-left), 1 beast or tribe (bottom), 2 and 3 avatars (lower corners)
alter table hex_occupants drop constraint if exists hex_occupants_slot_check;
alter table hex_occupants add constraint hex_occupants_slot_check check (slot between 0 and 3);

alter table entities add column if not exists diet text;
alter table entities drop constraint if exists entities_diet_check;
alter table entities add constraint entities_diet_check check (diet is null or diet in ('herbivore', 'carnivore'));
alter table entities add column if not exists strength smallint not null default 0;

alter table cities add column if not exists atheists int not null default 0 check (atheists >= 0);

-- ---------- geometry ----------
create or replace function hex_neighbours(p_q int, p_r int)
returns table (q int, r int) language sql immutable as $$
  select p_q + d.dq, p_r + d.dr
  from (values (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)) as d(dq, dr)
  where hex_in_map(p_q + d.dq, p_r + d.dr);
$$;

create or replace function hex_is_mountain(p_biome text)
returns boolean language sql immutable as $$
  select p_biome in ('gory', 'gory_pustynne', 'gory_sniezne');
$$;

-- ---------- fertility ----------
create or replace function fertility_base(p_biome text)
returns int language sql immutable as $$
  select case p_biome
    when 'trawa' then 2
    when 'puszcza' then 2
    when 'gory' then 1
    when 'dzungla' then 1
    when 'bagno' then 1
    when 'ziemia' then 0
    when 'pustynia' then 0
    when 'zima' then 0
    when 'gory_pustynne' then 0
    when 'gory_sniezne' then 0
    else null
  end;
$$;

create or replace function river_at(p_game_id uuid, p_q int, p_r int)
returns uuid language sql stable as $$
  select r.id from rivers r, jsonb_array_elements(r.path) n
  where r.game_id = p_game_id and (n->>'q')::int = p_q and (n->>'r')::int = p_r
  order by r.created_at limit 1;
$$;

create or replace function hex_has_river(p_game_id uuid, p_q int, p_r int)
returns boolean language sql stable as $$
  select river_at(p_game_id, p_q, p_r) is not null;
$$;

-- what a thing on the map is: a herd, a beast, a tribe or an avatar
create or replace function creature_role(e entities)
returns text language sql immutable as $$
  select case
    when e.kind = 'avatar' then 'avatar'
    when e.kind <> 'creature' then null
    when is_sapient(e) then 'tribe'
    when e.diet = 'carnivore' then 'beast'
    else 'herbivore'
  end;
$$;

create or replace function hex_has_herbivore(p_game_id uuid, p_q int, p_r int)
returns boolean language sql stable as $$
  select exists (
    select 1 from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = p_q and o.r = p_r and creature_role(e) = 'herbivore');
$$;

create or replace function hex_fertility(p_game_id uuid, p_q int, p_r int)
returns int language plpgsql stable as $$
declare
  hx hexes;
  f int;
begin
  select * into hx from hexes where game_id = p_game_id and q = p_q and r = p_r;
  if hx.biome is null or hx.biome = 'woda' then return null; end if;
  f := fertility_base(hx.biome);
  if exists (select 1 from hex_neighbours(p_q, p_r) n join hexes h on h.game_id = p_game_id and h.q = n.q and h.r = n.r where h.biome = 'woda') then
    f := f + 1;
  end if;
  if hex_has_river(p_game_id, p_q, p_r) then
    f := f + (case when hx.biome = 'pustynia' then 3 else 1 end);
  end if;
  if hex_has_herbivore(p_game_id, p_q, p_r) then f := f + 1; end if;
  if hx.resource is not null then f := f + 1; end if;
  return f;
end $$;

-- ---------- slots ----------
create or replace function hex_slot_for_role(p_game_id uuid, p_q int, p_r int, p_role text)
returns int language plpgsql stable as $$
declare
  s int;
begin
  if p_role = 'herbivore' then s := 0;
  elsif p_role in ('beast', 'tribe') then s := 1;
  elsif p_role = 'avatar' then
    if not exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and slot = 2) then return 2; end if;
    if not exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and slot = 3) then return 3; end if;
    return null;
  else
    return null;
  end if;
  if exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and slot = s) then return null; end if;
  return s;
end $$;

create or replace function hex_slot_for(p_game_id uuid, p_q int, p_r int, p_entity uuid)
returns int language plpgsql stable as $$
declare
  e entities;
begin
  select * into e from entities where id = p_entity;
  if e.id is null then return null; end if;
  if exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and entity_id = p_entity) then return null; end if;
  return hex_slot_for_role(p_game_id, p_q, p_r, creature_role(e));
end $$;

create or replace function slot_error(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'herbivore' then 'Na tym heksie żyje już stado.'
    when 'avatar' then 'Na tym heksie stoją już dwa awatary.'
    else 'Na tym heksie jest już bestia albo plemię.'
  end;
$$;

-- ---------- rivers ----------
-- walks the channel from p_start along p_nodes and says how it ends:
-- {"kind": "water", "mouth_q", "mouth_r"} or {"kind": "river", "into_river_id", "mouth_q", "mouth_r"}
create or replace function river_validate_path(p_game_id uuid, p_start jsonb, p_nodes jsonb, p_mouth jsonb, p_river uuid default null)
returns jsonb language plpgsql stable as $$
declare
  n int := coalesce(jsonb_array_length(p_nodes), 0);
  pq int := (p_start->>'q')::int;
  pr int := (p_start->>'r')::int;
  tq int; tr int;
  hx hexes;
  node jsonb;
  seen jsonb := jsonb_build_array(jsonb_build_object('q', pq, 'r', pr));
  other uuid;
begin
  if p_river is not null then
    select path into seen from rivers where id = p_river;
  end if;
  for i in 0..n - 1 loop
    node := p_nodes->i;
    tq := (node->>'q')::int; tr := (node->>'r')::int;
    if tq is null or tr is null or not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    if hex_distance(pq, pr, tq, tr) <> 1 then raise exception 'Rzeka płynie tylko na sąsiednie pole.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if hx.biome = 'woda' then raise exception 'Woda to ujście, nie koryto. Kliknij ją jako koniec rzeki.'; end if;
    if hex_is_mountain(hx.biome) then raise exception 'Rzeka nie płynie pod górę.'; end if;
    if seen @> jsonb_build_array(jsonb_build_object('q', tq, 'r', tr)) then raise exception 'Rzeka nie zawraca.'; end if;
    other := river_at(p_game_id, tq, tr);
    if other is not null and other is distinct from p_river then
      if i < n - 1 then raise exception 'Rzeka kończy się tam, gdzie wpada do innej rzeki.'; end if;
      if p_mouth is not null then raise exception 'Rzeka już wpadła do innej rzeki.'; end if;
      return jsonb_build_object('kind', 'river', 'into_river_id', other, 'mouth_q', tq, 'mouth_r', tr);
    end if;
    seen := seen || jsonb_build_array(jsonb_build_object('q', tq, 'r', tr));
    pq := tq; pr := tr;
  end loop;
  if p_mouth is null then raise exception 'Rzeka musi dopłynąć do wody albo do innej rzeki.'; end if;
  tq := (p_mouth->>'q')::int; tr := (p_mouth->>'r')::int;
  if tq is null or tr is null or not hex_in_map(tq, tr) then raise exception 'Ujście leży poza światem.'; end if;
  if hex_distance(pq, pr, tq, tr) <> 1 then raise exception 'Ujście musi sąsiadować z ostatnim polem rzeki.'; end if;
  select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
  if hx.biome <> 'woda' then raise exception 'Ujście musi być wodą.'; end if;
  return jsonb_build_object('kind', 'water', 'mouth_q', tq, 'mouth_r', tr);
end $$;

-- the first k nodes of a path
create or replace function river_path_head(p_path jsonb, k int)
returns jsonb language sql immutable as $$
  select coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(p_path) with ordinality as t(e, o) where o <= k), '[]'::jsonb);
$$;

-- a field with a river changes: water drowns the channel there (the field becomes the mouth), a mountain
-- cuts it (the god who raised it may lead the river on); returns what happened to each river
create or replace function river_cut_at(p_game_id uuid, p_q int, p_r int, p_new_biome text, p_player uuid)
returns jsonb language plpgsql as $$
declare
  rv record;
  k int;
  cuts jsonb := '[]'::jsonb;
  trib record;
begin
  for rv in
    select r.id, r.path, (t.o - 1)::int as idx from rivers r, jsonb_array_elements(r.path) with ordinality as t(e, o)
    where r.game_id = p_game_id and (t.e->>'q')::int = p_q and (t.e->>'r')::int = p_r
  loop
    k := rv.idx;
    if p_new_biome = 'woda' then
      if k = 0 then
        delete from rivers where id = rv.id;
        cuts := cuts || jsonb_build_array(jsonb_build_object('river_id', rv.id, 'kind', 'drowned'));
      else
        update rivers set path = river_path_head(path, k), mouth_kind = 'water', mouth_q = p_q, mouth_r = p_r, into_river_id = null, reroute_by = null where id = rv.id;
        cuts := cuts || jsonb_build_array(jsonb_build_object('river_id', rv.id, 'kind', 'water', 'q', p_q, 'r', p_r));
      end if;
    elsif hex_is_mountain(p_new_biome) and k > 0 then
      update rivers set path = river_path_head(path, k), mouth_kind = 'none', mouth_q = null, mouth_r = null, into_river_id = null, reroute_by = p_player where id = rv.id;
      cuts := cuts || jsonb_build_array(jsonb_build_object('river_id', rv.id, 'kind', 'mountain', 'q', p_q, 'r', p_r, 'from', rv.path->(k - 1)));
    end if;
  end loop;
  -- a water mouth that is water no more
  if p_new_biome <> 'woda' then
    for rv in select id from rivers where game_id = p_game_id and mouth_kind = 'water' and mouth_q = p_q and mouth_r = p_r loop
      update rivers set mouth_kind = 'none', mouth_q = null, mouth_r = null where id = rv.id;
      cuts := cuts || jsonb_build_array(jsonb_build_object('river_id', rv.id, 'kind', 'dry'));
    end loop;
  end if;
  -- a tributary whose confluence was cut away flows into nothing
  for trib in
    select t.id from rivers t join rivers m on m.id = t.into_river_id
    where t.game_id = p_game_id and t.mouth_kind = 'river'
      and not (m.path @> jsonb_build_array(jsonb_build_object('q', t.mouth_q, 'r', t.mouth_r)))
  loop
    update rivers set mouth_kind = 'none', mouth_q = null, mouth_r = null, into_river_id = null where id = trib.id;
    cuts := cuts || jsonb_build_array(jsonb_build_object('river_id', trib.id, 'kind', 'dry'));
  end loop;
  return cuts;
end $$;

-- ---------- beasts ----------
create or replace function beast_strength(p_total int)
returns int language sql immutable as $$
  select case when p_total <= 6 then -1 when p_total <= 8 then 0 when p_total <= 10 then 1 when p_total <= 12 then 2 else 3 end;
$$;

-- ---------- cities: believers and the godless ----------
create or replace function city_dots(p_city uuid)
returns int language sql stable as $$
  select coalesce((select sum(dots) from city_followers where city_id = p_city), 0)::int
       + coalesce((select atheists from cities where entity_id = p_city), 0);
$$;

create or replace function city_believers(p_city uuid)
returns int language sql stable as $$
  select coalesce(sum(dots), 0)::int from city_followers where city_id = p_city;
$$;

create or replace function city_add_atheists(p_city uuid, n int)
returns int language plpgsql as $$
declare
  room int;
  added int;
begin
  if n <= 0 then return 0; end if;
  room := greatest(0, 10 - city_dots(p_city));
  added := least(n, room);
  if added = 0 then return 0; end if;
  update cities set atheists = atheists + added where entity_id = p_city;
  return added;
end $$;

create or replace function city_remove_atheists(p_city uuid, n int)
returns int language plpgsql as $$
declare
  cur int;
  removed int;
begin
  if n <= 0 then return 0; end if;
  select atheists into cur from cities where entity_id = p_city;
  if cur is null or cur = 0 then return 0; end if;
  removed := least(n, cur);
  update cities set atheists = atheists - removed where entity_id = p_city;
  return removed;
end $$;

-- takes one group at random (every group equally likely, the godless too); returns the god who lost it
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
  acc := coalesce((select atheists from cities where entity_id = p_city), 0);
  if k <= acc then
    perform city_remove_atheists(p_city, 1);
    return null;
  end if;
  for rec in select player_id, dots from city_followers where city_id = p_city order by player_id loop
    acc := acc + rec.dots;
    if acc >= k then pid := rec.player_id; exit; end if;
  end loop;
  perform city_remove_dots(p_city, pid, 1);
  return pid;
end $$;

-- takes n groups: the godless first, then one by one at random; returns [{player_id|null, n}]
create or replace function city_remove_groups(p_city uuid, n int)
returns jsonb language plpgsql as $$
declare
  a int;
  pid uuid;
  acc jsonb := '[]'::jsonb;
  counts jsonb := '{}'::jsonb;
  key text;
  left_n int;
begin
  if n <= 0 then return acc; end if;
  a := city_remove_atheists(p_city, n);
  if a > 0 then acc := acc || jsonb_build_array(jsonb_build_object('player_id', null, 'n', a)); end if;
  left_n := n - a;
  while left_n > 0 and city_dots(p_city) > 0 loop
    pid := city_remove_random_dot(p_city);
    key := coalesce(pid::text, 'none');
    counts := counts || jsonb_build_object(key, coalesce((counts->>key)::int, 0) + 1);
    left_n := left_n - 1;
  end loop;
  for key in select jsonb_object_keys(counts) loop
    acc := acc || jsonb_build_array(jsonb_build_object('player_id', case when key = 'none' then null else key::uuid end, 'n', (counts->>key)::int));
  end loop;
  return acc;
end $$;

-- ---------- prices ----------
create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'           then (array[2, 5, 12])[p_era]
    when 'catastrophe'          then 10
    when 'great_miracle'        then (array[15, 30, 50])[p_era]
    when 'bless_land'           then (array[4, 7, 10])[p_era]
    when 'pour_river'           then (array[3, 8, 12])[p_era]
    when 'create_creature'      then (array[10, 3, 12])[p_era]
    when 'create_sapient'       then (array[15, 4, 18])[p_era]
    when 'change_creature'      then (array[5, 1, 6])[p_era]
    when 'migrate'              then (array[3, 1, 3])[p_era]
    when 'create_civilization'  then (array[22, 12, 6])[p_era]
    when 'develop_civilization' then (array[12, 8, 4])[p_era]
    when 'exodus'               then (array[12, 8, 4])[p_era]
    when 'convert'              then (array[6, 4, 3])[p_era]
    when 'holy_war'             then (array[8, 6, 4])[p_era]
    when 'create_avatar'        then (array[10, 12, 15])[p_era]
    when 'pilgrimage'           then 0
    when 'resurrect_avatar'     then (array[12, 15, 16])[p_era]
    when 'avatar_duel'          then (array[5, 4, 3])[p_era]
    when 'prophecy'             then (array[10, 5, 3])[p_era]
    else null
  end;
$$;

-- ---------- the words ----------
create or replace function perform_action(p_game_id uuid, p_action_key text, p_payload jsonb default '{}'::jsonb)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  cost int;
  via_id uuid := nullif(p_payload->>'via_avatar_id', '')::uuid;
  free_avatar boolean := false;
  via_occ hex_occupants;
  full_cost int;
  ent jsonb := p_payload->'entity';
  ent_id uuid;
  log_row actions_log;
  gid uuid;
  av entities;
  outcome jsonb := '{}'::jsonb;
  summary text := coalesce(p_payload->>'summary', '');
  roll_json jsonb := null;
  -- map work
  hq int; hr int; hslot int; hx hexes; dist int; emo text;
  tq int; tr int;
  occ hex_occupants; src entities; city entities; cty cities;
  qs int[] := '{}'; rs int[] := '{}'; item jsonb; ok boolean; hexes_out jsonb := '[]'::jsonb;
  d6 int; dmg int; hits jsonb := '[]'::jsonb; n_dots int; creatures uuid[]; av_occ hex_occupants; n_targets int; pick int; pid uuid; victim entities;
  city_gone boolean := false; wasted int := 0;
  d1 int; d2 int; total int; tier text; gained int; added int; attr text; score int;
  n int; moved int; new_city boolean := false;
  pmod int := 0;
  after text; alive int; gen int; souls int;
  role text; diet text; strength int := 0; conv int := 0;
  cuts jsonb := '[]'::jsonb; reroute jsonb := null; river_end jsonb; river_id uuid; mouth jsonb; path jsonb;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);

  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;

  -- through the avatar: half the price, the target within two fields of where it stands
  if via_id is not null then
    if p_action_key not in ('shape_land', 'catastrophe', 'great_miracle', 'bless_land', 'pour_river', 'create_creature', 'create_sapient', 'change_creature', 'migrate',
                            'create_civilization', 'develop_civilization', 'exodus') then
      raise exception 'Tego słowa awatar nie wypowie.';
    end if;
    select e.* into av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = via_id;
    if av.id is null then raise exception 'Nie masz takiego żywego awatara.'; end if;
    select * into via_occ from hex_occupants where game_id = p_game_id and entity_id = av.id;
    if via_occ.id is null then raise exception 'Ten awatar nie stoi na mapie.'; end if;
    free_avatar := true;
  end if;

  -- ----- validation and the distance part of the cost -----
  hq := nullif(p_payload->>'q', '')::int;
  hr := nullif(p_payload->>'r', '')::int;
  emo := nullif(trim(coalesce(p_payload->>'emoji', '')), '');

  if p_action_key = 'shape_land' then
    if (p_payload->>'biome') is null or not biome_known(p_payload->>'biome') then
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
      if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, tq, tr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;
      qs := qs || tq; rs := rs || tr;
    end loop;

  elsif p_action_key = 'catastrophe' then
    if nullif(trim(coalesce(p_payload->>'type', '')), '') is null then raise exception 'Wybierz rodzaj kataklizmu.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    after := nullif(trim(coalesce(p_payload->>'after', '')), '');
    if after is not null and after not in ('pustynia', 'ziemia', 'woda') then raise exception 'Po kataklizmie zostaje pustynia, ugór albo woda.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, hq, hr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

  elsif p_action_key = 'bless_land' then
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hx.biome = 'woda' then raise exception 'Wody nie da się pobłogosławić surowcem.'; end if;
    if hx.resource is not null then raise exception 'Ta ziemia jest już pobłogosławiona.'; end if;
    if nullif(trim(coalesce(p_payload->>'resource', '')), '') is null
       or (p_payload->>'resource') not in ('💎', '🌾', '🪵', '⚙️', '🍇', '🍋', '🌽', '🏺', '🪙', '🪨', '🥔') then
      raise exception 'Wybierz surowiec.';
    end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, hq, hr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

  elsif p_action_key = 'pour_river' then
    path := p_payload->'path';
    if path is null or jsonb_typeof(path) <> 'array' or jsonb_array_length(path) < 1 then raise exception 'Kliknij górę, z której wypływa rzeka.'; end if;
    hq := (path->0->>'q')::int; hr := (path->0->>'r')::int;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Źródło leży poza światem.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if not hex_is_mountain(hx.biome) then raise exception 'Rzeka wypływa tylko z góry.'; end if;
    if river_at(p_game_id, hq, hr) is not null then raise exception 'Z tej góry już płynie rzeka.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, hq, hr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;
    mouth := case when p_payload ? 'mouth' and jsonb_typeof(p_payload->'mouth') = 'object' then p_payload->'mouth' else null end;
    river_end := river_validate_path(p_game_id, path->0, river_path_tail(path), mouth);

  elsif p_action_key in ('create_creature', 'create_sapient', 'create_avatar') then
    if emo is null then raise exception 'Wybierz emotikonę.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if p_action_key = 'create_creature' then
      diet := coalesce(nullif(ent->>'diet', ''), 'herbivore');
      if diet not in ('herbivore', 'carnivore') then raise exception 'Wybierz, czy istota jest roślinożerna, czy bestią.'; end if;
      role := case when diet = 'carnivore' then 'beast' else 'herbivore' end;
      if hx.biome = 'woda' then raise exception 'Na wodzie nikt nie zamieszka.'; end if;
    else
      role := case when p_action_key = 'create_avatar' then 'avatar' else 'tribe' end;
      if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
    end if;
    hslot := hex_slot_for_role(p_game_id, hq, hr, role);
    if hslot is null then raise exception '%', slot_error(role); end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, hq, hr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

  elsif p_action_key = 'change_creature' then
    if emo is null then raise exception 'Wybierz emotikonę dla odmiany.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż istotę na mapie.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'To nie jest istota.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, occ.q, occ.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

  elsif p_action_key = 'migrate' then
    select * into occ from hex_occupants
    where game_id = p_game_id and entity_id = nullif(p_payload->>'entity_id', '')::uuid
      and q = (p_payload->'from'->>'q')::int and r = (p_payload->'from'->>'r')::int;
    if occ.id is null then raise exception 'Na tym heksie nie ma tej istoty.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'Migrują tylko istoty.'; end if;
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if is_sapient(src) then
      if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
    elsif hx.biome = 'woda' then
      raise exception 'Na wodzie nikt nie zamieszka.';
    end if;
    dist := hex_distance(occ.q, occ.r, tq, tr);
    if dist < 1 then raise exception 'Wskaż inny heks.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) then raise exception 'Ta istota już tam żyje.'; end if;
    hslot := hex_slot_for(p_game_id, tq, tr, src.id);
    if hslot is null then raise exception '%', slot_error(creature_role(src)); end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, tq, tr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;
    cost := cost + dist;

  elsif p_action_key = 'create_civilization' then
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nie powstanie miasto.'; end if;
    if exists (select 1 from cities where game_id = p_game_id and q = hq and r = hr) then raise exception 'Tu już stoi miasto.'; end if;
    select e.* into src from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = hq and o.r = hr and e.id = nullif(p_payload->>'species_id', '')::uuid;
    if src.id is null or not is_sapient(src) then raise exception 'Cywilizację zakłada istota rozumna żyjąca na tym heksie.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, hq, hr) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

  elsif p_action_key = 'develop_civilization' then
    select * into city from entities where id = nullif(p_payload->>'city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    if city.id is null or not exists (select 1 from cities where entity_id = city.id) then raise exception 'Wskaż miasto na mapie.'; end if;
    attr := p_payload->>'attr';
    if attr not in ('grace', 'wisdom') then raise exception 'Rozwój wspiera Łaska albo Mądrość.'; end if;
    if nullif(trim(coalesce(p_payload->>'gift', '')), '') is null then raise exception 'Napisz, co ofiarowujesz wyznawcom.'; end if;
    if via_occ.id is not null then
      select * into cty from cities where entity_id = city.id;
      if hex_distance(via_occ.q, via_occ.r, cty.q, cty.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;
    end if;

  elsif p_action_key = 'exodus' then
    select * into city from entities where id = nullif(p_payload->>'city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    select * into cty from cities where entity_id = city.id;
    if city.id is null or cty.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, cty.q, cty.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od miasta, które wyprowadza.'; end if;
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
    if not exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) and hex_slot_for(p_game_id, tq, tr, src.id) is null then
      raise exception 'Na tym heksie nie ma miejsca dla tej istoty.';
    end if;
    if new_city and nullif(trim(coalesce(p_payload->>'name', '')), '') is null then raise exception 'Nazwij nowe miasto.'; end if;
    cost := cost + dist;

  elsif p_action_key = 'pilgrimage' then
    select e.* into src from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'avatar_id', '')::uuid;
    if src.id is null then raise exception 'Wskaż żywego awatara.'; end if;
    select * into occ from hex_occupants where game_id = p_game_id and entity_id = src.id;
    if occ.id is null then raise exception 'Ten awatar nie stoi na mapie.'; end if;
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    dist := hex_distance(occ.q, occ.r, tq, tr);
    if dist < 1 then raise exception 'Wskaż inny heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if hex_blocked(hx.biome) then raise exception 'Awatar nie stanie na wodzie ani w górach.'; end if;
    hslot := hex_slot_for_role(p_game_id, tq, tr, 'avatar');
    if hslot is null then raise exception '%', slot_error('avatar'); end if;
    cost := cost + dist;

  elsif p_action_key = 'prophecy' then
    select e.* into src from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'avatar_id', '')::uuid;
    if src.id is null then raise exception 'Prorokuje tylko twój żywy awatar.'; end if;
    if nullif(trim(coalesce(p_payload->>'text', '')), '') is null then raise exception 'Napisz, co zapowiada prorok.'; end if;

  elsif p_action_key = 'resurrect_avatar' then
    select * into src from entities where id = nullif(ent->>'id', '')::uuid and game_id = p_game_id and kind = 'avatar';
    if src.id is null then raise exception 'Nie ma takiego awatara.'; end if;
    if src.status = 'active' then raise exception 'Ten awatar żyje.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hex_blocked(hx.biome) then raise exception 'Awatar nie stanie na wodzie ani w górach.'; end if;
    hslot := hex_slot_for_role(p_game_id, hq, hr, 'avatar');
    if hslot is null then raise exception '%', slot_error('avatar'); end if;
  end if;

  full_cost := cost;
  if free_avatar then cost := ceil(cost / 2.0)::int; end if;
  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;

  -- ----- effects -----
  if p_action_key = 'shape_land' then
    for i in 1..array_length(qs, 1) loop
      select biome into tier from hexes where game_id = p_game_id and q = qs[i] and r = rs[i];
      update hexes set biome = p_payload->>'biome', decor = hex_decor(p_payload->>'biome'),
        resource = case when p_payload->>'biome' = 'woda' then null else resource end
      where game_id = p_game_id and q = qs[i] and r = rs[i];
      hexes_out := hexes_out || jsonb_build_array(jsonb_build_object('q', qs[i], 'r', rs[i], 'from', tier));
      cuts := cuts || river_cut_at(p_game_id, qs[i], rs[i], p_payload->>'biome', me.id);
    end loop;
    select c into reroute from jsonb_array_elements(cuts) c where c->>'kind' = 'mountain' limit 1;
    outcome := jsonb_build_object('biome', p_payload->>'biome', 'hexes', hexes_out, 'rivers_cut', cuts,
                                  'reroute', case when reroute is null then null else jsonb_build_object('river_id', reroute->>'river_id', 'from', reroute->'from') end);

  elsif p_action_key = 'catastrophe' then
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, 'wrath');
    total := d1 + d2 + score + pmod;
    dmg := greatest(1, floor(total / 2.0)::int);
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
        perform collect_souls(city.id, pid, 1);
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'dot', 'player_id', pid, 'city_id', city.id));
        if destroy_city_if_empty(city.id, g.round_number, g.era) then city_gone := true; end if;
      elsif pick <= n_dots + coalesce(array_length(creatures, 1), 0) then
        select * into victim from entities where id = creatures[pick - n_dots];
        delete from hex_occupants where game_id = p_game_id and q = hq and r = hr and entity_id = victim.id;
        ok := not exists (select 1 from hex_occupants where entity_id = victim.id);
        if ok then update entities set status = 'dead' where id = victim.id; end if;
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'creature', 'entity_id', victim.id, 'name', victim.name, 'emoji', victim.emoji, 'extinct', ok));
      else
        perform wound_avatar(av_occ.entity_id, 1, me.id, g.round_number, g.era);
        select * into victim from entities where id = av_occ.entity_id;
        hits := hits || jsonb_build_array(jsonb_build_object('t', 'avatar', 'entity_id', victim.id, 'name', victim.name, 'hp', victim.hp, 'max_hp', victim.max_hp));
      end if;
    end loop;
    -- the land changes only when nothing is left standing on it
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    alive := (case when city.id is not null and not city_gone then 1 else 0 end)
           + (select count(*)::int from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = hq and o.r = hr and e.status = 'active');
    if after is not null and alive = 0 and hx.biome <> after then
      update hexes set biome = after, decor = hex_decor(after), resource = case when after = 'woda' then null else resource end where game_id = p_game_id and q = hq and r = hr;
      cuts := river_cut_at(p_game_id, hq, hr, after, null);
    else
      after := null;
    end if;
    outcome := jsonb_build_object('type', p_payload->>'type', 'q', hq, 'r', hr, 'd1', d1, 'd2', d2, 'wrath', score, 'prophecy', pmod, 'total', total, 'damage', dmg,
                                  'hits', hits, 'city_id', city.id, 'city_name', city.name, 'city_destroyed', city_gone, 'wasted', wasted,
                                  'biome_from', hx.biome, 'biome_after', after, 'rivers_cut', cuts);
    ent_id := city.id;

  elsif p_action_key = 'bless_land' then
    update hexes set resource = p_payload->>'resource' where game_id = p_game_id and q = hq and r = hr;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'resource', p_payload->>'resource', 'biome', hx.biome, 'fertility', hex_fertility(p_game_id, hq, hr));

  elsif p_action_key = 'pour_river' then
    insert into rivers (game_id, path, mouth_kind, mouth_q, mouth_r, into_river_id, created_round, created_by_player_id)
    values (p_game_id, path,
            river_end->>'kind', (river_end->>'mouth_q')::int, (river_end->>'mouth_r')::int, nullif(river_end->>'into_river_id', '')::uuid,
            g.round_number, me.id)
    returning id into river_id;
    outcome := jsonb_build_object('river_id', river_id, 'path', path, 'mouth_kind', river_end->>'kind',
                                  'mouth', jsonb_build_object('q', (river_end->>'mouth_q')::int, 'r', (river_end->>'mouth_r')::int),
                                  'length', jsonb_array_length(path) - 1, 'source_biome', hx.biome,
                                  'biomes', (select coalesce(jsonb_agg(h.biome order by t.o), '[]'::jsonb) from jsonb_array_elements(path) with ordinality as t(e, o)
                                             join hexes h on h.game_id = p_game_id and h.q = (t.e->>'q')::int and h.r = (t.e->>'r')::int));

  elsif p_action_key in ('create_creature', 'create_sapient', 'create_avatar') then
    -- every incarnation after a death returns one life stronger (2 at first, 12 at most)
    select least(12, coalesce(max(e.max_hp), 1) + 1) into gen from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and eg.role = 'creator' and e.kind = 'avatar' and e.status <> 'active';
    -- a beast's temper: 2d6 + Gniew
    if role = 'beast' then
      d1 := roll_d6(); d2 := roll_d6();
      score := attr_score(me, 'wrath');
      total := d1 + d2 + score;
      strength := beast_strength(total);
      roll_json := jsonb_build_object('d1', d1, 'd2', d2, 'modifier', score, 'total', total, 'attr', 'wrath');
    end if;
    insert into entities (game_id, kind, name, description, emoji, hp, max_hp, traits, conditions, diet, strength, created_round, created_era, created_by_player_id)
    values (p_game_id, case when p_action_key = 'create_avatar' then 'avatar' else 'creature' end::entity_kind,
            coalesce(nullif(trim(ent->>'name'), ''), 'Bez imienia'), coalesce(ent->>'description', ''), emo,
            case when p_action_key = 'create_avatar' then gen else null end,
            case when p_action_key = 'create_avatar' then gen else null end,
            coalesce(array(select jsonb_array_elements_text(ent->'traits')), '{}'),
            coalesce(array(select jsonb_array_elements_text(ent->'conditions')), '{}'),
            case when p_action_key = 'create_creature' then diet else null end, strength,
            g.round_number, g.era, me.id)
    returning id into ent_id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
    for gid in select (jsonb_array_elements_text(coalesce(ent->'co_god_ids', '[]'::jsonb)))::uuid loop
      if gid <> me.id and exists (select 1 from players where id = gid and game_id = p_game_id) then
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, gid, p_game_id, 'co_creator') on conflict do nothing;
      end if;
    end loop;
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, hq, hr, hslot, ent_id);
    outcome := jsonb_build_object('q', hq, 'r', hr, 'slot', hslot, 'emoji', emo, 'biome', hx.biome, 'max_hp', case when p_action_key = 'create_avatar' then gen else null end,
                                  'role', role, 'diet', case when p_action_key = 'create_creature' then diet else null end, 'strength', strength,
                                  'd1', d1, 'd2', d2, 'wrath', case when role = 'beast' then score else null end, 'total', total);

  elsif p_action_key = 'change_creature' then
    insert into entities (game_id, kind, name, description, emoji, traits, diet, strength, created_round, created_era, created_by_player_id)
    values (p_game_id, 'creature', coalesce(nullif(trim(ent->>'name'), ''), src.name), coalesce(ent->>'description', ''), emo,
            case when ent ? 'traits' then array(select jsonb_array_elements_text(ent->'traits')) else src.traits end,
            src.diet, src.strength,
            g.round_number, g.era, me.id)
    returning id into ent_id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
    insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'variant_of') on conflict do nothing;
    update hex_occupants set entity_id = ent_id where id = occ.id;
    outcome := jsonb_build_object('q', occ.q, 'r', occ.r, 'from_entity_id', src.id, 'from_name', src.name, 'emoji', emo, 'diet', src.diet, 'strength', src.strength);

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
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, attr);
    total := d1 + d2 + score + pmod;
    tier := case when total >= 10 then 'strong' when total >= 7 then 'mixed' else 'weak' end;
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    -- the godless hear the gift first, then the city grows
    conv := city_remove_atheists(city.id, gained);
    added := city_add_dots(city.id, me.id, gained);
    insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
    values (p_game_id, city.id, me.id, trim(p_payload->>'gift'), gained > 0, added, g.round_number);
    ent_id := city.id;
    outcome := jsonb_build_object('city_id', city.id, 'city_name', city.name, 'd1', d1, 'd2', d2, 'attr', attr, 'score', score, 'prophecy', pmod,
                                  'avatar', free_avatar, 'total', total, 'tier', tier, 'gained', gained, 'added', added, 'converted_atheists', conv,
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
      hslot := hex_slot_for(p_game_id, tq, tr, src.id);
      if hslot is not null then
        insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, hslot, src.id);
      end if;
    end if;
    city_gone := destroy_city_if_empty(city.id, g.round_number, g.era);
    -- the avatar walks with the people when there is room for it
    ok := false;
    if via_occ.id is not null and not (via_occ.q = tq and via_occ.r = tr) and hex_slot_for_role(p_game_id, tq, tr, 'avatar') is not null then
      update hex_occupants set q = tq, r = tr, slot = hex_slot_for_role(p_game_id, tq, tr, 'avatar') where id = via_occ.id;
      ok := true;
    end if;
    outcome := jsonb_build_object('from_city_id', city.id, 'from_name', city.name, 'to_city_id', ent_id,
                                  'to_name', (select name from entities where id = ent_id), 'new', new_city,
                                  'dots', moved, 'added', added, 'wasted', moved - added, 'distance', dist, 'q', tq, 'r', tr,
                                  'species_name', src.name, 'emoji', src.emoji, 'source_destroyed', city_gone,
                                  'avatar_moved', ok, 'avatar_name', av.name, 'avatar_emoji', av.emoji);

  elsif p_action_key = 'pilgrimage' then
    ent_id := src.id;
    update hex_occupants set q = tq, r = tr, slot = hslot where id = occ.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'name', src.name, 'emoji', src.emoji, 'from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'biome', hx.biome);

  elsif p_action_key = 'prophecy' then
    insert into prophecies (game_id, player_id, avatar_id, text, hold, created_round)
    values (p_game_id, me.id, src.id, trim(p_payload->>'text'), 1, g.round_number);
    ent_id := src.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'avatar_name', src.name, 'emoji', src.emoji, 'text', trim(p_payload->>'text'));

  elsif p_action_key = 'resurrect_avatar' then
    ent_id := src.id;
    gen := least(12, coalesce(src.max_hp, 2) + 1);
    update entities set
      status = 'active', hp = gen, max_hp = gen,
      description = coalesce(ent->>'description', description),
      conditions = case when ent ? 'conditions' then array(select jsonb_array_elements_text(ent->'conditions')) else conditions end
    where id = src.id;
    insert into entity_gods (entity_id, player_id, game_id, role) values (src.id, me.id, p_game_id, 'co_creator') on conflict do nothing;
    delete from hex_occupants where entity_id = src.id;
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, hq, hr, hslot, src.id);
    outcome := jsonb_build_object('q', hq, 'r', hr, 'slot', hslot, 'name', src.name, 'max_hp', gen);
  end if;

  update players set logos = logos - cost where id = me.id;

  if free_avatar then
    outcome := outcome || jsonb_build_object('via_avatar', jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji, 'full_cost', full_cost));
  end if;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, free_avatar, roll_json, outcome, summary)
  returning * into log_row;

  -- a Great Miracle burns the avatar that works it
  if free_avatar and p_action_key = 'great_miracle' then
    update entities set status = 'dead', hp = 0 where id = av.id;
    delete from hex_occupants where entity_id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', av.id, format('I spłonął awatar %s w Wielkim Cudzie, i nie było go więcej.', av.name));
  end if;

  update games set verse_pending_by = me.id where id = p_game_id;
  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- everything after the first element of a path
create or replace function river_path_tail(p_path jsonb)
returns jsonb language sql immutable as $$
  select coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(p_path) with ordinality as t(e, o) where o > 1), '[]'::jsonb);
$$;

-- a mountain cut the river: the god who raised it leads the water on, in the same word, for nothing
create or replace function continue_river(p_game_id uuid, p_river_id uuid, p_nodes jsonb, p_mouth jsonb default null)
returns rivers language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  rv rivers;
  river_end jsonb;
  last_node jsonb;
  lr actions_log;
begin
  select * into g from games where id = p_game_id for update;
  select * into rv from rivers where id = p_river_id and game_id = p_game_id for update;
  if rv.id is null then raise exception 'Nie ma takiej rzeki.'; end if;
  if rv.mouth_kind <> 'none' or rv.reroute_by is distinct from me.id then raise exception 'Ta rzeka nie czeka na nowe koryto od ciebie.'; end if;
  if g.verse_pending_by is distinct from me.id then raise exception 'Nowe koryto wyklikuje się zaraz po Kształtowaniu Lądów.'; end if;
  last_node := rv.path->(jsonb_array_length(rv.path) - 1);
  river_end := river_validate_path(p_game_id, last_node, coalesce(p_nodes, '[]'::jsonb), p_mouth, rv.id);
  update rivers set
    path = path || coalesce(p_nodes, '[]'::jsonb),
    mouth_kind = river_end->>'kind', mouth_q = (river_end->>'mouth_q')::int, mouth_r = (river_end->>'mouth_r')::int,
    into_river_id = nullif(river_end->>'into_river_id', '')::uuid, reroute_by = null
  where id = rv.id returning * into rv;
  select * into lr from actions_log where game_id = p_game_id and player_id = me.id and action_key = 'shape_land' order by created_at desc limit 1;
  if lr.id is not null then
    update actions_log set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object('rerouted', jsonb_build_object('river_id', rv.id, 'nodes', coalesce(p_nodes, '[]'::jsonb), 'mouth_kind', river_end->>'kind'))
    where id = lr.id;
  end if;
  return rv;
end $$;

-- ---------- contests: the godless are the first to listen ----------
create or replace function answer_contest(p_contest_id uuid, p_attr text, p_prophecy_id uuid default null)
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
  a int := 0;
  target_gone boolean := false;
  source_gone boolean := false;
  oc jsonb;
  log_row actions_log;
  pmod int := 0;
  att_av entities; def_av entities;
  a_loss int := 0; d_loss int := 0;
  tcity cities; def_av_hp int := 0;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.defender_id then raise exception 'Odpowiada tylko broniące się bóstwo.' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'To starcie już rozstrzygnięto.'; end if;
  if c.kind = 'convert' and p_attr not in ('majesty', 'whisper') then raise exception 'Obrona to Majestat albo Podszept.'; end if;
  pmod := consume_prophecy(c.game_id, me.id, p_prophecy_id, c.round_number, c.era);
  if p_attr not in ('wrath', 'majesty', 'grace', 'whisper', 'element', 'wisdom') then raise exception 'Nie ma takiego atrybutu.'; end if;
  select * into g from games where id = c.game_id for update;
  select * into att from players where id = c.attacker_id;
  select * into target from entities where id = c.target_city_id;

  def_dots := case when c.target_city_id is null then 0 else player_dots(c.target_city_id, me.id) end;
  -- the defender's avatar standing in the attacked city fights with its life
  if c.kind = 'holy_war' then
    select * into tcity from cities where entity_id = c.target_city_id;
    select e.* into def_av from hex_occupants o join entities e on e.id = o.entity_id join entity_gods eg on eg.entity_id = e.id
    where o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'avatar' and e.status = 'active' and eg.player_id = me.id
    order by (eg.role = 'creator') desc limit 1;
    if def_av.id is not null then def_av_hp := coalesce(def_av.hp, 0); update contests set defender_avatar_id = def_av.id where id = c.id; end if;
  end if;
  mod := attr_score(me, p_attr) + pmod + (case when c.kind = 'holy_war' then def_dots + def_av_hp else 0 end);
  diff := c.attacker_total - (d1 + d2 + mod);

  if c.kind = 'avatar_duel' then
    select * into att_av from entities where id = c.attacker_avatar_id;
    select * into def_av from entities where id = c.defender_avatar_id;
    if diff >= 3 then d_loss := 2;
    elsif diff >= 1 then d_loss := 1; a_loss := 1;
    elsif diff = 0 then d_loss := 1; a_loss := 1;
    elsif diff >= -2 then a_loss := 1;
    else a_loss := 2;
    end if;
    perform wound_avatar(att_av.id, a_loss, c.attacker_id, g.round_number, g.era);
    perform wound_avatar(def_av.id, d_loss, c.attacker_id, g.round_number, g.era);
    select * into att_av from entities where id = c.attacker_avatar_id;
    select * into def_av from entities where id = c.defender_avatar_id;
    oc := jsonb_build_object('kind', 'avatar_duel', 'diff', diff, 'attacker_avatar', att_av.name, 'attacker_emoji', att_av.emoji, 'defender_avatar', def_av.name, 'defender_emoji', def_av.emoji,
                             'attacker_loss', a_loss, 'defender_loss', d_loss, 'attacker_hp', att_av.hp, 'defender_hp', def_av.hp,
                             'attacker_dead', att_av.status = 'dead', 'defender_dead', def_av.status = 'dead');
  elsif c.kind = 'convert' then
    k := case when diff >= 3 then 2 when diff >= 1 then 1 else 0 end;
    -- the godless turn first; only then the defender's own
    a := city_remove_atheists(c.target_city_id, k);
    converted := a + city_remove_dots(c.target_city_id, me.id, k - a);
    perform city_add_dots(c.target_city_id, c.attacker_id, converted);
    oc := jsonb_build_object('kind', 'convert', 'diff', diff, 'converted', converted, 'from_atheists', a);
  else
    if diff >= 3 then
      -- the attacker decides at the commit where the successes land (dots, the avatar, creatures)
      returned := c.army;
    elsif diff >= 1 then
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
    -- the fallen go to their gods' afterlives
    if def_lost > 0 then perform collect_souls(c.target_city_id, me.id, def_lost); end if;
    if att_lost > 0 and c.source_city_id is not null then perform collect_souls(c.source_city_id, c.attacker_id, att_lost); end if;
    if returned > 0 and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
      perform city_add_dots(c.source_city_id, c.attacker_id, returned);
    end if;
    source_gone := c.source_city_id is not null and destroy_city_if_empty(c.source_city_id, g.round_number, g.era);
    oc := jsonb_build_object('kind', 'holy_war', 'diff', diff, 'army', c.army, 'removed', removed, 'converted', converted,
                                  'defender_lost', removed + def_lost, 'attacker_lost', att_lost, 'returned', returned,
                                  'successes', case when diff >= 1 then c.army else 0 end, 'pending', diff >= 1,
                                  'source_city_id', c.source_city_id, 'source_destroyed', source_gone,
                                  'defender_avatar_hp', def_av_hp, 'defender_avatar_name', def_av.name, 'defender_avatar_emoji', def_av.emoji,
                                  'attacker_avatar_hp', (select (l.outcome->>'attacker_avatar_hp')::int from actions_log l where l.id = c.log_id));
  end if;
  if c.target_city_id is not null then
    target_gone := destroy_city_if_empty(c.target_city_id, g.round_number, g.era);
  end if;
  oc := oc || jsonb_build_object('target_city_id', c.target_city_id, 'target_name', target.name, 'target_destroyed', target_gone,
                                           'attacker_id', c.attacker_id, 'defender_id', c.defender_id,
                                           'attacker_total', c.attacker_total, 'defender_total', d1 + d2 + mod, 'defender_dots', def_dots, 'defender_prophecy', pmod);

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (c.game_id, g.round_number, g.era, c.attacker_id, c.kind, 0, coalesce(c.target_city_id, c.attacker_avatar_id),
          jsonb_build_object('att', jsonb_build_object('d1', c.attacker_d1, 'd2', c.attacker_d2, 'modifier', c.attacker_mod, 'total', c.attacker_total, 'attr', c.attacker_attr),
                             'def', jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', p_attr, 'prophecy', pmod)),
          oc, '')
  returning * into log_row;

  update contests set
    defender_attr = p_attr, defender_d1 = d1, defender_d2 = d2, defender_mod = mod, defender_total = d1 + d2 + mod,
    status = 'resolved', outcome = oc, log_id = log_row.id, resolved_at = now()
  where id = c.id
  returning * into c;

  -- the attacker writes the verse (and, after a won war, places the blows) before the turn moves on
  update games set verse_pending_by = c.attacker_id where id = c.game_id;
  perform recompute_turn(c.game_id);
  return c;
end $$;

drop function if exists hex_free_slot(uuid, int, int);

do $$
declare fn text;
begin
  foreach fn in array array[
    'hex_neighbours(int, int)', 'hex_is_mountain(text)', 'fertility_base(text)', 'river_at(uuid, int, int)', 'hex_has_river(uuid, int, int)',
    'hex_has_herbivore(uuid, int, int)', 'hex_fertility(uuid, int, int)', 'hex_slot_for_role(uuid, int, int, text)', 'hex_slot_for(uuid, int, int, uuid)',
    'slot_error(text)', 'river_validate_path(uuid, jsonb, jsonb, jsonb, uuid)', 'river_path_head(jsonb, int)', 'river_path_tail(jsonb)',
    'river_cut_at(uuid, int, int, text, uuid)', 'beast_strength(int)', 'city_dots(uuid)', 'city_believers(uuid)', 'city_add_atheists(uuid, int)',
    'city_remove_atheists(uuid, int)', 'city_remove_random_dot(uuid)', 'city_remove_groups(uuid, int)', 'action_cost(text, smallint)',
    'perform_action(uuid, text, jsonb)', 'continue_river(uuid, uuid, jsonb, jsonb)', 'answer_contest(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
