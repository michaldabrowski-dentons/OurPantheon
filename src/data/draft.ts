// A deed without an outcome of its own (a miracle, a plain order) still gets a first draft in the
// book's words; everything else is composed from the outcome in chronicle.ts.
import type { EntityKind, GodGender } from '@/lib/types'
import type { ActionDef } from './actions'
import { describeDeed, pastFor } from './chronicle'

export interface DraftGod {
  name: string
  gender: GodGender
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** the whole verse, opening first */
export function draftDeedSummary(action: ActionDef, god: DraftGod, target: { name: string; kind: EntityKind } | null): string {
  const opener = describeDeed('draft', god, action.key, target?.name ?? '', target?.kind ?? null)
  const line = deedLine(action, god, target?.name ?? null)
  return line ? `${opener} ${line}` : opener
}

function deedLine(action: ActionDef, god: DraftGod, targetName: string | null): string {
  const p = pastFor(god.gender)
  const G = god.name
  switch (action.key) {
    case 'great_miracle':
      return `I stało się tak na całym świecie, od krańca po kraniec.`
    case 'resurrect_avatar':
      return `${cap(p('wyrwa'))} ${G} ${targetName ? `awatara ${targetName}` : 'awatara'} z objęć śmierci.`
    default:
      return ''
  }
}
