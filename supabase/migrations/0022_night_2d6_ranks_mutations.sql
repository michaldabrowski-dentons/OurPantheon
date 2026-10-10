-- 0022: the night rolls 2d6. Herds and resources have a rank from 2d6 + Łaska (-1 szkodniki / przeklęte
-- złoże .. +3 święte stado / boski surowiec) that feeds the fertility instead of a flat +1; a blessing may
-- replace a field's resource. Night tables: 2 dies, 3..5 wanders, 6..8 stays, 9..10 seeks (a tribe settles
-- when it already stands on the best land), 11 multiplies, 12 mutates (the god of the species names the
-- new kind). Cities roll 2d6 + fertility - population: 10+ bloom, 7..9 calm or a colony one or two fields
-- away, 6- famine. A fight's verdict waits for both gods to read it (chaos_ack_fight); the host may skip
-- one phase (chaos_skip_phase). Functions replaced: hex_fertility, perform_action, night_unit_*,
-- night_resolve_fight, night_step, night_skip, chaos_step. New: resource_known, hex_herd_bonus,
-- night_naming_for, night_hunt, night_open_mutation, night_apply_mutation, chaos_ack_fight,
-- chaos_name_mutation, chaos_skip_phase.

-- ---------- schema ----------
alter table hexes add column if not exists resource_bonus smallint not null default 1;
alter table hexes drop constraint if exists hexes_resource_check;

create or replace function resource_known(p_resource text)
returns boolean language sql immutable as $$
  select p_resource in ('💎', '🌾', '🪵', '⚙️', '🍇', '🍋', '🌽', '🏺', '🪙', '🪨', '🥔', '⭐', '✨', '🫒', '🍄', '🤢', '☣️');
$$;
alter table hexes add constraint hexes_resource_check check (resource is null or resource_known(resource));

-- the herds that already live in the world keep the +1 they have always given
update entities e set strength = 1 where e.kind = 'creature' and coalesce(e.diet, 'herbivore') = 'herbivore' and not is_sapient(e) and e.strength = 0;

alter table chaos_nights drop constraint if exists chaos_nights_status_check;
alter table chaos_nights add constraint chaos_nights_status_check check (status in ('running', 'fight', 'verdict', 'naming', 'mutation', 'done'));

-- ---------- fertility with ranks ----------
-- the rank of the herd standing on the field (-1..+3), 0 when there is none
create or replace function hex_herd_bonus(p_game_id uuid, p_q int, p_r int)
returns int language sql stable as $$
  select coalesce((select e.strength::int from hex_occupants o join entities e on e.id = o.entity_id
                   where o.game_id = p_game_id and o.q = p_q and o.r = p_r and creature_role(e) = 'herbivore' limit 1), 0);
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
  f := f + hex_herd_bonus(p_game_id, p_q, p_r);
  if hx.resource is not null then f := f + coalesce(hx.resource_bonus, 1); end if;
  return f;
end $$;

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
    -- the quality of the gift: 2d6 + Łaska, from a cursed lode (-1) to a divine one (+3)
    d1 := roll_d6(); d2 := roll_d6();
    score := attr_score(me, 'grace');
    total := d1 + d2 + score;
    strength := beast_strength(total);
    roll_json := jsonb_build_object('d1', d1, 'd2', d2, 'modifier', score, 'total', total, 'attr', 'grace');
    update hexes set resource = p_payload->>'resource', resource_bonus = strength where game_id = p_game_id and q = hq and r = hr;
    outcome := jsonb_build_object('q', hq, 'r', hr, 'resource', p_payload->>'resource', 'biome', hx.biome, 'fertility', hex_fertility(p_game_id, hq, hr),
                                  'replaced', hx.resource, 'replaced_bonus', case when hx.resource is null then null else hx.resource_bonus end,
                                  'd1', d1, 'd2', d2, 'grace', score, 'total', total, 'bonus', strength);

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
    -- a beast's temper: 2d6 + Gniew; a herd's worth: 2d6 + Łaska (-1 szkodniki .. +3 święte stado)
    if role in ('beast', 'herbivore') then
      d1 := roll_d6(); d2 := roll_d6();
      attr := case when role = 'beast' then 'wrath' else 'grace' end;
      score := attr_score(me, attr);
      total := d1 + d2 + score;
      strength := beast_strength(total);
      roll_json := jsonb_build_object('d1', d1, 'd2', d2, 'modifier', score, 'total', total, 'attr', attr);
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
                                  'd1', d1, 'd2', d2, 'wrath', case when role = 'beast' then score else null end, 'grace', case when role = 'herbivore' then score else null end, 'total', total);

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


-- ---------- the night, rolled on two dice ----------
-- the naming the table owes for a city founded in the night, rebuilt from its book row
create or replace function night_naming_for(p_game_id uuid, p_city uuid)
returns jsonb language plpgsql stable as $$
declare
  lr actions_log;
begin
  select * into lr from actions_log where game_id = p_game_id and action_key = 'night_city_founded' and (outcome->>'city_id') = p_city::text order by created_at desc limit 1;
  if lr.id is null then return null; end if;
  return jsonb_build_object('kind', 'naming', 'since', now(), 'city_id', p_city, 'namer_id', nullif(lr.outcome->>'namer_id', '')::uuid, 'log_id', lr.id,
                            'placeholder', lr.outcome->>'name', 'q', (lr.outcome->>'q')::int, 'r', (lr.outcome->>'r')::int);
end $$;

-- a city rises in the night: a placeholder name until its god speaks; p_pause = false leaves the night's status alone
drop function if exists night_found_city(uuid, int, int, uuid, jsonb, uuid, text, uuid);
create or replace function night_found_city(p_game_id uuid, p_q int, p_r int, p_species uuid, p_groups jsonb, p_namer uuid, p_by text, p_from_city uuid, p_pause boolean default true)
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
  if sp.id is not null and not exists (select 1 from hex_occupants where game_id = p_game_id and q = p_q and r = p_r and entity_id = sp.id) then
    slot := hex_slot_for_role(p_game_id, p_q, p_r, 'tribe');
    if slot is not null then insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, p_q, p_r, slot, sp.id); end if;
  end if;
  lid := night_log(p_game_id, 'night_city_founded', null,
    jsonb_build_object('city_id', cid, 'q', p_q, 'r', p_r, 'species_id', sp.id, 'species_name', sp.name, 'emoji', sp.emoji, 'namer_id', p_namer,
                       'name', placeholder, 'name_pending', true, 'placeholder', false, 'by', p_by, 'from_city_id', p_from_city, 'from_name', mother.name,
                       'groups', p_groups, 'population', city_dots(cid), 'biome', (select biome from hexes where game_id = p_game_id and q = p_q and r = p_r)));
  if p_pause then
    update chaos_nights set status = 'naming', updated_at = now(),
      pending = jsonb_build_object('kind', 'naming', 'since', now(), 'city_id', cid, 'namer_id', p_namer, 'log_id', lid, 'placeholder', placeholder, 'q', p_q, 'r', p_r)
    where game_id = p_game_id;
  end if;
  return cid;
end $$;

-- a 12: the god of the species names the new kind before it appears
create or replace function night_open_mutation(p_game_id uuid, p_parent uuid, p_role text, p_at_q int, p_at_r int, p_log_id uuid, p_then_hunt boolean)
returns void language plpgsql as $$
declare
  e entities;
begin
  select * into e from entities where id = p_parent;
  update chaos_nights set status = 'mutation', updated_at = now(),
    pending = jsonb_build_object('kind', 'mutation', 'since', now(), 'parent_id', e.id, 'parent_name', e.name, 'parent_emoji', e.emoji, 'role', p_role,
                                 'at', jsonb_build_object('q', p_at_q, 'r', p_at_r), 'namer_id', entity_creator(e.id), 'log_id', p_log_id,
                                 'placeholder', 'Odmiana ' || e.name, 'then_hunt', p_then_hunt)
  where game_id = p_game_id;
end $$;

-- the new kind is born: named by its god, or with a placeholder when the night is skipped
create or replace function night_apply_mutation(p_game_id uuid, p_name text, p_emoji text, p_placeholder boolean, p_by uuid)
returns uuid language plpgsql as $$
declare
  g games;
  nt chaos_nights;
  pd jsonb;
  parent entities;
  nm text;
  emo text;
  new_id uuid;
  new_occ hex_occupants;
  slot int;
  tq int; tr int;
  namer uuid;
begin
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.status <> 'mutation' or nt.pending is null then return null; end if;
  pd := nt.pending;
  select * into parent from entities where id = (pd->>'parent_id')::uuid;
  nm := left(trim(coalesce(p_name, '')), 80);
  if nm = '' then nm := pd->>'placeholder'; end if;
  emo := nullif(trim(coalesce(p_emoji, '')), '');
  if emo is not null and exists (select 1 from entities where game_id = p_game_id and emoji = emo) then
    raise exception 'Ta emotikona należy już do kogoś innego.';
  end if;
  if emo is null then
    select x into emo from unnest(array['🐾', '🧬', '🦠', '🌀', '🔸', '🔹', '🔶', '🔷', '🟠', '🟢', '🟣', '🟤', '⚪', '⚫', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪']) x
    where not exists (select 1 from entities where game_id = p_game_id and emoji = x) limit 1;
  end if;
  namer := nullif(pd->>'namer_id', '')::uuid;
  tq := (pd->'at'->>'q')::int; tr := (pd->'at'->>'r')::int;
  insert into entities (game_id, kind, name, description, emoji, traits, diet, strength, created_round, created_era, created_by_player_id)
  values (p_game_id, 'creature', nm, '', emo, parent.traits, parent.diet, parent.strength, g.round_number, g.era, coalesce(namer, p_by))
  returning id into new_id;
  if namer is not null then insert into entity_gods (entity_id, player_id, game_id, role) values (new_id, namer, p_game_id, 'creator'); end if;
  insert into entity_links (from_entity_id, to_entity_id, game_id, relation) values (new_id, parent.id, p_game_id, 'variant_of') on conflict do nothing;
  slot := hex_slot_for_role(p_game_id, tq, tr, pd->>'role');
  if slot is not null then
    insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tq, tr, slot, new_id) returning * into new_occ;
  end if;
  update actions_log set outcome = outcome || jsonb_build_object('mutation_name', nm, 'mutation_emoji', emo, 'new_entity_id', new_id, 'new_occupant_id', new_occ.id,
                                                                 'clone_to', case when new_occ.id is null then null else jsonb_build_object('q', tq, 'r', tr) end,
                                                                 'placeholder', p_placeholder, 'named_by', p_by)
  where id = (pd->>'log_id')::uuid;
  update chaos_nights set status = 'running', pending = null, updated_at = now() where game_id = p_game_id;
  -- a mutated beast goes hunting at once
  if (pd->>'then_hunt')::boolean and new_occ.id is not null then
    perform night_hunt(p_game_id, new_occ, (pd->>'log_id')::uuid, 'hunt_new');
  end if;
  return new_id;
end $$;

-- a beast on the hunt: a weaker city or avatar next door is prey; otherwise a step towards the nearest herd,
-- or towards the nearest city when there is no herd (it stops beside a city it cannot beat)
create or replace function night_hunt(p_game_id uuid, p_occ hex_occupants, p_log_id uuid, p_key text)
returns jsonb language plpgsql as $$
declare
  e entities;
  cty record;
  avr record;
  tgt record;
  herd_d int;
  city_d int;
  res text := 'prowl';
  to_j jsonb := null;
  fight_right jsonb;
  out jsonb;
begin
  select * into e from entities where id = p_occ.entity_id;
  select c.entity_id, c.q, c.r, x.name into cty from cities c join entities x on x.id = c.entity_id
  where c.game_id = p_game_id and x.status = 'active' and hex_distance(p_occ.q, p_occ.r, c.q, c.r) = 1 and city_dots(c.entity_id) < e.strength
  order by random() limit 1;
  if found then
    fight_right := jsonb_build_object('label', cty.name, 'emoji', city_species_emoji(cty.entity_id), 'entity_id', cty.entity_id, 'city_id', cty.entity_id,
                                      'player_id', city_majority(cty.entity_id), 'mod', city_dots(cty.entity_id), 'roll', null);
    perform night_open_fight(p_game_id, 'beast_city', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, jsonb_build_object('q', cty.q, 'r', cty.r), jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, p_log_id);
    out := jsonb_build_object(p_key, 'attack', 'fight_at', jsonb_build_object('q', cty.q, 'r', cty.r), 'scene', 'beast_city');
    update actions_log set outcome = outcome || out where id = p_log_id;
    return out;
  end if;
  select x.id, x.name, x.emoji, x.hp, o.q, o.r into avr from hex_occupants o join entities x on x.id = o.entity_id
  where o.game_id = p_game_id and x.kind = 'avatar' and x.status = 'active' and hex_distance(p_occ.q, p_occ.r, o.q, o.r) = 1 and coalesce(x.hp, 0) < e.strength
  order by random() limit 1;
  if found then
    fight_right := jsonb_build_object('label', avr.name, 'emoji', avr.emoji, 'entity_id', avr.id, 'avatar_id', avr.id, 'player_id', entity_creator(avr.id), 'mod', coalesce(avr.hp, 0), 'roll', null);
    perform night_open_fight(p_game_id, 'beast_avatar', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, jsonb_build_object('q', avr.q, 'r', avr.r), jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, p_log_id);
    out := jsonb_build_object(p_key, 'attack', 'fight_at', jsonb_build_object('q', avr.q, 'r', avr.r), 'scene', 'beast_avatar');
    update actions_log set outcome = outcome || out where id = p_log_id;
    return out;
  end if;
  -- sated: a herd already grazes on this field
  if exists (select 1 from hex_occupants o join entities x on x.id = o.entity_id where o.game_id = p_game_id and o.q = p_occ.q and o.r = p_occ.r and creature_role(x) = 'herbivore') then
    out := jsonb_build_object(p_key, 'sated');
    update actions_log set outcome = outcome || out where id = p_log_id;
    return out;
  end if;
  herd_d := night_herd_distance(p_game_id, p_occ.q, p_occ.r);
  if herd_d is not null then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'beast') c order by night_herd_distance(p_game_id, c.q, c.r) asc nulls last, random() limit 1;
  else
    select min(hex_distance(p_occ.q, p_occ.r, c.q, c.r))::int into city_d from cities c join entities x on x.id = c.entity_id where c.game_id = p_game_id and x.status = 'active';
    if city_d is null then
      select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'beast') c order by c.fert desc, random() limit 1;
    elsif city_d <= 1 then
      tgt := null;
    else
      select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'beast') c
      order by (select min(hex_distance(c.q, c.r, y.q, y.r)) from cities y join entities x on x.id = y.entity_id where y.game_id = p_game_id and x.status = 'active') asc, random() limit 1;
    end if;
  end if;
  if tgt.q is null then
    out := jsonb_build_object(p_key, 'prowl');
  elsif tgt.mode = 'free' then
    update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id;
    res := 'hunt';
    to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
    out := jsonb_build_object(p_key, res, 'to', to_j, 'fertility_to', hex_fertility(p_game_id, tgt.q, tgt.r));
  else
    select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id),
                              'mod', case when creature_role(x) = 'beast' then x.strength else 0 end, 'roll', null)
    into fight_right from hex_occupants o join entities x on x.id = o.entity_id
    where o.game_id = p_game_id and o.q = tgt.q and o.r = tgt.r and o.slot = 1;
    perform night_open_fight(p_game_id, 'creature', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, jsonb_build_object('q', tgt.q, 'r', tgt.r), jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, p_log_id);
    out := jsonb_build_object(p_key, 'fight', 'fight_at', jsonb_build_object('q', tgt.q, 'r', tgt.r), 'scene', 'creature');
  end if;
  update actions_log set outcome = outcome || out where id = p_log_id;
  return out;
end $$;

create or replace function night_unit_herbivore(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d1 int := roll_d6();
  d2 int := roll_d6();
  t int;
  tame boolean;
  res text := 'stay';
  tgt record;
  new_id uuid;
  to_j jsonb := null;
  clone_j jsonb := null;
  extinct boolean := false;
  lid uuid;
begin
  t := d1 + d2;
  select * into e from entities where id = p_occ.entity_id;
  tame := exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_occ.q and c.r = p_occ.r)
       or exists (select 1 from hex_occupants o join entities x on x.id = o.entity_id where o.game_id = p_game_id and o.q = p_occ.q and o.r = p_occ.r and o.slot = 1 and creature_role(x) = 'tribe');
  if t = 2 then
    extinct := night_remove_occupant(p_occ.id); res := 'die';
  elsif t <= 5 then
    if tame then res := 'tame';
    else
      select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by random() limit 1;
      if found then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'wander'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif t <= 8 then
    res := case when tame then 'tame' else 'stay' end;
  elsif t <= 10 then
    if tame then res := 'tame';
    else
      select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by c.fert desc, random() limit 1;
      if found then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'graze_best'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif t = 11 then
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by c.fert desc, random() limit 1;
    if found then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 0, e.id) returning id into new_id;
      res := 'reproduce'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
    else
      res := 'crowded';
    end if;
  else
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'herbivore') c order by c.fert desc, random() limit 1;
    res := case when found then 'mutation' else 'crowded' end;
  end if;
  lid := night_log(p_game_id, 'night_move', jsonb_build_object('d1', d1, 'd2', d2, 'total', t),
    jsonb_build_object('unit', 'herbivore', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', e.strength,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_id, 'extinct', extinct,
                       'fertility_to', case when coalesce(to_j, clone_j) is null then null else hex_fertility(p_game_id, (coalesce(to_j, clone_j)->>'q')::int, (coalesce(to_j, clone_j)->>'r')::int) end));
  if res = 'mutation' then perform night_open_mutation(p_game_id, e.id, 'herbivore', tgt.q, tgt.r, lid, false); end if;
end $$;

create or replace function night_unit_beast(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d1 int := roll_d6();
  d2 int := roll_d6();
  t int;
  res text := 'sleep';
  tgt record;
  to_j jsonb := null;
  clone_j jsonb := null;
  new_occ hex_occupants;
  lid uuid;
  fight_at jsonb := null;
  fight_right jsonb := null;
  extinct boolean := false;
begin
  t := d1 + d2;
  select * into e from entities where id = p_occ.entity_id;
  if t = 2 then
    extinct := night_remove_occupant(p_occ.id); res := 'die';
  elsif t <= 5 then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'beast') c order by random() limit 1;
    if found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'wander'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    else
      res := 'sleep';
    end if;
  elsif t <= 8 then
    res := 'sleep';
  elsif t <= 10 then
    res := 'hunting';
  elsif t = 11 then
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'beast') c where c.mode = 'free' order by c.fert desc, random() limit 1;
    if found then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 1, e.id) returning * into new_occ;
      res := 'pack'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
    else
      res := 'crowded';
    end if;
  else
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'beast') c where c.mode = 'free' order by c.fert desc, random() limit 1;
    res := case when found then 'mutation' else 'crowded' end;
  end if;
  lid := night_log(p_game_id, 'night_move', jsonb_build_object('d1', d1, 'd2', d2, 'total', t),
    jsonb_build_object('unit', 'beast', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', e.strength,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_occ.id, 'extinct', extinct,
                       'fight_at', fight_at, 'scene', case when fight_at is null then null else 'creature' end,
                       'fertility_to', case when to_j is null then null else hex_fertility(p_game_id, (to_j->>'q')::int, (to_j->>'r')::int) end));
  if res = 'fight' then
    select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id),
                              'mod', case when creature_role(x) = 'beast' then x.strength else 0 end, 'roll', null)
    into fight_right from hex_occupants o join entities x on x.id = o.entity_id
    where o.game_id = p_game_id and o.q = (fight_at->>'q')::int and o.r = (fight_at->>'r')::int and o.slot = 1;
    perform night_open_fight(p_game_id, 'creature', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, fight_at, jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, lid);
  elsif res = 'hunting' then
    perform night_hunt(p_game_id, p_occ, lid, 'result');
  elsif res = 'pack' then
    perform night_hunt(p_game_id, new_occ, lid, 'hunt_new');
  elsif res = 'mutation' then
    perform night_open_mutation(p_game_id, e.id, 'beast', tgt.q, tgt.r, lid, true);
  end if;
end $$;

create or replace function night_unit_tribe(p_game_id uuid, p_occ hex_occupants)
returns void language plpgsql as $$
declare
  e entities;
  d1 int := roll_d6();
  d2 int := roll_d6();
  t int;
  res text := 'camp';
  tgt record;
  to_j jsonb := null;
  clone_j jsonb := null;
  new_id uuid;
  lid uuid;
  fight_at jsonb := null;
  fight_right jsonb := null;
  cid uuid;
  cur_f int;
  best_f int;
  extinct boolean := false;
begin
  t := d1 + d2;
  select * into e from entities where id = p_occ.entity_id;
  if exists (select 1 from cities c where c.game_id = p_game_id and c.q = p_occ.q and c.r = p_occ.r) then
    perform night_log(p_game_id, 'night_move', jsonb_build_object('d1', d1, 'd2', d2, 'total', t),
      jsonb_build_object('unit', 'tribe', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', 0,
                         'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', 'people'));
    return;
  end if;
  if t = 2 then
    extinct := night_remove_occupant(p_occ.id); res := 'die';
  elsif t <= 5 then
    select c.q, c.r, c.mode into tgt from night_candidates(p_game_id, p_occ, 'tribe') c order by random() limit 1;
    if found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'explore'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif t <= 8 then
    res := 'camp';
  elsif t <= 10 then
    cur_f := coalesce(hex_fertility(p_game_id, p_occ.q, p_occ.r), -99);
    select c.q, c.r, c.mode, c.fert into tgt from night_candidates(p_game_id, p_occ, 'tribe') c order by c.fert desc, random() limit 1;
    best_f := case when found then tgt.fert else -99 end;
    if cur_f >= best_f and cur_f >= 1 then
      res := 'settle';
    elsif found then
      if tgt.mode = 'free' then update hex_occupants set q = tgt.q, r = tgt.r where id = p_occ.id; res := 'promised'; to_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
      else res := 'fight'; fight_at := jsonb_build_object('q', tgt.q, 'r', tgt.r); end if;
    end if;
  elsif t = 11 then
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'tribe') c where c.mode = 'free' order by c.fert desc, random() limit 1;
    if found then
      insert into hex_occupants (game_id, q, r, slot, entity_id) values (p_game_id, tgt.q, tgt.r, 1, e.id) returning id into new_id;
      res := 'split'; clone_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
    else
      res := 'crowded';
    end if;
  else
    select c.q, c.r into tgt from night_candidates(p_game_id, p_occ, 'tribe') c where c.mode = 'free' order by c.fert desc, random() limit 1;
    res := case when found then 'mutation' else 'crowded' end;
  end if;
  lid := night_log(p_game_id, 'night_move', jsonb_build_object('d1', d1, 'd2', d2, 'total', t),
    jsonb_build_object('unit', 'tribe', 'occupant_id', p_occ.id, 'entity_id', e.id, 'name', e.name, 'emoji', e.emoji, 'strength', 0,
                       'from', jsonb_build_object('q', p_occ.q, 'r', p_occ.r), 'result', res, 'to', to_j, 'clone_to', clone_j, 'new_occupant_id', new_id, 'extinct', extinct,
                       'fight_at', fight_at, 'scene', case when fight_at is null then null else 'creature' end,
                       'fertility_to', case when to_j is null then null else hex_fertility(p_game_id, (to_j->>'q')::int, (to_j->>'r')::int) end));
  if res = 'settle' then
    cid := night_found_city(p_game_id, p_occ.q, p_occ.r, e.id, jsonb_build_array(jsonb_build_object('player_id', null, 'n', 1)), coalesce(entity_creator(e.id), night_groups_namer(p_game_id, '[]'::jsonb)), 'tribe', null);
    update actions_log set outcome = outcome || jsonb_build_object('new_city_id', cid) where id = lid;
  elsif res = 'fight' then
    select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id), 'mod', x.strength, 'roll', null)
    into fight_right from hex_occupants o join entities x on x.id = o.entity_id
    where o.game_id = p_game_id and o.q = (fight_at->>'q')::int and o.r = (fight_at->>'r')::int and o.slot = 1;
    perform night_open_fight(p_game_id, 'creature', night_side_creature(p_game_id, e.id, p_occ.id, null), fight_right, fight_at, jsonb_build_object('q', p_occ.q, 'r', p_occ.r), null, lid);
  elsif res = 'mutation' then
    perform night_open_mutation(p_game_id, e.id, 'tribe', tgt.q, tgt.r, lid, false);
  end if;
end $$;

-- a city: 2d6 + fertility - population. 10+ bloom, 7..9 calm or a colony, 6- famine
create or replace function night_unit_city(p_game_id uuid, p_city uuid)
returns void language plpgsql as $$
declare
  g games;
  c cities;
  e entities;
  f int;
  p int;
  d1 int := roll_d6();
  d2 int := roll_d6();
  t int;
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
  lost_pid uuid;
  lost jsonb := null;
  fight_right jsonb;
  left_side jsonb;
begin
  select * into g from games where id = p_game_id;
  select * into c from cities where entity_id = p_city;
  select * into e from entities where id = p_city;
  if c.entity_id is null or e.status <> 'active' then return; end if;
  f := coalesce(hex_fertility(p_game_id, c.q, c.r), 0);
  p := city_dots(p_city);
  t := d1 + d2 + f - p;
  if t >= 10 then
    added := city_add_atheists(p_city, 1);
    res := case when added > 0 then 'bloom' else 'full' end;
  elsif t >= 7 then
    if p <= f then
      res := 'calm';
    else
      overflow := p - f;
      groups := city_remove_groups(p_city, overflow);
      namer := night_groups_namer(p_game_id, groups);
      select to_entity_id into species from entity_links where from_entity_id = p_city and relation = 'member_species' limit 1;
      -- the best land one or two fields away; a beast there must be fought
      select h.q, h.r,
             (select o.id from hex_occupants o join entities x on x.id = o.entity_id where o.game_id = p_game_id and o.q = h.q and o.r = h.r and o.slot = 1 and creature_role(x) = 'beast') as beast_occ
      into tgt
      from hexes h
      where h.game_id = p_game_id and hex_distance(c.q, c.r, h.q, h.r) between 1 and 2 and not hex_blocked(h.biome)
        and not exists (select 1 from cities x where x.game_id = p_game_id and x.q = h.q and x.r = h.r)
        and not exists (select 1 from hex_occupants o join entities x on x.id = o.entity_id
                        where o.game_id = p_game_id and o.q = h.q and o.r = h.r and o.slot = 1 and creature_role(x) = 'tribe' and x.id is distinct from species)
      order by coalesce(hex_fertility(p_game_id, h.q, h.r), -99) desc, random() limit 1;
      if found and tgt.beast_occ is null then
        res := 'colony'; target_kind := 'found'; target_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
        new_city := night_found_city(p_game_id, tgt.q, tgt.r, species, groups, namer, 'exodus', p_city);
      elsif found then
        res := 'colony'; target_kind := 'beast'; target_j := jsonb_build_object('q', tgt.q, 'r', tgt.r);
        select jsonb_build_object('label', x.name, 'emoji', x.emoji, 'entity_id', x.id, 'occupant_id', o.id, 'player_id', entity_creator(x.id), 'mod', x.strength, 'roll', null)
        into fight_right from hex_occupants o join entities x on x.id = o.entity_id where o.id = tgt.beast_occ;
      else
        res := 'stay';
        perform night_join_groups(p_city, groups);
      end if;
      gone := destroy_city_if_empty(p_city, g.round_number, g.era);
    end if;
  else
    lost_pid := city_remove_random_dot(p_city);
    if lost_pid is not null then perform collect_souls(p_city, lost_pid, 1); end if;
    lost := jsonb_build_object('player_id', lost_pid, 'n', 1);
    gone := destroy_city_if_empty(p_city, g.round_number, g.era);
    res := 'famine';
  end if;
  lid := night_log(p_game_id, 'night_city', jsonb_build_object('d1', d1, 'd2', d2, 'total', t, 'modifier', f - p),
    jsonb_build_object('city_id', p_city, 'name', e.name, 'q', c.q, 'r', c.r, 'roll', d1 + d2, 'fertility', f, 'population', p, 'result', res,
                       'overflow', overflow, 'groups', groups, 'target', target_j, 'target_kind', target_kind, 'new_city_id', new_city,
                       'lost', lost, 'source_destroyed', gone, 'level', city_dots(p_city)));
  if target_kind = 'beast' then
    left_side := jsonb_build_object('label', 'Osadnicy z ' || e.name, 'emoji', coalesce((select emoji from entities where id = species), '👤'), 'entity_id', species,
                                    'city_id', p_city, 'player_id', namer, 'mod', night_groups_total(groups), 'roll', null);
    perform night_open_fight(p_game_id, 'exodus_beast', left_side, fight_right, target_j, jsonb_build_object('q', c.q, 'r', c.r),
      jsonb_build_object('groups', groups, 'source_city_id', p_city, 'species_id', species, 'namer_id', namer), lid);
  end if;
end $$;

-- after the dice: the verdict waits for both gods to read it; a founding waits behind it
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
  fight_lid uuid;
  players jsonb := '[]'::jsonb;
  nxt jsonb := null;
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
        new_city := night_found_city(p_game_id, (at_j->>'q')::int, (at_j->>'r')::int, species, settled, namer, 'exodus', src, false);
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
  fight_lid := night_log(p_game_id, 'night_fight',
    jsonb_build_object('att', jsonb_build_object('d1', ls->'roll'->'d1', 'd2', ls->'roll'->'d2', 'modifier', ls->'mod', 'total', ls->'roll'->'total'),
                       'def', jsonb_build_object('d1', rs->'roll'->'d1', 'd2', rs->'roll'->'d2', 'modifier', rs->'mod', 'total', rs->'roll'->'total')),
    oc);
  if ls->>'player_id' is not null then players := players || to_jsonb(ls->>'player_id'); end if;
  if rs->>'player_id' is not null and (rs->>'player_id') is distinct from (ls->>'player_id') then players := players || to_jsonb(rs->>'player_id'); end if;
  if new_city is not null then nxt := night_naming_for(p_game_id, new_city); end if;
  update chaos_nights set status = 'verdict', updated_at = now(),
    pending = jsonb_build_object('kind', 'verdict', 'since', now(), 'log_id', fight_lid, 'players', players, 'acks', '[]'::jsonb, 'next', nxt)
  where game_id = p_game_id;
end $$;

-- the verdict was read: on to the naming it may hide, or on with the night
create or replace function night_close_verdict(p_game_id uuid)
returns void language plpgsql as $$
declare
  nt chaos_nights;
  nxt jsonb;
begin
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.status <> 'verdict' then return; end if;
  nxt := nt.pending->'next';
  if nxt is not null and jsonb_typeof(nxt) = 'object' then
    update chaos_nights set status = 'naming', pending = nxt || jsonb_build_object('since', now()), updated_at = now() where game_id = p_game_id;
  else
    update chaos_nights set status = 'running', pending = null, updated_at = now() where game_id = p_game_id;
  end if;
end $$;

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
  if nt.status = 'verdict' then raise exception 'Noc czeka, aż bogowie przeczytają wynik walki.'; end if;
  if nt.status = 'naming' then raise exception 'Noc czeka na nazwę nowego miasta.'; end if;
  if nt.status = 'mutation' then raise exception 'Noc czeka na nazwę nowej odmiany.'; end if;
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
    if guard > 3 * jsonb_array_length(nt.queue) + 24 then exit; end if;
    select * into nt from chaos_nights where game_id = p_game_id;
    if nt.status = 'fight' then
      perform night_auto_roll(p_game_id);
    elsif nt.status = 'verdict' then
      perform night_close_verdict(p_game_id);
    elsif nt.status = 'naming' then
      update actions_log set outcome = outcome || jsonb_build_object('name_pending', false, 'placeholder', true) where id = (nt.pending->>'log_id')::uuid;
      update chaos_nights set status = 'running', pending = null, updated_at = now() where game_id = p_game_id;
    elsif nt.status = 'mutation' then
      perform night_apply_mutation(p_game_id, null, null, true, p_by);
    elsif nt.status = 'done' then
      exit;
    else
      if not night_step(p_game_id) then exit; end if;
    end if;
  end loop;
  select * into nt from chaos_nights where game_id = p_game_id;
  if nt.status <> 'done' then perform night_finish(p_game_id); end if;
end $$;

-- the rest of the current phase at once; fights, verdicts and names still wait for the table
create or replace function chaos_skip_phase(p_game_id uuid)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  nt chaos_nights;
  phase text;
  guard int := 0;
begin
  select * into g from games where id = p_game_id;
  if g.host_id <> me.user_id then raise exception 'Fazę pomija gospodarz.' using errcode = '42501'; end if;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status = 'done' then raise exception 'Noc nie trwa.'; end if;
  if nt.status <> 'running' then return nt; end if;
  if nt.cursor >= jsonb_array_length(nt.queue) then
    perform night_finish(p_game_id);
    select * into nt from chaos_nights where game_id = p_game_id;
    return nt;
  end if;
  phase := nt.queue->nt.cursor->>'t';
  loop
    guard := guard + 1;
    if guard > jsonb_array_length(nt.queue) + 2 then exit; end if;
    select * into nt from chaos_nights where game_id = p_game_id;
    if nt.status <> 'running' then exit; end if;
    if nt.cursor >= jsonb_array_length(nt.queue) then
      perform night_finish(p_game_id);
      exit;
    end if;
    if (nt.queue->nt.cursor->>'t') <> phase then exit; end if;
    perform night_step(p_game_id);
  end loop;
  select * into nt from chaos_nights where game_id = p_game_id;
  return nt;
end $$;

-- a god read the verdict (the host reads for the absent; after a minute anyone may)
create or replace function chaos_ack_fight(p_game_id uuid)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  nt chaos_nights;
  pd jsonb;
  acks jsonb;
  required jsonb;
  done boolean := false;
  x text;
begin
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status <> 'verdict' then return nt; end if;
  pd := nt.pending;
  acks := coalesce(pd->'acks', '[]'::jsonb);
  required := coalesce(pd->'players', '[]'::jsonb);
  if not (acks @> to_jsonb(me.id::text)) then acks := acks || to_jsonb(me.id::text); end if;
  if g.host_id = me.user_id or jsonb_array_length(required) = 0 or now() - (pd->>'since')::timestamptz > interval '60 seconds' then
    done := true;
  else
    done := true;
    for x in select jsonb_array_elements_text(required) loop
      if not (acks @> to_jsonb(x)) then done := false; end if;
    end loop;
  end if;
  if done then
    perform night_close_verdict(p_game_id);
  else
    update chaos_nights set pending = pd || jsonb_build_object('acks', acks), updated_at = now() where game_id = p_game_id;
  end if;
  select * into nt from chaos_nights where game_id = p_game_id;
  return nt;
end $$;

-- the god of the species names the new kind (the host for the absent; after a minute anyone)
create or replace function chaos_name_mutation(p_game_id uuid, p_name text, p_emoji text)
returns chaos_nights language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  nt chaos_nights;
  pd jsonb;
  namer uuid;
begin
  select * into g from games where id = p_game_id;
  select * into nt from chaos_nights where game_id = p_game_id for update;
  if nt.game_id is null or nt.status <> 'mutation' then raise exception 'Żadna odmiana nie czeka na nazwę.'; end if;
  pd := nt.pending;
  if left(trim(coalesce(p_name, '')), 80) = '' then raise exception 'Nazwij nową odmianę.'; end if;
  if nullif(trim(coalesce(p_emoji, '')), '') is null then raise exception 'Wybierz emotikonę.'; end if;
  namer := nullif(pd->>'namer_id', '')::uuid;
  if not (namer is null or namer = me.id or g.host_id = me.user_id or now() - (pd->>'since')::timestamptz > interval '60 seconds') then
    raise exception 'Odmianę nazywa bóstwo, które stworzyło jej gatunek, albo gospodarz.' using errcode = '42501';
  end if;
  perform night_apply_mutation(p_game_id, p_name, p_emoji, false, me.id);
  select * into nt from chaos_nights where game_id = p_game_id;
  return nt;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'resource_known(text)', 'hex_herd_bonus(uuid, int, int)', 'hex_fertility(uuid, int, int)', 'perform_action(uuid, text, jsonb)',
    'chaos_skip_phase(uuid)', 'chaos_ack_fight(uuid)', 'chaos_name_mutation(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
