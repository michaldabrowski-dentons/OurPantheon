-- 0011: playbooks. Every god chooses one of twelve domains and gets six attributes
-- (Gniew/Łaska, Majestat/Podszept, Mądrość/Żywioł). Only three keys are stored; the client
-- computes the scores: the domain's two mains +1 (their opposites -1), the primary main goes to +2,
-- and one of the other four gets +1. No mechanical effect yet. Frescoes are gone: the god's portrait
-- is the domain's painting (avatar_key stays in the table, unused).

alter table players add column if not exists domain_key text;
alter table players add column if not exists attr_primary text;
alter table players add column if not exists attr_bonus text;
alter table players add column if not exists god_notes text not null default '';

alter table players drop constraint if exists players_domain_key_check;
alter table players add constraint players_domain_key_check check (domain_key is null or domain_key in
  ('war', 'vengeance', 'rule', 'love', 'order', 'light', 'secrets', 'nature', 'forge', 'knowledge', 'storm', 'harvest'));
alter table players drop constraint if exists players_attr_primary_check;
alter table players add constraint players_attr_primary_check check (attr_primary is null or attr_primary in
  ('wrath', 'majesty', 'grace', 'whisper', 'element', 'wisdom'));
alter table players drop constraint if exists players_attr_bonus_check;
alter table players add constraint players_attr_bonus_check check (attr_bonus is null or attr_bonus in
  ('wrath', 'majesty', 'grace', 'whisper', 'element', 'wisdom'));

-- the two main attributes of a domain (mirrors src/data/pantheon.ts)
create or replace function domain_mains(p_domain text)
returns text[] language sql immutable as $$
  select case p_domain
    when 'war'       then array['wrath', 'majesty']
    when 'vengeance' then array['wrath', 'whisper']
    when 'rule'      then array['grace', 'majesty']
    when 'love'      then array['grace', 'whisper']
    when 'order'     then array['majesty', 'wisdom']
    when 'light'     then array['majesty', 'element']
    when 'secrets'   then array['whisper', 'wisdom']
    when 'nature'    then array['whisper', 'element']
    when 'forge'     then array['wisdom', 'wrath']
    when 'knowledge' then array['wisdom', 'grace']
    when 'storm'     then array['element', 'wrath']
    when 'harvest'   then array['element', 'grace']
    else null
  end;
$$;

drop function if exists set_god(uuid, text, text, text, text);
create or replace function set_god(
  p_game_id uuid,
  p_god_name text,
  p_god_description text default '',
  p_god_gender text default 'm',
  p_domain_key text default null,
  p_attr_primary text default null,
  p_attr_bonus text default null,
  p_god_notes text default ''
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
  update players set
    god_name = coalesce(trim(p_god_name), ''),
    god_description = coalesce(trim(p_god_description), ''),
    god_gender = p_god_gender,
    domain_key = p_domain_key,
    attr_primary = p_attr_primary,
    attr_bonus = p_attr_bonus,
    god_notes = coalesce(trim(p_god_notes), '')
  where id = me.id;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['set_god(uuid, text, text, text, text, text, text, text)', 'domain_mains(text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
