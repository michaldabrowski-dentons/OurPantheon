-- 0010: a safety net for the turn. Tables reported a round in which everyone had rolled, the phase
-- was 'gods', yet nobody held the turn. Any member may ask the server to settle it: if the Gods
-- phase has no holder (or the holder sleeps or has no Words), the turn is recomputed; if the
-- rolling phase is over but the phase never flipped, it flips now.

create or replace function ensure_turn(p_game_id uuid)
returns games language plpgsql security definer set search_path = public as $$
declare
  g games;
  holder players;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' then return g; end if;

  if g.phase = 'rolling' and not exists (select 1 from players where game_id = p_game_id and not has_rolled) then
    update games set phase = 'gods' where id = p_game_id;
    perform recompute_turn(p_game_id);
  elsif g.phase = 'gods' then
    if g.current_turn_player_id is not null then
      select * into holder from players where id = g.current_turn_player_id;
    end if;
    if holder.id is null or holder.is_resting or holder.logos <= 0 then
      perform recompute_turn(p_game_id);
    end if;
  end if;

  select * into g from games where id = p_game_id;
  return g;
end $$;

revoke all on function public.ensure_turn(uuid) from public, anon;
grant execute on function public.ensure_turn(uuid) to authenticated;
