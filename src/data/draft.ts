// The action dialog does not open with an empty description: it drafts one in the book's own words
// from what the player has picked so far, and keeps redrafting until the player edits it by hand.
import type { Entity, EntityKind, GodGender } from '@/lib/types'
import type { ActionDef } from './actions'
import { describeDeed, describeSeen, pastFor } from './chronicle'

export interface DraftGod {
  name: string
  gender: GodGender
}

export interface DraftForm {
  name: string
  kind: EntityKind
  traits: string[]
  specialties: string[]
  flaws: string[]
  desires: string[]
  requirements: string[]
  conditions: string[]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A thing's description: the whole verse the book will carry, the deed first, then what the god saw in it. */
export function draftEntityDescription(action: ActionDef, form: DraftForm, god: DraftGod): string {
  const ent = {
    kind: form.kind,
    name: form.name,
    traits: form.traits,
    specialties: form.specialties,
    flaws: form.flaws,
    desires: form.desires,
    requirements: form.requirements,
    conditions: form.conditions,
  } as Entity
  const opener = describeDeed('draft', god, action.key, form.name, form.kind)
  const detail = describeSeen('draft', god, ent, action.entityOp === 'update')
  return detail ? `${opener} ${detail}` : `${opener} ${arrival(form, god)}`
}

/** before any trait is picked: a line about the thing's arrival */
function arrival(form: DraftForm, god: DraftGod): string {
  const n = form.name.trim() || 'to, co nie ma jeszcze imienia'
  const p = pastFor(god.gender)
  switch (form.kind) {
    case 'creature':
      return `Pojawiły się ${n} na świecie, a ${god.name} ${p('patrzy')} na nie z góry.`
    case 'civilization':
      return `Zeszli się ludzie w ${n}, i zaczęła się ich historia.`
    case 'faction':
      return `Zawiązała się ${n}, a świat jeszcze nie wiedział, czego chce.`
    case 'orthodoxy':
      return `Zapłonęły pierwsze ognie ${n}, a wierni szukali słów modlitwy.`
    case 'avatar':
      return `${cap(p('zesła'))} ${god.name} na świat ${n}, by chodzić między śmiertelnymi.`
  }
}

/** A deed without a thing of its own (land, climate, catastrophe, miracle, orders): the whole verse, opening first. */
export function draftDeedSummary(action: ActionDef, god: DraftGod, target: { name: string; kind: EntityKind } | null): string {
  const opener = describeDeed('draft', god, action.key, target?.name ?? '', target?.kind ?? null)
  const line = deedLine(action, god, target?.name ?? null)
  return line ? `${opener} ${line}` : opener
}

function deedLine(action: ActionDef, god: DraftGod, targetName: string | null): string {
  const p = pastFor(god.gender)
  const G = god.name
  switch (action.key) {
    case 'shape_land':
      return `Wyrosły góry i rozlały się wody tam, gdzie ${p('wskaza')} ${G}.`
    case 'change_biome':
      return `Zmienił się klimat tych ziem i inne życie na nie przyszło.`
    case 'catastrophe':
      return `Zadrżała ziemia i zmienił się kształt świata.`
    case 'great_miracle':
      return `I stało się tak na całym świecie, od krańca po kraniec.`
    case 'command_avatar':
      return `${cap(p('posłucha'))} ${targetName ? `awatar ${targetName}` : 'awatar'} i ${p('uczyni')} to, co mu kazano.`
    case 'command_followers':
      return `Usłyszeli wyznawcy wolę ${G} i wyszli ją spełnić.`
    case 'resurrect_avatar':
      return `${cap(p('wyrwa'))} ${G} ${targetName ? `awatara ${targetName}` : 'awatara'} z objęć śmierci.`
    default:
      return ''
  }
}
