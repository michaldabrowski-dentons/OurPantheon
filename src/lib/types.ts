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
  /** the god that still owes the book a verse; the turn and the Chaos wait for it */
  verse_pending_by: string | null
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
  /** the god's own shade on the map (one of three of its domain); null = the domain's first */
  god_color: string | null
  seat_order: number
  logos: number
  has_rolled: boolean
  is_resting: boolean
  low_logos_streak: number
  avatar_action_used: boolean
  /** the souls of its fallen followers, each as the sign of their people */
  afterlife: string[]
  /** the god's own words about its afterlife; empty means the domain's default */
  afterlife_description: string
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
  /** avatars: the life it returns to (grows by one with every incarnation) */
  max_hp: number | null
  /** creatures: a herd (herbivore) or a beast (carnivore); null for old rows, sapients and avatars */
  diet: 'herbivore' | 'carnivore' | null
  /** beasts: -1 potulne .. +3 niszczycielskie, rolled on 2k6 + Gniew when created */
  strength: number
  created_at: string
  updated_at: string
}

/** terrain of one field of the map (keys without diacritics; names in src/data/biomes.ts) */
export type BiomeKey = 'woda' | 'gory' | 'gory_pustynne' | 'gory_sniezne' | 'puszcza' | 'dzungla' | 'trawa' | 'pustynia' | 'zima' | 'bagno' | 'ziemia'

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
  /** the one resource a god blessed this land with (an emoji from RESOURCES), top-right corner */
  resource: string | null
  /** the rank of that resource (-1 przeklęte złoże .. +3 boski surowiec), rolled on 2k6 + Łaska */
  resource_bonus: number
  /** nights of Susza left: the land is barren (Żyzność 0) and the herd grazing there dies every night */
  drought_rounds: number
  /** nights of Plaga left: two of the city's people (or a herd or a beast) die every night */
  plague_rounds: number
}

/** a river: its channel from the mountain source through land fields, and how it ends */
export interface River {
  id: string
  game_id: string
  /** the source first; land fields only (the water mouth is not part of it) */
  path: HexRef[]
  /** water: ends at the edge of mouth_q/r; river: the last node is shared with another river; none: cut, open */
  mouth_kind: 'water' | 'river' | 'none'
  mouth_q: number | null
  mouth_r: number | null
  into_river_id: string | null
  /** the god who may lead an open river on right now (a mountain cut it in their word) */
  reroute_by: string | null
  created_round: number
  created_by_player_id: string | null
  created_at: string
}

/** a creature, sapient species or avatar standing in one of the role slots of a field */
export interface HexOccupant {
  id: string
  game_id: string
  q: number
  r: number
  /** 0 herd (top-left), 1 beast or tribe (bottom), 2 avatar (bottom-left), 3 avatar (bottom-right) */
  slot: 0 | 1 | 2 | 3
  entity_id: string
  created_at: string
}

/** what a thing on the map is */
export type OccupantRole = 'herbivore' | 'beast' | 'tribe' | 'avatar'

/** a civilization's place on the map: one city per field */
export interface City {
  entity_id: string
  game_id: string
  q: number
  r: number
  /** groups of people without a god (grey in the pyramid); they count as population, never as believers */
  atheists: number
}

/** one unit of the night of Chaos: a thing on the map or a city */
export interface NightUnit {
  t: 'herbivore' | 'beast' | 'tribe' | 'city'
  id: string
}

/** a side of a night fight as the window shows it */
export interface NightSide {
  label: string
  emoji: string | null
  entity_id: string | null
  occupant_id?: string | null
  clone_of?: string | null
  city_id?: string | null
  avatar_id?: string | null
  player_id: string | null
  mod: number
  roll: { d1: number; d2: number; total: number; by?: string } | null
}

export type NightScene = 'creature' | 'beast_city' | 'beast_avatar' | 'exodus_beast' | 'exodus_city'

export interface NightFight {
  kind: 'fight'
  since: string
  scene: NightScene
  log_id: string | null
  left: NightSide
  right: NightSide
  at: HexRef
  origin: HexRef
  groups?: { player_id: string | null; n: number }[]
  source_city_id?: string | null
  species_id?: string | null
  namer_id?: string | null
}

export interface NightNaming {
  kind: 'naming'
  since: string
  city_id: string
  namer_id: string | null
  log_id: string | null
  placeholder: string
  q: number
  r: number
}

/** the dice fell: both gods of the fight read the verdict before the night goes on */
export interface NightVerdict {
  kind: 'verdict'
  since: string
  log_id: string
  players: string[]
  acks: string[]
  /** a city founded by the fight waits for its name behind the verdict */
  next: NightNaming | null
}

/** a 12: the god of the species names the new kind before it appears */
export interface NightMutation {
  kind: 'mutation'
  since: string
  parent_id: string
  parent_name: string
  parent_emoji: string | null
  role: 'herbivore' | 'beast' | 'tribe'
  at: HexRef
  namer_id: string | null
  log_id: string | null
  placeholder: string
  then_hunt: boolean
}

export type NightPending = NightFight | NightNaming | NightVerdict | NightMutation

/** the night of Chaos as the server plays it, one unit at a time */
export interface ChaosNight {
  game_id: string
  round_number: number
  status: 'running' | 'fight' | 'verdict' | 'naming' | 'mutation' | 'done'
  queue: NightUnit[]
  cursor: number
  pending: NightPending | null
  started_by: string | null
  updated_at: string
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

/** a word of an avatar about what is to come; its hold (+1..+3) adds to one roll, once */
export interface Prophecy {
  id: string
  game_id: string
  player_id: string
  avatar_id: string | null
  text: string
  hold: number
  status: 'active' | 'fulfilled'
  created_round: number
  fulfilled_round: number | null
  created_at: string
}

export type ContestKind = 'convert' | 'holy_war' | 'avatar_duel'
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
  target_city_id: string | null
  source_city_id: string | null
  attacker_avatar_id: string | null
  defender_avatar_id: string | null
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
  /** a single die (the night of Chaos) */
  kind?: 'd6'
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
  /** create_creature: a herd or a beast */
  diet?: 'herbivore' | 'carnivore'
}

export interface HexRef {
  q: number
  r: number
}

/** Payload of perform_action; which keys matter depends on the action (see 0012_hex_map.sql) */
export interface ActionPayload {
  summary?: string
  entity?: EntityPayload
  /** shape_land */
  biome?: BiomeKey
  hexes?: HexRef[]
  /** the field (creation, cataclysms, resurrection) */
  q?: number
  r?: number
  slot?: number
  /** creatures, sapients, avatars, a changed kind */
  emoji?: string
  /** change_creature, multiply, lightning: the thing standing on the map */
  occupant_id?: string
  /** migrate */
  entity_id?: string
  from?: HexRef
  /** migrate, exodus, pilgrimage, multiply: where it goes */
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
  /** pilgrimage, prophecy; the avatar that speaks a word of the avatar (develop, exodus) */
  avatar_id?: string
  /** prophecy: what is foretold */
  text?: string
  /** a prophecy spent on this roll */
  prophecy_id?: string
  /** bless_land */
  resource?: string
  /** pour_river: the channel from the source, and the water it ends in (null when it joins a river) */
  path?: HexRef[]
  mouth?: HexRef | null
}
