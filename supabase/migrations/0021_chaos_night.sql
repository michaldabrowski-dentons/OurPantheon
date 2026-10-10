-- 0021: the night of Chaos. After the card the world moves one step at a time: herds graze and breed,
-- beasts hunt and fight, tribes wander and settle, cities roll a d6 against the fertility of their land
-- and send their surplus away. Fights wait for the gods to roll (the host may roll for the absent),
-- a new city waits for its name. The host may skip the rest. The old "+1 for the ruler" growth is gone.
-- Table: chaos_nights. Public: start_chaos_night, chaos_step, chaos_fight_roll, chaos_name_city,
-- chaos_skip; end_chaos_phase stays as the old door (any member) that skips the night.

create table if not exists chaos_nights (
  game_id uuid primary key references games (id) on delete cascade,
  round_number int not null,
  status text not null check (status in ('running', 'fight', 'naming', 'done')),
  queue jsonb not null default '[]'::jsonb,
  cursor int not null default 0,
  pending jsonb,
  started_by uuid references players (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table chaos_nights enable row level security;
drop policy if exists "chaos_nights readable" on chaos_nights;
create policy "chaos_nights readable" on chaos_nights for select to authenticated using (is_game_member(game_id));
alter table chaos_nights replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chaos_nights') then
    alter publication supabase_realtime add table chaos_nights;
  end if;
end $$;

-- ---------- small helpers ----------
create or replace function entity_creator(p_entity uuid)
returns uuid language sql stable as $$
  select player_id from entity_gods where entity_id = p_entity order by (role = 'creator') desc limit 1;
$$;

create or replace function night_log(p_game_id uuid, p_key text, p_roll jsonb, p_outcome jsonb)
returns uuid language plpgsql as $$
declare
  g games;
  lid uuid;
begin
  select * into g from games where id = p_game_id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, null, p_key, p_roll, p_outcome, '')
  returning id into lid;
  return lid;
end $$;

create or replace function night_touch(p_game_id uuid)
returns void language sql as $$
  update chaos_nights set updated_at = now() where game_id = p_game_id;
$$;

-- may this thing walk onto that field at all
create or replace function night_land_ok(p_game_id uuid, p_q int, p_r int, p_role text)
returns boolean language plpgsql stable as $$
declare
  b text;
begin
  select biome into b from hexes where game_id = p_game_id and q = p_q and r = p_r;
  if b is null then return false; end if;
  if p_role in ('herbivore', 'beast') then
    if b = 'woda' then return false; end if;
    if p_role = 'beast' and exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_q and c.r = p_r) then return false; end if;
    return true;
  end if;
  if p_role = 'tribe' then
    if hex_blocked(b) then return false; end if;
    if exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_q and c.r = p_r) then return false; end if;
    return true;
  end if;
  return false;
end $$;

-- 'free' when the field has room for this thing, 'fight' when someone of the bottom slot must be fought, null otherwise
create or replace function night_enterable(p_game_id uuid, p_q int, p_r int, p_entity uuid, p_role text)
returns text language plpgsql stable as $$
declare
  other text;
begin
  if not night_land_ok(p_game_id, p_q, p_r, p_role) then return null; end if;
  if exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and entity_id = p_entity) then return null; end if;
  if p_role = 'herbivore' then
    return case when exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and slot = 0) then null else 'free' end;
  end if;
  select creature_role(e) into other from hex_occupants o join entities e on e.id = o.entity_id
  where o.game_id = p_game_id and o.q = p_q and o.r = p_r and o.slot = 1;
  if other is null then return 'free'; end if;
  if p_role = 'beast' and other in ('beast', 'tribe') then return 'fight'; end if;
  if p_role = 'tribe' and other = 'beast' then return 'fight'; end if;
  return null;
end $$;

create or replace function night_candidates(p_game_id uuid, p_occ hex_occupants, p_role text)
returns table (q int, r int, mode text, fert int) language sql stable as $$
  select n.q, n.r, night_enterable(p_game_id, n.q, n.r, p_occ.entity_id, p_role), coalesce(hex_fertility(p_game_id, n.q, n.r), -99)
  from hex_neighbours(p_occ.q, p_occ.r) n
  where night_enterable(p_game_id, n.q, n.r, p_occ.entity_id, p_role) is not null;
$$;

-- how far the nearest wild herd is (herds inside cities do not count)
create or replace function night_herd_distance(p_game_id uuid, p_q int, p_r int)
returns int language sql stable as $$
  select min(hex_distance(p_q, p_r, o.q, o.r))::int from hex_occupants o join entities e on e.id = o.entity_id
  where o.game_id = p_game_id and creature_role(e) = 'herbivore'
    and not exists (select 1 from cities c where c.game_id = o.game_id and c.q = o.q and c.r = o.r);
$$;

-- takes a thing off the field; true when its kind is gone from the world
create or replace function night_remove_occupant(p_occ uuid)
returns boolean language plpgsql as $$
declare
  o hex_occupants;
begin
  select * into o from hex_occupants where id = p_occ;
  if o.id is null then return false; end if;
  delete from hex_occupants where id = p_occ;
  if not exists (select 1 from hex_occupants where entity_id = o.entity_id) then
    update entities set status = 'dead' where id = o.entity_id;
    return true;
  end if;
  return false;
end $$;

-- the loser runs to a free neighbouring field; it dies when there is none
create or replace function night_flee(p_game_id uuid, p_occ uuid, p_role text)
returns jsonb language plpgsql as $$
declare
  o hex_occupants;
  tgt record;
  extinct boolean;
begin
  select * into o from hex_occupants where id = p_occ;
  if o.id is null then return jsonb_build_object('to', null, 'removed', true, 'extinct', false); end if;
  select c.q, c.r into tgt from night_candidates(p_game_id, o, p_role) c where c.mode = 'free' order by random() limit 1;
  if found then
    update hex_occupants set q = tgt.q, r = tgt.r where id = o.id;
    return jsonb_build_object('to', jsonb_build_object('q', tgt.q, 'r', tgt.r), 'removed', false, 'extinct', false);
  end if;
  extinct := night_remove_occupant(o.id);
  return jsonb_build_object('to', null, 'removed', true, 'extinct', extinct);
end $$;

-- a side of a fight as the window shows it
create or replace function night_side_creature(p_game_id uuid, p_entity uuid, p_occ uuid, p_clone_of uuid)
returns jsonb language plpgsql stable as $$
declare
  e entities;
begin
  select * into e from entities where id = p_entity;
  return jsonb_build_object('label', e.name, 'emoji', e.emoji, 'entity_id', e.id, 'occupant_id', p_occ, 'clone_of', p_clone_of,
                            'player_id', entity_creator(e.id), 'mod', case when creature_role(e) = 'beast' then e.strength else 0 end, 'roll', null);
end $$;

create or replace function night_open_fight(p_game_id uuid, p_scene text, p_left jsonb, p_right jsonb, p_at jsonb, p_origin jsonb, p_extra jsonb, p_log_id uuid)
returns void language plpgsql as $$
begin
  update chaos_nights set status = 'fight', updated_at = now(),
    pending = jsonb_build_object('kind', 'fight', 'since', now(), 'scene', p_scene, 'log_id', p_log_id,
                                 'left', p_left, 'right', p_right, 'at', p_at, 'origin', p_origin) || coalesce(p_extra, '{}'::jsonb)
  where game_id = p_game_id;
end $$;

-- ---------- groups of people on the move ----------
create or replace function night_groups_total(p_groups jsonb)
returns int language sql immutable as $$
  select coalesce(sum((g->>'n')::int), 0)::int from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) g;
$$;

-- splits k groups off (the godless first): {"taken": [...], "rest": [...]}
create or replace function night_split_groups(p_groups jsonb, k int)
returns jsonb language plpgsql immutable as $$
declare
  taken jsonb := '[]'::jsonb;
  rest jsonb := '[]'::jsonb;
  g jsonb;
  left_k int := greatest(0, k);
  n int;
  t int;
begin
  for g in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x order by (x->>'player_id') is not null loop
    n := (g->>'n')::int;
    t := least(n, left_k);
    if t > 0 then taken := taken || jsonb_build_array(g || jsonb_build_object('n', t)); end if;
    if n - t > 0 then rest := rest || jsonb_build_array(g || jsonb_build_object('n', n - t)); end if;
    left_k := left_k - t;
  end loop;
  return jsonb_build_object('taken', taken, 'rest', rest);
end $$;

-- the groups settle in a city (the godless as the godless); returns how many found no room
create or replace function night_join_groups(p_city uuid, p_groups jsonb)
returns int language plpgsql as $$
declare
  g jsonb;
  wasted int := 0;
  n int;
begin
  if p_city is null or not exists (select 1 from cities where entity_id = p_city) then return night_groups_total(p_groups); end if;
  for g in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x loop
    n := (g->>'n')::int;
    if g->>'player_id' is null then
      wasted := wasted + n - city_add_atheists(p_city, n);
    else
      wasted := wasted + n - city_add_dots(p_city, (g->>'player_id')::uuid, n);
    end if;
  end loop;
  return wasted;
end $$;

-- the fallen of each god go to its afterlife; the godless simply vanish
create or replace function night_bury_groups(p_source_city uuid, p_groups jsonb)
returns void language plpgsql as $$
declare
  g jsonb;
begin
  for g in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x loop
    if g->>'player_id' is not null then perform collect_souls(p_source_city, (g->>'player_id')::uuid, (g->>'n')::int); end if;
  end loop;
end $$;

-- the god with the most groups names the city; a tie or the godless alone: chance
create or replace function night_groups_namer(p_game_id uuid, p_groups jsonb)
returns uuid language plpgsql as $$
declare
  best uuid;
  best_n int := 0;
  tie boolean := false;
  g jsonb;
begin
  for g in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x where x->>'player_id' is not null order by (x->>'n')::int desc loop
    if (g->>'n')::int > best_n then best := (g->>'player_id')::uuid; best_n := (g->>'n')::int; tie := false;
    elsif (g->>'n')::int = best_n then tie := true;
    end if;
  end loop;
  if best is null or tie then
    select id into best from players where game_id = p_game_id order by random() limit 1;
  end if;
  return best;
end $$;

-- a city rises in the night: a placeholder name until its god speaks
create or replace function night_found_city(p_game_id uuid, p_q int, p_r int, p_species uuid, p_groups jsonb, p_namer uuid, p_by text, p_from_city uuid)
returns uuid language plpgsql as $$
declare
  g games;
  sp entities;
  mother entities;
  cid uuid;
  placeholder text;
  gj jsonb;
  atheists int := 0;
  lid uuid;
  slot int;
begin
  select * into g from games where id = p_game_id;
  select * into sp from entities where id = p_species;
  if p_from_city is not null then select * into mother from entities where id = p_from_city; end if;
  placeholder := 'Osada ' || coalesce(sp.name, 'bez imienia');
  insert into entities (game_id, kind, name, description, traits, specialties, flaws, parent_civilization_id, created_round, created_era, created_by_player_id)
  values (p_game_id, 'civilization', placeholder, '', coalesce(mother.traits, '{}'), coalesce(mother.specialties, '{}'), coalesce(mother.flaws, '{}'),
          p_from_city, g.round_number, g.era, p_namer)
  returning id into cid;
  if sp.id is not null then
    insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (cid, sp.id, p_game_id, 'member_species') on conflict do nothing;
  end if;
  for gj in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x where x->>'player_id' is null loop
    atheists := atheists + (gj->>'n')::int;
  end loop;
  insert into cities (entity_id, game_id, q, r, atheists) values (cid, p_game_id, p_q, p_r, least(10, atheists));
  for gj in select x from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) x where x->>'player_id' is not null loop
    perform city_add_dots(cid, (gj->>'player_id')::uuid, (gj->>'n')::int);
  end loop;
  -- the people stand on their field
  if sp.id is not null and not exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and entity_id = sp.id) then
    slot := hex_slot_for_role(p_game_id, p_q, p_r, 'tribe');
    if slot is not null then insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, p_q, p_r, slot, sp.id); end if;
  end if;
  lid := night_log(p_game_id, 'night_city_founded', null,
    jsonb_build_object('city_id', cid, 'q', p_q, 'r', p_r, 'species_id', sp.id, 'species_name', sp.name, 'emoji', sp.emoji, 'namer_id', p_namer,
                       'name', placeholder, 'name_pending', true, 'placeholder', false, 'by', p_by, 'from_city_id', p_from_city, 'from_name', mother.name,
                       'groups', p_groups, 'population', city_dots(cid), 'biome', (select biome from hexes where game_id = p_game_id and q = p_q and r = p_r)));
  update chaos_nights set status = 'naming', updated_at = now(),
    pending = jsonb_build_object('kind', 'naming', 'since', now(), 'city_id', cid, 'namer_id', p_namer, 'log_id', lid, 'placeholder', placeholder, 'q', p_q, 'r', p_r)
  where game_id = p_game_id;
  return cid;
end $$;

-- ---------- the units of the night ----------
create or replace function night_unit_herbivore(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d int := roll_d6();
  tame boolean;
  res text := 'idle';
  tgt record;
  new_id uuid;
  to_j jsonb := null;
  clone_j jsonb := null;
begin
  select * into e from entities where id = p_occ.entity_id;
  tame := exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_occ.q and c.r = p_occ.r)
       or exists (select 1 from hex_occupants o join entities x on x.id = o.entity_id where o.game_id = p_game_id and o.q = p_occ.q and o.r = p_occ.r and o.slot = 1 and creature_role(x) = 'tribe');
  if d <= 2 then
    res := case when tame then 'tame' else 'idle' end;
  elsif d <= 5 and tame then
    res := 'tame';
  elsif d = 3 then
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by random() limit 1;
    if found then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'move'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
  elsif d <= 5 then
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by c.fert desc, random() limit 1;
    if found then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'move_best'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
  else
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by c.fert desc, random() limit 1;
    if found then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 0, e.id) returning id into new_id;
      res := 'reproduce'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
    else
      res := 'crowded';
    end if;
  end if;
  perform night_log(p_game_id, 'night_move', jsonb_build_object('d1', d, 'kind', 'd6'),
    jsonb_build_object('unit', 'herbivore', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', 0,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_id,
                       'fertility_to', case when coalesce(to_j, clone_j) is null then null else hex_fertility(p_game_id, (coalesce(to_j, clone_j)->>'q')::int, (coalesce(to_j, clone_j)->>'r')::int) end));
end $$;

-- where a beast steps when it hunts: towards the nearest herd, else towards the richest land
create or replace function night_hunt_target(p_game_id uuid, p_occ hex_occupants)
returns table (q int, r int, mode text) language plpgsql stable as $$
declare
  herd_d int;
begin
  if exists (select 1 from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = p_occ.q and o.r = p_occ.r and creature_role(e) = 'herbivore') then
    return;
  end if;
  herd_d := night_herd_distance(p_game_id, p_occ.q, p_occ.r);
  if herd_d is null then
    return query select c.q, c.r, c.mode from night_candidates(p_game_id, p_occ, 'beast') c order by c.fert desc, random() limit 1;
  else
    return query select c.q, c.r, c.mode from night_candidates(p_game_id, p_occ, 'beast') c order by night_herd_distance(p_game_id, c.q, c.r) asc nulls last, random() limit 1;
  end if;
end $$;

create or replace function night_unit_beast(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d int := roll_d6();
  res text := 'idle';
  tgt record;
  to_j jsonb := null;
  clone_j jsonb := null;
  new_id uuid;
  lid uuid;
  cty record;
  avr record;
  fight_scene text := null;
  fight_right jsonb := null;
  fight_at jsonb := null;
  clone_fight boolean := false;
begin
  select * into e from entities where id = p_occ.entity_id;
  if d <= 2 then
    res := 'idle';
  elsif d = 3 then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'beast') c order by random() limit 1;
    if found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'move'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_scene := 'creature'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif d <= 5 then
    -- a weaker city or avatar next door is prey
    select c.entity_id, c.q, c.r, x.name into cty from cities c join entities x on x.id = c.entity_id
    where c.game_id = p_game_id and x.status = 'active' and hex_distance(p_occ.q, p_occ.r, c.q, c.r) = 1 and city_dots(c.entity_id) < e.strength
    order by random() limit 1;
    if found then
      res := 'attack'; fight_scene := 'beast_city'; fight_at := jsonb_build_object('q', cty.q, 'r', cty.r);
      fight_right := jsonb_build_object('label', cty.name, 'emoji', city_species_emoji(cty.entity_id), 'entity_id', cty.entity_id, 'city_id', cty.entity_id,
                                        'player_id', city_majority(cty.entity_id), 'mod', city_dots(cty.entity_id), 'roll', null);
    else
      select x.id, x.name, x.emoji, x.hp, o.q, o.r into avr from hex_occupants o join entities x on x.id = o.entity_id
      where o.game_id = p_game_id and x.kind = 'avatar' and x.status = 'active' and hex_distance(p_occ.q, p_occ.r, o.q, o.r) = 1 and coalesce(x.hp, 0) < e.strength
      order by random() limit 1;
      if found then
        res := 'attack'; fight_scene := 'beast_avatar'; fight_at := jsonb_build_object('q', avr.q, 'r', avr.r);
        fight_right := jsonb_build_object('label', avr.name, 'emoji', avr.emoji, 'entity_id', avr.id, 'avatar_id', avr.id,
                                          'player_id', entity_creator(avr.id), 'mod', coalesce(avr.hp, 0), 'roll', null);
      else
        select h.q, h.r, h.mode into tgt from night_hunt_target(p_game_id, p_occ) h;
        if found then
          if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'hunt'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
          else res := 'fight'; fight_scene := 'creature'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
        else
          res := 'sated';
        end if;
      end if;
    end if;
  else
    select h.q, h.r, h.mode into tgt from night_hunt_target(p_game_id, p_occ) h;
    if found then
      if tgt.mode = 'free' then
        insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 1, e.id) returning id into new_id;
        res := 'pack'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else
        res := 'fight'; fight_scene := 'creature'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); clone_fight := true;
      end if;
    else
      res := 'crowded';
    end if;
  end if;
  lid := night_log(p_game_id, 'night_move', jsonb_build_object('d1', d, 'kind', 'd6'),
    jsonb_build_object('unit', 'beast', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', e.strength,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_id,
                       'fight_at', fight_at, 'scene', fight_scene,
                       'fertility_to', case when to_j is null then null else hex_fertility(p_game_id, (to_j->>'q')::int, (to_j->>'r')::int) end));
  if fight_scene = 'creature' then
    select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id),
                              'mod', case when creature_role(x) = 'beast' then x.strength else 0 end, 'roll', null)
    into fight_right
    from hex_occupants o join entities x on x.id = o.entity_id
    where o.game_id = p_game_id and o.q = (fight_at->>'q')::int and o.r = (fight_at->>'r')::int and o.slot = 1;
  end if;
  if fight_scene is not null then
    perform night_open_fight(p_game_id, fight_scene,
      night_side_creature(p_game_id, e.id, case when clone_fight then null else p_occ.id end, case when clone_fight then e.id else null end),
      fight_right, fight_at, jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, lid);
  end if;
end $$;

create or replace function night_unit_tribe(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d int := roll_d6();
  res text := 'camp';
  tgt record;
  to_j jsonb := null;
  clone_j jsonb := null;
  new_id uuid;
  lid uuid;
  fight_at jsonb := null;
  fight_right jsonb := null;
  cid uuid;
  f int;
begin
  select * into e from entities where id = p_occ.entity_id;
  if exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_occ.q and c.r = p_occ.r) then
    res := 'people';
    perform night_log(p_game_id, 'night_move', jsonb_build_object('d1', d, 'kind', 'd6'),
      jsonb_build_object('unit', 'tribe', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', 0,
                         'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res));
    return;
  end if;
  if d <= 2 then
    res := 'camp';
  elsif d = 3 then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'tribe') c order by random() limit 1;
    if found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'move'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif d <= 5 then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'tribe') c order by c.fert desc, random() limit 1;
    if found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'move_best'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  else
    f := hex_fertility(p_game_id, p_occ.q, p_occ.r);
    if coalesce(f, -1) >= 1 then
      res := 'settle';
    else
      select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'tribe') c where c.mode = 'free' order by c.fert desc, random() limit 1;
      if found then
        insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 1, e.id) returning id into new_id;
        res := 'split'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else
        res := 'crowded';
      end if;
    end if;
  end if;
  lid := night_log(p_game_id, 'night_move', jsonb_build_object('d1', d, 'kind', 'd6'),
    jsonb_build_object('unit', 'tribe', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', 0,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_id,
                       'fight_at', fight_at, 'scene', case when fight_at is null then null else 'creature' end,
                       'fertility_to', case when to_j is null then null else hex_fertility(p_game_id, (to_j->>'q')::int, (to_j->>'r')::int) end));
  if res = 'settle' then
    cid := night_found_city(p_game_id, p_occ.q, p_occ.r, e.id, jsonb_build_array(jsonb_build_object('player_id', null, 'n', 1)), coalesce(entity_creator(e.id), night_groups_namer(p_game_id, '[]'::jsonb)), 'tribe', null);
    update actions_log set outcome = outcome || jsonb_build_object('new_city_id', cid) where id = lid;
  elsif fight_at is not null then
    select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id), 'mod', x.strength, 'roll', null)
    into fight_right
    from hex_occupants o join entities x on x.id = o.entity_id
    where o.game_id = p_game_id and o.q = (fight_at->>'q')::int and o.r = (fight_at->>'r')::int and o.slot = 1;
    perform night_open_fight(p_game_id, 'creature', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, fight_at, jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, lid);
  end if;
end $$;

create or replace function night_unit_city(p_game_id uuid, p_city uuid)
returns void language plpgsql as $$
declare
  g games;
  c cities;
  e entities;
  f int;
  p int;
  d int := roll_d6();
  res text;
  overflow int := 0;
  groups jsonb := '[]'::jsonb;
  namer uuid;
  species uuid;
  tgt record;
  target_kind text := null;
  target_j jsonb := null;
  new_city uuid := null;
  lid uuid;
  gone boolean := false;
  added int := 0;
  fight_right jsonb;
  left_side jsonb;
begin
  select * into g from games where id = p_game_id;
  select * into c from cities where entity_id = p_city;
  select * into e from entities where id = p_city;
  if c.entity_id is null or e.status <> 'active' then return; end if;
  f := coalesce(hex_fertility(p_game_id, c.q, c.r), 0);
  p := city_dots(p_city);
  if d < f then
    added := city_add_atheists(p_city, 1);
    res := case when added > 0 then 'grow' else 'full' end;
  elsif p <= f then
    res := 'stagnate';
  else
    overflow := p - f;
    groups := city_remove_groups(p_city, overflow);
    namer := night_groups_namer(p_game_id, groups);
    select to_entity_id into species from entity_links where from_entity_id = p_city and relation = 'member_species' limit 1;
    -- (a) free, rich land within two fields
    select h.q, h.r into tgt from hexes h
    where h.game_id = p_game_id and hex_distance(c.q, c.r, h.q, h.r) between 1 and 2 and not hex_blocked(h.biome)
      and not exists (select 1 from cities x where x.game_id = p_game_id and x.q = h.q and x.r = h.r)
      and not exists (select 1 from hex_occupants o join entities x on x.id = o.entity_id where o.game_id = p_game_id and o.q = h.q and o.r = h.r and o.slot = 1 and x.id is distinct from species)
    order by coalesce(hex_fertility(p_game_id, h.q, h.r), -99) desc, random() limit 1;
    if found then
      res := 'exodus'; target_kind := 'found'; target_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      new_city := night_found_city(p_game_id, tgt.q, tgt.r, species, groups, namer, 'exodus', p_city);
    else
      -- (b) a weaker beast within two fields
      select o.id as occ_id, o.q, o.r, x.id as entity_id, x.name, x.emoji, x.strength into tgt
      from hex_occupants o join entities x on x.id = o.entity_id
      where o.game_id = p_game_id and creature_role(x) = 'beast' and x.strength < overflow and hex_distance(c.q, c.r, o.q, o.r) between 1 and 2
        and not exists (select 1 from cities y where y.game_id = p_game_id and y.q = o.q and y.r = o.r)
      order by hex_distance(c.q, c.r, o.q, o.r), random() limit 1;
      if found then
        res := 'exodus'; target_kind := 'beast'; target_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
        fight_right := jsonb_build_object('label', tgt.name, 'emoji', tgt.emoji, 'entity_id', tgt.entity_id, 'occupant_id', tgt.occ_id, 'player_id', entity_creator(tgt.entity_id), 'mod', tgt.strength, 'roll', null);
      else
        -- (c) a weaker city within two fields
        select y.entity_id, y.q, y.r, x.name into tgt from cities y join entities x on x.id = y.entity_id
        where y.game_id = p_game_id and y.entity_id <> p_city and x.status = 'active' and hex_distance(c.q, c.r, y.q, y.r) between 1 and 2 and city_dots(y.entity_id) < overflow
        order by hex_distance(c.q, c.r, y.q, y.r), random() limit 1;
        if found then
          res := 'exodus'; target_kind := 'city'; target_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
          fight_right := jsonb_build_object('label', tgt.name, 'emoji', city_species_emoji(tgt.entity_id), 'entity_id', tgt.entity_id, 'city_id', tgt.entity_id,
                                            'player_id', city_majority(tgt.entity_id), 'mod', city_dots(tgt.entity_id), 'roll', null);
        else
          res := 'stay';
          perform night_join_groups(p_city, groups);
        end if;
      end if;
    end if;
    gone := destroy_city_if_empty(p_city, g.round_number, g.era);
  end if;
  lid := night_log(p_game_id, 'night_city', jsonb_build_object('d1', d, 'kind', 'd6'),
    jsonb_build_object('city_id', p_city, 'name', e.name, 'q', c.q, 'r', c.r, 'roll', d, 'fertility', f, 'population', p, 'result', res,
                       'overflow', overflow, 'groups', groups, 'target', target_j, 'target_kind', target_kind, 'new_city_id', new_city,
                       'source_destroyed', gone, 'level', city_dots(p_city)));
  if target_kind in ('beast', 'city') then
    left_side := jsonb_build_object('label', 'Osadnicy z ' || e.name, 'emoji', coalesce((select emoji from entities where id = species), '👤'), 'entity_id', species,
                                    'city_id', p_city, 'player_id', namer, 'mod', night_groups_total(groups), 'roll', null);
    perform night_open_fight(p_game_id, case when target_kind = 'beast' then 'exodus_beast' else 'exodus_city' end, left_side, fight_right, target_j,
      jsonb_build_object('q', c.q, 'r', c.r), jsonb_build_object('groups', groups, 'source_city_id', p_city, 'species_id', species, 'namer_id', namer), lid);
  end if;
end $$;

-- ---------- fights ----------
create or replace function night_resolve_fight(p_game_id uuid)
returns void language plpgsql as $$
declare
  g games;
  nt chaos_nights;
  pd jsonb;
  ls jsonb; rs jsonb;
  scene text;
  diff int;
  at_j jsonb; origin_j jsonb;
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
  groups jsonb; n int; k int; split jsonb;
  dead jsonb := '[]'::jsonb; home jsonb := '[]'::jsonb; settled jsonb := '[]'::jsonb;
  src uuid; species uuid; namer uuid; new_city uuid := null; wasted int := 0;
  oc jsonb;
begin
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  pd := nt.pending;
  if nt.status <> 'fight' or pd is null then return; end if;
  ls := pd->'left'; rs := pd->'right'; scene := pd->>'scene';
  at_j := pd->'at'; origin_j := pd->'origin';
  diff := (ls->'roll'->>'total')::int - (rs->'roll'->>'total')::int;
  if ls->>'occupant_id' is not null then select * into lo from hex_occupants where id = (ls->>'occupant_id')::uuid; end if;
  if rs->>'occupant_id' is not null then select * into ro from hex_occupants where id = (rs->>'occupant_id')::uuid; end if;
  if ls->>'entity_id' is not null then select * into le from entities where id = (ls->>'entity_id')::uuid; end if;
  if rs->>'entity_id' is not null then select * into re from entities where id = (rs->>'entity_id')::uuid; end if;
  l_role := creature_role(le); r_role := creature_role(re);

  if scene = 'creature' then
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
      -- the winner takes the field
      if lo.id is not null then
        update hex_occupants set q = (at_j->>'q')::int, r = (at_j->>'r')::int where id = lo.id;
      elsif le.id is not null and hex_slot_for(p_game_id, (at_j->>'q')::int, (at_j->>'r')::int, le.id) is not null then
        insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, (at_j->>'q')::int, (at_j->>'r')::int, 1, le.id);
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

  elsif scene in ('beast_city', 'beast_avatar') then
    if diff = 0 then
      res := 'return';
    elsif diff > 0 then
      loser := 'right';
      if scene = 'beast_city' then
        city_lost := city_remove_groups((rs->>'city_id')::uuid, diff);
        perform night_bury_groups((rs->>'city_id')::uuid, city_lost);
        city_gone := destroy_city_if_empty((rs->>'city_id')::uuid, g.round_number, g.era);
        res := 'city_hit';
      else
        perform wound_avatar((rs->>'avatar_id')::uuid, diff, null, g.round_number, g.era);
        select hp into av_hp from entities where id = (rs->>'avatar_id')::uuid;
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

  elsif scene in ('exodus_beast', 'exodus_city') then
    groups := pd->'groups'; n := night_groups_total(groups);
    src := (pd->>'source_city_id')::uuid; species := nullif(pd->>'species_id', '')::uuid; namer := nullif(pd->>'namer_id', '')::uuid;
    if diff >= 3 then
      loser := 'right';
      if scene = 'exodus_beast' then
        if ro.id is not null then extinct := night_remove_occupant(ro.id); removed := true; end if;
        settled := groups;
      else
        city_lost := city_remove_groups((rs->>'city_id')::uuid, least(n, (rs->>'mod')::int));
        perform night_bury_groups((rs->>'city_id')::uuid, city_lost);
        settled := groups;
      end if;
    elsif diff >= 1 then
      loser := 'right';
      k := ceil(n / 2.0)::int;
      split := night_split_groups(groups, k);
      dead := split->'taken'; settled := split->'rest';
      if scene = 'exodus_beast' then
        if ro.id is not null then extinct := night_remove_occupant(ro.id); removed := true; end if;
      else
        city_lost := city_remove_groups((rs->>'city_id')::uuid, k);
        perform night_bury_groups((rs->>'city_id')::uuid, city_lost);
      end if;
    elsif diff = 0 then
      split := night_split_groups(groups, 1);
      dead := split->'taken'; home := split->'rest';
      if scene = 'exodus_city' then
        city_lost := city_remove_groups((rs->>'city_id')::uuid, 1);
        perform night_bury_groups((rs->>'city_id')::uuid, city_lost);
      end if;
    elsif diff >= -2 then
      loser := 'left';
      split := night_split_groups(groups, n - 1);
      dead := split->'taken'; home := split->'rest';
      if scene = 'exodus_city' then
        city_lost := city_remove_groups((rs->>'city_id')::uuid, 1);
        perform night_bury_groups((rs->>'city_id')::uuid, city_lost);
      end if;
    else
      loser := 'left';
      dead := groups;
    end if;
    perform night_bury_groups(src, dead);
    if night_groups_total(home) > 0 then wasted := wasted + night_join_groups(src, home); end if;
    if night_groups_total(settled) > 0 then
      if scene = 'exodus_beast' then
        new_city := night_found_city(p_game_id, (at_j->>'q')::int, (at_j->>'r')::int, species, settled, namer, 'exodus', src);
        res := 'founded';
      else
        wasted := wasted + night_join_groups((rs->>'city_id')::uuid, settled);
        res := 'joined';
      end if;
    else
      res := case when night_groups_total(home) > 0 then 'returned' else 'all_dead' end;
    end if;
    if scene = 'exodus_city' then city_gone := destroy_city_if_empty((rs->>'city_id')::uuid, g.round_number, g.era); end if;
    if src is not null then perform destroy_city_if_empty(src, g.round_number, g.era); end if;
  end if;

  oc := jsonb_build_object('scene', scene, 'left', ls, 'right', rs, 'at', at_j, 'origin', origin_j, 'diff', diff, 'result', res, 'loser', loser,
                           'loser_to', flee->'to', 'removed', removed, 'extinct', extinct,
                           'city_id', rs->>'city_id', 'city_lost', city_lost, 'city_destroyed', city_gone, 'avatar_hp', av_hp,
                           'groups_dead', dead, 'groups_home', home, 'groups_settled', settled, 'new_city_id', new_city, 'wasted', wasted,
                           'move_log_id', pd->>'log_id');
  perform night_log(p_game_id, 'night_fight',
    jsonb_build_object('att', jsonb_build_object('d1', ls->'roll'->'d1', 'd2', ls->'roll'->'d2', 'modifier', ls->'mod', 'total', ls->'roll'->'total'),
                       'def', jsonb_build_object('d1', rs->'roll'->'d1', 'd2', rs->'roll'->'d2', 'modifier', rs->'mod', 'total', rs->'roll'->'total')),
    oc);
  update chaos_nights set pending = case when status = 'naming' then pending else null end,
                          status = case when status = 'naming' then 'naming' else 'running' end, updated_at = now()
  where game_id = p_game_id;
end $$;

-- rolls for a side nobody clicked for (the skip)
create or replace function night_auto_roll(p_game_id uuid)
returns void language plpgsql as $$
declare
  nt chaos_nights;
  pd jsonb;
  side text;
  d1 int; d2 int;
begin
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.status <> 'fight' then return; end if;
  pd := nt.pending;
  foreach side in array array['left', 'right'] loop
    if pd->side->'roll' is null or jsonb_typeof(pd->side->'roll') = 'null' then
      d1 := roll_d6(); d2 := roll_d6();
      pd := jsonb_set(pd, array[side, 'roll'], jsonb_build_object('d1', d1, 'd2', d2, 'total', d1 + d2 + coalesce((pd->side->>'mod')::int, 0)));
    end if;
  end loop;
  update chaos_nights set pending = pd where game_id = p_game_id;
  perform night_resolve_fight(p_game_id);
end $$;

-- ---------- the night itself ----------
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

-- the end of the round, as before but without the ruler's free growth
create or replace function night_finish(p_game_id uuid)
returns void language plpgsql as $$
declare
  g games;
  notes text;
  rec record;
  rewards jsonb := '[]'::jsonb;
  healed jsonb := '[]'::jsonb;
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

  -- the avatars sleep and their wounds close
  for rec in
    select id, name, emoji, hp, coalesce(max_hp, 3) as max_hp from entities where game_id = p_game_id and kind = 'avatar' and status = 'active' and coalesce(hp, 0) < coalesce(max_hp, 3) order by created_at
  loop
    update entities set hp = least(rec.max_hp, coalesce(hp, 0) + 1) where id = rec.id;
    healed := healed || jsonb_build_array(jsonb_build_object('entity_id', rec.id, 'name', rec.name, 'emoji', rec.emoji, 'hp', least(rec.max_hp, coalesce(rec.hp, 0) + 1), 'max_hp', rec.max_hp));
  end loop;
  if jsonb_array_length(healed) > 0 then
    insert into actions_log (game_id, round_number, era, player_id, action_key, outcome, summary)
    values (p_game_id, g.round_number, g.era, null, 'avatars_heal', healed, '');
  end if;

  update prophecies set hold = least(3, hold + 1) where game_id = p_game_id and status = 'active';

  update players set
    low_logos_streak = case when logos <= 5 then least(3, low_logos_streak + 1) else 0 end,
    has_rolled = false,
    is_resting = false,
    avatar_action_used = false
  where game_id = p_game_id;

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
  values (p_game_id, g.round_number, g.era, null, 'round_end',
          format('I minęła runda %s. Bóstwa zapadają w sen, a świat toczy się dalej.', g.round_number));

  update chaos_nights set status = 'done', pending = null, updated_at = now() where game_id = p_game_id;
  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null, verse_pending_by = null
  where id = p_game_id;
end $$;

-- one unit of the night; true when the night went on, false when it is over
create or replace function night_step(p_game_id uuid)
returns boolean language plpgsql as $$
declare
  nt chaos_nights;
  unit jsonb;
  occ hex_occupants;
begin
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status = 'done' then raise exception 'Noc nie trwa.'; end if;
  if nt.status = 'fight' then raise exception 'Noc czeka na rzuty w walce.'; end if;
  if nt.status = 'naming' then raise exception 'Noc czeka na nazwę nowego miasta.'; end if;
  if nt.cursor >= jsonb_array_length(nt.queue) then
    perform night_finish(p_game_id);
    return false;
  end if;
  unit := nt.queue->nt.cursor;
  update chaos_nights set cursor = cursor + 1, updated_at = now() where game_id = p_game_id;
  if unit->>'t' = 'city' then
    perform night_unit_city(p_game_id, (unit->>'id')::uuid);
  else
    select * into occ from hex_occupants where id = (unit->>'id')::uuid and game_id = p_game_id;
    if occ.id is null then return true; end if;
    if unit->>'t' = 'herbivore' then perform night_unit_herbivore(p_game_id, occ);
    elsif unit->>'t' = 'beast' then perform night_unit_beast(p_game_id, occ);
    else perform night_unit_tribe(p_game_id, occ);
    end if;
  end if;
  return true;
end $$;

-- the whole rest of the night at once: the book rolls the fights, unnamed cities keep their placeholder
create or replace function night_skip(p_game_id uuid, p_by uuid)
returns void language plpgsql as $$
declare
  g games;
  nt chaos_nights;
  guard int := 0;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;
  select * into nt from chaos_nights where game_id = p_game_id;
  if nt.game_id is null or nt.round_number <> g.round_number or nt.status = 'done' then
    nt := night_start(p_game_id, p_by);
  end if;
  loop
    guard := guard + 1;
    if guard > 2 * jsonb_array_length(nt.queue) + 16 then exit; end if;
    select * into nt from chaos_nights where game_id = p_game_id;
    if nt.status = 'fight' then
      perform night_auto_roll(p_game_id);
    elsif nt.status = 'naming' then
      update actions_log set outcome = outcome || jsonb_build_object('name_pending', false, 'placeholder', true) where id = (nt.pending->>'log_id')::uuid;
      update chaos_nights set status = 'running', pending = null, updated_at = now() where game_id = p_game_id;
    elsif nt.status = 'done' then
      exit;
    else
      if not night_step(p_game_id) then exit; end if;
    end if;
  end loop;
  select * into nt from chaos_nights where game_id = p_game_id;
  if nt.status <> 'done' then perform night_finish(p_game_id); end if;
end $$;

-- ---------- the doors the table knocks on ----------
create or replace function start_chaos_night(p_game_id uuid)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id;
  if g.host_id <> me.user_id then raise exception 'Noc rozpoczyna gospodarz.' using errcode = '42501'; end if;
  return night_start(p_game_id, me.id);
end $$;

create or replace function chaos_step(p_game_id uuid, p_expected_cursor int default null)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  nt chaos_nights;
begin
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null then raise exception 'Noc nie trwa.'; end if;
  if p_expected_cursor is not null and p_expected_cursor <> nt.cursor then return nt; end if;
  perform night_step(p_game_id);
  select * into nt from chaos_nights where game_id = p_game_id;
  return nt;
end $$;

create or replace function chaos_fight_roll(p_game_id uuid, p_side text)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  nt chaos_nights;
  pd jsonb;
  owner uuid;
  since timestamptz;
  d1 int; d2 int;
begin
  if p_side not in ('left', 'right') then raise exception 'Strona to left albo right.'; end if;
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status <> 'fight' then raise exception 'Nikt teraz nie walczy.'; end if;
  pd := nt.pending;
  if pd->p_side->'roll' is not null and jsonb_typeof(pd->p_side->'roll') <> 'null' then return nt; end if;
  owner := nullif(pd->p_side->>'player_id', '')::uuid;
  since := (pd->>'since')::timestamptz;
  if not (owner is null or owner = me.id or g.host_id = me.user_id or now() - since > interval '60 seconds') then
    raise exception 'Za tę stronę rzuca jej bóstwo albo gospodarz.' using errcode = '42501';
  end if;
  d1 := roll_d6(); d2 := roll_d6();
  pd := jsonb_set(pd, array[p_side, 'roll'], jsonb_build_object('d1', d1, 'd2', d2, 'total', d1 + d2 + coalesce((pd->p_side->>'mod')::int, 0), 'by', me.id));
  update chaos_nights set pending = pd, updated_at = now() where game_id = p_game_id;
  if pd->'left'->'roll' is not null and jsonb_typeof(pd->'left'->'roll') <> 'null'
     and pd->'right'->'roll' is not null and jsonb_typeof(pd->'right'->'roll') <> 'null' then
    perform night_resolve_fight(p_game_id);
  end if;
  select * into nt from chaos_nights where game_id = p_game_id;
  return nt;
end $$;

create or replace function chaos_name_city(p_game_id uuid, p_name text)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  nt chaos_nights;
  pd jsonb;
  namer uuid;
  since timestamptz;
  nm text := left(trim(coalesce(p_name, '')), 80);
begin
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status <> 'naming' then raise exception 'Żadne miasto nie czeka na nazwę.'; end if;
  if nm = '' then raise exception 'Nazwij miasto.'; end if;
  pd := nt.pending;
  namer := nullif(pd->>'namer_id', '')::uuid;
  since := (pd->>'since')::timestamptz;
  if not (namer is null or namer = me.id or g.host_id = me.user_id or now() - since > interval '60 seconds') then
    raise exception 'Miasto nazywa bóstwo, do którego należy, albo gospodarz.' using errcode = '42501';
  end if;
  update entities set name = nm where id = (pd->>'city_id')::uuid;
  update actions_log set outcome = outcome || jsonb_build_object('name', nm, 'name_pending', false, 'placeholder', false, 'named_by', me.id) where id = (pd->>'log_id')::uuid;
  update chaos_nights set status = 'running', pending = null, updated_at = now() where game_id = p_game_id returning * into nt;
  return nt;
end $$;

create or replace function chaos_skip(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id;
  if g.host_id <> me.user_id then raise exception 'Noc pomija gospodarz.' using errcode = '42501'; end if;
  perform night_skip(p_game_id, me.id);
end $$;

-- the old door: any member ends the round; the night is played out by the book
create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
begin
  perform night_skip(p_game_id, me.id);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'start_chaos_night(uuid)', 'chaos_step(uuid, int)', 'chaos_fight_roll(uuid, text)', 'chaos_name_city(uuid, text)', 'chaos_skip(uuid)', 'end_chaos_phase(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
