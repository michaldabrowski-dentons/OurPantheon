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

for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_functions.sql', '0004_realtime.sql', '0005_world_creation.sql', '0006_chronicle_book.sql', '0007_god_gender.sql', '0008_login_and_guests.sql', '0009_creation_sync.sql', '0010_ensure_turn.sql', '0011_playbooks.sql', '0012_hex_map.sql', '0013_ocean_start.sql', '0014_biome_tiles.sql', '0015_fix_biome_draw.sql', '0016_colors_and_tiles.sql', '0017_prices_and_ruins.sql', '0018_verse_lock_avatars_prophecies.sql', '0019_afterlife_avatar_hand.sql', '0020_fertility_rivers_resources.sql', '0021_chaos_night.sql', '0022_night_2d6_ranks_mutations.sql', '0023_two_tiles_pbta.sql', '0024_cataclysms_avatar_words.sql', '0025_godless_contests_prices.sql']) {
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

// test-only dice: a fixed face (test.d6) wins, then a queue of faces, then chance
await db.exec(`
  create table test_dice (id serial primary key, v int);
  create or replace function roll_d6() returns smallint language plpgsql volatile as $$
  declare x int; s text := current_setting('test.d6', true);
  begin
    if coalesce(s, '') <> '' then return s::smallint; end if;
    delete from test_dice where id = (select min(id) from test_dice) returning v into x;
    if x is null then return (floor(random() * 6) + 1)::smallint; end if;
    return x::smallint;
  end $$;
`)
const queueDice = (...faces) => db.query(`insert into test_dice (v) values ${faces.map((f) => `(${Number(f)})`).join(', ')}`)
const fixDice = (face) => db.query(`select set_config('test.d6', $1, false)`, [face === null ? '' : String(face)])
// the actor is a god of the harvest (Łaska +2, Żywioł +1, Gniew −1, the rest 0): a face of 6 is always 10+,
// a 4 lands on 7..9 for every attribute but Łaska, a 1 is always 6-
let rolledQ = null
const rolled = async (face, sql, params) => {
  await fixDice(face)
  try { return (await rolledQ(sql, params))[0] } finally { await fixDice(null) }
}

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users (id, email) values ('${A}', 'alfa@example.com'), ('${B}', 'beta@example.com')`)
const as = (uid) => db.query(`select set_config('app.uid', $1, false)`, [uid])
let gameId = null
const q = async (sql, params = []) => {
  const rows = (await db.query(sql, params)).rows
  // a word waits for its verse (games.verse_pending_by); the harness releases it at once unless told otherwise
  if (gameId && /perform_action\(/.test(sql) && !/-- keep lock/.test(sql)) await db.query('select release_verse($1)', [gameId])
  return rows
}
const rpcErr = async (sql, params = []) => {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e.message
  }
}
const J = (o) => JSON.stringify(o)
rolledQ = q

console.log('\n# lobby')
await as(A)
const profiles = await q('select * from profiles order by display_name')
ok(profiles.length === 2 && profiles[0].display_name === 'alfa', 'signup trigger created profiles')
await db.query(`select set_display_name('Michał')`)
const [game] = await q(`select * from create_game('Ziemie za Mgłą', 'Ta Pod Rzeką', 'fresco-06')`)
gameId = game.id
ok(/^[A-Z2-9]{6}$/.test(game.code), `game code ${game.code}`)
await as(B)
ok((await rpcErr(`select join_game('ZZZZZZ')`)) !== null, 'joining a bad code fails')
await db.query(`select join_game($1, 'Ten, Który Liczy', 'fresco-08')`, [game.code.toLowerCase()])
let players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(players.length === 2 && players[1].seat_order === 2, 'second god seated')
ok((await rpcErr(`select open_palette($1)`, [game.id])) !== null, 'non-host cannot open palette')
await as(A)
await db.query(`select set_god($1, 'Ta Pod Rzeką', 'bogini rzek i cierpliwości', 'f', 'harvest', 'grace', 'wisdom', 'Śpi pod rzeką od początku świata.', '#6fe3d3')`, [game.id])
const godRow = (await q('select god_description, god_gender, domain_key, attr_primary, attr_bonus, god_notes, god_color from players where user_id = $1', [A]))[0]
ok(godRow.god_color === '#6fe3d3', 'the god keeps its chosen shade')
ok((await rpcErr(`select set_god($1, 'X', '', 'f', 'harvest', 'grace', 'wisdom', '', 'zielony')`, [game.id])) !== null, 'a colour must be a hex string')
ok(godRow.god_description === 'bogini rzek i cierpliwości' && godRow.god_gender === 'f', 'god description and gender saved')
ok(godRow.domain_key === 'harvest' && godRow.attr_primary === 'grace' && godRow.attr_bonus === 'wisdom' && godRow.god_notes.startsWith('Śpi'), 'playbook keys and notes saved')
ok((await rpcErr(`select set_god($1, 'X', '', 'x')`, [game.id])) !== null, 'unknown gender refused')
ok((await rpcErr(`select set_god($1, 'X', '', 'f', 'harvest', 'wrath', 'wisdom')`, [game.id])) !== null, 'primary outside the domain mains refused')
ok((await rpcErr(`select set_god($1, 'X', '', 'f', 'harvest', 'grace', 'element')`, [game.id])) !== null, 'bonus on a main refused')
ok((await rpcErr(`select set_god($1, 'X', '', 'f', 'chaos', 'grace', 'wisdom')`, [game.id])) !== null, 'unknown domain refused')
ok((await rpcErr(`select set_god($1, 'X', '', 'f', null, 'grace', null)`, [game.id])) !== null, 'attributes without a domain refused')
await db.query(`select set_god($1, 'Ta Pod Rzeką', 'bogini rzek i cierpliwości', 'f', 'harvest', 'grace', 'wisdom')`, [game.id])
{
  // the six scores, as the client computes them: harvest = Żywioł + Łaska, primary Łaska, bonus Mądrość
  const s = (await q(`select attr_score(p, 'grace') as g, attr_score(p, 'element') as e, attr_score(p, 'wrath') as w, attr_score(p, 'wisdom') as m, attr_score(p, 'majesty') as j, attr_score(p, 'whisper') as p from players p where user_id = $1`, [A]))[0]
  ok(s.g === 2 && s.e === 1 && s.w === -1 && s.m === 0 && s.j === 0 && s.p === 0, 'attr_score mirrors the playbook arithmetic (+2 +1 0 0 -1 0)')
}
await as(B)
await db.query(`select set_god($1, 'Ten, Który Liczy', '', 'm', 'war', 'wrath', 'wisdom')`, [game.id])
await as(A)
await db.query(`select open_palette($1)`, [game.id])
await db.query(`insert into palette_entries (game_id, player_id, "column", text) values ($1, $2, 'yes', 'sterowce')`, [game.id, players[0].id])

console.log('\n# world creation')
ok((await rpcErr(`select vote_creation($1, 'shape', 'a')`, [game.id])) !== null, 'no voting before creation opens')
await db.query(`select open_creation($1)`, [game.id])
let g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.status === 'creation' && g.settings.creation_step === 0, 'status -> creation, page 0')
await as(B)
ok((await rpcErr(`select set_creation_step($1, 3)`, [game.id])) !== null, 'only the host turns the creation pages')
await as(A)
await db.query(`select set_creation_step($1, 3)`, [game.id])
ok((await q('select settings from games where id = $1', [game.id]))[0].settings.creation_step === 3, 'host turned to page 3')
ok((await rpcErr(`select set_creation_step($1, -1)`, [game.id])) !== null, 'no page -1')
ok((await q(`select column_default as d from information_schema.columns where table_name = 'players' and column_name = 'god_gender'`))[0].d.startsWith("'m'"), 'a god is masculine by default')
await db.query(`select vote_creation($1, 'shape', 'a')`, [game.id])
await db.query(`select vote_creation($1, 'shape', 'b')`, [game.id])
let votes = await q('select * from creation_votes where game_id = $1', [game.id])
ok(votes.length === 1 && votes[0].option_key === 'b', 'one vote per god per question, last choice wins')
await db.query(`select vote_creation($1, 'shape', 'b')`, [game.id])
ok((await q('select count(*)::int as n from creation_votes where game_id = $1', [game.id]))[0].n === 0, 'voting again for the same option withdraws it')
await as(B)
const [custom] = await q(`select * from add_creation_option($1, 'shape', 'Grzbiet śpiącego wieloryba')`, [game.id])
votes = await q('select * from creation_votes where game_id = $1', [game.id])
ok(custom.label === 'Grzbiet śpiącego wieloryba' && votes.length === 1 && votes[0].option_key === custom.id, 'custom answer added and its author votes for it')
await as(A)
await db.query(`select vote_creation($1, 'shape', $2)`, [game.id, custom.id])
ok((await rpcErr(`select start_game($1, '[{"text":"Na początku był świat, a był to grzbiet śpiącego wieloryba."},{"text":"  "}]'::jsonb)`, [game.id])) === null, 'host starts the game from creation')
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.status === 'playing' && g.phase === 'rolling' && g.round_number === 1 && g.era === 1, 'game started: era 1, round 1, rolling')
ok((await q('select max(logos)::int as m from players where game_id = $1', [game.id]))[0].m === 0, 'nobody starts with Logos: everyone rolls')
const prologue = await q(`select * from actions_log where game_id = $1 and action_key = 'prologue'`, [game.id])
ok(prologue.length === 1 && prologue[0].round_number === 0 && prologue[0].summary === 'Na początku był świat, a był to grzbiet śpiącego wieloryba.', 'prologue written as round 0, blank lines skipped')
ok((await rpcErr(`select start_game($1, '[]'::jsonb)`, [game.id])) !== null, 'cannot start twice')

console.log('\n# the map')
ok((await q('select count(*)::int as n from hexes where game_id = $1', [game.id]))[0].n === 91, '91 hexes drawn when the game starts')
ok((await q(`select count(*)::int as n from hexes where game_id = $1 and biome <> 'woda'`, [game.id]))[0].n === 0, 'the world begins as an ocean')
ok((await q(`select hex_distance(0, 0, 3, -1) as a, hex_distance(2, -2, 0, 0) as b, hex_distance(1, 0, 1, -1) as c`))[0].a === 3, 'hex distance in axial coordinates')
// a deterministic neighbourhood for the checks below
await db.query(`update hexes set biome = 'trawa', decor = '[]' where game_id = $1 and (q, r) in ((0, 0), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1))`, [game.id])
await db.query(`update hexes set biome = 'trawa', decor = '[]' where game_id = $1 and (q, r) in ((0, 3))`, [game.id])
await db.query(`update hexes set biome = 'gory' where game_id = $1 and (q, r) in ((0, 2))`, [game.id])

console.log('\n# round 1: logos rolls')
ok((await rpcErr(`select perform_action($1, 'shape_land')`, [game.id])) !== null, 'no actions during rolling phase')
const [rollA] = await q(`select * from roll_logos($1)`, [game.id])
ok(rollA.die1 >= 1 && rollA.die1 <= 6 && rollA.total === rollA.die1 + rollA.die2, `A rolled ${rollA.die1}+${rollA.die2}`)
ok((await q('select logos from players where user_id = $1 and game_id = $2', [A, game.id]))[0].logos === rollA.total, 'Logos after the first roll equals the roll alone')
const rollLine = (await q(`select summary from actions_log where action_key = 'logos_roll' order by created_at desc limit 1`))[0].summary
ok(rollLine.startsWith('Ta Pod Rzeką budzi się i śni nowe Słowa') && rollLine.endsWith(`Nowych Słów jest ${rollA.total}.`), 'logos roll written as a verse')
ok((await rpcErr(`select roll_logos($1)`, [game.id])) !== null, 'cannot roll twice')
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'rolling', 'still rolling until everyone rolled')
await as(B)
const [rollB] = await q(`select * from roll_logos($1)`, [game.id])
ok(rollB.bonus_orthodoxy === 0, 'no religion bonus any more')
g = (await q('select * from games where id = $1', [game.id]))[0]
players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(g.phase === 'gods', 'phase -> gods after all rolls')
ok(g.current_turn_player_id !== null, 'somebody holds the turn right after the rolls')
{
  // the safety net: a Gods phase without a holder, and a rolling phase that never flipped
  const holder = g.current_turn_player_id
  await db.query('update games set current_turn_player_id = null where id = $1', [game.id])
  const [fixed] = await q('select * from ensure_turn($1)', [game.id])
  ok(fixed.phase === 'gods' && fixed.current_turn_player_id === holder, 'ensure_turn restores a lost turn holder')
  await db.query(`update games set phase = 'rolling', current_turn_player_id = null where id = $1`, [game.id])
  const [flipped] = await q('select * from ensure_turn($1)', [game.id])
  ok(flipped.phase === 'gods' && flipped.current_turn_player_id === holder, 'ensure_turn flips a finished rolling phase')
  const [same] = await q('select * from ensure_turn($1)', [game.id])
  ok(same.current_turn_player_id === holder, 'ensure_turn is a no-op when the turn is fine')
}
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
ok((await rpcErr(`select perform_action($1, 'shape_land', '{"biome":"gory","hexes":[{"q":0,"r":0}]}')`, [game.id])) !== null, 'acting out of turn is rejected')
await as(turnUid)
const before = players.find((p) => p.user_id === turnUid).logos
const otherLogos = players.find((p) => p.user_id === otherUid).logos
// spend until we drop below the other god (or run out), each spend must keep/hand over the turn correctly
let spent = 0
while (true) {
  const cur = (await q('select logos from players where user_id = $1 and game_id = $2', [turnUid, game.id]))[0].logos
  if (cur < 2) break
  await db.query(`select perform_action($1, 'shape_land', '{"biome":"pustynia","hexes":[{"q":-1,"r":0}]}')`, [game.id])
  await db.query('select release_verse($1)', [game.id])
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
await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = -1 and r = 0`, [game.id])

console.log('\n# the turn waits for the book')
{
  await as(turnUid)
  await db.query('update players set logos = 60 where user_id = $1 and game_id = $2', [turnUid, game.id])
  await db.query('select recompute_turn($1)', [game.id])
  const locked = (await q(`select * from perform_action($1, 'shape_land', '{"biome":"zima","hexes":[{"q":-1,"r":1}]}') -- keep lock`, [game.id]))[0]
  const gl = (await q('select verse_pending_by, phase from games where id = $1', [game.id]))[0]
  const meP = (await q('select id from players where user_id = $1 and game_id = $2', [turnUid, game.id]))[0]
  ok(gl.verse_pending_by === meP.id, 'after a word the game waits for its verse')
  ok((await rpcErr(`select perform_action($1, 'shape_land', '{"biome":"zima","hexes":[{"q":-1,"r":1}]}')`, [game.id])) !== null, 'no second word before the verse')
  await db.query('update players set logos = 0 where game_id = $1', [game.id])
  await db.query('select recompute_turn($1)', [game.id])
  ok((await q('select phase from games where id = $1', [game.id]))[0].phase === 'gods', 'Chaos does not begin while a verse is pending, even with no Logos left')
  await as(otherUid)
  ok((await rpcErr(`select release_verse($1)`, [game.id])) === (otherUid === A ? null : 'Werset dopisuje bóstwo, które przemówiło.'), 'only the god who spoke (or the host) may let the turn go')
  await as(turnUid)
  await db.query(`select edit_log_summary($1, 'I nastała zima na zachodzie.')`, [locked.id])
  ok((await q('select verse_pending_by from games where id = $1', [game.id]))[0].verse_pending_by === null, 'writing the verse frees the turn')
  ok((await q('select phase from games where id = $1', [game.id]))[0].phase === 'chaos', 'and only then the Chaos may begin')
  // back to the Gods phase for the rest of the play
  await db.query(`update games set phase = 'gods' where id = $1`, [game.id])
  await db.query('update players set logos = 20 where game_id = $1', [game.id])
  await db.query('select recompute_turn($1)', [game.id])
  await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = -1 and r = 1`, [game.id])
}

console.log('\n# shaping the land')
g = (await q('select * from games where id = $1', [game.id]))[0]
const actor = (await q('select * from players where id = $1', [g.current_turn_player_id]))[0]
const otherP = (await q('select * from players where game_id = $1 and id <> $2', [game.id, actor.id]))[0]
await as(actor.user_id)
// test-only: give the actor plenty of Logos before each purchase so the turn stays put
const topUp = async () => {
  await db.query('update players set logos = 60 where id = $1', [actor.id])
  await db.query('select release_verse($1)', [game.id])
  await db.query(`select recompute_turn($1)`, [game.id])
}
await topUp()
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 0, r: 0 }, { q: 2, r: 0 }] })])) !== null, 'hexes that do not touch are refused')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'lawa', hexes: [{ q: 0, r: 0 }] })])) !== null, 'unknown biome refused')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }] })])) !== null, 'four hexes refused')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'gory_pustynne', hexes: [{ q: 3, r: -3 }] })])) === null, 'the desert mountains are a terrain the words know')
await topUp()
const shaped = (await q(`select * from perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 0 }] })]))[0]
ok(shaped.logos_delta === -2 && shaped.outcome.hexes.length === 3 && shaped.outcome.hexes[1].from === 'trawa', 'three touching hexes reshaped, the old biomes remembered')
ok((await q(`select count(*)::int as n from hexes where game_id = $1 and biome = 'puszcza' and (q, r) in ((1, -1), (1, 0), (0, 0))`, [game.id]))[0].n === 3, 'the map changed')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'wzgorza', hexes: [{ q: 0, r: 0 }] })])) !== null, 'a terrain without a tile is refused')
await db.query(`update hexes set biome = 'gory_sniezne' where game_id = $1 and q = 0 and r = 2`, [game.id])
ok((await q(`select hex_blocked('gory_sniezne') as b, hex_blocked('bagno') as c`))[0].b === true, 'all three mountain kinds block, a swamp does not')
await db.query(`update hexes set biome = 'trawa', decor = '[]' where game_id = $1 and (q, r) in ((0, 0), (1, 0), (1, -1))`, [game.id])

console.log('\n# fertility, rivers and resources')
{
  const saved = await q('select q, r, biome from hexes where game_id = $1', [game.id])
  const F = async (qq, rr) => (await q('select hex_fertility($1, $2, $3) as f', [game.id, qq, rr]))[0].f
  const setB = async (qq, rr, b) => db.query(`update hexes set biome = $4 where game_id = $1 and q = $2 and r = $3`, [game.id, qq, rr, b])
  const base = (await q(`select fertility_base('trawa') as a, fertility_base('pustynia') as b, fertility_base('gory') as c, fertility_base('dzungla') as d, fertility_base('woda') as e, fertility_base('gory_pustynne') as f, fertility_base('bagno') as g`))[0]
  ok(base.a === 2 && base.b === 0 && base.c === 1 && base.d === 1 && base.e === null && base.f === 0 && base.g === 1, 'base fertility per biome')
  await setB(0, 1, 'woda'); await setB(1, 2, 'woda'); await setB(2, 0, 'woda')
  ok((await F(0, 0)) === 3, 'grass by the water: 2 + 1')
  ok((await F(0, 1)) === null, 'water has no fertility')
  await setB(1, 1, 'pustynia'); await setB(2, 1, 'gory')
  ok((await F(1, 1)) === 1, 'desert by the water: 0 + 1')
  // rivers
  const pour = (path, mouth) => J({ path, mouth })
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 0 }, { q: 1, r: 0 }], { q: 2, r: 0 })])) === 'Rzeka wypływa tylko z góry.', 'a river springs only from a mountain')
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 0 }], { q: 2, r: 0 })])) === 'Rzeka płynie tylko na sąsiednie pole.', 'the channel runs to a neighbour only')
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 1 }, { q: 2, r: 1 }], null)])) === 'Rzeka nie płynie pod górę.', 'no river uphill')
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 1 }], null)])) === 'Rzeka musi dopłynąć do wody albo do innej rzeki.', 'a river must reach water or another river')
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 1 }], { q: 1, r: 0 })])) === 'Ujście musi być wodą.', 'the mouth must be water')
  const river = (await q(`select * from perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 1 }], { q: 2, r: 0 })]))[0]
  ok(river.logos_delta === -3 && river.outcome.mouth_kind === 'water' && river.outcome.length === 1 && river.outcome.mouth.q === 2, 'a river for a flat 3 Logos, ending in the sea')
  const rv = (await q('select * from rivers where id = $1', [river.outcome.river_id]))[0]
  ok(rv.path.length === 2 && rv.mouth_q === 2 && rv.mouth_r === 0 && rv.created_by_player_id === actor.id, 'the river keeps its channel and its mouth')
  ok((await F(1, 1)) === 4, 'a river through the desert: 0 + 3 (the Nile) + 1 water')
  ok((await F(0, 2)) === 2, 'the source mountain drinks too: 0 + 1 river + 1 water')
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }], { q: 0, r: 1 })])) === 'Z tej góry już płynie rzeka.', 'one river per mountain')
  const trib = (await q(`select * from perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 2, r: 1 }, { q: 1, r: 1 }], null)]))[0]
  ok(trib.outcome.mouth_kind === 'river' && (await q('select into_river_id from rivers where id = $1', [trib.outcome.river_id]))[0].into_river_id === river.outcome.river_id, 'a river may end in another river')
  ok((await F(1, 1)) === 4, 'two rivers do not add up')
  // resources
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 1, resource: '🌾' })])) !== null, 'water takes no resource')
  ok((await rpcErr(`select perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 0, resource: '🍕' })])) !== null, 'an unknown resource is refused')
  const rankOf = (total) => (total <= 6 ? -1 : total <= 8 ? 0 : total <= 10 ? 1 : total <= 12 ? 2 : 3)
  ok((await rpcErr(`select perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 0, resource: '🌾', attr: 'wrath' })])) === 'Wybierz: Łaska albo Mądrość.', 'a blessing is Łaska or Mądrość')
  const bless = await rolled(6, `select * from perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 0, resource: '🌾', attr: 'grace' })])
  {
    const o = bless.outcome
    ok(bless.logos_delta === -4 && o.d1 === 6 && o.total === 12 + o.grace && o.bonus === rankOf(o.total) && o.bonus >= 2, `blessed land: 4 Logos, 2k6 ${o.d1}+${o.d2} + Łaska ${o.grace} gives a rank of ${o.bonus}`)
    ok(bless.roll && bless.roll.attr === 'grace' && bless.roll.tier === 'strong' && o.tier === 'strong' && o.score === o.grace && (await F(0, 0)) === 3 + o.bonus && (await q('select resource_bonus from hexes where game_id = $1 and q = 0 and r = 0', [game.id]))[0].resource_bonus === o.bonus, 'the rank feeds the fertility and sits on the field')
  }
  await topUp()
  const cursed = await rolled(1, `select * from perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 0, resource: '💎', attr: 'grace' })])
  ok(cursed.outcome.replaced === '🌾' && cursed.outcome.bonus === -1 && cursed.outcome.tier === 'weak' && cursed.logos_delta === -4 && (await F(0, 0)) === 2, 'a new blessing replaces the resource; a 6- curses the lode (-1) and the Logos is spent')
  ok((await rpcErr(`select perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 0, resource: '🍕' })])) !== null, 'the list of resources is closed')
  await topUp()
  const blessM = await rolled(4, `select * from perform_action($1, 'bless_land', $2::jsonb)`, [game.id, J({ q: 0, r: 2, resource: '⭐', attr: 'wisdom' })])
  ok(blessM.outcome.resource === '⭐' && blessM.outcome.tier === 'mixed' && blessM.outcome.bonus === 0 && (await F(0, 2)) === 2, 'mountains take a resource too; a 7..9 gives a common lode (0)')
  // water drowns a channel, land dries a mouth
  await topUp()
  const drown = (await q(`select * from perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'woda', hexes: [{ q: 1, r: 1 }] })]))[0]
  ok(drown.outcome.rivers_cut.length === 2 && drown.outcome.reroute === null, 'water on the channel cuts both rivers there')
  ok((await q('select path from rivers where id = $1', [river.outcome.river_id]))[0].path.length === 1 && (await q('select mouth_kind, into_river_id from rivers where id = $1', [trib.outcome.river_id]))[0].mouth_kind === 'water', 'the drowned field is the new mouth of both')
  await topUp()
  const dry = (await q(`select * from perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'pustynia', hexes: [{ q: 1, r: 1 }] })]))[0]
  ok(dry.outcome.rivers_cut.every((c) => c.kind === 'dry') && (await q(`select count(*)::int as n from rivers where game_id = $1 and mouth_kind = 'none'`, [game.id]))[0].n === 2, 'land where the mouth was leaves the rivers open')
  // a mountain cuts the river; the same god leads it on at once
  await db.query('delete from rivers where game_id = $1', [game.id])
  await setB(1, 0, 'trawa'); await setB(2, -1, 'woda')
  await topUp()
  const riverA = (await q(`select * from perform_action($1, 'pour_river', $2::jsonb)`, [game.id, pour([{ q: 0, r: 2 }, { q: 1, r: 1 }, { q: 1, r: 0 }], { q: 2, r: -1 })]))[0]
  ok(riverA.outcome.length === 2 && (await F(1, 0)) === 4, 'a longer river: grass with a river by the water is 2 + 1 + 1')
  await topUp()
  const cut = (await q(`select * from perform_action($1, 'shape_land', $2::jsonb) -- keep lock`, [game.id, J({ biome: 'gory', hexes: [{ q: 1, r: 1 }] })]))[0]
  ok(cut.outcome.reroute && cut.outcome.reroute.river_id === riverA.outcome.river_id && cut.outcome.reroute.from.q === 0 && cut.outcome.reroute.from.r === 2, 'a mountain cuts the river; the god may lead it on from the last field above')
  const rvA = (await q('select * from rivers where id = $1', [riverA.outcome.river_id]))[0]
  ok(rvA.path.length === 1 && rvA.mouth_kind === 'none' && rvA.reroute_by === actor.id, 'the river waits, open, for its new bed')
  ok((await F(1, 0)) === 3, 'the fields below the cut lost the river')
  await setB(0, 1, 'trawa'); await setB(-1, 2, 'woda')
  await as(otherP.user_id)
  ok((await rpcErr(`select continue_river($1, $2, $3::jsonb, $4::jsonb)`, [game.id, riverA.outcome.river_id, J([{ q: 0, r: 1 }]), J({ q: -1, r: 2 })])) !== null, 'only the god who raised the mountain leads the river on')
  await as(actor.user_id)
  ok((await rpcErr(`select continue_river($1, $2, $3::jsonb, null)`, [game.id, riverA.outcome.river_id, J([{ q: 0, r: 1 }])])) === 'Rzeka musi dopłynąć do wody albo do innej rzeki.', 'the new bed must reach water or a river too')
  const cont = (await q(`select * from continue_river($1, $2, $3::jsonb, $4::jsonb)`, [game.id, riverA.outcome.river_id, J([{ q: 0, r: 1 }]), J({ q: -1, r: 2 })]))[0]
  ok(cont.mouth_kind === 'water' && cont.path.length === 2 && cont.reroute_by === null && cont.mouth_q === -1, 'the river found a new bed')
  ok((await q('select outcome from actions_log where id = $1', [cut.id]))[0].outcome.rerouted.river_id === riverA.outcome.river_id, 'the word remembers the new bed')
  await db.query('select release_verse($1)', [game.id])
  await db.query(`update rivers set mouth_kind = 'none', reroute_by = $2 where id = $1`, [riverA.outcome.river_id, actor.id])
  ok((await rpcErr(`select continue_river($1, $2, $3::jsonb, $4::jsonb)`, [game.id, riverA.outcome.river_id, J([]), J({ q: -1, r: 2 })])) === 'Nowe koryto wyklikuje się zaraz po Kształtowaniu Lądów.', 'after the verse the river no longer waits')
  // a flood that drowns a field cuts the river there too
  await db.query(`update rivers set mouth_kind = 'water', mouth_q = -1, mouth_r = 2, reroute_by = null where id = $1`, [riverA.outcome.river_id])
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'catastrophe', $2::jsonb)`, [game.id, J({ type: 'tsunami', q: 0, r: 1, attr: 'element' })])) === 'Kataklizm to teraz Piorun, Potop, Deszcz Ognia, Susza albo Plaga.', 'the old Kataklizm is gone')
  const flood = await rolled(6, `select * from perform_action($1, 'flood', $2::jsonb)`, [game.id, J({ q: 0, r: 1, attr: 'element' })])
  ok(flood.logos_delta === -4 && flood.outcome.drowned === true && flood.outcome.biome_after === 'woda' && flood.outcome.rivers_cut.length === 1 && (await q('select path from rivers where id = $1', [riverA.outcome.river_id]))[0].path.length === 1, 'a flood on 10+ drowns the field (6 Logos) and shortens the river')
  ok((await q('select biome from hexes where game_id = $1 and q = 0 and r = 1', [game.id]))[0].biome === 'woda', 'the drowned field is water for good')
  // back to the map the rest of the play expects
  await db.query('delete from rivers where game_id = $1', [game.id])
  await db.query('update hexes set resource = null, resource_bonus = 1 where game_id = $1', [game.id])
  for (const h of saved) await setB(h.q, h.r, h.biome)
  await topUp()
}

console.log('\n# life on the map')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Manule' }, emoji: '🐱', q: 0, r: 0, attr: 'grace' })])) !== null, 'the old Stworzenie Istoty is gone')
ok((await rpcErr(`select perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Manule', traits: ['Łagodne'] }, q: 0, r: 0, attr: 'grace' })])) !== null, 'a creature needs an emoji')
const creature = await rolled(5, `select * from perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Manule', traits: ['Łagodne'] }, emoji: '🐱', q: 0, r: 0, attr: 'grace' })])
ok(creature.logos_delta === -10 && creature.entity_id && creature.outcome.slot === 0, 'herd created for 10 logos in slot 0')
ok((await rpcErr(`select perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Drugie Manule', traits: ['Łagodne'] }, emoji: '🐱', q: 1, r: 0, attr: 'grace' })])) !== null, 'the same emoji twice is refused')
await topUp()
const sapient = await rolled(4, `select * from perform_action($1, 'create_sapient', $2::jsonb)`, [game.id, J({ entity: { name: 'Sowy', traits: ['Rozumne', 'Nocne'] }, emoji: '🦉', q: 0, r: 0, attr: 'majesty' })])
ok(sapient.logos_delta === -15 && sapient.outcome.slot === 1 && sapient.outcome.tier === 'mixed', 'sapient creature costs 15 and takes the next slot')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1', [sapient.entity_id]))[0].n === 1, 'on 7..9 the tribe takes one field')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Myszy', traits: ['Płochliwe'] }, emoji: '🐭', q: 0, r: 0, attr: 'grace' })])) === 'Na tym heksie żyje już stado.', 'one herd per hex: the top-left slot is taken')
ok((await rpcErr(`select perform_action($1, 'create_beast', $2::jsonb)`, [game.id, J({ entity: { name: 'Wilki' }, emoji: '🐺', q: 0, r: 0, attr: 'wrath' })])) === 'Na tym heksie jest już bestia albo plemię.', 'a beast shares the bottom slot with the tribe: refused')
ok((await rpcErr(`select perform_action($1, 'create_beast', $2::jsonb)`, [game.id, J({ entity: { name: 'Wilki' }, emoji: '🐺', q: 1, r: 0, attr: 'grace' })])) === 'Wybierz: Gniew albo Żywioł.', 'a beast is Gniew or Żywioł')
ok((await rpcErr(`select perform_action($1, 'create_beast', $2::jsonb)`, [game.id, J({ entity: { name: 'Wilki' }, emoji: '🐺', q: 1, r: 0 })])) === 'Wybierz: Gniew albo Żywioł.', 'a rolled word needs its attribute')
const third = await rolled(6, `select * from perform_action($1, 'create_beast', $2::jsonb)`, [game.id, J({ entity: { name: 'Wilki' }, emoji: '🐺', q: 1, r: 0, attr: 'wrath' })])
{
  const o = third.outcome
  const expected = o.total <= 6 ? -1 : o.total <= 8 ? 0 : o.total <= 10 ? 1 : o.total <= 12 ? 2 : 3
  ok(o.slot === 1 && o.diet === 'carnivore' && o.total === o.d1 + o.d2 + o.wrath && o.strength === expected, `a beast takes the bottom slot; its strength ${o.strength} comes from 2k6 ${o.d1}+${o.d2} + Gniew ${o.wrath}`)
  ok(third.roll && third.roll.total === o.total && third.roll.attr === 'wrath' && third.roll.tier === 'strong' && o.score === o.wrath, 'the strength roll is on the row for the dice window')
  const row = (await q('select diet, strength from entities where id = $1', [third.entity_id]))[0]
  ok(row.diet === 'carnivore' && row.strength === o.strength, 'diet and strength stored on the creature')
  ok((await q('select diet, strength from entities where id = $1', [creature.entity_id]))[0].diet === 'herbivore' && (await q(`select creature_role(e) as r from entities e where id = $1`, [creature.entity_id]))[0].r === 'herbivore', 'a creature without a choice is a herd')
  {
    const o = creature.outcome
    const expected = o.total <= 6 ? -1 : o.total <= 8 ? 0 : o.total <= 10 ? 1 : o.total <= 12 ? 2 : 3
    ok(o.role === 'herbivore' && o.total === o.d1 + o.d2 + o.grace && o.strength === expected && creature.roll.attr === 'grace', `a herd's rank ${o.strength} comes from 2k6 ${o.d1}+${o.d2} + Łaska ${o.grace}`)
    ok((await q('select hex_herd_bonus($1, 0, 0) as b', [game.id]))[0].b === o.strength, 'the herd lends its rank to the field it grazes on')
  }
  ok((await q(`select creature_role(e) as r from entities e where id = $1`, [sapient.entity_id]))[0].r === 'tribe', 'a sapient without a city is a tribe')
}
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Ośmiornice', traits: ['Wodne'] }, emoji: '🐙', q: 2, r: -2, attr: 'grace' })])) !== null, 'nothing lives on water')
ok((await rpcErr(`select perform_action($1, 'create_sapient', $2::jsonb)`, [game.id, J({ entity: { name: 'Górale', traits: ['Rozumne'] }, emoji: '🧝', q: 0, r: 2, attr: 'majesty' })])) !== null, 'a tribe does not live in the mountains')
// a failed word: the Logos is spent, nothing appears, the sign stays free
{
  const before = (await q('select logos from players where id = $1', [actor.id]))[0].logos
  const miss = await rolled(1, `select * from perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Kozice', traits: [] }, emoji: '🐐', q: 0, r: 2, attr: 'grace' })])
  ok(miss.logos_delta === -10 && miss.entity_id === null && miss.outcome.tier === 'weak' && miss.outcome.created === false && (await q('select logos from players where id = $1', [actor.id]))[0].logos === before - 10, 'a 6- spends the Logos and makes nothing')
  ok((await q(`select count(*)::int as n from entities where game_id = $1 and emoji = '🐐'`, [game.id]))[0].n === 0, 'the sign of a failed creature stays free')
  await topUp()
}
const goats = await rolled(4, `select * from perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Kozice', traits: [] }, emoji: '🐐', q: 0, r: 2, attr: 'grace' })])
ok(goats.outcome.biome === 'gory_sniezne' && goats.outcome.slot === 0, 'a herd may live in the mountains')
await topUp()
const octopus = await rolled(4, `select * from perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ entity: { name: 'Ośmiornice', traits: ['Wodne'] }, emoji: '🐙', q: 0, r: 3, attr: 'grace' })])
ok(octopus.outcome.biome === 'trawa', 'creatures settle on land')
await topUp()
ok((await rpcErr(`select perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: 0, r: 0 } })])) !== null, 'migration needs a different hex')
ok((await rpcErr(`select perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: 2, r: -2 } })])) !== null, 'no migration onto water')
// Migracja throws no dice: the kind simply moves, 1 Logos a field
{
  const move = (await q(`select * from perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: -1, r: 1 } })]))[0]
  const where = await q('select q, r from hex_occupants where entity_id = $1', [sapient.entity_id])
  ok(move.logos_delta === -4 && move.outcome.distance === 1 && move.roll === null && move.outcome.tier === undefined, 'migration costs 3 plus its distance (1 hex) and throws no dice')
  ok(move.outcome.moved === true && move.outcome.mode === 'free' && where.length === 1 && where[0].q === -1 && where[0].r === 1, 'the kind moves and leaves its old field')
  await topUp()
  const back = (await q(`select * from perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: -1, r: 1 }, to: { q: 0, r: 0 } })]))[0]
  ok(back.outcome.moved === true && (await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = 0', [sapient.entity_id]))[0].n === 1, 'and moves back the same way')
  await topUp()
  // a beast walking onto a tribe fights it at once by the rules of the night (both 2k6 + strength; the tribe has none)
  const wolfOcc = (await q('select * from hex_occupants where entity_id = $1', [third.entity_id]))[0]
  const tribeOcc = (await q('select * from hex_occupants where entity_id = $1', [sapient.entity_id]))[0]
  const attack = await rolled(6, `select * from perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: third.entity_id, from: { q: wolfOcc.q, r: wolfOcc.r }, to: { q: 0, r: 0 } })])
  {
    const f = attack.outcome.fight
    ok(attack.outcome.mode === 'fight' && f && f.scene === 'creature' && f.diff === third.outcome.strength && f.loser === 'right', `the beast attacks the tribe: equal dice, the difference is its strength (${f?.diff})`)
    ok(attack.roll && attack.roll.att.total === 12 + third.outcome.strength && attack.roll.def.total === 12, 'both rolls are on the row for the dice window')
    ok((await q('select q, r from hex_occupants where id = $1', [wolfOcc.id]))[0].q === 0 && (f.result === 'flee' || f.result === 'eaten' || f.result === 'fled_nowhere'), `the beast takes the field, the tribe ${f.result === 'eaten' ? 'is eaten' : 'flees'}`)
  }
  // undo for the tests below: the wolves go home, the tribe returns
  await db.query('update hex_occupants set q = $2, r = $3, slot = 1 where id = $1', [wolfOcc.id, wolfOcc.q, wolfOcc.r])
  await db.query(`update entities set status = 'active' where id = $1`, [sapient.entity_id])
  await db.query('delete from hex_occupants where entity_id = $1', [sapient.entity_id])
  await db.query('insert into hex_occupants (id, game_id, q, r, slot, entity_id) values ($1, $2, 0, 0, 1, $3)', [tribeOcc.id, game.id, sapient.entity_id])
  await topUp()
}
// Zmiana Istoty edits the kind itself: its name, its sign, its description, everywhere it lives
const owlOcc = (await q('select * from hex_occupants where entity_id = $1 and q = 0 and r = 0', [sapient.entity_id]))[0]
ok((await rpcErr(`select perform_action($1, 'change_creature', $2::jsonb)`, [game.id, J({ occupant_id: owlOcc.id, entity: {}, attr: 'element' })])) === 'Zmień nazwę, znak albo opis istoty.', 'a change needs something to change')
{
  const miss = await rolled(1, `select * from perform_action($1, 'change_creature', $2::jsonb)`, [game.id, J({ occupant_id: owlOcc.id, entity: { name: 'Nikt' }, emoji: '🦆', attr: 'element' })])
  ok(miss.logos_delta === -5 && miss.outcome.changed === false && (await q('select name, emoji from entities where id = $1', [sapient.entity_id]))[0].name === 'Sowy', 'on 6- the kind stays itself and the Logos is spent')
  await topUp()
}
const variant = await rolled(4, `select * from perform_action($1, 'change_creature', $2::jsonb)`, [game.id, J({ occupant_id: owlOcc.id, entity: { name: 'Sowy Morskie', description: 'Nurkują.' }, emoji: '🦆', attr: 'element' })])
ok(variant.logos_delta === -5 && variant.entity_id === sapient.entity_id && variant.outcome.changed === true, 'the change is written on the kind itself, not on a new creature')
{
  const e = (await q('select name, emoji, description, strength from entities where id = $1', [sapient.entity_id]))[0]
  ok(e.name === 'Sowy Morskie' && e.emoji === '🦆' && e.description === 'Nurkują.' && e.strength === 0, 'name, sign and description changed; a tribe gains no strength')
  ok((await q('select entity_id from hex_occupants where id = $1', [owlOcc.id]))[0].entity_id === sapient.entity_id, 'the kind keeps its field')
}
// a stronger kind on 10+, and multiplication onto a chosen field next door
{
  await topUp()
  const wolfOcc = (await q('select * from hex_occupants where entity_id = $1', [third.entity_id]))[0]
  const fiercer = await rolled(6, `select * from perform_action($1, 'change_creature', $2::jsonb)`, [game.id, J({ occupant_id: wolfOcc.id, entity: { name: 'Wargi' }, attr: 'whisper' })])
  ok(fiercer.outcome.tier === 'strong' && fiercer.outcome.strength === Math.min(3, third.outcome.strength + 1) && (await q('select strength, name, emoji from entities where id = $1', [third.entity_id]))[0].strength === fiercer.outcome.strength, 'on 10+ the kind grows one stronger')
  ok((await q('select name, emoji from entities where id = $1', [third.entity_id]))[0].emoji === '🐺', 'a change without a new sign keeps the old one')
  await db.query('update entities set strength = $2, name = $3 where id = $1', [third.entity_id, third.outcome.strength, 'Wilki'])
  await topUp()
  // the herd at (0,0) multiplies onto a chosen free field next door
  const herdOcc = (await q('select * from hex_occupants where entity_id = $1', [creature.entity_id]))[0]
  const freeAround = async () => await q(`select n.q, n.r from hex_neighbours($2, $3) n where night_enterable($1, n.q, n.r, $4, 'herbivore') = 'free' order by n.q, n.r`, [game.id, herdOcc.q, herdOcc.r, creature.entity_id])
  const free = await freeAround()
  ok(free.length >= 3, `the herd has room around it (${free.length} free fields)`)
  ok((await rpcErr(`select perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: herdOcc.id, to: free[0], attr: 'wrath' })])) === 'Wybierz: Łaska albo Żywioł.', 'multiplication is Łaska or Żywioł')
  ok((await rpcErr(`select perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: herdOcc.id, to: { q: 0, r: 3 }, attr: 'grace' })])) === 'Kopia staje na polu sąsiadującym z istotą.', 'the copy stands next door only')
  ok((await rpcErr(`select perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: owlOcc.id, to: { q: 1, r: 0 }, attr: 'grace' })])) === 'Na tym polu nie ma miejsca dla tych istot.', 'no copy of a tribe where a beast holds the bottom of the field')
  const strengthBefore = (await q('select strength from entities where id = $1', [creature.entity_id]))[0].strength
  const one = await rolled(6, `select * from perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: herdOcc.id, to: free[0], attr: 'grace' })])
  ok(one.logos_delta === -5 && one.outcome.tier === 'strong' && one.outcome.count === 1 && one.entity_id === creature.entity_id && one.outcome.weakened === false, 'Rozmnożenie for 5 Logos: on 10+ a copy on the chosen field')
  ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = $2 and r = $3', [creature.entity_id, free[0].q, free[0].r]))[0].n === 1 && (await q('select strength from entities where id = $1', [creature.entity_id]))[0].strength === strengthBefore, 'the copy stands where it was told; the kind is as strong as before')
  await topUp()
  const weak = await rolled(3, `select * from perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: herdOcc.id, to: free[1], attr: 'grace' })])
  ok(weak.outcome.tier === 'mixed' && weak.outcome.count === 1 && weak.outcome.weakened === true && (await q('select strength from entities where id = $1', [creature.entity_id]))[0].strength === Math.max(-1, strengthBefore - 1), 'on 7..9 a copy, but the kind weakens by one')
  await topUp()
  const none = await rolled(1, `select * from perform_action($1, 'multiply', $2::jsonb)`, [game.id, J({ occupant_id: herdOcc.id, to: free[2], attr: 'grace' })])
  ok(none.logos_delta === -5 && none.outcome.count === 0 && (await q('select count(*)::int as n from hex_occupants where entity_id = $1', [creature.entity_id]))[0].n === 3, 'on 6- nobody is born, the Logos is spent')
  // back to one herd for the tests below
  await db.query('delete from hex_occupants where entity_id = $1 and id <> $2', [creature.entity_id, herdOcc.id])
  await db.query('update entities set strength = $2 where id = $1', [creature.entity_id, strengthBefore])
  await topUp()
}

console.log('\n# cities')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Kocia Rada', traits: ['Zachowawcza'] }, q: 0, r: 0, species_id: creature.entity_id, attr: 'wisdom' })])) !== null, 'a plain creature founds no city')
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Sowy Morskie', traits: [] }, q: 2, r: -2, species_id: variant.entity_id, attr: 'wisdom' })])) !== null, 'no city on water')
{
  const miss = await rolled(1, `select * from perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Nikt' }, q: 0, r: 0, species_id: sapient.entity_id, attr: 'wisdom' })])
  ok(miss.logos_delta === -22 && miss.entity_id === null && (await q('select count(*)::int as n from cities where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n === 0, 'on 6- the people do not settle, the Logos is spent')
  await topUp()
}
const civ = await rolled(4, `select * from perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Stoicy', traits: ['Zachowawcza'], specialties: ['Rolnictwo'], flaws: ['Magia'] }, q: 0, r: 0, species_id: sapient.entity_id, attr: 'wisdom' })])
ok(civ.logos_delta === -22 && civ.outcome.q === 0 && civ.outcome.tier === 'mixed', 'civilization founded for 22 in era I')
ok((await q('select count(*)::int as n from cities where entity_id = $1 and q = 0 and r = 0', [civ.entity_id]))[0].n === 1, 'the city stands on its hex')
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 1, 'one dot of the founding god')
const links = await q('select * from entity_links where from_entity_id = $1', [civ.entity_id])
ok(links.length === 1 && links[0].relation === 'member_species', 'civilization linked to its species')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Drugie', traits: [] }, q: 0, r: 0, species_id: sapient.entity_id, attr: 'wisdom' })])) !== null, 'one city per hex')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'woda', hexes: [{ q: 0, r: 0 }] })])) !== null, 'a city cannot be drowned by shaping')
// the words of the avatar need one on the map: the god's hand stands a step from the city
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: 'Ogień' })])) === 'To słowo wypowiada twój awatar: najpierw go ześlij.', 'development is a word of the avatar: none on the map, no gift')
const [hand] = await q(`insert into entities (game_id, kind, name, emoji, hp, max_hp, created_by_player_id) values ($1, 'avatar', 'Ręka Rzeki', '🫳', 2, 2, $2) returning id`, [game.id, actor.id])
await db.query(`insert into entity_gods (entity_id, player_id, game_id, role) values ($1, $2, $3, 'creator')`, [hand.id, actor.id, game.id])
await db.query(`insert into hex_occupants (game_id, q, r, slot, entity_id) values ($1, 0, -1, 2, $2)`, [game.id, hand.id])
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'grace', gift: 'Ogień' })])) === 'Wybierz: Mądrość albo Podszept.', 'development is Mądrość or Podszept')
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: '  ' })])) !== null, 'a gift needs words')
await db.query('update hex_occupants set q = -1, r = 4 where entity_id = $1', [hand.id])
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: 'Ogień' })])) === 'Awatar sięga najwyżej dwa heksy od miasta. Najpierw wyślij go na Pielgrzymkę.', 'the avatar must stand at most two fields from the city')
await db.query('update hex_occupants set q = 0, r = -1 where entity_id = $1', [hand.id])
const dev = (await q(`select * from perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: 'Ogień' })]))[0]
ok(dev.outcome.avatar && dev.outcome.avatar.id === hand.id && (await q('select q, r from hex_occupants where entity_id = $1', [hand.id]))[0].q === 0 && (await q('select q, r from hex_occupants where entity_id = $1', [hand.id]))[0].r === -1, 'the gift is given by the avatar, which stays where it stood')
{
  const o = dev.outcome
  const expected = o.total >= 10 ? 2 : o.total >= 7 ? 1 : 0
  ok(dev.logos_delta === -12 && o.total === o.d1 + o.d2 + o.score && o.gained === expected && o.added === expected, `development rolled ${o.d1}+${o.d2}+${o.score}: ${o.gained} dot(s)`)
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 1 + o.added, 'dots grew by what was added')
  const gift = (await q('select * from city_gifts where city_id = $1', [civ.entity_id]))[0]
  ok(gift.text === 'Ogień' && gift.accepted === (o.gained > 0) && gift.dots_gained === o.added, 'the gift is remembered by the city')
}
await db.query('update city_followers set dots = 4 where city_id = $1 and player_id = $2', [civ.entity_id, actor.id])
await topUp()
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 5, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Za Dużo', attr: 'whisper' })])) !== null, 'exodus of more dots than owned refused')
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 0, r: 2 }, name: 'W Górach', attr: 'whisper' })])) !== null, 'no exodus into mountains')
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: creature.entity_id, to: { q: 1, r: -1 }, name: 'Kocie', attr: 'whisper' })])) !== null, 'exodus takes a sapient species')
{
  await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = -1 and r = 4`, [game.id])
  await db.query('update hex_occupants set q = -1, r = 4 where entity_id = $1', [hand.id])
  ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Daleko', attr: 'whisper' })])) === 'Awatar sięga najwyżej dwa heksy od miasta, które wyprowadza. Najpierw wyślij go na Pielgrzymkę.', 'an exodus needs the avatar within two fields of the city')
  await db.query('update hex_occupants set q = 0, r = -1 where entity_id = $1', [hand.id])
  const miss = await rolled(1, `select * from perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Nigdzie', attr: 'whisper' })])
  ok(miss.logos_delta === -13 && miss.outcome.left === false && miss.entity_id === null && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 4, 'on 6- nobody leaves; the Logos and the distance are spent')
  ok(miss.outcome.avatar_entered === true && (await q('select q, r from hex_occupants where entity_id = $1', [hand.id]))[0].q === 0 && (await q('select q, r from hex_occupants where entity_id = $1', [hand.id]))[0].r === 0, 'the avatar stepped into the city all the same')
  await topUp()
  const soulsBefore = (await q('select jsonb_array_length(afterlife)::int as n from players where id = $1', [actor.id]))[0].n
  const hard = await rolled(4, `select * from perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Krwawy Szlak', attr: 'whisper' })])
  const hardCity = (await q('select * from entities where id = $1', [hard.entity_id]))[0]
  ok(hard.outcome.tier === 'mixed' && hard.outcome.lost === 1 && hard.outcome.dots === 1 && (await q('select player_dots($1, $2) as d', [hardCity.id, actor.id]))[0].d === 1, 'on 7..9 one dies on the road and the rest found the city')
  ok(hard.outcome.avatar_entered === false && hard.outcome.avatar_moved === true && (await q('select q, r from hex_occupants where entity_id = $1', [hand.id]))[0].q === 1, 'the avatar already stood in the city; it walks with the people to the new one')
  await db.query('update hex_occupants set q = 0, r = -1, slot = 2 where entity_id = $1', [hand.id])
  ok((await q('select jsonb_array_length(afterlife)::int as n from players where id = $1', [actor.id]))[0].n === soulsBefore + 1, 'the fallen one is a soul in the afterlife')
  ok((await q('select count(*)::int as n from city_gifts where city_id = $1', [hardCity.id]))[0].n === 0 && hard.outcome.gifts_inherited === false, 'no gifts travel on a hard road')
  // undo for the tests below: the people come home, the camp is forgotten
  await db.query('delete from city_followers where city_id = $1', [hardCity.id])
  await db.query('delete from cities where entity_id = $1', [hardCity.id])
  await db.query('delete from entities where id = $1', [hardCity.id])
  await db.query('delete from hex_occupants where entity_id = $1 and q = 1 and r = -1', [sapient.entity_id])
  await db.query('update city_followers set dots = 4 where city_id = $1 and player_id = $2', [civ.entity_id, actor.id])
  await topUp()
}
const exo = await rolled(6, `select * from perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Nowe Sowiska', description: 'Wyszli nocą.', attr: 'whisper' })])
ok(exo.logos_delta === -13 && exo.outcome.new === true && exo.outcome.distance === 1 && exo.outcome.tier === 'strong', 'exodus one hex away costs 12 plus 1 and founds a city')
const newCity = (await q('select * from entities where id = $1', [exo.entity_id]))[0]
ok(newCity.name === 'Nowe Sowiska' && newCity.traits.join() === 'Zachowawcza' && newCity.parent_civilization_id === civ.entity_id, 'the new city inherits the traits of the mother city')
ok((await q('select player_dots($1, $2) as d', [newCity.id, actor.id]))[0].d === 2 && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 2, 'two dots moved, two stayed')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 1 and r = -1', [sapient.entity_id]))[0].n === 1, 'the species settled on the new hex')
ok((await q('select count(*)::int as n from city_gifts where city_id = $1', [newCity.id]))[0].n === (dev.outcome.gained > 0 ? 1 : 0), 'accepted gifts travel with the people')

console.log('\n# cataclysms: fire rain, lightning, flood, drought, plague')
await topUp()
const dotsBefore = (await q('select city_dots($1) as d', [civ.entity_id]))[0].d
const occBefore = (await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n
const soulsBefore = Object.fromEntries((await q('select id, jsonb_array_length(afterlife)::int as n from players where game_id = $1', [game.id])).map((r) => [r.id, r.n]))
ok((await rpcErr(`select perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 2, r: -2, attr: 'wrath' })])) === 'Ogień nie spadnie na wodę.', 'fire rain needs land')
ok((await rpcErr(`select perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 0, r: 0, attr: 'grace' })])) === 'Wybierz: Gniew albo Żywioł.', 'a cataclysm is Gniew or Żywioł')
{
  // a 6-: the fire dies in the air and touches nothing
  const miss = await rolled(1, `select * from perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 0, r: 0, attr: 'wrath' })])
  ok(miss.logos_delta === -6 && miss.outcome.tier === 'weak' && miss.outcome.damage === 0 && miss.outcome.hits.length === 0 && miss.outcome.biome_after === null, 'a failed fire rain wounds nobody and costs 6')
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === dotsBefore && (await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n === occBefore, 'the city and the field are untouched')
  await topUp()
  // a 7..9: three blows; an empty field burnt to the ground is a wasteland
  await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = 0 and r = 4`, [game.id])
  const half = await rolled(4, `select * from perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 0, r: 4, attr: 'wrath' })])
  ok(half.outcome.tier === 'mixed' && half.outcome.total === 7 && half.outcome.damage === 3 && half.outcome.wasted === 3 && half.outcome.biome_after === 'ziemia' && (await q('select biome from hexes where game_id = $1 and q = 0 and r = 4', [game.id]))[0].biome === 'ziemia', 'on 7..9 three blows fall; with nothing left alive the land is a wasteland')
  await topUp()
}
const cat = await rolled(6, `select * from perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 0, r: 0, attr: 'wrath' })])
{
  const o = cat.outcome
  ok(cat.logos_delta === -6 && o.tier === 'strong' && o.attr === 'wrath' && o.total === o.d1 + o.d2 + o.score && o.damage === 6, `fire rain: 2k6 ${o.d1} + ${o.d2} + Gniew ${o.score} = ${o.total}, six blows`)
  const dotsByGod = {}
  for (const h of o.hits.filter((h) => h.t === 'dot')) dotsByGod[h.player_id] = (dotsByGod[h.player_id] ?? 0) + 1
  const soulsAfter = Object.fromEntries((await q('select id, jsonb_array_length(afterlife)::int as n from players where game_id = $1', [game.id])).map((r) => [r.id, r.n]))
  ok(Object.keys(soulsBefore).every((id) => soulsAfter[id] === soulsBefore[id] + (dotsByGod[id] ?? 0)), 'every fallen follower is a soul in its god\'s afterlife')
  if (Object.keys(dotsByGod).length) {
    const first = Object.keys(dotsByGod)[0]
    const souls = (await q('select afterlife from players where id = $1', [first]))[0].afterlife
    ok(souls[souls.length - 1] === (await q('select emoji from entities where id = $1', [sapient.entity_id]))[0].emoji, "the soul wears the sign of the city's people")
  }
  const left = (await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n + (o.city_destroyed ? 0 : 1)
  const biomeNow = (await q('select biome from hexes where game_id = $1 and q = 0 and r = 0', [game.id]))[0].biome
  ok(left === 0 ? biomeNow === 'ziemia' && o.biome_after === 'ziemia' : biomeNow !== 'ziemia' && o.biome_after === null, `the land turns to a wasteland only when nothing is left (${left} left, biome ${biomeNow})`)
  ok(o.hits.length <= o.damage && o.hits.length + o.wasted === o.damage, `${o.hits.length} hit(s), ${o.wasted} wasted`)
  const dotHits = o.hits.filter((h) => h.t === 'dot').length
  const creatureHits = o.hits.filter((h) => h.t === 'creature').length
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === dotsBefore - dotHits, 'each dot hit removed one dot')
  ok((await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n === occBefore - creatureHits, 'each creature hit emptied one slot')
  const sapientHit = o.hits.some((h) => h.t === 'creature' && h.entity_id === sapient.entity_id)
  ok(!sapientHit || o.city_destroyed, 'sapients are spared while the city stands')
  ok(o.city_destroyed === ((await q('select count(*)::int as n from cities where entity_id = $1', [civ.entity_id]))[0].n === 0), 'a city with no dots left is a ruin')
}
// restore a deterministic state for the words below
const restoreCity = async () => {
  await db.query('delete from city_followers where city_id = $1', [civ.entity_id])
  await db.query(`update entities set status = 'active' where id = $1 or (game_id = $2 and kind = 'creature')`, [civ.entity_id, game.id])
  await db.query(`insert into cities (entity_id, game_id, q, r) values ($1, $2, 0, 0) on conflict do nothing`, [civ.entity_id, game.id])
  await db.query(`insert into hex_occupants (game_id, q, r, slot, entity_id) select $1, 0, 0, hex_slot_for($1, 0, 0, $2), $2 where not exists (select 1 from hex_occupants where entity_id = $2 and q = 0 and r = 0)`, [game.id, sapient.entity_id])
  await db.query(`insert into hex_occupants (game_id, q, r, slot, entity_id) select $1, 0, 0, 0, $2 where not exists (select 1 from hex_occupants where entity_id = $2)`, [game.id, creature.entity_id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3), ($1, $5, $4, 2) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])
  await db.query(`update hexes set biome = 'trawa', drought_rounds = 0, plague_rounds = 0 where game_id = $1 and q = 0 and r = 0`, [game.id])
  await topUp()
}
await restoreCity()
{
  // Piorun: a beast, a herd or an avatar; 10+ two blows, 7..9 one, 6- a miss
  const wolfOcc = (await q('select * from hex_occupants where entity_id = $1', [third.entity_id]))[0]
  const tribeOcc = (await q('select * from hex_occupants where entity_id = $1 limit 1', [sapient.entity_id]))[0]
  ok((await rpcErr(`select perform_action($1, 'lightning', $2::jsonb)`, [game.id, J({ occupant_id: tribeOcc.id, attr: 'wrath' })])) === 'Piorun trafia bestię, stado albo awatara, nie lud.', 'a bolt never strikes a people')
  const miss = await rolled(1, `select * from perform_action($1, 'lightning', $2::jsonb)`, [game.id, J({ occupant_id: wolfOcc.id, attr: 'wrath' })])
  ok(miss.logos_delta === -1 && miss.outcome.hit === false && miss.outcome.damage === 0 && (await q('select count(*)::int as n from hex_occupants where id = $1', [wolfOcc.id]))[0].n === 1, 'Piorun for 1 Logos; on 6- it misses')
  await topUp()
  const bolt = await rolled(5, `select * from perform_action($1, 'lightning', $2::jsonb)`, [game.id, J({ occupant_id: wolfOcc.id, attr: 'element' })])
  ok(bolt.outcome.tier === 'strong' && bolt.outcome.damage === 2 && bolt.outcome.killed === true && bolt.outcome.extinct === true && (await q('select count(*)::int as n from hex_occupants where id = $1', [wolfOcc.id]))[0].n === 0 && (await q('select status from entities where id = $1', [third.entity_id]))[0].status === 'dead', 'a bolt on 10+ (5+5 + Żywioł 1) kills the only pack of the beast')
  await db.query(`update entities set status = 'active' where id = $1`, [third.entity_id])
  await db.query('insert into hex_occupants (id, game_id, q, r, slot, entity_id) values ($1, $2, $3, $4, 1, $5)', [wolfOcc.id, game.id, wolfOcc.q, wolfOcc.r, third.entity_id])
  await topUp()
  const handOcc = (await q('select * from hex_occupants where entity_id = $1', [hand.id]))[0]
  const graze = await rolled(4, `select * from perform_action($1, 'lightning', $2::jsonb)`, [game.id, J({ occupant_id: handOcc.id, attr: 'wrath' })])
  ok(graze.outcome.tier === 'mixed' && graze.outcome.damage === 1 && graze.outcome.role === 'avatar' && graze.outcome.hp === 1 && graze.outcome.killed === false && (await q('select hp from entities where id = $1', [hand.id]))[0].hp === 1, 'on 7..9 one blow: the avatar loses one life')
  await db.query('update entities set hp = 2 where id = $1', [hand.id])
  await topUp()
}
{
  // Potop on 7..9: three blows, the land stays
  await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = 0 and r = 4`, [game.id])
  const wet = await rolled(4, `select * from perform_action($1, 'flood', $2::jsonb)`, [game.id, J({ q: 0, r: 4, attr: 'wrath' })])
  ok(wet.outcome.tier === 'mixed' && wet.outcome.drowned === false && wet.outcome.damage === 3 && wet.outcome.wasted === 3 && wet.outcome.biome_after === null && (await q('select biome from hexes where game_id = $1 and q = 0 and r = 4', [game.id]))[0].biome === 'trawa', 'on 7..9 the waters take three and recede; the land stays')
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'flood', $2::jsonb)`, [game.id, J({ q: 2, r: -2, attr: 'wrath' })])) === 'Wody nie da się zatopić.', 'water cannot be drowned')
}
{
  // Susza: barren land for three nights (10+) or two (7..9); the herd grazing there dies every night
  const octOcc = (await q('select * from hex_occupants where entity_id = $1', [octopus.entity_id]))[0]
  const fertBefore = (await q('select hex_fertility($1, 0, 3) as f', [game.id]))[0].f
  const dry = await rolled(6, `select * from perform_action($1, 'drought', $2::jsonb)`, [game.id, J({ q: 0, r: 3, attr: 'element' })])
  ok(dry.logos_delta === -1 && dry.outcome.tier === 'strong' && dry.outcome.rounds === 3 && dry.outcome.fertility_before === fertBefore && fertBefore > 0, 'Susza for 3 Logos: three barren nights on 10+')
  ok((await q('select drought_rounds from hexes where game_id = $1 and q = 0 and r = 3', [game.id]))[0].drought_rounds === 3 && (await q('select hex_fertility($1, 0, 3) as f', [game.id]))[0].f === 0, 'the land is barren: Żyzność 0 while the drought lasts')
  await db.query('select night_blights($1)', [game.id])
  ok((await q('select drought_rounds from hexes where game_id = $1 and q = 0 and r = 3', [game.id]))[0].drought_rounds === 2 && (await q('select count(*)::int as n from hex_occupants where id = $1', [octOcc.id]))[0].n === 0, 'a night of drought: the herd dies and one night less remains')
  const nd = (await q(`select outcome from actions_log where action_key = 'night_drought' and game_id = $1 order by created_at desc limit 1`, [game.id]))[0]
  ok(nd && nd.outcome.killed && nd.outcome.killed.entity_id === octopus.entity_id && nd.outcome.rounds_left === 2, 'the night tells which herd starved')
  await db.query(`update hexes set drought_rounds = 0 where game_id = $1`, [game.id])
  await db.query(`update entities set status = 'active' where id = $1`, [octopus.entity_id])
  await db.query('insert into hex_occupants (id, game_id, q, r, slot, entity_id) values ($1, $2, 0, 3, 0, $3)', [octOcc.id, game.id, octopus.entity_id])
  await topUp()
  const dry2 = await rolled(4, `select * from perform_action($1, 'drought', $2::jsonb)`, [game.id, J({ q: 0, r: 3, attr: 'wrath' })])
  ok(dry2.outcome.tier === 'mixed' && dry2.outcome.rounds === 2 && (await q('select drought_rounds from hexes where game_id = $1 and q = 0 and r = 3', [game.id]))[0].drought_rounds === 2, 'on 7..9 two barren nights')
  await db.query(`update hexes set drought_rounds = 0 where game_id = $1`, [game.id])
  await topUp()
  const dry3 = await rolled(1, `select * from perform_action($1, 'drought', $2::jsonb)`, [game.id, J({ q: 0, r: 3, attr: 'wrath' })])
  ok(dry3.outcome.rounds === 0 && (await q('select drought_rounds from hexes where game_id = $1 and q = 0 and r = 3', [game.id]))[0].drought_rounds === 0, 'on 6- the sky clouds over and nothing happens')
  await topUp()
}
{
  // Plaga: two nights (10+) or one (7..9); every night two of the city's people die, or a herd or a beast
  ok((await rpcErr(`select perform_action($1, 'plague', $2::jsonb)`, [game.id, J({ q: 0, r: 4, attr: 'wrath' })])) === 'Plaga potrzebuje żywych: miasta, stada albo bestii.', 'a plague needs someone to infect')
  const sick = await rolled(6, `select * from perform_action($1, 'plague', $2::jsonb)`, [game.id, J({ q: 0, r: 0, attr: 'wrath' })])
  ok(sick.logos_delta === -9 && sick.outcome.tier === 'strong' && sick.outcome.rounds === 2 && sick.outcome.city_id === civ.entity_id && (await q('select plague_rounds from hexes where game_id = $1 and q = 0 and r = 0', [game.id]))[0].plague_rounds === 2, 'Plaga for 9 Logos: two nights of sickness on 10+')
  const popBefore = (await q('select city_dots($1) as d', [civ.entity_id]))[0].d
  await db.query('select night_blights($1)', [game.id])
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === popBefore - 2 && (await q('select plague_rounds from hexes where game_id = $1 and q = 0 and r = 0', [game.id]))[0].plague_rounds === 1, 'a night of plague: two of the people die, one night remains')
  const np = (await q(`select outcome from actions_log where action_key = 'night_plague' and game_id = $1 order by created_at desc limit 1`, [game.id]))[0]
  ok(np && np.outcome.city_id === civ.entity_id && np.outcome.lost.length === 2 && np.outcome.rounds_left === 1, 'the night tells who the plague took')
  await restoreCity()
  // a plague on a herd without a city takes the herd
  const goatOcc = (await q('select * from hex_occupants where entity_id = $1', [goats.entity_id]))[0]
  const sick2 = await rolled(4, `select * from perform_action($1, 'plague', $2::jsonb)`, [game.id, J({ q: goatOcc.q, r: goatOcc.r, attr: 'wrath' })])
  ok(sick2.outcome.tier === 'mixed' && sick2.outcome.rounds === 1 && sick2.outcome.creatures.length === 1, 'on 7..9 one night of sickness')
  await db.query('select night_blights($1)', [game.id])
  ok((await q('select count(*)::int as n from hex_occupants where id = $1', [goatOcc.id]))[0].n === 0 && (await q('select plague_rounds from hexes where game_id = $1 and q = $2 and r = $3', [game.id, goatOcc.q, goatOcc.r]))[0].plague_rounds === 0, 'without a city the plague takes the herd, and it is over')
  await db.query(`update entities set status = 'active' where id = $1`, [goats.entity_id])
  await db.query('insert into hex_occupants (id, game_id, q, r, slot, entity_id) values ($1, $2, $3, $4, 0, $5)', [goatOcc.id, game.id, goatOcc.q, goatOcc.r, goats.entity_id])
  await topUp()
}
await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = 0 and r = 4`, [game.id])
const emptyCat = await rolled(6, `select * from perform_action($1, 'flood', $2::jsonb)`, [game.id, J({ q: 0, r: 4, attr: 'element' })])
ok(emptyCat.outcome.biome_after === 'woda' && (await q('select biome from hexes where game_id = $1 and q = 0 and r = 4', [game.id]))[0].biome === 'woda', 'an empty field drowned on 10+ is water')
await db.query(`select set_afterlife($1, 'Rzeka bez dna.')`, [game.id])
ok((await q('select afterlife_description from players where id = $1', [actor.id]))[0].afterlife_description === 'Rzeka bez dna.', 'a god describes its afterlife')

console.log('\n# avatars on the map')
// the god's hand of the tests above steps aside: the words below name their avatar themselves
await db.query('delete from hex_occupants where entity_id = $1', [hand.id])
await db.query('delete from entity_gods where entity_id = $1', [hand.id])
await db.query('delete from entities where id = $1', [hand.id])
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Na wodzie', conditions: ['a'] }, emoji: '🗿', q: 2, r: -2, attr: 'majesty' })])) !== null, 'an avatar does not stand on water')
{
  const miss = await rolled(1, `select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Nikt' }, emoji: '🗿', q: 0, r: -1, attr: 'majesty' })])
  ok(miss.logos_delta === -10 && miss.entity_id === null && miss.outcome.created === false, 'on 6- the heavens stay silent and the Logos is spent')
  await topUp()
  const hurt = await rolled(4, `select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Ranny' }, emoji: '🗿', q: 0, r: -1, attr: 'majesty' })])
  ok(hurt.outcome.tier === 'mixed' && hurt.outcome.max_hp === 2 && hurt.outcome.hp === 1 && (await q('select hp, max_hp from entities where id = $1', [hurt.entity_id]))[0].hp === 1, 'on 7..9 the avatar comes down wounded: one life short')
  await db.query('delete from hex_occupants where entity_id = $1', [hurt.entity_id])
  await db.query('delete from entities where id = $1', [hurt.entity_id])
  await topUp()
}
const av = await rolled(5, `select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Posąg' }, emoji: '🗿', q: 0, r: -1, attr: 'majesty' })])
ok(av.entity_id !== null && av.outcome.tier === 'strong' && (await q('select hp, max_hp from entities where id = $1', [av.entity_id]))[0].hp === 2 && av.outcome.max_hp === 2, 'a first avatar comes with 2 lives')
await topUp()
ok((await rpcErr(`select perform_action($1, 'command_avatar', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: -1, r: 0 } })])) !== null, 'the old command is gone')
ok((await rpcErr(`select perform_action($1, 'pilgrimage', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: 2, r: -2 } })])) !== null, 'a pilgrimage does not end on water')
const walk = (await q(`select * from perform_action($1, 'pilgrimage', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: -1, r: 0 } })]))[0]
ok(walk.logos_delta === -1 && walk.outcome.distance === 1, 'a pilgrimage of one hex costs 1')
ok((await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === -1, 'the avatar moved')
await topUp()
await db.query(`update hexes set biome = 'trawa' where game_id = $1 and q = -1 and r = 4`, [game.id])
const far = (await q(`select * from perform_action($1, 'pilgrimage', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: -1, r: 4 } })]))[0]
ok(far.logos_delta === -4 && far.outcome.distance === 4, 'a long pilgrimage costs one Logos per hex, with no limit')
await q(`select * from perform_action($1, 'pilgrimage', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: -1, r: 0 } })])
await topUp()
// no half price any more: a word costs what it costs, whoever stands on the map
const viaCreature = await rolled(4, `select * from perform_action($1, 'create_herd', $2::jsonb)`, [game.id, J({ via_avatar_id: av.entity_id, entity: { name: 'Ćmy', traits: ['Nocne'] }, emoji: '🦋', q: -1, r: 4, attr: 'grace' })])
ok(viaCreature.logos_delta === -10 && viaCreature.is_avatar_free_action === false && viaCreature.outcome.via_avatar === undefined, 'a creature costs its full 10 Logos; the avatar is no discount and no reach')
await topUp()
{
  // a failed Great Miracle: the Logos is gone, the world is as it was
  const miss = await rolled(1, `select * from perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, J({ summary: 'Nic.', attr: 'wisdom' })])
  ok(miss.logos_delta === -15 && miss.outcome.happened === false, 'a failed Great Miracle spends 15 Logos')
  await topUp()
}
const free = await rolled(4, `select * from perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, J({ summary: 'Kontynent unosi się.', attr: 'majesty' })])
ok(free.logos_delta === -15 && free.summary === 'Kontynent unosi się.' && free.outcome.with_price === true, 'a Great Miracle costs 15 and keeps the written verse')
ok((await q('select status from entities where id = $1', [av.entity_id]))[0].status === 'active', 'no avatar burns for a Great Miracle any more')
// test-only: the avatar falls, so the resurrection below has someone to raise
await db.query(`update entities set status = 'dead', hp = 0 where id = $1`, [av.entity_id])
await db.query('delete from hex_occupants where entity_id = $1', [av.entity_id])
await topUp()
const res = (await q(`select * from perform_action($1, 'resurrect_avatar', $2::jsonb)`, [game.id, J({ entity: { op: 'update', id: av.entity_id, description: 'Wrócił bez twarzy.' }, q: 0, r: -1 })]))[0]
ok(res.logos_delta === -12 && (await q('select status, hp, max_hp from entities where id = $1', [av.entity_id]))[0].hp === 3 && res.outcome.max_hp === 3, 'resurrected one life stronger: 3 of 3')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = -1', [av.entity_id]))[0].n === 1, 'the avatar returns to a chosen hex')
await topUp()
await db.query(`update entities set status = 'dead', max_hp = 11 where id = $1`, [av.entity_id])
const second = await rolled(5, `select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Drugi' }, emoji: '👼', q: 0, r: -1, attr: 'majesty' })])
ok(second.outcome.max_hp === 12, 'a new incarnation after a death is one life stronger than the last, twelve at most')
await db.query(`update entities set status = 'active', max_hp = 3, hp = 3 where id = $1`, [av.entity_id])
await db.query(`delete from entities where id = $1`, [second.entity_id])
await topUp()
const freeCreature = viaCreature

console.log('\n# the verse belongs to its god')
await db.query(`select edit_log_summary($1, 'I spadły Ćmy z nieba jak popiół.')`, [freeCreature.id])
ok((await q('select summary from actions_log where id = $1', [freeCreature.id]))[0].summary === 'I spadły Ćmy z nieba jak popiół.', 'the acting god rewrites the verse')
await as(otherP.user_id)
ok((await rpcErr(`select edit_log_summary($1, 'Nie moje.')`, [freeCreature.id])) !== null, 'another god cannot')
await as(actor.user_id)
ok((await rpcErr(`select edit_log_summary($1, 'x')`, [free.id])) === null, 'a free action verse too')
const systemRow = (await q(`select id from actions_log where action_key = 'logos_roll' and player_id = $1 limit 1`, [actor.id]))[0]
ok((await rpcErr(`select edit_log_summary($1, 'x')`, [systemRow.id])) !== null, 'system verses stay as the book wrote them')

console.log('\n# free edits: sapient, avatar death, removal')
await db.query(`select edit_entity($1, '{"traits":["Łagodne"]}'::jsonb)`, [creature.entity_id])
ok((await q('select traits from entities where id = $1', [creature.entity_id]))[0].traits.join() === 'Łagodne', 'traits patched')
await db.query(`select edit_entity($1, $2::jsonb)`, [civ.entity_id, J({ name: 'Stoicy Znad Rzeki', description: 'Liczą pory roku po barwie wody.', specialties: ['Rolnictwo', 'Handel'], flaws: ['Magia', 'Ziemia'] })])
const civRow = (await q('select * from entities where id = $1', [civ.entity_id]))[0]
ok(civRow.name === 'Stoicy Znad Rzeki' && civRow.specialties.length === 2 && civRow.flaws.join() === 'Magia,Ziemia', 'full edit: name, description, specialties, flaws')
ok((await rpcErr(`select edit_entity($1, '{"status":"dead"}'::jsonb)`, [octopus.entity_id])) !== null, 'death only for avatars')
await topUp()
const moth = (await q('select * from entities where id = $1', [freeCreature.entity_id]))[0]
await db.query(`select delete_entity($1)`, [moth.id])
ok((await q('select count(*)::int as n from entities where id = $1', [moth.id]))[0].n === 0 && (await q('select count(*)::int as n from hex_occupants where entity_id = $1', [moth.id]))[0].n === 0, 'removal clears the map too')
ok((await q(`select summary from actions_log where action_key = 'entity_removed'`))[0].summary === 'Ćmy', 'removal written to the chronicle as the name (the verse is composed in the client)')

console.log('\n# the godless')
{
  await db.query('update cities set atheists = 2 where entity_id = $1', [civ.entity_id])
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === 10 && (await q('select city_believers($1) as b', [civ.entity_id]))[0].b === 8, 'the godless count as people, not as believers')
  ok((await q('select city_majority($1) as m', [civ.entity_id]))[0].m === actor.id, 'the godless crown nobody')
  ok((await q('select city_add_atheists($1, 1) as n', [civ.entity_id]))[0].n === 0, 'a full city takes no more godless')
  const groups = (await q('select city_remove_groups($1, 3) as g', [civ.entity_id]))[0].g
  ok(groups.reduce((n, g) => n + g.n, 0) === 3 && groups[0].player_id === null && groups[0].n === 2, 'leaving groups: the godless first, then one by one')
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === 7, 'seven stayed')
  const restore = async () => {
    await db.query('update cities set atheists = 2 where entity_id = $1', [civ.entity_id])
    await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id])
  }
  await restore()
  // a gift wins the godless first
  await topUp()
  await fixDice(6)
  const devA = (await q(`select * from perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: 'Pismo' })]))[0]
  await fixDice(null)
  ok(devA.outcome.gained === 2 && devA.outcome.converted_atheists === 2 && devA.outcome.added === 2, 'development: two groups gained, both from the godless')
  ok((await q('select atheists from cities where entity_id = $1', [civ.entity_id]))[0].atheists === 0 && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 7, 'the godless now pray to the giver')
  await restore()
  // conversion turns the godless before the rival's own
  await topUp()
  await fixDice(6)
  const c2 = (await q(`select * from declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, defender_id: otherP.id, attr: 'majesty' })]))[0]
  await fixDice(1)
  await as(otherP.user_id)
  const c2done = (await q(`select * from answer_contest($1, 'wisdom')`, [c2.id]))[0]
  await fixDice(null)
  ok(c2done.outcome.converted === 2 && c2done.outcome.from_atheists === 2, 'a clear win converts two, both godless')
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, otherP.id]))[0].d === 3 && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 7, 'the rival keeps its own')
  await as(actor.user_id)
  await db.query(`select commit_contest($1, 'I przyszli bezbożni.')`, [c2.id])
  // the godless alone may be converted: nobody defends, the book rolls for them at once
  await restore()
  await topUp()
  ok((await rpcErr(`select declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: newCity.id, attr: 'majesty' })])) === 'W tym mieście nie ma bezbożników.', 'a city without the godless needs a defending god')
  await queueDice(6, 6, 1, 1)
  const godless = (await q(`select * from declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'majesty' })]))[0]
  ok(godless.status === 'resolved' && godless.defender_id === null && godless.defender_attr === 'majesty' && godless.defender_mod === 0 && godless.defender_total === 2 && godless.outcome.godless === true, 'against the godless the contest resolves at once, the book rolling for them with no attribute')
  ok(godless.outcome.converted === 2 && godless.outcome.from_atheists === 2 && (await q('select atheists from cities where entity_id = $1', [civ.entity_id]))[0].atheists === 0 && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 7, 'twelve against two: two of the godless believe')
  ok((await q('select verse_pending_by from games where id = $1', [game.id]))[0].verse_pending_by === actor.id, 'the verse is owed at once')
  await db.query(`select commit_contest($1, 'I uwierzyli bezbożni.')`, [godless.id])
  // a war on the godless: the book defends with their number
  await restore()
  await db.query('delete from city_followers where city_id = $1', [newCity.id])
  await db.query('update cities set atheists = 3 where entity_id = $1', [newCity.id])
  await db.query('update hex_occupants set q = 0, r = -1, slot = 2 where entity_id = $1', [av.entity_id])
  await topUp()
  await queueDice(6, 6, 1, 1)
  const raid = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 2, target_city_id: newCity.id, attr: 'wrath', avatar_id: av.entity_id })]))[0]
  ok(raid.status === 'resolved' && raid.defender_id === null && raid.defender_mod === 3 && raid.outcome.godless === true && raid.outcome.defender_dots === 3, 'a war on the godless: the book defends with 2k6 + their number')
  {
    const diff = raid.attacker_total - raid.defender_total
    ok(raid.outcome.diff === diff && raid.outcome.pending === (diff >= 1), `the war resolved at once (${diff})`)
    await db.query(`select commit_contest($1, 'Najazd.', $2::jsonb)`, [raid.id, J({ dots: 2, avatar: 0 })])
    const oc = (await q('select outcome from contests where id = $1', [raid.id]))[0].outcome
    const left = (await q('select atheists from cities where entity_id = $1', [newCity.id]))[0].atheists
    ok(diff >= 1 ? oc.removed === 2 && oc.converted === 1 && left === 1 : diff === 0 || diff >= -2 ? left === 2 : left === 3, `the godless lost what the table says (${left} left)`)
  }
  await db.query('delete from city_followers where city_id = $1', [newCity.id])
  await db.query('update cities set atheists = 0 where entity_id = $1', [newCity.id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 2) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, newCity.id, otherP.id])
  await restore()
  await topUp()
  // a random blow may fall on the godless: nobody mourns them
  await db.query('update cities set atheists = 1 where entity_id = $1', [civ.entity_id])
  let godlessHit = false
  for (let i = 0; i < 60 && !godlessHit; i++) {
    const pid = (await q('select city_remove_random_dot($1) as p', [civ.entity_id]))[0].p
    if (pid === null) godlessHit = true
    await db.query('update cities set atheists = 1 where entity_id = $1', [civ.entity_id])
    await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id])
  }
  ok(godlessHit, 'a random blow may fall on the godless')
  await db.query('update cities set atheists = 0 where entity_id = $1', [civ.entity_id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id])
  await topUp()
}

console.log('\n# contests: conversion')
await topUp()
ok((await rpcErr(`select declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, defender_id: actor.id, attr: 'majesty' })])) !== null, 'cannot contest oneself')
ok((await rpcErr(`select declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, defender_id: otherP.id, attr: 'wrath' })])) !== null, 'conversion is Majestat or Podszept')
const conv = (await q(`select * from declare_contest($1, 'convert', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, defender_id: otherP.id, attr: 'majesty' })]))[0]
ok(conv.status === 'pending' && conv.cost === 6 && conv.attacker_total === conv.attacker_d1 + conv.attacker_d2 + conv.attacker_mod, 'conversion declared, attacker rolled, 6 Logos paid')
ok((await q('select logos from players where id = $1', [actor.id]))[0].logos === 54, 'cost taken at declaration')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'trawa', hexes: [{ q: 0, r: -1 }] })])) !== null, 'no actions while a contest waits')
ok((await rpcErr(`select rest($1)`, [game.id])) !== null, 'no rest while a contest waits')
await db.query('update players set logos = 100 where id = $1', [otherP.id])
await db.query('select recompute_turn($1)', [game.id])
ok((await q('select current_turn_player_id as t from games where id = $1', [game.id]))[0].t === actor.id, 'the turn is frozen while the contest waits')
ok((await rpcErr(`select answer_contest($1, 'majesty')`, [conv.id])) !== null, 'the attacker cannot answer for the defender')
await as(otherP.user_id)
ok((await rpcErr(`select answer_contest($1, 'whisper')`, [conv.id])) === 'Wybierz: Majestat albo Mądrość.', 'the defender answers with Majestat or Mądrość')
const convDone = (await q(`select * from answer_contest($1, 'wisdom')`, [conv.id]))[0]
{
  const o = convDone.outcome
  const diff = convDone.attacker_total - convDone.defender_total
  const expected = diff >= 3 ? 2 : diff >= 1 ? 1 : 0
  ok(convDone.status === 'resolved' && o.diff === diff && o.converted === expected, `conversion resolved: ${convDone.attacker_total} vs ${convDone.defender_total}, ${o.converted} converted`)
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, otherP.id]))[0].d === 3 - expected && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 5 + expected, 'dots changed hands')
  const row = (await q('select * from actions_log where id = $1', [convDone.log_id]))[0]
  ok(row.action_key === 'convert' && row.player_id === actor.id && row.roll.def.attr === 'wisdom' && row.summary === '', 'the book has the contest row with both rolls, awaiting the verse')
}
ok((await rpcErr(`select commit_contest($1, 'x')`, [conv.id])) !== null, 'the defender does not write the verse')
await as(actor.user_id)
await db.query(`select commit_contest($1, 'I nawróciła Ta Pod Rzeką wielu.')`, [conv.id])
ok((await q('select summary from actions_log where id = $1', [convDone.log_id]))[0].summary === 'I nawróciła Ta Pod Rzeką wielu.' && (await q('select status from contests where id = $1', [conv.id]))[0].status === 'committed', 'the attacker writes the verse')
await db.query('update players set logos = 10 where id = $1', [otherP.id])
await topUp()
ok((await q('select current_turn_player_id as t from games where id = $1', [game.id]))[0].t === actor.id, 'the turn moves again')

console.log('\n# contests: holy war')
await db.query('delete from city_followers where city_id = $1 and player_id = $2', [newCity.id, actor.id])
await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3), ($1, $5, $4, 2) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])
ok((await rpcErr(`select declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 5, target_city_id: newCity.id, defender_id: otherP.id, attr: 'wrath' })])) !== null, 'at least one dot stays home')
ok((await rpcErr(`select declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: newCity.id, army: 1, target_city_id: civ.entity_id, defender_id: otherP.id, attr: 'wrath' })])) !== null, 'an army marches only from a city I hold')
ok((await rpcErr(`select declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 2, target_city_id: newCity.id, defender_id: otherP.id, attr: 'grace' })])) === 'Wybierz: Gniew albo Podszept.', 'a war is led by Gniew or Podszept')
const avHp = (await q('select hp from entities where id = $1', [av.entity_id]))[0].hp
const war = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 2, target_city_id: newCity.id, defender_id: otherP.id, attr: 'wrath' })]))[0]
ok(war.status === 'pending' && war.cost === 9 && war.army === 2 && war.attacker_mod === 2 + avHp + (await q(`select attr_score(p, 'wrath') as s from players p where id = $1`, [actor.id]))[0].s, 'war declared: cost is the distance, modifier is Gniew plus the army plus the life of the general')
ok(war.attacker_avatar_id === av.entity_id && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === 0 && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].r === 0, 'the nearest avatar of mine leads and steps into the city')
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 3, 'the army left the city')
await db.query(`select cancel_contest($1)`, [war.id])
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 5 && (await q('select logos from players where id = $1', [actor.id]))[0].logos === 60, 'a cancelled war refunds the army and the Logos')
ok((await q('select status from contests where id = $1', [war.id]))[0].status === 'cancelled', 'contest cancelled')
const war2 = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 4, target_city_id: newCity.id, defender_id: otherP.id, attr: 'whisper' })]))[0]
ok(war2.attacker_attr === 'whisper' && war2.attacker_mod === 4 + avHp + (await q(`select attr_score(p, 'whisper') as s from players p where id = $1`, [actor.id]))[0].s, 'a war may be led by Podszept')
await as(otherP.user_id)
ok((await rpcErr(`select answer_contest($1, 'wisdom')`, [war2.id])) === 'Wybierz: Łaska albo Gniew.', 'a city is defended with Łaska or Gniew')
const warDone = (await q(`select * from answer_contest($1, 'grace')`, [war2.id]))[0]
{
  const o = warDone.outcome
  const diff = warDone.attacker_total - warDone.defender_total
  ok(warDone.defender_mod === (await q(`select attr_score(p, 'grace') as s from players p where id = $1`, [otherP.id]))[0].s + 2, 'defender modifier is the attribute plus the defending dots')
  ok((await q('select verse_pending_by from games where id = $1', [game.id]))[0].verse_pending_by === actor.id, 'after the answer the attacker owes the verse')
  if (diff >= 1) {
    ok(o.pending === true && o.successes === 4 && (await q('select player_dots($1, $2) as d', [newCity.id, otherP.id]))[0].d === 2, 'a won war keeps its successes for the attacker to place')
  } else {
    ok(o.pending === false, 'a lost war is settled at once')
  }
  await as(actor.user_id)
  await db.query(`select commit_contest($1, 'I była wojna.', null)`, [war2.id])
  let removed = 0, converted = 0, returned = 0, defLost = 0
  if (diff >= 3) { removed = 2; converted = 1; returned = 4 }
  else if (diff >= 1) { removed = 2; converted = 1; returned = 2 }
  else if (diff === 0) { defLost = 1; returned = 3 }
  else if (diff >= -2) { defLost = 1; returned = 1 }
  const oc = (await q('select outcome from contests where id = $1', [war2.id]))[0].outcome
  ok(oc.removed === removed && oc.converted === converted && oc.returned === returned, `war settled (${diff}): removed ${oc.removed}, converted ${oc.converted}, returned ${oc.returned}`)
  ok((await q('select player_dots($1, $2) as d', [newCity.id, otherP.id]))[0].d === 2 - removed - defLost, 'the defender lost what the table says')
  ok((await q('select player_dots($1, $2) as d', [newCity.id, actor.id]))[0].d === converted, 'converted captives pray to the attacker')
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 1 + returned, 'survivors came home')
  ok(oc.target_destroyed === (2 - removed - defLost + converted === 0), 'a city emptied by war is a ruin')
  ok((await q('select verse_pending_by from games where id = $1', [game.id]))[0].verse_pending_by === null, 'the commit frees the turn')
}

console.log('\n# a war hunts an avatar')
{
  // the defender's avatar stands in the attacked city; a won war may strike it
  await db.query('delete from city_followers where city_id = $1', [newCity.id])
  await db.query(`update entities set status = 'active' where id = $1`, [newCity.id])
  await db.query(`insert into cities (entity_id, game_id, q, r) values ($1, $2, 1, -1) on conflict do nothing`, [newCity.id, game.id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 1), ($1, $5, $4, 3) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])
  const [enemyAv] = await q(`insert into entities (game_id, kind, name, emoji, hp, created_by_player_id) values ($1, 'avatar', 'Cień Rachunku', '🧛‍♂️', 3, $2) returning id`, [game.id, otherP.id])
  await db.query(`insert into entity_gods (entity_id, player_id, game_id, role) values ($1, $2, $3, 'creator')`, [enemyAv.id, otherP.id, game.id])
  await db.query(`insert into hex_occupants (game_id, q, r, slot, entity_id) values ($1, 1, -1, hex_slot_for($1, 1, -1, $2), $2)`, [game.id, enemyAv.id])
  await topUp()
  await db.query('update players set logos = 60 where id = $1', [actor.id])
  await db.query('update games set current_turn_player_id = $2 where id = $1', [game.id, actor.id])
  await db.query('update hex_occupants set q = 0, r = -1, slot = 2 where entity_id = $1', [av.entity_id])
  ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = -1', [av.entity_id]))[0].n === 1, 'my avatar stands a step from the city that raises the army')
  const wrath = (await q(`select attr_score(p, 'wrath') as s from players p where id = $1`, [actor.id]))[0].s
  const hunt = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 4, target_city_id: newCity.id, defender_id: otherP.id, avatar_id: av.entity_id, attr: 'wrath' })]))[0]
  ok(hunt.cost === 9 && hunt.attacker_avatar_id === av.entity_id, 'a war costs its full 8 + 1 and is led by the avatar')
  ok(hunt.attacker_mod === wrath + 4 + 3, 'the avatar leads the army with its three lives')
  ok((await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === 0 && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].r === 0, 'the general steps into the city that raises the army')
  // test-only: make the attack a sure win so the blows can be placed
  await db.query('update contests set attacker_total = 30 where id = $1', [hunt.id])
  await as(otherP.user_id)
  const huntDone = (await q(`select * from answer_contest($1, 'grace')`, [hunt.id]))[0]
  ok(huntDone.outcome.pending === true && huntDone.outcome.successes === 4, 'four successes wait to be placed')
  ok(huntDone.defender_mod === (await q(`select attr_score(p, 'grace') as s from players p where id = $1`, [otherP.id]))[0].s + 3 + 3 && huntDone.defender_avatar_id === enemyAv.id, 'the defender\'s avatar in the city adds its three lives to the walls')
  await as(actor.user_id)
  ok((await rpcErr(`select commit_contest($1, 'x', $2::jsonb)`, [hunt.id, J({ dots: 1, avatar: 2 })])) === null, 'one blow on the dots, two on the avatar')
  ok((await q('select hp from entities where id = $1', [enemyAv.id]))[0].hp === 1, 'the enemy avatar lost two of three')
  ok((await q('select player_dots($1, $2) as d', [newCity.id, otherP.id]))[0].d === 2, 'one follower of the defender fell')
  ok((await q('select outcome from contests where id = $1', [hunt.id]))[0].outcome.avatar_wounds === 2, 'the wounds are written down')
  ok(huntDone.outcome.attacker_avatar_to && huntDone.outcome.attacker_avatar_to.q === 1 && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === 1 && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].r === -1, 'after the victory the general stands in the taken city')
  await db.query('update entities set hp = 3 where id = $1', [enemyAv.id])
  // a rout wounds the general: the same war, lost by three
  await db.query('update hex_occupants set q = 0, r = -1, slot = 2 where entity_id = $1', [av.entity_id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id])
  await db.query('update players set logos = 60 where id = $1', [actor.id])
  await db.query('select release_verse($1)', [game.id])
  await db.query('update games set current_turn_player_id = $2 where id = $1', [game.id, actor.id])
  const rout = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 2, target_city_id: newCity.id, defender_id: otherP.id, avatar_id: av.entity_id, attr: 'wrath' })]))[0]
  await db.query('update contests set attacker_total = -30 where id = $1', [rout.id])
  await as(otherP.user_id)
  const routDone = (await q(`select * from answer_contest($1, 'grace')`, [rout.id]))[0]
  ok(routDone.outcome.diff <= -3 && routDone.outcome.attacker_avatar_wound === 1 && (await q('select hp from entities where id = $1', [av.entity_id]))[0].hp === 2 && (await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === 0, 'a rout wounds the general by one; it stays in the city it marched from')
  await as(actor.user_id)
  await db.query(`select commit_contest($1, 'Klęska.', null)`, [rout.id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 1), ($1, $5, $4, 3) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])
  await db.query('update entities set hp = 3 where id in ($1, $2)', [av.entity_id, enemyAv.id])

  console.log('\n# avatars fight')
  await db.query('update entities set hp = 3, max_hp = 3 where id in ($1, $2)', [av.entity_id, enemyAv.id])
  // my avatar next to the enemy's: (0,-1) touches (1,-1)
  await db.query('update hex_occupants set q = 0, r = -1, slot = 2 where entity_id = $1', [av.entity_id])
  ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = -1', [av.entity_id]))[0].n === 1, 'my avatar stands next door')
  await topUp()
  ok((await rpcErr(`select declare_contest($1, 'avatar_duel', $2::jsonb)`, [game.id, J({ attacker_avatar_id: av.entity_id, defender_avatar_id: enemyAv.id, attr: 'whisper' })])) === 'Wybierz: Gniew albo Majestat.', 'a duel is Gniew or Majestat')
  await db.query('update hex_occupants set q = -1, r = 3, slot = 0 where entity_id = $1', [av.entity_id])
  ok((await rpcErr(`select declare_contest($1, 'avatar_duel', $2::jsonb)`, [game.id, J({ attacker_avatar_id: av.entity_id, defender_avatar_id: enemyAv.id, attr: 'wrath' })])) !== null, 'a duel reaches two hexes at most')
  await db.query('update hex_occupants set q = 0, r = -1, slot = 0 where entity_id = $1', [av.entity_id])
  const duel = (await q(`select * from declare_contest($1, 'avatar_duel', $2::jsonb)`, [game.id, J({ attacker_avatar_id: av.entity_id, defender_avatar_id: enemyAv.id, attr: 'wrath' })]))[0]
  ok(duel.kind === 'avatar_duel' && duel.defender_id === otherP.id && duel.cost === 5 && duel.target_city_id === null, 'duel declared against the avatar\'s god, 5 Logos in era I')
  await as(otherP.user_id)
  ok((await rpcErr(`select answer_contest($1, 'whisper')`, [duel.id])) === 'Wybierz: Gniew albo Majestat.', 'a duel is answered with Gniew or Majestat')
  const duelDone = (await q(`select * from answer_contest($1, 'majesty')`, [duel.id]))[0]
  {
    const diff = duelDone.attacker_total - duelDone.defender_total
    const o = duelDone.outcome
    let a = 0, d = 0
    if (diff >= 3) d = 2
    else if (diff >= 1) { d = 1; a = 1 }
    else if (diff === 0) { d = 1; a = 1 }
    else if (diff >= -2) a = 1
    else a = 2
    ok(o.attacker_loss === a && o.defender_loss === d, `duel (${diff}): attacker −${o.attacker_loss}, defender −${o.defender_loss}`)
    ok((await q('select hp from entities where id = $1', [av.entity_id]))[0].hp === 3 - a && (await q('select hp from entities where id = $1', [enemyAv.id]))[0].hp === 3 - d, 'life taken as the table says')
  }
  await as(actor.user_id)
  await db.query(`select commit_contest($1, 'Starli się.', null)`, [duel.id])
  await db.query('update entities set hp = 3 where id in ($1, $2)', [av.entity_id, enemyAv.id])

  console.log('\n# prophecies')
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'prophecy', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, text: '  ', attr: 'majesty' })])) !== null, 'a prophecy needs words')
  {
    const miss = await rolled(1, `select * from perform_action($1, 'prophecy', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, text: 'Cisza.', attr: 'majesty' })])
    ok(miss.logos_delta === -10 && miss.outcome.spoken === false && (await q('select count(*)::int as n from prophecies where game_id = $1', [game.id]))[0].n === 0, 'on 6- the prophet is silent and the Logos is spent')
    await topUp()
    const loud = await rolled(6, `select * from perform_action($1, 'prophecy', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, text: 'Góry zapłoną.', attr: 'wisdom' })])
    ok(loud.outcome.tier === 'strong' && loud.outcome.hold === 2 && (await q('select hold from prophecies where game_id = $1', [game.id]))[0].hold === 2, 'on 10+ a prophecy starts with a hold of two')
    await db.query('delete from prophecies where game_id = $1', [game.id])
    await topUp()
  }
  const proph = await rolled(4, `select * from perform_action($1, 'prophecy', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, text: 'Wielka fala zmyje niewiernych.', attr: 'majesty' })])
  const pr = (await q('select * from prophecies where game_id = $1 order by created_at', [game.id]))
  ok(proph.logos_delta === -10 && pr.length === 1 && pr[0].hold === 1 && pr[0].status === 'active', 'a prophecy is spoken for 10 Logos, with a hold of one on 7..9')
  await topUp()
  await db.query('update prophecies set hold = 3 where id = $1', [pr[0].id])
  const devP = (await q(`select * from perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wisdom', gift: 'Prawo', prophecy_id: pr[0].id })]))[0]
  ok(devP.outcome.prophecy === 3 && devP.outcome.total === devP.outcome.d1 + devP.outcome.d2 + devP.outcome.score + 3, 'the prophecy adds its hold to the roll')
  ok((await q('select status from prophecies where id = $1', [pr[0].id]))[0].status === 'fulfilled', 'and is fulfilled')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'prophecy_fulfilled' and game_id = $1`, [game.id]))[0].n === 1, 'the book tells that the words became flesh')
  await topUp()
  ok((await rpcErr(`select perform_action($1, 'fire_rain', $2::jsonb)`, [game.id, J({ q: 0, r: 3, prophecy_id: pr[0].id, attr: 'wrath' })])) !== null, 'a fulfilled prophecy cannot be used again')
  await topUp()
  await rolled(4, `select * from perform_action($1, 'prophecy', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, text: 'Zgasną gwiazdy.', attr: 'majesty' })])
}

console.log('\n# rest -> chaos')
const dice = await q(`select * from log_dice_roll($1, 'test')`, [game.id])
ok(dice[0].roll.total === dice[0].roll.d1 + dice[0].roll.d2 && dice[0].roll.modifier === 0, 'shared dice logged')
const penalised = await q(`select * from log_dice_roll($1, 'Stworzenie Cywilizacji', -2)`, [game.id])
ok(penalised[0].roll.total === penalised[0].roll.d1 + penalised[0].roll.d2 - 2 && penalised[0].roll.modifier === -2, "the avatar's -2 is applied to the roll")
ok((await rpcErr(`select log_dice_roll($1, 'x', 9)`, [game.id])) !== null, 'roll modifier is bounded')
await db.query(`select adjust_logos($1, 5, 'Danina')`, [game.id])
ok((await rpcErr(`select adjust_logos($1, 9, 'za dużo')`, [game.id])) !== null, 'adjust_logos bounded')
await db.query(`select rest($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'gods' && g.current_turn_player_id !== actor.id, 'after rest, turn goes to the other god')
await as(otherP.user_id)
await db.query(`select transfer_logos($1, $2, 1)`, [game.id, actor.id])
ok((await q(`select summary from actions_log where action_key = 'transfer'`))[0].summary === actor.god_name, 'transfer keeps the receiving god (the verse is composed in the client)')
ok((await q(`select logos_words(2) as a, logos_words(5) as b, logos_words(22) as c, logos_words(12) as d`))[0].a === '2 Słowa' && (await q(`select logos_words(12) as d`))[0].d === '12 Słów', 'logos_words plural forms')
await db.query(`select rest($1)`, [game.id])
ok((await q(`select summary from actions_log where action_key = 'rest' order by created_at desc limit 1`))[0].summary.endsWith('odpoczywa. Zachowuje swoje Słowa i milczy do końca rundy.'), 'rest written as a verse')
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'chaos' && g.current_turn_player_id === null, 'everyone resting -> chaos phase')
ok((await rpcErr(`select vote_advance_era($1)`, [game.id])) === null, 'era vote allowed in round 1')
await db.query(`select vote_advance_era($1)`, [game.id])
ok((await q('select count(*)::int as n from era_votes where game_id = $1', [game.id]))[0].n === 0, 'era vote toggled back off')

console.log('\n# chaos card')
const first = (await q(`select * from reveal_chaos($1)`, [game.id]))[0]
ok(first.die1 >= 1 && first.die2 <= 6 && first.category_key === null && first.seq === 1, 'chaos revealed, dice only')
await db.query(`select set_chaos_notes($1, 'Pierwsza karta bez sensu.')`, [game.id])
const draw = (await q(`select * from reveal_chaos($1)`, [game.id]))[0]
ok(draw.seq === 2 && draw.id !== first.id, 'second reveal deals the next card (seq 2)')
ok((await q(`select summary from actions_log where action_key = 'chaos_reveal' order by created_at desc limit 1`))[0].summary.includes('kolejną Kartę Chaosu'), 'redraw logged as another card')
await as(actor.user_id)
ok((await rpcErr(`select choose_chaos_die($1, 1)`, [game.id])) !== null, 'only the revealer chooses the die')
await as(otherP.user_id)
const chosen = (await q(`select * from choose_chaos_die($1, 2::smallint, 'Konflikt', 'Wojny, bitwy, spory, sport.')`, [game.id]))[0]
const cats = ['region', 'event', 'people', 'magic', 'culture', 'disaster']
ok(chosen.category_key === cats[draw.die2 - 1] && chosen.entry_index === draw.die1, `die 2 (${draw.die2}) -> ${chosen.category_key}, entry ${chosen.entry_index}`)
ok((await q(`select summary from actions_log where action_key = 'chaos_choice'`))[0].summary.includes('Konflikt'), 'chosen entry text written to the chronicle')
const answer = (await q(`select * from answer_chaos_question($1, 'O co chodzi?', 'O sól.')`, [game.id]))[0]
ok(answer.action_key === 'chaos_answer' && answer.summary === 'O co chodzi? O sól.' && answer.player_id === otherP.id, 'chaos answer logged under the answering god')
ok((await rpcErr(`select answer_chaos_question($1, 'Q', '   ')`, [game.id])) !== null, 'empty answer refused')
await db.query(`select set_chaos_notes($1, 'Rzeka zmienia bieg.')`, [game.id])

console.log('\n# the night of Chaos')
const hostP = players.find((p) => p.user_id === A)
const guestP = players.find((p) => p.user_id === B)
let cityB = null
{
  // a clean, deterministic world: six fields of land in the middle of the ocean
  await db.query('delete from hex_occupants where game_id = $1', [game.id])
  await db.query('delete from city_followers where game_id = $1', [game.id])
  await db.query('delete from cities where game_id = $1', [game.id])
  await db.query('delete from rivers where game_id = $1', [game.id])
  await db.query(`update hexes set biome = 'woda', resource = null where game_id = $1`, [game.id])
  const land = { '0,0': 'trawa', '1,0': 'dzungla', '0,1': 'trawa', '1,-1': 'pustynia', '0,-1': 'gory', '-1,0': 'pustynia' }
  for (const [k, b] of Object.entries(land)) {
    const [qq, rr] = k.split(',').map(Number)
    await db.query(`update hexes set biome = $4 where game_id = $1 and q = $2 and r = $3`, [game.id, qq, rr, b])
  }
  const F = async (qq, rr) => (await q('select hex_fertility($1, $2, $3) as f', [game.id, qq, rr]))[0].f
  ok((await F(0, 0)) === 3 && (await F(1, 0)) === 2 && (await F(0, 1)) === 3 && (await F(1, -1)) === 1 && (await F(0, -1)) === 2 && (await F(-1, 0)) === 1, 'the fertility of the six fields')
  const place = (qq, rr, slot, entityId) => db.query('insert into hex_occupants (game_id, q, r, slot, entity_id) values ($1, $2, $3, $4, $5)', [game.id, qq, rr, slot, entityId])
  const [deer] = await q(`insert into entities (game_id, kind, name, emoji, diet, strength, created_by_player_id) values ($1, 'creature', 'Jelenie', '🦌', 'herbivore', 1, $2) returning id`, [game.id, hostP.id])
  await db.query(`insert into entity_gods (entity_id, player_id, game_id, role) values ($1, $2, $3, 'creator')`, [deer.id, hostP.id, game.id])
  await place(0, 1, 0, deer.id)
  const wolves = third.entity_id
  await db.query(`update entities set status = 'active', strength = 1 where id = $1`, [wolves])
  await db.query('update entity_gods set player_id = $2 where entity_id = $1', [wolves, hostP.id])
  await place(-1, 0, 1, wolves)
  const [dwarves] = await q(`insert into entities (game_id, kind, name, emoji, traits, created_by_player_id) values ($1, 'creature', 'Krasnale', '🧙', '{Rozumne}', $2) returning id`, [game.id, guestP.id])
  await db.query(`insert into entity_gods (entity_id, player_id, game_id, role) values ($1, $2, $3, 'creator')`, [dwarves.id, guestP.id, game.id])
  await place(0, 0, 1, dwarves.id)
  await db.query(`update entities set status = 'active' where id = $1`, [variant.entity_id])
  await db.query('update entity_gods set player_id = $2 where entity_id = $1', [variant.entity_id, hostP.id])
  await place(0, 1, 1, variant.entity_id)
  await db.query(`update entities set status = 'active' where id = $1`, [civ.entity_id])
  await db.query(`insert into cities (entity_id, game_id, q, r, atheists) values ($1, $2, 1, -1, 1)`, [civ.entity_id, game.id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 2), ($1, $2, $4, 2)', [game.id, civ.entity_id, actor.id, otherP.id])
  await db.query(`update entities set status = 'active' where id = $1`, [sapient.entity_id])
  await place(1, -1, 1, sapient.entity_id)
  await db.query(`update entities set status = 'active', hp = 1, max_hp = 3 where id = $1`, [av.entity_id])
  await db.query('update players set logos = 3 where id = $1', [otherP.id])
  await db.query('update players set logos = 20 where id = $1', [actor.id])

  await as(B)
  ok((await rpcErr(`select start_chaos_night($1)`, [game.id])) !== null, 'the night is started by the host')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc nie trwa.', 'no step before the night begins')
  await as(A)
  const night = (await q(`select * from start_chaos_night($1)`, [game.id]))[0]
  ok(night.status === 'running' && night.cursor === 0 && night.queue.map((u) => u.t).join() === 'herbivore,beast,tribe,tribe,city', 'the night queues herds, beasts, tribes and cities in that order')
  ok((await rpcErr(`select start_chaos_night($1)`, [game.id])) === 'Noc już trwa.', 'one night per round')
  const begin = (await q(`select * from actions_log where action_key = 'night_begin' order by created_at desc limit 1`))[0]
  ok(begin.outcome.herbivores === 1 && begin.outcome.beasts === 1 && begin.outcome.tribes === 2 && begin.outcome.cities === 1, 'the night begins with a count of all that moves')
  await queueDice(6, 6, 5, 5)
  // the herd rolls a 12: a new kind is born on the richest neighbouring field, once its god names it
  let st = (await q(`select * from chaos_step($1, 0)`, [game.id]))[0]
  const herdMove = (await q(`select * from actions_log where action_key = 'night_move' order by created_at desc limit 1`))[0]
  ok(st.cursor === 1 && herdMove.roll.d1 === 6 && herdMove.roll.total === 12 && herdMove.outcome.unit === 'herbivore' && herdMove.outcome.result === 'mutation', 'on a 12 the herd mutates')
  ok(st.status === 'mutation' && st.pending.kind === 'mutation' && st.pending.parent_id === deer.id && st.pending.at.q === 0 && st.pending.at.r === 0 && st.pending.namer_id === hostP.id && st.pending.role === 'herbivore', 'the night waits for the god of the herd to name the new kind, which will appear on the best field around')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc czeka na nazwę nowej odmiany.', 'no step while a mutation waits')
  await as(B)
  ok((await rpcErr(`select chaos_name_mutation($1, 'Cudze', '🦓')`, [game.id])) !== null, 'a stranger does not name the new kind')
  await as(A)
  ok((await rpcErr(`select chaos_name_mutation($1, 'Zebry', '🦌')`, [game.id])) === 'Ta emotikona należy już do kogoś innego.', 'the new kind needs a free sign')
  st = (await q(`select * from chaos_name_mutation($1, 'Zebry mgielne', '🦓')`, [game.id]))[0]
  const zebra = (await q(`select e.*, l.to_entity_id as parent from entities e left join entity_links l on l.from_entity_id = e.id and l.relation = 'variant_of' where e.game_id = $1 and e.name = 'Zebry mgielne'`, [game.id]))[0]
  ok(st.status === 'running' && zebra && zebra.emoji === '🦓' && zebra.diet === 'herbivore' && zebra.strength === 1 && zebra.parent === deer.id, 'the new kind is named, wears its sign, keeps the rank and is a variant of its parent')
  ok((await q('select q, r, slot from hex_occupants where entity_id = $1', [zebra.id]))[0].q === 0 && (await q('select q from hex_occupants where entity_id = $1', [deer.id]))[0].q === 0 && (await q('select r from hex_occupants where entity_id = $1', [deer.id]))[0].r === 1, 'the new herd grazes on the best field; the old one stays where it was')
  ok((await F(0, 0)) === 4 && (await q(`select count(*)::int as n from entity_gods where entity_id = $1 and player_id = $2`, [zebra.id, hostP.id]))[0].n === 1, 'the new herd lends its rank to its field and belongs to the same god')
  ok(herdMove.id && (await q('select outcome from actions_log where id = $1', [herdMove.id]))[0].outcome.mutation_name === 'Zebry mgielne', 'the move row remembers the name')
  st = (await q(`select * from chaos_step($1, 0)`, [game.id]))[0]
  ok(st.cursor === 1 && (await q(`select count(*)::int as n from actions_log where action_key = 'night_move'`))[0].n === 1, 'a step with a stale cursor does nothing')
  // the beast rolls a 10: it hunts towards the nearest herd and runs into the tribe standing there
  st = (await q(`select * from chaos_step($1, 1)`, [game.id]))[0]
  ok(st.status === 'fight' && st.pending.scene === 'creature' && st.pending.left.entity_id === wolves && st.pending.right.entity_id === dwarves.id && st.pending.at.q === 0 && st.pending.at.r === 0 && st.pending.origin.q === -1, 'on a 10 the beast steps towards the herd and finds the tribe there: a fight')
  ok(st.pending.left.mod === 1 && st.pending.right.mod === 0 && st.pending.left.player_id === hostP.id && st.pending.right.player_id === guestP.id, 'the beast fights with its strength, the tribe with nothing; each side has its god')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc czeka na rzuty w walce.', 'the night waits for the fight')
  await as(B)
  ok((await rpcErr(`select chaos_fight_roll($1, 'left')`, [game.id])) !== null, 'a god does not roll for the other side')
  await as(A)
  await fixDice(6)
  st = (await q(`select * from chaos_fight_roll($1, 'left')`, [game.id]))[0]
  ok(st.status === 'fight' && st.pending.left.roll.total === 13 && st.pending.right.roll === null, 'the left side rolled 6 + 6 + 1; the fight still waits')
  st = (await q(`select * from chaos_fight_roll($1, 'left')`, [game.id]))[0]
  ok(st.pending.left.roll.total === 13, 'a second click on the same side changes nothing')
  await fixDice(1)
  await as(B)
  st = (await q(`select * from chaos_fight_roll($1, 'right')`, [game.id]))[0]
  await fixDice(null)
  const fight = (await q(`select * from actions_log where action_key = 'night_fight' order by created_at desc limit 1`))[0]
  ok(st.status === 'verdict' && st.pending.kind === 'verdict' && st.pending.log_id === fight.id && st.pending.players.length === 2 && fight.outcome.diff === 11 && fight.outcome.loser === 'right' && fight.outcome.result === 'eaten' && fight.outcome.removed === true && fight.outcome.extinct === true, 'both rolled: the tribe lost by eleven and was eaten; the verdict waits to be read')
  ok(fight.roll.att.total === 13 && fight.roll.def.total === 2, 'the fight row carries both rolls')
  ok((await q('select q, r from hex_occupants where entity_id = $1', [wolves]))[0].q === 0 && (await q('select count(*)::int as n from hex_occupants where entity_id = $1', [dwarves.id]))[0].n === 0 && (await q('select status from entities where id = $1', [dwarves.id]))[0].status === 'dead', 'the beast took the field; the last of the dwarves is gone')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc czeka, aż bogowie przeczytają wynik walki.', 'the night waits until both gods have read the verdict')
  st = (await q(`select * from chaos_ack_fight($1)`, [game.id]))[0]
  ok(st.status === 'verdict' && st.pending.acks.length === 1 && st.pending.acks[0] === guestP.id, 'one god has read it; the other has not')
  await as(A)
  st = (await q(`select * from chaos_ack_fight($1)`, [game.id]))[0]
  ok(st.status === 'running' && st.pending === null, 'both read it: the night goes on')
  // the tribes: the eaten one is skipped, the other already stands on the best land around and settles
  await queueDice(4, 5, 5, 6)
  let guard = 0
  while (st.status === 'running' && guard++ < 3) st = (await q(`select * from chaos_step($1)`, [game.id]))[0]
  ok(st.status === 'naming' && st.pending.city_id && st.pending.namer_id === hostP.id && st.pending.q === 0 && st.pending.r === 1, 'on a 9 the tribe on the richest land around founds a city and waits for its name from its god')
  const settle = (await q(`select * from actions_log where action_key = 'night_move' order by created_at desc limit 1`))[0]
  ok(settle.outcome.unit === 'tribe' && settle.roll.total === 9 && settle.outcome.result === 'settle' && settle.outcome.new_city_id === st.pending.city_id, 'the settling is a book row')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc czeka na nazwę nowego miasta.', 'the night waits for the name')
  await as(B)
  ok((await rpcErr(`select chaos_name_city($1, 'Cudze')`, [game.id])) !== null, 'a stranger does not name it')
  await as(A)
  ok((await rpcErr(`select chaos_name_city($1, '   ')`, [game.id])) !== null, 'a name is needed')
  st = (await q(`select * from chaos_name_city($1, 'Gniazdo Mew')`, [game.id]))[0]
  const tribeCity = (await q('select * from cities where entity_id = $1', [settle.outcome.new_city_id]))[0]
  ok(st.status === 'running' && (await q('select name from entities where id = $1', [tribeCity.entity_id]))[0].name === 'Gniazdo Mew' && tribeCity.atheists === 1 && tribeCity.q === 0 && tribeCity.r === 1, 'the city is named; its first people are godless')
  const founded = (await q(`select * from actions_log where action_key = 'night_city_founded' and (outcome->>'city_id') = $1`, [tribeCity.entity_id]))[0]
  ok(founded.outcome.by === 'tribe' && founded.outcome.name === 'Gniazdo Mew' && founded.outcome.name_pending === false, 'the founding row remembers the name')
  // the city on poor land: 11 + fertility 1 - population 5 = 7 means a colony; the best land holds the wolves
  // (the eaten tribe may still sit in the queue before the city: a step over it moves nothing)
  const cityRowsBefore = (await q(`select count(*)::int as n from actions_log where action_key = 'night_city'`))[0].n
  for (let i = 0; i < 3; i++) {
    st = (await q(`select * from chaos_step($1)`, [game.id]))[0]
    if ((await q(`select count(*)::int as n from actions_log where action_key = 'night_city'`))[0].n > cityRowsBefore) break
  }
  const cityRow = (await q(`select * from actions_log where action_key = 'night_city' order by created_at desc limit 1`))[0]
  ok(cityRow.roll.d1 === 5 && cityRow.roll.d2 === 6 && cityRow.roll.total === 7 && cityRow.outcome.fertility === 1 && cityRow.outcome.population === 5 && cityRow.outcome.result === 'colony' && cityRow.outcome.overflow === 4 && cityRow.outcome.target_kind === 'beast' && cityRow.outcome.target.q === 0 && cityRow.outcome.target.r === 0, 'the surplus marches on the richest field within two, where a beast waits')
  ok(cityRow.outcome.groups.reduce((n, g) => n + g.n, 0) === 4 && cityRow.outcome.groups[0].player_id === null && cityRow.outcome.groups[0].n === 1, 'the godless leave first')
  ok(st.status === 'fight' && st.pending.scene === 'exodus_beast' && st.pending.left.mod === 4 && st.pending.right.entity_id === wolves, 'settlers against the beast: four of them, one beast of strength one')
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === 1 && cityRow.outcome.source_destroyed === false, 'one stayed behind')
  await fixDice(6)
  st = (await q(`select * from chaos_fight_roll($1, 'left')`, [game.id]))[0]
  await fixDice(1)
  st = (await q(`select * from chaos_fight_roll($1, 'right')`, [game.id]))[0]
  await fixDice(null)
  const fight2 = (await q(`select * from actions_log where action_key = 'night_fight' order by created_at desc limit 1`))[0]
  ok(st.status === 'verdict' && fight2.outcome.result === 'founded' && fight2.outcome.removed === true && fight2.outcome.new_city_id && st.pending.next && st.pending.next.kind === 'naming' && st.pending.next.city_id === fight2.outcome.new_city_id, 'the settlers win: the beast is gone and a city waits behind the verdict')
  ok((await q('select status from entities where id = $1', [wolves]))[0].status === 'dead', 'the last of the wolves died there')
  st = (await q(`select * from chaos_ack_fight($1)`, [game.id]))[0]
  ok(st.status === 'naming' && st.pending.city_id === fight2.outcome.new_city_id && [actor.id, otherP.id].includes(st.pending.namer_id), 'the host read it for everyone: the new city waits for a name from the god with the most settlers')
  cityB = (await q('select * from cities where entity_id = $1', [fight2.outcome.new_city_id]))[0]
  ok(cityB.q === 0 && cityB.r === 0 && (await q('select city_dots($1) as d', [cityB.entity_id]))[0].d === 4 && cityB.atheists === 1, 'four settled: one godless and three faithful')
  ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = 0', [sapient.entity_id]))[0].n === 1, 'the people of the mother city stand on the new field')
  ok((await q('select parent_civilization_id as p from entities where id = $1', [cityB.entity_id]))[0].p === civ.entity_id, 'the new city remembers its mother')
  st = (await q(`select * from chaos_name_city($1, 'Przystań')`, [game.id]))[0]
  // nothing left to move: the night ends the round
  const notesBefore = (await q(`select count(*)::int as n from actions_log where action_key = 'chaos_notes'`))[0].n
  st = (await q(`select * from chaos_step($1)`, [game.id]))[0]
  ok(st.status === 'done', 'the night is over')
  ok((await rpcErr(`select chaos_step($1)`, [game.id])) === 'Noc nie trwa.', 'no step after the night')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'cities_grow'`))[0].n === 0, 'no city grows for its ruler any more')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'night_move'`))[0].n === 3 && (await q(`select count(*)::int as n from actions_log where action_key = 'night_fight'`))[0].n === 2 && (await q(`select count(*)::int as n from actions_log where action_key = 'night_city_founded'`))[0].n === 2, 'three moves, two fights, two cities in the book')
  ok((await q('select hp from entities where id = $1', [av.entity_id]))[0].hp === 2, 'a sleeping avatar heals one life')
  ok((await q(`select hold from prophecies where game_id = $1 and status = 'active'`, [game.id]))[0].hold === 2, 'an active prophecy ripens to two')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'avatars_heal'`))[0].n === 1, 'the healing is a book row')
  g = (await q('select * from games where id = $1', [game.id]))[0]
  players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
  ok(g.round_number === 2 && g.phase === 'rolling', 'round 2, rolling')
  const chaosNotes = await q(`select summary from actions_log where action_key = 'chaos_notes' order by created_at`)
  ok(chaosNotes.length === notesBefore + 2 && chaosNotes[0].summary === 'Pierwsza karta bez sensu.' && chaosNotes[1].summary === 'Rzeka zmienia bieg.', 'every card description of the round copied to the chronicle')
  ok((await q(`select resolution_notes from chaos_draws where id = $1`, [first.id]))[0].resolution_notes === 'Pierwsza karta bez sensu.', 'notes go to the live card only')
  ok(players.every((p) => !p.is_resting && !p.has_rolled && !p.avatar_action_used), 'flags reset')
  const reward = (await q(`select * from actions_log where action_key = 'dots_reward'`))[0]
  const totals = await q('select player_id, sum(dots)::int as total from city_followers f join cities c on c.entity_id = f.city_id where f.game_id = $1 group by player_id order by total desc', [game.id])
  ok(reward && totals.every((t) => reward.outcome.find((r) => r.player_id === t.player_id).total === t.total), 'the reward row ranks the faithful by believers only')
  ok(players.find((p) => p.id === otherP.id).low_logos_streak === 1, 'low-logos streak +1 for the god who ended at 3')
  ok(players.find((p) => p.id === actor.id).low_logos_streak === 0, 'no streak for the god above 5')
  {
    // the ceiling: ten people and no more
    const believers = (await q('select city_believers($1) as b', [cityB.entity_id]))[0].b
    await db.query('update cities set atheists = $2 where entity_id = $1', [cityB.entity_id, 10 - believers])
    ok((await q('select city_add_dots($1, $2, 2) as n', [cityB.entity_id, actor.id]))[0].n === 0, 'a city of ten takes nobody')
    await db.query('update cities set atheists = $2 where entity_id = $1', [cityB.entity_id, 9 - believers])
    ok((await q('select city_add_dots($1, $2, 2) as n', [cityB.entity_id, actor.id]))[0].n === 1, 'only the room left is filled')
    // ruin: a city without people is wiped off the map
    await db.query('delete from city_followers where city_id = $1', [cityB.entity_id])
    await db.query('update cities set atheists = 0 where entity_id = $1', [cityB.entity_id])
    ok((await q('select destroy_city_if_empty($1, 2, 1::smallint) as d', [cityB.entity_id]))[0].d === true, 'an empty city becomes a ruin')
    ok((await q('select status from entities where id = $1', [cityB.entity_id]))[0].status === 'destroyed' && (await q('select count(*)::int as n from cities where entity_id = $1', [cityB.entity_id]))[0].n === 0, 'the ruin is gone from the map, the name stays in the book')
    ok((await q('select attributes from entities where id = $1', [cityB.entity_id]))[0].attributes.ruin.r === 0, 'the ruin remembers where it stood')
    ok((await q(`select count(*)::int as n from actions_log where action_key = 'city_destroyed' and entity_id = $1`, [cityB.entity_id]))[0].n === 1, 'the fall is written down')
  }
  // famine: a 2 on the dice against fertility 1 with one soul left ruins the mother city
  await db.query(`update games set phase = 'chaos' where id = $1`, [game.id])
  await db.query('delete from test_dice')
  await fixDice(1)
  await db.query('select night_unit_city($1, $2)', [game.id, civ.entity_id])
  await fixDice(null)
  {
    const famine = (await q(`select * from actions_log where action_key = 'night_city' order by created_at desc limit 1`))[0]
    ok(famine.outcome.result === 'famine' && famine.roll.total === 2 + 1 - 1 && famine.outcome.lost && famine.outcome.source_destroyed === true, 'famine takes the last soul and the city falls')
    ok((await q('select status from entities where id = $1', [civ.entity_id]))[0].status === 'destroyed', 'the mother city is a ruin')
  }
  // the skip of one phase: the rest of the herds at once, then the night waits again
  await as(A)
  st = (await q(`select * from start_chaos_night($1)`, [game.id]))[0]
  ok(st.queue[0].t === 'herbivore' && st.queue.filter((u) => u.t === 'herbivore').length === 2, 'a new night: two herds first')
  await as(B)
  ok((await rpcErr(`select chaos_skip_phase($1)`, [game.id])) !== null, 'the phase is skipped by the host')
  await as(A)
  st = (await q(`select * from chaos_skip_phase($1)`, [game.id]))[0]
  ok(st.status !== 'running' || st.cursor >= st.queue.length || st.queue[st.cursor].t !== 'herbivore', 'the herds are done; the night stands at the next phase or at a window that waits for the table')
  await db.query('delete from chaos_nights where game_id = $1', [game.id])
  await db.query(`update games set phase = 'chaos' where id = $1`, [game.id])
  // the skip: a whole night at once, fights rolled by the book, placeholders kept
  await db.query('update cities set atheists = 0 where entity_id = $1', [civ.entity_id])
  await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 4), ($1, $2, $4, 4) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id])
  await as(B)
  ok((await rpcErr(`select chaos_skip($1)`, [game.id])) !== null, 'the night is skipped by the host')
  await as(A)
  await db.query(`select chaos_skip($1)`, [game.id])
  const after = (await q('select * from chaos_nights where game_id = $1', [game.id]))[0]
  g = (await q('select * from games where id = $1', [game.id]))[0]
  ok(after.status === 'done' && after.round_number === 2 && g.round_number === 3 && g.phase === 'rolling', 'the skip plays the whole night and ends the round')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'night_city_founded' and (outcome->>'name_pending') = 'true'`))[0].n === 0, 'no city waits for a name after a skip')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'round_end'`))[0].n === 2, 'two rounds ended')
  await db.query(`update games set round_number = 2, phase = 'rolling' where id = $1`, [game.id])
  await db.query('update players set has_rolled = false where game_id = $1', [game.id])
  await db.query('update players set low_logos_streak = 1, logos = 3 where id = $1', [otherP.id])
}

await as(actor.user_id)
const r2 = (await q(`select * from roll_logos($1)`, [game.id]))[0]
ok(r2.bonus_orthodoxy === 0 && r2.total === r2.die1 + r2.die2, 'logos roll without religions')
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
ok((await q(`select action_cost('create_faction', 1::smallint) as c`))[0].c === null, 'factions are no longer an action')

console.log('\n# RLS as authenticated role')
const C = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users (id, email) values ('${C}', 'gamma@example.com')`)
const entityCount = (await q('select count(*)::int as n from entities'))[0].n
const hexCount = (await q('select count(*)::int as n from hexes'))[0].n
await db.exec('set role authenticated')
await as(C)
ok((await q('select * from games'))[0] === undefined, 'outsider sees no games')
ok((await q('select * from players'))[0] === undefined, 'outsider sees no players')
ok((await q('select * from hexes'))[0] === undefined, 'outsider sees no map')
await as(A)
ok((await q('select * from games')).length === 1, 'member sees their game')
ok((await q('select * from entities')).length === entityCount, `member sees all ${entityCount} entities`)
ok((await q('select * from hexes')).length === hexCount && (await q('select * from city_followers')).length > 0 && (await q('select * from contests')).length === 9, 'member sees the map, the dots and the contests')
ok((await q('select * from chaos_nights')).length === 1 && (await q('select * from rivers')).length === 0, 'member sees the night; rivers are readable')
ok((await q('select * from creation_options')).length === 1, 'member sees creation options')
const pal = await rpcErr(`insert into palette_entries (game_id, player_id, "column", text) values ($1, $2, 'no', 'x')`, [game.id, players[1].id])
ok(pal !== null, 'cannot insert palette entry as another player')
const direct = await rpcErr('update players set logos = 999 where game_id = $1', [game.id])
ok(direct !== null || (await q('select logos from players where user_id = $1', [A]))[0].logos !== 999, 'direct logos edit blocked by RLS')
const directHex = await rpcErr(`update hexes set biome = 'woda' where game_id = $1`, [game.id])
ok(directHex !== null || (await q(`select count(*)::int as n from hexes where game_id = $1 and biome <> 'woda'`, [game.id]))[0].n > 0, 'direct map edit blocked by RLS')
await db.exec('reset role')

console.log('\n# deleting a world')
await as(B)
ok((await rpcErr(`select delete_game($1)`, [game.id])) !== null, 'non-host cannot delete the world')
await as(A)
await db.query(`select delete_game($1)`, [game.id])
ok((await q('select count(*)::int as n from games'))[0].n === 0, 'host deleted the world')
ok((await q('select count(*)::int as n from entities'))[0].n === 0 && (await q('select count(*)::int as n from actions_log'))[0].n === 0 && (await q('select count(*)::int as n from hexes'))[0].n === 0 && (await q('select count(*)::int as n from contests'))[0].n === 0, 'everything cascaded, the map too')

console.log('\n# logins and guests')
const G = '44444444-4444-4444-4444-444444444444'
const L = '55555555-5555-5555-5555-555555555555'
ok((await rpcErr(`insert into auth.users (id, email) values ('${G}', null)`)) === null, 'a guest (no e-mail) can be created')
ok((await q('select display_name from profiles where id = $1', [G]))[0]?.display_name === '', 'guest profile starts with an empty name')
await as(G)
await db.query(`select set_display_name('Wędrowiec')`)
ok((await q('select display_name from profiles where id = $1', [G]))[0].display_name === 'Wędrowiec', 'guest picked a name')
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${L}', 'michal_7@panteon.invalid', '{"display_name":"Michał_7"}')`)
ok((await q('select display_name from profiles where id = $1', [L]))[0].display_name === 'Michał_7', 'registered login becomes the player name')

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
