import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type {
  ActionLog, ChaosDraw, ChaosNight, City, CityFollower, CityGift, Contest, CreationOption, CreationVote, Entity, EntityGod, EntityLink, EraVote, Game,
  Hex, HexOccupant, PaletteEntry, Player, Profile, Prophecy, River,
} from '@/lib/types'

export type RealtimeTable =
  | 'games' | 'players' | 'palette_entries' | 'entities' | 'entity_gods' | 'entity_links'
  | 'actions_log' | 'chaos_draws' | 'era_votes' | 'logos_rolls' | 'creation_options' | 'creation_votes'
  | 'hexes' | 'hex_occupants' | 'cities' | 'city_followers' | 'city_gifts' | 'contests' | 'prophecies' | 'rivers' | 'chaos_nights'

interface GameState {
  gameId: string | null
  game: Game | null
  players: Player[]
  profiles: Record<string, Profile>
  palette: PaletteEntry[]
  entities: Entity[]
  entityGods: EntityGod[]
  entityLinks: EntityLink[]
  log: ActionLog[]
  chaosDraws: ChaosDraw[]
  eraVotes: EraVote[]
  creationOptions: CreationOption[]
  creationVotes: CreationVote[]
  hexes: Hex[]
  occupants: HexOccupant[]
  cities: City[]
  followers: CityFollower[]
  gifts: CityGift[]
  contests: Contest[]
  prophecies: Prophecy[]
  rivers: River[]
  /** the night of Chaos being played (or the last one played) */
  night: ChaosNight | null
  loading: boolean
  error: string | null
  connected: boolean

  load: (gameId: string) => Promise<void>
  applyChange: (table: RealtimeTable, type: 'INSERT' | 'UPDATE' | 'DELETE', row: unknown, old: unknown) => void
  setConnected: (v: boolean) => void
  reset: () => void
}

const empty = {
  gameId: null,
  game: null,
  players: [],
  profiles: {},
  palette: [],
  entities: [],
  entityGods: [],
  entityLinks: [],
  log: [],
  chaosDraws: [],
  eraVotes: [],
  creationOptions: [],
  creationVotes: [],
  hexes: [],
  occupants: [],
  cities: [],
  followers: [],
  gifts: [],
  contests: [],
  prophecies: [],
  rivers: [],
  night: null,
  loading: false,
  error: null,
  connected: false,
}

function upsert<T>(list: T[], row: T, same: (a: T, b: T) => boolean): T[] {
  const i = list.findIndex((x) => same(x, row))
  if (i === -1) return [...list, row]
  const next = list.slice()
  next[i] = row
  return next
}

function remove<T>(list: T[], row: T, same: (a: T, b: T) => boolean): T[] {
  return list.filter((x) => !same(x, row))
}

const byId = <T extends { id: string }>(a: T, b: T) => a.id === b.id
const byEntityGod = (a: EntityGod, b: EntityGod) => a.entity_id === b.entity_id && a.player_id === b.player_id
const byLink = (a: EntityLink, b: EntityLink) =>
  a.from_entity_id === b.from_entity_id && a.to_entity_id === b.to_entity_id && a.relation === b.relation
const byVote = (a: EraVote, b: EraVote) => a.game_id === b.game_id && a.player_id === b.player_id
const byCreationVote = (a: CreationVote, b: CreationVote) => a.question_key === b.question_key && a.player_id === b.player_id
const byHex = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r
const byCity = (a: City, b: City) => a.entity_id === b.entity_id
const byFollower = (a: CityFollower, b: CityFollower) => a.city_id === b.city_id && a.player_id === b.player_id

export const useGameStore = create<GameState>((set, get) => ({
  ...empty,

  async load(gameId) {
    set({ loading: true, error: null, gameId })
    const [game, players, palette, entities, gods, links, log, chaos, votes, cOptions, cVotes, hexes, occupants, cities, followers, gifts, contests, prophecies, rivers, nights] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('players').select('*').eq('game_id', gameId).order('seat_order'),
      supabase.from('palette_entries').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('entities').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('entity_gods').select('*').eq('game_id', gameId),
      supabase.from('entity_links').select('*').eq('game_id', gameId),
      supabase.from('actions_log').select('*').eq('game_id', gameId).order('created_at').limit(1500),
      supabase.from('chaos_draws').select('*').eq('game_id', gameId).order('round_number'),
      supabase.from('era_votes').select('*').eq('game_id', gameId),
      supabase.from('creation_options').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('creation_votes').select('*').eq('game_id', gameId),
      supabase.from('hexes').select('*').eq('game_id', gameId),
      supabase.from('hex_occupants').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('cities').select('*').eq('game_id', gameId),
      supabase.from('city_followers').select('*').eq('game_id', gameId),
      supabase.from('city_gifts').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('contests').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('prophecies').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('rivers').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('chaos_nights').select('*').eq('game_id', gameId),
    ])
    const firstError = [game, players, palette, entities, gods, links, log, chaos, votes, cOptions, cVotes, hexes, occupants, cities, followers, gifts, contests, prophecies, rivers, nights].find((r) => r.error)?.error
    if (firstError) {
      set({ loading: false, error: firstError.message })
      return
    }
    const playerRows = (players.data ?? []) as Player[]
    const userIds = playerRows.map((p) => p.user_id)
    const profiles = userIds.length
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] as Profile[] }
    const profileMap: Record<string, Profile> = {}
    for (const p of (profiles.data ?? []) as Profile[]) profileMap[p.id] = p

    set({
      loading: false,
      game: game.data as Game,
      players: playerRows,
      profiles: profileMap,
      palette: (palette.data ?? []) as PaletteEntry[],
      entities: (entities.data ?? []) as Entity[],
      entityGods: (gods.data ?? []) as EntityGod[],
      entityLinks: (links.data ?? []) as EntityLink[],
      log: (log.data ?? []) as ActionLog[],
      chaosDraws: (chaos.data ?? []) as ChaosDraw[],
      eraVotes: (votes.data ?? []) as EraVote[],
      creationOptions: (cOptions.data ?? []) as CreationOption[],
      creationVotes: (cVotes.data ?? []) as CreationVote[],
      hexes: (hexes.data ?? []) as Hex[],
      occupants: (occupants.data ?? []) as HexOccupant[],
      cities: (cities.data ?? []) as City[],
      followers: (followers.data ?? []) as CityFollower[],
      gifts: (gifts.data ?? []) as CityGift[],
      contests: (contests.data ?? []) as Contest[],
      prophecies: (prophecies.data ?? []) as Prophecy[],
      rivers: (rivers.data ?? []) as River[],
      night: ((nights.data ?? []) as ChaosNight[])[0] ?? null,
    })
  },

  applyChange(table, type, row, old) {
    const s = get()
    const isDelete = type === 'DELETE'
    switch (table) {
      case 'games':
        if (!isDelete) set({ game: row as Game })
        break
      case 'players': {
        const r = (isDelete ? old : row) as Player
        const players = isDelete ? remove(s.players, r, byId) : upsert(s.players, r, byId)
        players.sort((a, b) => a.seat_order - b.seat_order)
        set({ players })
        if (!isDelete && !s.profiles[r.user_id]) {
          supabase.from('profiles').select('*').eq('id', r.user_id).single().then(({ data }) => {
            if (data) set((st) => ({ profiles: { ...st.profiles, [data.id]: data as Profile } }))
          })
        }
        break
      }
      case 'palette_entries': {
        const r = (isDelete ? old : row) as PaletteEntry
        set({ palette: isDelete ? remove(s.palette, r, byId) : upsert(s.palette, r, byId) })
        break
      }
      case 'entities': {
        const r = (isDelete ? old : row) as Entity
        set({ entities: isDelete ? remove(s.entities, r, byId) : upsert(s.entities, r, byId) })
        break
      }
      case 'entity_gods': {
        const r = (isDelete ? old : row) as EntityGod
        set({ entityGods: isDelete ? remove(s.entityGods, r, byEntityGod) : upsert(s.entityGods, r, byEntityGod) })
        break
      }
      case 'entity_links': {
        const r = (isDelete ? old : row) as EntityLink
        set({ entityLinks: isDelete ? remove(s.entityLinks, r, byLink) : upsert(s.entityLinks, r, byLink) })
        break
      }
      case 'actions_log': {
        if (isDelete) break
        const r = row as ActionLog
        const log = upsert(s.log, r, byId)
        log.sort((a, b) => a.created_at.localeCompare(b.created_at))
        set({ log })
        break
      }
      case 'chaos_draws': {
        const r = (isDelete ? old : row) as ChaosDraw
        set({ chaosDraws: isDelete ? remove(s.chaosDraws, r, byId) : upsert(s.chaosDraws, r, byId) })
        break
      }
      case 'era_votes': {
        const r = (isDelete ? old : row) as EraVote
        set({ eraVotes: isDelete ? remove(s.eraVotes, r, byVote) : upsert(s.eraVotes, r, byVote) })
        break
      }
      case 'creation_options': {
        const r = (isDelete ? old : row) as CreationOption
        set({ creationOptions: isDelete ? remove(s.creationOptions, r, byId) : upsert(s.creationOptions, r, byId) })
        break
      }
      case 'creation_votes': {
        const r = (isDelete ? old : row) as CreationVote
        set({ creationVotes: isDelete ? remove(s.creationVotes, r, byCreationVote) : upsert(s.creationVotes, r, byCreationVote) })
        break
      }
      case 'hexes': {
        const r = (isDelete ? old : row) as Hex
        set({ hexes: isDelete ? remove(s.hexes, r, byHex) : upsert(s.hexes, r, byHex) })
        break
      }
      case 'hex_occupants': {
        const r = (isDelete ? old : row) as HexOccupant
        set({ occupants: isDelete ? remove(s.occupants, r, byId) : upsert(s.occupants, r, byId) })
        break
      }
      case 'cities': {
        const r = (isDelete ? old : row) as City
        set({ cities: isDelete ? remove(s.cities, r, byCity) : upsert(s.cities, r, byCity) })
        break
      }
      case 'city_followers': {
        const r = (isDelete ? old : row) as CityFollower
        set({ followers: isDelete ? remove(s.followers, r, byFollower) : upsert(s.followers, r, byFollower) })
        break
      }
      case 'city_gifts': {
        const r = (isDelete ? old : row) as CityGift
        set({ gifts: isDelete ? remove(s.gifts, r, byId) : upsert(s.gifts, r, byId) })
        break
      }
      case 'contests': {
        const r = (isDelete ? old : row) as Contest
        const contests = isDelete ? remove(s.contests, r, byId) : upsert(s.contests, r, byId)
        contests.sort((a, b) => a.created_at.localeCompare(b.created_at))
        set({ contests })
        break
      }
      case 'prophecies': {
        const r = (isDelete ? old : row) as Prophecy
        const prophecies = isDelete ? remove(s.prophecies, r, byId) : upsert(s.prophecies, r, byId)
        prophecies.sort((a, b) => a.created_at.localeCompare(b.created_at))
        set({ prophecies })
        break
      }
      case 'rivers': {
        const r = (isDelete ? old : row) as River
        const rivers = isDelete ? remove(s.rivers, r, byId) : upsert(s.rivers, r, byId)
        rivers.sort((a, b) => a.created_at.localeCompare(b.created_at))
        set({ rivers })
        break
      }
      case 'chaos_nights': {
        set({ night: isDelete ? null : (row as ChaosNight) })
        break
      }
      default:
        break
    }
  },

  setConnected(v) {
    set({ connected: v })
  },

  reset() {
    set({ ...empty })
  },
}))

// ---------- selectors ----------
export const selectCurrentTurnPlayer = (s: GameState) =>
  s.players.find((p) => p.id === s.game?.current_turn_player_id) ?? null

export const selectMyPlayer = (userId: string | undefined) => (s: GameState) =>
  s.players.find((p) => p.user_id === userId) ?? null

/** The live Chaos card of this round: the last one dealt. */
export const selectCurrentChaosDraw = (s: GameState) => {
  const inRound = s.chaosDraws.filter((d) => d.round_number === s.game?.round_number)
  if (inRound.length === 0) return null
  return inRound.reduce((m, d) => ((d.seq ?? 1) > (m.seq ?? 1) ? d : m))
}

/** Everything a god made or co-made: entity_gods links plus plain authorship, each entity once. */
export const selectEntitiesOf = (playerId: string) => (s: GameState): { entity: Entity; role: 'creator' | 'co_creator' }[] => {
  const seen = new Set<string>()
  const out: { entity: Entity; role: 'creator' | 'co_creator' }[] = []
  for (const g of s.entityGods) {
    if (g.player_id !== playerId || seen.has(g.entity_id)) continue
    const entity = s.entities.find((e) => e.id === g.entity_id)
    if (!entity) continue
    seen.add(entity.id)
    out.push({ entity, role: g.role })
  }
  for (const entity of s.entities) {
    if (entity.created_by_player_id === playerId && !seen.has(entity.id)) {
      seen.add(entity.id)
      out.push({ entity, role: 'creator' })
    }
  }
  return out
}

/** a god's prophecies, the living ones first */
export const selectPropheciesOf = (playerId: string | undefined) => (s: GameState) => s.prophecies.filter((p) => p.player_id === playerId)

/** the night of this round, while it is being played */
export const selectNight = (s: GameState) => (s.night && s.night.round_number === s.game?.round_number && s.night.status !== 'done' ? s.night : null)

/** the contest still waiting for its defender, if any */
export const selectPendingContest = (s: GameState) => s.contests.find((c) => c.status === 'pending') ?? null

/** The god's name only, never the human behind it (for the Chronicle and scenes). */
export function godLabel(p: Player | null | undefined): string {
  if (!p) return 'Bezimienne bóstwo'
  return p.god_name?.trim() || 'Bezimienne bóstwo'
}

export function playerLabel(p: Player | null | undefined, profiles: Record<string, Profile>): string {
  if (!p) return 'Bezimienne bóstwo'
  const god = p.god_name?.trim()
  const human = profiles[p.user_id]?.display_name?.trim()
  return god || human || 'Bezimienne bóstwo'
}

export function humanLabel(p: Player | null | undefined, profiles: Record<string, Profile>): string {
  if (!p) return ''
  return profiles[p.user_id]?.display_name?.trim() || 'gracz'
}
