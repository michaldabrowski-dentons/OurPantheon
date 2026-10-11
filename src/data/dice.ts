// The dice a book row carries, whoever threw them: a Logos roll, a table 2k6, a word's own dice,
// a contest. The summary slab shows the latest; the dice window plays every throw for the table.
import type { ActionLog } from '@/lib/types'
import { ACTION_BY_KEY, TIER_LABEL, logActionKey, type Tier } from './actions'
import { logosWords } from './chronicle'
import { ATTRIBUTE_BY_KEY } from './pantheon'
import { temperOf, herdRankName, resourceRankName } from './fertility'
import { followersWord } from './cities'
import type { AttrKey } from '@/lib/types'

export interface ShownRoll {
  kind: '2d6' | 'd6'
  d1: number
  d2: number
  total: number
  label: string
  /** what the total means, for the window */
  verdict?: string
  /** a contest: both sides spelled out */
  sides?: { attacker: string; defender: string }
}

type O = Record<string, unknown>
const outcomeOf = (l: ActionLog): O => (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
const attrName = (a: unknown) => ATTRIBUTE_BY_KEY[a as AttrKey]?.name ?? ''
const signed = (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`

/** the prophecy added to a word's roll: a number since 0023, an object with a hold before */
export function prophecyBonus(o: O): number {
  if (typeof o.prophecy === 'number') return o.prophecy
  if (o.prophecy && typeof o.prophecy === 'object') return Number((o.prophecy as O).hold ?? 0)
  return 0
}

/** the attribute's own score on a rolled row (old rows kept it under the attribute's name) */
export function rollScore(l: ActionLog): number {
  const o = outcomeOf(l)
  if (typeof o.score === 'number') return o.score
  if (typeof o.wrath === 'number') return o.wrath
  if (typeof o.grace === 'number') return o.grace
  return Number(l.roll?.modifier ?? 0) - prophecyBonus(o)
}

/** the band a rolled row landed in (old rows without one are read from the total) */
export function rollTier(l: ActionLog): Tier | null {
  const o = outcomeOf(l)
  if (o.tier === 'strong' || o.tier === 'mixed' || o.tier === 'weak') return o.tier
  return null
}

/** one short line on what the dice did to the world, for the verdict under the total */
export function tierDetail(l: ActionLog): string | undefined {
  const key = logActionKey(l)
  if (!key) return undefined
  const o = outcomeOf(l)
  const tier = rollTier(l)
  const n = (k: string) => Number(o[k] ?? 0)
  switch (key) {
    case 'catastrophe': {
      const dmg = n('damage')
      return dmg === 0 ? 'Kataklizm wygasł: nikt nie został ranny.' : `${dmg} ${dmg === 1 ? 'obrażenie' : dmg < 5 ? 'obrażenia' : 'obrażeń'}${o.biome_after ? ', ziemia odmieniona' : ''}.`
    }
    case 'bless_land':
      return `${resourceRankName(n('bonus'))} (Żyzność ${n('bonus') > 0 ? '+' : ''}${n('bonus')}).`
    case 'create_beast':
      return o.created === false ? 'Bestia nie powstała.' : `Bestie są ${temperOf(n('strength'))} (siła ${n('strength') > 0 ? '+' : ''}${n('strength')}).`
    case 'create_herd':
      return o.created === false ? 'Stado nie powstało.' : `${herdRankName(n('strength'))} (Żyzność ${n('strength') > 0 ? '+' : ''}${n('strength')}).`
    case 'create_sapient':
      return o.created === false ? 'Materia się nie przebudziła.' : Array.isArray(o.copies) && o.copies.length > 0 ? 'Lud liczny: plemię staje na dwóch polach.' : 'Plemię staje na wskazanym polu.'
    case 'create_avatar':
      return o.created === false ? 'Awatar nie zstąpił.' : `Awatar zstępuje z życiem ${n('hp')} z ${n('max_hp')}.`
    case 'develop_civilization': {
      const g = n('gained')
      return g >= 2 ? 'Dwóch nowych wyznawców.' : g === 1 ? 'Jeden nowy wyznawca.' : 'Dar odrzucony.'
    }
    case 'create_civilization': {
      const g = n('gained')
      return g === 0 ? 'Lud nie osiadł.' : `Miasto rodzi się z ${followersWord(g)}.`
    }
    case 'migrate':
      return o.arrived === false ? 'Nikt nie ruszył.' : o.moved ? 'Gatunek przeniósł się na nowe pole.' : 'Gatunek żyje odtąd w obu miejscach.'
    case 'multiply': {
      const c = n('count')
      return c === 0 ? 'Nie przybyło nikogo.' : c === 1 ? 'Jedna kopia na polu obok.' : `${c} kopie na polach obok.`
    }
    case 'change_creature':
      return o.created === false ? 'Istoty pozostały sobą.' : n('strength') > n('from_strength') ? 'Odmiana silniejsza od pierwowzoru.' : 'Odmiana o sile pierwowzoru.'
    case 'exodus':
      return o.left === false ? 'Nikt nie wyszedł z miasta.' : n('lost') > 0 ? `Jeden zginął w drodze; ${followersWord(n('dots'))} ${n('dots') === 1 ? 'doszedł' : 'doszło'}.` : `${followersWord(n('dots'))} ${n('dots') === 1 ? 'doszedł' : 'doszło'} do celu.`
    case 'prophecy':
      return o.spoken === false ? 'Prorok zamilkł.' : `Nieuchronność +${n('hold')}.`
    case 'great_miracle':
      return o.happened === false ? 'Świat nie drgnął.' : o.with_price ? 'Cud zachodzi, lecz ma cenę.' : 'Cud zachodzi w pełni.'
    default:
      return tier && ACTION_BY_KEY[key].roll?.tiers ? ACTION_BY_KEY[key].roll!.tiers![tier] : undefined
  }
}

export function rollOf(l: ActionLog): ShownRoll | null {
  const r = l.roll
  const o = outcomeOf(l)
  if (l.action_key === 'logos_roll' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `Rzut Logos: +${logosWords(l.logos_delta)}` }
  if (l.action_key === 'dice' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: l.summary === 'Rzut 2k6' ? 'Rzut 2k6' : l.summary }
  const kindName = (k: unknown) => (k === 'holy_war' ? 'Święta Wojna' : k === 'avatar_duel' ? 'Walka Awatarów' : 'Nawracanie')
  if (l.action_key === 'contest_declared' && r) {
    const mod = r.modifier ?? 0
    return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `${kindName(o.kind)}: atak, 2k6 + ${attrName(r.attr)} ${signed(mod)}`, verdict: 'Czekamy na obronę.' }
  }
  if ((l.action_key === 'convert' || l.action_key === 'holy_war' || l.action_key === 'avatar_duel') && r?.def) {
    const att = r.att
    const diff = (att?.total ?? 0) - r.def.total
    return {
      kind: '2d6',
      d1: r.def.d1,
      d2: r.def.d2,
      total: r.def.total,
      label: `${kindName(l.action_key)}: obrona, 2k6 + ${attrName(r.def.attr)} ${signed(r.def.modifier)}`,
      verdict: `${diff > 0 ? `Atak wygrywa o ${diff}` : diff === 0 ? 'Remis' : `Obrona wygrywa o ${-diff}`}.`,
      sides: {
        attacker: att ? `Atakujący: 2k6 + ${attrName(att.attr)} = ${att.total}` : 'Atakujący: ?',
        defender: `Obrońca: 2k6 + ${attrName(r.def.attr)} = ${r.def.total}`,
      },
    }
  }
  // a word's own dice: 2k6 + one of its two attributes (+ a prophecy), read by the three bands
  const key = logActionKey(l)
  const a = key ? ACTION_BY_KEY[key] : undefined
  const d1 = typeof o.d1 === 'number' ? o.d1 : r?.d1
  const d2 = typeof o.d2 === 'number' ? o.d2 : r?.d2
  if (a && typeof d1 === 'number' && typeof d2 === 'number') {
    const score = rollScore(l)
    const hold = prophecyBonus(o)
    const total = typeof o.total === 'number' ? o.total : r?.total ?? d1 + d2 + score + hold
    const attr = o.attr ?? r?.attr ?? (typeof o.wrath === 'number' ? 'wrath' : typeof o.grace === 'number' ? 'grace' : null)
    const tier = rollTier(l)
    const detail = tierDetail(l)
    return {
      kind: '2d6',
      d1,
      d2,
      total,
      label: `${a.name}, 2k6 ${signed(score)}${attr ? ` ${attrName(attr)}` : ''}${hold ? ` + ${hold} (proroctwo)` : ''}`,
      verdict: tier ? `${TIER_LABEL[tier]}${detail ? `: ${detail}` : '.'}` : detail,
    }
  }
  if (a && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: a.name }
  return null
}

/** the throws the whole table should watch (the Logos rolls of a new round are quiet) */
export function isWatchedRoll(l: ActionLog): boolean {
  return l.action_key !== 'logos_roll' && rollOf(l) !== null
}
