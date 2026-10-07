-- 0017: the words know every painted terrain (biome_known), avatars need no conditions (as 0013 said;
-- repeated here for databases that skipped it), a ruined city remembers where it stood
-- (entities.attributes.ruin = {q, r}, so the map can mark it), and new prices: Migracja 3/1/3,
-- Exodus 12/8/4 plus the distance, Święta Wojna 8/6/4 plus the distance.

create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'           then (array[2, 5, 12])[p_era]
    when 'catastrophe'          then 10
    when 'great_miracle'        then (array[15, 30, 50])[p_era]
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
    when 'command_avatar'       then 2
    when 'resurrect_avatar'     then (array[12, 15, 25])[p_era]
    else null
  end;
$$;

-- a city without a single follower is wiped off the map; its place is kept for the skull
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
  update entities set status = 'destroyed', attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object('ruin', jsonb_build_object('q', c.q, 'r', c.r)) where id = p_city;
  delete from cities where entity_id = p_city;
  insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, outcome, summary)
  values (e.game_id, p_round, p_era, null, 'city_destroyed', p_city,
          jsonb_build_object('name', e.name, 'q', c.q, 'r', c.r), '');
  return true;
end $$;

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

  elsif p_action_key = 'catastrophe' then
    if nullif(trim(coalesce(p_payload->>'type', '')), '') is null then raise exception 'Wybierz rodzaj kataklizmu.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;

  elsif p_action_key in ('create_creature', 'create_sapient', 'create_avatar') then
    if emo is null then raise exception 'Wybierz emotikonę.'; end if;
    if exists (select 1 from entities where game_id = p_game_id and emoji = emo) then raise exception 'Ta emotikona należy już do kogoś innego.'; end if;
    if hq is null or not hex_in_map(hq, hr) then raise exception 'Wskaż heks.'; end if;
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
    hslot := coalesce(nullif(p_payload->>'slot', '')::int, hex_free_slot(p_game_id, hq, hr));
    if hslot is null then raise exception 'Na tym heksie nie ma już miejsca.'; end if;
    if exists (select 1 from hex_occupants where game_id = p_game_id and q = hq and r = hr and slot = hslot) then raise exception 'To miejsce jest zajęte.'; end if;

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
    select * into hx from hexes where game_id = p_game_id and q = tq and r = tr;
    if hex_blocked(hx.biome) then raise exception 'Na wodzie ani w górach nikt nie zamieszka.'; end if;
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
    cost := action_cost('holy_war', g.era) + hex_distance(scity.q, scity.r, tcity.q, tcity.r);
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


do $$
declare fn text;
begin
  foreach fn in array array['action_cost(text, smallint)', 'destroy_city_if_empty(uuid, int, smallint)', 'perform_action(uuid, text, jsonb)', 'declare_contest(uuid, text, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
