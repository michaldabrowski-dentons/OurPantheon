-- 0016: a god chooses its own colour (one of three shades of its domain; the client holds the
-- palette, the row keeps the hex string), and the map knows eleven painted terrains:
-- woda, gory, gory_pustynne, gory_sniezne, puszcza, dzungla, trawa, pustynia, zima, bagno, ziemia.
-- The three mountain kinds and water block cities, people, creatures and avatars.

alter table players add column if not exists god_color text;
alter table players drop constraint if exists players_god_color_check;
alter table players add constraint players_god_color_check check (god_color is null or god_color ~ '^#[0-9a-fA-F]{6}$');

drop function if exists set_god(uuid, text, text, text, text, text, text, text);
create or replace function set_god(
  p_game_id uuid,
  p_god_name text,
  p_god_description text default '',
  p_god_gender text default 'm',
  p_domain_key text default null,
  p_attr_primary text default null,
  p_attr_bonus text default null,
  p_god_notes text default '',
  p_god_color text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  mains text[];
begin
  if p_god_gender not in ('m', 'f', 'n') then raise exception 'Rodzaj bóstwa: m, f albo n.'; end if;
  if p_domain_key is not null then
    mains := domain_mains(p_domain_key);
    if mains is null then raise exception 'Nie ma takiej domeny.'; end if;
    if p_attr_primary is not null and not (p_attr_primary = any(mains)) then
      raise exception 'Pierwszorzędny atrybut musi być jednym z dwóch głównych tej domeny.';
    end if;
    if p_attr_bonus is not null and (p_attr_bonus = any(mains)) then
      raise exception 'Dodatkowy +1 idzie do jednego z czterech pozostałych atrybutów.';
    end if;
    if p_attr_bonus is not null and p_attr_bonus not in ('wrath', 'majesty', 'grace', 'whisper', 'element', 'wisdom') then
      raise exception 'Nie ma takiego atrybutu.';
    end if;
  elsif p_attr_primary is not null or p_attr_bonus is not null then
    raise exception 'Najpierw wybierz domenę.';
  end if;
  if p_god_color is not null and p_god_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Kolor to sześć znaków szesnastkowych po #.'; end if;
  update players set
    god_name = coalesce(trim(p_god_name), ''),
    god_description = coalesce(trim(p_god_description), ''),
    god_gender = p_god_gender,
    domain_key = p_domain_key,
    attr_primary = p_attr_primary,
    attr_bonus = p_attr_bonus,
    god_notes = coalesce(trim(p_god_notes), ''),
    god_color = p_god_color
  where id = me.id;
end $$;

-- ---------- eleven terrains ----------
alter table hexes drop constraint if exists hexes_biome_check;
alter table hexes add constraint hexes_biome_check check (biome in
  ('woda', 'gory', 'gory_pustynne', 'gory_sniezne', 'puszcza', 'dzungla', 'trawa', 'pustynia', 'zima', 'bagno', 'ziemia'));

create or replace function hex_blocked(p_biome text)
returns boolean language sql immutable as $$
  select p_biome in ('woda', 'gory', 'gory_pustynne', 'gory_sniezne');
$$;

create or replace function biome_known(p_biome text)
returns boolean language sql immutable as $$
  select p_biome in ('woda', 'gory', 'gory_pustynne', 'gory_sniezne', 'puszcza', 'dzungla', 'trawa', 'pustynia', 'zima', 'bagno', 'ziemia');
$$;

do $$
declare fn text;
begin
  foreach fn in array array['set_god(uuid, text, text, text, text, text, text, text, text)', 'hex_blocked(text)', 'biome_known(text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
