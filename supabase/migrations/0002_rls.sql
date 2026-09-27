-- Row level security: members of a game can read it; all writes go through RPCs,
-- except the palette (direct, own rows) and profile display names.

create or replace function is_game_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.game_id = g and p.user_id = auth.uid());
$$;

create or replace function my_player_id(g uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from players p where p.game_id = g and p.user_id = auth.uid() limit 1;
$$;

alter table profiles enable row level security;
alter table games enable row level security;
alter table players enable row level security;
alter table palette_entries enable row level security;
alter table logos_rolls enable row level security;
alter table entities enable row level security;
alter table entity_gods enable row level security;
alter table entity_links enable row level security;
alter table actions_log enable row level security;
alter table chaos_draws enable row level security;
alter table era_votes enable row level security;

-- profiles
create policy "profiles readable by signed-in users" on profiles
  for select to authenticated using (true);
create policy "profiles editable by owner" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- games
create policy "games readable by members" on games
  for select to authenticated using (is_game_member(id));

-- per-game tables: select for members
create policy "players readable" on players for select to authenticated using (is_game_member(game_id));
create policy "palette readable" on palette_entries for select to authenticated using (is_game_member(game_id));
create policy "logos_rolls readable" on logos_rolls for select to authenticated using (is_game_member(game_id));
create policy "entities readable" on entities for select to authenticated using (is_game_member(game_id));
create policy "entity_gods readable" on entity_gods for select to authenticated using (is_game_member(game_id));
create policy "entity_links readable" on entity_links for select to authenticated using (is_game_member(game_id));
create policy "actions_log readable" on actions_log for select to authenticated using (is_game_member(game_id));
create policy "chaos_draws readable" on chaos_draws for select to authenticated using (is_game_member(game_id));
create policy "era_votes readable" on era_votes for select to authenticated using (is_game_member(game_id));

-- palette: members write their own entries directly
create policy "palette insert own" on palette_entries
  for insert to authenticated
  with check (is_game_member(game_id) and player_id = my_player_id(game_id));
create policy "palette update own" on palette_entries
  for update to authenticated
  using (player_id = my_player_id(game_id))
  with check (player_id = my_player_id(game_id));
create policy "palette delete own" on palette_entries
  for delete to authenticated
  using (player_id = my_player_id(game_id));
