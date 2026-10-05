// Dev-only preview of the game screens with fake data (no Supabase needed).
//   /preview?screen=game|chaos|rolling|lobby|room|palette|creation|login
//   &domain=0 (room: no domain yet), &sheet=p2 (game: that god's sheet open)
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '@/features/auth/AuthGate'
import { useGameStore } from '@/store/useGameStore'
import type { ActionLog, Entity, Game, Player } from '@/lib/types'
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
  created_at: `2026-01-0${n}`,
  updated_at: '',
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
  entity(1, { name: 'Manule stoickie', traits: ['Rozumne', 'Łagodne', 'Długowieczne'] }),
  entity(2, { name: 'Rzeczne węże', traits: ['Jadowite', 'Wędrowne'] }),
  entity(3, { name: 'Kałamarnice, co chodzą', traits: ['Umysł roju', 'Płynne', 'Nocne'] }),
  entity(4, { kind: 'civilization', name: 'Stoicy Znad Rzeki', traits: ['Zachowawcza', 'Współpracująca'], specialties: ['Rolnictwo', 'Wiara/Religia'], flaws: ['Magia'], description: 'Spokojny lud manuli, który liczy pory roku po barwie wody.' }),
  entity(5, { kind: 'faction', name: 'Rada Brodów', faction_type: 'Organ rządzący', parent_civilization_id: E(4), traits: ['Biurokratyczna', 'Pokojowa'], desires: ['Kontrola'] }),
  entity(6, { kind: 'orthodoxy', name: 'Cisi Strażnicy Nurtu', faction_type: 'Sekta/Kult', parent_civilization_id: E(4), traits: ['Obowiązkowa', 'Skryta'], desires: ['Ochrona'], requirements: ['Bronić', 'Wstrzymywać się'] }),
  entity(7, { kind: 'avatar', name: 'Posąg z Białego Kamienia', conditions: ['Są nieożywionym przedmiotem, jak posąg, klejnot, góra.'], created_by_player_id: P(2) }),
  entity(8, { kind: 'avatar', name: 'Sowa o Stu Imionach', conditions: ['Nie wiedzą, że są Awatarem.'], status: 'dead', created_by_player_id: P(1) }),
]

const entityGods = [
  { entity_id: E(6), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(2), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(4), game_id: G, role: 'co_creator' as const },
  { entity_id: E(8), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(4), player_id: P(1), game_id: G, role: 'creator' as const },
]

const log = [
  { id: 'l0a', game_id: G, round_number: 0, era: 1, player_id: null, action_key: 'prologue', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Na początku, zanim padło pierwsze Słowo, bóstwa spojrzały w pustkę i powiedziały, jak jest.', created_at: '2026-01-09T10:00:00' },
  { id: 'l0b', game_id: G, round_number: 0, era: 1, player_id: null, action_key: 'prologue', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Na początku był świat, a był to płaski dysk z krawędzią, za którą jest tylko spadek.', created_at: '2026-01-09T10:00:01' },
  { id: 'l0c', game_id: G, round_number: 0, era: 1, player_id: null, action_key: 'prologue', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Wyłonił się z pierwotnych wód, które są wszędzie.', created_at: '2026-01-09T10:00:02' },
  { id: 'l0d', game_id: G, round_number: 0, era: 1, player_id: null, action_key: 'prologue', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Bóstwa są rodzeństwem, dziećmi pierwszego boga, którego same zabiły.', created_at: '2026-01-09T10:00:03' },
  { id: 'l0e', game_id: G, round_number: 1, era: 1, player_id: null, action_key: 'game_start', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Zaczyna się Pierwsza Era. Bóstwa nie mają jeszcze ani jednego Słowa i sięgają po kości.', created_at: '2026-01-09T10:01:00' },
  { id: 'l0f', game_id: G, round_number: 1, era: 1, player_id: P(1), action_key: 'create_creature', logos_delta: -10, roll: null, entity_id: E(1), is_avatar_free_action: false, summary: 'Ciche koty o kamiennych oczach, które żyją nad rzekami i boją się tylko suszy.', created_at: '2026-01-09T10:02:00' },
  { id: 'l0g', game_id: G, round_number: 1, era: 1, player_id: P(4), action_key: 'chaos_answer', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'O co chodzi? O sól i o prawo do brodów na Rzece Białej.', created_at: '2026-01-09T10:03:00' },
  { id: 'l0g2', game_id: G, round_number: 1, era: 1, player_id: P(2), action_key: 'transfer', logos_delta: -3, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Matka Soli', created_at: '2026-01-09T10:03:20' },
  { id: 'l0g3', game_id: G, round_number: 1, era: 1, player_id: P(1), action_key: 'create_civilization', logos_delta: -22, roll: null, entity_id: E(4), is_avatar_free_action: false, summary: 'Spokojny lud manuli, który liczy pory roku po barwie wody.', created_at: '2026-01-09T10:03:30' },
  { id: 'l0g4', game_id: G, round_number: 1, era: 1, player_id: P(1), action_key: 'dice', logos_delta: 0, roll: { d1: 4, d2: 4, total: 8, tier: 'mixed' as const }, entity_id: null, is_avatar_free_action: false, summary: 'Stworzenie Cywilizacji', created_at: '2026-01-09T10:03:40' },
  { id: 'l0g5', game_id: G, round_number: 1, era: 1, player_id: P(4), action_key: 'chaos_reveal', logos_delta: 0, roll: { d1: 5, d2: 1, seq: 1 }, entity_id: null, is_avatar_free_action: false, summary: 'Bóstwa śpią.', created_at: '2026-01-09T10:03:50' },
  { id: 'l0g6', game_id: G, round_number: 1, era: 1, player_id: P(4), action_key: 'chaos_choice', logos_delta: 0, roll: { d1: 5, d2: 1, category: 'region', entry: 5 }, entity_id: null, is_avatar_free_action: false, summary: 'Region: Exodus. Frakcja opuszcza region.', created_at: '2026-01-09T10:03:55' },
  { id: 'l0h', game_id: G, round_number: 1, era: 1, player_id: P(1), action_key: 'round_end', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'I minęła runda 1. Bóstwa zapadają w sen, a świat toczy się dalej.', created_at: '2026-01-09T10:04:00' },
  { id: 'l1', game_id: G, round_number: 3, era: 1, player_id: P(1), action_key: 'logos_roll', logos_delta: 8, roll: { d1: 3, d2: 4, total: 8, bonus_streak: 1, bonus_orthodoxy: 0 }, entity_id: null, is_avatar_free_action: false, summary: 'Ta, Która Śpi Pod Rzeką budzi się i śni nowe Słowa. Kości mówią: 3 i 4, skromność dodaje 1. Nowych Słów jest 8.', created_at: '2026-01-10T10:00:00' },
  { id: 'l2', game_id: G, round_number: 3, era: 1, player_id: P(2), action_key: 'shape_land', logos_delta: -2, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Góry Zębate wyrastają na północy, powoli, przez tysiąclecia.', created_at: '2026-01-10T10:01:00' },
  { id: 'l3', game_id: G, round_number: 3, era: 1, player_id: P(2), action_key: 'dice', logos_delta: 0, roll: { d1: 5, d2: 6, total: 11, tier: 'strong' as const }, entity_id: null, is_avatar_free_action: false, summary: 'Stworzenie Frakcji', created_at: '2026-01-10T10:02:00' },
  { id: 'l3b', game_id: G, round_number: 3, era: 1, player_id: P(2), action_key: 'great_miracle', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: true, summary: 'Cały kontynent unosi się nad morzem.', created_at: '2026-01-10T10:02:30' },
  { id: 'l4', game_id: G, round_number: 3, era: 1, player_id: P(3), action_key: 'rest', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Bezimienny Wiatr odpoczywa. Zachowuje swoje Słowa i milczy do końca rundy.', created_at: '2026-01-10T10:03:00' },
]

const profiles = {
  u1: { id: 'u1', display_name: 'Michał', created_at: '' },
  u2: { id: 'u2', display_name: 'Ania', created_at: '' },
  u3: { id: 'u3', display_name: 'Piotr', created_at: '' },
  u4: { id: 'u4', display_name: 'Kasia', created_at: '' },
}

export function DevPreview() {
  const [params] = useSearchParams()
  const screen = params.get('screen') ?? 'game'
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // answer the dialogs' calls locally: dice come up 4 and 4 (a 7–9), everything else just succeeds
    ;(window as unknown as { __previewRpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown> }).__previewRpc = async (fn, args) => {
      if (fn === 'log_dice_roll') {
        const mod = Number(args.p_modifier ?? 0)
        const total = 8 + mod
        const tier: ActionLog['roll'] extends infer R ? (R extends { tier?: infer T } ? T : never) : never = total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak'
        const row: ActionLog = { id: `dice-${Date.now()}`, game_id: G, round_number: 3, era: 1, player_id: P(1), action_key: 'dice', logos_delta: 0, roll: { d1: 4, d2: 4, modifier: mod, total, tier }, entity_id: null, is_avatar_free_action: false, summary: String(args.p_context ?? ''), created_at: new Date().toISOString() }
        useGameStore.setState((s) => ({ log: [...s.log, row] }))
        return row
      }
      if (fn === 'set_god') {
        // the lobby form and the sheet patch the signed-in god so "Zapisz" visibly works
        useGameStore.setState((s) => ({
          players: s.players.map((p) =>
            p.user_id === U1
              ? {
                  ...p,
                  god_name: String(args.p_god_name ?? ''),
                  god_description: String(args.p_god_description ?? ''),
                  god_gender: (args.p_god_gender as Player['god_gender']) ?? 'm',
                  domain_key: (args.p_domain_key as Player['domain_key']) ?? null,
                  attr_primary: (args.p_attr_primary as Player['attr_primary']) ?? null,
                  attr_bonus: (args.p_attr_bonus as Player['attr_bonus']) ?? null,
                  god_notes: String(args.p_god_notes ?? ''),
                }
              : p,
          ),
        }))
      }
      return null
    }
    const base = { gameId: G, players, profiles, entities, entityGods, entityLinks: [{ from_entity_id: E(4), to_entity_id: E(1), game_id: G, relation: 'member_species' as const }], log, chaosDraws: [], eraVotes: [{ game_id: G, player_id: P(2), target_era: 2, created_at: '' }], palette: [
      { id: 'pa1', game_id: G, player_id: P(1), column: 'yes' as const, text: 'sterowce', created_at: '' },
      { id: 'pa2', game_id: G, player_id: P(2), column: 'yes' as const, text: 'magia herbaty', created_at: '' },
      { id: 'pa3', game_id: G, player_id: P(3), column: 'veil' as const, text: 'brutalna śmierć', created_at: '' },
      { id: 'pa4', game_id: G, player_id: P(4), column: 'no' as const, text: 'magia bez ceny', created_at: '' },
    ], creationOptions: [] as typeof creationOptions, creationVotes: [] as typeof creationVotes, connected: true, loading: false, error: null }
    switch (screen) {
      case 'chaos': {
        const chosenDraw = params.get('draw') === 'chosen'
        useGameStore.setState({
          ...base,
          game: game({ phase: 'chaos', current_turn_player_id: null }),
          players: players.map((p) => ({ ...p, is_resting: true })),
          log: chosenDraw
            ? [...log, { id: 'l9', game_id: G, round_number: 3, era: 1, player_id: P(1), action_key: 'chaos_answer', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'O co chodzi? O sól i o prawo do brodów na Rzece Białej.', created_at: '2026-01-10T10:09:00' }]
            : log,
          // &cat=people&entry=5 picks another card (e.g. Exodus: a faction leaves)
          chaosDraws: params.get('draw') ? [{ id: 'd1', game_id: G, round_number: 3, era: 1, die1: 5, die2: 2, category_die: chosenDraw ? 2 : null, category_key: chosenDraw ? (params.get('cat') ?? 'event') : null, entry_index: chosenDraw ? Number(params.get('entry') ?? 5) : null, revealed_by: P(1), resolution_notes: '', revealed_at: '2026-01-10T10:05:00', seq: 1 }] : [],
        })
        break
      }
      case 'creation':
        useGameStore.setState({
          ...base,
          game: game({
            status: 'creation',
            host_id: params.get('host') === '0' ? 'u2' : U1,
            settings: { creation_step: Number(params.get('step') ?? 0) },
          }),
          entities: [],
          log: [],
          creationOptions,
          creationVotes,
        })
        break
      case 'rolling':
        useGameStore.setState({
          ...base,
          game: game({ phase: 'rolling', current_turn_player_id: null, round_number: 4 }),
          players: players.map((p, i) => ({ ...p, has_rolled: params.get('rolled') === '1' ? i !== 2 : i % 2 === 1, is_resting: false })),
          log: params.get('rolled') === '1'
            ? [...log, { id: 'l5', game_id: G, round_number: 4, era: 1, player_id: P(1), action_key: 'logos_roll', logos_delta: 12, roll: { d1: 6, d2: 5, total: 12, bonus_streak: 1, bonus_orthodoxy: 0 }, entity_id: null, is_avatar_free_action: false, summary: 'Ta, Która Śpi Pod Rzeką budzi się i śni nowe Słowa. Kości mówią: 6 i 5, skromność dodaje 1. Nowych Słów jest 12.', created_at: '2026-01-11T10:00:00' }]
            : log,
        })
        break
      case 'room':
        useGameStore.setState({
          ...base,
          game: game({ status: 'lobby' }),
          entities: [],
          log: [],
          // &domain=0: the signed-in god has not chosen a domain yet
          players: params.get('domain') === '0' ? players.map((p, i) => (i === 0 ? { ...p, domain_key: null, attr_primary: null, attr_bonus: null, god_notes: '' } : p)) : players,
        })
        break
      case 'palette':
        useGameStore.setState({ ...base, game: game({ status: 'palette' }), entities: [], log: [] })
        break
      default:
        useGameStore.setState({
          ...base,
          game: game(params.get('turn') === 'me' ? { current_turn_player_id: P(1) } : {}),
          players: params.get('turn') === 'me' ? players.map((p, i) => (i === 0 ? { ...p, logos: 40 } : p)) : players,
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
