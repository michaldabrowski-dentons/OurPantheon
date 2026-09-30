-- Our Pantheon VTT: a god's grammatical gender (the Chronicle is told in the past tense, which
-- in Polish needs it), and the system's own Chronicle lines told as a relation, in the past.
-- Functions replace their 0005 / 0006 versions; re-runnable.

-- ---------- schema ----------
-- m: bóg (stworzył), f: bogini (stworzyła), n: bóstwo (stworzyło)
alter table players add column if not exists god_gender text not null default 'n';
alter table players drop constraint if exists players_god_gender_check;
alter table players add constraint players_god_gender_check check (god_gender in ('m', 'f', 'n'));

-- ---------- god ----------
drop function if exists set_god(uuid, text, text, text);
create or replace function set_god(p_game_id uuid, p_god_name text, p_avatar_key text, p_god_description text default '', p_god_gender text default 'n')
returns void language plpgsql security definer set search_path = public as $$
declare me players := require_player(p_game_id);
begin
  if p_god_gender not in ('m', 'f', 'n') then raise exception 'Rodzaj bóstwa: m, f albo n.'; end if;
  update players set
    god_name = coalesce(trim(p_god_name), ''),
    avatar_key = coalesce(p_avatar_key, avatar_key),
    god_description = coalesce(trim(p_god_description), ''),
    god_gender = p_god_gender
  where id = me.id;
end $$;

-- ---------- transfer: the Chronicle keeps only who gave to whom; the verse is composed in the client ----------
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
  values (p_game_id, g.round_number, g.era, me.id, 'transfer', -p_amount, god_name_of(target));
  perform recompute_turn(p_game_id);
end $$;

-- ---------- removal: the summary is the name; the verse is composed in the client ----------
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
    values (e.game_id, g.round_number, g.era, me.id, 'entity_removed', e.name);
  end if;
  delete from entities where id = p_entity_id;
end $$;

-- ---------- free edits: notes told in the past ----------
create or replace function edit_entity(p_entity_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  e entities;
  me players;
  g games;
  new_kind entity_kind := coalesce((p_patch->>'kind')::entity_kind, null);
  new_status entity_status := coalesce((p_patch->>'status')::entity_status, null);
  note text := '';
begin
  select * into e from entities where id = p_entity_id;
  if e.id is null then raise exception 'Nie ma takiego bytu.'; end if;
  me := require_player(e.game_id);
  select * into g from games where id = e.game_id;

  if new_kind is not null and new_kind <> e.kind then
    if not (e.kind in ('faction', 'orthodoxy') and new_kind in ('faction', 'orthodoxy')) then
      raise exception 'Można zamieniać tylko frakcję w religię i odwrotnie.';
    end if;
  end if;
  if new_status is not null and new_status <> e.status and e.kind <> 'avatar' then
    raise exception 'Śmierć oznacza się tylko awatarom. Inne byty usuń albo przekształć akcją.';
  end if;

  if p_patch ? 'parent_civilization_id' and nullif(p_patch->>'parent_civilization_id', '') is not null
     and not exists (select 1 from entities where id = (p_patch->>'parent_civilization_id')::uuid and game_id = e.game_id and kind = 'civilization') then
    raise exception 'Cywilizacja nadrzędna nie należy do tej gry.';
  end if;

  update entities set
    name = coalesce(nullif(trim(p_patch->>'name'), ''), name),
    description = coalesce(p_patch->>'description', description),
    notes = coalesce(p_patch->>'notes', notes),
    image_key = coalesce(p_patch->>'image_key', image_key),
    faction_type = coalesce(p_patch->>'faction_type', faction_type),
    parent_civilization_id = case when p_patch ? 'parent_civilization_id' then nullif(p_patch->>'parent_civilization_id', '')::uuid else parent_civilization_id end,
    kind = coalesce(new_kind, kind),
    status = coalesce(new_status, status),
    traits = case when p_patch ? 'traits' then array(select jsonb_array_elements_text(p_patch->'traits')) else traits end,
    specialties = case when p_patch ? 'specialties' then array(select jsonb_array_elements_text(p_patch->'specialties')) else specialties end,
    flaws = case when p_patch ? 'flaws' then array(select jsonb_array_elements_text(p_patch->'flaws')) else flaws end,
    desires = case when p_patch ? 'desires' then array(select jsonb_array_elements_text(p_patch->'desires')) else desires end,
    requirements = case when p_patch ? 'requirements' then array(select jsonb_array_elements_text(p_patch->'requirements')) else requirements end,
    conditions = case when p_patch ? 'conditions' then array(select jsonb_array_elements_text(p_patch->'conditions')) else conditions end
  where id = p_entity_id;

  if new_kind = 'faction' and e.kind = 'orthodoxy' then
    delete from entity_gods where entity_id = p_entity_id;
    note := format('I stała się religia %s neutralną frakcją, która nie czciła już żadnego bóstwa.', e.name);
  elsif new_kind = 'orthodoxy' and e.kind = 'faction' then
    insert into entity_gods (entity_id, player_id, game_id, role) values (p_entity_id, me.id, e.game_id, 'creator')
    on conflict do nothing;
    note := format('I stała się frakcja %s religią, i czciła odtąd bóstwo %s.', e.name, god_name_of(me));
  elsif new_status is not null and new_status <> e.status then
    note := case new_status
      when 'dead' then format('I zginął awatar %s.', e.name)
      when 'active' then format('I powrócił awatar %s do życia.', e.name)
      else format('I nie było już %s.', e.name) end;
  end if;

  if note <> '' and g.status = 'playing' then
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (e.game_id, g.round_number, g.era, me.id, 'entity_edit', p_entity_id, note);
  end if;
end $$;

-- ---------- actions: the avatar's fate told in the past ----------
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
      if p_action_key in ('resurrect_avatar', 'create_orthodoxy') or (ent->>'kind') = 'orthodoxy' then
        insert into entity_gods (entity_id, player_id, game_id, role) values (ent_id, me.id, p_game_id, 'co_creator')
        on conflict do nothing;
      end if;
      if ent->>'kind' = 'faction' then delete from entity_gods where entity_id = ent_id; end if;
    end if;
  end if;

  update players set logos = logos - cost where id = me.id;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, is_avatar_free_action, summary)
  values (p_game_id, g.round_number, g.era, me.id, p_action_key, -cost, ent_id, free_avatar, coalesce(p_payload->>'summary', ''))
  returning * into log_row;

  if free_avatar and p_action_key in ('great_miracle', 'resurrect_avatar') and av.id is distinct from ent_id then
    update entities set status = 'dead' where id = av.id;
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'entity_edit', av.id,
            case p_action_key
              when 'great_miracle' then format('I spłonął awatar %s w Wielkim Cudzie, i nie było go więcej.', av.name)
              else format('I poświęcił się awatar %s, by tamten mógł powrócić.', av.name) end);
  end if;

  perform recompute_turn(p_game_id);
  return log_row;
end $$;

-- ---------- grants ----------
do $$
declare fn text;
begin
  foreach fn in array array[
    'set_god(uuid, text, text, text, text)', 'transfer_logos(uuid, uuid, int)', 'delete_entity(uuid)',
    'edit_entity(uuid, jsonb)', 'perform_action(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
