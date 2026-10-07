// Dev-only preview of the game screens with fake data (no Supabase needed).
//   /preview?screen=game|chaos|rolling|lobby|room|palette|creation|login
//   &domain=0 (room: no domain yet), &sheet=p2 (game: that god's sheet open), &turn=me (game: my turn, 40 Logos)
//   &contest=defender|attacker|resolved (game: a contest in that state)
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '@/features/auth/AuthGate'
import { useGameStore } from '@/store/useGameStore'
import type { ActionLog, ActionPayload, BiomeKey, City, CityFollower, CityGift, Contest, Entity, Game, Hex, HexOccupant, HexRef, Player } from '@/lib/types'
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
  player(1, { god_name: 'Ta, Która Śpi Pod Rzeką', god_description: 'bogini rzek i cierpliwości', god_gender: 'f', logos: 11, low_logos_streak: 1, domain_key: 'harvest', attr_primary: 'grace', attr_bonus: 'wisdom', god_notes: 'Śpi pod rzeką od początku świata i liczy pory roku po barwie wody. Budzi się, gdy ktoś łamie obietnicę złożoną nad wodą.' }),
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
  entity(2, { name: 'Rzeczne węże', emoji: '🐍', traits: ['Jadowite', 'Wędrowne'] }),
  entity(3, { name: 'Kałamarnice, co chodzą', emoji: '🦑', traits: ['Umysł roju', 'Płynne', 'Nocne'] }),
  entity(4, { kind: 'civilization', name: 'Stoicy Znad Rzeki', traits: ['Zachowawcza', 'Współpracująca'], specialties: ['Rolnictwo', 'Wiara/Religia'], flaws: ['Magia'], description: 'Spokojny lud manuli, który liczy pory roku po barwie wody.' }),
  entity(7, { kind: 'avatar', name: 'Posąg z Białego Kamienia', emoji: '🗿', hp: 2, conditions: ['Są nieożywionym przedmiotem, jak posąg, klejnot, góra.'], created_by_player_id: P(2) }),
  entity(8, { kind: 'avatar', name: 'Sowa o Stu Imionach', emoji: '🦉', hp: 0, conditions: ['Nie wiedzą, że są Awatarem.'], status: 'dead', created_by_player_id: P(1) }),
  entity(9, { kind: 'civilization', name: 'Przystań Soli', traits: ['Kupiecka'], specialties: ['Handel'], flaws: ['Ziemia'], parent_civilization_id: E(4), description: 'Wyszli z miasta Stoików, by handlować solą.', created_by_player_id: P(4) }),
]

const entityGods = [
  { entity_id: E(7), player_id: P(2), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(4), game_id: G, role: 'co_creator' as const },
  { entity_id: E(8), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(4), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(9), player_id: P(4), game_id: G, role: 'creator' as const },
]

/** the map: a seeded draw, with a known neighbourhood in the middle */
function previewHexes(): Hex[] {
  const hexes = generatePreviewMap(G, 7)
  const fixed: Record<string, BiomeKey> = { '0,0': 'trawa', '1,0': 'trawa', '1,-1': 'puszcza', '0,-1': 'wzgorza', '-1,0': 'trawa', '-1,1': 'pustynia', '0,1': 'bagno', '2,-2': 'woda', '0,2': 'gory' }
  let seed = 11
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return hexes.map((h) => {
    const b = fixed[`${h.q},${h.r}`]
    return b ? { ...h, biome: b, decor: decorFor(b, rnd) } : h
  })
}

const occupants: HexOccupant[] = [
  { id: 'o1', game_id: G, q: 0, r: 0, slot: 0, entity_id: E(1), created_at: '' },
  { id: 'o2', game_id: G, q: 0, r: 0, slot: 1, entity_id: E(3), created_at: '' },
  { id: 'o3', game_id: G, q: 1, r: 0, slot: 0, entity_id: E(1), created_at: '' },
  { id: 'o4', game_id: G, q: -1, r: 0, slot: 2, entity_id: E(2), created_at: '' },
  { id: 'o5', game_id: G, q: 0, r: -1, slot: 1, entity_id: E(7), created_at: '' },
  { id: 'o6', game_id: G, q: 1, r: -1, slot: 0, entity_id: E(1), created_at: '' },
]
const cities: City[] = [
  { entity_id: E(4), game_id: G, q: 0, r: 0 },
  { entity_id: E(9), game_id: G, q: 1, r: -1 },
]
const followers: CityFollower[] = [
  { game_id: G, city_id: E(4), player_id: P(1), dots: 4 },
  { game_id: G, city_id: E(4), player_id: P(2), dots: 2 },
  { game_id: G, city_id: E(9), player_id: P(4), dots: 3 },
  { game_id: G, city_id: E(9), player_id: P(1), dots: 1 },
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
  row('l2', { player_id: P(2), action_key: 'shape_land', logos_delta: -2, outcome: { biome: 'wzgorza', hexes: [{ q: 0, r: -1, from: 'trawa' }] }, created_at: '2026-01-10T10:01:00' }),
  row('l2b', { player_id: P(2), action_key: 'develop_civilization', logos_delta: -12, entity_id: E(4), outcome: { city_id: E(4), city_name: 'Stoicy Znad Rzeki', d1: 2, d2: 3, attr: 'wisdom', score: 2, total: 7, tier: 'mixed', gained: 1, added: 1, wasted: 0, gift: 'Rachunek długu', level: 6 }, created_at: '2026-01-10T10:01:30' }),
  row('l3b', { player_id: P(2), action_key: 'great_miracle', is_avatar_free_action: true, summary: 'Cały kontynent unosi się nad morzem.', created_at: '2026-01-10T10:02:30' }),
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
    id: 'c1', game_id: G, round_number: 3, era: 1, kind: 'convert', attacker_id: P(1), defender_id: P(2), target_city_id: E(4), source_city_id: null, army: null, cost: 6,
    attacker_attr: 'majesty', attacker_d1: 4, attacker_d2: 5, attacker_mod: 0, attacker_total: 9,
    defender_attr: null, defender_d1: null, defender_d2: null, defender_mod: null, defender_total: null,
    status: 'pending', outcome: null, log_id: null, created_at: '2026-01-10T10:05:00', resolved_at: null,
  }
  if (state === 'defender') return [{ ...base, attacker_id: P(2), defender_id: P(1), attacker_attr: 'whisper', attacker_mod: 1, attacker_total: 10 }]
  if (state === 'attacker') return [{ ...base, kind: 'holy_war', source_city_id: E(9), army: 2, cost: 1, attacker_attr: 'wrath', attacker_mod: 1, attacker_total: 10, target_city_id: E(4) }]
  return [{ ...base, status: 'resolved', defender_attr: 'whisper', defender_d1: 2, defender_d2: 3, defender_mod: 1, defender_total: 6, outcome: { kind: 'convert', diff: 3, converted: 2, target_city_id: E(4), target_name: 'Stoicy Znad Rzeki', attacker_id: P(1), defender_id: P(2), attacker_total: 9, defender_total: 6, defender_dots: 2 }, log_id: 'lc1' }]
}

let seq = 0
const nextId = (p: string) => `${p}-${Date.now()}-${seq++}`

/** answers the windows' calls locally so every flow can be walked through without a server */
function previewRpc(fn: string, args: Record<string, unknown>): unknown {
  const s = useGameStore.getState()
  const me = s.players.find((p) => p.user_id === U1)!
  const g = s.game!
  const world = buildWorld({ hexes: s.hexes, occupants: s.occupants, cities: s.cities, followers: s.followers, gifts: s.gifts, entities: s.entities, entityGods: s.entityGods })
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
  const pay = (n: number) => useGameStore.setState((st) => ({ players: st.players.map((p) => (p.id === me.id ? { ...p, logos: p.logos - n } : p)) }))

  if (fn === 'log_dice_roll') {
    const mod = Number(args.p_modifier ?? 0)
    const total = 8 + mod
    return add({ action_key: 'dice', roll: { d1: 4, d2: 4, modifier: mod, total, tier: total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak' }, summary: String(args.p_context ?? '') })
  }
  if (fn === 'set_god') {
    useGameStore.setState((st) => ({
      players: st.players.map((p) =>
        p.user_id === U1
          ? { ...p, god_name: String(args.p_god_name ?? ''), god_description: String(args.p_god_description ?? ''), god_gender: (args.p_god_gender as Player['god_gender']) ?? 'm', domain_key: (args.p_domain_key as Player['domain_key']) ?? null, attr_primary: (args.p_attr_primary as Player['attr_primary']) ?? null, attr_bonus: (args.p_attr_bonus as Player['attr_bonus']) ?? null, god_notes: String(args.p_god_notes ?? '') }
          : p,
      ),
    }))
    return null
  }
  if (fn === 'edit_log_summary') {
    useGameStore.setState((st) => ({ log: st.log.map((l) => (l.id === args.p_log_id ? { ...l, summary: String(args.p_summary ?? '') } : l)) }))
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
    const c: Contest = {
      id: nextId('contest'), game_id: G, round_number: g.round_number, era: g.era, kind: kind as Contest['kind'], attacker_id: me.id,
      defender_id: String(p.defender_id), target_city_id: String(kind === 'convert' ? p.city_id : p.target_city_id), source_city_id: kind === 'holy_war' ? String(p.source_city_id) : null,
      army: kind === 'holy_war' ? Number(p.army) : null, cost: kind === 'convert' ? 6 : 1, attacker_attr: kind === 'convert' ? (p.attr as Contest['attacker_attr']) : 'wrath',
      attacker_d1: 4, attacker_d2: 5, attacker_mod: kind === 'holy_war' ? Number(p.army) : 1, attacker_total: 9 + (kind === 'holy_war' ? Number(p.army) : 1),
      defender_attr: null, defender_d1: null, defender_d2: null, defender_mod: null, defender_total: null, status: 'pending', outcome: null, log_id: null, created_at: new Date().toISOString(), resolved_at: null,
    }
    pay(c.cost)
    if (kind === 'holy_war') removeDots(c.source_city_id!, me.id, c.army!)
    add({ action_key: 'contest_declared', logos_delta: -c.cost, entity_id: c.target_city_id, roll: { d1: 4, d2: 5, modifier: c.attacker_mod, total: c.attacker_total, attr: c.attacker_attr }, outcome: { kind, contest_id: c.id, defender_id: c.defender_id, target_name: world.entityById(c.target_city_id)?.name ?? '', army: c.army } })
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
      useGameStore.setState((st) => ({ contests: st.contests.map((x) => (x.id === c.id ? { ...x, status: 'committed' } : x)), log: st.log.map((l) => (l.id === c.log_id ? { ...l, summary: String(args.p_summary ?? '') } : l)) }))
      return null
    }
    const d1 = 3, d2 = 2
    const mod = (c.kind === 'holy_war' ? world.dotsOf(c.target_city_id, c.defender_id) : 0) + 1
    const total = d1 + d2 + mod
    const diff = c.attacker_total - total
    const outcome: Record<string, unknown> = { kind: c.kind, diff, target_city_id: c.target_city_id, target_name: world.entityById(c.target_city_id)?.name ?? '', attacker_id: c.attacker_id, defender_id: c.defender_id, attacker_total: c.attacker_total, defender_total: total }
    if (c.kind === 'convert') {
      const k = diff >= 3 ? 2 : diff >= 1 ? 1 : 0
      const conv = removeDots(c.target_city_id, c.defender_id, k)
      addDots(c.target_city_id, c.attacker_id, conv)
      outcome.converted = conv
    } else {
      const army = c.army ?? 0
      let removed = 0, converted = 0, attLost = 0, defLost = 0, returned = 0
      if (diff >= 3) { removed = removeDots(c.target_city_id, c.defender_id, army); converted = addDots(c.target_city_id, c.attacker_id, Math.ceil(removed / 2)); returned = army }
      else if (diff >= 1) { removed = removeDots(c.target_city_id, c.defender_id, army); converted = addDots(c.target_city_id, c.attacker_id, Math.ceil(removed / 2)); attLost = Math.ceil(army / 2); returned = army - attLost }
      else if (diff === 0) { defLost = removeDots(c.target_city_id, c.defender_id, 1); attLost = 1; returned = army - 1 }
      else if (diff >= -2) { defLost = removeDots(c.target_city_id, c.defender_id, 1); attLost = army - 1; returned = 1 }
      else { attLost = army }
      if (returned > 0 && c.source_city_id) addDots(c.source_city_id, c.attacker_id, returned)
      Object.assign(outcome, { army, removed, converted, attacker_lost: attLost, defender_lost: removed + defLost, returned })
    }
    const lr = add({ player_id: c.attacker_id, action_key: c.kind, entity_id: c.target_city_id, roll: { d1: c.attacker_d1, d2: c.attacker_d2, att: { d1: c.attacker_d1, d2: c.attacker_d2, modifier: c.attacker_mod, total: c.attacker_total, attr: c.attacker_attr }, def: { d1, d2, modifier: mod, total, attr: args.p_attr as Contest['attacker_attr'] } }, outcome })
    const done: Contest = { ...c, defender_attr: args.p_attr as Contest['defender_attr'], defender_d1: d1, defender_d2: d2, defender_mod: mod, defender_total: total, status: 'resolved', outcome, log_id: lr.id, resolved_at: new Date().toISOString() }
    useGameStore.setState((st) => ({ contests: st.contests.map((x) => (x.id === c.id ? done : x)) }))
    return done
  }
  if (fn !== 'perform_action') return null

  const key = String(args.p_action_key)
  const p = (args.p_payload ?? {}) as ActionPayload
  const free = !!p.use_avatar_action
  const costs: Record<string, number> = { shape_land: 2, catastrophe: 10, great_miracle: 15, create_creature: 10, create_sapient: 15, change_creature: 5, migrate: 0, create_civilization: 22, develop_civilization: 12, exodus: 0, create_avatar: 10, command_avatar: 2, resurrect_avatar: 12 }
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
    const slot = (w.freeSlot(h.q, h.r) ?? 0) as 0 | 1 | 2
    useGameStore.setState((st) => ({ occupants: [...st.occupants, { id: nextId('occ'), game_id: G, q: h.q, r: h.r, slot, entity_id: entityId, created_at: new Date().toISOString() }] }))
    return slot
  }
  switch (key) {
    case 'shape_land': {
      const hexes = (p.hexes ?? []).map((h) => ({ q: h.q, r: h.r, from: world.hexAt(h.q, h.r)?.biome ?? 'trawa' }))
      useGameStore.setState((st) => ({ hexes: st.hexes.map((h) => (hexes.some((x) => x.q === h.q && x.r === h.r) ? { ...h, biome: p.biome as BiomeKey, decor: decorFor(p.biome as BiomeKey, Math.random) } : h)) }))
      outcome = { biome: p.biome, hexes }
      break
    }
    case 'catastrophe': {
      const city = world.cityAt(at.q, at.r)
      const cityEnt = city ? world.entityById(city.entity_id) : undefined
      const d6 = 4
      const damage = Math.max(1, d6 - 1)
      const hits: Record<string, unknown>[] = []
      for (let i = 0; i < damage; i++) {
        const st = useGameStore.getState()
        const dots = city ? st.followers.filter((f) => f.city_id === city.entity_id) : []
        if (dots.length > 0) {
          const victim = dots[0]
          removeDots(city!.entity_id, victim.player_id, 1)
          hits.push({ t: 'dot', player_id: victim.player_id, city_id: city!.entity_id })
          continue
        }
        const occ = st.occupants.find((o) => o.q === at.q && o.r === at.r && st.entities.find((e) => e.id === o.entity_id)?.kind === 'creature')
        if (occ) {
          useGameStore.setState({ occupants: st.occupants.filter((o) => o.id !== occ.id) })
          hits.push({ t: 'creature', entity_id: occ.entity_id, name: st.entities.find((e) => e.id === occ.entity_id)?.name, extinct: false })
        }
      }
      outcome = { type: p.type, q: at.q, r: at.r, d6, wrath: -1, damage, hits, city_id: city?.entity_id ?? null, city_name: cityEnt?.name ?? null, city_destroyed: false, wasted: damage - hits.length }
      entity_id = city?.entity_id ?? null
      break
    }
    case 'create_creature':
    case 'create_sapient':
    case 'create_avatar': {
      const e = newEntity({ kind: key === 'create_avatar' ? 'avatar' : 'creature', name: p.entity?.name ?? 'Bez imienia', traits: p.entity?.traits ?? [], conditions: p.entity?.conditions ?? [], emoji: p.emoji ?? null, hp: key === 'create_avatar' ? 3 : null })
      const slot = place(e.id, at)
      entity_id = e.id
      outcome = { q: at.q, r: at.r, slot, emoji: p.emoji, biome: world.hexAt(at.q, at.r)?.biome }
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
      useGameStore.setState((st) => ({ cities: [...st.cities, { entity_id: e.id, game_id: G, q: at.q, r: at.r }], entityLinks: [...st.entityLinks, { from_entity_id: e.id, to_entity_id: String(p.species_id), game_id: G, relation: 'member_species' }] }))
      addDots(e.id, me.id, 1)
      entity_id = e.id
      outcome = { q: at.q, r: at.r, species_id: p.species_id, species_name: world.entityById(p.species_id)?.name, biome: world.hexAt(at.q, at.r)?.biome }
      break
    }
    case 'develop_civilization': {
      const cityId = String(p.city_id)
      const score = me.attr_primary === p.attr ? 2 : 1
      const total = 4 + 4 + score + (free ? -2 : 0)
      const tier = total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak'
      const gained = tier === 'strong' ? 2 : tier === 'mixed' ? 1 : 0
      const added = addDots(cityId, me.id, gained)
      useGameStore.setState((st) => ({ gifts: [...st.gifts, { id: nextId('gift'), game_id: G, city_id: cityId, player_id: me.id, text: String(p.gift), accepted: gained > 0, dots_gained: added, round_number: g.round_number, created_at: new Date().toISOString() }] }))
      entity_id = cityId
      outcome = { city_id: cityId, city_name: world.entityById(cityId)?.name, d1: 4, d2: 4, attr: p.attr, score, avatar: free, total, tier, gained, added, wasted: gained - added, gift: p.gift, level: world.cityDots(cityId) + added }
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
        useGameStore.setState((st) => ({ cities: [...st.cities, { entity_id: target.id, game_id: G, q: to.q, r: to.r }] }))
      }
      const added = addDots(target.id, me.id, moved)
      if (!useGameStore.getState().occupants.some((o) => o.q === to.q && o.r === to.r && o.entity_id === p.species_id)) place(String(p.species_id), to)
      entity_id = target.id
      outcome = { from_city_id: p.city_id, from_name: world.entityById(p.city_id)?.name, to_city_id: target.id, to_name: target.name, new: !existing, dots: moved, added, wasted: moved - added, distance: cost, q: to.q, r: to.r, species_name: world.entityById(p.species_id)?.name, emoji: world.entityById(p.species_id)?.emoji, source_destroyed: false }
      break
    }
    case 'command_avatar': {
      const occ = s.occupants.find((o) => o.entity_id === p.avatar_id)
      const dist = p.to && occ ? hexDistance(occ, p.to) : 0
      cost = 2 + dist
      if (p.to && occ) {
        const to = p.to
        const w = buildWorld({ ...s })
        const slot = (w.freeSlot(to.q, to.r) ?? 0) as 0 | 1 | 2
        useGameStore.setState((st) => ({ occupants: st.occupants.map((o) => (o.id === occ.id ? { ...o, q: to.q, r: to.r, slot } : o)) }))
      }
      entity_id = String(p.avatar_id)
      outcome = { avatar_id: p.avatar_id, name: world.entityById(p.avatar_id)?.name, from: occ ? { q: occ.q, r: occ.r } : undefined, to: p.to, distance: dist }
      break
    }
    case 'resurrect_avatar': {
      const id = String(p.entity?.id)
      useGameStore.setState((st) => ({ entities: st.entities.map((e) => (e.id === id ? { ...e, status: 'active', hp: 3, conditions: p.entity?.conditions ?? e.conditions } : e)) }))
      place(id, at)
      entity_id = id
      outcome = { q: at.q, r: at.r, name: world.entityById(id)?.name }
      break
    }
    default:
      break
  }
  if (free) cost = 0
  pay(cost)
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
      hexes: previewHexes(), occupants, cities, followers, gifts, contests: contestFor(params.get('contest') ?? ''),
      connected: true, loading: false, error: null,
    }
    switch (screen) {
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
          game: game(params.get('turn') === 'me' ? { current_turn_player_id: P(1) } : {}),
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
      {(screen === 'game' || screen === 'chaos' || screen === 'rolling') && <GamePage />}
    </AuthContext.Provider>
  )
}
