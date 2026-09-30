-- Our Pantheon VTT: World Creation vote, god descriptions, richer entity editing,
-- chaos answers in the Chronicle, sapient-creature action, era vote without the round limit.
-- Functions below replace their 0003 versions (create or replace); schema changes are additive.

-- ---------- schema ----------
alter type game_status add value if not exists 'creation';

alter table players add column if not exists god_description text not null default '';

-- World Creation: players vote on how the world begins. Preset options live in the client
-- (src/data/worldQuestions.ts); custom options written by players live here.
create table if not exists creation_options (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  question_key text not null,
  label text not null,
  created_by uuid references players (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists creation_options_game_idx on creation_options (game_id);

create table if not exists creation_votes (
  game_id uuid not null references games (id) on delete cascade,
  question_key text not null,
  player_id uuid not null references players (id) on delete cascade,
  option_key text not null,
  created_at timestamptz not null default now(),
  primary key (game_id, question_key, player_id)
);

alter table creation_options enable row level security;
alter table creation_votes enable row level security;
drop policy if exists "creation_options readable" on creation_options;
drop policy if exists "creation_votes readable" on creation_votes;
create policy "creation_options readable" on creation_options for select to authenticated using (is_game_member(game_id));
create policy "creation_votes readable" on creation_votes for select to authenticated using (is_game_member(game_id));

alter table creation_options replica identity full;
alter table creation_votes replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'creation_options') then
    alter publication supabase_realtime add table creation_options;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'creation_votes') then
    alter publication supabase_realtime add table creation_votes;
  end if;
end $$;

-- Several Chaos cards per round: a redraw when the first made no sense, or one more when the
-- table wants more. `seq` counts them; the highest one is the live card.
alter table chaos_draws add column if not exists seq smallint not null default 1;
alter table chaos_draws drop constraint if exists chaos_draws_game_id_round_number_key;
create unique index if not exists chaos_draws_round_seq_idx on chaos_draws (game_id, round_number, seq);

-- ---------- costs ----------
create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'          then (array[2, 5, 12])[p_era]
    when 'change_biome'        then (array[1, 3, 6])[p_era]
    when 'catastrophe'         then 10
    when 'create_creature'     then (array[10, 3, 12])[p_era]
    when 'create_sapient'      then (array[15, 4, 18])[p_era]
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

-- ---------- god ----------
drop function if exists set_god(uuid, text, text);
create or replace function set_god(p_game_id uuid, p_god_name text, p_avatar_key text, p_god_description text default '')
returns void language plpgsql security definer set search_path = public as $$
declare me players := require_player(p_game_id);
begin
  update players set
    god_name = coalesce(trim(p_god_name), ''),
    avatar_key = coalesce(p_avatar_key, avatar_key),
    god_description = coalesce(trim(p_god_description), '')
  where id = me.id;
end $$;

-- ---------- world creation ----------
create or replace function open_creation(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może otworzyć Stwarzanie Świata.' using errcode = '42501'; end if;
  if g.status not in ('lobby', 'palette') then raise exception 'Stwarzanie Świata jest już otwarte lub gra trwa.'; end if;
  update games set status = 'creation' where id = p_game_id;
end $$;

create or replace function add_creation_option(p_game_id uuid, p_question_key text, p_label text)
returns creation_options language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  o creation_options;
begin
  select * into g from games where id = p_game_id;
  if g.status <> 'creation' then raise exception 'Stwarzanie Świata nie trwa.'; end if;
  if length(trim(p_label)) = 0 then raise exception 'Odpowiedź nie może być pusta.'; end if;
  insert into creation_options (game_id, question_key, label, created_by)
  values (p_game_id, p_question_key, left(trim(p_label), 140), me.id)
  returning * into o;
  -- the author votes for their own answer right away
  insert into creation_votes (game_id, question_key, player_id, option_key)
  values (p_game_id, p_question_key, me.id, o.id::text)
  on conflict (game_id, question_key, player_id) do update set option_key = excluded.option_key, created_at = now();
  return o;
end $$;

-- One vote per god per question. Voting again for the same option withdraws it.
create or replace function vote_creation(p_game_id uuid, p_question_key text, p_option_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  current text;
begin
  select * into g from games where id = p_game_id;
  if g.status <> 'creation' then raise exception 'Stwarzanie Świata nie trwa.'; end if;
  select option_key into current from creation_votes
  where game_id = p_game_id and question_key = p_question_key and player_id = me.id;
  if current = p_option_key then
    delete from creation_votes where game_id = p_game_id and question_key = p_question_key and player_id = me.id;
  else
    insert into creation_votes (game_id, question_key, player_id, option_key)
    values (p_game_id, p_question_key, me.id, p_option_key)
    on conflict (game_id, question_key, player_id) do update set option_key = excluded.option_key, created_at = now();
  end if;
end $$;

-- The host starts the First Era. p_prologue: [{text}], the settled World Creation told as a story,
-- one sentence per line, written into the Chronicle as round 0.
drop function if exists start_game(uuid);
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
  update players set logos = 5, has_rolled = false, is_resting = false,
                     low_logos_streak = 0, avatar_action_used = false
   where game_id = p_game_id;
  for line in select * from jsonb_array_elements(coalesce(p_prologue, '[]'::jsonb)) loop
    if length(trim(coalesce(line->>'text', ''))) > 0 then
      insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
      values (p_game_id, 0, 1, null, 'prologue', trim(line->>'text'));
    end if;
  end loop;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, 1, 1, null, 'game_start', 'Pierwsza Era się rozpoczyna.');
end $$;

-- The host removes a whole world. Everything cascades.
create or replace function delete_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  select * into g from games where id = p_game_id;
  if g.id is null then raise exception 'Nie ma takiego świata.'; end if;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może usunąć świat.' using errcode = '42501'; end if;
  delete from games where id = p_game_id;
end $$;

-- ---------- entities ----------
-- Free-form edit (no Logos): flavour fields, plus the table-agreed switches:
-- faction <-> religion (kind), sapient (traits), an avatar's death (status).
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
    note := format('%s przestaje być religią i staje się neutralną frakcją.', e.name);
  elsif new_kind = 'orthodoxy' and e.kind = 'faction' then
    insert into entity_gods (entity_id, player_id, game_id, role) values (p_entity_id, me.id, e.game_id, 'creator')
    on conflict do nothing;
    note := format('%s staje się religią czczącą bóstwo %s.', e.name, coalesce(nullif(me.god_name, ''), 'bez imienia'));
  elsif new_status is not null and new_status <> e.status then
    note := case new_status
      when 'dead' then format('Awatar %s ginie.', e.name)
      when 'active' then format('Awatar %s znów żyje.', e.name)
      else format('%s zostaje zniszczony.', e.name) end;
  end if;

  if note <> '' and g.status = 'playing' then
    insert into actions_log (game_id, round_number, era, player_id, action_key, entity_id, summary)
    values (e.game_id, g.round_number, g.era, me.id, 'entity_edit', p_entity_id, note);
  end if;
end $$;

-- Removes a creature, civilization, faction, religion or avatar for good. Only after the table agrees.
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
            format('%s usuwa ze świata: %s.', coalesce(nullif(me.god_name, ''), 'Bóstwo'), e.name));
  end if;
  delete from entities where id = p_entity_id;
end $$;

-- ---------- logos roll (religions, not orthodoxies, in the summary) ----------
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
                 case when b_orth > 0 then format(' + %s (religie)', b_orth) else '' end,
                 total));

  if not exists (select 1 from players where game_id = p_game_id and not has_rolled) then
    update games set phase = 'gods' where id = p_game_id;
    perform recompute_turn(p_game_id);
  end if;
  return r;
end $$;

-- ---------- chaos: the chosen entry and every answer land in the Chronicle ----------
-- The live card of a round is the one with the highest seq.
create or replace function current_chaos_draw(p_game_id uuid, p_round int)
returns chaos_draws language sql stable security definer set search_path = public as $$
  select * from chaos_draws where game_id = p_game_id and round_number = p_round order by seq desc limit 1;
$$;

-- Turns a card. A second call in the same round deals the next card (a redraw, or one more event).
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
          case when d.seq = 1 then format('Karta Chaosu odwrócona: kości %s i %s.', d.die1, d.die2)
               else format('Kolejna Karta Chaosu: kości %s i %s.', d.die1, d.die2) end);
  return d;
end $$;

create or replace function set_chaos_notes(p_game_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g games;
  d chaos_draws;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id;
  d := current_chaos_draw(p_game_id, g.round_number);
  if d.id is null then raise exception 'Najpierw odwróć Kartę Chaosu.'; end if;
  update chaos_draws set resolution_notes = coalesce(p_notes, '') where id = d.id;
end $$;

drop function if exists choose_chaos_die(uuid, smallint);
create or replace function choose_chaos_die(p_game_id uuid, p_category_die smallint, p_title text default '', p_text text default '')
returns chaos_draws language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  d chaos_draws;
  cat smallint;
  entry smallint;
  cat_key text;
  cat_name text;
begin
  select * into g from games where id = p_game_id;
  d := current_chaos_draw(p_game_id, g.round_number);
  if d.id is null then raise exception 'Najpierw odwróć Kartę Chaosu.'; end if;
  select * into d from chaos_draws where id = d.id for update;
  if d.revealed_by <> me.id then raise exception 'Tylko bóstwo, które odwróciło kartę, wybiera kość.' using errcode = '42501'; end if;
  if d.category_key is not null then raise exception 'Kość już wybrana.'; end if;
  if p_category_die not in (1, 2) then raise exception 'Wybierz kość 1 lub 2.'; end if;
  cat := case when p_category_die = 1 then d.die1 else d.die2 end;
  entry := case when p_category_die = 1 then d.die2 else d.die1 end;
  cat_key := (array['region', 'event', 'people', 'magic', 'culture', 'disaster'])[cat];
  cat_name := (array['Region', 'Wydarzenie', 'Ludzie', 'Magia / Nieznane', 'Kultura', 'Katastrofa'])[cat];
  update chaos_draws set category_die = p_category_die, category_key = cat_key, entry_index = entry
  where id = d.id returning * into d;
  insert into actions_log (game_id, round_number, era, player_id, action_key, roll, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'chaos_choice',
          jsonb_build_object('category', cat_key, 'entry', entry),
          case when length(trim(coalesce(p_title, ''))) > 0
               then format('%s: %s. %s', cat_name, p_title, coalesce(p_text, ''))
               else format('Chaos: kategoria %s, wpis %s.', cat, entry) end);
  return d;
end $$;

-- A god answers one of the Chaos questions; the answer is a Chronicle line.
create or replace function answer_chaos_question(p_game_id uuid, p_question text, p_answer text)
returns actions_log language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  r actions_log;
begin
  select * into g from games where id = p_game_id;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;
  if length(trim(coalesce(p_answer, ''))) = 0 then raise exception 'Odpowiedź nie może być pusta.'; end if;
  insert into actions_log (game_id, round_number, era, player_id, action_key, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'chaos_answer',
          format('%s %s', coalesce(p_question, ''), trim(p_answer)))
  returning * into r;
  return r;
end $$;

-- Round bookkeeping; shared Chaos notes are copied into the Chronicle before the round closes.
create or replace function end_chaos_phase(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  notes text;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'chaos' then raise exception 'Faza Chaosu nie trwa.'; end if;

  -- every card of the round that got a description leaves a line
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
  values (p_game_id, g.round_number, g.era, me.id, 'round_end', format('Runda %s dobiega końca.', g.round_number));

  update games set round_number = round_number + 1, phase = 'rolling', current_turn_player_id = null
  where id = p_game_id;
end $$;

-- ---------- era vote: always open, majority decides ----------
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
            format('Nadchodzi %s Era.', case g.era + 1 when 2 then 'Druga' else 'Trzecia' end));
  end if;
end $$;

-- ---------- grants ----------
do $$
declare fn text;
begin
  foreach fn in array array[
    'set_god(uuid, text, text, text)', 'open_creation(uuid)', 'add_creation_option(uuid, text, text)',
    'vote_creation(uuid, text, text)', 'start_game(uuid, jsonb)', 'delete_game(uuid)', 'edit_entity(uuid, jsonb)', 'delete_entity(uuid)',
    'roll_logos(uuid)', 'current_chaos_draw(uuid, int)', 'reveal_chaos(uuid)', 'set_chaos_notes(uuid, text)',
    'choose_chaos_die(uuid, smallint, text, text)', 'answer_chaos_question(uuid, text, text)',
    'end_chaos_phase(uuid)', 'vote_advance_era(uuid)', 'action_cost(text, smallint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
