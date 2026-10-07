// The dice a book row carries, whoever threw them: a Logos roll, a table 2k6, a word's own dice,
// a contest. The summary slab shows the latest; the dice window plays every throw for the table.
import type { ActionLog } from '@/lib/types'
import { ACTION_BY_KEY, type ActionKey } from './actions'
import { logosWords } from './chronicle'

export interface ShownRoll {
  kind: '2d6' | 'd6'
  d1: number
  d2: number
  total: number
  label: string
  /** what the total means, for the window */
  verdict?: string
}

export function rollOf(l: ActionLog): ShownRoll | null {
  const r = l.roll
  const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
  if (l.action_key === 'logos_roll' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `Rzut Logos: +${logosWords(l.logos_delta)}` }
  if (l.action_key === 'dice' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: l.summary === 'Rzut 2k6' ? 'Rzut 2k6' : l.summary }
  if (l.action_key === 'develop_civilization' && typeof o.d1 === 'number') {
    const score = Number(o.score)
    const tier = o.tier === 'strong' ? 'Dwóch nowych wyznawców.' : o.tier === 'mixed' ? 'Jeden nowy wyznawca.' : 'Dar odrzucony.'
    return { kind: '2d6', d1: Number(o.d1), d2: Number(o.d2), total: Number(o.total), label: `Rozwój Cywilizacji, ${score < 0 ? '−' : '+'}${Math.abs(score)}${o.avatar ? ' − 2' : ''}`, verdict: tier }
  }
  if (l.action_key === 'catastrophe' && typeof o.d6 === 'number') {
    const wrath = Number(o.wrath)
    return { kind: 'd6', d1: Number(o.d6), d2: 0, total: Number(o.damage), label: `Kataklizm, k6 ${wrath < 0 ? '−' : '+'} ${Math.abs(wrath)} Gniew`, verdict: `Obrażeń: ${o.damage}.` }
  }
  if (l.action_key === 'contest_declared' && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: `${o.kind === 'holy_war' ? 'Święta Wojna' : 'Nawracanie'}: atak, ${(r.modifier ?? 0) < 0 ? '−' : '+'}${Math.abs(r.modifier ?? 0)}`, verdict: 'Czekamy na obronę.' }
  if ((l.action_key === 'convert' || l.action_key === 'holy_war') && r?.def) {
    const diff = (r.att?.total ?? 0) - r.def.total
    return { kind: '2d6', d1: r.def.d1, d2: r.def.d2, total: r.def.total, label: `${l.action_key === 'holy_war' ? 'Święta Wojna' : 'Nawracanie'}: obrona, ${r.def.modifier < 0 ? '−' : '+'}${Math.abs(r.def.modifier)}`, verdict: `Atak ${r.att?.total ?? '?'} przeciw ${r.def.total}: ${diff > 0 ? `atak wygrywa o ${diff}` : diff === 0 ? 'remis' : `obrona wygrywa o ${-diff}`}.` }
  }
  const a = ACTION_BY_KEY[l.action_key as ActionKey]
  if (a && r) return { kind: '2d6', d1: r.d1, d2: r.d2, total: r.total ?? r.d1 + r.d2, label: a.name }
  return null
}

/** the throws the whole table should watch (the Logos rolls of a new round are quiet) */
export function isWatchedRoll(l: ActionLog): boolean {
  return l.action_key !== 'logos_roll' && rollOf(l) !== null
}
