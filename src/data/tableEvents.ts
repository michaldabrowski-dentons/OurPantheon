import { ACTION_BY_KEY, TIER_LABEL, logActionKey } from './actions'
import { fightLine, prophecyBonus, rollScore, rollTier } from './dice'
import { ATTRIBUTE_BY_KEY } from './pantheon'
import type { AttrKey } from '@/lib/types'
import { pastFor, logosWords } from './chronicle'
import { followersWord } from './cities'
import type { ActionLog, Entity, GodGender } from '@/lib/types'

export interface EventContext {
  god: (id: string | null) => { name: string; gender: GodGender }
  entity: (id: string | null) => Entity | undefined
}

/** what a herd, a beast or a tribe did, told of the thing by its name ("Nyki migrują") */
function moveLine(unit: string, name: string, res: string, o: Record<string, unknown>): string {
  const mutant = typeof o.mutation_name === 'string' && o.mutation_name ? `${typeof o.mutation_emoji === 'string' ? `${o.mutation_emoji} ` : ''}${o.mutation_name}` : null
  if (unit === 'herbivore') {
    switch (res) {
      case 'die': return `${name} wymierają z głodu.`
      case 'wander': return `${name} migrują.`
      case 'stay': return `${name} spokojnie się pasą.`
      case 'tame': return `${name} pasą się przy ludziach.`
      case 'graze_best': return `${name} migrują na lepsze pastwiska.`
      case 'reproduce': return `${name} mnożą się.`
      case 'crowded': return `${name} nie mają gdzie się rozmnożyć.`
      case 'mutation': return mutant ? `Ewolucja tworzy nowy gatunek: ${mutant}!` : `${name} zmieniają się: czekamy na nazwę nowego gatunku.`
      default: return `${name}: ${res}.`
    }
  }
  if (unit === 'beast') {
    const hunt = typeof o.hunt_new === 'string' ? ` Nowa wataha ${o.hunt_new === 'hunt' ? 'rusza na łowy' : o.hunt_new === 'fight' ? 'wpada na przeciwnika' : o.hunt_new === 'attack' ? 'napada' : 'krąży'}.` : ''
    switch (res) {
      case 'die': return `${name} zdychają z głodu.`
      case 'wander': return `${name} migrują.`
      case 'sleep': return `${name} leżą w leżach.`
      case 'hunt': return `${name} wyruszają na łowy.`
      case 'hunting': return `${name} wyruszają na łowy.`
      case 'prowl': return `${name} krążą pod miastem.`
      case 'sated': return `${name} leżą syte przy stadzie.`
      case 'attack': return `${name} napadają!`
      case 'fight': return `${name} wpadają na przeciwnika.`
      case 'pack': return `${name} mnożą się.${hunt}`
      case 'crowded': return `${name} nie mają gdzie się rozmnożyć.`
      case 'mutation': return mutant ? `Wataha dzieli się. Powstają ${mutant}!${hunt}` : `${name} dzielą się: czekamy na nazwę nowej watahy.`
      default: return `${name}: ${res}.`
    }
  }
  switch (res) {
    case 'die': return `${name} przegrywają walkę z naturą.`
    case 'explore': return `${name} eksplorują nieznane.`
    case 'camp': return `${name} rozbijają obóz.`
    case 'promised': return `${name} podążają ku Ziemi Obiecanej.`
    case 'settle': return `${name} osiadają i zakładają miasto.`
    case 'split': return `${name} dzielą się.`
    case 'fight': return `${name} wpadają na przeciwnika.`
    case 'people': return `${name} mieszkają w mieście.`
    case 'crowded': return `${name} nie mają gdzie się podzielić.`
    case 'mutation': return mutant ? `Narodził się nowy lud: ${mutant}!` : `${name} dzielą się: czekamy na nazwę nowego ludu.`
    default: return `${name}: ${res}.`
  }
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
      const total = l.roll?.total ?? d
      return `${moveLine(String(o.unit ?? ''), name, res, o)}${total !== undefined && total !== null ? ` (${total})` : ''}`
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
      const city = String(o.name ?? '')
      const total = l.roll?.total ?? d
      const line =
        res === 'bloom' ? `${city} przeżywa rozkwit.`
        : res === 'full' ? `${city} przeżywa rozkwit, lecz jest już pełne.`
        : res === 'calm' ? `W ${city} mijają lata spokoju.`
        : res === 'colony' ? `${city} jest przeludnione. Obywatele (${followersWord(Number(o.overflow ?? 0))}) wyruszają założyć nową kolonię${o.target_kind === 'beast' ? ' i muszą walczyć z bestią' : ''}.`
        : res === 'stay' ? `${city} jest przeludnione, lecz nie ma dokąd pójść.`
        : res === 'famine' ? `Głód i choroby dziesiątkują ${city}.${o.source_destroyed ? ' Osada obraca się w ruinę.' : ''}`
        : res === 'grow' ? `${city} rośnie o jedną grupę bezbożnych.`
        : res === 'stagnate' ? `W ${city} mijają lata spokoju.`
        : res === 'exodus' ? `${city} jest przeludnione. Obywatele wyruszają założyć nową kolonię.`
        : `${city}: ${res}.`
      return `${line} (${total ?? '?'})`
    }
    case 'night_city_founded': {
      const who = ctx.god(typeof o.namer_id === 'string' ? o.namer_id : null).name
      const city = ctx.entity(typeof o.city_id === 'string' ? o.city_id : null)?.name ?? String(o.name ?? '')
      return o.name_pending ? `Nowe miasto czeka na nazwę od bóstwa ${who}.` : `Nowe miasto: ${city}${o.placeholder ? ' (nazwa tymczasowa)' : ''}.`
    }
    case 'night_plague': {
      const lost = ((o.lost as { n: number }[] | undefined) ?? []).reduce((n, g) => n + g.n, 0)
      const killed = o.killed as { name?: string; emoji?: string } | null | undefined
      const left = Number(o.rounds_left ?? 0)
      const tail = left > 0 ? ` Zaraza potrwa jeszcze ${left === 1 ? 'noc' : `${left} noce`}.` : ' Zaraza wygasa.'
      if (o.name) return `Plaga w mieście ${o.name}: ${lost > 0 ? `umiera ${followersWord(lost)}` : 'nikt nie umiera'}${o.city_destroyed ? ', miasto obraca się w ruinę' : ''}.${tail}`
      return killed ? `Plaga wybija ${killed.emoji ? `${killed.emoji} ` : ''}${killed.name ?? ''}.${tail}` : `Plaga nie znalazła nikogo.${tail}`
    }
    case 'night_drought': {
      const killed = o.killed as { name?: string; emoji?: string } | null | undefined
      const left = Number(o.rounds_left ?? 0)
      const tail = left > 0 ? ` Susza potrwa jeszcze ${left === 1 ? 'noc' : `${left} noce`}.` : ' Susza mija.'
      return killed ? `Susza wygubiła ${killed.emoji ? `${killed.emoji} ` : ''}${killed.name ?? ''}.${tail}` : `Susza${o.name ? ` pod miastem ${o.name}` : ''}: ziemia jałowa.${tail}`
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
      const def = o.godless ? 'bezbożnikom' : ctx.god(typeof o.defender_id === 'string' ? o.defender_id : null).name
      const began = gender === 'm' ? 'zaczął' : gender === 'f' ? 'zaczęła' : 'zaczęło'
      const what = o.kind === 'holy_war' ? `${p('wyruszy')} na świętą wojnę` : o.kind === 'avatar_duel' ? `${p('posła')} awatara do walki` : `${began} nawracać`
      const where = o.kind === 'avatar_duel' ? (typeof o.defender_avatar === 'string' ? ` (${o.defender_avatar})` : '') : typeof o.target_name === 'string' && o.target_name ? ` w mieście ${o.target_name}` : ''
      return `${G} ${what} przeciw ${def}${where}. ${o.godless ? 'Za bezbożników rzuca księga.' : 'Czekamy na obronę.'}`
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
    case 'night_plague':
    case 'night_drought':
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
      const key = logActionKey(l)
      const a = key ? ACTION_BY_KEY[key] : undefined
      if (!a) return l.summary
      const e = ctx.entity(l.entity_id)
      const who = l.is_avatar_free_action ? ' przez awatara' : ''
      const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
      let dice = ''
      if (typeof o.d1 === 'number' && typeof o.d2 === 'number') {
        const score = rollScore(l)
        const hold = prophecyBonus(o)
        const attr = ATTRIBUTE_BY_KEY[(o.attr ?? l.roll?.attr) as AttrKey]?.name
        const tier = rollTier(l)
        dice = ` Kości: ${o.d1} + ${o.d2} ${score < 0 ? '-' : '+'} ${Math.abs(score)}${attr ? ` (${attr})` : ''}${hold ? ` + ${hold} (proroctwo)` : ''} = ${o.total}${tier ? `: ${TIER_LABEL[tier].toLowerCase()}` : ''}.`
      } else if (key === 'migrate' && l.roll?.att && l.roll?.def) {
        dice = ` Walka: ${l.roll.att.total} przeciw ${l.roll.def.total}. ${fightLine(l) ?? ''}`
      }
      return `${G}: ${a.name}${e ? ` (${e.name})` : ''}${who}.${dice}`
    }
  }
}
