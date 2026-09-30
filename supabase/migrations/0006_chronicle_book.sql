-- Our Pantheon VTT: the Chronicle told like a holy book, no starting Logos (everyone rolls),
-- the rulebook's safeguards on the avatar's free action, dice rolls with a modifier.
-- Functions below replace their 0003 / 0005 versions (create or replace); re-runnable.

-- ---------- helpers ----------
-- "1 Słowo", "3 Słowa", "5 Słów": Polish plural of the currency, for Chronicle sentences.
create or replace function logos_words(n int)
returns text language sql immutable as $$
  select case
    when n = 1 then '1 Słowo'
    when n % 10 between 2 and 4 and n % 100 not between 12 and 14 then n || ' Słowa'
    else n || ' Słów'
  end;
$$;

create or replace function god_name_of(p players)
returns text language sql immutable as $$
  select coalesce(nullif(trim(p.god_name), ''), 'Bezimienne bóstwo');
$$;

-- ---------- start: nobody has a single Word, everyone rolls ----------
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
  for line in select * from jsonb_array_elements(coalesce(p_prologue, '[]'::jsonb)) loop
    if length(trim(coalesce(line->>'text', ''))) > 0 then
      insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
      values (p_game_id, 0, 1, null, 'prologue', trim(line->>'text'));
    end if;
  end loop;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, 1, 1, null, 'game_start', 'Zaczyna się Pierwsza Era. Bóstwa nie mają jeszcze ani jednego Słowa i sięgają po kości.');
end $$;

-- ---------- logos roll ----------
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
          format('%s budzi się i śni nowe Słowa. Kości mówią: %s i %s%s%s. Nowych Słów jest %s.',
                 god_name_of(me), d1, d2,
                 case when me.low_logos_streak > 0 then format(', skromność dodaje %s', me.low_logos_streak) else '' end,
                 case when b_orth > 0 then format(', religie dodają %s', b_orth) else '' end,
                 total));

  if not exists (select 1 from players where game_id = p_game_id and not has_rolled) then
    update games set phase = 'gods' where id = p_game_id;
    perform recompute_turn(p_game_id);
  end if;
  return r;
end $$;

-- ---------- actions, with the avatar's free action kept honest ----------
-- The rulebook's limits on the free avatar action: a creature only once per Era, a Great Miracle
-- destroys the avatar, a resurrection through the avatar is its self-sacrifice, and every new avatar
-- needs 1 to 3 conditions. The -2 to a roll is applied by log_dice_roll(p_modifier).
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
  av entities;
  n_cond int;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id <> me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;

  cost := action_cost(p_action_key, g.era);
  if cost is null then raise exception 'Nieznana akcja: %', p_action_key; end if;

  if free_avatar then
    if me.avatar_action_used then raise exception 'Darmowa akcja awatara już wykorzystana w tej rundzie.'; end if;
    -- the avatar that acts: the one named in the payload, else my oldest living one
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
      if ent->>'kind' = 'avatar' then
        n_cond := coalesce(jsonb_array_length(ent->'conditions'), 0);
        if n_cond < 1 or n_cond > 3 then raise exception 'Awatar potrzebuje od 1 do 3 uwarunkowań.'; end if;
      end if;
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

  -- the price of the free action: a Great Miracle burns the avatar, a resurrection is its self-sacrifice
  if free_avatar and p_action_key in ('great_miracle', 'resurrect_avatar') and av.id is distinct from ent_id then
    update entities set status = 'dead' where id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', av.id,
            case p_action_key
              when 'great_miracle' then format('Awatar %s spala się w Wielkim Cudzie i ulega zniszczeniu.', av.name)
              else format('Awatar %s poświęca samego siebie, by tamten mógł powrócić.', av.name) end);
  end if;

  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- ---------- shared dice, with a modifier (the avatar's -2, extra Words) ----------
drop function if exists log_dice_roll(uuid, text);
create or replace function log_dice_roll(p_game_id uuid, p_context text default '', p_modifier int default 0)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d1 smallint := roll_d6();
  d2 smallint := roll_d6();
  total int;
  tier text;
  r actions_log;
begin
  select * into g from games where id = p_game_id;
  if g.status <> 'playing' then raise exception 'Gra nie trwa.'; end if;
  if abs(coalesce(p_modifier, 0)) > 5 then raise exception 'Modyfikator rzutu mieści się w zakresie od -5 do +5.'; end if;
  total := d1 + d2 + coalesce(p_modifier, 0);
  tier := case when total >= 10 then 'strong' when total >= 7 then 'mixed' else 'weak' end;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'dice',
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', coalesce(p_modifier, 0), 'total', total, 'tier', tier),
          coalesce(nullif(trim(p_context), ''), 'Rzut 2k6'))
  returning * into r;
  return r;
end $$;

-- ---------- rest, transfer, removal, round end: sentences for the book ----------
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
  values (p_game_id, g.round_number, g.era, me.id, 'rest',
          format('%s odpoczywa. Zachowuje swoje Słowa i milczy do końca rundy.', god_name_of(me)));
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
          format('%s oddaje %s bóstwu %s.', god_name_of(me), logos_words(p_amount), god_name_of(target)));
  perform recompute_turn(p_game_id);
end $$;

create or replace function delete_entity(p_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e entities;
  me players;
  g games;
begin
  select * into e from entities where id = p_entity_id;
  if e.id is null then raise exception 'Nie ma takiego bytu.'; end if;
  me := require_player(e.game_id);
  select * into g from games where id = e.game_id;
  if g.status = 'playing' then
    insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
    values (e.game_id, g.round_number, g.era, me.id, 'entity_removed',
            format('%s wymazuje ze świata %s. Nie zostaje żaden ślad.', god_name_of(me), e.name));
  end if;
  delete from entities where id = p_entity_id;
end $$;

create or replace function reveal_chaos(p_game_id uuid)
returns chaos_draws language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  prev chaos_draws;
  d chaos_draws;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;
  prev := current_chaos_draw(p_game_id, g.round_number);
  insert into chaos_draws (game_id, round_number, era, die1, die2, revealed_by, seq)
  values (p_game_id, g.round_number, g.era, roll_d6(), roll_d6(), me.id, coalesce(prev.seq, 0) + 1)
  returning * into d;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'chaos_reveal',
          jsonb_build_object('d1', d.die1, 'd2', d.die2, 'seq', d.seq),
          case when d.seq = 1
               then format('Bóstwa śpią, a świat toczy się sam. %s odwraca Kartę Chaosu, a kości mówią: %s i %s.', god_name_of(me), d.die1, d.die2)
               else format('%s odwraca kolejną Kartę Chaosu, a kości mówią: %s i %s.', god_name_of(me), d.die1, d.die2) end);
  return d;
end $$;

create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  notes text;
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

  update players set
    low_logos_streak = case when logos <= 5 then least(3, low_logos_streak + 1) else 0 end,
    has_rolled = false,
    is_resting = false,
    avatar_action_used = false
  where game_id = p_game_id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'round_end',
          format('I minęła runda %s. Bóstwa zapadają w sen, a świat toczy się dalej.', g.round_number));

  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null
  where id = p_game_id;
end $$;

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
            format('%s Era dobiega końca. Nadchodzi %s Era.',
                   case g.era when 1 then 'Pierwsza' else 'Druga' end,
                   case g.era + 1 when 2 then 'Druga' else 'Trzecia' end));
  end if;
end $$;

-- ---------- grants ----------
do $$
declare fn text;
begin
  foreach fn in array array[
    'logos_words(int)', 'god_name_of(players)', 'start_game(uuid, jsonb)', 'roll_logos(uuid)', 'perform_action(uuid, text, jsonb)',
    'log_dice_roll(uuid, text, int)', 'rest(uuid)', 'transfer_logos(uuid, uuid, int)', 'delete_entity(uuid)',
    'reveal_chaos(uuid)', 'end_chaos_phase(uuid)', 'vote_advance_era(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
