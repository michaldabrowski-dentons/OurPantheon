// Dev-only preview of the game screens with fake data (no Supabase needed).
//   /preview?screen=game|chaos|rolling|lobby|room|palette|login
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '@/features/auth/AuthGate'
import { useGameStore } from '@/store/useGameStore'
import type { Entity, Game, Player } from '@/lib/types'
import { GamePage } from '@/features/game/GamePage'
import { LobbyPage } from '@/features/lobby/LobbyPage'
import { RoomWaiting } from '@/features/lobby/RoomWaiting'
import { PalettePage } from '@/features/palette/PalettePage'
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
  avatar_key: `fresco-0${n}`,
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
  player(1, { god_name: 'Ta, Która Śpi Pod Rzeką', logos: 11, low_logos_streak: 1 }),
  player(2, { god_name: 'Ten, Który Liczy', logos: 17 }),
  player(3, { god_name: 'Bezimienny Wiatr', logos: 4, is_resting: true }),
  player(4, { god_name: 'Matka Soli', logos: 9 }),
]

const entities = [
  entity(1, { name: 'Manule stoickie', traits: ['Rozumne', 'Łagodne', 'Długowieczne'], image_key: 'fresco-11' }),
  entity(2, { name: 'Rzeczne węże', traits: ['Jadowite', 'Wędrowne'], image_key: 'fresco-03' }),
  entity(3, { name: 'Kałamarnice, co chodzą', traits: ['Umysł roju', 'Płynne', 'Nocne'], image_key: 'fresco-06' }),
  entity(4, { kind: 'civilization', name: 'Stoicy Znad Rzeki', traits: ['Zachowawcza', 'Współpracująca'], specialties: ['Rolnictwo', 'Wiara/Religia'], flaws: ['Magia'], image_key: 'fresco-05', description: 'Spokojny lud manuli, który liczy pory roku po barwie wody.' }),
  entity(5, { kind: 'faction', name: 'Rada Brodów', faction_type: 'Organ rządzący', parent_civilization_id: E(4), traits: ['Biurokratyczna', 'Pokojowa'], desires: ['Kontrola'] }),
  entity(6, { kind: 'orthodoxy', name: 'Cisi Strażnicy Nurtu', faction_type: 'Sekta/Kult', parent_civilization_id: E(4), traits: ['Obowiązkowa', 'Skryta'], desires: ['Ochrona'], requirements: ['Bronić', 'Wstrzymywać się'] }),
  entity(7, { kind: 'avatar', name: 'Posąg z Białego Kamienia', conditions: ['Są nieożywionym przedmiotem, jak posąg, klejnot, góra.'], image_key: 'fresco-07', created_by_player_id: P(2) }),
  entity(8, { kind: 'avatar', name: 'Sowa o Stu Imionach', conditions: ['Nie wiedzą, że są Awatarem.'], image_key: 'fresco-11', status: 'dead', created_by_player_id: P(1) }),
]

const entityGods = [
  { entity_id: E(6), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(2), game_id: G, role: 'creator' as const },
  { entity_id: E(7), player_id: P(4), game_id: G, role: 'co_creator' as const },
  { entity_id: E(8), player_id: P(1), game_id: G, role: 'creator' as const },
  { entity_id: E(4), player_id: P(1), game_id: G, role: 'creator' as const },
]

const log = [
  { id: 'l1', game_id: G, round_number: 3, era: 1, player_id: P(1), action_key: 'logos_roll', logos_delta: 8, roll: { d1: 3, d2: 4, total: 8 }, entity_id: null, is_avatar_free_action: false, summary: 'Rzut Logos: 3 + 4 + 1 (skromność) = 8', created_at: '2026-01-10T10:00:00' },
  { id: 'l2', game_id: G, round_number: 3, era: 1, player_id: P(2), action_key: 'shape_land', logos_delta: -2, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Góry Zębate wyrastają na północy, powoli, przez tysiąclecia.', created_at: '2026-01-10T10:01:00' },
  { id: 'l3', game_id: G, round_number: 3, era: 1, player_id: P(2), action_key: 'dice', logos_delta: 0, roll: { d1: 5, d2: 6, total: 11, tier: 'strong' as const }, entity_id: null, is_avatar_free_action: false, summary: 'Stworzenie frakcji: rzut 2k6', created_at: '2026-01-10T10:02:00' },
  { id: 'l4', game_id: G, round_number: 3, era: 1, player_id: P(3), action_key: 'rest', logos_delta: 0, roll: null, entity_id: null, is_avatar_free_action: false, summary: 'Bezimienny Wiatr zapada w sen.', created_at: '2026-01-10T10:03:00' },
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
    const base = { gameId: G, players, profiles, entities, entityGods, entityLinks: [{ from_entity_id: E(4), to_entity_id: E(1), game_id: G, relation: 'member_species' as const }], log, chaosDraws: [], eraVotes: [{ game_id: G, player_id: P(2), target_era: 2, created_at: '' }], palette: [
      { id: 'pa1', game_id: G, player_id: P(1), column: 'yes' as const, text: 'sterowce', created_at: '' },
      { id: 'pa2', game_id: G, player_id: P(2), column: 'yes' as const, text: 'magia herbaty', created_at: '' },
      { id: 'pa3', game_id: G, player_id: P(3), column: 'veil' as const, text: 'brutalna śmierć', created_at: '' },
      { id: 'pa4', game_id: G, player_id: P(4), column: 'no' as const, text: 'magia bez ceny', created_at: '' },
    ], connected: true, loading: false, error: null }
    switch (screen) {
      case 'chaos':
        useGameStore.setState({ ...base, game: game({ phase: 'chaos', current_turn_player_id: null }), players: players.map((p) => ({ ...p, is_resting: true })), chaosDraws: params.get('draw') ? [{ id: 'd1', game_id: G, round_number: 3, era: 1, die1: 5, die2: 2, category_die: params.get('draw') === 'chosen' ? 2 : null, category_key: params.get('draw') === 'chosen' ? 'event' : null, entry_index: params.get('draw') === 'chosen' ? 5 : null, revealed_by: P(1), resolution_notes: '', revealed_at: '' }] : [] })
        break
      case 'rolling':
        useGameStore.setState({ ...base, game: game({ phase: 'rolling', current_turn_player_id: null, round_number: 4 }), players: players.map((p, i) => ({ ...p, has_rolled: i % 2 === 1, is_resting: false })) })
        break
      case 'room':
        useGameStore.setState({ ...base, game: game({ status: 'lobby' }), entities: [], log: [] })
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
      {(screen === 'game' || screen === 'chaos' || screen === 'rolling') && <GamePage />}
    </AuthContext.Provider>
  )
}
