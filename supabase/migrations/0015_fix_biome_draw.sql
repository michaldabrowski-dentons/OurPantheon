-- 0015: a safety net for databases that got 0014 without 0013 (or out of order). The old
-- generate_map from 0012 still drew sawanna, bagno and wzgorza, which the 0014 constraint refuses
-- ("new row for relation hexes violates check constraint hexes_biome_check"). Both functions are
-- pinned here to the seven terrains: the world starts as an ocean, and a random land draw (used by
-- nothing now, kept for completeness) knows only tiles that exist.

create or replace function random_land_biome()
returns text language sql volatile as $$
  select case
    when x < 0.38 then 'trawa'
    when x < 0.60 then 'puszcza'
    when x < 0.74 then 'gory'
    when x < 0.86 then 'dzungla'
    when x < 0.95 then 'pustynia'
    else 'zima' end
  from (select random() as x) t;
$$;

create or replace function generate_map(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from hexes where game_id = p_game_id;
  for q in -5..5 loop
    for r in -5..5 loop
      if hex_in_map(q, r) then
        insert into hexes (game_id, q, r, biome, decor) values (p_game_id, q, r, 'woda', '[]'::jsonb);
      end if;
    end loop;
  end loop;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['random_land_biome()', 'generate_map(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
