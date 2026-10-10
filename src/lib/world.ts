// A read-only view of the map and the cities, built from the store's rows. Everything the map, the
// action dialog and the requirements of actions ask about the world goes through it.
import type { City, CityFollower, CityGift, Entity, Hex, HexOccupant, HexRef, OccupantRole, Player, River } from '@/lib/types'
import { hexKey, inMap, neighbours } from '@/lib/hex'
import { BIOME_BY_KEY } from '@/data/biomes'
import { SAPIENT_TRAITS } from '@/data/traits'
import { FERTILITY_BASE } from '@/data/fertility'

export interface WorldView {
  hexes: Hex[]
  entities: Entity[]
  rivers: River[]
  hexAt: (q: number, r: number) => Hex | undefined
  blocked: (q: number, r: number) => boolean
  occupantsAt: (q: number, r: number) => HexOccupant[]
  occupantsOf: (entityId: string) => HexOccupant[]
  entityById: (id: string | null | undefined) => Entity | undefined
  isSapient: (e: Entity | undefined) => boolean
  /** what a thing is on the map: herd, beast, tribe or avatar */
  roleOf: (e: Entity | undefined) => OccupantRole | null
  /** the slot this kind of thing would take on the field, null when there is no room */
  slotFor: (q: number, r: number, role: OccupantRole) => number | null
  /** the herd standing on the field (top-left), if any */
  herdAt: (q: number, r: number) => HexOccupant | undefined
  /** the beast or tribe standing on the field (bottom), if any */
  bottomAt: (q: number, r: number) => HexOccupant | undefined
  avatarsAt: (q: number, r: number) => HexOccupant[]
  /** the first river flowing through the field */
  riverAt: (q: number, r: number) => River | undefined
  /** żyzność of the field; null on water */
  fertilityOf: (q: number, r: number) => number | null
  resourceAt: (q: number, r: number) => string | null
  cityAt: (q: number, r: number) => City | undefined
  cityOf: (cityId: string) => City | undefined
  cities: City[]
  followersOf: (cityId: string) => CityFollower[]
  dotsOf: (cityId: string, playerId: string) => number
  /** the whole population: believers and the godless */
  cityDots: (cityId: string) => number
  /** believers only */
  cityBelievers: (cityId: string) => number
  atheistsOf: (cityId: string) => number
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

export function roleOfEntity(e: Entity | undefined): OccupantRole | null {
  if (!e) return null
  if (e.kind === 'avatar') return 'avatar'
  if (e.kind !== 'creature') return null
  if (isSapientEntity(e)) return 'tribe'
  if (e.diet === 'carnivore') return 'beast'
  return 'herbivore'
}

export function buildWorld(input: {
  hexes: Hex[]
  occupants: HexOccupant[]
  cities: City[]
  followers: CityFollower[]
  gifts: CityGift[]
  entities: Entity[]
  entityGods: { entity_id: string; player_id: string }[]
  rivers?: River[]
}): WorldView {
  const rivers = input.rivers ?? []
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
  const riverByHex = new Map<string, River>()
  for (const rv of rivers) for (const n of rv.path) if (!riverByHex.has(hexKey(n.q, n.r))) riverByHex.set(hexKey(n.q, n.r), rv)

  const hexAt = (q: number, r: number) => hexMap.get(hexKey(q, r))
  const occupantsAt = (q: number, r: number) => occByHex.get(hexKey(q, r)) ?? []
  const followersOf = (cityId: string) => folByCity.get(cityId) ?? []
  const atheistsOf = (cityId: string) => cityById.get(cityId)?.atheists ?? 0
  const cityBelievers = (cityId: string) => followersOf(cityId).reduce((n, f) => n + f.dots, 0)
  const cityDots = (cityId: string) => cityBelievers(cityId) + atheistsOf(cityId)
  const entityById = (id: string | null | undefined) => (id ? entMap.get(id) : undefined)
  const roleOf = (e: Entity | undefined) => roleOfEntity(e)
  const herdAt = (q: number, r: number) => occupantsAt(q, r).find((o) => o.slot === 0)
  const bottomAt = (q: number, r: number) => occupantsAt(q, r).find((o) => o.slot === 1)
  const riverAt = (q: number, r: number) => riverByHex.get(hexKey(q, r))

  return {
    hexes: input.hexes,
    entities: input.entities,
    rivers,
    hexAt,
    blocked: (q, r) => {
      const h = hexAt(q, r)
      return !h || BIOME_BY_KEY[h.biome]?.blocked === true
    },
    occupantsAt,
    occupantsOf: (entityId) => occByEntity.get(entityId) ?? [],
    entityById,
    isSapient: isSapientEntity,
    roleOf,
    slotFor: (q, r, role) => {
      if (!inMap(q, r)) return null
      const taken = new Set(occupantsAt(q, r).map((o) => o.slot))
      if (role === 'herbivore') return taken.has(0) ? null : 0
      if (role === 'beast' || role === 'tribe') return taken.has(1) ? null : 1
      if (!taken.has(2)) return 2
      if (!taken.has(3)) return 3
      return null
    },
    herdAt,
    bottomAt,
    avatarsAt: (q, r) => occupantsAt(q, r).filter((o) => o.slot >= 2),
    riverAt,
    fertilityOf: (q, r) => {
      const h = hexAt(q, r)
      if (!h) return null
      const base = FERTILITY_BASE[h.biome]
      if (base === null || base === undefined) return null
      let f = base
      if (neighbours({ q, r }).some((n) => hexAt(n.q, n.r)?.biome === 'woda')) f += 1
      if (riverAt(q, r)) f += h.biome === 'pustynia' ? 3 : 1
      const herd = herdAt(q, r)
      const herdEnt = herd ? entityById(herd.entity_id) : undefined
      if (herdEnt && roleOf(herdEnt) === 'herbivore') f += herdEnt.strength ?? 1
      if (h.resource) f += h.resource_bonus ?? 1
      return f
    },
    resourceAt: (q, r) => hexAt(q, r)?.resource ?? null,
    cityAt: (q, r) => cityByHex.get(hexKey(q, r)),
    cityOf: (cityId) => cityById.get(cityId),
    cities: input.cities.filter((c) => cityById.has(c.entity_id)),
    followersOf,
    dotsOf: (cityId, playerId) => followersOf(cityId).find((f) => f.player_id === playerId)?.dots ?? 0,
    cityDots,
    cityBelievers,
    atheistsOf,
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
export const EMPTY_WORLD: WorldView = buildWorld({ hexes: [], occupants: [], cities: [], followers: [], gifts: [], entities: [], entityGods: [], rivers: [] })

export type PlayerRef = Pick<Player, 'id'>
