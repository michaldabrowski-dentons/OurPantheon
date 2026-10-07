// A read-only view of the map and the cities, built from the store's rows. Everything the map, the
// action dialog and the requirements of actions ask about the world goes through it.
import type { City, CityFollower, CityGift, Entity, Hex, HexOccupant, HexRef, Player } from '@/lib/types'
import { hexKey, inMap } from '@/lib/hex'
import { BIOME_BY_KEY } from '@/data/biomes'
import { SAPIENT_TRAITS } from '@/data/traits'

export interface WorldView {
  hexes: Hex[]
  entities: Entity[]
  hexAt: (q: number, r: number) => Hex | undefined
  blocked: (q: number, r: number) => boolean
  occupantsAt: (q: number, r: number) => HexOccupant[]
  occupantsOf: (entityId: string) => HexOccupant[]
  entityById: (id: string | null | undefined) => Entity | undefined
  isSapient: (e: Entity | undefined) => boolean
  freeSlot: (q: number, r: number) => number | null
  cityAt: (q: number, r: number) => City | undefined
  cityOf: (cityId: string) => City | undefined
  cities: City[]
  followersOf: (cityId: string) => CityFollower[]
  dotsOf: (cityId: string, playerId: string) => number
  cityDots: (cityId: string) => number
  /** the god with the most dots; null when nobody or when the top is shared */
  majorityOf: (cityId: string) => string | null
  /** true when the god has strictly more dots than anyone else there */
  holds: (cityId: string, playerId: string) => boolean
  totalDots: (playerId: string) => number
  giftsOf: (cityId: string) => CityGift[]
  usedEmoji: Set<string>
  /** the god's living avatars standing on the map */
  avatarsOf: (playerId: string) => { entity: Entity; occupant: HexOccupant | undefined }[]
}

export function isSapientEntity(e: Entity | undefined): boolean {
  return !!e && e.kind === 'creature' && e.traits.some((t) => SAPIENT_TRAITS.includes(t))
}

export function buildWorld(input: {
  hexes: Hex[]
  occupants: HexOccupant[]
  cities: City[]
  followers: CityFollower[]
  gifts: CityGift[]
  entities: Entity[]
  entityGods: { entity_id: string; player_id: string }[]
}): WorldView {
  const hexMap = new Map<string, Hex>()
  for (const h of input.hexes) hexMap.set(hexKey(h.q, h.r), h)
  const entMap = new Map<string, Entity>()
  for (const e of input.entities) entMap.set(e.id, e)
  const occByHex = new Map<string, HexOccupant[]>()
  const occByEntity = new Map<string, HexOccupant[]>()
  for (const o of input.occupants) {
    if (!entMap.has(o.entity_id)) continue
    const k = hexKey(o.q, o.r)
    occByHex.set(k, [...(occByHex.get(k) ?? []), o])
    occByEntity.set(o.entity_id, [...(occByEntity.get(o.entity_id) ?? []), o])
  }
  for (const list of occByHex.values()) list.sort((a, b) => a.slot - b.slot)
  const cityByHex = new Map<string, City>()
  const cityById = new Map<string, City>()
  for (const c of input.cities) {
    if (!entMap.has(c.entity_id)) continue
    cityByHex.set(hexKey(c.q, c.r), c)
    cityById.set(c.entity_id, c)
  }
  const folByCity = new Map<string, CityFollower[]>()
  for (const f of input.followers) folByCity.set(f.city_id, [...(folByCity.get(f.city_id) ?? []), f])
  for (const list of folByCity.values()) list.sort((a, b) => b.dots - a.dots)
  const giftsByCity = new Map<string, CityGift[]>()
  for (const g of input.gifts) giftsByCity.set(g.city_id, [...(giftsByCity.get(g.city_id) ?? []), g])
  const used = new Set<string>()
  for (const e of input.entities) if (e.emoji) used.add(e.emoji)

  const hexAt = (q: number, r: number) => hexMap.get(hexKey(q, r))
  const occupantsAt = (q: number, r: number) => occByHex.get(hexKey(q, r)) ?? []
  const followersOf = (cityId: string) => folByCity.get(cityId) ?? []
  const cityDots = (cityId: string) => followersOf(cityId).reduce((n, f) => n + f.dots, 0)

  return {
    hexes: input.hexes,
    entities: input.entities,
    hexAt,
    blocked: (q, r) => {
      const h = hexAt(q, r)
      return !h || BIOME_BY_KEY[h.biome]?.blocked === true
    },
    occupantsAt,
    occupantsOf: (entityId) => occByEntity.get(entityId) ?? [],
    entityById: (id) => (id ? entMap.get(id) : undefined),
    isSapient: isSapientEntity,
    freeSlot: (q, r) => {
      if (!inMap(q, r)) return null
      const taken = new Set(occupantsAt(q, r).map((o) => o.slot))
      for (const s of [0, 1, 2]) if (!taken.has(s as 0 | 1 | 2)) return s
      return null
    },
    cityAt: (q, r) => cityByHex.get(hexKey(q, r)),
    cityOf: (cityId) => cityById.get(cityId),
    cities: input.cities.filter((c) => cityById.has(c.entity_id)),
    followersOf,
    dotsOf: (cityId, playerId) => followersOf(cityId).find((f) => f.player_id === playerId)?.dots ?? 0,
    cityDots,
    majorityOf: (cityId) => {
      const list = followersOf(cityId)
      if (list.length === 0) return null
      if (list.length > 1 && list[0].dots === list[1].dots) return null
      return list[0].player_id
    },
    holds: (cityId, playerId) => {
      const list = followersOf(cityId)
      const mine = list.find((f) => f.player_id === playerId)?.dots ?? 0
      return mine > 0 && list.every((f) => f.player_id === playerId || f.dots < mine)
    },
    totalDots: (playerId) => {
      let n = 0
      for (const [cityId, list] of folByCity) if (cityById.has(cityId)) for (const f of list) if (f.player_id === playerId) n += f.dots
      return n
    },
    giftsOf: (cityId) => giftsByCity.get(cityId) ?? [],
    usedEmoji: used,
    avatarsOf: (playerId) =>
      input.entityGods
        .filter((g) => g.player_id === playerId)
        .map((g) => entMap.get(g.entity_id))
        .filter((e): e is Entity => !!e && e.kind === 'avatar' && e.status === 'active')
        .map((entity) => ({ entity, occupant: (occByEntity.get(entity.id) ?? [])[0] })),
  }
}

/** a target on the map chosen by a click: a field, a slot on it, an occupant or a city */
export interface MapPick extends HexRef {
  slot?: number
  occupantId?: string
  cityId?: string
}

/** an empty world for places that render before the map loads */
export const EMPTY_WORLD: WorldView = buildWorld({ hexes: [], occupants: [], cities: [], followers: [], gifts: [], entities: [], entityGods: [] })

export type PlayerRef = Pick<Player, 'id'>
