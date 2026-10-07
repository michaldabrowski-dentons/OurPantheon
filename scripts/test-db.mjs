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

for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_functions.sql', '0004_realtime.sql', '0005_world_creation.sql', '0006_chronicle_book.sql', '0007_god_gender.sql', '0008_login_and_guests.sql', '0009_creation_sync.sql', '0010_ensure_turn.sql', '0011_playbooks.sql', '0012_hex_map.sql']) {
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
const J = (o) => JSON.stringify(o)

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
await db.query(`select set_god($1, 'Ta Pod Rzeką', 'bogini rzek i cierpliwości', 'f', 'harvest', 'grace', 'wisdom', 'Śpi pod rzeką od początku świata.')`, [game.id])
const godRow = (await q('select god_description, god_gender, domain_key, attr_primary, attr_bonus, god_notes from players where user_id = $1', [A]))[0]
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
{
  const ring = (await q(`select count(*) filter (where biome = 'woda')::int as w, count(*)::int as n from hexes where game_id = $1 and hex_distance(0, 0, q, r) >= 4`, [game.id]))[0]
  ok(ring.w >= ring.n * 0.6, `outer rings are mostly water (${ring.w} of ${ring.n})`)
  const land = (await q(`select count(*)::int as n from hexes where game_id = $1 and hex_distance(0, 0, q, r) < 4 and biome <> 'woda'`, [game.id]))[0].n
  ok(land === 37, `a continent in the middle (${land} land hexes within distance 3)`)
  const decor = (await q(`select count(*)::int as n from hexes where game_id = $1 and biome in ('puszcza', 'dzungla', 'gory') and jsonb_array_length(decor) = 0`, [game.id]))[0].n
  ok(decor === 0, 'forests, jungles and mountains carry decorations')
  ok((await q(`select hex_distance(0, 0, 3, -1) as a, hex_distance(2, -2, 0, 0) as b, hex_distance(1, 0, 1, -1) as c`))[0].a === 3, 'hex distance in axial coordinates')
}
// a deterministic neighbourhood for the checks below
await db.query(`update hexes set biome = 'trawa', decor = '[]' where game_id = $1 and (q, r) in ((0, 0), (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1))`, [game.id])
await db.query(`update hexes set biome = 'woda', decor = '[]' where game_id = $1 and (q, r) in ((2, -2))`, [game.id])
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
  await db.query(`select perform_action($1, 'shape_land', '{"biome":"wzgorza","hexes":[{"q":-1,"r":0}]}')`, [game.id])
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

console.log('\n# shaping the land')
g = (await q('select * from games where id = $1', [game.id]))[0]
const actor = (await q('select * from players where id = $1', [g.current_turn_player_id]))[0]
const otherP = (await q('select * from players where game_id = $1 and id <> $2', [game.id, actor.id]))[0]
await as(actor.user_id)
// test-only: give the actor plenty of Logos before each purchase so the turn stays put
const topUp = async () => {
  await db.query('update players set logos = 60 where id = $1', [actor.id])
  await db.query(`select recompute_turn($1)`, [game.id])
}
await topUp()
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 0, r: 0 }, { q: 2, r: 0 }] })])) !== null, 'hexes that do not touch are refused')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'lawa', hexes: [{ q: 0, r: 0 }] })])) !== null, 'unknown biome refused')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }] })])) !== null, 'four hexes refused')
const shaped = (await q(`select * from perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'puszcza', hexes: [{ q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 0 }] })]))[0]
ok(shaped.logos_delta === -2 && shaped.outcome.hexes.length === 3 && shaped.outcome.hexes[1].from === 'trawa', 'three touching hexes reshaped, the old biomes remembered')
ok((await q(`select count(*)::int as n from hexes where game_id = $1 and biome = 'puszcza' and (q, r) in ((1, -1), (1, 0), (0, 0))`, [game.id]))[0].n === 3, 'the map changed')
await db.query(`update hexes set biome = 'trawa', decor = '[]' where game_id = $1 and (q, r) in ((0, 0), (1, 0), (1, -1))`, [game.id])

console.log('\n# life on the map')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Manule', traits: ['Łagodne'] }, q: 0, r: 0 })])) !== null, 'a creature needs an emoji')
const creature = (await q(`select * from perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Manule', traits: ['Łagodne'] }, emoji: '🐱', q: 0, r: 0 })]))[0]
ok(creature.logos_delta === -10 && creature.entity_id && creature.outcome.slot === 0, 'creature created for 10 logos in slot 0')
ok((await rpcErr(`select perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Drugie Manule', traits: ['Łagodne'] }, emoji: '🐱', q: 1, r: 0 })])) !== null, 'the same emoji twice is refused')
await topUp()
const sapient = (await q(`select * from perform_action($1, 'create_sapient', $2::jsonb)`, [game.id, J({ entity: { name: 'Sowy', traits: ['Rozumne', 'Nocne'] }, emoji: '🦉', q: 0, r: 0 })]))[0]
ok(sapient.logos_delta === -15 && sapient.outcome.slot === 1, 'sapient creature costs 15 and takes the next slot')
await topUp()
const third = (await q(`select * from perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Myszy', traits: ['Płochliwe'] }, emoji: '🐭', q: 0, r: 0, slot: 2 })]))[0]
ok(third.outcome.slot === 2, 'third slot filled on request')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Czwarte', traits: [] }, emoji: '🐸', q: 0, r: 0 })])) !== null, 'a full hex takes nobody else')
const octopus = (await q(`select * from perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ entity: { name: 'Ośmiornice', traits: ['Wodne'] }, emoji: '🐙', q: 2, r: -2 })]))[0]
ok(octopus.outcome.biome === 'woda', 'creatures may live on water')
await topUp()
ok((await rpcErr(`select perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: 0, r: 0 } })])) !== null, 'migration needs a different hex')
const mig = (await q(`select * from perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: 2, r: -2 } })]))[0]
ok(mig.logos_delta === -2 && mig.outcome.distance === 2, 'migration costs its distance (2 hexes, 2 Logos)')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1', [sapient.entity_id]))[0].n === 2, 'the species now lives on two hexes')
ok((await rpcErr(`select perform_action($1, 'migrate', $2::jsonb)`, [game.id, J({ entity_id: sapient.entity_id, from: { q: 0, r: 0 }, to: { q: 2, r: -2 } })])) !== null, 'cannot migrate where the species already lives')
await topUp()
const owlOcc = (await q('select * from hex_occupants where entity_id = $1 and q = 2 and r = -2', [sapient.entity_id]))[0]
const variant = (await q(`select * from perform_action($1, 'change_creature', $2::jsonb)`, [game.id, J({ occupant_id: owlOcc.id, entity: { name: 'Sowy Morskie', traits: ['Rozumne', 'Nocne', 'Wodne'] }, emoji: '🦆' })]))[0]
ok(variant.logos_delta === -5 && variant.entity_id !== sapient.entity_id, 'a variant is a new creature')
ok((await q('select entity_id from hex_occupants where id = $1', [owlOcc.id]))[0].entity_id === variant.entity_id, 'only that hex changed')
ok((await q(`select count(*)::int as n from entity_links where from_entity_id = $1 and to_entity_id = $2 and relation = 'variant_of'`, [variant.entity_id, sapient.entity_id]))[0].n === 1, 'variant linked to its origin')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1', [sapient.entity_id]))[0].n === 1, 'the original species keeps its other hex')

console.log('\n# cities')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Kocia Rada', traits: ['Zachowawcza'] }, q: 0, r: 0, species_id: creature.entity_id })])) !== null, 'a plain creature founds no city')
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Sowy Morskie', traits: [] }, q: 2, r: -2, species_id: variant.entity_id })])) !== null, 'no city on water')
const civ = (await q(`select * from perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Stoicy', traits: ['Zachowawcza'], specialties: ['Rolnictwo'], flaws: ['Magia'] }, q: 0, r: 0, species_id: sapient.entity_id })]))[0]
ok(civ.logos_delta === -22 && civ.outcome.q === 0, 'civilization founded for 22 in era I')
ok((await q('select count(*)::int as n from cities where entity_id = $1 and q = 0 and r = 0', [civ.entity_id]))[0].n === 1, 'the city stands on its hex')
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 1, 'one dot of the founding god')
const links = await q('select * from entity_links where from_entity_id = $1', [civ.entity_id])
ok(links.length === 1 && links[0].relation === 'member_species', 'civilization linked to its species')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_civilization', $2::jsonb)`, [game.id, J({ entity: { name: 'Drugie', traits: [] }, q: 0, r: 0, species_id: sapient.entity_id })])) !== null, 'one city per hex')
ok((await rpcErr(`select perform_action($1, 'shape_land', $2::jsonb)`, [game.id, J({ biome: 'woda', hexes: [{ q: 0, r: 0 }] })])) !== null, 'a city cannot be drowned by shaping')
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'wrath', gift: 'Ogień' })])) !== null, 'development is Łaska or Mądrość')
ok((await rpcErr(`select perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'grace', gift: '  ' })])) !== null, 'a gift needs words')
const dev = (await q(`select * from perform_action($1, 'develop_civilization', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, attr: 'grace', gift: 'Ogień' })]))[0]
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
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 5, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Za Dużo' })])) !== null, 'exodus of more dots than owned refused')
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 0, r: 2 }, name: 'W Górach' })])) !== null, 'no exodus into mountains')
ok((await rpcErr(`select perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: creature.entity_id, to: { q: 1, r: -1 }, name: 'Kocie' })])) !== null, 'exodus takes a sapient species')
const exo = (await q(`select * from perform_action($1, 'exodus', $2::jsonb)`, [game.id, J({ city_id: civ.entity_id, dots: 2, species_id: sapient.entity_id, to: { q: 1, r: -1 }, name: 'Nowe Sowiska', description: 'Wyszli nocą.' })]))[0]
ok(exo.logos_delta === -1 && exo.outcome.new === true && exo.outcome.distance === 1, 'exodus one hex away costs 1 and founds a city')
const newCity = (await q('select * from entities where id = $1', [exo.entity_id]))[0]
ok(newCity.name === 'Nowe Sowiska' && newCity.traits.join() === 'Zachowawcza' && newCity.parent_civilization_id === civ.entity_id, 'the new city inherits the traits of the mother city')
ok((await q('select player_dots($1, $2) as d', [newCity.id, actor.id]))[0].d === 2 && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 2, 'two dots moved, two stayed')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 1 and r = -1', [sapient.entity_id]))[0].n === 1, 'the species settled on the new hex')
ok((await q('select count(*)::int as n from city_gifts where city_id = $1', [newCity.id]))[0].n === (dev.outcome.gained > 0 ? 1 : 0), 'accepted gifts travel with the people')

console.log('\n# catastrophe')
await topUp()
const dotsBefore = (await q('select city_dots($1) as d', [civ.entity_id]))[0].d
const occBefore = (await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n
const cat = (await q(`select * from perform_action($1, 'catastrophe', $2::jsonb)`, [game.id, J({ type: 'meteor', q: 0, r: 0 })]))[0]
{
  const o = cat.outcome
  ok(cat.logos_delta === -10 && o.damage === Math.max(1, o.d6 + o.wrath) && o.damage >= 1, `catastrophe: d6 ${o.d6} + Gniew ${o.wrath} = ${o.damage} damage`)
  ok(o.hits.length <= o.damage && o.hits.length + o.wasted === o.damage, `${o.hits.length} hit(s), ${o.wasted} wasted`)
  const dotHits = o.hits.filter((h) => h.t === 'dot').length
  const creatureHits = o.hits.filter((h) => h.t === 'creature').length
  ok((await q('select city_dots($1) as d', [civ.entity_id]))[0].d === dotsBefore - dotHits, 'each dot hit removed one dot')
  ok((await q('select count(*)::int as n from hex_occupants where game_id = $1 and q = 0 and r = 0', [game.id]))[0].n === occBefore - creatureHits, 'each creature hit emptied one slot')
  const sapientHit = o.hits.some((h) => h.t === 'creature' && h.entity_id === sapient.entity_id)
  ok(!sapientHit || o.city_destroyed, 'sapients are spared while the city stands')
  ok(o.city_destroyed === ((await q('select count(*)::int as n from cities where entity_id = $1', [civ.entity_id]))[0].n === 0), 'a city with no dots left is a ruin')
}
// restore a deterministic state for the contests below
await db.query('delete from city_followers where city_id = $1', [civ.entity_id])
await db.query(`update entities set status = 'active' where id = $1`, [civ.entity_id])
await db.query(`insert into cities (entity_id, game_id, q, r) values ($1, $2, 0, 0) on conflict do nothing`, [civ.entity_id, game.id])
await db.query(`insert into hex_occupants (game_id, q, r, slot, entity_id) select $1, 0, 0, hex_free_slot($1, 0, 0), $2 where not exists (select 1 from hex_occupants where entity_id = $2 and q = 0 and r = 0)`, [game.id, sapient.entity_id])
await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 3), ($1, $5, $4, 2) on conflict (city_id, player_id) do update set dots = excluded.dots', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])

console.log('\n# avatars on the map')
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ use_avatar_action: true, entity: { name: 'x', conditions: ['a'] }, emoji: '🗿', q: 0, r: -1 })])) !== null, 'free avatar action refused without an avatar')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Bez uwarunkowań' }, emoji: '🗿', q: 0, r: -1 })])) !== null, 'an avatar without conditions is refused')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Za dużo', conditions: ['a', 'b', 'c', 'd'] }, emoji: '🗿', q: 0, r: -1 })])) !== null, 'an avatar with four conditions is refused')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Na wodzie', conditions: ['a'] }, emoji: '🗿', q: 2, r: -2 })])) !== null, 'an avatar does not stand on water')
const av = (await q(`select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, J({ entity: { name: 'Posąg', conditions: ['Są nieożywionym przedmiotem.'] }, emoji: '🗿', q: 0, r: -1 })]))[0]
ok(av.entity_id !== null && (await q('select hp from entities where id = $1', [av.entity_id]))[0].hp === 3, 'avatar created with 3 HP')
await topUp()
ok((await rpcErr(`select perform_action($1, 'command_avatar', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, to: { q: -1, r: 4 } })])) !== null, 'an avatar walks three hexes at most')
const walk = (await q(`select * from perform_action($1, 'command_avatar', $2::jsonb)`, [game.id, J({ avatar_id: av.entity_id, summary: 'Idzie na zachód.', to: { q: -1, r: 0 } })]))[0]
ok(walk.logos_delta === -3 && walk.outcome.distance === 1, 'a command with a one-hex walk costs 2 + 1')
ok((await q('select q, r from hex_occupants where entity_id = $1', [av.entity_id]))[0].q === -1, 'the avatar moved')
await topUp()
const free = (await q(`select * from perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, J({ use_avatar_action: true, summary: 'Kontynent unosi się.' })]))[0]
ok(free.logos_delta === 0 && free.is_avatar_free_action && free.summary === 'Kontynent unosi się.', 'avatar free action costs 0 and keeps the written verse')
ok((await q('select status from entities where id = $1', [av.entity_id]))[0].status === 'dead', 'a Great Miracle through the avatar destroys it')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1', [av.entity_id]))[0].n === 0, 'the dead avatar leaves the map')
ok((await q(`select count(*)::int as n from actions_log where action_key = 'entity_edit' and entity_id = $1 and summary like 'I spłonął awatar%Wielkim Cudzie%'`, [av.entity_id]))[0].n === 1, 'the destruction is a Chronicle line, told in the past')
ok((await rpcErr(`select perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, J({ use_avatar_action: true })])) !== null, 'second free avatar action in a round refused')
await topUp()
const res = (await q(`select * from perform_action($1, 'resurrect_avatar', $2::jsonb)`, [game.id, J({ entity: { op: 'update', id: av.entity_id, conditions: ['Są śmiertelne.'] }, q: 0, r: -1 })]))[0]
ok(res.logos_delta === -12 && (await q('select status, hp from entities where id = $1', [av.entity_id]))[0].hp === 3, 'resurrected with 3 HP')
ok((await q('select count(*)::int as n from hex_occupants where entity_id = $1 and q = 0 and r = -1', [av.entity_id]))[0].n === 1, 'the avatar returns to a chosen hex')
await db.query('update players set avatar_action_used = false where id = $1', [actor.id])
await topUp()
const freeCreature = (await q(`select * from perform_action($1, 'create_creature', $2::jsonb)`, [game.id, J({ use_avatar_action: true, entity: { name: 'Ćmy', traits: ['Nocne'] }, emoji: '🦋', q: -1, r: 1 })]))[0]
ok(freeCreature.logos_delta === 0 && freeCreature.entity_id, 'the avatar creates a creature for free once')
await db.query('update players set avatar_action_used = false where id = $1', [actor.id])
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_sapient', $2::jsonb)`, [game.id, J({ use_avatar_action: true, entity: { name: 'Znowu', traits: ['Rozumne'] }, emoji: '🐝', q: -1, r: 1 })])) !== null, 'a second creature through the avatar in the same Era is refused')
ok(!(await q('select avatar_action_used from players where id = $1', [actor.id]))[0].avatar_action_used, 'the refused action does not spend the free action')

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
ok((await rpcErr(`select answer_contest($1, 'wrath')`, [conv.id])) !== null, 'the defender answers with Majestat or Podszept')
const convDone = (await q(`select * from answer_contest($1, 'whisper')`, [conv.id]))[0]
{
  const o = convDone.outcome
  const diff = convDone.attacker_total - convDone.defender_total
  const expected = diff >= 3 ? 2 : diff >= 1 ? 1 : 0
  ok(convDone.status === 'resolved' && o.diff === diff && o.converted === expected, `conversion resolved: ${convDone.attacker_total} vs ${convDone.defender_total}, ${o.converted} converted`)
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, otherP.id]))[0].d === 3 - expected && (await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 5 + expected, 'dots changed hands')
  const row = (await q('select * from actions_log where id = $1', [convDone.log_id]))[0]
  ok(row.action_key === 'convert' && row.player_id === actor.id && row.roll.def.attr === 'whisper' && row.summary === '', 'the book has the contest row with both rolls, awaiting the verse')
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
ok((await rpcErr(`select declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 5, target_city_id: newCity.id, defender_id: otherP.id })])) !== null, 'at least one dot stays home')
ok((await rpcErr(`select declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: newCity.id, army: 1, target_city_id: civ.entity_id, defender_id: otherP.id })])) !== null, 'an army marches only from a city I hold')
const war = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 2, target_city_id: newCity.id, defender_id: otherP.id })]))[0]
ok(war.status === 'pending' && war.cost === 1 && war.army === 2 && war.attacker_mod === 2 + (await q(`select attr_score(p, 'wrath') as s from players p where id = $1`, [actor.id]))[0].s, 'war declared: cost is the distance, modifier is Gniew plus the army')
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 3, 'the army left the city')
await db.query(`select cancel_contest($1)`, [war.id])
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 5 && (await q('select logos from players where id = $1', [actor.id]))[0].logos === 60, 'a cancelled war refunds the army and the Logos')
ok((await q('select status from contests where id = $1', [war.id]))[0].status === 'cancelled', 'contest cancelled')
const war2 = (await q(`select * from declare_contest($1, 'holy_war', $2::jsonb)`, [game.id, J({ source_city_id: civ.entity_id, army: 4, target_city_id: newCity.id, defender_id: otherP.id })]))[0]
await as(otherP.user_id)
const warDone = (await q(`select * from answer_contest($1, 'grace')`, [war2.id]))[0]
{
  const o = warDone.outcome
  const diff = warDone.attacker_total - warDone.defender_total
  ok(warDone.defender_mod === (await q(`select attr_score(p, 'grace') as s from players p where id = $1`, [otherP.id]))[0].s + 2, 'defender modifier is the attribute plus the defending dots')
  let removed = 0, converted = 0, returned = 0, defLost = 0
  if (diff >= 3) { removed = 2; converted = 1; returned = 4 }
  else if (diff >= 1) { removed = 2; converted = 1; returned = 2 }
  else if (diff === 0) { defLost = 1; returned = 3 }
  else if (diff >= -2) { defLost = 1; returned = 1 }
  ok(o.diff === diff && o.removed === removed && o.converted === converted && o.returned === returned, `war resolved (${diff}): removed ${o.removed}, converted ${o.converted}, returned ${o.returned}`)
  ok((await q('select player_dots($1, $2) as d', [newCity.id, otherP.id]))[0].d === 2 - removed - defLost, 'the defender lost what the table says')
  ok((await q('select player_dots($1, $2) as d', [newCity.id, actor.id]))[0].d === converted, 'converted captives pray to the attacker')
  ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 1 + returned, 'survivors came home')
  ok(o.target_destroyed === (2 - removed - defLost + converted === 0), 'a city emptied by war is a ruin')
}
await as(actor.user_id)
await db.query(`select commit_contest($1, 'I była wojna.')`, [war2.id])

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

console.log('\n# round end: cities grow, the faithful pay')
// deterministic dots: the actor holds the old city 5:2, the other god alone holds the new one (2); after growth 6 vs 5
await db.query('delete from city_followers where game_id = $1', [game.id])
await db.query(`update entities set status = 'active' where id in ($1, $2)`, [civ.entity_id, newCity.id])
await db.query(`insert into cities (entity_id, game_id, q, r) values ($1, $3, 0, 0), ($2, $3, 1, -1) on conflict do nothing`, [civ.entity_id, newCity.id, game.id])
await db.query('insert into city_followers (game_id, city_id, player_id, dots) values ($1, $2, $3, 5), ($1, $2, $4, 2), ($1, $5, $4, 2)', [game.id, civ.entity_id, actor.id, otherP.id, newCity.id])
await db.query('update players set logos = 3 where id = $1', [otherP.id])
await db.query('update players set logos = 20 where id = $1', [actor.id])
await db.query(`select end_chaos_phase($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
players = await q('select * from players where game_id = $1 order by seat_order', [game.id])
ok(g.round_number === 2 && g.phase === 'rolling', 'round 2, rolling')
const chaosNotes = await q(`select summary from actions_log where action_key = 'chaos_notes' order by created_at`)
ok(chaosNotes.length === 2 && chaosNotes[0].summary === 'Pierwsza karta bez sensu.' && chaosNotes[1].summary === 'Rzeka zmienia bieg.', 'every card description of the round copied to the chronicle')
ok((await q(`select resolution_notes from chaos_draws where id = $1`, [first.id]))[0].resolution_notes === 'Pierwsza karta bez sensu.', 'notes go to the live card only')
ok(players.every((p) => !p.is_resting && !p.has_rolled && !p.avatar_action_used), 'flags reset')
ok(players.find((p) => p.id === otherP.id).low_logos_streak === 1, 'low-logos streak +1 for the god who ended at 3')
ok(players.find((p) => p.id === actor.id).low_logos_streak === 0, 'no streak for the god above 5')
ok((await q('select player_dots($1, $2) as d', [civ.entity_id, actor.id]))[0].d === 6 && (await q('select player_dots($1, $2) as d', [newCity.id, otherP.id]))[0].d === 3, 'each city grew by one dot for the god who holds it')
{
  const grow = (await q(`select * from actions_log where action_key = 'cities_grow'`))[0]
  ok(grow && grow.outcome.length === 2 && grow.player_id === null, 'growth written as one book row')
  const reward = (await q(`select * from actions_log where action_key = 'dots_reward'`))[0]
  ok(reward && reward.outcome.find((r) => r.player_id === actor.id).logos === 3 && reward.outcome.find((r) => r.player_id === otherP.id).logos === 2, 'reward row: +3 for the most followed, +2 for the second')
  ok(players.find((p) => p.id === actor.id).logos === 23 && players.find((p) => p.id === otherP.id).logos === 5, 'Logos paid out')
}
{
  // the ceiling: ten dots and no more
  await db.query('update city_followers set dots = 10 where city_id = $1 and player_id = $2', [newCity.id, otherP.id])
  ok((await q('select city_add_dots($1, $2, 2) as n', [newCity.id, actor.id]))[0].n === 0, 'a city of ten takes nobody')
  await db.query('update city_followers set dots = 9 where city_id = $1 and player_id = $2', [newCity.id, otherP.id])
  ok((await q('select city_add_dots($1, $2, 2) as n', [newCity.id, actor.id]))[0].n === 1, 'only the room left is filled')
  // ruin: a city without dots is wiped off the map
  await db.query('delete from city_followers where city_id = $1', [newCity.id])
  ok((await q('select destroy_city_if_empty($1, 2, 1::smallint) as d', [newCity.id]))[0].d === true, 'an empty city becomes a ruin')
  ok((await q('select status from entities where id = $1', [newCity.id]))[0].status === 'destroyed' && (await q('select count(*)::int as n from cities where entity_id = $1', [newCity.id]))[0].n === 0, 'the ruin is gone from the map, the name stays in the book')
  ok((await q(`select count(*)::int as n from actions_log where action_key = 'city_destroyed' and entity_id = $1`, [newCity.id]))[0].n === 1, 'the fall is written down')
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
ok((await q('select * from hexes')).length === hexCount && (await q('select * from city_followers')).length > 0 && (await q('select * from contests')).length === 3, 'member sees the map, the dots and the contests')
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
