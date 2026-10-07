// The eleven terrains of the map. Keys match the check constraint in supabase/migrations/0012_hex_map.sql.
import type { BiomeKey } from '@/lib/types'

export interface Biome {
  key: BiomeKey
  name: string
  emoji: string
  /** the field's fill on the map */
  fill: string
  /** no cities, no Exodus, no avatars; creatures may still live there */
  blocked: boolean
}

export const BIOMES: Biome[] = [
  { key: 'woda', name: 'Woda', emoji: '🌊', fill: '#24527f', blocked: true },
  { key: 'gory', name: 'Góry', emoji: '⛰️', fill: '#6f6a66', blocked: true },
  { key: 'puszcza', name: 'Puszcza', emoji: '🌲', fill: '#2a5a34', blocked: false },
  { key: 'dzungla', name: 'Dżungla', emoji: '🌴', fill: '#1f7a45', blocked: false },
  { key: 'trawa', name: 'Trawa', emoji: '🌱', fill: '#6aa84f', blocked: false },
  { key: 'pustynia', name: 'Pustynia', emoji: '🏜️', fill: '#dcbd72', blocked: false },
  { key: 'tundra', name: 'Tundra', emoji: '❄️', fill: '#a9bcb3', blocked: false },
  { key: 'bagno', name: 'Bagno', emoji: '🐸', fill: '#55653c', blocked: false },
  { key: 'sawanna', name: 'Sawanna', emoji: '🦁', fill: '#c1a84e', blocked: false },
  { key: 'wzgorza', name: 'Wzgórza', emoji: '🪨', fill: '#8a9d55', blocked: false },
  { key: 'zima', name: 'Zima', emoji: '⛄', fill: '#e9eef3', blocked: false },
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
  puszcza: 'puszczy',
  dzungla: 'dżungli',
  trawa: 'trawy',
  pustynia: 'pustyni',
  tundra: 'tundry',
  bagno: 'bagna',
  sawanna: 'sawanny',
  wzgorza: 'wzgórz',
  zima: 'zimy',
}

/** accusative with "w": "w wodę", "w góry" */
export const BIOME_ACC: Record<BiomeKey, string> = {
  woda: 'wodę',
  gory: 'góry',
  puszcza: 'puszczę',
  dzungla: 'dżunglę',
  trawa: 'trawę',
  pustynia: 'pustynię',
  tundra: 'tundrę',
  bagno: 'bagno',
  sawanna: 'sawannę',
  wzgorza: 'wzgórza',
  zima: 'zimę',
}

/** locative with its preposition: "w puszczy", "na trawie" */
export const BIOME_LOC: Record<BiomeKey, string> = {
  woda: 'w wodzie',
  gory: 'w górach',
  puszcza: 'w puszczy',
  dzungla: 'w dżungli',
  trawa: 'na trawiastych równinach',
  pustynia: 'na pustyni',
  tundra: 'w tundrze',
  bagno: 'na bagnach',
  sawanna: 'na sawannie',
  wzgorza: 'na wzgórzach',
  zima: 'wśród wiecznych śniegów',
}

/** the kinds of Kataklizm a god may choose; the text is free, the list only helps */
export const CATASTROPHE_TYPES = ['Tsunami', 'Susza', 'Trzęsienie ziemi', 'Wybuch wulkanu', 'Meteor', 'Plaga', 'Pożar', 'Powódź', 'Mróz', 'Szarańcza']
