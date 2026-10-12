-- 0024: the words of the sky and the words of the avatar. The one Kataklizm splits into five words
-- (Piorun, Potop, Deszcz Ognia, Susza, Plaga; all Gniew / Żywioł). Susza and Plaga sit on a field for
-- a few nights (hexes.drought_rounds / plague_rounds): a drought makes the land barren (Żyzność 0) and
-- kills the herd grazing there, a plague takes two of the city's people (or a herd or a beast) every
-- night. The avatar no longer speaks words for half the price: every word costs what it costs. Instead
-- Rozwój Cywilizacji, Nawracanie, Exodus, Święta Wojna, Proroctwo, Walka and Pielgrzymka belong to the
-- avatar: it must stand on the map, and for Nawracanie, Exodus and Święta Wojna it first steps into the
-- city it works from (a city at most two fields away). After a won war it stands in the taken city; a
-- lost war (by 3+) wounds it. Migracja no longer rolls: the kind simply moves (1 Logos a field) and a
-- beast walking onto a beast, a tribe or a city fights at once by the rules of the night. Rozmnożenie
-- copies onto the chosen neighbouring field (7..9: the kind weakens by one). Zmiana Istoty edits the kind
-- in place (name, sign, description; 10+ also +1 strength). Rozwój Cywilizacji is Mądrość / Podszept.
-- Replaced: hex_fertility, action_attrs, action_cost, perform_action, declare_contest, answer_contest,
-- night_start. New: strike_hex, drown_hex, instant_fight, avatar_enter, pick_avatar, night_blights.

alter table hexes add column if not exists drought_rounds int not null default 0;
alter table hexes add column if not exists plague_rounds int not null default 0;

-- ---------- fertility: a drought makes the land barren ----------
create or replace function hex_fertility(p_game_id uuid, p_q int, p_r int)
returns int language plpgsql stable as $$
declare
  hx hexes;
  f int;
begin
  select * into hx from hexes where game_id = p_game_id and q = p_q and r = p_r;
  if hx.biome is null or hx.biome = 'woda' then return null; end if;
  if coalesce(hx.drought_rounds, 0) > 0 then return 0; end if;
  f := fertility_base(hx.biome);
  if exists (select 1 from hex_neighbours(p_q, p_r) n join hexes h on h.game_id = p_game_id and h.q = n.q and h.r = n.r where h.biome = 'woda') then
    f := f + 1;
  end if;
  if hex_has_river(p_game_id, p_q, p_r) then
    f := f + (case when hx.biome = 'pustynia' then 3 else 1 end);
  end if;
  f := f + hex_herd_bonus(p_game_id, p_q, p_r);
  if hx.resource is not null then f := f + coalesce(hx.resource_bonus, 1); end if;
  return f;
end $$;

-- ---------- the pairs and the prices ----------
create or replace function action_attrs(p_key text, p_side text default 'attack')
returns text[] language sql immutable as $$
  select case
    when p_key = 'catastrophe'          then array['wrath', 'element']
    when p_key = 'lightning'            then array['wrath', 'element']
    when p_key = 'flood'                then array['wrath', 'element']
    when p_key = 'fire_rain'            then array['wrath', 'element']
    when p_key = 'drought'              then array['wrath', 'element']
    when p_key = 'plague'               then array['wrath', 'element']
    when p_key = 'great_miracle'        then array['majesty', 'wisdom']
    when p_key = 'bless_land'           then array['grace', 'wisdom']
    when p_key = 'create_beast'         then array['wrath', 'element']
    when p_key = 'create_herd'          then array['grace', 'element']
    when p_key = 'create_sapient'       then array['majesty', 'wisdom']
    when p_key = 'change_creature'      then array['whisper', 'element']
    when p_key = 'multiply'             then array['grace', 'element']
    when p_key = 'create_civilization'  then array['wisdom', 'grace']
    when p_key = 'develop_civilization' then array['wisdom', 'whisper']
    when p_key = 'exodus'               then array['wrath', 'whisper']
    when p_key = 'create_avatar'        then array['majesty', 'whisper']
    when p_key = 'prophecy'             then array['majesty', 'wisdom']
    when p_key = 'convert' and p_side = 'defence'  then array['majesty', 'wisdom']
    when p_key = 'convert'                         then array['majesty', 'whisper']
    when p_key = 'holy_war' and p_side = 'defence' then array['grace', 'wrath']
    when p_key = 'holy_war'                        then array['wrath', 'whisper']
    when p_key = 'avatar_duel'          then array['wrath', 'majesty']
    else null
  end;
$$;

create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'           then (array[2, 5, 12])[p_era]
    when 'catastrophe'          then 10
    when 'lightning'            then (array[1, 2, 3])[p_era]
    when 'flood'                then (array[6, 12, 18])[p_era]
    when 'fire_rain'            then (array[6, 12, 18])[p_era]
    when 'drought'              then (array[3, 6, 9])[p_era]
    when 'plague'               then (array[9, 5, 8])[p_era]
    when 'great_miracle'        then (array[15, 30, 50])[p_era]
    when 'bless_land'           then (array[4, 7, 10])[p_era]
    when 'pour_river'           then (array[3, 8, 12])[p_era]
    when 'create_creature'      then (array[10, 3, 12])[p_era]
    when 'create_beast'         then (array[10, 3, 12])[p_era]
    when 'create_herd'          then (array[10, 3, 12])[p_era]
    when 'create_sapient'       then (array[15, 4, 18])[p_era]
    when 'change_creature'      then (array[5, 1, 6])[p_era]
    when 'migrate'              then (array[3, 1, 3])[p_era]
    when 'multiply'             then (array[5, 2, 6])[p_era]
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

-- ---------- the blows of a cataclysm ----------
-- every blow falls at random on a follower of the city, a herd or a beast (a tribe only once the city is
-- gone; it vanishes from the field), or an avatar (one life). Returns what was hit.
create or replace function strike_hex(p_game_id uuid, p_q int, p_r int, p_blows int, p_by uuid, p_round int, p_era smallint)
returns jsonb language plpgsql as $$
declare
  city entities;
  city_gone boolean := false;
  hits jsonb := '[]'::jsonb;
  wasted int := 0;
  n_dots int; creatures uuid[]; av_occ hex_occupants; n_targets int; pick int; pid uuid; victim entities; ok boolean;
begin
  select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = p_q and c.r = p_r;
  for i in 1..greatest(0, p_blows) loop
    n_dots := case when city.id is not null and not city_gone then city_dots(city.id) else 0 end;
    select coalesce(array_agg(o.entity_id order by o.slot), '{}') into creatures
    from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = p_q and o.r = p_r and e.kind = 'creature'
      and (not is_sapient(e) or city.id is null or city_gone);
    select o.* into av_occ from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = p_q and o.r = p_r and e.kind = 'avatar' and e.status = 'active' and coalesce(e.hp, 0) > 0 limit 1;
    n_targets := n_dots + coalesce(array_length(creatures, 1), 0) + (case when av_occ.id is not null then 1 else 0 end);
    if n_targets = 0 then wasted := p_blows - i + 1; exit; end if;
    pick := 1 + floor(random() * n_targets)::int;
    if pick <= n_dots then
      pid := city_remove_random_dot(city.id);
      perform collect_souls(city.id, pid, 1);
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'dot', 'player_id', pid, 'city_id', city.id));
      if destroy_city_if_empty(city.id, p_round, p_era) then city_gone := true; end if;
    elsif pick <= n_dots + coalesce(array_length(creatures, 1), 0) then
      select * into victim from entities where id = creatures[pick - n_dots];
      delete from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and entity_id = victim.id;
      ok := not exists (select 1 from hex_occupants where entity_id = victim.id);
      if ok then update entities set status = 'dead' where id = victim.id; end if;
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'creature', 'entity_id', victim.id, 'name', victim.name, 'emoji', victim.emoji, 'extinct', ok));
    else
      perform wound_avatar(av_occ.entity_id, 1, p_by, p_round, p_era);
      select * into victim from entities where id = av_occ.entity_id;
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'avatar', 'entity_id', victim.id, 'name', victim.name, 'hp', victim.hp, 'max_hp', victim.max_hp));
    end if;
  end loop;
  return jsonb_build_object('hits', hits, 'wasted', wasted, 'city_id', city.id, 'city_name', city.name, 'city_destroyed', city_gone);
end $$;

-- the sea takes the field: everything standing there dies, the city is a ruin, the land is water for good
create or replace function drown_hex(p_game_id uuid, p_q int, p_r int, p_by uuid, p_round int, p_era smallint)
returns jsonb language plpgsql as $$
declare
  city entities;
  rec record;
  hits jsonb := '[]'::jsonb;
  cuts jsonb := '[]'::jsonb;
  ok boolean;
  city_gone boolean := false;
begin
  select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = p_q and c.r = p_r;
  if city.id is not null then
    for rec in select player_id, dots from city_followers where city_id = city.id loop
      perform collect_souls(city.id, rec.player_id, rec.dots);
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'dots', 'player_id', rec.player_id, 'n', rec.dots, 'city_id', city.id));
    end loop;
    delete from city_followers where city_id = city.id;
    update cities set atheists = 0 where entity_id = city.id;
    city_gone := destroy_city_if_empty(city.id, p_round, p_era);
  end if;
  for rec in
    select o.id as occ_id, e.* from hex_occupants o join entities e on e.id = o.entity_id
    where o.game_id = p_game_id and o.q = p_q and o.r = p_r order by o.slot
  loop
    if rec.kind = 'avatar' then
      perform wound_avatar(rec.id, greatest(1, coalesce(rec.hp, 1)), p_by, p_round, p_era);
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'avatar', 'entity_id', rec.id, 'name', rec.name, 'hp', 0, 'max_hp', rec.max_hp));
    else
      ok := night_remove_occupant(rec.occ_id);
      hits := hits || jsonb_build_array(jsonb_build_object('t', 'creature', 'entity_id', rec.id, 'name', rec.name, 'emoji', rec.emoji, 'extinct', ok));
    end if;
  end loop;
  update hexes set biome = 'woda', decor = hex_decor('woda'), resource = null, drought_rounds = 0, plague_rounds = 0 where game_id = p_game_id and q = p_q and r = p_r;
  cuts := river_cut_at(p_game_id, p_q, p_r, 'woda', null);
  return jsonb_build_object('hits', hits, 'wasted', 0, 'city_id', city.id, 'city_name', city.name, 'city_destroyed', city_gone, 'rivers_cut', cuts);
end $$;

-- ---------- a fight settled at once by the book, by the rules of the night ----------
-- scenes: 'creature' (the mover against the beast or tribe at the bottom of the target field),
-- 'beast_city' (a beast against a city), 'beast_avatar'. Both sides 2k6 + their mod; the difference decides.
create or replace function instant_fight(p_game_id uuid, p_scene text, p_left jsonb, p_right jsonb, p_at jsonb, p_origin jsonb, p_by uuid, p_round int, p_era smallint)
returns jsonb language plpgsql as $$
declare
  d1l int := roll_d6(); d2l int := roll_d6(); d1r int := roll_d6(); d2r int := roll_d6();
  lt int; rt int; diff int;
  lo hex_occupants; ro hex_occupants;
  le entities; re entities;
  l_role text; r_role text;
  loser text := null;
  res text := 'return';
  flee jsonb := null;
  removed boolean := false;
  extinct boolean := false;
  city_lost jsonb := '[]'::jsonb;
  city_gone boolean := false;
  av_hp int := null;
  ls jsonb; rs jsonb;
begin
  lt := d1l + d2l + coalesce((p_left->>'mod')::int, 0);
  rt := d1r + d2r + coalesce((p_right->>'mod')::int, 0);
  diff := lt - rt;
  ls := p_left || jsonb_build_object('roll', jsonb_build_object('d1', d1l, 'd2', d2l, 'total', lt));
  rs := p_right || jsonb_build_object('roll', jsonb_build_object('d1', d1r, 'd2', d2r, 'total', rt));
  if p_left->>'occupant_id' is not null then select * into lo from hex_occupants where id = (p_left->>'occupant_id')::uuid; end if;
  if p_right->>'occupant_id' is not null then select * into ro from hex_occupants where id = (p_right->>'occupant_id')::uuid; end if;
  if p_left->>'entity_id' is not null then select * into le from entities where id = (p_left->>'entity_id')::uuid; end if;
  if p_right->>'entity_id' is not null then select * into re from entities where id = (p_right->>'entity_id')::uuid; end if;
  l_role := creature_role(le); r_role := creature_role(re);

  if p_scene = 'creature' then
    if diff = 0 then
      res := 'return';
    elsif diff > 0 then
      loser := 'right';
      if ro.id is not null then
        if diff >= 3 then
          extinct := night_remove_occupant(ro.id); removed := true; res := 'eaten';
        else
          flee := night_flee(p_game_id, ro.id, r_role); removed := (flee->>'removed')::boolean; extinct := (flee->>'extinct')::boolean;
          res := case when removed then 'fled_nowhere' else 'flee' end;
        end if;
      end if;
      if lo.id is not null then
        update hex_occupants set q = (p_at->>'q')::int, r = (p_at->>'r')::int, slot = 1 where id = lo.id;
      end if;
    else
      loser := 'left';
      if lo.id is null then
        res := 'vanished';
      elsif diff <= -3 then
        extinct := night_remove_occupant(lo.id); removed := true; res := 'eaten';
      else
        flee := night_flee(p_game_id, lo.id, l_role); removed := (flee->>'removed')::boolean; extinct := (flee->>'extinct')::boolean;
        res := case when removed then 'fled_nowhere' else 'flee' end;
      end if;
    end if;
  elsif p_scene in ('beast_city', 'beast_avatar') then
    if diff = 0 then
      res := 'return';
    elsif diff > 0 then
      loser := 'right';
      if p_scene = 'beast_city' then
        city_lost := city_remove_groups((p_right->>'city_id')::uuid, diff);
        perform night_bury_groups((p_right->>'city_id')::uuid, city_lost);
        city_gone := destroy_city_if_empty((p_right->>'city_id')::uuid, p_round, p_era);
        res := 'city_hit';
      else
        perform wound_avatar((p_right->>'avatar_id')::uuid, diff, p_by, p_round, p_era);
        select hp into av_hp from entities where id = (p_right->>'avatar_id')::uuid;
        res := 'avatar_hit';
      end if;
    else
      loser := 'left';
      if lo.id is not null then
        if diff <= -3 then
          extinct := night_remove_occupant(lo.id); removed := true; res := 'eaten';
        else
          flee := night_flee(p_game_id, lo.id, l_role); removed := (flee->>'removed')::boolean; extinct := (flee->>'extinct')::boolean;
          res := case when removed then 'fled_nowhere' else 'flee' end;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('scene', p_scene, 'left', ls, 'right', rs, 'at', p_at, 'origin', p_origin, 'diff', diff, 'result', res, 'loser', loser,
                            'loser_to', flee->'to', 'removed', removed, 'extinct', extinct,
                            'city_id', p_right->>'city_id', 'city_lost', city_lost, 'city_destroyed', city_gone, 'avatar_hp', av_hp,
                            'att', jsonb_build_object('d1', d1l, 'd2', d2l, 'modifier', coalesce((p_left->>'mod')::int, 0), 'total', lt),
                            'def', jsonb_build_object('d1', d1r, 'd2', d2r, 'modifier', coalesce((p_right->>'mod')::int, 0), 'total', rt));
end $$;

-- ---------- the avatar's hand ----------
-- my living avatar on the map: the one named, or the one nearest the field when none is named
create or replace function pick_avatar(p_game_id uuid, p_player uuid, p_id uuid, p_q int, p_r int)
returns entities language plpgsql as $$
declare
  av entities;
begin
  if p_id is not null then
    select e.* into av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = p_player and e.kind = 'avatar' and e.status = 'active' and e.id = p_id;
    if av.id is null then raise exception 'Nie masz takiego żywego awatara.'; end if;
    if not exists (select 1 from hex_occupants where game_id = p_game_id and entity_id = av.id) then raise exception 'Ten awatar nie stoi na mapie.'; end if;
    return av;
  end if;
  select e.* into av from entity_gods eg join entities e on e.id = eg.entity_id join hex_occupants o on o.entity_id = e.id and o.game_id = p_game_id
  where eg.player_id = p_player and e.kind = 'avatar' and e.status = 'active'
  order by hex_distance(o.q, o.r, coalesce(p_q, o.q), coalesce(p_r, o.r)) asc, e.created_at limit 1;
  if av.id is null then raise exception 'To słowo wypowiada twój awatar: najpierw go ześlij.'; end if;
  return av;
end $$;

-- the avatar steps onto the field it works from (a city at most two fields away); true when it moved
create or replace function avatar_enter(p_game_id uuid, p_avatar uuid, p_q int, p_r int, p_what text default 'miasta')
returns boolean language plpgsql as $$
declare
  occ hex_occupants;
  s int;
begin
  select * into occ from hex_occupants where game_id = p_game_id and entity_id = p_avatar;
  if occ.id is null then raise exception 'Ten awatar nie stoi na mapie.'; end if;
  if occ.q = p_q and occ.r = p_r then return false; end if;
  if hex_distance(occ.q, occ.r, p_q, p_r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od %. Najpierw wyślij go na Pielgrzymkę.', p_what; end if;
  s := hex_slot_for_role(p_game_id, p_q, p_r, 'avatar');
  if s is null then raise exception 'Na tym polu stoją już dwa awatary: twój nie ma gdzie stanąć.'; end if;
  update hex_occupants set q = p_q, r = p_r, slot = s where id = occ.id;
  return true;
end $$;

-- ---------- the words ----------
create or replace function perform_action(p_game_id uuid, p_action_key text, p_payload jsonb default '{}'::jsonb)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  cost int;
  ent jsonb := p_payload->'entity';
  ent_id uuid;
  log_row actions_log;
  gid uuid;
  av entities;
  outcome jsonb := '{}'::jsonb;
  summary text := coalesce(p_payload->>'summary', '');
  roll_json jsonb := null;
  rolled boolean := false;
  -- map work
  hq int; hr int; hslot int; hx hexes; dist int; emo text;
  tq int; tr int;
  occ hex_occupants; src entities; city entities; cty cities;
  qs int[] := '{}'; rs int[] := '{}'; item jsonb; ok boolean; hexes_out jsonb := '[]'::jsonb;
  dmg int; hits jsonb := '[]'::jsonb; victim entities; struck jsonb;
  city_gone boolean := false;
  d1 int; d2 int; total int; tier text; gained int; added int; attr text; score int;
  n int; moved int; new_city boolean := false;
  pmod int := 0;
  after text; alive int; gen int; lost int := 0;
  role text; diet text; strength int := 0; conv int := 0;
  cuts jsonb := '[]'::jsonb; reroute jsonb := null; river_end jsonb; river_id uuid; mouth jsonb; path jsonb;
  cand record; copies jsonb := '[]'::jsonb; new_occ hex_occupants;
  mode text; fight jsonb := null; right_side jsonb; rounds int := 0; fert_before int;
  av_moved boolean := false; new_strength int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);

  if p_action_key = 'create_creature' then raise exception 'Stworzenie Istoty to teraz Stworzenie Bestii albo Stworzenie Stada.'; end if;
  if p_action_key = 'catastrophe' then raise exception 'Kataklizm to teraz Piorun, Potop, Deszcz Ognia, Susza albo Plaga.'; end if;
  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;
  rolled := action_attrs(p_action_key) is not null;

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
      qs := qs || tq; rs := rs || tr;
    end loop;

  elsif p_action_key = 'lightning' then
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż cel pioruna: bestię, stado albo awatara.'; end if;
    select * into src from entities where id = occ.entity_id;
    role := creature_role(src);
    if role not in ('beast', 'herbivore', 'avatar') then raise exception 'Piorun trafia bestię, stado albo awatara, nie lud.'; end if;
    hq := occ.q; hr := occ.r;

  elsif p_action_key in ('flood', 'fire_rain', 'drought', 'plague') then
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hx.biome = 'woda' then
      raise exception '%', case p_action_key when 'flood' then 'Wody nie da się zatopić.' when 'fire_rain' then 'Ogień nie spadnie na wodę.' when 'drought' then 'Wody nie wysuszysz.' else 'Na wodzie nie ma kogo zarazić.' end;
    end if;
    if p_action_key = 'plague'
       and not exists (select 1 from cities c where c.game_id = p_game_id and c.q = hq and c.r = hr)
       and not exists (select 1 from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = hq and o.r = hr and e.kind = 'creature') then
      raise exception 'Plaga potrzebuje żywych: miasta, stada albo bestii.';
    end if;

  elsif p_action_key = 'bless_land' then
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hx.biome = 'woda' then raise exception 'Wody nie da się pobłogosławić surowcem.'; end if;
    if nullif(trim(coalesce(p_payload->>'resource', '')), '') is null or not resource_known(p_payload->>'resource') then
      raise exception 'Wybierz surowiec.';
    end if;

  elsif p_action_key = 'pour_river' then
    path := p_payload->'path';
    if path is null or jsonb_typeof(path) <> 'array' or jsonb_array_length(path) < 1 then raise exception 'Kliknij górę, z której wypływa rzeka.'; end if;
    hq := (path->0->>'q')::int; hr := (path->0->>'r')::int;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Źródło leży poza światem.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if not hex_is_mountain(hx.biome) then raise exception 'Rzeka wypływa tylko z góry.'; end if;
    if river_at(p_game_id, hq, hr) is not null then raise exception 'Z tej góry już płynie rzeka.'; end if;
    mouth := case when p_payload ? 'mouth' and jsonb_typeof(p_payload->'mouth') = 'object' then p_payload->'mouth' else null end;
    river_end := river_validate_path(p_game_id, path->0, river_path_tail(path), mouth);

  elsif p_action_key in ('create_beast', 'create_herd', 'create_sapient', 'create_avatar') then
    if emo is null then raise exception 'Wybierz emotikonę.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if p_action_key in ('create_beast', 'create_herd') then
      role := case when p_action_key = 'create_beast' then 'beast' else 'herbivore' end;
      diet := case when role = 'beast' then 'carnivore' else 'herbivore' end;
      if hx.biome = 'woda' then raise exception 'Na wodzie nikt nie zamieszka.'; end if;
    else
      role := case when p_action_key = 'create_avatar' then 'avatar' else 'tribe' end;
      if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
    end if;
    hslot := hex_slot_for_role(p_game_id, hq, hr, role);
    if hslot is null then raise exception '%', slot_error(role); end if;

  elsif p_action_key = 'change_creature' then
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż istotę na mapie.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'To nie jest istota.'; end if;
    if emo is not null and emo <> coalesce(src.emoji, '') and exists (select 1 from entities where game_id = p_game_id and emoji = emo) then
      raise exception 'Ta emotikona należy już do kogoś innego.';
    end if;
    if nullif(trim(coalesce(ent->>'name', '')), '') is null and emo is null and nullif(trim(coalesce(ent->>'description', '')), '') is null then
      raise exception 'Zmień nazwę, znak albo opis istoty.';
    end if;

  elsif p_action_key = 'migrate' then
    select * into occ from hex_occupants
    where game_id = p_game_id and entity_id = nullif(p_payload->>'entity_id', '')::uuid
      and q = (p_payload->'from'->>'q')::int and r = (p_payload->'from'->>'r')::int;
    if occ.id is null then raise exception 'Na tym heksie nie ma tej istoty.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'Migrują tylko istoty.'; end if;
    role := creature_role(src);
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if not hex_in_map(tq, tr) then raise exception 'Ten heks leży poza światem.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if hx.biome = 'woda' then raise exception 'Na wodzie nikt nie zamieszka.'; end if;
    if role = 'tribe' and hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
    dist := hex_distance(occ.q, occ.r, tq, tr);
    if dist < 1 then raise exception 'Wskaż inny heks.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and entity_id = src.id) then raise exception 'Ta istota już tam żyje.'; end if;
    -- a beast walking onto a city attacks it; otherwise the field must have room, or someone to fight at its bottom
    if role = 'beast' and exists (select 1 from cities c where c.game_id = p_game_id and c.q = tq and c.r = tr) then
      mode := 'city';
    else
      mode := night_enterable(p_game_id, tq, tr, src.id, role);
      if mode is null then
        if role = 'herbivore' and exists (select 1 from hex_occupants where game_id = p_game_id and q = tq and r = tr and slot = 0) then raise exception '%', slot_error('herbivore'); end if;
        if role = 'tribe' and exists (select 1 from cities c where c.game_id = p_game_id and c.q = tq and c.r = tr) then raise exception 'Plemię nie wejdzie do miasta: tam prowadzi Exodus.'; end if;
        raise exception 'Na tym heksie nie ma miejsca dla tych istot.';
      end if;
    end if;
    cost := cost + dist;

  elsif p_action_key = 'multiply' then
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż istotę na mapie.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'Mnożą się tylko istoty.'; end if;
    role := creature_role(src);
    tq := (p_payload->'to'->>'q')::int; tr := (p_payload->'to'->>'r')::int;
    if tq is null or not hex_in_map(tq, tr) then raise exception 'Wskaż pole obok, na którym stanie kopia.'; end if;
    if hex_distance(occ.q, occ.r, tq, tr) <> 1 then raise exception 'Kopia staje na polu sąsiadującym z istotą.'; end if;
    if night_enterable(p_game_id, tq, tr, src.id, role) is distinct from 'free' then raise exception 'Na tym polu nie ma miejsca dla tych istot.'; end if;

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
    if nullif(trim(coalesce(p_payload->>'gift', '')), '') is null then raise exception 'Napisz, co ofiarowujesz wyznawcom.'; end if;
    select * into cty from cities where entity_id = city.id;
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, cty.q, cty.r);
    select * into occ from hex_occupants where game_id = p_game_id and entity_id = av.id;
    if hex_distance(occ.q, occ.r, cty.q, cty.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od miasta. Najpierw wyślij go na Pielgrzymkę.'; end if;

  elsif p_action_key = 'exodus' then
    select * into city from entities where id = nullif(p_payload->>'city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    select * into cty from cities where entity_id = city.id;
    if city.id is null or cty.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, cty.q, cty.r);
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
    -- the avatar steps into the city it leads the people out of (the error is raised before anything is paid)
    av_moved := avatar_enter(p_game_id, av.id, cty.q, cty.r, 'miasta, które wyprowadza');
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
    if not exists (select 1 from hex_occupants where game_id = p_game_id and entity_id = src.id) then raise exception 'Ten awatar nie stoi na mapie.'; end if;
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

  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;

  -- ----- the dice: one of two attributes, a prophecy, the three bands -----
  if rolled then
    attr := nullif(p_payload->>'attr', '');
    perform assert_attr(p_action_key, attr);
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, attr);
    total := d1 + d2 + score + pmod;
    tier := roll_tier(total);
    roll_json := jsonb_build_object('d1', d1, 'd2', d2, 'modifier', score + pmod, 'total', total, 'attr', attr, 'tier', tier);
  end if;

  -- ----- effects -----
  if p_action_key = 'shape_land' then
    for i in 1..array_length(qs, 1) loop
      select biome into after from hexes where game_id = p_game_id and q = qs[i] and r = rs[i];
      update hexes set biome = p_payload->>'biome', decor = hex_decor(p_payload->>'biome'),
        resource = case when p_payload->>'biome' = 'woda' then null else resource end,
        drought_rounds = case when p_payload->>'biome' = 'woda' then 0 else drought_rounds end,
        plague_rounds = case when p_payload->>'biome' = 'woda' then 0 else plague_rounds end
      where game_id = p_game_id and q = qs[i] and r = rs[i];
      hexes_out := hexes_out || jsonb_build_array(jsonb_build_object('q', qs[i], 'r', rs[i], 'from', after));
      cuts := cuts || river_cut_at(p_game_id, qs[i], rs[i], p_payload->>'biome', me.id);
    end loop;
    select c into reroute from jsonb_array_elements(cuts) c where c->>'kind' = 'mountain' limit 1;
    outcome := jsonb_build_object('biome', p_payload->>'biome', 'hexes', hexes_out, 'rivers_cut', cuts,
                                  'reroute', case when reroute is null then null else jsonb_build_object('river_id', reroute->>'river_id', 'from', reroute->'from') end);

  elsif p_action_key = 'lightning' then
    -- 10+: two blows, 7..9: one, 6-: the bolt misses. A beast or a herd struck is gone from the field; an avatar loses life
    dmg := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    ok := false;
    if dmg > 0 then
      if role = 'avatar' then
        perform wound_avatar(src.id, dmg, me.id, g.round_number, g.era);
        select * into victim from entities where id = src.id;
      else
        ok := night_remove_occupant(occ.id);
        victim := src;
      end if;
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'target_id', src.id, 'name', src.name, 'emoji', src.emoji, 'role', role, 'damage', dmg, 'hit', dmg > 0,
                                  'killed', dmg > 0 and (role <> 'avatar' or coalesce(victim.hp, 0) = 0), 'extinct', ok,
                                  'hp', case when role = 'avatar' then coalesce(victim.hp, src.hp) else null end, 'max_hp', src.max_hp);

  elsif p_action_key = 'flood' then
    -- 10+: the field is water for good and everything on it drowns; 7..9: three blows; 6-: the waters recede
    if tier = 'strong' then
      struck := drown_hex(p_game_id, hq, hr, me.id, g.round_number, g.era);
      after := 'woda';
    elsif tier = 'mixed' then
      struck := strike_hex(p_game_id, hq, hr, 3, me.id, g.round_number, g.era);
    else
      struck := jsonb_build_object('hits', '[]'::jsonb, 'wasted', 0, 'city_id', null, 'city_name', null, 'city_destroyed', false);
    end if;
    ent_id := nullif(struck->>'city_id', '')::uuid;
    outcome := struck || jsonb_build_object('q', hq, 'r', hr, 'drowned', tier = 'strong', 'damage', case tier when 'strong' then jsonb_array_length(struck->'hits') when 'mixed' then 3 else 0 end,
                                             'biome_from', hx.biome, 'biome_after', after, 'rivers_cut', coalesce(struck->'rivers_cut', '[]'::jsonb));

  elsif p_action_key = 'fire_rain' then
    -- 10+: six blows, 7..9: three; when nothing is left alive the land is a wasteland
    dmg := case tier when 'strong' then 6 when 'mixed' then 3 else 0 end;
    struck := strike_hex(p_game_id, hq, hr, dmg, me.id, g.round_number, g.era);
    alive := (case when struck->>'city_id' is not null and not (struck->>'city_destroyed')::boolean then 1 else 0 end)
           + (select count(*)::int from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = hq and o.r = hr and e.status = 'active');
    if dmg > 0 and alive = 0 and not hex_is_mountain(hx.biome) and hx.biome <> 'ziemia' then
      update hexes set biome = 'ziemia', decor = hex_decor('ziemia') where game_id = p_game_id and q = hq and r = hr;
      cuts := river_cut_at(p_game_id, hq, hr, 'ziemia', null);
      after := 'ziemia';
    end if;
    ent_id := nullif(struck->>'city_id', '')::uuid;
    outcome := struck || jsonb_build_object('q', hq, 'r', hr, 'damage', dmg, 'biome_from', hx.biome, 'biome_after', after, 'rivers_cut', cuts);

  elsif p_action_key = 'drought' then
    -- 10+: three nights of barren land, 7..9: two; a herd grazing there dies every night
    rounds := case tier when 'strong' then 3 when 'mixed' then 2 else 0 end;
    fert_before := hex_fertility(p_game_id, hq, hr);
    if rounds > 0 then update hexes set drought_rounds = greatest(drought_rounds, rounds) where game_id = p_game_id and q = hq and r = hr; end if;
    select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = hq and c.r = hr;
    ent_id := city.id;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'rounds', rounds, 'biome', hx.biome, 'fertility_before', fert_before, 'city_id', city.id, 'city_name', city.name);

  elsif p_action_key = 'plague' then
    -- 10+: two nights, 7..9: one; every night two of the city's people die (or a herd or a beast)
    rounds := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    if rounds > 0 then update hexes set plague_rounds = greatest(plague_rounds, rounds) where game_id = p_game_id and q = hq and r = hr; end if;
    select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = hq and c.r = hr;
    ent_id := city.id;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'rounds', rounds, 'biome', hx.biome, 'city_id', city.id, 'city_name', city.name,
                                  'creatures', (select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'emoji', e.emoji)), '[]'::jsonb) from hex_occupants o join entities e on e.id = o.entity_id
                                                where o.game_id = p_game_id and o.q = hq and o.r = hr and e.kind = 'creature' and not is_sapient(e)));

  elsif p_action_key = 'bless_land' then
    strength := case tier when 'strong' then greatest(1, beast_strength(total)) when 'mixed' then 0 else -1 end;
    update hexes set resource = p_payload->>'resource', resource_bonus = strength where game_id = p_game_id and q = hq and r = hr;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'resource', p_payload->>'resource', 'biome', hx.biome, 'fertility', hex_fertility(p_game_id, hq, hr),
                                  'replaced', hx.resource, 'replaced_bonus', case when hx.resource is null then null else hx.resource_bonus end,
                                  'grace', score, 'bonus', strength);

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

  elsif p_action_key in ('create_beast', 'create_herd', 'create_sapient', 'create_avatar') then
    select least(12, coalesce(max(e.max_hp), 1) + 1) into gen from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and eg.role = 'creator' and e.kind = 'avatar' and e.status <> 'active';
    if role in ('beast', 'herbivore') then
      strength := case tier when 'strong' then greatest(1, beast_strength(total)) else 0 end;
    end if;
    if tier <> 'weak' then
      insert into entities (game_id, kind, name, description, emoji, hp, max_hp, traits, conditions, diet, strength, created_round, created_era, created_by_player_id)
      values (p_game_id, case when p_action_key = 'create_avatar' then 'avatar' else 'creature' end::entity_kind,
              coalesce(nullif(trim(ent->>'name'), ''), 'Bez imienia'), coalesce(ent->>'description', ''), emo,
              case when p_action_key = 'create_avatar' then (case tier when 'strong' then gen else greatest(1, gen - 1) end) else null end,
              case when p_action_key = 'create_avatar' then gen else null end,
              coalesce(array(select jsonb_array_elements_text(ent->'traits')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'conditions')), '{}'),
              case when role in ('beast', 'herbivore') then diet else null end, strength,
              g.round_number, g.era, me.id)
      returning id into ent_id;
      insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
      for gid in select (jsonb_array_elements_text(coalesce(ent->'co_god_ids', '[]'::jsonb)))::uuid loop
        if gid <> me.id and exists (select 1 from players where id = gid and game_id = p_game_id) then
          insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, gid, p_game_id, 'co_creator') on conflict do nothing;
        end if;
      end loop;
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, hq, hr, hslot, ent_id) returning * into new_occ;
      if p_action_key = 'create_sapient' and tier = 'strong' then
        select c.q, c.r into cand from night_candidates(p_game_id, new_occ, 'tribe') c where c.mode = 'free' order by c.fert desc, random() limit 1;
        if found then
          insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, cand.q, cand.r, hex_slot_for_role(p_game_id, cand.q, cand.r, 'tribe'), ent_id);
          copies := jsonb_build_array(jsonb_build_object('q', cand.q, 'r', cand.r));
        end if;
      end if;
    end if;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'slot', hslot, 'emoji', emo, 'biome', hx.biome, 'created', tier <> 'weak',
                                  'max_hp', case when p_action_key = 'create_avatar' and tier <> 'weak' then gen else null end,
                                  'hp', case when p_action_key = 'create_avatar' and tier <> 'weak' then (case tier when 'strong' then gen else greatest(1, gen - 1) end) else null end,
                                  'role', role, 'diet', case when role in ('beast', 'herbivore') then diet else null end, 'strength', strength,
                                  'copies', copies,
                                  'wrath', case when role = 'beast' then score else null end, 'grace', case when role = 'herbivore' then score else null end);

  elsif p_action_key = 'change_creature' then
    -- the kind itself changes: its name, its sign and its description, everywhere it lives; 10+ makes it one stronger (to +3)
    strength := case when is_sapient(src) then src.strength when tier = 'strong' then least(3, coalesce(src.strength, 0) + 1) else src.strength end;
    new_strength := strength;
    if tier <> 'weak' then
      update entities e set
        name = coalesce(nullif(trim(ent->>'name'), ''), e.name),
        emoji = coalesce(emo, e.emoji),
        description = coalesce(nullif(trim(ent->>'description'), ''), e.description),
        strength = new_strength
      where e.id = src.id;
      insert into entity_gods (entity_id, player_id, game_id, role) values (src.id, me.id, p_game_id, 'co_creator') on conflict do nothing;
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('q', occ.q, 'r', occ.r, 'entity_id', src.id, 'from_name', src.name, 'name', case when tier <> 'weak' then coalesce(nullif(trim(ent->>'name'), ''), src.name) else src.name end,
                                  'from_emoji', src.emoji, 'emoji', case when tier <> 'weak' then coalesce(emo, src.emoji) else src.emoji end, 'diet', src.diet,
                                  'strength', strength, 'from_strength', src.strength, 'changed', tier <> 'weak', 'created', tier <> 'weak');

  elsif p_action_key = 'migrate' then
    -- no dice: the kind moves (1 Logos a field); a beast walking onto a beast, a tribe or a city fights at once
    if mode = 'free' then
      update hex_occupants set q = tq, r = tr, slot = hex_slot_for_role(p_game_id, tq, tr, role) where id = occ.id;
      moved := 1;
    elsif mode = 'fight' then
      select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id),
                                'mod', case when creature_role(x) = 'beast' then x.strength else 0 end, 'roll', null)
      into right_side from hex_occupants o join entities x on x.id = o.entity_id
      where o.game_id = p_game_id and o.q = tq and o.r = tr and o.slot = 1;
      fight := instant_fight(p_game_id, 'creature', night_side_creature(p_game_id, src.id, occ.id, null), right_side,
                             jsonb_build_object('q', tq, 'r', tr), jsonb_build_object('q', occ.q, 'r', occ.r), me.id, g.round_number, g.era);
      moved := case when (fight->>'diff')::int > 0 then 1 else 0 end;
    else
      select jsonb_build_object('label', x.name, 'emoji', city_species_emoji(c.entity_id), 'entity_id', c.entity_id, 'city_id', c.entity_id,
                                'player_id', city_majority(c.entity_id), 'mod', city_dots(c.entity_id), 'roll', null)
      into right_side from cities c join entities x on x.id = c.entity_id where c.game_id = p_game_id and c.q = tq and c.r = tr;
      fight := instant_fight(p_game_id, 'beast_city', night_side_creature(p_game_id, src.id, occ.id, null), right_side,
                             jsonb_build_object('q', tq, 'r', tr), jsonb_build_object('q', occ.q, 'r', occ.r), me.id, g.round_number, g.era);
      moved := 0;
    end if;
    if fight is not null then
      roll_json := jsonb_build_object('d1', (fight->'att'->>'d1')::int, 'd2', (fight->'att'->>'d2')::int, 'total', (fight->'att'->>'total')::int, 'modifier', (fight->'att'->>'modifier')::int,
                                      'att', fight->'att', 'def', fight->'def');
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'name', src.name, 'emoji', src.emoji,
                                  'role', role, 'moved', moved = 1, 'arrived', moved = 1, 'mode', mode, 'fight', fight);

  elsif p_action_key = 'multiply' then
    -- 10+: a copy on the chosen field; 7..9: a copy, but the kind weakens by one; 6-: nothing
    if tier <> 'weak' then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, hex_slot_for_role(p_game_id, tq, tr, role), src.id);
      copies := jsonb_build_array(jsonb_build_object('q', tq, 'r', tr, 'fertility', hex_fertility(p_game_id, tq, tr)));
      if tier = 'mixed' and not is_sapient(src) then
        update entities e set strength = greatest(-1, coalesce(e.strength, 0) - 1) where e.id = src.id;
      end if;
    end if;
    select e.strength into strength from entities e where e.id = src.id;
    ent_id := src.id;
    outcome := jsonb_build_object('from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'name', src.name, 'emoji', src.emoji, 'role', role,
                                  'strength', strength, 'from_strength', src.strength, 'weakened', tier = 'mixed' and not is_sapient(src),
                                  'copies', copies, 'count', jsonb_array_length(copies));

  elsif p_action_key = 'create_civilization' then
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    if gained > 0 then
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
      perform city_add_dots(ent_id, me.id, gained);
    end if;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'species_id', src.id, 'species_name', src.name, 'biome', hx.biome, 'gained', gained, 'created', gained > 0);

  elsif p_action_key = 'develop_civilization' then
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    conv := city_remove_atheists(city.id, gained);
    added := city_add_dots(city.id, me.id, gained);
    insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
    values (p_game_id, city.id, me.id, trim(p_payload->>'gift'), gained > 0, added, g.round_number);
    ent_id := city.id;
    outcome := jsonb_build_object('city_id', city.id, 'city_name', city.name, 'gained', gained, 'added', added, 'converted_atheists', conv,
                                  'wasted', gained - added, 'gift', trim(p_payload->>'gift'), 'level', city_dots(city.id),
                                  'avatar', jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji));

  elsif p_action_key = 'exodus' then
    if tier <> 'weak' then
      moved := city_remove_dots(city.id, me.id, n);
      if tier = 'mixed' and moved >= 2 then
        perform collect_souls(city.id, me.id, 1);
        lost := 1;
        moved := moved - 1;
      end if;
      if new_city then
        insert into entities (game_id, kind, name, description, traits, specialties, flaws, parent_civilization_id, created_round, created_era, created_by_player_id)
        values (p_game_id, 'civilization', trim(p_payload->>'name'), coalesce(p_payload->>'description', ''),
                city.traits, city.specialties, city.flaws, city.id, g.round_number, g.era, me.id)
        returning id into ent_id;
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
        insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'member_species') on conflict do nothing;
        insert into cities (entity_id, game_id, q, r) values (ent_id, p_game_id, tq, tr);
        if tier = 'strong' then
          insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
          select p_game_id, ent_id, player_id, text, accepted, 0, g.round_number from city_gifts where city_id = city.id and accepted order by created_at;
        end if;
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
      if hex_slot_for_role(p_game_id, tq, tr, 'avatar') is not null then
        update hex_occupants set q = tq, r = tr, slot = hex_slot_for_role(p_game_id, tq, tr, 'avatar') where game_id = p_game_id and entity_id = av.id;
        ok := true;
      end if;
    else
      moved := 0; added := 0; ok := false; ent_id := null;
    end if;
    outcome := jsonb_build_object('from_city_id', city.id, 'from_name', city.name, 'to_city_id', ent_id,
                                  'to_name', (select name from entities where id = ent_id), 'new', new_city and tier <> 'weak',
                                  'dots', moved, 'added', added, 'wasted', moved - added, 'lost', lost, 'distance', dist, 'q', tq, 'r', tr,
                                  'species_name', src.name, 'emoji', src.emoji, 'source_destroyed', city_gone,
                                  'gifts_inherited', new_city and tier = 'strong', 'left', tier <> 'weak',
                                  'avatar_moved', ok, 'avatar_entered', av_moved, 'avatar_name', av.name, 'avatar_emoji', av.emoji, 'avatar_id', av.id);

  elsif p_action_key = 'pilgrimage' then
    ent_id := src.id;
    update hex_occupants set q = tq, r = tr, slot = hslot where id = occ.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'name', src.name, 'emoji', src.emoji, 'from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'biome', hx.biome);

  elsif p_action_key = 'prophecy' then
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    if gained > 0 then
      insert into prophecies (game_id, player_id, avatar_id, text, hold, created_round)
      values (p_game_id, me.id, src.id, trim(p_payload->>'text'), gained, g.round_number);
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'avatar_name', src.name, 'emoji', src.emoji, 'text', trim(p_payload->>'text'), 'hold', gained, 'spoken', gained > 0);

  elsif p_action_key = 'great_miracle' then
    outcome := jsonb_build_object('happened', tier <> 'weak', 'with_price', tier = 'mixed');

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

  if rolled then
    outcome := outcome || jsonb_build_object('d1', d1, 'd2', d2, 'attr', attr, 'score', score, 'prophecy', pmod, 'total', total, 'tier', tier);
  end if;

  -- the Logos is spent whatever the dice said
  update players set logos = logos - cost where id = me.id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, false, roll_json, outcome, summary)
  returning * into log_row;

  update games set verse_pending_by = me.id where id = p_game_id;
  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- ---------- contests: the attacker's tiles; the avatar leads ----------
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
  att_av entities; def_av entities; att_occ hex_occupants; def_occ hex_occupants;
  pmod int := 0;
  av entities; av_hp int := 0; av_moved boolean := false;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);
  if p_kind not in ('convert', 'holy_war', 'avatar_duel') then raise exception 'Nieznane starcie.'; end if;
  attr := nullif(p_payload->>'attr', '');
  perform assert_attr(p_kind, attr);

  if p_kind = 'avatar_duel' then
    select e.* into att_av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'attacker_avatar_id', '')::uuid;
    if att_av.id is null then raise exception 'Wskaż swojego żywego awatara.'; end if;
    select * into def_av from entities where id = nullif(p_payload->>'defender_avatar_id', '')::uuid and game_id = p_game_id and kind = 'avatar' and status = 'active';
    if def_av.id is null then raise exception 'Wskaż żywego awatara przeciwnika.'; end if;
    if exists (select 1 from entity_gods where entity_id = def_av.id and player_id = me.id) then raise exception 'To twój własny awatar.'; end if;
    select * into att_occ from hex_occupants where entity_id = att_av.id;
    select * into def_occ from hex_occupants where entity_id = def_av.id;
    if att_occ.id is null or def_occ.id is null then raise exception 'Obaj awatarzy muszą stać na mapie.'; end if;
    if hex_distance(att_occ.q, att_occ.r, def_occ.q, def_occ.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy. Najpierw wyślij go na pielgrzymkę.'; end if;
    select p.* into def from entity_gods eg join players p on p.id = eg.player_id where eg.entity_id = def_av.id order by (eg.role = 'creator') desc, p.seat_order limit 1;
    if def.id is null then raise exception 'Ten awatar nie ma bóstwa.'; end if;
    cost := action_cost('avatar_duel', g.era);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + pmod;
    update players set logos = logos - cost where id = me.id;
    insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                          attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total, attacker_avatar_id, defender_avatar_id)
    values (p_game_id, g.round_number, g.era, 'avatar_duel', me.id, def.id, null, null, null, cost, attr, d1, d2, mod, d1 + d2 + mod, att_av.id, def_av.id)
    returning * into c;
    insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, att_av.id,
            jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
            jsonb_build_object('kind', 'avatar_duel', 'contest_id', c.id, 'defender_id', def.id, 'attacker_avatar', att_av.name, 'attacker_emoji', att_av.emoji,
                               'defender_avatar', def_av.name, 'defender_emoji', def_av.emoji, 'cost', cost), '')
    returning * into log_row;
    update contests set log_id = log_row.id where id = c.id;
    return c;
  end if;

  select * into def from players where id = nullif(p_payload->>'defender_id', '')::uuid and game_id = p_game_id;
  if def.id is null or def.id = me.id then raise exception 'Wskaż inne bóstwo.'; end if;
  select * into target from entities
  where id = nullif(p_payload->>(case when p_kind = 'convert' then 'city_id' else 'target_city_id' end), '')::uuid
    and game_id = p_game_id and kind = 'civilization' and status = 'active';
  select * into tcity from cities where entity_id = target.id;
  if target.id is null or tcity.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
  if player_dots(target.id, def.id) = 0 then raise exception 'To bóstwo nie ma tam wyznawców.'; end if;

  if p_kind = 'convert' then
    -- the avatar steps into the city and preaches there
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, tcity.q, tcity.r);
    cost := action_cost('convert', g.era);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    av_moved := avatar_enter(p_game_id, av.id, tcity.q, tcity.r, 'miasta, w którym nawraca');
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + pmod;
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
    -- the avatar steps into the city that raises the army and leads it like a general, with its life
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, scity.q, scity.r);
    cost := action_cost('holy_war', g.era) + hex_distance(scity.q, scity.r, tcity.q, tcity.r);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    av_moved := avatar_enter(p_game_id, av.id, scity.q, scity.r, 'miasta, które wystawia armię');
    av_hp := coalesce(av.hp, 0);
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + army + pmod + av_hp;
  end if;

  update players set logos = logos - cost where id = me.id;
  if p_kind = 'holy_war' then perform city_remove_dots(source.id, me.id, army); end if;

  insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                        attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total, attacker_avatar_id)
  values (p_game_id, g.round_number, g.era, p_kind, me.id, def.id, target.id, source.id, nullif(army, 0), cost,
          attr, d1, d2, mod, d1 + d2 + mod, av.id)
  returning * into c;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, target.id,
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
          jsonb_build_object('kind', p_kind, 'contest_id', c.id, 'defender_id', def.id, 'target_city_id', target.id, 'target_name', target.name,
                             'source_city_id', source.id, 'source_name', source.name, 'army', nullif(army, 0), 'cost', cost, 'full_cost', cost,
                             'attacker_avatar_hp', case when p_kind = 'holy_war' then av_hp else null end,
                             'avatar', jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji, 'entered', av_moved)),
          '')
  returning * into log_row;
  update contests set log_id = log_row.id where id = c.id;
  return c;
end $$;

-- ---------- contests: the defender's tiles; after a war the avatar stands where it ended ----------
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
  av_to jsonb := null; av_wound int := 0;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.defender_id then raise exception 'Odpowiada tylko broniące się bóstwo.' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'To starcie już rozstrzygnięto.'; end if;
  perform assert_attr(c.kind, p_attr, 'defence');
  pmod := consume_prophecy(c.game_id, me.id, p_prophecy_id, c.round_number, c.era);
  select * into g from games where id = c.game_id for update;
  select * into att from players where id = c.attacker_id;
  select * into target from entities where id = c.target_city_id;

  def_dots := case when c.target_city_id is null then 0 else player_dots(c.target_city_id, me.id) end;
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
    a := city_remove_atheists(c.target_city_id, k);
    converted := a + city_remove_dots(c.target_city_id, me.id, k - a);
    perform city_add_dots(c.target_city_id, c.attacker_id, converted);
    oc := jsonb_build_object('kind', 'convert', 'diff', diff, 'converted', converted, 'from_atheists', a);
  else
    if diff >= 3 then
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
    if def_lost > 0 then perform collect_souls(c.target_city_id, me.id, def_lost); end if;
    if att_lost > 0 and c.source_city_id is not null then perform collect_souls(c.source_city_id, c.attacker_id, att_lost); end if;
    if returned > 0 and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
      perform city_add_dots(c.source_city_id, c.attacker_id, returned);
    end if;
    source_gone := c.source_city_id is not null and destroy_city_if_empty(c.source_city_id, g.round_number, g.era);
    -- the general: after a victory it stands in the taken city (when there is room); a rout wounds it
    if c.attacker_avatar_id is not null then
      select * into att_av from entities where id = c.attacker_avatar_id and status = 'active';
      if att_av.id is not null then
        if diff >= 1 and tcity.entity_id is not null and hex_slot_for_role(c.game_id, tcity.q, tcity.r, 'avatar') is not null then
          update hex_occupants set q = tcity.q, r = tcity.r, slot = hex_slot_for_role(c.game_id, tcity.q, tcity.r, 'avatar') where game_id = c.game_id and entity_id = att_av.id;
          av_to := jsonb_build_object('q', tcity.q, 'r', tcity.r);
        elsif diff <= -3 then
          av_wound := wound_avatar(att_av.id, 1, c.attacker_id, g.round_number, g.era);
        end if;
        select * into att_av from entities where id = c.attacker_avatar_id;
      end if;
    end if;
    oc := jsonb_build_object('kind', 'holy_war', 'diff', diff, 'army', c.army, 'removed', removed, 'converted', converted,
                                  'defender_lost', removed + def_lost, 'attacker_lost', att_lost, 'returned', returned,
                                  'successes', case when diff >= 1 then c.army else 0 end, 'pending', diff >= 1,
                                  'source_city_id', c.source_city_id, 'source_destroyed', source_gone,
                                  'defender_avatar_hp', def_av_hp, 'defender_avatar_name', def_av.name, 'defender_avatar_emoji', def_av.emoji,
                                  'attacker_avatar_hp', (select (l.outcome->>'attacker_avatar_hp')::int from actions_log l where l.id = c.log_id),
                                  'attacker_avatar_name', att_av.name, 'attacker_avatar_emoji', att_av.emoji, 'attacker_avatar_to', av_to,
                                  'attacker_avatar_wound', av_wound, 'attacker_avatar_dead', coalesce(att_av.status = 'dead', false));
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

  update games set verse_pending_by = c.attacker_id where id = c.game_id;
  perform recompute_turn(c.game_id);
  return c;
end $$;

-- ---------- the night: drought and plague take their toll before the world moves ----------
create or replace function night_blights(p_game_id uuid)
returns void language plpgsql as $$
declare
  hx record;
  city entities;
  lost jsonb;
  killed jsonb := null;
  pid uuid;
  occ record;
  gone boolean;
  g games;
begin
  select * into g from games where id = p_game_id;
  for hx in select h.q, h.r, h.plague_rounds, h.drought_rounds from hexes h where h.game_id = p_game_id and (h.plague_rounds > 0 or h.drought_rounds > 0) order by h.q, h.r loop
    if hx.plague_rounds > 0 then
      lost := '[]'::jsonb; killed := null; gone := false;
      select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = hx.q and c.r = hx.r and e.status = 'active';
      if city.id is not null then
        for i in 1..2 loop
          pid := city_remove_random_dot(city.id);
          if pid is not null then
            perform collect_souls(city.id, pid, 1);
            lost := lost || jsonb_build_array(jsonb_build_object('player_id', pid, 'n', 1));
          end if;
        end loop;
        gone := destroy_city_if_empty(city.id, g.round_number, g.era);
      else
        select o.id as occ_id, e.id, e.name, e.emoji into occ from hex_occupants o join entities e on e.id = o.entity_id
        where o.game_id = p_game_id and o.q = hx.q and o.r = hx.r and e.kind = 'creature' and not is_sapient(e) order by random() limit 1;
        if found then
          killed := jsonb_build_object('entity_id', occ.id, 'name', occ.name, 'emoji', occ.emoji, 'extinct', night_remove_occupant(occ.occ_id));
        end if;
      end if;
      perform night_log(p_game_id, 'night_plague', null,
        jsonb_build_object('q', hx.q, 'r', hx.r, 'city_id', city.id, 'name', city.name, 'lost', lost, 'killed', killed, 'city_destroyed', gone, 'rounds_left', hx.plague_rounds - 1));
      update hexes set plague_rounds = plague_rounds - 1 where game_id = p_game_id and q = hx.q and r = hx.r;
      city := null;
    end if;
    if hx.drought_rounds > 0 then
      killed := null;
      select o.id as occ_id, e.id, e.name, e.emoji into occ from hex_occupants o join entities e on e.id = o.entity_id
      where o.game_id = p_game_id and o.q = hx.q and o.r = hx.r and creature_role(e) = 'herbivore' limit 1;
      if found then
        killed := jsonb_build_object('entity_id', occ.id, 'name', occ.name, 'emoji', occ.emoji, 'extinct', night_remove_occupant(occ.occ_id));
      end if;
      select e.* into city from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and c.q = hx.q and c.r = hx.r and e.status = 'active';
      perform night_log(p_game_id, 'night_drought', null,
        jsonb_build_object('q', hx.q, 'r', hx.r, 'city_id', city.id, 'name', city.name, 'killed', killed, 'rounds_left', hx.drought_rounds - 1));
      update hexes set drought_rounds = drought_rounds - 1 where game_id = p_game_id and q = hx.q and r = hx.r;
      city := null;
    end if;
  end loop;
end $$;

create or replace function night_start(p_game_id uuid, p_by uuid)
returns chaos_nights language plpgsql as $$
declare
  g games;
  nt chaos_nights;
  qd jsonb;
  counts jsonb;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;
  select * into nt from chaos_nights where game_id = p_game_id;
  if nt.game_id is not null and nt.round_number = g.round_number and nt.status <> 'done' then raise exception 'Noc już trwa.'; end if;
  perform night_blights(p_game_id);
  with herds as (
    select o.id, 'herbivore' as t from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and creature_role(e) = 'herbivore' order by random()
  ), beasts as (
    select o.id, 'beast' as t from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and creature_role(e) = 'beast' order by random()
  ), tribes as (
    select o.id, 'tribe' as t from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and creature_role(e) = 'tribe'
      and not exists (select 1 from cities c where c.game_id = o.game_id and c.q = o.q and c.r = o.r) order by random()
  ), towns as (
    select c.entity_id as id, 'city' as t from cities c join entities e on e.id = c.entity_id where c.game_id = p_game_id and e.status = 'active' order by random()
  ), all_units as (
    select id, t, 1 as grp from herds union all select id, t, 2 from beasts union all select id, t, 3 from tribes union all select id, t, 4 from towns
  )
  select coalesce(jsonb_agg(jsonb_build_object('t', t, 'id', id) order by grp), '[]'::jsonb),
         jsonb_build_object('herbivores', count(*) filter (where t = 'herbivore'), 'beasts', count(*) filter (where t = 'beast'),
                            'tribes', count(*) filter (where t = 'tribe'), 'cities', count(*) filter (where t = 'city'))
  into qd, counts from all_units;
  insert into chaos_nights (game_id, round_number, status, queue, cursor, pending, started_by, updated_at)
  values (p_game_id, g.round_number, 'running', qd, 0, null, p_by, now())
  on conflict (game_id) do update set round_number = excluded.round_number, status = 'running', queue = excluded.queue, cursor = 0, pending = null, started_by = excluded.started_by, updated_at = now()
  returning * into nt;
  perform night_log(p_game_id, 'night_begin', null, counts);
  return nt;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'hex_fertility(uuid, int, int)', 'action_attrs(text, text)', 'action_cost(text, smallint)',
    'perform_action(uuid, text, jsonb)', 'declare_contest(uuid, text, jsonb)', 'answer_contest(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
