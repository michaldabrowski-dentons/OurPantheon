// Dev-only preview of the game screens with fake data (no Supabase needed).
//   /preview?screen=game|chaos|rolling|lobby|room|palette|creation|login
//   &domain=0 (room: no domain yet), &sheet=p2 (game: that god's sheet open), &turn=me (game: my turn, 40 Logos)
//   &contest=defender|attacker|resolved|duel|war (game: a contest in that state; duel = I defend my avatar, war = I split the successes)
//   &lock=me (game: the book waits for my verse)
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '@/features/auth/AuthGate'
import { useGameStore } from '@/store/useGameStore'
import type { ActionLog, ActionPayload, BiomeKey, ChaosNight, City, CityFollower, CityGift, Contest, Entity, Game, Hex, HexOccupant, HexRef, NightPending, Player, Prophecy, River } from '@/lib/types'
import { generatePreviewMap, hexDistance, decorFor } from '@/lib/hex'
import { buildWorld } from '@/lib/world'
import { GamePage } from '@/features/game/GamePage'
import { LobbyPage } from '@/features/lobby/LobbyPage'
import { RoomWaiting } from '@/features/lobby/RoomWaiting'
import { PalettePage } from '@/features/palette/PalettePage'
import { WorldCreationPage } from '@/features/creation/WorldCreationPage'
import { TempleLogin } from '@/features/auth/TempleLogin'

const G = 'aaaaaaaa-0000-0000-0000-000000000001'
const U1 = 'u1'
const P = (n: number) => `p${n}`
const E = (n: number) => `e${n}`

const game = (over: Partial<Game>): Game => ({
  id: G,
  code: 'K7PX2M',
  name: 'Ziemie za Mgłą',
  host_id: U1,
  status: 'playing',
  era: 1,
  round_number: 3,
  era_started_round: 1,
  phase: 'gods',
  current_turn_player_id: P(2),
  verse_pending_by: null,
  settings: {},
  created_at: '',
  updated_at: '',
  ...over,
})

const player = (n: number, over: Partial<Player>): Player => ({
  id: P(n),
  game_id: G,
  user_id: `u${n}`,
  god_name: '',
  god_description: '',
  god_gender: 'n',
  avatar_key: '',
  domain_key: null,
  attr_primary: null,
  attr_bonus: null,
  god_notes: '',
  god_color: null,
  afterlife: [],
  afterlife_description: '',
  seat_order: n,
  logos: 5,
  has_rolled: true,
  is_resting: false,
  low_logos_streak: 0,
  avatar_action_used: false,
  joined_at: '',
  ...over,
})

const entity = (n: number, over: Partial<Entity>): Entity => ({
  id: E(n),
  game_id: G,
  kind: 'creature',
  name: '',
  description: '',
  image_key: null,
  notes: '',
  parent_civilization_id: null,
  faction_type: null,
  traits: [],
  specialties: [],
  flaws: [],
  desires: [],
  requirements: [],
  conditions: [],
  status: 'active',
  is_chaos: false,
  created_round: 1,
  created_era: 1,
  created_by_player_id: P(1),
  attributes: {},
  emoji: null,
  hp: null,
  max_hp: null,
  diet: null,
  strength: 0,
  created_at: `2026-01-0${n}`,
  updated_at: '',
  ...over,
})

const row = (id: string, over: Partial<ActionLog>): ActionLog => ({
  id,
  game_id: G,
  round_number: 3,
  era: 1,
  player_id: null,
  action_key: 'prologue',
  logos_delta: 0,
  roll: null,
  entity_id: null,
  is_avatar_free_action: false,
  summary: '',
  outcome: null,
  created_at: '2026-01-10T10:00:00',
  ...over,
})

const players = [
  player(1, { god_name: 'Ta, Która Śpi Pod Rzeką', god_description: 'bogini rzek i cierpliwości', god_gender: 'f', logos: 11, low_logos_streak: 1, domain_key: 'harvest', attr_primary: 'grace', attr_bonus: 'wisdom', god_notes: 'Śpi pod rzeką od początku świata i liczy pory roku po barwie wody. Budzi się, gdy ktoś łamie obietnicę złożoną nad wodą.', afterlife: ['🐱', '🐱', '🐱', '🧝🏻‍♀️', '🧝🏻‍♀️', '🐱'] }),
  player(2, { god_name: 'Ten, Który Liczy', god_description: 'bóg rachunku i długu', god_gender: 'm', logos: 17, domain_key: 'order', attr_primary: 'wisdom', attr_bonus: 'whisper' }),
  player(3, { god_name: 'Bezimienny Wiatr', god_description: 'bóg wędrówki', god_gender: 'm', logos: 4, is_resting: true, domain_key: 'storm', attr_primary: 'element', attr_bonus: 'whisper' }),
  player(4, { god_name: 'Matka Soli', god_description: 'bogini morza i konserwacji', god_gender: 'f', logos: 9, domain_key: 'love', attr_primary: 'grace', attr_bonus: 'wisdom' }),
]

const creationOptions = [
  { id: 'co1', game_id: G, question_key: 'shape', label: 'Grzbiet śpiącego wieloryba', created_by: P(3), created_at: '' },
]
const creationVotes = [
  { game_id: G, question_key: 'shape', player_id: P(1), option_key: 'a', created_at: '' },
  { game_id: G, question_key: 'shape', player_id: P(2), option_key: 'a', created_at: '' },
  { game_id: G, question_key: 'shape', player_id: P(3), option_key: 'co1', created_at: '' },
  { game_id: G, question_key: 'origin', player_id: P(1), option_key: 'd', created_at: '' },
  { game_id: G, question_key: 'origin', player_id: P(4), option_key: 'e', created_at: '' },
  { game_id: G, question_key: 'gods', player_id: P(2), option_key: 'a', created_at: '' },
]

const entities = [
  entity(1, { name: 'Manule stoickie', emoji: '🐱', traits: ['Rozumne', 'Łagodne', 'Długowieczne'] }),
  entity(2, { name: 'Rzeczne węże', emoji: '🐍', traits: ['Jadowite', 'Wędrowne'], diet: 'carnivore', strength: 1 }),
  entity(12, { name: 'Jelenie mgielne', emoji: '🦌', diet: 'herbivore', strength: 2, created_by_player_id: P(4) }),
  entity(3, { name: 'Kałamarnice, co chodzą', emoji: '🦑', traits: ['Umysł roju', 'Płynne', 'Nocne'] }),
  entity(4, { kind: 'civilization', name: 'Stoicy Znad Rzeki', traits: ['Zachowawcza', 'Współpracująca'], specialties: ['Rolnictwo', 'Wiara/Religia'], flaws: ['Magia'], description: 'Spokojny lud manuli, który liczy pory roku po barwie wody.' }),
  entity(7, { kind: 'avatar', name: 'Posąg z Białego Kamienia', emoji: '🗿', hp: 2, max_hp: 3, conditions: ['Są nieożywionym przedmiotem, jak posąg, klejnot, góra.'], created_by_player_id: P(2) }),
  entity(8, { kind: 'avatar', name: 'Sowa o Stu Imionach', emoji: '🦉', hp: 0, conditions: ['Nie wiedzą, że są Awatarem.'], status: 'dead', created_by_player_id: P(1) }),
  entity(11, { kind: 'avatar', name: 'Pani Brodów', emoji: '🦸‍♀️', hp: 3, max_hp: 4, created_by_player_id: P(1) }),
  entity(10, { kind: 'civilization', name: 'Stare Brody Nad Wodą', status: 'destroyed', attributes: { ruin: { q: -1, r: 1 } }, description: 'Opustoszało po suszy.' }),
  entity(9, { kind: 'civilization', name: 'Przystań Soli', traits: ['Kupiecka'], specialties: ['Handel'], flaws: ['Ziemia'], parent_civilization_id: E(4), description: 'Wyszli z miasta Stoików, by handlować solą.', created_by_player_id: P(4) }),
]

const entityGods = [
  { entity_id: E(7), player_id: P(2), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(4), game_id: G, role: 'co_creator' as const },
  { entity_id: E(8), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(11), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(4), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(9), player_id: P(4), game_id: G, role: 'creator' as const },
]

/** the map: a seeded draw, with a known neighbourhood in the middle */
function previewHexes(): Hex[] {
  const hexes = generatePreviewMap(G, 7)
  const fixed: Record<string, BiomeKey> = { '0,0': 'trawa', '1,0': 'trawa', '1,-1': 'puszcza', '0,-1': 'zima', '-1,0': 'trawa', '-1,1': 'pustynia', '0,1': 'bagno', '2,-2': 'woda', '0,2': 'gory', '1,1': 'ziemia', '-2,1': 'gory_sniezne', '2,0': 'woda', '-1,2': 'pustynia' }
  const resources: Record<string, string> = { '1,0': '🌾', '-1,1': '💎' }
  let seed = 11
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return hexes.map((h) => {
    const b = fixed[`${h.q},${h.r}`]
    const resource = resources[`${h.q},${h.r}`] ?? null
    const resource_bonus = resource === '💎' ? 2 : 1
    return b ? { ...h, biome: b, decor: decorFor(b, rnd), resource, resource_bonus } : { ...h, resource, resource_bonus }
  })
}

/** two rivers: one from the eastern mountain to the sea through the badlands, one cut open in the snowy peaks */
const rivers: River[] = [
  { id: 'rv1', game_id: G, path: [{ q: 0, r: 2 }, { q: 1, r: 1 }], mouth_kind: 'water', mouth_q: 2, mouth_r: 0, into_river_id: null, reroute_by: null, created_round: 1, created_by_player_id: P(1), created_at: '2026-01-09T10:00:00' },
  { id: 'rv2', game_id: G, path: [{ q: -2, r: 1 }, { q: -1, r: 0 }], mouth_kind: 'none', mouth_q: null, mouth_r: null, into_river_id: null, reroute_by: null, created_round: 2, created_by_player_id: P(2), created_at: '2026-01-09T11:00:00' },
]

const occupants: HexOccupant[] = [
  { id: 'o1', game_id: G, q: 0, r: 0, slot: 0, entity_id: E(12), created_at: '' },
  { id: 'o2', game_id: G, q: 0, r: 0, slot: 1, entity_id: E(1), created_at: '' },
  { id: 'o3', game_id: G, q: 1, r: 0, slot: 0, entity_id: E(12), created_at: '' },
  { id: 'o4', game_id: G, q: -1, r: 0, slot: 1, entity_id: E(2), created_at: '' },
  { id: 'o5', game_id: G, q: 1, r: -1, slot: 2, entity_id: E(7), created_at: '' },
  { id: 'o6', game_id: G, q: 1, r: -1, slot: 1, entity_id: E(1), created_at: '' },
  { id: 'o7', game_id: G, q: 1, r: -1, slot: 3, entity_id: E(11), created_at: '' },
  { id: 'o8', game_id: G, q: 0, r: 1, slot: 1, entity_id: E(3), created_at: '' },
]
const cities: City[] = [
  { entity_id: E(4), game_id: G, q: 0, r: 0, atheists: 2 },
  { entity_id: E(9), game_id: G, q: 1, r: -1, atheists: 0 },
]
const followers: CityFollower[] = [
  { game_id: G, city_id: E(4), player_id: P(1), dots: 4 },
  { game_id: G, city_id: E(4), player_id: P(2), dots: 2 },
  { game_id: G, city_id: E(9), player_id: P(4), dots: 3 },
  { game_id: G, city_id: E(9), player_id: P(1), dots: 1 },
]
const prophecies: Prophecy[] = [
  { id: 'pr1', game_id: G, player_id: P(1), avatar_id: E(11), text: 'Rzeka wystąpi z brzegów i obmyje stare grzechy', hold: 2, status: 'active', created_round: 2, fulfilled_round: null, created_at: '2026-01-09T11:00:00' },
  { id: 'pr2', game_id: G, player_id: P(1), avatar_id: E(11), text: 'Z soli wyrośnie miasto', hold: 1, status: 'fulfilled', created_round: 1, fulfilled_round: 2, created_at: '2026-01-09T10:30:00' },
  { id: 'pr3', game_id: G, player_id: P(2), avatar_id: E(7), text: 'Każdy dług zostanie policzony', hold: 1, status: 'active', created_round: 3, fulfilled_round: null, created_at: '2026-01-10T09:00:00' },
]
const gifts: CityGift[] = [
  { id: 'g1', game_id: G, city_id: E(4), player_id: P(1), text: 'Ogień', accepted: true, dots_gained: 1, round_number: 2, created_at: '' },
  { id: 'g2', game_id: G, city_id: E(4), player_id: P(2), text: 'Latanie bez skrzydeł', accepted: false, dots_gained: 0, round_number: 2, created_at: '' },
]

const log: ActionLog[] = [
  row('l0a', { round_number: 0, summary: 'Na początku, zanim padło pierwsze Słowo, bóstwa spojrzały w pustkę i powiedziały, jak jest.', created_at: '2026-01-09T10:00:00' }),
  row('l0b', { round_number: 0, summary: 'Na początku był świat, a był to płaski dysk z krawędzią, za którą jest tylko spadek.', created_at: '2026-01-09T10:00:01' }),
  row('l0e', { round_number: 1, action_key: 'game_start', summary: 'Zaczyna się Pierwsza Era. Bóstwa nie mają jeszcze ani jednego Słowa i sięgają po kości.', created_at: '2026-01-09T10:01:00' }),
  row('l0f', { round_number: 1, player_id: P(1), action_key: 'create_creature', logos_delta: -10, entity_id: E(1), summary: 'Ciche koty o kamiennych oczach, które żyją nad rzekami i boją się tylko suszy.', outcome: { q: 0, r: 0, slot: 0, emoji: '🐱', biome: 'trawa' }, created_at: '2026-01-09T10:02:00' }),
  row('l0g', { round_number: 1, player_id: P(4), action_key: 'chaos_answer', summary: 'O co chodzi? O sól i o prawo do brodów na Rzece Białej.', created_at: '2026-01-09T10:03:00' }),
  row('l0g2', { round_number: 1, player_id: P(2), action_key: 'transfer', logos_delta: -3, summary: 'Matka Soli', created_at: '2026-01-09T10:03:20' }),
  row('l0g3', { round_number: 1, player_id: P(1), action_key: 'create_civilization', logos_delta: -22, entity_id: E(4), summary: 'Spokojny lud manuli, który liczy pory roku po barwie wody.', outcome: { q: 0, r: 0, species_id: E(1), species_name: 'Manule stoickie', biome: 'trawa' }, created_at: '2026-01-09T10:03:30' }),
  row('l0g4', { round_number: 1, player_id: P(1), action_key: 'dice', roll: { d1: 4, d2: 4, total: 8, tier: 'mixed' }, summary: 'Stworzenie Cywilizacji', created_at: '2026-01-09T10:03:40' }),
  row('l0g5', { round_number: 1, player_id: P(4), action_key: 'chaos_reveal', roll: { d1: 5, d2: 1, seq: 1 }, summary: 'Bóstwa śpią.', created_at: '2026-01-09T10:03:50' }),
  row('l0g6', { round_number: 1, player_id: P(4), action_key: 'chaos_choice', roll: { d1: 5, d2: 1, category: 'region', entry: 5 }, summary: 'Region: Exodus. Lud opuszcza region.', created_at: '2026-01-09T10:03:55' }),
  row('l0g7', { round_number: 1, action_key: 'cities_grow', outcome: [{ city_id: E(4), name: 'Stoicy Znad Rzeki', player_id: P(1), level: 3 }], created_at: '2026-01-09T10:03:57' }),
  row('l0g8', { round_number: 1, action_key: 'dots_reward', outcome: [{ player_id: P(1), total: 3, rank: 1, logos: 3 }, { player_id: P(2), total: 2, rank: 2, logos: 2 }], created_at: '2026-01-09T10:03:58' }),
  row('l0h', { round_number: 1, player_id: P(1), action_key: 'round_end', summary: 'I minęła runda 1. Bóstwa zapadają w sen, a świat toczy się dalej.', created_at: '2026-01-09T10:04:00' }),
  row('l1', { player_id: P(1), action_key: 'logos_roll', logos_delta: 8, roll: { d1: 3, d2: 4, total: 8, bonus_streak: 1, bonus_orthodoxy: 0 }, summary: 'Ta, Która Śpi Pod Rzeką budzi się i śni nowe Słowa. Kości mówią: 3 i 4, skromność dodaje 1. Nowych Słów jest 8.', created_at: '2026-01-10T10:00:00' }),
  row('l2', { player_id: P(2), action_key: 'shape_land', logos_delta: -2, outcome: { biome: 'zima', hexes: [{ q: 0, r: -1, from: 'trawa' }] }, created_at: '2026-01-10T10:01:00' }),
  row('l2b', { player_id: P(2), action_key: 'develop_civilization', logos_delta: -12, entity_id: E(4), outcome: { city_id: E(4), city_name: 'Stoicy Znad Rzeki', d1: 2, d2: 3, attr: 'wisdom', score: 2, total: 7, tier: 'mixed', gained: 1, added: 1, wasted: 0, gift: 'Rachunek długu', level: 6 }, created_at: '2026-01-10T10:01:30' }),
  row('l3b', { player_id: P(2), action_key: 'great_miracle', is_avatar_free_action: true, summary: 'Cały kontynent unosi się nad morzem.', created_at: '2026-01-10T10:02:30' }),
  row('lc2', { player_id: P(1), action_key: 'holy_war', entity_id: E(9), roll: { d1: 4, d2: 5, att: { d1: 4, d2: 5, modifier: 2, total: 11, attr: 'wrath' }, def: { d1: 2, d2: 3, modifier: 3, total: 8, attr: 'grace' } }, outcome: { kind: 'holy_war', diff: 3, army: 2, removed: 0, converted: 0, attacker_lost: 0, defender_lost: 0, returned: 2, successes: 2, pending: true, target_city_id: E(9), target_name: 'Przystań Soli', attacker_id: P(1), defender_id: P(4), attacker_total: 11, defender_total: 8, defender_dots: 3 }, created_at: '2026-01-10T10:02:50' }),
  row('l4', { player_id: P(3), action_key: 'rest', summary: 'Bezimienny Wiatr odpoczywa. Zachowuje swoje Słowa i milczy do końca rundy.', created_at: '2026-01-10T10:03:00' }),
]

const profiles = {
  u1: { id: 'u1', display_name: 'Michał', created_at: '' },
  u2: { id: 'u2', display_name: 'Ania', created_at: '' },
  u3: { id: 'u3', display_name: 'Piotr', created_at: '' },
  u4: { id: 'u4', display_name: 'Kasia', created_at: '' },
}

const contestFor = (state: string): Contest[] => {
  if (!state) return []
  const base: Contest = {
    id: 'c1', game_id: G, round_number: 3, era: 1, kind: 'convert', attacker_id: P(1), defender_id: P(2), target_city_id: E(4), source_city_id: null, attacker_avatar_id: null, defender_avatar_id: null, army: null, cost: 6,
    attacker_attr: 'majesty', attacker_d1: 4, attacker_d2: 5, attacker_mod: 0, attacker_total: 9,
    defender_attr: null, defender_d1: null, defender_d2: null, defender_mod: null, defender_total: null,
    status: 'pending', outcome: null, log_id: null, created_at: '2026-01-10T10:05:00', resolved_at: null,
  }
  if (state === 'defender') return [{ ...base, attacker_id: P(2), defender_id: P(1), attacker_attr: 'whisper', attacker_mod: 1, attacker_total: 10 }]
  if (state === 'attacker') return [{ ...base, kind: 'holy_war', source_city_id: E(9), army: 2, cost: 1, attacker_attr: 'wrath', attacker_mod: 1, attacker_total: 10, target_city_id: E(4) }]
  if (state === 'duel') return [{ ...base, kind: 'avatar_duel', attacker_id: P(2), defender_id: P(1), target_city_id: null, attacker_avatar_id: E(7), defender_avatar_id: E(11), cost: 5, attacker_attr: 'whisper', attacker_mod: 1, attacker_total: 10 }]
  if (state === 'war') return [{ ...base, kind: 'holy_war', status: 'resolved', attacker_id: P(1), defender_id: P(4), source_city_id: E(4), target_city_id: E(9), army: 2, cost: 1, attacker_attr: 'wrath', attacker_mod: 2, attacker_total: 11, defender_attr: 'grace', defender_d1: 2, defender_d2: 3, defender_mod: 3, defender_total: 8, outcome: { kind: 'holy_war', diff: 3, army: 2, removed: 0, converted: 0, attacker_lost: 0, defender_lost: 0, returned: 2, successes: 2, pending: true, target_city_id: E(9), target_name: 'Przystań Soli', attacker_id: P(1), defender_id: P(4), attacker_total: 11, defender_total: 8, defender_dots: 3 }, log_id: 'lc2' }]
  return [{ ...base, status: 'resolved', defender_attr: 'whisper', defender_d1: 2, defender_d2: 3, defender_mod: 1, defender_total: 6, outcome: { kind: 'convert', diff: 3, converted: 2, target_city_id: E(4), target_name: 'Stoicy Znad Rzeki', attacker_id: P(1), defender_id: P(2), attacker_total: 9, defender_total: 6, defender_dots: 2 }, log_id: 'lc1' }]
}

let seq = 0
const nextId = (p: string) => `${p}-${Date.now()}-${seq++}`

const NIGHT_QUEUE = [{ t: 'herbivore' as const, id: 'o1' }, { t: 'beast' as const, id: 'o4' }, { t: 'tribe' as const, id: 'o8' }, { t: 'city' as const, id: E(4) }, { t: 'city' as const, id: E(9) }]
function nightFor(pending: string | null): ChaosNight {
  const since = new Date().toISOString()
  const pend: NightPending | null =
    pending === 'fight'
      ? { kind: 'fight', since, scene: 'creature', log_id: null, left: { label: 'Rzeczne węże', emoji: '🐍', entity_id: E(2), occupant_id: 'o4', player_id: P(1), mod: 1, roll: null }, right: { label: 'Kałamarnice, co chodzą', emoji: '🦑', entity_id: E(3), occupant_id: 'o8', player_id: P(2), mod: 0, roll: null }, at: { q: 0, r: 1 }, origin: { q: -1, r: 0 } }
      : pending === 'naming'
        ? { kind: 'naming', since, city_id: E(9), namer_id: P(1), log_id: null, placeholder: 'Osada Manuli', q: 1, r: -1 }
        : pending === 'verdict'
          ? { kind: 'verdict', since, log_id: 'n4', players: [P(1), P(2)], acks: [], next: null }
          : pending === 'mutation'
            ? { kind: 'mutation', since, parent_id: E(12), parent_name: 'Jelenie mgielne', parent_emoji: '🦌', role: 'herbivore', at: { q: 0, r: 0 }, namer_id: P(1), log_id: 'n2', placeholder: 'Odmiana Jelenie mgielne', then_hunt: false }
            : null
  const status = pending === 'fight' ? 'fight' : pending === 'naming' ? 'naming' : pending === 'verdict' ? 'verdict' : pending === 'mutation' ? 'mutation' : 'running'
  return { game_id: G, round_number: 3, status, queue: NIGHT_QUEUE, cursor: 2, pending: pend, started_by: P(1), updated_at: since }
}
const nightLog = (): ActionLog[] => [
  row('n1', { action_key: 'night_begin', outcome: { herbivores: 1, beasts: 1, tribes: 1, cities: 2 }, created_at: '2026-01-10T10:20:00' }),
  row('n2', { action_key: 'night_move', roll: { d1: 5, d2: 4, total: 9 }, outcome: { unit: 'herbivore', occupant_id: 'o1', entity_id: E(12), name: 'Jelenie mgielne', emoji: '🦌', strength: 2, from: { q: 1, r: 0 }, result: 'graze_best', to: { q: 0, r: 0 }, fertility_to: 5 }, created_at: '2026-01-10T10:20:02' }),
  row('n3', { action_key: 'night_move', roll: { d1: 4, d2: 6, total: 10 }, outcome: { unit: 'beast', occupant_id: 'o4', entity_id: E(2), name: 'Rzeczne węże', emoji: '🐍', strength: 1, from: { q: -1, r: 0 }, result: 'fight', fight_at: { q: 0, r: 1 }, scene: 'creature' }, created_at: '2026-01-10T10:20:04' }),
  row('n4', { action_key: 'night_fight', roll: { d1: 6, d2: 5, att: { d1: 6, d2: 5, modifier: 1, total: 12, attr: 'wrath' }, def: { d1: 2, d2: 3, modifier: 0, total: 5, attr: 'wrath' } }, outcome: { scene: 'creature', left: { label: 'Rzeczne węże', emoji: '🐍', entity_id: E(2), player_id: P(1), mod: 1, roll: { d1: 6, d2: 5, total: 12 } }, right: { label: 'Kałamarnice, co chodzą', emoji: '🦑', entity_id: E(3), player_id: P(2), mod: 0, roll: { d1: 2, d2: 3, total: 5 } }, at: { q: 0, r: 1 }, origin: { q: -1, r: 0 }, diff: 7, result: 'eaten', loser: 'right', removed: true, extinct: true }, created_at: '2026-01-10T10:20:06' }),
]

/** answers the windows' calls locally so every flow can be walked through without a server */
function previewRpc(fn: string, args: Record<string, unknown>): unknown {
  const s = useGameStore.getState()
  const me = s.players.find((p) => p.user_id === U1)!
  const g = s.game!
  const world = buildWorld({ hexes: s.hexes, occupants: s.occupants, cities: s.cities, followers: s.followers, gifts: s.gifts, entities: s.entities, entityGods: s.entityGods, rivers: s.rivers })
  const add = (over: Partial<ActionLog>): ActionLog => {
    const r = row(nextId('log'), { round_number: g.round_number, era: g.era, player_id: me.id, created_at: new Date().toISOString(), ...over })
    useGameStore.setState((st) => ({ log: [...st.log, r] }))
    return r
  }
  const addDots = (cityId: string, pid: string, n: number) => {
    if (n <= 0) return 0
    const st = useGameStore.getState()
    const total = st.followers.filter((f) => f.city_id === cityId).reduce((a, f) => a + f.dots, 0)
    const add = Math.min(n, Math.max(0, 10 - total))
    if (add === 0) return 0
    const has = st.followers.some((f) => f.city_id === cityId && f.player_id === pid)
    useGameStore.setState({ followers: has ? st.followers.map((f) => (f.city_id === cityId && f.player_id === pid ? { ...f, dots: f.dots + add } : f)) : [...st.followers, { game_id: G, city_id: cityId, player_id: pid, dots: add }] })
    return add
  }
  const removeDots = (cityId: string, pid: string, n: number) => {
    const st = useGameStore.getState()
    const cur = st.followers.find((f) => f.city_id === cityId && f.player_id === pid)?.dots ?? 0
    const rem = Math.min(n, cur)
    useGameStore.setState({ followers: st.followers.map((f) => (f.city_id === cityId && f.player_id === pid ? { ...f, dots: f.dots - rem } : f)).filter((f) => f.dots > 0) })
    return rem
  }
  // the fallen go to their god's afterlife as the sign of the city's people
  const souls = (cityId: string, pid: string, n: number) => {
    if (n <= 0) return
    const st = useGameStore.getState()
    const link = st.entityLinks.find((l) => l.from_entity_id === cityId && l.relation === 'member_species')
    const sign = (link && st.entities.find((e) => e.id === link.to_entity_id)?.emoji) || '👤'
    useGameStore.setState({ players: st.players.map((p) => (p.id === pid ? { ...p, afterlife: [...p.afterlife, ...Array.from({ length: n }, () => sign)] } : p)) })
  }
  const pay = (n: number) => useGameStore.setState((st) => ({ players: st.players.map((p) => (p.id === me.id ? { ...p, logos: p.logos - n } : p)) }))
  const lock = (who: string | null) => useGameStore.setState((st) => ({ game: st.game ? { ...st.game, verse_pending_by: who } : st.game }))
  const spendProphecy = (id: unknown): number => {
    if (!id) return 0
    const pr = useGameStore.getState().prophecies.find((p) => p.id === id && p.status === 'active')
    if (!pr) return 0
    useGameStore.setState((st) => ({ prophecies: st.prophecies.map((p) => (p.id === pr.id ? { ...p, status: 'fulfilled', fulfilled_round: g.round_number } : p)) }))
    const av = world.entityById(pr.avatar_id)
    add({ player_id: pr.player_id, action_key: 'prophecy_fulfilled', outcome: { prophecy_id: pr.id, text: pr.text, hold: pr.hold, avatar_name: av?.name ?? '', emoji: av?.emoji ?? '' } })
    return pr.hold
  }
  const wound = (id: string, dmg: number) => {
    const st = useGameStore.getState()
    const e = st.entities.find((x) => x.id === id)
    if (!e || dmg <= 0) return { hp: e?.hp ?? 0, dead: false }
    const hp = Math.max(0, (e.hp ?? 0) - dmg)
    const dead = hp === 0
    useGameStore.setState({ entities: st.entities.map((x) => (x.id === id ? { ...x, hp, status: dead ? 'dead' : x.status } : x)), occupants: dead ? st.occupants.filter((o) => o.entity_id !== id) : st.occupants })
    return { hp, dead }
  }

  const finishNight = () => {
    add({ player_id: null, action_key: 'round_end', summary: `I minęła runda ${g.round_number}. Bóstwa zapadają w sen, a świat toczy się dalej.` })
    useGameStore.setState((st) => ({
      night: st.night ? { ...st.night, status: 'done', pending: null, updated_at: new Date().toISOString() } : st.night,
      game: st.game ? { ...st.game, round_number: st.game.round_number + 1, phase: 'rolling', current_turn_player_id: null } : st.game,
      players: st.players.map((p) => ({ ...p, has_rolled: false, is_resting: false })),
    }))
  }
  if (fn === 'start_chaos_night') {
    const w = world
    const units: ChaosNight['queue'] = []
    for (const role of ['herbivore', 'beast', 'tribe'] as const) {
      for (const o of s.occupants) {
        const e = w.entityById(o.entity_id)
        if (w.roleOf(e) !== role) continue
        if (role === 'tribe' && w.cityAt(o.q, o.r)) continue
        units.push({ t: role, id: o.id })
      }
    }
    for (const c of s.cities) units.push({ t: 'city', id: c.entity_id })
    const night: ChaosNight = { game_id: G, round_number: g.round_number, status: 'running', queue: units, cursor: 0, pending: null, started_by: me.id, updated_at: new Date().toISOString() }
    useGameStore.setState({ night })
    add({ player_id: null, action_key: 'night_begin', outcome: { herbivores: units.filter((u) => u.t === 'herbivore').length, beasts: units.filter((u) => u.t === 'beast').length, tribes: units.filter((u) => u.t === 'tribe').length, cities: units.filter((u) => u.t === 'city').length } })
    return night
  }
  if (fn === 'chaos_step') {
    const n = s.night
    if (!n || n.status !== 'running') return n
    if (args.p_expected_cursor !== null && args.p_expected_cursor !== undefined && args.p_expected_cursor !== n.cursor) return n
    if (n.cursor >= n.queue.length) {
      finishNight()
      return useGameStore.getState().night
    }
    const unit = n.queue[n.cursor]
    useGameStore.setState({ night: { ...n, cursor: n.cursor + 1, updated_at: new Date().toISOString() } })
    if (unit.t === 'city') {
      const c = s.cities.find((x) => x.entity_id === unit.id)
      const e = world.entityById(unit.id)
      if (c && e) {
        const f = world.fertilityOf(c.q, c.r) ?? 0
        const pop = world.cityDots(c.entity_id)
        const d1 = 1 + Math.floor(Math.random() * 6)
        const d2 = 1 + Math.floor(Math.random() * 6)
        const t = d1 + d2 + f - pop
        const res = t >= 10 ? 'bloom' : t >= 7 ? (pop <= f ? 'calm' : 'stay') : 'famine'
        if (res === 'bloom') useGameStore.setState((st) => ({ cities: st.cities.map((x) => (x.entity_id === c.entity_id ? { ...x, atheists: x.atheists + 1 } : x)) }))
        add({ player_id: null, action_key: 'night_city', roll: { d1, d2, total: t, modifier: f - pop }, outcome: { city_id: c.entity_id, name: e.name, q: c.q, r: c.r, roll: d1 + d2, fertility: f, population: pop, result: res, overflow: res === 'stay' ? pop - f : 0, groups: [] } })
      }
    } else {
      const occ = s.occupants.find((o) => o.id === unit.id)
      const e = occ ? world.entityById(occ.entity_id) : undefined
      if (occ && e) {
        const role = world.roleOf(e) ?? 'herbivore'
        const d1 = 1 + Math.floor(Math.random() * 6)
        const d2 = 1 + Math.floor(Math.random() * 6)
        const d = d1 + d2
        const targets = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }]
          .map((dd) => ({ q: occ.q + dd.q, r: occ.r + dd.r }))
          .filter((h) => { const hx = world.hexAt(h.q, h.r); return !!hx && hx.biome !== 'woda' && (role === 'herbivore' || !world.blocked(h.q, h.r) || role === 'beast') && world.slotFor(h.q, h.r, role) !== null })
        const moves = (d >= 3 && d <= 5) || (d >= 9 && d <= 10)
        const to = moves && targets.length ? targets[Math.floor(Math.random() * targets.length)] : null
        if (to) useGameStore.setState((st) => ({ occupants: st.occupants.map((o) => (o.id === occ.id ? { ...o, q: to.q, r: to.r } : o)) }))
        const stayWord = role === 'tribe' ? 'camp' : role === 'beast' ? 'sleep' : 'stay'
        const moveWord = d <= 5 ? (role === 'tribe' ? 'explore' : 'wander') : role === 'tribe' ? 'promised' : role === 'beast' ? 'hunt' : 'graze_best'
        add({ player_id: null, action_key: 'night_move', roll: { d1, d2, total: d }, outcome: { unit: role, occupant_id: occ.id, entity_id: e.id, name: e.name, emoji: e.emoji, strength: e.strength, from: { q: occ.q, r: occ.r }, result: to ? moveWord : stayWord, to, fertility_to: to ? world.fertilityOf(to.q, to.r) : null } })
      }
    }
    return useGameStore.getState().night
  }
  if (fn === 'chaos_fight_roll') {
    const n = s.night
    if (!n || n.status !== 'fight' || n.pending?.kind !== 'fight') return n
    const side = String(args.p_side) as 'left' | 'right'
    const pd = n.pending
    if (pd[side].roll) return n
    const d1 = 1 + Math.floor(Math.random() * 6)
    const d2 = 1 + Math.floor(Math.random() * 6)
    const next = { ...pd, [side]: { ...pd[side], roll: { d1, d2, total: d1 + d2 + pd[side].mod } } }
    if (next.left.roll && next.right.roll) {
      const diff = next.left.roll.total - next.right.roll.total
      const loser = diff > 0 ? 'right' : diff < 0 ? 'left' : null
      const result = diff === 0 ? 'return' : Math.abs(diff) >= 3 ? 'eaten' : 'flee'
      if (loser === 'right' && next.right.occupant_id) {
        useGameStore.setState((st) => ({ occupants: st.occupants.filter((o) => o.id !== next.right.occupant_id).map((o) => (o.id === next.left.occupant_id ? { ...o, q: next.at.q, r: next.at.r } : o)) }))
      } else if (loser === 'left' && next.left.occupant_id && result === 'eaten') {
        useGameStore.setState((st) => ({ occupants: st.occupants.filter((o) => o.id !== next.left.occupant_id) }))
      }
      const fr = add({ player_id: null, action_key: 'night_fight', roll: { d1: next.left.roll.d1, d2: next.left.roll.d2, att: { d1: next.left.roll.d1, d2: next.left.roll.d2, modifier: next.left.mod, total: next.left.roll.total, attr: 'wrath' }, def: { d1: next.right.roll.d1, d2: next.right.roll.d2, modifier: next.right.mod, total: next.right.roll.total, attr: 'wrath' } }, outcome: { scene: pd.scene, left: next.left, right: next.right, at: pd.at, origin: pd.origin, diff, result, loser, removed: result === 'eaten', extinct: false } })
      useGameStore.setState({ night: { ...n, status: 'verdict', pending: { kind: 'verdict', since: new Date().toISOString(), log_id: fr.id, players: [next.left.player_id, next.right.player_id].filter((x): x is string => !!x), acks: [], next: null }, updated_at: new Date().toISOString() } })
    } else {
      useGameStore.setState({ night: { ...n, pending: next, updated_at: new Date().toISOString() } })
    }
    return useGameStore.getState().night
  }
  if (fn === 'chaos_ack_fight') {
    const n = s.night
    if (!n || n.status !== 'verdict' || n.pending?.kind !== 'verdict') return n
    const nxt = n.pending.next
    useGameStore.setState({ night: nxt ? { ...n, status: 'naming', pending: nxt, updated_at: new Date().toISOString() } : { ...n, status: 'running', pending: null, updated_at: new Date().toISOString() } })
    return useGameStore.getState().night
  }
  if (fn === 'chaos_name_mutation') {
    const n = s.night
    if (!n || n.pending?.kind !== 'mutation') return n
    const pd = n.pending
    const parent = world.entityById(pd.parent_id)
    const e = entity(0, { id: nextId('ent'), kind: 'creature', name: String(args.p_name ?? pd.placeholder), emoji: String(args.p_emoji ?? '🐾'), diet: parent?.diet ?? null, strength: parent?.strength ?? 0, traits: parent?.traits ?? [], created_round: g.round_number, created_by_player_id: pd.namer_id, created_at: new Date().toISOString() })
    const slot = pd.role === 'herbivore' ? 0 : 1
    useGameStore.setState((st) => ({
      entities: [...st.entities, e],
      entityLinks: [...st.entityLinks, { from_entity_id: e.id, to_entity_id: pd.parent_id, game_id: G, relation: 'variant_of' }],
      occupants: [...st.occupants, { id: nextId('occ'), game_id: G, q: pd.at.q, r: pd.at.r, slot, entity_id: e.id, created_at: new Date().toISOString() }],
      log: st.log.map((l) => (l.id === pd.log_id ? { ...l, outcome: { ...(l.outcome as Record<string, unknown>), mutation_name: e.name, mutation_emoji: e.emoji } } : l)),
      night: { ...n, status: 'running', pending: null, updated_at: new Date().toISOString() },
    }))
    return useGameStore.getState().night
  }
  if (fn === 'chaos_skip_phase') {
    const n = s.night
    if (!n || n.status !== 'running') return n
    const phase = n.queue[n.cursor]?.t
    let guard = 0
    while (guard++ < 50) {
      const cur = useGameStore.getState().night
      if (!cur || cur.status !== 'running' || cur.cursor >= cur.queue.length || cur.queue[cur.cursor].t !== phase) break
      previewRpc('chaos_step', { p_game_id: G, p_expected_cursor: cur.cursor })
    }
    return useGameStore.getState().night
  }
  if (fn === 'chaos_name_city') {
    const n = s.night
    if (!n || n.pending?.kind !== 'naming') return n
    const cityId = n.pending.city_id
    useGameStore.setState((st) => ({ entities: st.entities.map((e) => (e.id === cityId ? { ...e, name: String(args.p_name ?? e.name) } : e)), night: { ...n, status: 'running', pending: null, updated_at: new Date().toISOString() } }))
    return useGameStore.getState().night
  }
  if (fn === 'chaos_skip' || fn === 'end_chaos_phase') {
    if (!s.night || s.night.round_number !== g.round_number || s.night.status === 'done') {
      useGameStore.setState({ night: { game_id: G, round_number: g.round_number, status: 'running', queue: [], cursor: 0, pending: null, started_by: me.id, updated_at: new Date().toISOString() } })
    }
    finishNight()
    return null
  }
  if (fn === 'continue_river') {
    const id = String(args.p_river_id)
    const nodes = (args.p_nodes ?? []) as HexRef[]
    const mouth = (args.p_mouth ?? null) as HexRef | null
    useGameStore.setState((st) => ({ rivers: st.rivers.map((rv) => (rv.id === id ? { ...rv, path: [...rv.path, ...nodes], mouth_kind: (mouth ? 'water' : 'river') as 'water' | 'river', mouth_q: mouth?.q ?? null, mouth_r: mouth?.r ?? null, reroute_by: null } : rv)) }))
    return useGameStore.getState().rivers.find((rv) => rv.id === id) ?? null
  }
  if (fn === 'log_dice_roll') {
    const mod = Number(args.p_modifier ?? 0)
    const total = 8 + mod
    return add({ action_key: 'dice', roll: { d1: 4, d2: 4, modifier: mod, total, tier: total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak' }, summary: String(args.p_context ?? '') })
  }
  if (fn === 'set_god') {
    useGameStore.setState((st) => ({
      players: st.players.map((p) =>
        p.user_id === U1
          ? { ...p, god_name: String(args.p_god_name ?? ''), god_description: String(args.p_god_description ?? ''), god_gender: (args.p_god_gender as Player['god_gender']) ?? 'm', domain_key: (args.p_domain_key as Player['domain_key']) ?? null, attr_primary: (args.p_attr_primary as Player['attr_primary']) ?? null, attr_bonus: (args.p_attr_bonus as Player['attr_bonus']) ?? null, god_notes: String(args.p_god_notes ?? ''), god_color: (args.p_god_color as string | null) ?? null }
          : p,
      ),
    }))
    return null
  }
  if (fn === 'edit_log_summary') {
    useGameStore.setState((st) => ({ log: st.log.map((l) => (l.id === args.p_log_id ? { ...l, summary: String(args.p_summary ?? '') } : l)) }))
    lock(null)
    return null
  }
  if (fn === 'release_verse') {
    lock(null)
    return null
  }
  if (fn === 'set_afterlife') {
    useGameStore.setState((st) => ({ players: st.players.map((p) => (p.id === me.id ? { ...p, afterlife_description: String(args.p_text ?? '') } : p)) }))
    return null
  }
  if (fn === 'edit_entity') {
    const patch = (args.p_patch ?? {}) as Partial<Entity>
    useGameStore.setState((st) => ({ entities: st.entities.map((e) => (e.id === args.p_entity_id ? { ...e, ...patch } : e)) }))
    return null
  }
  if (fn === 'declare_contest') {
    const p = (args.p_payload ?? {}) as Record<string, unknown>
    const kind = String(args.p_kind)
    const duel = kind === 'avatar_duel'
    const pmod = spendProphecy(p.prophecy_id)
    const defenderId = duel ? s.entityGods.find((eg) => eg.entity_id === p.defender_avatar_id && eg.role === 'creator')?.player_id ?? P(2) : String(p.defender_id)
    const viaAv = p.via_avatar_id ? world.entityById(String(p.via_avatar_id)) : undefined
    const mod = (kind === 'holy_war' ? Number(p.army) + (viaAv?.hp ?? 0) : 1) + pmod
    const c: Contest = {
      id: nextId('contest'), game_id: G, round_number: g.round_number, era: g.era, kind: kind as Contest['kind'], attacker_id: me.id,
      defender_id: defenderId, target_city_id: duel ? null : String(kind === 'convert' ? p.city_id : p.target_city_id), source_city_id: kind === 'holy_war' ? String(p.source_city_id) : null,
      attacker_avatar_id: duel ? String(p.attacker_avatar_id) : viaAv?.id ?? null, defender_avatar_id: duel ? String(p.defender_avatar_id) : null,
      army: kind === 'holy_war' ? Number(p.army) : null, cost: viaAv ? Math.ceil((kind === 'convert' ? 6 : 1) / 2) : kind === 'convert' ? 6 : duel ? 5 : 1, attacker_attr: kind === 'holy_war' ? 'wrath' : (p.attr as Contest['attacker_attr']),
      attacker_d1: 4, attacker_d2: 5, attacker_mod: mod, attacker_total: 9 + mod,
      defender_attr: null, defender_d1: null, defender_d2: null, defender_mod: null, defender_total: null, status: 'pending', outcome: null, log_id: null, created_at: new Date().toISOString(), resolved_at: null,
    }
    pay(c.cost)
    if (kind === 'holy_war') removeDots(c.source_city_id!, me.id, c.army!)
    const attAv = world.entityById(c.attacker_avatar_id)
    const defAv = world.entityById(c.defender_avatar_id)
    add({ action_key: 'contest_declared', logos_delta: -c.cost, entity_id: c.target_city_id ?? c.attacker_avatar_id, roll: { d1: 4, d2: 5, modifier: c.attacker_mod, total: c.attacker_total, attr: c.attacker_attr }, outcome: { kind, contest_id: c.id, defender_id: c.defender_id, target_name: world.entityById(c.target_city_id)?.name ?? '', army: c.army, attacker_avatar: attAv?.name, attacker_emoji: attAv?.emoji, defender_avatar: defAv?.name, defender_emoji: defAv?.emoji } })
    useGameStore.setState((st) => ({ contests: [...st.contests, c] }))
    return c
  }
  if (fn === 'answer_contest' || fn === 'commit_contest' || fn === 'cancel_contest') {
    const c = s.contests.find((x) => x.id === args.p_contest_id)
    if (!c) return null
    if (fn === 'cancel_contest') {
      useGameStore.setState((st) => ({ contests: st.contests.map((x) => (x.id === c.id ? { ...x, status: 'cancelled' } : x)) }))
      return null
    }
    if (fn === 'commit_contest') {
      const oc = { ...((c.outcome ?? {}) as Record<string, unknown>) }
      const tid = c.target_city_id
      if (c.kind === 'holy_war' && oc.pending === true && tid) {
        const alloc = (args.p_allocation ?? {}) as { dots?: number; avatar?: number; creatures?: string[] }
        const successes = Number(oc.successes ?? 0)
        const city = world.cityOf(tid)
        const removed = removeDots(tid, c.defender_id, Math.min(alloc.dots ?? successes, successes))
        const converted = addDots(tid, c.attacker_id, Math.ceil(removed / 2))
        const defAv = city ? world.avatarsOf(c.defender_id).find((a) => a.occupant && a.occupant.q === city.q && a.occupant.r === city.r)?.entity : undefined
        souls(tid, c.defender_id, removed - converted)
        const w = defAv ? wound(defAv.id, Math.min(alloc.avatar ?? 0, successes - removed)) : { hp: 0, dead: false }
        const killed: Record<string, unknown>[] = []
        for (const oid of alloc.creatures ?? []) {
          const occ = useGameStore.getState().occupants.find((o) => o.id === oid)
          const e = occ ? world.entityById(occ.entity_id) : undefined
          if (!occ || !e) continue
          useGameStore.setState((st) => ({ occupants: st.occupants.filter((o) => o.id !== oid) }))
          killed.push({ entity_id: e.id, name: e.name, emoji: e.emoji })
        }
        Object.assign(oc, { pending: false, removed, converted, defender_lost: removed, avatar_wounds: defAv ? Math.min(alloc.avatar ?? 0, successes - removed) : 0, avatar_name: defAv?.name ?? '', avatar_dead: w.dead, creatures_killed: killed, target_destroyed: world.cityDots(tid) - removed + converted <= 0 })
      }
      useGameStore.setState((st) => ({ contests: st.contests.map((x) => (x.id === c.id ? { ...x, status: 'committed', outcome: oc } : x)), log: st.log.map((l) => (l.id === c.log_id ? { ...l, summary: String(args.p_summary ?? ''), outcome: oc } : l)) }))
      lock(null)
      return null
    }
    const d1 = 3, d2 = 2
    const tid = c.target_city_id ?? ''
    const tcity = tid ? world.cityOf(tid) : undefined
    const wallAv = c.kind === 'holy_war' && tcity ? world.avatarsOf(c.defender_id).find((a) => a.occupant && a.occupant.q === tcity.q && a.occupant.r === tcity.r)?.entity : undefined
    const mod = (c.kind === 'holy_war' && tid ? world.dotsOf(tid, c.defender_id) + (wallAv?.hp ?? 0) : 0) + 1 + spendProphecy(args.p_prophecy_id)
    const total = d1 + d2 + mod
    const diff = c.attacker_total - total
    const outcome: Record<string, unknown> = { kind: c.kind, diff, target_city_id: c.target_city_id, target_name: world.entityById(tid)?.name ?? '', attacker_id: c.attacker_id, defender_id: c.defender_id, attacker_total: c.attacker_total, defender_total: total }
    if (c.kind === 'avatar_duel') {
      const aLoss = diff >= 3 ? 0 : diff >= 1 ? 1 : diff === 0 ? 1 : diff >= -2 ? 1 : 2
      const dLoss = diff >= 3 ? 2 : diff >= 1 ? 1 : diff === 0 ? 1 : 0
      const attAv = world.entityById(c.attacker_avatar_id)
      const defAv = world.entityById(c.defender_avatar_id)
      const a = wound(c.attacker_avatar_id!, aLoss)
      const d = wound(c.defender_avatar_id!, dLoss)
      Object.assign(outcome, { attacker_avatar: attAv?.name, attacker_emoji: attAv?.emoji, defender_avatar: defAv?.name, defender_emoji: defAv?.emoji, attacker_loss: aLoss, defender_loss: dLoss, attacker_hp: a.hp, defender_hp: d.hp, attacker_dead: a.dead, defender_dead: d.dead })
    } else if (c.kind === 'convert') {
      const k = diff >= 3 ? 2 : diff >= 1 ? 1 : 0
      const conv = removeDots(tid, c.defender_id, k)
      addDots(tid, c.attacker_id, conv)
      outcome.converted = conv
    } else {
      const army = c.army ?? 0
      let attLost = 0, defLost = 0, returned = 0
      if (diff >= 3) { returned = army }
      else if (diff >= 1) { attLost = Math.ceil(army / 2); returned = army - attLost }
      else if (diff === 0) { defLost = removeDots(tid, c.defender_id, 1); attLost = 1; returned = army - 1 }
      else if (diff >= -2) { defLost = removeDots(tid, c.defender_id, 1); attLost = army - 1; returned = 1 }
      else { attLost = army }
      souls(tid, c.defender_id, defLost)
      if (c.source_city_id) souls(c.source_city_id, c.attacker_id, attLost)
      if (returned > 0 && c.source_city_id) addDots(c.source_city_id, c.attacker_id, returned)
      Object.assign(outcome, { army, removed: 0, converted: 0, attacker_lost: attLost, defender_lost: defLost, returned, successes: diff >= 1 ? army : 0, pending: diff >= 1, defender_dots: world.dotsOf(tid, c.defender_id) })
    }
    const lr = add({ player_id: c.attacker_id, action_key: c.kind, entity_id: c.target_city_id ?? c.attacker_avatar_id, roll: { d1: c.attacker_d1, d2: c.attacker_d2, att: { d1: c.attacker_d1, d2: c.attacker_d2, modifier: c.attacker_mod, total: c.attacker_total, attr: c.attacker_attr }, def: { d1, d2, modifier: mod, total, attr: args.p_attr as Contest['attacker_attr'] } }, outcome })
    const done: Contest = { ...c, defender_attr: args.p_attr as Contest['defender_attr'], defender_avatar_id: wallAv?.id ?? c.defender_avatar_id, defender_d1: d1, defender_d2: d2, defender_mod: mod, defender_total: total, status: 'resolved', outcome, log_id: lr.id, resolved_at: new Date().toISOString() }
    useGameStore.setState((st) => ({ contests: st.contests.map((x) => (x.id === c.id ? done : x)) }))
    lock(c.attacker_id)
    return done
  }
  if (fn !== 'perform_action') return null

  const key = String(args.p_action_key)
  const p = (args.p_payload ?? {}) as ActionPayload
  const viaAv = p.via_avatar_id ? world.entityById(p.via_avatar_id) : undefined
  const free = !!viaAv
  const costs: Record<string, number> = { shape_land: 2, catastrophe: 10, great_miracle: 15, bless_land: 4, pour_river: 3, create_creature: 10, create_sapient: 15, change_creature: 5, migrate: 0, create_civilization: 22, develop_civilization: 12, exodus: 0, create_avatar: 10, pilgrimage: 0, resurrect_avatar: 12, prophecy: 10 }
  let cost = costs[key] ?? 0
  let entity_id: string | null = null
  let outcome: Record<string, unknown> = {}
  const at: HexRef = { q: Number(p.q ?? 0), r: Number(p.r ?? 0) }
  const newEntity = (over: Partial<Entity>): Entity => {
    const e = entity(0, { ...over, id: nextId('ent'), created_round: g.round_number, created_by_player_id: me.id, created_at: new Date().toISOString() })
    useGameStore.setState((st) => ({ entities: [...st.entities, e], entityGods: [...st.entityGods, { entity_id: e.id, player_id: me.id, game_id: G, role: 'creator' }] }))
    return e
  }
  const place = (entityId: string, h: HexRef) => {
    const w = buildWorld({ ...useGameStore.getState(), gifts: useGameStore.getState().gifts })
    const slot = (w.slotFor(h.q, h.r, w.roleOf(w.entityById(entityId)) ?? 'herbivore') ?? 0) as 0 | 1 | 2 | 3
    useGameStore.setState((st) => ({ occupants: [...st.occupants, { id: nextId('occ'), game_id: G, q: h.q, r: h.r, slot, entity_id: entityId, created_at: new Date().toISOString() }] }))
    return slot
  }
  switch (key) {
    case 'shape_land': {
      const hexes = (p.hexes ?? []).map((h) => ({ q: h.q, r: h.r, from: world.hexAt(h.q, h.r)?.biome ?? 'trawa' }))
      const toBiome = p.biome as BiomeKey
      useGameStore.setState((st) => ({ hexes: st.hexes.map((h) => (hexes.some((x) => x.q === h.q && x.r === h.r) ? { ...h, biome: toBiome, decor: decorFor(toBiome, Math.random), resource: toBiome === 'woda' ? null : h.resource } : h)) }))
      // a mountain cuts a river: the word asks for the new bed
      const cuts: Record<string, unknown>[] = []
      let reroute: Record<string, unknown> | null = null
      const mountain = toBiome === 'gory' || toBiome === 'gory_pustynne' || toBiome === 'gory_sniezne'
      for (const h of hexes) {
        for (const rv of useGameStore.getState().rivers) {
          const k = rv.path.findIndex((n) => n.q === h.q && n.r === h.r)
          if (k < 0) continue
          if (toBiome === 'woda') {
            useGameStore.setState((st) => ({ rivers: st.rivers.map((x) => (x.id === rv.id ? { ...x, path: x.path.slice(0, k), mouth_kind: 'water' as const, mouth_q: h.q, mouth_r: h.r } : x)).filter((x) => x.path.length > 0) }))
            cuts.push({ river_id: rv.id, kind: 'water', q: h.q, r: h.r })
          } else if (mountain && k > 0) {
            useGameStore.setState((st) => ({ rivers: st.rivers.map((x) => (x.id === rv.id ? { ...x, path: x.path.slice(0, k), mouth_kind: 'none' as const, mouth_q: null, mouth_r: null, reroute_by: me.id } : x)) }))
            cuts.push({ river_id: rv.id, kind: 'mountain', q: h.q, r: h.r, from: rv.path[k - 1] })
            reroute = reroute ?? { river_id: rv.id, from: rv.path[k - 1] }
          }
        }
      }
      outcome = { biome: p.biome, hexes, rivers_cut: cuts, reroute }
      break
    }
    case 'bless_land': {
      const graceB = me.attr_primary === 'grace' ? 2 : 1
      const totalB = 4 + 4 + graceB
      const bonus = totalB <= 6 ? -1 : totalB <= 8 ? 0 : totalB <= 10 ? 1 : totalB <= 12 ? 2 : 3
      const replaced = world.hexAt(at.q, at.r)?.resource ?? null
      useGameStore.setState((st) => ({ hexes: st.hexes.map((h) => (h.q === at.q && h.r === at.r ? { ...h, resource: String(p.resource ?? '🌾'), resource_bonus: bonus } : h)) }))
      const w = buildWorld({ ...useGameStore.getState() })
      outcome = { q: at.q, r: at.r, resource: p.resource, biome: world.hexAt(at.q, at.r)?.biome, fertility: w.fertilityOf(at.q, at.r), d1: 4, d2: 4, grace: graceB, total: totalB, bonus, replaced }
      pay(cost)
      lock(me.id)
      return add({ action_key: key, logos_delta: -cost, entity_id, is_avatar_free_action: free, roll: { d1: 4, d2: 4, modifier: graceB, total: totalB, attr: 'grace' }, summary: p.summary ?? '', outcome })
    }
    case 'pour_river': {
      const path = (p.path ?? []) as HexRef[]
      const mouth = (p.mouth ?? null) as HexRef | null
      const last = path[path.length - 1]
      const into = !mouth && last ? world.riverAt(last.q, last.r) : undefined
      const rv: River = { id: nextId('rv'), game_id: G, path, mouth_kind: mouth ? 'water' : 'river', mouth_q: mouth?.q ?? last?.q ?? null, mouth_r: mouth?.r ?? last?.r ?? null, into_river_id: into?.id ?? null, reroute_by: null, created_round: g.round_number, created_by_player_id: me.id, created_at: new Date().toISOString() }
      useGameStore.setState((st) => ({ rivers: [...st.rivers, rv] }))
      outcome = { river_id: rv.id, path, mouth_kind: rv.mouth_kind, mouth: { q: rv.mouth_q, r: rv.mouth_r }, length: Math.max(0, path.length - 1), source_biome: path[0] ? world.hexAt(path[0].q, path[0].r)?.biome : null, biomes: path.map((n) => world.hexAt(n.q, n.r)?.biome ?? 'trawa') }
      break
    }
    case 'catastrophe': {
      const city = world.cityAt(at.q, at.r)
      const cityEnt = city ? world.entityById(city.entity_id) : undefined
      const d1 = 4, d2 = 4
      const pm = spendProphecy(p.prophecy_id)
      const total = d1 + d2 - 1 + pm
      const damage = Math.max(1, Math.floor(total / 2))
      const hits: Record<string, unknown>[] = []
      for (let i = 0; i < damage; i++) {
        const st = useGameStore.getState()
        const dots = city ? st.followers.filter((f) => f.city_id === city.entity_id) : []
        if (dots.length > 0) {
          const victim = dots[0]
          removeDots(city!.entity_id, victim.player_id, 1)
          souls(city!.entity_id, victim.player_id, 1)
          hits.push({ t: 'dot', player_id: victim.player_id, city_id: city!.entity_id })
          continue
        }
        const occ = st.occupants.find((o) => o.q === at.q && o.r === at.r && st.entities.find((e) => e.id === o.entity_id)?.kind === 'creature')
        if (occ) {
          useGameStore.setState({ occupants: st.occupants.filter((o) => o.id !== occ.id) })
          hits.push({ t: 'creature', entity_id: occ.entity_id, name: st.entities.find((e) => e.id === occ.entity_id)?.name, extinct: false })
        }
      }
      const stillThere = useGameStore.getState().occupants.some((o) => o.q === at.q && o.r === at.r) || (city && useGameStore.getState().followers.some((f) => f.city_id === city.entity_id))
      const after = p.after && !stillThere ? p.after : null
      if (after) useGameStore.setState((st) => ({ hexes: st.hexes.map((h) => (h.q === at.q && h.r === at.r ? { ...h, biome: after, decor: [] } : h)) }))
      outcome = { type: p.type, q: at.q, r: at.r, d1, d2, total, wrath: -1, damage, hits, prophecy: pm || undefined, city_id: city?.entity_id ?? null, city_name: cityEnt?.name ?? null, city_destroyed: false, wasted: damage - hits.length, biome_after: after }
      entity_id = city?.entity_id ?? null
      break
    }
    case 'create_creature':
    case 'create_sapient':
    case 'create_avatar': {
      const diet = key === 'create_creature' ? (p.entity?.diet ?? 'herbivore') : null
      const beast = diet === 'carnivore'
      const herd = diet === 'herbivore'
      const wrath = me.attr_primary === 'wrath' ? 2 : -1
      const graceC = me.attr_primary === 'grace' ? 2 : 1
      const total = 4 + 4 + (beast ? wrath : graceC)
      const strength = beast || herd ? (total <= 6 ? -1 : total <= 8 ? 0 : total <= 10 ? 1 : total <= 12 ? 2 : 3) : 0
      const e = newEntity({ kind: key === 'create_avatar' ? 'avatar' : 'creature', name: p.entity?.name ?? 'Bez imienia', traits: p.entity?.traits ?? [], conditions: p.entity?.conditions ?? [], emoji: p.emoji ?? null, hp: key === 'create_avatar' ? 2 : null, max_hp: key === 'create_avatar' ? 2 : null, diet, strength })
      const slot = place(e.id, at)
      entity_id = e.id
      const role = key === 'create_avatar' ? 'avatar' : key === 'create_sapient' ? 'tribe' : beast ? 'beast' : 'herbivore'
      outcome = { q: at.q, r: at.r, slot, emoji: p.emoji, biome: world.hexAt(at.q, at.r)?.biome, role, diet, strength, d1: beast || herd ? 4 : null, d2: beast || herd ? 4 : null, wrath: beast ? wrath : null, grace: herd ? graceC : null, total: beast || herd ? total : null }
      if (beast || herd) {
        pay(cost)
        lock(me.id)
        return add({ action_key: key, logos_delta: -cost, entity_id, is_avatar_free_action: free, roll: { d1: 4, d2: 4, modifier: beast ? wrath : graceC, total, attr: beast ? 'wrath' : 'grace' }, summary: p.summary ?? '', outcome })
      }
      break
    }
    case 'change_creature': {
      const occ = s.occupants.find((o) => o.id === p.occupant_id)
      const src = occ ? world.entityById(occ.entity_id) : undefined
      const e = newEntity({ kind: 'creature', name: p.entity?.name ?? 'Odmiana', traits: p.entity?.traits ?? [], emoji: p.emoji ?? null })
      if (occ) useGameStore.setState((st) => ({ occupants: st.occupants.map((o) => (o.id === occ.id ? { ...o, entity_id: e.id } : o)), entityLinks: [...st.entityLinks, { from_entity_id: e.id, to_entity_id: occ.entity_id, game_id: G, relation: 'variant_of' }] }))
      entity_id = e.id
      outcome = { q: occ?.q, r: occ?.r, from_entity_id: src?.id, from_name: src?.name, emoji: p.emoji }
      break
    }
    case 'migrate': {
      const to = p.to ?? at
      place(String(p.entity_id), to)
      cost = hexDistance(p.from ?? at, to)
      entity_id = String(p.entity_id)
      outcome = { from: p.from, to, distance: cost, name: world.entityById(p.entity_id)?.name, emoji: world.entityById(p.entity_id)?.emoji }
      break
    }
    case 'create_civilization': {
      const e = newEntity({ kind: 'civilization', name: p.entity?.name ?? 'Bez imienia', traits: p.entity?.traits ?? [], specialties: p.entity?.specialties ?? [], flaws: p.entity?.flaws ?? [] })
      useGameStore.setState((st) => ({ cities: [...st.cities, { entity_id: e.id, game_id: G, q: at.q, r: at.r, atheists: 0 }], entityLinks: [...st.entityLinks, { from_entity_id: e.id, to_entity_id: String(p.species_id), game_id: G, relation: 'member_species' }] }))
      addDots(e.id, me.id, 1)
      entity_id = e.id
      outcome = { q: at.q, r: at.r, species_id: p.species_id, species_name: world.entityById(p.species_id)?.name, biome: world.hexAt(at.q, at.r)?.biome }
      break
    }
    case 'develop_civilization': {
      const cityId = String(p.city_id)
      const score = me.attr_primary === p.attr ? 2 : 1
      const pm = spendProphecy(p.prophecy_id)
      const total = 4 + 4 + score + (free ? -2 : 0) + pm
      const tier = total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak'
      const gained = tier === 'strong' ? 2 : tier === 'mixed' ? 1 : 0
      const added = addDots(cityId, me.id, gained)
      useGameStore.setState((st) => ({ gifts: [...st.gifts, { id: nextId('gift'), game_id: G, city_id: cityId, player_id: me.id, text: String(p.gift), accepted: gained > 0, dots_gained: added, round_number: g.round_number, created_at: new Date().toISOString() }] }))
      entity_id = cityId
      outcome = { city_id: cityId, city_name: world.entityById(cityId)?.name, d1: 4, d2: 4, attr: p.attr, score, avatar: free, total, tier, gained, added, wasted: gained - added, gift: p.gift, level: world.cityDots(cityId) + added, prophecy: pm ? { hold: pm } : undefined }
      break
    }
    case 'exodus': {
      const to = p.to ?? at
      const src = world.cityOf(String(p.city_id))
      cost = src ? hexDistance(src, to) : 1
      const moved = removeDots(String(p.city_id), me.id, Number(p.dots ?? 1))
      const existing = world.cityAt(to.q, to.r)
      let target: Entity
      if (existing) target = world.entityById(existing.entity_id)!
      else {
        const mother = world.entityById(p.city_id)
        target = newEntity({ kind: 'civilization', name: p.name ?? 'Nowe miasto', description: p.description ?? '', traits: mother?.traits ?? [], specialties: mother?.specialties ?? [], flaws: mother?.flaws ?? [], parent_civilization_id: mother?.id ?? null })
        useGameStore.setState((st) => ({ cities: [...st.cities, { entity_id: target.id, game_id: G, q: to.q, r: to.r, atheists: 0 }] }))
      }
      const added = addDots(target.id, me.id, moved)
      if (!useGameStore.getState().occupants.some((o) => o.q === to.q && o.r === to.r && o.entity_id === p.species_id)) place(String(p.species_id), to)
      entity_id = target.id
      outcome = { from_city_id: p.city_id, from_name: world.entityById(p.city_id)?.name, to_city_id: target.id, to_name: target.name, new: !existing, dots: moved, added, wasted: moved - added, distance: cost, q: to.q, r: to.r, species_name: world.entityById(p.species_id)?.name, emoji: world.entityById(p.species_id)?.emoji, source_destroyed: false }
      break
    }
    case 'pilgrimage': {
      const occ = s.occupants.find((o) => o.entity_id === p.avatar_id)
      const dist = p.to && occ ? hexDistance(occ, p.to) : 0
      cost = dist
      if (p.to && occ) {
        const to = p.to
        const w = buildWorld({ ...s })
        const slot = (w.slotFor(to.q, to.r, 'avatar') ?? 2) as 0 | 1 | 2 | 3
        useGameStore.setState((st) => ({ occupants: st.occupants.map((o) => (o.id === occ.id ? { ...o, q: to.q, r: to.r, slot } : o)) }))
      }
      entity_id = String(p.avatar_id)
      outcome = { avatar_id: p.avatar_id, name: world.entityById(p.avatar_id)?.name, emoji: world.entityById(p.avatar_id)?.emoji, from: occ ? { q: occ.q, r: occ.r } : undefined, to: p.to, distance: dist }
      break
    }
    case 'prophecy': {
      const av = world.entityById(p.avatar_id)
      const pr: Prophecy = { id: nextId('pr'), game_id: G, player_id: me.id, avatar_id: String(p.avatar_id), text: String(p.text ?? ''), hold: 1, status: 'active', created_round: g.round_number, fulfilled_round: null, created_at: new Date().toISOString() }
      useGameStore.setState((st) => ({ prophecies: [...st.prophecies, pr] }))
      entity_id = String(p.avatar_id)
      outcome = { avatar_id: p.avatar_id, avatar_name: av?.name, emoji: av?.emoji, text: p.text }
      break
    }
    case 'resurrect_avatar': {
      const id = String(p.entity?.id)
      const gen = Math.min(12, (world.entityById(id)?.max_hp ?? 2) + 1)
      useGameStore.setState((st) => ({ entities: st.entities.map((e) => (e.id === id ? { ...e, status: 'active', hp: gen, max_hp: gen, conditions: p.entity?.conditions ?? e.conditions } : e)) }))
      place(id, at)
      entity_id = id
      outcome = { q: at.q, r: at.r, name: world.entityById(id)?.name }
      break
    }
    default:
      break
  }
  if (free) {
    cost = Math.ceil(cost / 2)
    outcome = { ...outcome, via_avatar: { id: viaAv!.id, name: viaAv!.name, emoji: viaAv!.emoji } }
    if (key === 'great_miracle') useGameStore.setState((st) => ({ entities: st.entities.map((e) => (e.id === viaAv!.id ? { ...e, status: 'dead', hp: 0 } : e)), occupants: st.occupants.filter((o) => o.entity_id !== viaAv!.id) }))
    if (key === 'exodus' && p.to) {
      const to = p.to
      const occ = useGameStore.getState().occupants.find((o) => o.entity_id === viaAv!.id)
      const w = buildWorld({ ...useGameStore.getState() })
      const slot = w.slotFor(to.q, to.r, 'avatar')
      if (occ && slot !== null) useGameStore.setState((st) => ({ occupants: st.occupants.map((o) => (o.id === occ.id ? { ...o, q: to.q, r: to.r, slot: slot as 0 | 1 | 2 | 3 } : o)) }))
      outcome = { ...outcome, avatar_moved: !!occ && slot !== null, avatar_name: viaAv!.name, avatar_emoji: viaAv!.emoji }
    }
  }
  pay(cost)
  lock(me.id)
  return add({ action_key: key, logos_delta: -cost, entity_id, is_avatar_free_action: free, summary: p.summary ?? '', outcome })
}

export function DevPreview() {
  const [params] = useSearchParams()
  const screen = params.get('screen') ?? 'game'
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(window as unknown as { __previewRpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown> }).__previewRpc = async (fn, args) => previewRpc(fn, args)
    const base = {
      gameId: G, players, profiles, entities, entityGods,
      entityLinks: [{ from_entity_id: E(4), to_entity_id: E(1), game_id: G, relation: 'member_species' as const }, { from_entity_id: E(9), to_entity_id: E(1), game_id: G, relation: 'member_species' as const }],
      log, chaosDraws: [], eraVotes: [{ game_id: G, player_id: P(2), target_era: 2, created_at: '' }],
      palette: [
        { id: 'pa1', game_id: G, player_id: P(1), column: 'yes' as const, text: 'sterowce', created_at: '' },
        { id: 'pa2', game_id: G, player_id: P(2), column: 'yes' as const, text: 'magia herbaty', created_at: '' },
        { id: 'pa3', game_id: G, player_id: P(3), column: 'veil' as const, text: 'brutalna śmierć', created_at: '' },
        { id: 'pa4', game_id: G, player_id: P(4), column: 'no' as const, text: 'magia bez ceny', created_at: '' },
      ],
      creationOptions: [] as typeof creationOptions, creationVotes: [] as typeof creationVotes,
      hexes: previewHexes(), occupants, cities, followers, gifts, contests: contestFor(params.get('contest') ?? ''), prophecies,
      rivers, night: null,
      connected: true, loading: false, error: null,
    }
    switch (screen) {
      case 'night': {
        // &pending=fight|naming: the night waits for rolls or for a name; &host=0: I am not the host
        useGameStore.setState({
          ...base,
          game: game({ phase: 'chaos', current_turn_player_id: null, host_id: params.get('host') === '0' ? 'u2' : U1 }),
          players: players.map((p) => ({ ...p, is_resting: true })),
          log: [...log, ...nightLog()],
          night: nightFor(params.get('pending')),
        })
        break
      }
      case 'chaos': {
        const chosenDraw = params.get('draw') === 'chosen'
        useGameStore.setState({
          ...base,
          game: game({ phase: 'chaos', current_turn_player_id: null }),
          players: players.map((p) => ({ ...p, is_resting: true })),
          log: chosenDraw
            ? [...log, row('l9', { player_id: P(1), action_key: 'chaos_answer', summary: 'O co chodzi? O sól i o prawo do brodów na Rzece Białej.', created_at: '2026-01-10T10:09:00' })]
            : log,
          // &cat=people&entry=5 picks another card (e.g. Exodus: a people leaves)
          chaosDraws: params.get('draw') ? [{ id: 'd1', game_id: G, round_number: 3, era: 1, die1: 5, die2: 2, category_die: chosenDraw ? 2 : null, category_key: chosenDraw ? (params.get('cat') ?? 'event') : null, entry_index: chosenDraw ? Number(params.get('entry') ?? 5) : null, revealed_by: P(1), resolution_notes: '', revealed_at: '2026-01-10T10:05:00', seq: 1 }] : [],
        })
        break
      }
      case 'creation':
        useGameStore.setState({
          ...base,
          game: game({ status: 'creation', host_id: params.get('host') === '0' ? 'u2' : U1, settings: { creation_step: Number(params.get('step') ?? 0) } }),
          entities: [], log: [], hexes: [], occupants: [], cities: [], followers: [], gifts: [],
          creationOptions, creationVotes,
        })
        break
      case 'rolling':
        useGameStore.setState({
          ...base,
          game: game({ phase: 'rolling', current_turn_player_id: null, round_number: 4 }),
          players: players.map((p, i) => ({ ...p, has_rolled: params.get('rolled') === '1' ? i !== 2 : i % 2 === 1, is_resting: false })),
          log: params.get('rolled') === '1'
            ? [...log, row('l5', { round_number: 4, player_id: P(1), action_key: 'logos_roll', logos_delta: 12, roll: { d1: 6, d2: 5, total: 12, bonus_streak: 1, bonus_orthodoxy: 0 }, summary: 'Ta, Która Śpi Pod Rzeką budzi się i śni nowe Słowa. Kości mówią: 6 i 5, skromność dodaje 1. Nowych Słów jest 12.', created_at: '2026-01-11T10:00:00' })]
            : log,
        })
        break
      case 'room':
        useGameStore.setState({
          ...base,
          game: game({ status: 'lobby' }),
          entities: [], log: [], hexes: [], occupants: [], cities: [], followers: [], gifts: [],
          // &domain=0: the signed-in god has not chosen a domain yet
          players: params.get('domain') === '0' ? players.map((p, i) => (i === 0 ? { ...p, domain_key: null, attr_primary: null, attr_bonus: null, god_notes: '' } : p)) : players,
        })
        break
      case 'palette':
        useGameStore.setState({ ...base, game: game({ status: 'palette' }), entities: [], log: [], hexes: [], occupants: [], cities: [], followers: [], gifts: [] })
        break
      default:
        useGameStore.setState({
          ...base,
          game: game({ ...(params.get('turn') === 'me' ? { current_turn_player_id: P(1) } : {}), ...(params.get('lock') === 'me' ? { current_turn_player_id: P(1), verse_pending_by: P(1) } : {}) }),
          players: params.get('turn') === 'me' ? players.map((p, i) => (i === 0 ? { ...p, logos: 40 } : p)) : players,
          log: params.get('contest') === 'resolved' ? [...log, row('lc1', { player_id: P(1), action_key: 'convert', entity_id: E(4), roll: { d1: 4, d2: 5, att: { d1: 4, d2: 5, modifier: 0, total: 9, attr: 'majesty' }, def: { d1: 2, d2: 3, modifier: 1, total: 6, attr: 'whisper' } }, outcome: { kind: 'convert', diff: 3, converted: 2, target_city_id: E(4), target_name: 'Stoicy Znad Rzeki', attacker_id: P(1), defender_id: P(2), attacker_total: 9, defender_total: 6, defender_dots: 2 }, created_at: '2026-01-10T10:06:00' })] : log,
        })
    }
    setReady(true)
  }, [screen, params])

  if (!ready) return null
  if (screen === 'login') return <TempleLogin />
  const ctx = { user: { id: U1 } as User, profile: profiles.u1, refreshProfile: async () => {} }
  return (
    <AuthContext.Provider value={ctx}>
      {screen === 'lobby' && <LobbyPage />}
      {screen === 'room' && <RoomWaiting />}
      {screen === 'palette' && <PalettePage />}
      {screen === 'creation' && <WorldCreationPage />}
      {(screen === 'game' || screen === 'chaos' || screen === 'rolling' || screen === 'night') && <GamePage />}
    </AuthContext.Provider>
  )
}
