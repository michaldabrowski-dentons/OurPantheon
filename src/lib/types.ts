// Row types mirroring supabase/migrations/0001_schema.sql

export type GameStatus = 'lobby' | 'palette' | 'creation' | 'playing' | 'finished'
export type GamePhase = 'rolling' | 'gods' | 'chaos'
export type PaletteColumn = 'yes' | 'veil' | 'no'
export type EntityKind = 'creature' | 'civilization' | 'faction' | 'orthodoxy' | 'avatar'
export type EntityStatus = 'active' | 'dead' | 'destroyed'
export type GodRole = 'creator' | 'co_creator'
export type LinkRelation = 'member_species' | 'variant_of' | 'linked'
/** grammatical gender of a god's name: m bóg (stworzył), f bogini (stworzyła), n bóstwo (stworzyło) */
export type GodGender = 'm' | 'f' | 'n'
/** playbook keys (data in src/data/pantheon.ts; mirrored here so the row types import no data) */
export type DomainKey = 'war' | 'vengeance' | 'rule' | 'love' | 'order' | 'light' | 'secrets' | 'nature' | 'forge' | 'knowledge' | 'storm' | 'harvest'
export type AttrKey = 'wrath' | 'majesty' | 'grace' | 'whisper' | 'element' | 'wisdom'

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
  god_description: string
  god_gender: GodGender
  /** unused since the playbooks: the portrait is the domain's painting */
  avatar_key: string
  domain_key: DomainKey | null
  attr_primary: AttrKey | null
  attr_bonus: AttrKey | null
  god_notes: string
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
  /** the sign the creature, sapient or avatar wears on the map; unique in the game */
  emoji: string | null
  /** avatars only: life left, 3 when sent */
  hp: number | null
  created_at: string
  updated_at: string
}

/** terrain of one field of the map (keys without diacritics; names in src/data/biomes.ts) */
export type BiomeKey = 'woda' | 'gory' | 'puszcza' | 'dzungla' | 'trawa' | 'pustynia' | 'zima'

/** a decorative emoji on a field, placed in units of the hex radius from its centre */
export interface HexDecor {
  e: string
  x: number
  y: number
}

export interface Hex {
  game_id: string
  q: number
  r: number
  biome: BiomeKey
  decor: HexDecor[]
}

/** a creature, sapient species or avatar standing in one of the three corner slots of a field */
export interface HexOccupant {
  id: string
  game_id: string
  q: number
  r: number
  /** 0 top-left, 1 top-right, 2 bottom */
  slot: 0 | 1 | 2
  entity_id: string
  created_at: string
}

/** a civilization's place on the map: one city per field */
export interface City {
  entity_id: string
  game_id: string
  q: number
  r: number
}

/** a god's followers in a city: the dots of the pyramid */
export interface CityFollower {
  game_id: string
  city_id: string
  player_id: string
  dots: number
}

/** what a god gave a city through Rozwój Cywilizacji */
export interface CityGift {
  id: string
  game_id: string
  city_id: string
  player_id: string | null
  text: string
  accepted: boolean
  dots_gained: number
  round_number: number
  created_at: string
}

export type ContestKind = 'convert' | 'holy_war'
export type ContestStatus = 'pending' | 'resolved' | 'committed' | 'cancelled'

/** Nawracanie or Święta Wojna waiting for (or settled by) the defender's roll */
export interface Contest {
  id: string
  game_id: string
  round_number: number
  era: number
  kind: ContestKind
  attacker_id: string
  defender_id: string
  target_city_id: string
  source_city_id: string | null
  army: number | null
  cost: number
  attacker_attr: AttrKey
  attacker_d1: number
  attacker_d2: number
  attacker_mod: number
  attacker_total: number
  defender_attr: AttrKey | null
  defender_d1: number | null
  defender_d2: number | null
  defender_mod: number | null
  defender_total: number | null
  status: ContestStatus
  outcome: Record<string, unknown> | null
  log_id: string | null
  created_at: string
  resolved_at: string | null
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

/** one side of a contest, as stored in the roll of its book row */
export interface SideRoll {
  d1: number
  d2: number
  modifier: number
  total: number
  attr: AttrKey
}

export interface DiceRoll {
  d1: number
  d2: number
  total?: number
  tier?: 'strong' | 'mixed' | 'weak'
  /** added to the two dice (the avatar's -2, extra Words) */
  modifier?: number
  /** the attribute behind the modifier (contests) */
  attr?: AttrKey
  /** contests: both sides */
  att?: SideRoll
  def?: SideRoll
  bonus_streak?: number
  bonus_orthodoxy?: number
  category?: string
  entry?: number
  /** which chaos card of the round (chaos_reveal rows) */
  seq?: number
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
  /** what the action did to the map (perform_action, contests, end of Chaos); the verse is composed from it */
  outcome: Record<string, unknown> | Record<string, unknown>[] | null
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
  /** which card of the round this is; the highest is the live one */
  seq: number
}

export interface EraVote {
  game_id: string
  player_id: string
  target_era: number
  created_at: string
}

/** A custom answer written by a player during World Creation */
export interface CreationOption {
  id: string
  game_id: string
  question_key: string
  label: string
  created_by: string | null
  created_at: string
}

/** One vote per god per question; option_key is a preset letter or a CreationOption id */
export interface CreationVote {
  game_id: string
  question_key: string
  player_id: string
  option_key: string
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

export interface HexRef {
  q: number
  r: number
}

/** Payload of perform_action; which keys matter depends on the action (see 0012_hex_map.sql) */
export interface ActionPayload {
  summary?: string
  use_avatar_action?: boolean
  entity?: EntityPayload
  /** shape_land */
  biome?: BiomeKey
  hexes?: HexRef[]
  /** catastrophe */
  type?: string
  /** the field (creation, catastrophe, resurrection) */
  q?: number
  r?: number
  slot?: number
  /** creatures, sapients, avatars, variants */
  emoji?: string
  /** change_creature */
  occupant_id?: string
  /** migrate */
  entity_id?: string
  from?: HexRef
  to?: HexRef
  /** create_civilization, exodus */
  species_id?: string
  /** develop_civilization, exodus */
  city_id?: string
  attr?: AttrKey
  gift?: string
  dots?: number
  name?: string
  description?: string
  /** command_avatar */
  avatar_id?: string
}
