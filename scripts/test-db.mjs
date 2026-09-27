// End-to-end test of the game logic in supabase/migrations, run inside PGlite (WASM Postgres).
// Stubs the parts Supabase provides (auth schema, roles, publication) and plays a two-god game.
//   node scripts/test-db.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
let failures = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else {
    failures++
    console.log('  ✗', msg)
  }
}

// ---- Supabase stubs ----
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.uid', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)

for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_functions.sql', '0004_realtime.sql']) {
  const sql = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')
    .replace(/create extension if not exists pgcrypto;/i, '-- (pgcrypto not needed: gen_random_uuid is core)')
  try {
    await db.exec(sql)
    console.log('migration', f, 'applied')
  } catch (e) {
    console.error('migration', f, 'FAILED:', e.message)
    process.exit(1)
  }
}

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users (id, email) values ('${A}', 'alfa@example.com'), ('${B}', 'beta@example.com')`)
const as = (uid) => db.query(`select set_config('app.uid', $1, false)`, [uid])
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const rpcErr = async (sql, params = []) => {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e.message
  }
}

console.log('\n# lobby')
await as(A)
const profiles = await q('select * from profiles order by display_name')
ok(profiles.length === 2 && profiles[0].display_name === 'alfa', 'signup trigger created profiles')
await db.query(`select set_display_name('Michał')`)
const [game] = await q(`select * from create_game('Ziemie za Mgłą', 'Ta Pod Rzeką', 'fresco-06')`)
ok(/^[A-Z2-9]{6}$/.test(game.code), `game code ${game.code}`)
await as(B)
ok((await rpcErr(`select join_game('ZZZZZZ')`)) !== null, 'joining a bad code fails')
await db.query(`select join_game($1, 'Ten, Który Liczy', 'fresco-08')`, [game.code.toLowerCase()])
let players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(players.length === 2 && players[1].seat_order === 2, 'second god seated')
ok((await rpcErr(`select open_palette($1)`, [game.id])) !== null, 'non-host cannot open palette')
await as(A)
await db.query(`select open_palette($1)`, [game.id])
await db.query(`insert into palette_entries (game_id, player_id, "column", text) values ($1, $2, 'yes', 'sterowce')`, [game.id, players[0].id])
await db.query(`select start_game($1)`, [game.id])
let g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.status === 'playing' && g.phase === 'rolling' && g.round_number === 1 && g.era === 1, 'game started: era 1, round 1, rolling')

console.log('\n# round 1: logos rolls')
ok((await rpcErr(`select perform_action($1, 'shape_land')`, [game.id])) !== null, 'no actions during rolling phase')
const [rollA] = await q(`select * from roll_logos($1)`, [game.id])
ok(rollA.die1 >= 1 && rollA.die1 <= 6 && rollA.total === rollA.die1 + rollA.die2, `A rolled ${rollA.die1}+${rollA.die2}`)
ok((await rpcErr(`select roll_logos($1)`, [game.id])) !== null, 'cannot roll twice')
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'rolling', 'still rolling until everyone rolled')
await as(B)
const [rollB] = await q(`select * from roll_logos($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(g.phase === 'gods', 'phase -> gods after all rolls')
const top = players.reduce((m, p) => (p.logos > m.logos ? p : m))
const tiedTop = players.filter((p) => p.logos === top.logos)
ok(
  tiedTop.some((p) => p.id === g.current_turn_player_id) && (tiedTop.length > 1 ? g.current_turn_player_id === players[0].id : true),
  `turn to highest logos (${players.map((p) => p.logos).join(' vs ')}), ties -> lowest seat`,
)

console.log('\n# turn switching')
const turnUid = players.find((p) => p.id === g.current_turn_player_id).user_id
const otherUid = turnUid === A ? B : A
await as(otherUid)
ok((await rpcErr(`select perform_action($1, 'shape_land', '{"summary":"x"}')`, [game.id])) !== null, 'acting out of turn is rejected')
await as(turnUid)
const before = players.find((p) => p.user_id === turnUid).logos
const otherLogos = players.find((p) => p.user_id === otherUid).logos
// spend until we drop below the other god (or run out), each spend must keep/hand over the turn correctly
let spent = 0
while (true) {
  const cur = (await q('select logos from players where user_id = $1 and game_id = $2', [turnUid, game.id]))[0].logos
  if (cur < 2) break
  await db.query(`select perform_action($1, 'shape_land', '{"summary":"Góry na północy."}')`, [game.id])
  spent += 2
  const gg = (await q('select * from games where id = $1', [game.id]))[0]
  const now = cur - 2
  const expectTurnUid = now >= otherLogos ? turnUid : otherUid // ties keep the current holder
  const actualUid = (await q('select user_id from players where id = $1', [gg.current_turn_player_id]))[0].user_id
  if (actualUid !== expectTurnUid) {
    ok(false, `after spending to ${now} (other ${otherLogos}) turn should be ${expectTurnUid === turnUid ? 'kept' : 'handed over'}`)
    break
  }
  if (now < otherLogos) {
    ok(true, `turn handed over the moment logos (${now}) dropped below ${otherLogos}`)
    break
  }
}
ok(spent > 0, `spent ${spent} logos in shape_land (cost 2 in era I)`)
ok((await q('select count(*)::int as n from actions_log where action_key = $1', ['shape_land']))[0].n === spent / 2, 'chronicle has one line per action')
ok(before - spent === (await q('select logos from players where user_id = $1 and game_id = $2', [turnUid, game.id]))[0].logos, 'logos deducted exactly')

console.log('\n# entities')
g = (await q('select * from games where id = $1', [game.id]))[0]
const actor = (await q('select * from players where id = $1', [g.current_turn_player_id]))[0]
await as(actor.user_id)
// test-only: give the actor plenty of Logos before each purchase so the turn stays put
const topUp = async () => {
  await db.query('update players set logos = 60 where id = $1', [actor.id])
  await db.query(`select recompute_turn($1)`, [game.id])
}
await topUp()
const creature = await q(
  `select * from perform_action($1, 'create_creature', $2::jsonb)`,
  [game.id, JSON.stringify({ summary: 'Manule stoickie', entity: { op: 'create', kind: 'creature', name: 'Manule', traits: ['Rozumne', 'Łagodne'] } })],
)
ok(creature[0].logos_delta === -10 && creature[0].entity_id, 'creature created for 10 logos')
await topUp()
const civ = await q(
  `select * from perform_action($1, 'create_civilization', $2::jsonb)`,
  [game.id, JSON.stringify({ summary: 'Lud Manuli', entity: { op: 'create', kind: 'civilization', name: 'Stoicy', traits: ['Zachowawcza'], specialties: ['Rolnictwo'], flaws: ['Magia'], species_ids: [creature[0].entity_id] } })],
)
ok(civ[0].logos_delta === -22, 'civilization costs 22 in era I')
const links = await q('select * from entity_links where from_entity_id = $1', [civ[0].entity_id])
ok(links.length === 1 && links[0].relation === 'member_species', 'civilization linked to its species')
await topUp()
const orth = await q(
  `select * from perform_action($1, 'create_orthodoxy', $2::jsonb)`,
  [game.id, JSON.stringify({ entity: { op: 'create', kind: 'orthodoxy', name: 'Cisi', faction_type: 'Sekta/Kult', parent_civilization_id: civ[0].entity_id, requirements: ['Szerzyć', 'Bronić'] } })],
)
const pins = await q('select * from entity_gods where entity_id = $1', [orth[0].entity_id])
ok(pins.length === 1 && pins[0].player_id === actor.id, 'orthodoxy pinned to its god')
ok((await q('select parent_civilization_id from entities where id = $1', [orth[0].entity_id]))[0].parent_civilization_id === civ[0].entity_id, 'orthodoxy pinned to civilization')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, entity: { op: 'create', kind: 'avatar', name: 'x' } })])) !== null, 'free avatar action refused without an avatar')
const av = await q(`select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ entity: { op: 'create', kind: 'avatar', name: 'Posąg', conditions: ['Są nieożywionym przedmiotem.'] } })])
await topUp()
const free = await q(`select * from perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, summary: 'Kontynent unosi się.' })])
ok(free[0].logos_delta === 0 && free[0].is_avatar_free_action, 'avatar free action costs 0')
ok((await rpcErr(`select perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true })])) !== null, 'second free avatar action in a round refused')
ok(av[0].entity_id !== null, 'avatar created')

console.log('\n# rest -> chaos')
const dice = await q(`select * from log_dice_roll($1, 'test')`, [game.id])
ok(dice[0].roll.total === dice[0].roll.d1 + dice[0].roll.d2, 'shared dice logged')
await db.query(`select adjust_logos($1, 5, 'Danina')`, [game.id])
ok((await rpcErr(`select adjust_logos($1, 9, 'za dużo')`, [game.id])) !== null, 'adjust_logos bounded')
await db.query(`select rest($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'gods' && g.current_turn_player_id !== actor.id, 'after rest, turn goes to the other god')
const otherP = (await q('select * from players where game_id = $1 and id <> $2', [game.id, actor.id]))[0]
await as(otherP.user_id)
await db.query(`select transfer_logos($1, $2, 1)`, [game.id, actor.id])
await db.query(`select rest($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'chaos' && g.current_turn_player_id === null, 'everyone resting -> chaos phase')
ok((await rpcErr(`select vote_advance_era($1)`, [game.id])) !== null, 'era vote refused before round 5')

console.log('\n# chaos card')
const draw = (await q(`select * from reveal_chaos($1)`, [game.id]))[0]
ok(draw.die1 >= 1 && draw.die2 <= 6 && draw.category_key === null, 'chaos revealed, dice only')
ok((await rpcErr(`select reveal_chaos($1)`, [game.id])) !== null, 'cannot reveal twice in a round')
await as(actor.user_id)
ok((await rpcErr(`select choose_chaos_die($1, 1)`, [game.id])) !== null, 'only the revealer chooses the die')
await as(otherP.user_id)
const chosen = (await q(`select * from choose_chaos_die($1, 2::smallint)`, [game.id]))[0]
const cats = ['region', 'event', 'people', 'magic', 'culture', 'disaster']
ok(chosen.category_key === cats[draw.die2 - 1] && chosen.entry_index === draw.die1, `die 2 (${draw.die2}) -> ${chosen.category_key}, entry ${chosen.entry_index}`)
await db.query(`select set_chaos_notes($1, 'Rzeka zmienia bieg.')`, [game.id])

console.log('\n# round end bookkeeping')
await db.query('update players set logos = 3 where id = $1', [otherP.id])
await db.query(`select end_chaos_phase($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(g.round_number === 2 && g.phase === 'rolling', 'round 2, rolling')
ok(players.every((p) => !p.is_resting && !p.has_rolled && !p.avatar_action_used), 'flags reset')
ok(players.find((p) => p.id === otherP.id).low_logos_streak === 1, 'low-logos streak +1 for the god who ended at 3')
ok(players.find((p) => p.id === actor.id).low_logos_streak === 0, 'no streak for the god above 5')
await as(actor.user_id)
const r2 = (await q(`select * from roll_logos($1)`, [game.id]))[0]
ok(r2.bonus_orthodoxy === 1 && r2.total === r2.die1 + r2.die2 + 1, 'orthodoxy bonus +1 applied to the logos roll')
await as(otherP.user_id)
const r2b = (await q(`select * from roll_logos($1)`, [game.id]))[0]
ok(r2b.bonus_streak === 1, 'streak bonus applied')

console.log('\n# era vote at round 5')
await db.query('update games set round_number = 5 where id = $1', [game.id])
await db.query(`select vote_advance_era($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.era === 1 && (await q('select count(*)::int as n from era_votes where game_id = $1', [game.id]))[0].n === 1, 'one of two votes: era unchanged')
await db.query(`select vote_advance_era($1)`, [game.id])
ok((await q('select count(*)::int as n from era_votes where game_id = $1', [game.id]))[0].n === 0, 'vote toggles off')
await db.query(`select vote_advance_era($1)`, [game.id])
await as(actor.user_id)
await db.query(`select vote_advance_era($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.era === 2 && g.era_started_round === 5, 'majority -> era 2')
ok((await q(`select action_cost('create_civilization', 2::smallint) as c`))[0].c === 12, 'era II civilization costs 12')

console.log('\n# RLS as authenticated role')
const C = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users (id, email) values ('${C}', 'gamma@example.com')`)
await db.exec('set role authenticated')
await as(C)
ok((await q('select * from games'))[0] === undefined, 'outsider sees no games')
ok((await q('select * from players'))[0] === undefined, 'outsider sees no players')
await as(A)
ok((await q('select * from games')).length === 1, 'member sees their game')
ok((await q('select * from entities')).length === 4, 'member sees all 4 entities')
const pal = await rpcErr(`insert into palette_entries (game_id, player_id, "column", text) values ($1, $2, 'no', 'x')`, [game.id, players[1].id])
ok(pal !== null, 'cannot insert palette entry as another player')
const direct = await rpcErr('update players set logos = 999 where game_id = $1', [game.id])
ok(direct !== null || (await q('select logos from players where user_id = $1', [A]))[0].logos !== 999, 'direct logos edit blocked by RLS')
await db.exec('reset role')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
