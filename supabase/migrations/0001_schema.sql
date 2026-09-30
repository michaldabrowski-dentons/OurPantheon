-- Our Pantheon VTT: core schema
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type game_status as enum ('lobby', 'palette', 'playing', 'finished');
create type game_phase  as enum ('rolling', 'gods', 'chaos');
create type palette_column as enum ('yes', 'veil', 'no');
create type entity_kind as enum ('creature', 'civilization', 'faction', 'orthodoxy', 'avatar');
create type entity_status as enum ('active', 'dead', 'destroyed');
create type god_role as enum ('creator', 'co_creator');
create type link_relation as enum ('member_species', 'variant_of', 'linked');

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------- games ----------
create table games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  host_id uuid not null references profiles (id),
  status game_status not null default 'lobby',
  era smallint not null default 1 check (era between 1 and 3),
  round_number int not null default 0,
  era_started_round int not null default 1,
  phase game_phase not null default 'rolling',
  current_turn_player_id uuid,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- players (a god at the table) ----------
create table players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  god_name text not null default '',
  avatar_key text not null default 'fresco-01',
  seat_order smallint not null default 1,
  logos int not null default 5 check (logos >= 0),
  has_rolled boolean not null default false,
  is_resting boolean not null default false,
  low_logos_streak smallint not null default 0 check (low_logos_streak between 0 and 3),
  avatar_action_used boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);
create index players_game_idx on players (game_id);

alter table games
  add constraint games_current_turn_fk
  foreign key (current_turn_player_id) references players (id) on delete set null;

-- ---------- palette ----------
create table palette_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  "column" palette_column not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index palette_game_idx on palette_entries (game_id);

-- ---------- logos rolls ----------
create table logos_rolls (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  round_number int not null,
  player_id uuid not null references players (id) on delete cascade,
  die1 smallint not null,
  die2 smallint not null,
  bonus_streak smallint not null default 0,
  bonus_orthodoxy smallint not null default 0,
  total int not null,
  created_at timestamptz not null default now()
);
create index logos_rolls_game_idx on logos_rolls (game_id);

-- ---------- entities (creatures, civilizations, factions, orthodoxies, avatars) ----------
create table entities (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  kind entity_kind not null,
  name text not null,
  description text not null default '',
  image_key text,
  notes text not null default '',
  parent_civilization_id uuid references entities (id) on delete set null,
  faction_type text,
  traits text[] not null default '{}',
  specialties text[] not null default '{}',
  flaws text[] not null default '{}',
  desires text[] not null default '{}',
  requirements text[] not null default '{}',
  conditions text[] not null default '{}',
  status entity_status not null default 'active',
  is_chaos boolean not null default false,
  created_round int not null default 0,
  created_era smallint not null default 1,
  created_by_player_id uuid references players (id) on delete set null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entities_game_idx on entities (game_id);
create index entities_parent_idx on entities (parent_civilization_id);

-- gods pinned to an entity (avatars, orthodoxies, also creators of anything)
create table entity_gods (
  entity_id uuid not null references entities (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  role god_role not null default 'creator',
  primary key (entity_id, player_id)
);
create index entity_gods_game_idx on entity_gods (game_id);

-- entity <-> entity relations (civilization <-> species, creature variants)
create table entity_links (
  from_entity_id uuid not null references entities (id) on delete cascade,
  to_entity_id uuid not null references entities (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  relation link_relation not null default 'linked',
  primary key (from_entity_id, to_entity_id, relation)
);
create index entity_links_game_idx on entity_links (game_id);

-- ---------- chronicle ----------
create table actions_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  round_number int not null,
  era smallint not null,
  player_id uuid references players (id) on delete set null,
  action_key text not null,
  logos_delta int not null default 0,
  roll jsonb,
  entity_id uuid references entities (id) on delete set null,
  is_avatar_free_action boolean not null default false,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index actions_log_game_idx on actions_log (game_id, created_at);

-- ---------- chaos ----------
create table chaos_draws (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  round_number int not null,
  era smallint not null,
  die1 smallint not null,
  die2 smallint not null,
  category_die smallint check (category_die in (1, 2)),
  category_key text,
  entry_index smallint check (entry_index between 1 and 6),
  revealed_by uuid references players (id) on delete set null,
  resolution_notes text not null default '',
  revealed_at timestamptz not null default now(),
  unique (game_id, round_number)
);

-- ---------- era votes ----------
create table era_votes (
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  target_era smallint not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- ---------- updated_at ----------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger games_touch before update on games for each row execute function touch_updated_at();
create trigger entities_touch before update on entities for each row execute function touch_updated_at();
