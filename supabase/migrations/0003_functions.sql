-- Our Pantheon VTT: game logic as SECURITY DEFINER RPCs.
-- Every function checks auth.uid() membership itself; clients never write game state directly.

-- ---------- helpers ----------
create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'          then (array[2, 5, 12])[p_era]
    when 'change_biome'        then (array[1, 3, 6])[p_era]
    when 'catastrophe'         then 10
    when 'create_creature'     then (array[10, 3, 12])[p_era]
    when 'change_creature'     then (array[5, 1, 6])[p_era]
    when 'create_civilization' then (array[22, 12, 6])[p_era]
    when 'change_civilization' then (array[12, 8, 4])[p_era]
    when 'create_faction'      then (array[10, 6, 4])[p_era]
    when 'change_faction'      then (array[4, 4, 2])[p_era]
    when 'create_orthodoxy'    then (array[12, 8, 6])[p_era]
    when 'command_followers'   then 2
    when 'create_avatar'       then (array[10, 12, 15])[p_era]
    when 'command_avatar'      then 2
    when 'resurrect_avatar'    then (array[12, 15, 25])[p_era]
    when 'great_miracle'       then (array[15, 30, 50])[p_era]
    else null
  end;
$$;

create or replace function roll_d6()
returns smallint language sql volatile as $$
  select (floor(random() * 6) + 1)::smallint;
$$;

create or replace function require_player(p_game_id uuid)
returns players language plpgsql stable security definer set search_path = public as $$
declare me players;
begin
  select * into me from players where game_id = p_game_id and user_id = auth.uid();
  if me.id is null then
    raise exception 'Nie jesteś w tej grze.' using errcode = '42501';
  end if;
  return me;
end $$;

-- Highest Logos among gods still awake takes the turn. Ties: current holder keeps it,
-- otherwise the lowest seat. Nobody awake -> Chaos phase.
create or replace function recompute_turn(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
  next_id uuid;
begin
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

create or replace function generate_game_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
begin
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from games g where g.code = new_code);
  end loop;
  return new_code;
end $$;

-- ---------- profile ----------
create or replace function set_display_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(p_name)) = 0 then raise exception 'Imię nie może być puste.'; end if;
  insert into profiles (id, display_name) values (auth.uid(), trim(p_name))
  on conflict (id) do update set display_name = excluded.display_name;
end $$;

-- ---------- lobby ----------
create or replace function create_game(p_name text, p_god_name text default '', p_avatar_key text default 'fresco-01')
returns games language plpgsql security definer set search_path = public as $$
declare g games;
begin
  if auth.uid() is null then raise exception 'Zaloguj się.' using errcode = '42501'; end if;
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  insert into games (code, name, host_id)
  values (generate_game_code(), coalesce(nullif(trim(p_name), ''), 'Nowy świat'), auth.uid())
  returning * into g;
  insert into players (game_id, user_id, god_name, avatar_key, seat_order)
  values (g.id, auth.uid(), coalesce(p_god_name, ''), coalesce(p_avatar_key, 'fresco-01'), 1);
  return g;
end $$;

create or replace function join_game(p_code text, p_god_name text default '', p_avatar_key text default 'fresco-01')
returns games language plpgsql security definer set search_path = public as $$
declare
  g games;
  n int;
begin
  if auth.uid() is null then raise exception 'Zaloguj się.' using errcode = '42501'; end if;
  insert into profiles (id) values (auth.uid()) on conflict do nothing;
  select * into g from games where code = upper(trim(p_code)) for update;
  if g.id is null then raise exception 'Nie ma świątyni o takim kodzie.'; end if;
  if exists (select 1 from players where game_id = g.id and user_id = auth.uid()) then
    return g;
  end if;
  if g.status not in ('lobby', 'palette') then raise exception 'Ta gra już trwa.'; end if;
  select count(*) into n from players where game_id = g.id;
  if n >= 6 then raise exception 'Panteon jest pełny (6 bóstw).'; end if;
  insert into players (game_id, user_id, god_name, avatar_key, seat_order)
  values (g.id, auth.uid(), coalesce(p_god_name, ''), coalesce(p_avatar_key, 'fresco-01'), n + 1);
  return g;
end $$;

create or replace function set_god(p_game_id uuid, p_god_name text, p_avatar_key text)
returns void language plpgsql security definer set search_path = public as $$
declare me players := require_player(p_game_id);
begin
  update players set god_name = coalesce(trim(p_god_name), ''), avatar_key = coalesce(p_avatar_key, avatar_key)
  where id = me.id;
end $$;

create or replace function open_palette(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może otworzyć paletę.' using errcode = '42501'; end if;
  if g.status <> 'lobby' then raise exception 'Paleta jest już otwarta.'; end if;
  update games set status = 'palette' where id = p_game_id;
end $$;

create or replace function start_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może rozpocząć grę.' using errcode = '42501'; end if;
  if g.status not in ('lobby', 'palette') then raise exception 'Gra już trwa.'; end if;
  update games
     set status = 'playing', era = 1, round_number = 1, era_started_round = 1,
         phase = 'rolling', current_turn_player_id = null
   where id = p_game_id;
  update players set logos = 5, has_rolled = false, is_resting = false,
                     low_logos_streak = 0, avatar_action_used = false
   where game_id = p_game_id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, 1, 1, null, 'game_start', 'Pierwsza Era się rozpoczyna. Świat jest pustą równiną.');
end $$;

-- ---------- rounds & logos ----------
create or replace function roll_logos(p_game_id uuid)
returns logos_rolls language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d1 smallint := roll_d6();
  d2 smallint := roll_d6();
  b_orth smallint;
  total int;
  r logos_rolls;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'rolling' then raise exception 'To nie jest czas Rzutu Logos.'; end if;
  if me.has_rolled then raise exception 'Już rzuciłeś w tej rundzie.'; end if;

  select least(3, count(*))::smallint into b_orth
  from entity_gods eg join entities e on e.id = eg.entity_id
  where eg.player_id = me.id and e.kind = 'orthodoxy' and e.status = 'active';

  total := d1 + d2 + me.low_logos_streak + b_orth;

  update players set logos = logos + total, has_rolled = true where id = me.id;

  insert into logos_rolls (game_id, round_number, player_id, die1, die2, bonus_streak, bonus_orthodoxy, total)
  values (p_game_id, g.round_number, me.id, d1, d2, me.low_logos_streak, b_orth, total)
  returning * into r;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'logos_roll', total,
          jsonb_build_object('d1', d1, 'd2', d2, 'bonus_streak', me.low_logos_streak, 'bonus_orthodoxy', b_orth, 'total', total),
          format('Rzut Logos: %s + %s%s%s = %s', d1, d2,
                 case when me.low_logos_streak > 0 then format(' + %s (skromność)', me.low_logos_streak) else '' end,
                 case when b_orth > 0 then format(' + %s (ortodoksje)', b_orth) else '' end,
                 total));

  if not exists (select 1 from players where game_id = p_game_id and not has_rolled) then
    update games set phase = 'gods' where id = p_game_id;
    perform recompute_turn(p_game_id);
  end if;
  return r;
end $$;

-- payload: { summary, use_avatar_action, entity: {op:'create'|'update', id, kind, name, description,
--            image_key, faction_type, parent_civilization_id, traits[], specialties[], flaws[],
--            desires[], requirements[], conditions[], status, is_chaos, co_god_ids[], species_ids[] } }
create or replace function perform_action(p_game_id uuid, p_action_key text, p_payload jsonb default '{}'::jsonb)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  cost int;
  free_avatar boolean := coalesce((p_payload->>'use_avatar_action')::boolean, false);
  ent jsonb := p_payload->'entity';
  ent_id uuid;
  parent_id uuid;
  log_row actions_log;
  gid uuid;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id <> me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;

  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;

  if free_avatar then
    if me.avatar_action_used then raise exception 'Darmowa akcja awatara już wykorzystana w tej rundzie.'; end if;
    if not exists (select 1 from entity_gods eg join entities e on e.id = eg.entity_id
                   where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active') then
      raise exception 'Nie masz żywego awatara.';
    end if;
    cost := 0;
    update players set avatar_action_used = true where id = me.id;
  end if;

  if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;

  -- entity create / update
  if ent is not null then
    parent_id := nullif(ent->>'parent_civilization_id', '')::uuid;
    if parent_id is not null and not exists (select 1 from entities where id = parent_id and game_id = p_game_id) then
      raise exception 'Cywilizacja nadrzędna nie należy do tej gry.';
    end if;

    if ent->>'op' = 'create' then
      insert into entities (game_id, kind, name, description, image_key, faction_type, parent_civilization_id,
                            traits, specialties, flaws, desires, requirements, conditions, is_chaos,
                            created_round, created_era, created_by_player_id)
      values (p_game_id, (ent->>'kind')::entity_kind, coalesce(nullif(trim(ent->>'name'), ''), 'Bez imienia'),
              coalesce(ent->>'description', ''), ent->>'image_key', ent->>'faction_type', parent_id,
              coalesce(array(select jsonb_array_elements_text(ent->'traits')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'specialties')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'flaws')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'desires')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'requirements')), '{}'),
              coalesce(array(select jsonb_array_elements_text(ent->'conditions')), '{}'),
              coalesce((ent->>'is_chaos')::boolean, false),
              g.round_number, g.era, me.id)
      returning id into ent_id;

      insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'creator');
      for gid in select (jsonb_array_elements_text(coalesce(ent->'co_god_ids', '[]'::jsonb)))::uuid loop
        if gid <> me.id and exists (select 1 from players where id = gid and game_id = p_game_id) then
          insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, gid, p_game_id, 'co_creator')
          on conflict do nothing;
        end if;
      end loop;
      for gid in select (jsonb_array_elements_text(coalesce(ent->'species_ids', '[]'::jsonb)))::uuid loop
        if exists (select 1 from entities where id = gid and game_id = p_game_id) then
          insert into entity_links (from_entity_id, to_entity_id, game_id, relation)
          values (ent_id, gid, p_game_id, case when (ent->>'kind') = 'creature' then 'variant_of' else 'member_species' end::link_relation)
          on conflict do nothing;
        end if;
      end loop;

    elsif ent->>'op' = 'update' then
      ent_id := (ent->>'id')::uuid;
      if not exists (select 1 from entities where id = ent_id and game_id = p_game_id) then
        raise exception 'Nie ma takiego bytu w tej grze.';
      end if;
      update entities set
        name = coalesce(nullif(trim(ent->>'name'), ''), name),
        description = coalesce(ent->>'description', description),
        image_key = coalesce(ent->>'image_key', image_key),
        faction_type = coalesce(ent->>'faction_type', faction_type),
        parent_civilization_id = coalesce(parent_id, parent_civilization_id),
        kind = coalesce((ent->>'kind')::entity_kind, kind),
        traits = case when ent ? 'traits' then array(select jsonb_array_elements_text(ent->'traits')) else traits end,
        specialties = case when ent ? 'specialties' then array(select jsonb_array_elements_text(ent->'specialties')) else specialties end,
        flaws = case when ent ? 'flaws' then array(select jsonb_array_elements_text(ent->'flaws')) else flaws end,
        desires = case when ent ? 'desires' then array(select jsonb_array_elements_text(ent->'desires')) else desires end,
        requirements = case when ent ? 'requirements' then array(select jsonb_array_elements_text(ent->'requirements')) else requirements end,
        conditions = case when ent ? 'conditions' then array(select jsonb_array_elements_text(ent->'conditions')) else conditions end,
        status = coalesce((ent->>'status')::entity_status, status)
      where id = ent_id;
      -- a resurrecting or co-creating god gets pinned too
      if p_action_key in ('resurrect_avatar', 'create_orthodoxy') or (ent->>'kind') = 'orthodoxy' then
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'co_creator')
        on conflict do nothing;
      end if;
      -- faction <-> orthodoxy conversion: neutral factions serve no god
      if ent->>'kind' = 'faction' then delete from entity_gods where entity_id = ent_id; end if;
    end if;
  end if;

  update players set logos = logos - cost where id = me.id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, free_avatar, coalesce(p_payload->>'summary', ''))
  returning * into log_row;

  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- Followers' tribute / punishment after a manual roll, or any table-agreed correction.
create or replace function adjust_logos(p_game_id uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  new_logos int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if p_delta = 0 or abs(p_delta) > 7 then raise exception 'Zmiana Logos musi mieścić się w zakresie od -7 do +7.'; end if;
  new_logos := greatest(0, me.logos + p_delta);
  update players set logos = new_logos where id = me.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, summary)
  values (p_game_id, g.round_number, g.era, me.id, case when p_delta > 0 then 'followers_gain' else 'followers_loss' end,
          new_logos - me.logos, coalesce(p_reason, ''));
  perform recompute_turn(p_game_id);
end $$;

create or replace function rest(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if me.is_resting then return; end if;
  update players set is_resting = true where id = me.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'rest', format('%s zapada w sen.', coalesce(nullif(me.god_name, ''), 'Bóstwo')));
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
  if p_amount <= 0 then raise exception 'Kwota musi być dodatnia.'; end if;
  if p_amount > me.logos then raise exception 'Nie masz tyle Logos.'; end if;
  select * into target from players where id = p_to_player_id and game_id = p_game_id;
  if target.id is null or target.id = me.id then raise exception 'Nieprawidłowy odbiorca.'; end if;
  update players set logos = logos - p_amount where id = me.id;
  update players set logos = logos + p_amount where id = target.id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'transfer', -p_amount,
          format('%s przekazuje %s Logos bóstwu %s.', coalesce(nullif(me.god_name, ''), 'Bóstwo'), p_amount, coalesce(nullif(target.god_name, ''), 'bez imienia')));
  perform recompute_turn(p_game_id);
end $$;

-- Free-form edit of flavour fields (no Logos): fixing names, descriptions, notes.
create or replace function edit_entity(p_entity_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e entities;
begin
  select * into e from entities where id = p_entity_id;
  if e.id is null then raise exception 'Nie ma takiego bytu.'; end if;
  perform require_player(e.game_id);
  update entities set
    name = coalesce(nullif(trim(p_patch->>'name'), ''), name),
    description = coalesce(p_patch->>'description', description),
    notes = coalesce(p_patch->>'notes', notes),
    image_key = coalesce(p_patch->>'image_key', image_key)
  where id = p_entity_id;
end $$;

-- Honest shared dice: rolled server-side, written to the Chronicle.
create or replace function log_dice_roll(p_game_id uuid, p_context text default '')
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d1 smallint := roll_d6();
  d2 smallint := roll_d6();
  tier text;
  r actions_log;
begin
  select * into g from games where id = p_game_id;
  if g.status <> 'playing' then raise exception 'Gra nie trwa.'; end if;
  tier := case when d1 + d2 >= 10 then 'strong' when d1 + d2 >= 7 then 'mixed' else 'weak' end;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'dice',
          jsonb_build_object('d1', d1, 'd2', d2, 'total', d1 + d2, 'tier', tier),
          coalesce(nullif(p_context, ''), 'Rzut 2k6'))
  returning * into r;
  return r;
end $$;

-- ---------- chaos ----------
create or replace function reveal_chaos(p_game_id uuid)
returns chaos_draws language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d chaos_draws;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;
  if exists (select 1 from chaos_draws where game_id = p_game_id and round_number = g.round_number) then
    raise exception 'Karta Chaosu została już odwrócona w tej rundzie.';
  end if;
  insert into chaos_draws (game_id, round_number, era, die1, die2, revealed_by)
  values (p_game_id, g.round_number, g.era, roll_d6(), roll_d6(), me.id)
  returning * into d;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'chaos_reveal',
          jsonb_build_object('d1', d.die1, 'd2', d.die2),
          format('Karta Chaosu odwrócona: kości %s i %s.', d.die1, d.die2));
  return d;
end $$;

create or replace function choose_chaos_die(p_game_id uuid, p_category_die smallint)
returns chaos_draws language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d chaos_draws;
  cat smallint;
  entry smallint;
  cat_key text;
begin
  select * into g from games where id = p_game_id;
  select * into d from chaos_draws where game_id = p_game_id and round_number = g.round_number for update;
  if d.id is null then raise exception 'Najpierw odwróć Kartę Chaosu.'; end if;
  if d.revealed_by <> me.id then raise exception 'Tylko bóstwo, które odwróciło kartę, wybiera kość.' using errcode = '42501'; end if;
  if d.category_key is not null then raise exception 'Kość już wybrana.'; end if;
  if p_category_die not in (1, 2) then raise exception 'Wybierz kość 1 lub 2.'; end if;
  cat := case when p_category_die = 1 then d.die1 else d.die2 end;
  entry := case when p_category_die = 1 then d.die2 else d.die1 end;
  cat_key := (array['region', 'event', 'people', 'magic', 'culture', 'disaster'])[cat];
  update chaos_draws set category_die = p_category_die, category_key = cat_key, entry_index = entry
  where id = d.id returning * into d;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'chaos_choice',
          jsonb_build_object('category', cat_key, 'entry', entry),
          format('Chaos: kategoria %s, wpis %s.', cat, entry));
  return d;
end $$;

create or replace function set_chaos_notes(p_game_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id;
  update chaos_draws set resolution_notes = coalesce(p_notes, '')
  where game_id = p_game_id and round_number = g.round_number;
end $$;

-- Round bookkeeping: the low-Logos streak, flags, next round.
create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;

  update players set
    low_logos_streak = case when logos <= 5 then least(3, low_logos_streak + 1) else 0 end,
    has_rolled = false,
    is_resting = false,
    avatar_action_used = false
  where game_id = p_game_id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'round_end', format('Runda %s dobiega końca.', g.round_number));

  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null
  where id = p_game_id;
end $$;

-- ---------- era vote ----------
create or replace function vote_advance_era(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  votes int;
  gods int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' then raise exception 'Gra nie trwa.'; end if;
  if g.era >= 3 then raise exception 'Trzecia Era jest ostatnią.'; end if;
  if g.round_number - g.era_started_round + 1 < 5 then
    raise exception 'Era musi trwać co najmniej 5 rund.';
  end if;

  if exists (select 1 from era_votes where game_id = p_game_id and player_id = me.id) then
    delete from era_votes where game_id = p_game_id and player_id = me.id;
  else
    insert into era_votes (game_id, player_id, target_era) values (p_game_id, me.id, g.era + 1);
  end if;

  select count(*) into votes from era_votes where game_id = p_game_id;
  select count(*) into gods from players where game_id = p_game_id;

  if votes * 2 > gods then
    update games set era = era + 1, era_started_round = round_number where id = p_game_id;
    delete from era_votes where game_id = p_game_id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
    values (p_game_id, g.round_number, g.era + 1, null, 'era_advance',
            format('Nadchodzi %s Era.', case g.era + 1 when 2 then 'Druga' else 'Trzecia' end));
  end if;
end $$;

create or replace function finish_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może zakończyć grę.' using errcode = '42501'; end if;
  update games set status = 'finished' where id = p_game_id;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, null, 'game_end', 'Bóstwa wygłaszają epilogi. Świat trwa dalej.');
end $$;

-- ---------- grants ----------
-- Game RPCs are callable by signed-in users only. Trigger helpers keep default execute rights
-- so the auth signup trigger (handle_new_user) still runs.
do $$
declare fn text;
begin
  foreach fn in array array[
    'set_display_name(text)', 'create_game(text, text, text)', 'join_game(text, text, text)', 'set_god(uuid, text, text)',
    'open_palette(uuid)', 'start_game(uuid)', 'roll_logos(uuid)', 'perform_action(uuid, text, jsonb)',
    'adjust_logos(uuid, int, text)', 'rest(uuid)', 'transfer_logos(uuid, uuid, int)', 'edit_entity(uuid, jsonb)',
    'log_dice_roll(uuid, text)', 'reveal_chaos(uuid)', 'choose_chaos_die(uuid, smallint)', 'set_chaos_notes(uuid, text)',
    'end_chaos_phase(uuid)', 'vote_advance_era(uuid)', 'finish_game(uuid)',
    'recompute_turn(uuid)', 'require_player(uuid)', 'generate_game_code()', 'roll_d6()', 'action_cost(text, smallint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
