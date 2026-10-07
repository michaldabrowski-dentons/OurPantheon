// The dice a book row carries, whoever threw them: a Logos roll, a table 2k6, a word's own dice,
// a contest. The summary slab shows the latest; the dice window plays every throw for the table.
import type { ActionLog } from '@/lib/types'
import { ACTION_BY_KEY, type ActionKey } from './actions'
import { logosWords } from './chronicle'
import { ATTRIBUTE_BY_KEY } from './pantheon'
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

export function rollOf(l: ActionLog): ShownRoll | null {
  const r = l.roll
  const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
  if (l.action_key === 'logos_roll' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `Rzut Logos: +${logosWords(l.logos_delta)}` }
  if (l.action_key === 'dice' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: l.summary === 'Rzut 2k6' ? 'Rzut 2k6' : l.summary }
  const hold = o.prophecy && typeof o.prophecy === 'object' ? Number((o.prophecy as Record<string, unknown>).hold ?? 0) : 0
  if (l.action_key === 'develop_civilization' && typeof o.d1 === 'number') {
    const score = Number(o.score)
    const tier = o.tier === 'strong' ? 'Dwóch nowych wyznawców.' : o.tier === 'mixed' ? 'Jeden nowy wyznawca.' : 'Dar odrzucony.'
    return { kind: '2d6', d1: Number(o.d1), d2: Number(o.d2), total: Number(o.total), label: `Rozwój Cywilizacji, ${score < 0 ? '−' : '+'}${Math.abs(score)}${o.avatar ? ' − 2' : ''}${hold ? ` + ${hold} (proroctwo)` : ''}`, verdict: tier }
  }
  if (l.action_key === 'catastrophe' && typeof o.d6 === 'number') {
    const wrath = Number(o.wrath)
    return { kind: 'd6', d1: Number(o.d6), d2: 0, total: Number(o.damage), label: `Kataklizm, k6 ${wrath < 0 ? '−' : '+'} ${Math.abs(wrath)} Gniew${hold ? ` + ${hold} (proroctwo)` : ''}`, verdict: `Obrażeń: ${o.damage}.` }
  }
  const kindName = (k: unknown) => (k === 'holy_war' ? 'Święta Wojna' : k === 'avatar_duel' ? 'Walka Awatarów' : 'Nawracanie')
  const attrName = (a: unknown) => ATTRIBUTE_BY_KEY[a as AttrKey]?.name ?? ''
  if (l.action_key === 'contest_declared' && r) {
    const mod = r.modifier ?? 0
    return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `${kindName(o.kind)}: atak, 2k6 + ${attrName(r.attr)} ${mod < 0 ? '−' : '+'} ${Math.abs(mod)}`, verdict: 'Czekamy na obronę.' }
  }
  if ((l.action_key === 'convert' || l.action_key === 'holy_war' || l.action_key === 'avatar_duel') && r?.def) {
    const att = r.att
    const diff = (att?.total ?? 0) - r.def.total
    return {
      kind: '2d6',
      d1: r.def.d1,
      d2: r.def.d2,
      total: r.def.total,
      label: `${kindName(l.action_key)}: obrona, 2k6 + ${attrName(r.def.attr)} ${r.def.modifier < 0 ? '−' : '+'} ${Math.abs(r.def.modifier)}`,
      verdict: `${diff > 0 ? `Atak wygrywa o ${diff}` : diff === 0 ? 'Remis' : `Obrona wygrywa o ${-diff}`}.`,
      sides: {
        attacker: att ? `Atakujący: 2k6 + ${attrName(att.attr)} = ${att.total}` : 'Atakujący: ?',
        defender: `Obrońca: 2k6 + ${attrName(r.def.attr)} = ${r.def.total}`,
      },
    }
  }
  const a = ACTION_BY_KEY[l.action_key as ActionKey]
  if (a && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: a.name }
  return null
}

/** the throws the whole table should watch (the Logos rolls of a new round are quiet) */
export function isWatchedRoll(l: ActionLog): boolean {
  return l.action_key !== 'logos_roll' && rollOf(l) !== null
}
