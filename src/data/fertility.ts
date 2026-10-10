// Żyzność: how much a field feeds. Mirrors fertility_base / hex_fertility in
// supabase/migrations/0020_fertility_rivers_resources.sql. Resources and beast tempers live here too.
import type { BiomeKey } from '@/lib/types'

/** the land's own fertility; water has none */
export const FERTILITY_BASE: Record<BiomeKey, number | null> = {
  woda: null,
  gory: 1,
  gory_pustynne: 0,
  gory_sniezne: 0,
  puszcza: 2,
  dzungla: 1,
  trawa: 2,
  pustynia: 0,
  zima: 0,
  bagno: 1,
  ziemia: 0,
}

export const isMountain = (b: BiomeKey | undefined | null) => b === 'gory' || b === 'gory_pustynne' || b === 'gory_sniezne'

/** the one resource a god may bless a field with */
export const RESOURCES = ['💎', '🌾', '🪵', '⚙️', '🍇', '🍋', '🌽', '🏺', '🪙', '🪨', '🥔'] as const

export const RESOURCE_NAMES: Record<string, string> = {
  '💎': 'klejnoty',
  '🌾': 'zboże',
  '🪵': 'drewno',
  '⚙️': 'żelazo',
  '🍇': 'winorośl',
  '🍋': 'owoce',
  '🌽': 'kukurydza',
  '🏺': 'glina',
  '🪙': 'złoto',
  '🪨': 'kamień',
  '🥔': 'bulwy',
}

/** the resource in the accusative, for the book ("zrodziła ona zboże") */
export const RESOURCE_ACC: Record<string, string> = {
  '💎': 'klejnoty',
  '🌾': 'zboże',
  '🪵': 'drewno',
  '⚙️': 'żelazo',
  '🍇': 'winorośl',
  '🍋': 'słodkie owoce',
  '🌽': 'kukurydzę',
  '🏺': 'glinę',
  '🪙': 'złoto',
  '🪨': 'kamień',
  '🥔': 'bulwy',
}

export const resourceName = (r: string | null | undefined) => (r ? RESOURCE_NAMES[r] ?? 'surowiec' : '')

/** a beast's temper by its strength */
export const STRENGTH_TIERS: { strength: number; name: string; plural: string }[] = [
  { strength: -1, name: 'potulna', plural: 'potulne' },
  { strength: 0, name: 'dzika', plural: 'dzikie' },
  { strength: 1, name: 'niebezpieczna', plural: 'niebezpieczne' },
  { strength: 2, name: 'krwiożercza', plural: 'krwiożercze' },
  { strength: 3, name: 'niszczycielska', plural: 'niszczycielskie' },
]

/** 2k6 + Gniew → -1..+3 */
export function strengthFromTotal(total: number): number {
  if (total <= 6) return -1
  if (total <= 8) return 0
  if (total <= 10) return 1
  if (total <= 12) return 2
  return 3
}

export function temperOf(strength: number | null | undefined): string {
  const s = Math.max(-1, Math.min(3, strength ?? 0))
  return STRENGTH_TIERS.find((t) => t.strength === s)?.plural ?? 'dzikie'
}

export const strengthLabel = (strength: number) => (strength > 0 ? `+${strength}` : String(strength))
