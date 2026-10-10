// Pointy-top hexes in axial coordinates (q, r), the centre of the map at (0, 0).
// Mirrors hex_distance / hex_in_map in supabase/migrations/0012_hex_map.sql.
import type { BiomeKey, Hex, HexDecor, HexRef } from '@/lib/types'

export const MAP_RADIUS = 5
const SQRT3 = Math.sqrt(3)

export const hexKey = (q: number, r: number) => `${q},${r}`

export function hexDistance(a: HexRef, b: HexRef): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function inMap(q: number, r: number, radius = MAP_RADIUS): boolean {
  return hexDistance({ q, r }, { q: 0, r: 0 }) <= radius
}

const DIRECTIONS: HexRef[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

export function neighbours(h: HexRef): HexRef[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r })).filter((n) => inMap(n.q, n.r))
}

/** every field of the map, centre first, ring by ring */
export function allHexes(radius = MAP_RADIUS): HexRef[] {
  const out: HexRef[] = []
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (inMap(q, r, radius)) out.push({ q, r })
  return out.sort((a, b) => hexDistance(a, { q: 0, r: 0 }) - hexDistance(b, { q: 0, r: 0 }) || a.q - b.q || a.r - b.r)
}

/** the centre of a field in pixels for a hex of radius R (pointy top) */
export function axialToPixel(q: number, r: number, R: number): { x: number; y: number } {
  return { x: R * (SQRT3 * q + (SQRT3 / 2) * r), y: R * 1.5 * r }
}

/** the six corners of a pointy-top hex around (cx, cy), as an SVG points string */
export function hexCorners(cx: number, cy: number, R: number, inset = 0): string {
  const rr = R - inset
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + rr * Math.cos(angle)).toFixed(2)},${(cy + rr * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** the role slots of a field, in units of R: herd top-left, beast or tribe bottom, avatars in the lower corners */
export const SLOT_OFFSETS: { x: number; y: number }[] = [
  { x: -0.5, y: -0.42 },
  { x: 0, y: 0.62 },
  { x: -0.58, y: 0.4 },
  { x: 0.58, y: 0.4 },
]
/** the resource sits top-right, the fertility number above the centre */
export const RESOURCE_OFFSET = { x: 0.5, y: -0.42 }
export const FERTILITY_OFFSET = { x: 0, y: -0.8 }

export const isNeighbour = (a: HexRef, b: HexRef) => hexDistance(a, b) === 1

/** the middle of the edge between two neighbouring fields (where a river meets the sea) */
export function hexEdgeMidpoint(a: HexRef, b: HexRef, R: number): { x: number; y: number } {
  const pa = axialToPixel(a.q, a.r, R)
  const pb = axialToPixel(b.q, b.r, R)
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
}

/** the drawing box that holds the whole map with a small margin */
export function mapViewBox(R: number, radius = MAP_RADIUS): { x: number; y: number; w: number; h: number } {
  const w = SQRT3 * R * (2 * radius + 1)
  const h = R * (3 * radius + 2)
  const margin = R * 0.6
  return { x: -w / 2 - margin, y: -h / 2 - margin, w: w + 2 * margin, h: h + 2 * margin }
}

// ---------- a map for the dev preview, the same way the server draws one ----------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function landBiome(x: number): BiomeKey {
  if (x < 0.3) return 'trawa'
  if (x < 0.48) return 'puszcza'
  if (x < 0.58) return 'gory'
  if (x < 0.64) return 'gory_sniezne'
  if (x < 0.7) return 'gory_pustynne'
  if (x < 0.8) return 'dzungla'
  if (x < 0.88) return 'pustynia'
  if (x < 0.93) return 'bagno'
  if (x < 0.97) return 'ziemia'
  return 'zima'
}

/** the tiles paint their own forests and peaks: no decorations */
export function decorFor(_biome: BiomeKey, _rnd: () => number): HexDecor[] {
  return []
}

export function generatePreviewMap(gameId: string, seed = 7): Hex[] {
  const rnd = mulberry32(seed)
  return allHexes().map(({ q, r }) => {
    const d = hexDistance({ q, r }, { q: 0, r: 0 })
    const biome: BiomeKey = d >= 4 && rnd() < 0.8 ? 'woda' : landBiome(rnd())
    return { game_id: gameId, q, r, biome, decor: decorFor(biome, rnd), resource: null }
  })
}
