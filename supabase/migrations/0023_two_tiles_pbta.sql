-- 0023: every word ends with two attribute tiles. A click pays and throws 2d6 + the chosen attribute
-- (+ a fulfilled prophecy); the PbtA bands decide: 10+ a full success, 7..9 a success with a cost,
-- 6- a failure (the Logos is spent, the world does not change; a blessing leaves a cursed lode).
-- Stworzenie Istoty splits into create_beast (Gniew / Żywioł) and create_herd (Łaska / Żywioł);
-- multiply (Rozmnożenie, Łaska / Żywioł) copies a creature onto a neighbouring field. Contests keep
-- their roll-difference resolution; only the attribute pairs change (war attack Gniew / Podszept,
-- city defence Łaska / Gniew, conversion defence Majestat / Mądrość, duels Gniew / Majestat).
-- New: action_attrs, roll_tier. Replaced: action_cost, perform_action, declare_contest, answer_contest.
-- Old book rows keep the key 'create_creature'; the client reads them as a beast or a herd.

-- ---------- the pairs and the bands ----------
create or replace function action_attrs(p_key text, p_side text default 'attack')
returns text[] language sql immutable as $$
  select case
    when p_key = 'catastrophe'          then array['wrath', 'element']
    when p_key = 'great_miracle'        then array['majesty', 'wisdom']
    when p_key = 'bless_land'           then array['grace', 'wisdom']
    when p_key = 'create_beast'         then array['wrath', 'element']
    when p_key = 'create_herd'          then array['grace', 'element']
    when p_key = 'create_sapient'       then array['majesty', 'wisdom']
    when p_key = 'change_creature'      then array['whisper', 'element']
    when p_key = 'migrate'              then array['whisper', 'element']
    when p_key = 'multiply'             then array['grace', 'element']
    when p_key = 'create_civilization'  then array['wisdom', 'grace']
    when p_key = 'develop_civilization' then array['grace', 'wisdom']
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

create or replace function roll_tier(p_total int)
returns text language sql immutable as $$
  select case when p_total >= 10 then 'strong' when p_total >= 7 then 'mixed' else 'weak' end;
$$;

-- the attribute the payload names must be one of the word's two; the error names both
create or replace function assert_attr(p_key text, p_attr text, p_side text default 'attack')
returns void language plpgsql immutable as $$
declare
  pair text[] := action_attrs(p_key, p_side);
begin
  if pair is null then return; end if;
  if p_attr is null or not (p_attr = any(pair)) then
    raise exception 'Wybierz: % albo %.', attr_name(pair[1]), attr_name(pair[2]);
  end if;
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
  rolled boolean := false;
  -- map work
  hq int; hr int; hslot int; hx hexes; dist int; emo text;
  tq int; tr int;
  occ hex_occupants; src entities; city entities; cty cities;
  qs int[] := '{}'; rs int[] := '{}'; item jsonb; ok boolean; hexes_out jsonb := '[]'::jsonb;
  dmg int; hits jsonb := '[]'::jsonb; n_dots int; creatures uuid[]; av_occ hex_occupants; n_targets int; pick int; pid uuid; victim entities;
  city_gone boolean := false; wasted int := 0;
  d1 int; d2 int; total int; tier text; gained int; added int; attr text; score int;
  n int; moved int; new_city boolean := false;
  pmod int := 0;
  after text; alive int; gen int; lost int := 0;
  role text; diet text; strength int := 0; conv int := 0;
  cuts jsonb := '[]'::jsonb; reroute jsonb := null; river_end jsonb; river_id uuid; mouth jsonb; path jsonb;
  cand record; copies jsonb := '[]'::jsonb; n_copies int := 0; new_occ hex_occupants;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);

  if p_action_key = 'create_creature' then raise exception 'Stworzenie Istoty to teraz Stworzenie Bestii albo Stworzenie Stada.'; end if;
  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;
  rolled := action_attrs(p_action_key) is not null;

  -- through the avatar: half the price, the target within two fields of where it stands
  if via_id is not null then
    if p_action_key not in ('shape_land', 'catastrophe', 'great_miracle', 'bless_land', 'pour_river', 'create_beast', 'create_herd', 'create_sapient', 'change_creature', 'migrate', 'multiply',
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
    if nullif(trim(coalesce(p_payload->>'resource', '')), '') is null or not resource_known(p_payload->>'resource') then
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

  elsif p_action_key = 'multiply' then
    select * into occ from hex_occupants where id = nullif(p_payload->>'occupant_id', '')::uuid and game_id = p_game_id;
    if occ.id is null then raise exception 'Wskaż istotę na mapie.'; end if;
    select * into src from entities where id = occ.entity_id;
    if src.kind <> 'creature' then raise exception 'Mnożą się tylko istoty.'; end if;
    role := creature_role(src);
    if not exists (select 1 from night_candidates(p_game_id, occ, role) c where c.mode = 'free') then raise exception 'Wokół nie ma wolnego pola dla tych istot.'; end if;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, occ.q, occ.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;

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
        resource = case when p_payload->>'biome' = 'woda' then null else resource end
      where game_id = p_game_id and q = qs[i] and r = rs[i];
      hexes_out := hexes_out || jsonb_build_array(jsonb_build_object('q', qs[i], 'r', rs[i], 'from', after));
      cuts := cuts || river_cut_at(p_game_id, qs[i], rs[i], p_payload->>'biome', me.id);
    end loop;
    select c into reroute from jsonb_array_elements(cuts) c where c->>'kind' = 'mountain' limit 1;
    outcome := jsonb_build_object('biome', p_payload->>'biome', 'hexes', hexes_out, 'rivers_cut', cuts,
                                  'reroute', case when reroute is null then null else jsonb_build_object('river_id', reroute->>'river_id', 'from', reroute->'from') end);

  elsif p_action_key = 'catastrophe' then
    -- 10+: half the total in blows; 7..9: a quarter, at least one; 6-: the storm passes
    dmg := case tier when 'strong' then greatest(1, floor(total / 2.0)::int)
                     when 'mixed' then greatest(1, ceil(floor(total / 2.0) / 2.0)::int)
                     else 0 end;
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
    -- the land changes only on a full success, and only when nothing is left standing on it
    select * into hx from hexes where game_id = p_game_id and q = hq and r = hr;
    alive := (case when city.id is not null and not city_gone then 1 else 0 end)
           + (select count(*)::int from hex_occupants o join entities e on e.id = o.entity_id where o.game_id = p_game_id and o.q = hq and o.r = hr and e.status = 'active');
    if tier = 'strong' and after is not null and alive = 0 and hx.biome <> after then
      update hexes set biome = after, decor = hex_decor(after), resource = case when after = 'woda' then null else resource end where game_id = p_game_id and q = hq and r = hr;
      cuts := river_cut_at(p_game_id, hq, hr, after, null);
    else
      after := null;
    end if;
    outcome := jsonb_build_object('type', p_payload->>'type', 'q', hq, 'r', hr, 'wrath', score, 'damage', dmg,
                                  'hits', hits, 'city_id', city.id, 'city_name', city.name, 'city_destroyed', city_gone, 'wasted', wasted,
                                  'biome_from', hx.biome, 'biome_after', after, 'rivers_cut', cuts);
    ent_id := city.id;

  elsif p_action_key = 'bless_land' then
    -- 10+: a lode of rank +1..+3 by the total; 7..9: a common one (0); 6-: a cursed lode (-1)
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
    -- every incarnation after a death returns one life stronger (2 at first, 12 at most)
    select least(12, coalesce(max(e.max_hp), 1) + 1) into gen from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and eg.role = 'creator' and e.kind = 'avatar' and e.status <> 'active';
    -- a beast's temper and a herd's worth: +1..+3 by the total on 10+, 0 on 7..9
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
      -- a numerous people: on 10+ a tribe also takes the most fertile free field next door
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
    -- 10+: the variant outgrows its kind by one (to +3); 7..9: it keeps the kind's strength; tribes have none to grow
    strength := case when is_sapient(src) then src.strength when tier = 'strong' then least(3, coalesce(src.strength, 0) + 1) else src.strength end;
    if tier <> 'weak' then
      insert into entities (game_id, kind, name, description, emoji, traits, diet, strength, created_round, created_era, created_by_player_id)
      values (p_game_id, 'creature', coalesce(nullif(trim(ent->>'name'), ''), src.name), coalesce(ent->>'description', ''), emo,
              case when ent ? 'traits' then array(select jsonb_array_elements_text(ent->'traits')) else src.traits end,
              src.diet, strength,
              g.round_number, g.era, me.id)
      returning id into ent_id;
      insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
      insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (ent_id, src.id, p_game_id, 'variant_of') on conflict do nothing;
      update hex_occupants set entity_id = ent_id where id = occ.id;
    end if;
    outcome := jsonb_build_object('q', occ.q, 'r', occ.r, 'from_entity_id', src.id, 'from_name', src.name, 'emoji', emo, 'diet', src.diet,
                                  'strength', strength, 'from_strength', src.strength, 'created', tier <> 'weak');

  elsif p_action_key = 'migrate' then
    -- 10+: the kind multiplies and lives in both places; 7..9: it moves; 6-: nobody stirs
    if tier = 'strong' then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, hslot, src.id);
    elsif tier = 'mixed' then
      update hex_occupants set q = tq, r = tr, slot = hslot where id = occ.id;
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'name', src.name, 'emoji', src.emoji,
                                  'moved', tier = 'mixed', 'arrived', tier <> 'weak');

  elsif p_action_key = 'multiply' then
    -- 10+: copies on the two most fertile free fields next door; 7..9: one copy on a random free field
    n_copies := case tier when 'strong' then 2 when 'mixed' then 1 else 0 end;
    if n_copies > 0 then
      for cand in
        select c.q, c.r from night_candidates(p_game_id, occ, role) c where c.mode = 'free'
        order by (case when tier = 'strong' then c.fert else 0 end) desc, random()
        limit n_copies
      loop
        insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, cand.q, cand.r, hex_slot_for_role(p_game_id, cand.q, cand.r, role), src.id);
        copies := copies || jsonb_build_array(jsonb_build_object('q', cand.q, 'r', cand.r, 'fertility', hex_fertility(p_game_id, cand.q, cand.r)));
      end loop;
    end if;
    ent_id := src.id;
    outcome := jsonb_build_object('from', jsonb_build_object('q', occ.q, 'r', occ.r), 'name', src.name, 'emoji', src.emoji, 'role', role, 'strength', src.strength,
                                  'copies', copies, 'count', jsonb_array_length(copies));

  elsif p_action_key = 'create_civilization' then
    -- 10+: two followers of the founder; 7..9: one; 6-: the people do not settle
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
    -- the godless hear the gift first, then the city grows
    conv := city_remove_atheists(city.id, gained);
    added := city_add_dots(city.id, me.id, gained);
    insert into city_gifts (game_id, city_id, player_id, text, accepted, dots_gained, round_number)
    values (p_game_id, city.id, me.id, trim(p_payload->>'gift'), gained > 0, added, g.round_number);
    ent_id := city.id;
    outcome := jsonb_build_object('city_id', city.id, 'city_name', city.name, 'avatar', free_avatar, 'gained', gained, 'added', added, 'converted_atheists', conv,
                                  'wasted', gained - added, 'gift', trim(p_payload->>'gift'), 'level', city_dots(city.id));

  elsif p_action_key = 'exodus' then
    -- 10+: all arrive and the new city inherits the gifts; 7..9: one dies on the road (when two or more go) and no gifts travel; 6-: nobody leaves
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
      if via_occ.id is not null and not (via_occ.q = tq and via_occ.r = tr) and hex_slot_for_role(p_game_id, tq, tr, 'avatar') is not null then
        update hex_occupants set q = tq, r = tr, slot = hex_slot_for_role(p_game_id, tq, tr, 'avatar') where id = via_occ.id;
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
                                  'avatar_moved', ok, 'avatar_name', av.name, 'avatar_emoji', av.emoji);

  elsif p_action_key = 'pilgrimage' then
    ent_id := src.id;
    update hex_occupants set q = tq, r = tr, slot = hslot where id = occ.id;
    outcome := jsonb_build_object('avatar_id', src.id, 'name', src.name, 'emoji', src.emoji, 'from', jsonb_build_object('q', occ.q, 'r', occ.r), 'to', jsonb_build_object('q', tq, 'r', tr), 'distance', dist, 'biome', hx.biome);

  elsif p_action_key = 'prophecy' then
    -- 10+: a hold of two; 7..9: one; 6-: the prophet is silent
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

  -- the dice on every rolled row, the same keys for every word
  if rolled then
    outcome := outcome || jsonb_build_object('d1', d1, 'd2', d2, 'attr', attr, 'score', score, 'prophecy', pmod, 'total', total, 'tier', tier);
  end if;

  -- the Logos is spent whatever the dice said
  update players set logos = logos - cost where id = me.id;

  if free_avatar then
    outcome := outcome || jsonb_build_object('via_avatar', jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji, 'full_cost', full_cost));
  end if;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, free_avatar, roll_json, outcome, summary)
  returning * into log_row;

  -- a Great Miracle that happened burns the avatar that worked it
  if free_avatar and p_action_key = 'great_miracle' and tier <> 'weak' then
    update entities set status = 'dead', hp = 0 where id = av.id;
    delete from hex_occupants where entity_id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', av.id, format('I spłonął awatar %s w Wielkim Cudzie, i nie było go więcej.', av.name));
  end if;

  update games set verse_pending_by = me.id where id = p_game_id;
  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- ---------- contests: the attacker's tiles ----------
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
  via_id uuid := nullif(p_payload->>'via_avatar_id', '')::uuid;
  via_av entities; via_occ hex_occupants; via_hp int := 0; full_cost int;
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
    if hex_distance(att_occ.q, att_occ.r, def_occ.q, def_occ.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy. Najpierw wyślij go na pielgrzymkę.'; end if;
    select p.* into def from entity_gods eg join players p on p.id = eg.player_id where eg.entity_id = def_av.id order by (eg.role = 'creator') desc, p.seat_order limit 1;
    if def.id is null then raise exception 'Ten awatar nie ma bóstwa.'; end if;
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

  -- through the avatar: half the price; it must reach the city it works on, and it leads an army with its life
  if via_id is not null then
    select e.* into via_av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = via_id;
    if via_av.id is null then raise exception 'Nie masz takiego żywego awatara.'; end if;
    select * into via_occ from hex_occupants where game_id = p_game_id and entity_id = via_av.id;
    if via_occ.id is null then raise exception 'Ten awatar nie stoi na mapie.'; end if;
    via_hp := coalesce(via_av.hp, 0);
  end if;

  if p_kind = 'convert' then
    cost := action_cost('convert', g.era);
    mod := attr_score(me, attr) + pmod;
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, tcity.q, tcity.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od siebie.'; end if;
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
    if via_occ.id is not null and hex_distance(via_occ.q, via_occ.r, scity.q, scity.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy od miasta, które wystawia armię.'; end if;
    mod := attr_score(me, attr) + army + pmod + via_hp;
  end if;
  full_cost := cost;
  if via_av.id is not null then cost := ceil(cost / 2.0)::int; end if;

  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
  update players set logos = logos - cost where id = me.id;
  if p_kind = 'holy_war' then perform city_remove_dots(source.id, me.id, army); end if;

  insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                        attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total, attacker_avatar_id)
  values (p_game_id, g.round_number, g.era, p_kind, me.id, def.id, target.id, source.id, nullif(army, 0), cost,
          attr, d1, d2, mod, d1 + d2 + mod, via_av.id)
  returning * into c;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, target.id,
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
          jsonb_build_object('kind', p_kind, 'contest_id', c.id, 'defender_id', def.id, 'target_city_id', target.id, 'target_name', target.name,
                             'source_city_id', source.id, 'source_name', source.name, 'army', nullif(army, 0), 'cost', cost, 'full_cost', full_cost,
                             'attacker_avatar_hp', case when p_kind = 'holy_war' and via_av.id is not null then via_hp else null end,
                             'via_avatar', case when via_av.id is null then null else jsonb_build_object('id', via_av.id, 'name', via_av.name, 'emoji', via_av.emoji) end),
          '')
  returning * into log_row;
  update contests set log_id = log_row.id where id = c.id;
  return c;
end $$;

-- ---------- contests: the defender's tiles ----------
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
  perform assert_attr(c.kind, p_attr, 'defence');
  pmod := consume_prophecy(c.game_id, me.id, p_prophecy_id, c.round_number, c.era);
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

do $$
declare fn text;
begin
  foreach fn in array array[
    'action_attrs(text, text)', 'roll_tier(int)', 'assert_attr(text, text, text)', 'action_cost(text, smallint)',
    'perform_action(uuid, text, jsonb)', 'declare_contest(uuid, text, jsonb)', 'answer_contest(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
