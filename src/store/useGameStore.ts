import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type {
  ActionLog, ChaosDraw, CreationOption, CreationVote, Entity, EntityGod, EntityLink, EraVote, Game, PaletteEntry, Player, Profile,
} from '@/lib/types'

export type RealtimeTable =
  | 'games' | 'players' | 'palette_entries' | 'entities' | 'entity_gods' | 'entity_links'
  | 'actions_log' | 'chaos_draws' | 'era_votes' | 'logos_rolls' | 'creation_options' | 'creation_votes'

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

export const useGameStore = create<GameState>((set, get) => ({
  ...empty,

  async load(gameId) {
    set({ loading: true, error: null, gameId })
    const [game, players, palette, entities, gods, links, log, chaos, votes, cOptions, cVotes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('players').select('*').eq('game_id', gameId).order('seat_order'),
      supabase.from('palette_entries').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('entities').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('entity_gods').select('*').eq('game_id', gameId),
      supabase.from('entity_links').select('*').eq('game_id', gameId),
      supabase.from('actions_log').select('*').eq('game_id', gameId).order('created_at').limit(500),
      supabase.from('chaos_draws').select('*').eq('game_id', gameId).order('round_number'),
      supabase.from('era_votes').select('*').eq('game_id', gameId),
      supabase.from('creation_options').select('*').eq('game_id', gameId).order('created_at'),
      supabase.from('creation_votes').select('*').eq('game_id', gameId),
    ])
    const firstError = [game, players, palette, entities, gods, links, log, chaos, votes, cOptions, cVotes].find((r) => r.error)?.error
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
