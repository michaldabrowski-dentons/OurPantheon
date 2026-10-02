import { ACTION_BY_KEY, type ActionKey } from './actions'
import { pastFor, logosWords } from './chronicle'
import type { ActionLog, Entity, GodGender } from '@/lib/types'

export interface EventContext {
  god: (id: string | null) => { name: string; gender: GodGender }
  entity: (id: string | null) => Entity | undefined
}

/**
 * One plain line about what just happened at the table, for the bottom bar: who clicked what,
 * and what the dice said. Not the book's voice: this is the table talking.
 */
export function describeEvent(l: ActionLog, ctx: EventContext): string {
  const { name: G, gender } = ctx.god(l.player_id)
  const p = pastFor(gender)
  const r = l.roll
  switch (l.action_key) {
    case 'logos_roll': {
      if (!r) return `${G} ${p('rzuci')} na Logos.`
      const bonus = (r.bonus_streak ?? 0) + (r.bonus_orthodoxy ?? 0)
      return `${G} ${p('rzuci')} na Logos: ${r.d1} + ${r.d2}${bonus > 0 ? ` + ${bonus}` : ''} = ${r.total ?? r.d1 + r.d2}, czyli ${logosWords(l.logos_delta)}.`
    }
    case 'dice': {
      const total = r ? (r.total ?? r.d1 + r.d2) : null
      const ctxText = l.summary && !/^rzut 2k6$/i.test(l.summary.trim()) ? ` (${l.summary})` : ''
      return total === null ? `${G} ${p('rzuci')} 2k6.` : `${G} ${p('rzuci')} 2k6${ctxText}: ${r!.d1} + ${r!.d2}${r?.modifier ? ` ${r.modifier > 0 ? '+' : '-'} ${Math.abs(r.modifier)}` : ''} = ${total}.`
    }
    case 'rest':
      return `${G} odpoczywa do końca rundy.`
    case 'transfer':
      return `${G} ${p('przekaza')} Logos bóstwu ${l.summary.trim() || 'bez imienia'}.`
    case 'chaos_reveal':
      return `${G} ${p('odwróci')} Kartę Chaosu${r ? `: kości ${r.d1} i ${r.d2}` : ''}.`
    case 'chaos_choice':
      return `${G} ${p('wybra')} zdarzenie Chaosu.`
    case 'chaos_answer':
      return `${G} ${p('odpowiedzia')} na pytanie Chaosu.`
    case 'round_end':
      return 'Runda dobiegła końca. Nowa runda zaczyna się rzutami.'
    case 'era_advance':
      return l.summary
    case 'game_start':
      return 'Pierwsza Era się zaczęła. Wszyscy rzucają na Logos.'
    case 'followers_gain':
    case 'followers_loss':
    case 'entity_edit':
    case 'entity_removed':
    case 'chaos_notes':
      return l.summary
    default: {
      const a = ACTION_BY_KEY[l.action_key as ActionKey]
      if (!a) return l.summary
      const e = ctx.entity(l.entity_id)
      const who = l.is_avatar_free_action ? ' przez awatara' : ''
      return `${G}: ${a.name}${e ? ` (${e.name})` : ''}${who}.`
    }
  }
}
