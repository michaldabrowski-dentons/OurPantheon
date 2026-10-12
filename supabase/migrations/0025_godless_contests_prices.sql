-- 0025: the godless may be converted and warred upon: a contest without a defending god resolves at
-- once, the book rolling for the godless (conversion: 2d6 + nothing; war: 2d6 + the godless of the city).
-- Susza and Potop are two Logos cheaper in every Era.
-- Replaced: action_cost, declare_contest, answer_contest, commit_contest. New: contest_resolve,
-- contest_defender_dots, contest_defender_lose.

alter table contests alter column defender_id drop not null;

create or replace function action_cost(p_key text, p_era smallint)
returns int language sql immutable as $$
  select case p_key
    when 'shape_land'           then (array[2, 5, 12])[p_era]
    when 'catastrophe'          then 10
    when 'lightning'            then (array[1, 2, 3])[p_era]
    when 'flood'                then (array[4, 10, 16])[p_era]
    when 'fire_rain'            then (array[6, 12, 18])[p_era]
    when 'drought'              then (array[1, 4, 7])[p_era]
    when 'plague'               then (array[9, 5, 8])[p_era]
    when 'great_miracle'        then (array[15, 30, 50])[p_era]
    when 'bless_land'           then (array[4, 7, 10])[p_era]
    when 'pour_river'           then (array[3, 8, 12])[p_era]
    when 'create_creature'      then (array[10, 3, 12])[p_era]
    when 'create_beast'         then (array[10, 3, 12])[p_era]
    when 'create_herd'          then (array[10, 3, 12])[p_era]
    when 'create_sapient'       then (array[15, 4, 18])[p_era]
    when 'change_creature'      then (array[5, 1, 6])[p_era]
    when 'migrate'              then (array[3, 1, 3])[p_era]
    when 'multiply'             then (array[5, 2, 6])[p_era]
    when 'create_civilization'  then (array[22, 12, 6])[p_era]
    when 'develop_civilization' then (array[12, 8, 4])[p_era]
    when 'exodus'               then (array[12, 8, 4])[p_era]
    when 'convert'              then (array[6, 4, 3])[p_era]
    when 'holy_war'             then (array[8, 6, 4])[p_era]
    when 'create_avatar'        then (array[10, 12, 15])[p_era]
    when 'pilgrimage'           then 0
    when 'resurrect_avatar'     then (array[12, 15, 16])[p_era]
    when 'avatar_duel'          then (array[5, 4, 3])[p_era]
    when 'prophecy'             then (array[10, 5, 3])[p_era]
    else null
  end;
$$;

-- ---------- the defending side: a god's followers, or the godless of the city ----------
create or replace function contest_defender_dots(c contests)
returns int language sql stable as $$
  select case
    when c.target_city_id is null then 0
    when c.defender_id is null then coalesce((select atheists from cities where entity_id = c.target_city_id), 0)
    else player_dots(c.target_city_id, c.defender_id)
  end;
$$;

-- the defending side loses n people: a god's followers go to its afterlife, the godless simply die
create or replace function contest_defender_lose(c contests, n int)
returns int language plpgsql as $$
declare
  k int;
begin
  if n <= 0 or c.target_city_id is null then return 0; end if;
  if c.defender_id is null then return city_remove_atheists(c.target_city_id, n); end if;
  k := city_remove_dots(c.target_city_id, c.defender_id, n);
  if k > 0 then perform collect_souls(c.target_city_id, c.defender_id, k); end if;
  return k;
end $$;

-- ---------- the dice have fallen on both sides: the difference decides ----------
create or replace function contest_resolve(p_contest_id uuid, p_attr text, p_pmod int, p_def_score int)
returns contests language plpgsql as $$
declare
  c contests;
  g games;
  target entities;
  d1 int := roll_d6();
  d2 int := roll_d6();
  mod int;
  def_dots int;
  diff int;
  removed int := 0;
  converted int := 0;
  returned int := 0;
  att_lost int := 0;
  def_lost int := 0;
  k int;
  a int := 0;
  target_gone boolean := false;
  source_gone boolean := false;
  oc jsonb;
  log_row actions_log;
  att_av entities; def_av entities;
  a_loss int := 0; d_loss int := 0;
  tcity cities; def_av_hp int := 0;
  av_to jsonb := null; av_wound int := 0;
begin
  select * into c from contests where id = p_contest_id for update;
  select * into g from games where id = c.game_id for update;
  select * into target from entities where id = c.target_city_id;

  def_dots := contest_defender_dots(c);
  if c.kind = 'holy_war' then
    select * into tcity from cities where entity_id = c.target_city_id;
    if c.defender_id is not null then
      select e.* into def_av from hex_occupants o join entities e on e.id = o.entity_id join entity_gods eg on eg.entity_id = e.id
      where o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'avatar' and e.status = 'active' and eg.player_id = c.defender_id
      order by (eg.role = 'creator') desc limit 1;
      if def_av.id is not null then def_av_hp := coalesce(def_av.hp, 0); update contests set defender_avatar_id = def_av.id where id = c.id; end if;
    end if;
  end if;
  mod := p_def_score + p_pmod + (case when c.kind = 'holy_war' then def_dots + def_av_hp else 0 end);
  diff := c.attacker_total - (d1 + d2 + mod);

  if c.kind = 'avatar_duel' then
    select * into att_av from entities where id = c.attacker_avatar_id;
    select * into def_av from entities where id = c.defender_avatar_id;
    if diff >= 3 then d_loss := 2;
    elsif diff >= 1 then d_loss := 1; a_loss := 1;
    elsif diff = 0 then d_loss := 1; a_loss := 1;
    elsif diff >= -2 then a_loss := 1;
    else a_loss := 2;
    end if;
    perform wound_avatar(att_av.id, a_loss, c.attacker_id, g.round_number, g.era);
    perform wound_avatar(def_av.id, d_loss, c.attacker_id, g.round_number, g.era);
    select * into att_av from entities where id = c.attacker_avatar_id;
    select * into def_av from entities where id = c.defender_avatar_id;
    oc := jsonb_build_object('kind', 'avatar_duel', 'diff', diff, 'attacker_avatar', att_av.name, 'attacker_emoji', att_av.emoji, 'defender_avatar', def_av.name, 'defender_emoji', def_av.emoji,
                             'attacker_loss', a_loss, 'defender_loss', d_loss, 'attacker_hp', att_av.hp, 'defender_hp', def_av.hp,
                             'attacker_dead', att_av.status = 'dead', 'defender_dead', def_av.status = 'dead');
  elsif c.kind = 'convert' then
    k := case when diff >= 3 then 2 when diff >= 1 then 1 else 0 end;
    -- the godless turn first; only then the defender's own
    a := city_remove_atheists(c.target_city_id, k);
    converted := a + (case when c.defender_id is null then 0 else city_remove_dots(c.target_city_id, c.defender_id, k - a) end);
    perform city_add_dots(c.target_city_id, c.attacker_id, converted);
    oc := jsonb_build_object('kind', 'convert', 'diff', diff, 'converted', converted, 'from_atheists', a);
  else
    if diff >= 3 then
      returned := c.army;
    elsif diff >= 1 then
      att_lost := ceil(c.army / 2.0)::int;
      returned := c.army - att_lost;
    elsif diff = 0 then
      def_lost := contest_defender_lose(c, 1);
      att_lost := 1;
      returned := c.army - 1;
    elsif diff >= -2 then
      def_lost := contest_defender_lose(c, 1);
      att_lost := c.army - 1;
      returned := 1;
    else
      att_lost := c.army;
      returned := 0;
    end if;
    if att_lost > 0 and c.source_city_id is not null then perform collect_souls(c.source_city_id, c.attacker_id, att_lost); end if;
    if returned > 0 and c.source_city_id is not null and exists (select 1 from cities where entity_id = c.source_city_id) then
      perform city_add_dots(c.source_city_id, c.attacker_id, returned);
    end if;
    source_gone := c.source_city_id is not null and destroy_city_if_empty(c.source_city_id, g.round_number, g.era);
    -- the general: after a victory it stands in the taken city (when there is room); a rout wounds it
    if c.attacker_avatar_id is not null then
      select * into att_av from entities where id = c.attacker_avatar_id and status = 'active';
      if att_av.id is not null then
        if diff >= 1 and tcity.entity_id is not null and hex_slot_for_role(c.game_id, tcity.q, tcity.r, 'avatar') is not null then
          update hex_occupants set q = tcity.q, r = tcity.r, slot = hex_slot_for_role(c.game_id, tcity.q, tcity.r, 'avatar') where game_id = c.game_id and entity_id = att_av.id;
          av_to := jsonb_build_object('q', tcity.q, 'r', tcity.r);
        elsif diff <= -3 then
          av_wound := wound_avatar(att_av.id, 1, c.attacker_id, g.round_number, g.era);
        end if;
        select * into att_av from entities where id = c.attacker_avatar_id;
      end if;
    end if;
    oc := jsonb_build_object('kind', 'holy_war', 'diff', diff, 'army', c.army, 'removed', removed, 'converted', converted,
                                  'defender_lost', removed + def_lost, 'attacker_lost', att_lost, 'returned', returned,
                                  'successes', case when diff >= 1 then c.army else 0 end, 'pending', diff >= 1,
                                  'source_city_id', c.source_city_id, 'source_destroyed', source_gone,
                                  'defender_avatar_hp', def_av_hp, 'defender_avatar_name', def_av.name, 'defender_avatar_emoji', def_av.emoji,
                                  'attacker_avatar_hp', (select (l.outcome->>'attacker_avatar_hp')::int from actions_log l where l.id = c.log_id),
                                  'attacker_avatar_name', att_av.name, 'attacker_avatar_emoji', att_av.emoji, 'attacker_avatar_to', av_to,
                                  'attacker_avatar_wound', av_wound, 'attacker_avatar_dead', coalesce(att_av.status = 'dead', false));
  end if;
  if c.target_city_id is not null then
    target_gone := destroy_city_if_empty(c.target_city_id, g.round_number, g.era);
  end if;
  oc := oc || jsonb_build_object('target_city_id', c.target_city_id, 'target_name', target.name, 'target_destroyed', target_gone,
                                 'attacker_id', c.attacker_id, 'defender_id', c.defender_id, 'godless', c.defender_id is null,
                                 'attacker_total', c.attacker_total, 'defender_total', d1 + d2 + mod, 'defender_dots', def_dots, 'defender_prophecy', p_pmod);

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (c.game_id, g.round_number, g.era, c.attacker_id, c.kind, 0, coalesce(c.target_city_id, c.attacker_avatar_id),
          jsonb_build_object('att', jsonb_build_object('d1', c.attacker_d1, 'd2', c.attacker_d2, 'modifier', c.attacker_mod, 'total', c.attacker_total, 'attr', c.attacker_attr),
                             'def', jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', p_attr, 'prophecy', p_pmod)),
          oc, '')
  returning * into log_row;

  update contests set
    defender_attr = p_attr, defender_d1 = d1, defender_d2 = d2, defender_mod = mod, defender_total = d1 + d2 + mod,
    status = 'resolved', outcome = oc, log_id = log_row.id, resolved_at = now()
  where id = c.id
  returning * into c;

  -- the attacker writes the verse (and, after a won war, places the blows) before the turn moves on
  update games set verse_pending_by = c.attacker_id where id = c.game_id;
  perform recompute_turn(c.game_id);
  return c;
end $$;

-- ---------- contests: the defender's tiles ----------
create or replace function answer_contest(p_contest_id uuid, p_attr text, p_prophecy_id uuid default null)
returns contests language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
  pmod int := 0;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if c.defender_id is null or me.id <> c.defender_id then raise exception 'Odpowiada tylko broniące się bóstwo.' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'To starcie już rozstrzygnięto.'; end if;
  perform assert_attr(c.kind, p_attr, 'defence');
  pmod := consume_prophecy(c.game_id, me.id, p_prophecy_id, c.round_number, c.era);
  return contest_resolve(c.id, p_attr, pmod, attr_score(me, p_attr));
end $$;

-- ---------- contests: the attacker's tiles; against the godless the book answers at once ----------
create or replace function declare_contest(p_game_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb)
returns contests language plpgsql security definer set search_path = public as $$
declare
  me players := require_player(p_game_id);
  g games;
  def players;
  def_id uuid := nullif(p_payload->>'defender_id', '')::uuid;
  godless boolean := false;
  target entities;
  tcity cities;
  source entities;
  scity cities;
  army int := 0;
  cost int;
  attr text;
  mod int;
  d1 int := roll_d6();
  d2 int := roll_d6();
  c contests;
  log_row actions_log;
  att_av entities; def_av entities; att_occ hex_occupants; def_occ hex_occupants;
  pmod int := 0;
  av entities; av_hp int := 0; av_moved boolean := false;
begin
  select * into g from games where id = p_game_id for update;
  if g.status <> 'playing' or g.phase <> 'gods' then raise exception 'Faza Bóstw nie trwa.'; end if;
  if g.current_turn_player_id is distinct from me.id then raise exception 'To nie twoja tura.' using errcode = '42501'; end if;
  if me.is_resting then raise exception 'Odpoczywasz do końca rundy.'; end if;
  perform assert_no_contest(p_game_id);
  perform assert_no_verse_pending(p_game_id);
  if p_kind not in ('convert', 'holy_war', 'avatar_duel') then raise exception 'Nieznane starcie.'; end if;
  attr := nullif(p_payload->>'attr', '');
  perform assert_attr(p_kind, attr);

  if p_kind = 'avatar_duel' then
    select e.* into att_av from entity_gods eg join entities e on e.id = eg.entity_id
    where eg.player_id = me.id and e.kind = 'avatar' and e.status = 'active' and e.id = nullif(p_payload->>'attacker_avatar_id', '')::uuid;
    if att_av.id is null then raise exception 'Wskaż swojego żywego awatara.'; end if;
    select * into def_av from entities where id = nullif(p_payload->>'defender_avatar_id', '')::uuid and game_id = p_game_id and kind = 'avatar' and status = 'active';
    if def_av.id is null then raise exception 'Wskaż żywego awatara przeciwnika.'; end if;
    if exists (select 1 from entity_gods where entity_id = def_av.id and player_id = me.id) then raise exception 'To twój własny awatar.'; end if;
    select * into att_occ from hex_occupants where entity_id = att_av.id;
    select * into def_occ from hex_occupants where entity_id = def_av.id;
    if att_occ.id is null or def_occ.id is null then raise exception 'Obaj awatarzy muszą stać na mapie.'; end if;
    if hex_distance(att_occ.q, att_occ.r, def_occ.q, def_occ.r) > 2 then raise exception 'Awatar sięga najwyżej dwa heksy. Najpierw wyślij go na pielgrzymkę.'; end if;
    select p.* into def from entity_gods eg join players p on p.id = eg.player_id where eg.entity_id = def_av.id order by (eg.role = 'creator') desc, p.seat_order limit 1;
    if def.id is null then raise exception 'Ten awatar nie ma bóstwa.'; end if;
    cost := action_cost('avatar_duel', g.era);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + pmod;
    update players set logos = logos - cost where id = me.id;
    insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                          attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total, attacker_avatar_id, defender_avatar_id)
    values (p_game_id, g.round_number, g.era, 'avatar_duel', me.id, def.id, null, null, null, cost, attr, d1, d2, mod, d1 + d2 + mod, att_av.id, def_av.id)
    returning * into c;
    insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
    values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, att_av.id,
            jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
            jsonb_build_object('kind', 'avatar_duel', 'contest_id', c.id, 'defender_id', def.id, 'attacker_avatar', att_av.name, 'attacker_emoji', att_av.emoji,
                               'defender_avatar', def_av.name, 'defender_emoji', def_av.emoji, 'cost', cost), '')
    returning * into log_row;
    update contests set log_id = log_row.id where id = c.id;
    return c;
  end if;

  select * into target from entities
  where id = nullif(p_payload->>(case when p_kind = 'convert' then 'city_id' else 'target_city_id' end), '')::uuid
    and game_id = p_game_id and kind = 'civilization' and status = 'active';
  select * into tcity from cities where entity_id = target.id;
  if target.id is null or tcity.entity_id is null then raise exception 'Wskaż miasto na mapie.'; end if;
  if def_id is null then
    -- the godless: nobody answers, the book rolls for them at once
    godless := true;
    if coalesce(tcity.atheists, 0) = 0 then raise exception 'W tym mieście nie ma bezbożników.'; end if;
  else
    select * into def from players where id = def_id and game_id = p_game_id;
    if def.id is null or def.id = me.id then raise exception 'Wskaż inne bóstwo.'; end if;
    if player_dots(target.id, def.id) = 0 then raise exception 'To bóstwo nie ma tam wyznawców.'; end if;
  end if;

  if p_kind = 'convert' then
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, tcity.q, tcity.r);
    cost := action_cost('convert', g.era);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    av_moved := avatar_enter(p_game_id, av.id, tcity.q, tcity.r, 'miasta, w którym nawraca');
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + pmod;
  else
    select * into source from entities where id = nullif(p_payload->>'source_city_id', '')::uuid and game_id = p_game_id and kind = 'civilization' and status = 'active';
    select * into scity from cities where entity_id = source.id;
    if source.id is null or scity.entity_id is null then raise exception 'Wskaż swoje miasto.'; end if;
    if source.id = target.id then raise exception 'Miasto nie wyruszy na siebie.'; end if;
    if player_dots(source.id, me.id) <= coalesce((select max(dots) from city_followers where city_id = source.id and player_id <> me.id), 0) then
      raise exception 'Armię wystawia miasto, w którym masz większość.';
    end if;
    army := coalesce(nullif(p_payload->>'army', '')::int, 0);
    if army < 1 or army > player_dots(source.id, me.id) - 1 then raise exception 'Armia to od 1 do liczby twoich wyznawców pomniejszonej o 1.'; end if;
    av := pick_avatar(p_game_id, me.id, nullif(p_payload->>'avatar_id', '')::uuid, scity.q, scity.r);
    cost := action_cost('holy_war', g.era) + hex_distance(scity.q, scity.r, tcity.q, tcity.r);
    if me.logos < cost then raise exception 'Za mało Logos (potrzeba %, masz %).', cost, me.logos; end if;
    av_moved := avatar_enter(p_game_id, av.id, scity.q, scity.r, 'miasta, które wystawia armię');
    av_hp := coalesce(av.hp, 0);
    pmod := consume_prophecy(p_game_id, me.id, nullif(p_payload->>'prophecy_id', '')::uuid, g.round_number, g.era);
    mod := attr_score(me, attr) + army + pmod + av_hp;
  end if;

  update players set logos = logos - cost where id = me.id;
  if p_kind = 'holy_war' then perform city_remove_dots(source.id, me.id, army); end if;

  insert into contests (game_id, round_number, era, kind, attacker_id, defender_id, target_city_id, source_city_id, army, cost,
                        attacker_attr, attacker_d1, attacker_d2, attacker_mod, attacker_total, attacker_avatar_id)
  values (p_game_id, g.round_number, g.era, p_kind, me.id, def.id, target.id, source.id, nullif(army, 0), cost,
          attr, d1, d2, mod, d1 + d2 + mod, av.id)
  returning * into c;

  insert into actions_log (game_id, round_number, era, player_id, action_key, logos_delta, entity_id, roll, outcome, summary)
  values (p_game_id, g.round_number, g.era, me.id, 'contest_declared', -cost, target.id,
          jsonb_build_object('d1', d1, 'd2', d2, 'modifier', mod, 'total', d1 + d2 + mod, 'attr', attr, 'prophecy', pmod),
          jsonb_build_object('kind', p_kind, 'contest_id', c.id, 'defender_id', def.id, 'godless', godless, 'target_city_id', target.id, 'target_name', target.name,
                             'source_city_id', source.id, 'source_name', source.name, 'army', nullif(army, 0), 'cost', cost, 'full_cost', cost,
                             'attacker_avatar_hp', case when p_kind = 'holy_war' then av_hp else null end,
                             'avatar', jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji, 'entered', av_moved)),
          '')
  returning * into log_row;
  update contests set log_id = log_row.id where id = c.id;

  -- the godless have no god to roll for them: the book rolls at once (no attribute, no prophecy)
  if godless then
    return contest_resolve(c.id, case when p_kind = 'convert' then 'majesty' else 'grace' end, 0, 0);
  end if;
  return c;
end $$;

-- ---------- the attacker's verse; after a won war the blows are placed (the godless have no god and no avatar) ----------
create or replace function commit_contest(p_contest_id uuid, p_summary text, p_allocation jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c contests;
  me players;
  g games;
  oc jsonb;
  successes int;
  n_dots int := 0;
  n_avatar int := 0;
  spent int := 0;
  removed int := 0;
  converted int := 0;
  def_av entities;
  tcity cities;
  oid uuid;
  victim entities;
  killed jsonb := '[]'::jsonb;
  target_gone boolean := false;
begin
  select * into c from contests where id = p_contest_id for update;
  if c.id is null then raise exception 'Nie ma takiego starcia.'; end if;
  me := require_player(c.game_id);
  if me.id <> c.attacker_id then raise exception 'Werset dopisuje bóstwo, które zaczęło starcie.' using errcode = '42501'; end if;
  if c.status <> 'resolved' then raise exception 'To starcie nie czeka na werset.'; end if;
  select * into g from games where id = c.game_id;
  oc := coalesce(c.outcome, '{}'::jsonb);

  if c.kind = 'holy_war' and coalesce((oc->>'pending')::boolean, false) then
    successes := coalesce((oc->>'successes')::int, 0);
    select * into tcity from cities where entity_id = c.target_city_id;
    n_dots := coalesce(nullif(p_allocation->>'dots', '')::int, successes);
    n_avatar := coalesce(nullif(p_allocation->>'avatar', '')::int, 0);
    if n_dots < 0 or n_avatar < 0 then raise exception 'Sukcesy nie mogą być ujemne.'; end if;
    -- the dots: destroyed, half of them (rounded up) turned to the attacker
    n_dots := least(n_dots, contest_defender_dots(c), successes);
    removed := contest_defender_lose(c, n_dots);
    converted := city_add_dots(c.target_city_id, c.attacker_id, ceil(removed / 2.0)::int);
    spent := removed;
    -- the enemy's avatar on that field: one success is one wound (the godless have none)
    if n_avatar > 0 and tcity.entity_id is not null and c.defender_id is not null then
      select e.* into def_av from hex_occupants o join entities e on e.id = o.entity_id join entity_gods eg on eg.entity_id = e.id
      where o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'avatar' and e.status = 'active' and eg.player_id = c.defender_id limit 1;
      if def_av.id is null then raise exception 'Na tym polu nie stoi awatar obrońcy.'; end if;
      n_avatar := least(n_avatar, successes - spent, coalesce(def_av.hp, 0));
      perform wound_avatar(def_av.id, n_avatar, c.attacker_id, g.round_number, g.era);
      spent := spent + n_avatar;
      select * into def_av from entities where id = def_av.id;
    else
      n_avatar := 0;
    end if;
    -- creatures on that field: one success removes one
    if p_allocation ? 'creatures' and tcity.entity_id is not null then
      for oid in select (jsonb_array_elements_text(p_allocation->'creatures'))::uuid loop
        exit when spent >= successes;
        select e.* into victim from hex_occupants o join entities e on e.id = o.entity_id
        where o.id = oid and o.game_id = c.game_id and o.q = tcity.q and o.r = tcity.r and e.kind = 'creature';
        if victim.id is null then continue; end if;
        delete from hex_occupants where id = oid;
        if not exists (select 1 from hex_occupants where entity_id = victim.id) then update entities set status = 'dead' where id = victim.id; end if;
        killed := killed || jsonb_build_array(jsonb_build_object('entity_id', victim.id, 'name', victim.name, 'emoji', victim.emoji));
        spent := spent + 1;
      end loop;
    end if;
    target_gone := destroy_city_if_empty(c.target_city_id, g.round_number, g.era);
    oc := oc || jsonb_build_object('pending', false, 'removed', removed, 'converted', converted, 'defender_lost', removed + coalesce((oc->>'defender_lost')::int, 0),
                                   'avatar_wounds', n_avatar, 'avatar_name', def_av.name, 'avatar_dead', coalesce(def_av.status = 'dead', false),
                                   'creatures_killed', killed, 'target_destroyed', target_gone, 'spent', spent);
    update contests set outcome = oc where id = c.id;
    if c.log_id is not null then update actions_log set outcome = oc where id = c.log_id; end if;
  end if;

  if c.log_id is not null then update actions_log set summary = coalesce(trim(p_summary), '') where id = c.log_id; end if;
  update contests set status = 'committed' where id = c.id;
  update games set verse_pending_by = null where id = c.game_id and verse_pending_by = me.id;
  perform recompute_turn(c.game_id);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'action_cost(text, smallint)', 'declare_contest(uuid, text, jsonb)', 'answer_contest(uuid, text, uuid)', 'commit_contest(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
