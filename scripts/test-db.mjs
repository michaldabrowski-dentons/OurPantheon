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

for (const f of ['0001_schema.sql', '0002_rls.sql', '0003_functions.sql', '0004_realtime.sql', '0005_world_creation.sql', '0006_chronicle_book.sql', '0007_god_gender.sql', '0008_login_and_guests.sql', '0009_creation_sync.sql', '0010_ensure_turn.sql']) {
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
await db.query(`select set_god($1, 'Ta Pod Rzeką', 'fresco-06', 'bogini rzek i cierpliwości', 'f')`, [game.id])
const godRow = (await q('select god_description, god_gender from players where user_id = $1', [A]))[0]
ok(godRow.god_description === 'bogini rzek i cierpliwości' && godRow.god_gender === 'f', 'god description and gender saved')
ok((await rpcErr(`select set_god($1, 'X', 'fresco-06', '', 'x')`, [game.id])) !== null, 'unknown gender refused')
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
const sapient = await q(
  `select * from perform_action($1, 'create_sapient', $2::jsonb)`,
  [game.id, JSON.stringify({ summary: 'Sowy', entity: { op: 'create', kind: 'creature', name: 'Sowy', traits: ['Rozumne', 'Nocne'] } })],
)
ok(sapient[0].logos_delta === -15, 'sapient creature costs 15 in era I')
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
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, entity: { op: 'create', kind: 'avatar', name: 'x', conditions: ['a'] } })])) !== null, 'free avatar action refused without an avatar')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ entity: { op: 'create', kind: 'avatar', name: 'Bez uwarunkowań' } })])) !== null, 'an avatar without conditions is refused')
ok((await rpcErr(`select perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ entity: { op: 'create', kind: 'avatar', name: 'Za dużo', conditions: ['a', 'b', 'c', 'd'] } })])) !== null, 'an avatar with four conditions is refused')
const av = await q(`select * from perform_action($1, 'create_avatar', $2::jsonb)`, [game.id, JSON.stringify({ entity: { op: 'create', kind: 'avatar', name: 'Posąg', conditions: ['Są nieożywionym przedmiotem.'] } })])
ok(av[0].entity_id !== null, 'avatar created with one condition')
await topUp()
const free = await q(`select * from perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, summary: 'Kontynent unosi się.' })])
ok(free[0].logos_delta === 0 && free[0].is_avatar_free_action, 'avatar free action costs 0')
ok((await q('select status from entities where id = $1', [av[0].entity_id]))[0].status === 'dead', 'a Great Miracle through the avatar destroys it')
ok((await q(`select count(*)::int as n from actions_log where action_key = 'entity_edit' and entity_id = $1 and summary like 'I spłonął awatar%Wielkim Cudzie%'`, [av[0].entity_id]))[0].n === 1, 'the destruction is a Chronicle line, told in the past')
ok((await rpcErr(`select perform_action($1, 'great_miracle', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true })])) !== null, 'second free avatar action in a round refused')
// test-only: bring the avatar back and reopen the free action to check the once-per-Era creature rule
await db.query('update entities set status = $2 where id = $1', [av[0].entity_id, 'active'])
await db.query('update players set avatar_action_used = false where id = $1', [actor.id])
await topUp()
const freeCreature = await q(`select * from perform_action($1, 'create_creature', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, entity: { op: 'create', kind: 'creature', name: 'Ćmy', traits: ['Nocne'] } })])
ok(freeCreature[0].logos_delta === 0 && freeCreature[0].entity_id, 'the avatar creates a creature for free once')
await db.query('update players set avatar_action_used = false where id = $1', [actor.id])
await topUp()
ok((await rpcErr(`select perform_action($1, 'create_sapient', $2::jsonb)`, [game.id, JSON.stringify({ use_avatar_action: true, entity: { op: 'create', kind: 'creature', name: 'Znowu', traits: ['Rozumne'] } })])) !== null, 'a second creature through the avatar in the same Era is refused')
ok(!(await q('select avatar_action_used from players where id = $1', [actor.id]))[0].avatar_action_used, 'the refused action does not spend the free action')

console.log('\n# free edits: religion <-> faction, sapient, avatar death, removal')
await db.query(`select edit_entity($1, '{"kind":"faction"}'::jsonb)`, [orth[0].entity_id])
ok((await q('select count(*)::int as n from entity_gods where entity_id = $1', [orth[0].entity_id]))[0].n === 0, 'religion -> faction drops its gods')
await db.query(`select edit_entity($1, '{"kind":"orthodoxy","requirements":["Szerzyć","Bronić"]}'::jsonb)`, [orth[0].entity_id])
const rePins = await q('select * from entity_gods where entity_id = $1', [orth[0].entity_id])
ok(rePins.length === 1 && rePins[0].player_id === actor.id, 'faction -> religion pins the editing god')
ok((await rpcErr(`select edit_entity($1, '{"kind":"avatar"}'::jsonb)`, [orth[0].entity_id])) !== null, 'other kind changes refused')
await db.query(`select edit_entity($1, '{"traits":["Łagodne"]}'::jsonb)`, [creature[0].entity_id])
ok((await q('select traits from entities where id = $1', [creature[0].entity_id]))[0].traits.join() === 'Łagodne', 'traits patched (sapience toggled off)')
await db.query(`select edit_entity($1, $2::jsonb)`, [civ[0].entity_id, JSON.stringify({ name: 'Stoicy Znad Rzeki', image_key: 'fresco-05', description: 'Liczą pory roku po barwie wody.', specialties: ['Rolnictwo', 'Handel'], flaws: ['Magia', 'Ziemia'] })])
const civRow = (await q('select * from entities where id = $1', [civ[0].entity_id]))[0]
ok(civRow.name === 'Stoicy Znad Rzeki' && civRow.image_key === 'fresco-05' && civRow.specialties.length === 2 && civRow.flaws.join() === 'Magia,Ziemia', 'full edit: name, fresco, description, specialties, flaws')
await db.query(`select edit_entity($1, $2::jsonb)`, [orth[0].entity_id, JSON.stringify({ parent_civilization_id: '', desires: ['Ochrona'], faction_type: 'Rodzina' })])
const orthRow = (await q('select * from entities where id = $1', [orth[0].entity_id]))[0]
ok(orthRow.parent_civilization_id === null && orthRow.desires.join() === 'Ochrona' && orthRow.faction_type === 'Rodzina', 'full edit: civilization unset, desires, type')
await db.query(`select edit_entity($1, $2::jsonb)`, [orth[0].entity_id, JSON.stringify({ parent_civilization_id: civ[0].entity_id })])
ok((await rpcErr(`select edit_entity($1, $2::jsonb)`, [orth[0].entity_id, JSON.stringify({ parent_civilization_id: creature[0].entity_id })])) !== null, 'parent must be a civilization of this game')
await db.query(`select edit_entity($1, '{"status":"dead"}'::jsonb)`, [av[0].entity_id])
ok((await q('select status from entities where id = $1', [av[0].entity_id]))[0].status === 'dead', 'avatar marked dead')
ok((await rpcErr(`select edit_entity($1, '{"status":"dead"}'::jsonb)`, [creature[0].entity_id])) !== null, 'death only for avatars')
await db.query(`select edit_entity($1, '{"status":"active"}'::jsonb)`, [av[0].entity_id])
await topUp()
const fac = await q(`select * from perform_action($1, 'create_faction', $2::jsonb)`, [game.id, JSON.stringify({ entity: { op: 'create', kind: 'faction', name: 'Rada', faction_type: 'Organ rządzący', parent_civilization_id: civ[0].entity_id } })])
await db.query(`select delete_entity($1)`, [fac[0].entity_id])
ok((await q('select count(*)::int as n from entities where id = $1', [fac[0].entity_id]))[0].n === 0, 'faction removed')
ok((await q(`select summary from actions_log where action_key = 'entity_removed'`))[0].summary === 'Rada', 'removal written to the chronicle as the name (the verse is composed in the client)')
ok((await q(`select count(*)::int as n from actions_log where action_key = 'entity_edit' and summary like 'I stała się religia Cisi neutralną frakcją%'`))[0].n === 1, 'religion -> faction told in the past')

console.log('\n# rest -> chaos')
const dice = await q(`select * from log_dice_roll($1, 'test')`, [game.id])
ok(dice[0].roll.total === dice[0].roll.d1 + dice[0].roll.d2 && dice[0].roll.modifier === 0, 'shared dice logged')
const penalised = await q(`select * from log_dice_roll($1, 'Stworzenie Frakcji', -2)`, [game.id])
ok(penalised[0].roll.total === penalised[0].roll.d1 + penalised[0].roll.d2 - 2 && penalised[0].roll.modifier === -2, "the avatar's -2 is applied to the roll")
ok((await rpcErr(`select log_dice_roll($1, 'x', 9)`, [game.id])) !== null, 'roll modifier is bounded')
await db.query(`select adjust_logos($1, 5, 'Danina')`, [game.id])
ok((await rpcErr(`select adjust_logos($1, 9, 'za dużo')`, [game.id])) !== null, 'adjust_logos bounded')
await db.query(`select rest($1)`, [game.id])
g = (await q('select * from games where id = $1', [game.id]))[0]
ok(g.phase === 'gods' && g.current_turn_player_id !== actor.id, 'after rest, turn goes to the other god')
const otherP = (await q('select * from players where game_id = $1 and id <> $2', [game.id, actor.id]))[0]
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

console.log('\n# round end bookkeeping')
await db.query('update players set logos = 3 where id = $1', [otherP.id])
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
ok((await q('select * from entities')).length === 6, 'member sees all 6 entities')
ok((await q('select * from creation_options')).length === 1, 'member sees creation options')
const pal = await rpcErr(`insert into palette_entries (game_id, player_id, "column", text) values ($1, $2, 'no', 'x')`, [game.id, players[1].id])
ok(pal !== null, 'cannot insert palette entry as another player')
const direct = await rpcErr('update players set logos = 999 where game_id = $1', [game.id])
ok(direct !== null || (await q('select logos from players where user_id = $1', [A]))[0].logos !== 999, 'direct logos edit blocked by RLS')
await db.exec('reset role')

console.log('\n# deleting a world')
await as(B)
ok((await rpcErr(`select delete_game($1)`, [game.id])) !== null, 'non-host cannot delete the world')
await as(A)
await db.query(`select delete_game($1)`, [game.id])
ok((await q('select count(*)::int as n from games'))[0].n === 0, 'host deleted the world')
ok((await q('select count(*)::int as n from entities'))[0].n === 0 && (await q('select count(*)::int as n from actions_log'))[0].n === 0, 'everything cascaded')

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
