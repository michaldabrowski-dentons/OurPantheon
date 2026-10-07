-- 0013: the world begins as an ocean (gods raise the land themselves), and nothing lives on water or in the
-- mountains: creatures, sapients and avatars are placed and migrate only onto land. Avatars no longer need
-- conditions (traits of every kind left the game; the columns stay, unused). perform_action is replaced.

create or replace function generate_map(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from hexes where game_id = p_game_id;
  for q in -5..5 loop
    for r in -5..5 loop
      if hex_in_map(q, r) then
        insert into hexes (game_id, q, r, biome, decor) values (p_game_id, q, r, 'woda', '[]'::jsonb);
      end if;
    end loop;
  end loop;
end $$;

-- ---------- actions on the map (see 0012 for the payloads) ----------
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


do $$
declare fn text;
begin
  foreach fn in array array['generate_map(uuid)', 'perform_action(uuid, text, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
