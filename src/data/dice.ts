// The dice a book row carries, whoever threw them: a Logos roll, a table 2k6, a word's own dice,
// a contest, a fight a migration ended in. The summary slab shows the latest; the dice window plays
// every throw for the table.
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
  /** a contest or a fight: both sides spelled out */
  sides?: { attacker: string; defender: string }
}

type O = Record<string, unknown>
const outcomeOf = (l: ActionLog): O => (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
const attrName = (a: unknown) => ATTRIBUTE_BY_KEY[a as AttrKey]?.name ?? ''
const signed = (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`
const num = (o: O, k: string) => Number(o[k] ?? 0)

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

const blows = (n: number) => `${n} ${n === 1 ? 'trafienie' : n < 5 ? 'trafienia' : 'trafień'}`

/** one short line on what the blows of a cataclysm did */
function strikeDetail(o: O): string {
  const hits = (Array.isArray(o.hits) ? o.hits : []) as O[]
  const dots = hits.filter((h) => h.t === 'dot' || h.t === 'dots').reduce((n, h) => n + (h.t === 'dots' ? num(h, 'n') : 1), 0)
  const creatures = hits.filter((h) => h.t === 'creature').length
  const avatars = hits.filter((h) => h.t === 'avatar').length
  const parts: string[] = []
  if (dots) parts.push(`${followersWord(dots)} ${dots === 1 ? 'zginął' : 'zginęło'}`)
  if (creatures) parts.push(creatures === 1 ? 'jedna istota przepadła' : `${creatures} istoty przepadły`)
  if (avatars) parts.push(avatars === 1 ? 'awatar ranny' : 'awatary ranne')
  if (o.city_destroyed) parts.push('miasto w ruinie')
  if (!parts.length) return 'nikogo tam nie było'
  return parts.join(', ')
}

/** what a fight a migration ended in decided, in one line */
export function fightLine(l: ActionLog): string | undefined {
  const o = outcomeOf(l)
  const f = o.fight && typeof o.fight === 'object' ? (o.fight as O) : null
  if (!f) return undefined
  const L = (f.left ?? {}) as O
  const R = (f.right ?? {}) as O
  const a = `${typeof L.emoji === 'string' ? `${L.emoji} ` : ''}${String(L.label ?? '')}`.trim()
  const d = `${typeof R.emoji === 'string' ? `${R.emoji} ` : ''}${String(R.label ?? '')}`.trim()
  const res = String(f.result ?? '')
  const scene = String(f.scene ?? '')
  if (scene === 'beast_city') {
    const lost = ((Array.isArray(f.city_lost) ? f.city_lost : []) as O[]).reduce((n, g) => n + num(g, 'n'), 0)
    if (res === 'city_hit') return `${a} napadają na miasto ${d}: ${lost === 1 ? 'ginie jeden mieszkaniec' : `ginie ${followersWord(lost)}`}${f.city_destroyed ? ', miasto pada' : ''}.`
    if (res === 'return') return `${a} napadają na miasto ${d}, lecz mury wytrzymują.`
    return `${a} napadają na miasto ${d}, lecz lud je ${res === 'eaten' ? 'wybija' : 'odpędza'}.`
  }
  if (res === 'eaten' && f.loser === 'right') return `${a} rzucają się na ${d} i ${f.extinct ? 'pożerają je do ostatniego' : 'pożerają je'}; biorą pole.`
  if (res === 'eaten') return `${a} rzucają się na ${d}, lecz ${d} ${f.extinct ? 'ścierają je z ziemi' : 'rozszarpują napastnika'}.`
  if (res === 'flee' && f.loser === 'right') return `${a} napadają na ${d}: te uciekają na sąsiednie pole, a ${a} biorą ich ziemię.`
  if (res === 'fled_nowhere' && f.loser === 'right') return `${a} napadają na ${d}: te nie mają gdzie uciec i giną; ${a} biorą ich ziemię.`
  if (res === 'flee' || res === 'fled_nowhere' || res === 'vanished') return `${a} napadają na ${d}, lecz zostają odparte i uciekają${res === 'fled_nowhere' ? ', nie mając gdzie: giną' : ''}.`
  return `${a} stają przeciw ${d}, i nikt nie ustępuje: wracają.`
}

/** one short line on what the dice did to the world, for the verdict under the total */
export function tierDetail(l: ActionLog): string | undefined {
  const key = logActionKey(l)
  if (!key) return undefined
  const o = outcomeOf(l)
  const tier = rollTier(l)
  const n = (k: string) => num(o, k)
  switch (key) {
    case 'fire_rain': {
      const dmg = n('damage')
      if (dmg === 0) return 'Ogień zgasł w powietrzu: nikt nie został ranny.'
      return `${blows(dmg)}: ${strikeDetail(o)}${o.biome_after ? '; ziemia obróciła się w ugór' : ''}.`
    }
    case 'flood':
      if (o.drowned) return `Pole zatonęło na zawsze: ${strikeDetail(o)}.`
      return n('damage') === 0 ? 'Wody cofnęły się, nie czyniąc nic.' : `Woda zabrała ${blows(n('damage'))}: ${strikeDetail(o)}.`
    case 'lightning':
      if (!o.hit) return 'Piorun chybił.'
      return o.role === 'avatar' ? `Awatar ${String(o.name ?? '')} traci ${n('damage') === 1 ? 'jedno życie' : 'dwa życia'}${o.killed ? ' i ginie' : ` (życie ${n('hp')})`}.` : `${String(o.emoji ?? '')} ${String(o.name ?? '')} ${o.extinct ? 'wyginęły' : 'znikają z tego pola'}.`
    case 'drought':
      return n('rounds') === 0 ? 'Chmury zebrały się i rozeszły.' : `Ziemia jałowa przez ${n('rounds') === 2 ? 'dwie noce' : 'trzy noce'}: Żyzność 0.`
    case 'plague':
      return n('rounds') === 0 ? 'Zaraza nie chwyciła.' : `Zaraza na ${n('rounds') === 1 ? 'jedną noc' : 'dwie noce'}: co noc umiera dwoje.`
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
      return fightLine(l) ?? (o.moved ? 'Gatunek przeszedł na nowe pole.' : 'Nikt nie ruszył.')
    case 'multiply': {
      const c = n('count')
      return c === 0 ? 'Nie przybyło nikogo.' : o.weakened ? `Kopia staje obok, lecz gatunek słabnie (siła ${n('strength') > 0 ? '+' : ''}${n('strength')}).` : 'Kopia staje na wskazanym polu.'
    }
    case 'change_creature':
      return o.changed === false || o.created === false ? 'Istoty pozostały sobą.' : n('strength') > n('from_strength') ? 'Istoty odmieniły się i urosły w siłę.' : 'Istoty odmieniły się.'
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
  // a migration that ended in a fight: the mover's dice, both sides spelled out
  if (l.action_key === 'migrate' && r?.att && r?.def) {
    const diff = r.att.total - r.def.total
    const fight = o.fight && typeof o.fight === 'object' ? (o.fight as O) : {}
    const R = (fight.right ?? {}) as O
    return {
      kind: '2d6',
      d1: r.att.d1,
      d2: r.att.d2,
      total: r.att.total,
      label: `Migracja: walka, ${String(o.emoji ?? '')} ${String(o.name ?? '')}, 2k6 ${signed(r.att.modifier)} siła`,
      verdict: `${diff > 0 ? `Napastnik wygrywa o ${diff}` : diff === 0 ? 'Remis' : `Obrońca wygrywa o ${-diff}`}. ${fightLine(l) ?? ''}`.trim(),
      sides: {
        attacker: `${String(o.emoji ?? '')} ${String(o.name ?? '')}: 2k6 ${signed(r.att.modifier)} = ${r.att.total}`,
        defender: `${typeof R.emoji === 'string' ? `${R.emoji} ` : ''}${String(R.label ?? 'Obrońca')}: 2k6 ${signed(r.def.modifier)} = ${r.def.total}`,
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
