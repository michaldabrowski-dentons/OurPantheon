// The eleven terrains of the map, each a painted hexagonal tile in public/biomes (copies of
// src/img/biomy: 128 px high, the hexagon 112 px wide). Keys match the check constraint in
// 0016_colors_and_tiles.sql. The tile doubles as the terrain's icon wherever the UI names it.
import type { BiomeKey } from '@/lib/types'

export interface Biome {
  key: BiomeKey
  name: string
  /** the tile, and the icon */
  image: string
  /** a flat colour for legends and fallbacks */
  fill: string
  /** no cities, no Exodus, no creatures, no avatars */
  blocked: boolean
}

export const BIOMES: Biome[] = [
  { key: 'woda', name: 'Woda', image: '/biomes/ocean.png', fill: '#24527f', blocked: true },
  { key: 'gory', name: 'Góry', image: '/biomes/mountains_grass.png', fill: '#6f6a66', blocked: true },
  { key: 'gory_pustynne', name: 'Góry pustynne', image: '/biomes/mountains_desert.png', fill: '#9c8a6a', blocked: true },
  { key: 'gory_sniezne', name: 'Góry śnieżne', image: '/biomes/mountains_snow.png', fill: '#b8c2cc', blocked: true },
  { key: 'puszcza', name: 'Puszcza', image: '/biomes/grass_forest.png', fill: '#2a5a34', blocked: false },
  { key: 'dzungla', name: 'Dżungla', image: '/biomes/jungle.png', fill: '#1f7a45', blocked: false },
  { key: 'trawa', name: 'Trawa', image: '/biomes/grass.png', fill: '#6aa84f', blocked: false },
  { key: 'pustynia', name: 'Pustynia', image: '/biomes/desert.png', fill: '#dcbd72', blocked: false },
  { key: 'zima', name: 'Zima', image: '/biomes/snow.png', fill: '#e9eef3', blocked: false },
  { key: 'bagno', name: 'Bagno', image: '/biomes/swamp.png', fill: '#55653c', blocked: false },
  { key: 'ziemia', name: 'Ugór', image: '/biomes/dirt.png', fill: '#8a6a4a', blocked: false },
]

export const BIOME_BY_KEY = Object.fromEntries(BIOMES.map((b) => [b.key, b])) as Record<BiomeKey, Biome>

/** the biomes a god may paint with Kształtowanie Lądów (all of them) */
export const BIOME_KEYS: BiomeKey[] = BIOMES.map((b) => b.key)

export function biomeName(key: BiomeKey | string | undefined | null): string {
  return (key && BIOME_BY_KEY[key as BiomeKey]?.name) || 'nieznany teren'
}

/** genitive for verses: "z trawy", "z puszczy" */
export const BIOME_GEN: Record<BiomeKey, string> = {
  woda: 'wody',
  gory: 'gór',
  gory_pustynne: 'gór pustynnych',
  gory_sniezne: 'gór śnieżnych',
  puszcza: 'puszczy',
  dzungla: 'dżungli',
  trawa: 'trawy',
  pustynia: 'pustyni',
  zima: 'zimy',
  bagno: 'bagna',
  ziemia: 'ugoru',
}

/** accusative with "w": "w wodę", "w góry" */
export const BIOME_ACC: Record<BiomeKey, string> = {
  woda: 'wodę',
  gory: 'góry',
  gory_pustynne: 'góry pustynne',
  gory_sniezne: 'góry śnieżne',
  puszcza: 'puszczę',
  dzungla: 'dżunglę',
  trawa: 'trawę',
  pustynia: 'pustynię',
  zima: 'zimę',
  bagno: 'bagno',
  ziemia: 'ugór',
}

/** locative with its preposition: "w puszczy", "na trawie" */
export const BIOME_LOC: Record<BiomeKey, string> = {
  woda: 'w wodzie',
  gory: 'w górach',
  gory_pustynne: 'w górach pustynnych',
  gory_sniezne: 'w górach śnieżnych',
  puszcza: 'w puszczy',
  dzungla: 'w dżungli',
  trawa: 'na trawiastych równinach',
  pustynia: 'na pustyni',
  zima: 'wśród wiecznych śniegów',
  bagno: 'na bagnach',
  ziemia: 'na ugorach',
}
