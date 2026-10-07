-- 0014: seven terrains, each with a painted tile (public/biomes): woda, gory, puszcza, dzungla, trawa,
-- pustynia, zima. Tundra, bagno, sawanna and wzgorza are gone (fields holding them become trawa).
-- The tiles paint their own forests and peaks, so fields carry no emoji decorations any more.

update hexes set biome = 'trawa' where biome in ('tundra', 'bagno', 'sawanna', 'wzgorza');
update hexes set decor = '[]'::jsonb;

alter table hexes drop constraint if exists hexes_biome_check;
alter table hexes add constraint hexes_biome_check check (biome in ('woda', 'gory', 'puszcza', 'dzungla', 'trawa', 'pustynia', 'zima'));

create or replace function hex_decor(p_biome text)
returns jsonb language sql immutable as $$
  select '[]'::jsonb;
$$;

-- the same validation inside perform_action (0013) still lists eleven names; the constraint above is
-- what refuses the four that left, with this message
create or replace function biome_known(p_biome text)
returns boolean language sql immutable as $$
  select p_biome in ('woda', 'gory', 'puszcza', 'dzungla', 'trawa', 'pustynia', 'zima');
$$;

do $$
declare fn text;
begin
  foreach fn in array array['hex_decor(text)', 'biome_known(text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
