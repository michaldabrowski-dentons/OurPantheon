// Row types mirroring supabase/migrations/0001_schema.sql

export type GameStatus = 'lobby' | 'palette' | 'playing' | 'finished'
export type GamePhase = 'rolling' | 'gods' | 'chaos'
export type PaletteColumn = 'yes' | 'veil' | 'no'
export type EntityKind = 'creature' | 'civilization' | 'faction' | 'orthodoxy' | 'avatar'
export type EntityStatus = 'active' | 'dead' | 'destroyed'
export type GodRole = 'creator' | 'co_creator'
export type LinkRelation = 'member_species' | 'variant_of' | 'linked'

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

export interface Game {
  id: string
  code: string
  name: string
  host_id: string
  status: GameStatus
  era: 1 | 2 | 3
  round_number: number
  era_started_round: number
  phase: GamePhase
  current_turn_player_id: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  game_id: string
  user_id: string
  god_name: string
  avatar_key: string
  seat_order: number
  logos: number
  has_rolled: boolean
  is_resting: boolean
  low_logos_streak: number
  avatar_action_used: boolean
  joined_at: string
}

export interface PaletteEntry {
  id: string
  game_id: string
  player_id: string
  column: PaletteColumn
  text: string
  created_at: string
}

export interface LogosRoll {
  id: string
  game_id: string
  round_number: number
  player_id: string
  die1: number
  die2: number
  bonus_streak: number
  bonus_orthodoxy: number
  total: number
  created_at: string
}

export interface Entity {
  id: string
  game_id: string
  kind: EntityKind
  name: string
  description: string
  image_key: string | null
  notes: string
  parent_civilization_id: string | null
  faction_type: string | null
  traits: string[]
  specialties: string[]
  flaws: string[]
  desires: string[]
  requirements: string[]
  conditions: string[]
  status: EntityStatus
  is_chaos: boolean
  created_round: number
  created_era: number
  created_by_player_id: string | null
  attributes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EntityGod {
  entity_id: string
  player_id: string
  game_id: string
  role: GodRole
}

export interface EntityLink {
  from_entity_id: string
  to_entity_id: string
  game_id: string
  relation: LinkRelation
}

export interface DiceRoll {
  d1: number
  d2: number
  total?: number
  tier?: 'strong' | 'mixed' | 'weak'
  bonus_streak?: number
  bonus_orthodoxy?: number
  category?: string
  entry?: number
}

export interface ActionLog {
  id: string
  game_id: string
  round_number: number
  era: number
  player_id: string | null
  action_key: string
  logos_delta: number
  roll: DiceRoll | null
  entity_id: string | null
  is_avatar_free_action: boolean
  summary: string
  created_at: string
}

export interface ChaosDraw {
  id: string
  game_id: string
  round_number: number
  era: number
  die1: number
  die2: number
  category_die: 1 | 2 | null
  category_key: string | null
  entry_index: number | null
  revealed_by: string | null
  resolution_notes: string
  revealed_at: string
}

export interface EraVote {
  game_id: string
  player_id: string
  target_era: number
  created_at: string
}

/** Payload accepted by perform_action's `entity` field */
export interface EntityPayload {
  op: 'create' | 'update'
  id?: string
  kind?: EntityKind
  name?: string
  description?: string
  image_key?: string
  faction_type?: string
  parent_civilization_id?: string | null
  traits?: string[]
  specialties?: string[]
  flaws?: string[]
  desires?: string[]
  requirements?: string[]
  conditions?: string[]
  status?: EntityStatus
  is_chaos?: boolean
  co_god_ids?: string[]
  species_ids?: string[]
}

export interface ActionPayload {
  summary?: string
  use_avatar_action?: boolean
  entity?: EntityPayload
}
