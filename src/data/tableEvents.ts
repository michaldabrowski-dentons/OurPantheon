import { ACTION_BY_KEY, type ActionKey } from './actions'
import { pastFor, logosWords } from './chronicle'
import { followersWord } from './cities'
import type { ActionLog, Entity, GodGender } from '@/lib/types'

export interface EventContext {
  god: (id: string | null) => { name: string; gender: GodGender }
  entity: (id: string | null) => Entity | undefined
}

const RESULT_WORDS: Record<string, string> = {
  idle: 'stoi w miejscu',
  tame: 'pasie się przy ludziach',
  camp: 'obozuje',
  move: 'wędruje',
  move_best: 'idzie na żyźniejszą ziemię',
  hunt: 'poluje',
  sated: 'leży przy stadzie',
  reproduce: 'mnoży się',
  pack: 'rozrasta watahę',
  split: 'dzieli się na dwa plemiona',
  crowded: 'nie ma gdzie się rozmnożyć',
  people: 'mieszka w mieście',
  settle: 'osiada i zakłada miasto',
  attack: 'rusza do ataku',
  fight: 'wpada na przeciwnika',
}

/** one line of the night, for the night panel and the bar */
export function nightLine(l: ActionLog, ctx: EventContext): string {
  const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
  const d = l.roll?.d1
  const name = `${typeof o.emoji === 'string' && o.emoji ? `${o.emoji} ` : ''}${String(o.name ?? '')}`.trim()
  switch (l.action_key) {
    case 'night_begin':
      return `Noc zapada: stada ${o.herbivores ?? 0}, bestie ${o.beasts ?? 0}, plemiona ${o.tribes ?? 0}, miasta ${o.cities ?? 0}.`
    case 'night_move': {
      const res = String(o.result ?? '')
      return `${name}: ${d ?? '?'}, ${RESULT_WORDS[res] ?? res}.`
    }
    case 'night_fight': {
      const L = (o.left ?? {}) as Record<string, unknown>
      const R = (o.right ?? {}) as Record<string, unknown>
      const a = `${typeof L.emoji === 'string' ? `${L.emoji} ` : ''}${String(L.label ?? '')}`.trim()
      const b = `${typeof R.emoji === 'string' ? `${R.emoji} ` : ''}${String(R.label ?? '')}`.trim()
      const diff = Number(o.diff ?? 0)
      const res = String(o.result ?? '')
      const head = `${a} przeciw ${b}: ${l.roll?.att?.total ?? '?'} do ${l.roll?.def?.total ?? '?'}`
      const tail =
        res === 'eaten' ? (o.loser === 'right' ? `${b} zjedzone` : `${a} zjedzone`)
        : res === 'flee' ? (o.loser === 'right' ? `${b} ucieka` : `${a} ucieka`)
        : res === 'fled_nowhere' ? 'przegrany nie miał dokąd uciec i zginął'
        : res === 'vanished' ? 'nowa sztuka nie przyszła na świat'
        : res === 'return' ? 'remis, napastnik wraca'
        : res === 'city_hit' ? `miasto traci ${followersWord(((o.city_lost as { n: number }[] | undefined) ?? []).reduce((n, g) => n + g.n, 0))}${o.city_destroyed ? ' i pada' : ''}`
        : res === 'avatar_hit' ? `awatar ranny, życie ${o.avatar_hp ?? '?'}`
        : res === 'founded' ? 'osadnicy zwyciężają i zakładają miasto'
        : res === 'joined' ? 'osadnicy zdobywają miasto'
        : res === 'returned' ? 'osadnicy wracają do domu'
        : res === 'all_dead' ? 'wszyscy osadnicy giną'
        : ''
      return `${head} (${diff > 0 ? `o ${diff}` : diff < 0 ? `o ${-diff} dla obrońcy` : 'remis'}): ${tail}.`
    }
    case 'night_city': {
      const res = String(o.result ?? '')
      const what =
        res === 'grow' ? 'rośnie o jedną grupę bezbożnych'
        : res === 'full' ? 'jest już pełne'
        : res === 'stagnate' ? 'stoi w miejscu'
        : res === 'exodus' ? `nadwyżka (${followersWord(Number(o.overflow ?? 0))}) ${o.target_kind === 'found' ? 'odchodzi założyć miasto' : o.target_kind === 'beast' ? 'rusza na bestię' : 'rusza na cudze miasto'}`
        : res === 'stay' ? 'nie ma dokąd wysłać nadwyżki'
        : res
      return `Miasto ${String(o.name ?? '')}: ${d ?? '?'} przeciw żyzności ${o.fertility ?? '?'} przy ludności ${o.population ?? '?'}, ${what}.`
    }
    case 'night_city_founded': {
      const who = ctx.god(typeof o.namer_id === 'string' ? o.namer_id : null).name
      const city = ctx.entity(typeof o.city_id === 'string' ? o.city_id : null)?.name ?? String(o.name ?? '')
      return o.name_pending ? `Nowe miasto czeka na nazwę od bóstwa ${who}.` : `Nowe miasto: ${city}${o.placeholder ? ' (nazwa tymczasowa)' : ''}.`
    }
    default:
      return l.summary
  }
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
    case 'contest_declared': {
      const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
      const def = ctx.god(typeof o.defender_id === 'string' ? o.defender_id : null).name
      const began = gender === 'm' ? 'zaczął' : gender === 'f' ? 'zaczęła' : 'zaczęło'
      const what = o.kind === 'holy_war' ? `${p('wyruszy')} na świętą wojnę` : o.kind === 'avatar_duel' ? `${p('posła')} awatara do walki` : `${began} nawracać`
      const where = o.kind === 'avatar_duel' ? (typeof o.defender_avatar === 'string' ? ` (${o.defender_avatar})` : '') : typeof o.target_name === 'string' && o.target_name ? ` w mieście ${o.target_name}` : ''
      return `${G} ${what} przeciw ${def}${where}. Czekamy na obronę.`
    }
    case 'contest_cancelled':
      return `${G} ${p('odwoła')} starcie.`
    case 'convert':
    case 'holy_war':
    case 'avatar_duel': {
      const att = r?.att
      const def = r?.def
      const dice = att && def ? `: ${att.total} przeciw ${def.total}` : ''
      return `${l.action_key === 'holy_war' ? 'Święta Wojna' : l.action_key === 'avatar_duel' ? 'Walka Awatarów' : 'Nawracanie'} rozstrzygnięte${dice}.`
    }
    case 'prophecy_fulfilled':
      return `${G} ${p('wypełni')} proroctwo.`
    case 'avatars_heal':
      return 'Awatary zabliźniły rany we śnie.'
    case 'city_destroyed':
      return `Miasto ${ctx.entity(l.entity_id)?.name ?? 'bez imienia'} obróciło się w ruinę.`
    case 'cities_grow':
      return 'Każde miasto zyskało wyznawcę dla tego, kto nim rządzi.'
    case 'night_begin':
    case 'night_move':
    case 'night_fight':
    case 'night_city':
    case 'night_city_founded':
      return nightLine(l, ctx)
    case 'dots_reward':
      return 'Najwierniej czczone bóstwa dostały Logos od wyznawców.'
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
      const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
      const dice =
        l.action_key === 'develop_civilization' && typeof o.d1 === 'number'
          ? ` Kości: ${o.d1} + ${o.d2} ${Number(o.score) < 0 ? '-' : '+'} ${Math.abs(Number(o.score))} = ${o.total}.`
          : l.action_key === 'catastrophe' && typeof o.d1 === 'number'
            ? ` Kości: ${o.d1} + ${o.d2} ${Number(o.wrath) < 0 ? '-' : '+'} ${Math.abs(Number(o.wrath))} (Gniew) = ${o.total}, połowa to ${o.damage}.`
            : ''
      return `${G}: ${a.name}${e ? ` (${e.name})` : ''}${who}.${dice}`
    }
  }
}
