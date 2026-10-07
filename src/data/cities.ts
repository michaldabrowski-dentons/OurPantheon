// A city's size is the number of dots in its pyramid: one per follower. Ten is the ceiling.

export const CITY_CAP = 10

export const CITY_LEVELS: string[] = [
  'Koczowisko',
  'Mała osada',
  'Wioska',
  'Grodzisko',
  'Miasteczko',
  'Miasto',
  'Duże miasto',
  'Potężne miasto',
  'Metropolia',
  'Wielkie imperium',
]

/** the rows of the pyramid for every level, bottom row first */
export const PYRAMID: Record<number, number[]> = {
  1: [1],
  2: [2],
  3: [2, 1],
  4: [3, 1],
  5: [3, 2],
  6: [3, 2, 1],
  7: [4, 3],
  8: [4, 3, 1],
  9: [4, 3, 2],
  10: [4, 3, 2, 1],
}

export function cityLevel(dots: number): number {
  return Math.max(0, Math.min(CITY_CAP, dots))
}

/** "Duże miasto (poziom 7)"; a city without dots is a ruin */
export function cityLevelName(dots: number): string {
  const lvl = cityLevel(dots)
  return lvl === 0 ? 'Ruina' : CITY_LEVELS[lvl - 1]
}

export function cityLevelLabel(dots: number): string {
  const lvl = cityLevel(dots)
  return lvl === 0 ? 'Ruina' : `${CITY_LEVELS[lvl - 1]} (poziom ${lvl})`
}

/** "1 wyznawca", "4 wyznawców", "22 wyznawców" */
export function followersWord(n: number): string {
  const a = Math.abs(n)
  if (a === 1) return '1 wyznawca'
  return `${a} wyznawców`
}

/** "1 kropka", "2 kropki", "5 kropek" */
export function dotsWord(n: number): string {
  const a = Math.abs(n)
  const tens = a % 100
  const ones = a % 10
  if (a === 1) return '1 kropka'
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return `${a} kropki`
  return `${a} kropek`
}
