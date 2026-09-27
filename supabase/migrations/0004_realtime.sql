-- Realtime: every per-game table is published; full replica identity so DELETE events
-- carry the game_id the client filters on.

alter table games          replica identity full;
alter table players        replica identity full;
alter table palette_entries replica identity full;
alter table logos_rolls    replica identity full;
alter table entities       replica identity full;
alter table entity_gods    replica identity full;
alter table entity_links   replica identity full;
alter table actions_log    replica identity full;
alter table chaos_draws    replica identity full;
alter table era_votes      replica identity full;

alter publication supabase_realtime add table
  games, players, palette_entries, logos_rolls, entities, entity_gods, entity_links,
  actions_log, chaos_draws, era_votes;
