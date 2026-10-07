-- 0018: the turn waits for the book (no Chaos before the verse is written), avatars fight, heal in
-- their sleep and can be hunted by armies, and prophecies (PbtA hold) give a roll +1..+3 once.
-- Schema: games.verse_pending_by, contests for duels, prophecies. Functions replaced: recompute_turn,
-- edit_log_summary, perform_action, declare_contest, answer_contest, commit_contest, end_chaos_phase,
-- action_cost. New: assert_no_verse_pending, release_verse, consume_prophecy, wound_avatar.

-- ---------- schema ----------
alter table games add column if not exists verse_pending_by uuid references players (id) on delete set null;

alter table contests alter column target_city_id drop not null;
alter table contests add column if not exists attacker_avatar_id uuid references entities (id) on delete set null;
alter table contests add column if not exists defender_avatar_id uuid references entities (id) on delete set null;
alter table contests drop constraint if exists contests_kind_check;
alter table contests add constraint contests_kind_check check (kind in ('convert', 'holy_war', 'avatar_duel'));

create table if not exists prophecies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  avatar_id uuid references entities (id) on delete set null,
  text text not null,
  hold smallint not null default 1 check (hold between 1 and 3),
  status text not null default 'active' check (status in ('active', 'fulfilled')),
  created_round int not null default 0,
  fulfilled_round int,
  created_at timestamptz not null default now()
);
create index if not exists prophecies_game_idx on prophecies (game_id);
alter table prophecies enable row level security;
drop policy if exists "prophecies readable" on prophecies;
create policy "prophecies readable" on prophecies for select to authenticated using (is_game_member(game_id));
alter table prophecies replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'prophecies') then
    alter publication supabase_realtime add table prophecies;
  end if;
end $$;

-- ---------- prices ----------
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
    when 'resurrect_avatar'     then (array[12, 15, 16])[p_era]
    when 'avatar_duel'          then (array[5, 4, 3])[p_era]
    when 'prophecy'             then (array[10, 5, 3])[p_era]
    else null
  end;
$$;

-- ---------- the verse lock ----------
create or replace function assert_no_verse_pending(p_game_id uuid)
returns void language plpgsql stable as $$
begin
  if exists (select 1 from games where id = p_game_id and verse_pending_by is not null) then
    raise exception 'Najpierw dopisz werset poprzedniego słowa do Świętej Księgi.';
  end if;
end $$;

-- the turn and the Chaos wait for the book and for a contest's answer
create or replace function recompute_turn(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
  next_id uuid;
begin
  if exists (select 1 from contests where game_id = p_game_id and status = 'pending') then return; end if;
  select * into g from games where id = p_game_id for update;
  if g.verse_pending_by is not null then return; end if;
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

-- the verse is the player's: the owner of an action row may rewrite its summary; doing so frees the turn
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
  if action_cost(lr.action_key, 1::smallint) is null and lr.action_key not in ('convert', 'holy_war', 'avatar_duel') then
    raise exception 'Ten werset pisze sama księga.';
  end if;
  update actions_log set summary = coalesce(trim(p_summary), '') where id = p_log_id;
  update games set verse_pending_by = null where id = lr.game_id and verse_pending_by = me.id;
  perform recompute_turn(lr.game_id);
end $$;

-- the book keeps its own draft: the player (or the host, when someone left) lets the turn go on
create or replace function release_verse(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if g.verse_pending_by is null then return; end if;
  if g.verse_pending_by <> me.id and g.host_id <> auth.uid() then raise exception 'Werset dopisuje bóstwo, które przemówiło.' using errcode = '42501'; end if;
  update games set verse_pending_by = null where id = p_game_id;
  perform recompute_turn(p_game_id);
end $$;

-- ---------- prophecies and wounds ----------
-- spends a prophecy on a roll: returns its hold (+1..+3) and writes the fulfilment into the book
create or replace function consume_prophecy(p_game_id uuid, p_player_id uuid, p_prophecy_id uuid, p_round int, p_era smallint)
returns int language plpgsql as $$
declare
  pr prophecies;
  av entities;
begin
  if p_prophecy_id is null then return 0; end if;
  select * into pr from prophecies where id = p_prophecy_id and game_id = p_game_id for update;
  if pr.id is null or pr.player_id <> p_player_id then raise exception 'To nie twoje proroctwo.'; end if;
  if pr.status <> 'active' then raise exception 'To proroctwo już się spełniło.'; end if;
  update prophecies set status = 'fulfilled', fulfilled_round = p_round where id = pr.id;
  select * into av from entities where id = pr.avatar_id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, outcome, summary)
  values (p_game_id, p_round, p_era, p_player_id, 'prophecy_fulfilled', pr.avatar_id,
          jsonb_build_object('prophecy_id', pr.id, 'text', pr.text, 'hold', pr.hold, 'avatar_name', av.name, 'emoji', av.emoji), '');
  return pr.hold;
end $$;

-- takes life from an avatar; at zero it dies and leaves the map (told in the book)
create or replace function wound_avatar(p_avatar uuid, p_damage int, p_by uuid, p_round int, p_era smallint)
returns int language plpgsql as $$
declare
  av entities;
begin
  if p_damage <= 0 then return 0; end if;
  select * into av from entities where id = p_avatar for update;
  if av.id is null or av.kind <> 'avatar' or av.status <> 'active' then return 0; end if;
  update entities set hp = greatest(0, coalesce(hp, 0) - p_damage) where id = av.id returning * into av;
  if av.hp = 0 then
    update entities set status = 'dead' where id = av.id;
    delete from hex_occupants where entity_id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (av.game_id, p_round, p_era, p_by, 'entity_edit', av.id, format('I zginął awatar %s.', av.name));
  end if;
  return p_damage;
end $$;

drop function if exists answer_contest(uuid, text);
drop function if exists commit_contest(uuid, text);

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
  pmod int := 0;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);

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
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    d6 := roll_d6();
    score := attr_score(me, 'wrath');
    dmg := greatest(1, d6 + score + pmod);
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
    outcome := jsonb_build_object('type', p_payload->>'type', 'q', hq, 'r', hr, 'd6', d6, 'wrath', score, 'prophecy', pmod, 'damage', dmg,
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
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, attr);
    total := d1 + d2 + score + pmod + (case when free_avatar then -2 else 0 end);
    tier := case when total >= 10 then 'strong' when total >= 7 then 'mixed' else 'weak' end;
    gained := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    added := city_add_dots(city.id, me.id, gained);
    insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
    values (p_game_id, city.id, me.id, trim(p_payload->>'gift'), gained > 0, added, g.round_number);
    ent_id := city.id;
    outcome := jsonb_build_object('city_id', city.id, 'city_name', city.name, 'd1', d1, 'd2', d2, 'attr', attr, 'score', score, 'prophecy', pmod,
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

  elsif p_action_key = 'prophecy' then
    insert into prophecies (game_id, player_id, avatar_id, text, hold, created_round)
    values (p_game_id, me.id, src.id, trim(p_payload->>'text'), 1, g.round_number);
    ent_id := src.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'avatar_name', src.name, 'emoji', src.emoji, 'text', trim(p_payload->>'text'));

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

  update games set verse_pending_by = me.id where id = p_game_id;
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
  att_av entities; def_av entities; att_occ hex_occupants; def_occ hex_occupants;
  pmod int := 0;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);
  if p_kind not in ('convert', 'holy_war', 'avatar_duel') then raise exception 'Nieznane starcie.'; end if;
  pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);

  if p_kind = 'avatar_duel' then
    -- my avatar against another god's avatar, on the same field or next to it
    select e.* into att_av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'attacker_avatar_id', '')::uuid;
    if att_av.id is null then raise exception 'Wskaż swojego żywego awatara.'; end if;
    select * into def_av from entities where id = nullif(p_payload->>'defender_avatar_id', '')::uuid and game_id = p_game_id and kind = 'avatar' and status = 'active';
    if def_av.id is null then raise exception 'Wskaż żywego awatara przeciwnika.'; end if;
    if exists (select 1 from entity_gods where entity_id = def_av.id and player_id = me.id) then raise exception 'To twój własny awatar.'; end if;
    select * into att_occ from hex_occupants where entity_id = att_av.id;
    select * into def_occ from hex_occupants where entity_id = def_av.id;
    if att_occ.id is null or def_occ.id is null then raise exception 'Obaj awatarzy muszą stać na mapie.'; end if;
    if hex_distance(att_occ.q, att_occ.r, def_occ.q, def_occ.r) > 1 then raise exception 'Awatar musi stać na tym samym heksie albo obok. Najpierw każ mu podejść.'; end if;
    select p.* into def from entity_gods eg join players p on p.id = eg.player_id where eg.entity_id = def_av.id order by (eg.role = 'creator') desc, p.seat_order limit 1;
    if def.id is null then raise exception 'Ten awatar nie ma bóstwa.'; end if;
    attr := p_payload->>'attr';
    if attr not in ('wrath', 'majesty', 'whisper') then raise exception 'Walka to Gniew, Majestat albo Podszept.'; end if;
    cost := action_cost('avatar_duel', g.era);
    mod := attr_score(me, attr) + pmod;
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
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
    attr := p_payload->>'attr';
    if attr not in ('majesty', 'whisper') then raise exception 'Nawracanie to Majestat albo Podszept.'; end if;
    cost := action_cost('convert', g.era);
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
    cost := action_cost('holy_war', g.era) + hex_distance(scity.q, scity.r, tcity.q, tcity.r);
    attr := 'wrath';
    mod := attr_score(me, 'wrath') + army + pmod;
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
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
          jsonb_build_object('kind', p_kind, 'contest_id', c.id, 'defender_id', def.id, 'target_city_id', target.id, 'target_name', target.name,
                             'source_city_id', source.id, 'source_name', source.name, 'army', nullif(army, 0), 'cost', cost),
          '')
  returning * into log_row;
  update contests set log_id = log_row.id where id = c.id;
  return c;
end $$;


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
  target_gone boolean := false;
  source_gone boolean := false;
  oc jsonb;
  log_row actions_log;
  pmod int := 0;
  att_av entities; def_av entities;
  a_loss int := 0; d_loss int := 0;
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
  mod := attr_score(me, p_attr) + pmod + (case when c.kind = 'holy_war' then def_dots else 0 end);
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
    converted := city_remove_dots(c.target_city_id, me.id, k);
    perform city_add_dots(c.target_city_id, c.attacker_id, converted);
    oc := jsonb_build_object('kind', 'convert', 'diff', diff, 'converted', converted);
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
    if returned > 0 and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
      perform city_add_dots(c.source_city_id, c.attacker_id, returned);
    end if;
    source_gone := c.source_city_id is not null and destroy_city_if_empty(c.source_city_id, g.round_number, g.era);
    oc := jsonb_build_object('kind', 'holy_war', 'diff', diff, 'army', c.army, 'removed', removed, 'converted', converted,
                                  'defender_lost', removed + def_lost, 'attacker_lost', att_lost, 'returned', returned,
                                  'successes', case when diff >= 1 then c.army else 0 end, 'pending', diff >= 1,
                                  'source_city_id', c.source_city_id, 'source_destroyed', source_gone);
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

-- the attacker's last word: the verse, and after a won war where the blows land
create or replace function commit_contest(p_contest_id uuid, p_summary text, p_allocation jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
  g games;
  oc jsonb;
  successes int;
  n_dots int := 0;
  n_avatar int := 0;
  spent int := 0;
  removed int := 0;
  converted int := 0;
  def_av entities;
  tcity cities;
  oid uuid;
  victim entities;
  killed jsonb := '[]'::jsonb;
  target_gone boolean := false;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.attacker_id then raise exception 'Werset dopisuje bóstwo, które zaczęło starcie.' using errcode = '42501'; end if;
  if c.status <> 'resolved' then raise exception 'To starcie nie czeka na werset.'; end if;
  select * into g from games where id = c.game_id;
  oc := coalesce(c.outcome, '{}'::jsonb);

  if c.kind = 'holy_war' and coalesce((oc->>'pending')::boolean, false) then
    successes := coalesce((oc->>'successes')::int, 0);
    select * into tcity from cities where entity_id = c.target_city_id;
    n_dots := coalesce(nullif(p_allocation->>'dots', '')::int, successes);
    n_avatar := coalesce(nullif(p_allocation->>'avatar', '')::int, 0);
    if n_dots < 0 or n_avatar < 0 then raise exception 'Sukcesy nie mogą być ujemne.'; end if;
    -- the dots: destroyed, half of them (rounded up) turned to the attacker
    n_dots := least(n_dots, player_dots(c.target_city_id, c.defender_id), successes);
    removed := city_remove_dots(c.target_city_id, c.defender_id, n_dots);
    converted := city_add_dots(c.target_city_id, c.attacker_id, ceil(removed / 2.0)::int);
    spent := removed;
    -- the enemy's avatar on that field: one success is one wound
    if n_avatar > 0 and tcity.entity_id is not null then
      select e.* into def_av from hex_occupants o join entities e on e.id = o.entity_id join entity_gods eg on eg.entity_id = e.id
      where o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'avatar' and e.status = 'active' and eg.player_id = c.defender_id limit 1;
      if def_av.id is null then raise exception 'Na tym polu nie stoi awatar obrońcy.'; end if;
      n_avatar := least(n_avatar, successes - spent, coalesce(def_av.hp, 0));
      perform wound_avatar(def_av.id, n_avatar, c.attacker_id, g.round_number, g.era);
      spent := spent + n_avatar;
      select * into def_av from entities where id = def_av.id;
    end if;
    -- creatures on that field: one success removes one
    if p_allocation ? 'creatures' and tcity.entity_id is not null then
      for oid in select (jsonb_array_elements_text(p_allocation->'creatures'))::uuid loop
        exit when spent >= successes;
        select e.* into victim from hex_occupants o join entities e on e.id = o.entity_id
        where o.id = oid and o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'creature';
        if victim.id is null then continue; end if;
        delete from hex_occupants where id = oid;
        if not exists (select 1 from hex_occupants where entity_id = victim.id) then update entities set status = 'dead' where id = victim.id; end if;
        killed := killed || jsonb_build_array(jsonb_build_object('entity_id', victim.id, 'name', victim.name, 'emoji', victim.emoji));
        spent := spent + 1;
      end loop;
    end if;
    target_gone := destroy_city_if_empty(c.target_city_id, g.round_number, g.era);
    oc := oc || jsonb_build_object('pending', false, 'removed', removed, 'converted', converted, 'defender_lost', removed + coalesce((oc->>'defender_lost')::int, 0),
                                   'avatar_wounds', n_avatar, 'avatar_name', def_av.name, 'avatar_dead', coalesce(def_av.status = 'dead', false),
                                   'creatures_killed', killed, 'target_destroyed', target_gone, 'spent', spent);
    update contests set outcome = oc where id = c.id;
    if c.log_id is not null then update actions_log set outcome = oc where id = c.log_id; end if;
  end if;

  if c.log_id is not null then update actions_log set summary = coalesce(trim(p_summary), '') where id = c.log_id; end if;
  update contests set status = 'committed' where id = c.id;
  update games set verse_pending_by = null where id = c.game_id and verse_pending_by = me.id;
  perform recompute_turn(c.game_id);
end $$;

-- ---------- end of Chaos: cities grow, the faithful reward their gods, avatars heal, prophecies ripen ----------
create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  notes text;
  rec record;
  grown jsonb := '[]'::jsonb;
  rewards jsonb := '[]'::jsonb;
  healed jsonb := '[]'::jsonb;
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

  -- the avatars sleep and their wounds close
  for rec in
    select id, name, emoji, hp from entities where game_id = p_game_id and kind = 'avatar' and status = 'active' and coalesce(hp, 0) < 3 order by created_at
  loop
    update entities set hp = least(3, coalesce(hp, 0) + 1) where id = rec.id;
    healed := healed || jsonb_build_array(jsonb_build_object('entity_id', rec.id, 'name', rec.name, 'emoji', rec.emoji, 'hp', least(3, coalesce(rec.hp, 0) + 1)));
  end loop;
  if jsonb_array_length(healed) > 0 then
    insert into actions_log (game_id, round_number, era, player_id, action_key, outcome, summary)
    values (p_game_id, g.round_number, g.era, null, 'avatars_heal', healed, '');
  end if;

  -- prophecies ripen
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
  values (p_game_id, g.round_number, g.era, me.id, 'round_end',
          format('I minęła runda %s. Bóstwa zapadają w sen, a świat toczy się dalej.', g.round_number));

  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null, verse_pending_by = null
  where id = p_game_id;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'action_cost(text, smallint)', 'assert_no_verse_pending(uuid)', 'recompute_turn(uuid)', 'edit_log_summary(uuid, text)', 'release_verse(uuid)',
    'consume_prophecy(uuid, uuid, uuid, int, smallint)', 'wound_avatar(uuid, int, uuid, int, smallint)',
    'perform_action(uuid, text, jsonb)', 'declare_contest(uuid, text, jsonb)', 'answer_contest(uuid, text, uuid)',
    'commit_contest(uuid, text, jsonb)', 'end_chaos_phase(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
