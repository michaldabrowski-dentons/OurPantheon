-- 0009: World Creation is led by the host. The host turns the pages; everyone sees the same question
-- and votes. The current page lives in games.settings->'creation_step' so Realtime carries it.
-- Also: a god is a "bóg" (masculine) unless told otherwise.

alter table players alter column god_gender set default 'm';

create or replace function open_creation(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz może otworzyć Stwarzanie Świata.' using errcode = '42501'; end if;
  if g.status not in ('lobby', 'palette') then raise exception 'Stwarzanie Świata jest już otwarte lub gra trwa.'; end if;
  update games set status = 'creation', settings = settings || '{"creation_step": 0}'::jsonb where id = p_game_id;
end $$;

-- The host turns to question p_step (0-based; a step past the last question is the Prologue).
create or replace function set_creation_step(p_game_id uuid, p_step int)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  perform require_player(p_game_id);
  select * into g from games where id = p_game_id for update;
  if g.host_id <> auth.uid() then raise exception 'Tylko gospodarz przewraca karty Stwarzania Świata.' using errcode = '42501'; end if;
  if g.status <> 'creation' then raise exception 'Stwarzanie Świata nie trwa.'; end if;
  if p_step is null or p_step < 0 or p_step > 99 then raise exception 'Nie ma takiego pytania.'; end if;
  update games set settings = settings || jsonb_build_object('creation_step', p_step) where id = p_game_id;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['open_creation(uuid)', 'set_creation_step(uuid, int)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
