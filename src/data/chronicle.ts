// The Chronicle is read like a book of genesis: a relation in the past tense, one verse per turn.
// No costs, no Logos counts: only what happened and what the gods saw. Several phrasings exist for
// every kind of verse; the log row's id picks one, so every god reads the same book. Only some
// sentences open with "I" or "A", so the book breathes. Since the map, a row carries `outcome`
// (what the word did to the world) and the book tells it; the player may rewrite the whole verse.
import type { ActionLog, BiomeKey, Entity, EntityKind, GodGender } from '@/lib/types'
import { ACTION_BY_KEY, ERA_NAMES, type ActionKey, type Era } from './actions'
import { CHAOS_BY_KEY, QUESTION_LEADS, type ChaosCategoryKey } from './chaosTables'
import { BIOME_ACC, BIOME_BY_KEY, BIOME_GEN, BIOME_LOC } from './biomes'
import { followersInWords } from './cities'

export interface GodRef {
  name: string
  gender: GodGender
}

export interface VerseContext {
  god: (playerId: string | null) => GodRef
  entity: (entityId: string | null) => Entity | undefined
}

/** "1 Słowo", "3 Słowa", "5 Słów" (used by the UI, never by the book) */
export function logosWords(n: number): string {
  const a = Math.abs(n)
  const tens = a % 100
  const ones = a % 10
  if (a === 1) return '1 Słowo'
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return `${a} Słowa`
  return `${a} Słów`
}

/** accusative of each kind: "spotkało to cywilizację ..." */
export const KIND_ACC: Record<EntityKind, string> = {
  creature: 'istoty',
  civilization: 'cywilizację',
  faction: 'frakcję',
  orthodoxy: 'religię',
  avatar: 'awatara',
}

/** what each Era is for; the book says so when an Era begins */
export const ERA_STORY: Record<Era, string> = {
  1: 'czas kształtowania lądów i ziemi',
  2: 'czas tchnienia życia i tworzenia istot',
  3: 'czas cywilizacji i objawiania się śmiertelnikom',
}

// ---------- small grammar ----------
type Forms = string | { m: string; f: string; n: string }

/** past tense of a verb for the god: a stem gets ł / ła / ło, irregulars are spelled out */
export function pastFor(g: GodGender) {
  return (f: Forms): string => {
    if (typeof f === 'string') return f + (g === 'm' ? 'ł' : g === 'f' ? 'ła' : 'ło')
    return f[g]
  }
}
type P = ReturnType<typeof pastFor>

const TCHNAL: Forms = { m: 'tchnął', f: 'tchnęła', n: 'tchnęło' }
const DOTKNAL: Forms = { m: 'dotknął', f: 'dotknęła', n: 'dotknęło' }
const SIEGNAL: Forms = { m: 'sięgnął', f: 'sięgnęła', n: 'sięgnęło' }
const PODNIOSL: Forms = { m: 'podniósł', f: 'podniosła', n: 'podniosło' }
const PRZYJAL: Forms = { m: 'przyjął', f: 'przyjęła', n: 'przyjęło' }
const PONIOSL: Forms = { m: 'poniósł', f: 'poniosła', n: 'poniosło' }
const ZAMILKL: Forms = { m: 'zamilkł', f: 'zamilkła', n: 'zamilkło' }
const ODPOCZAL: Forms = { m: 'odpoczął', f: 'odpoczęła', n: 'odpoczęło' }
const ZDJAL: Forms = { m: 'zdjął', f: 'zdjęła', n: 'zdjęło' }
const WZIAL: Forms = { m: 'wziął', f: 'wzięła', n: 'wzięło' }

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}
const pick = <T,>(id: string, arr: T[]): T => arr[hash(id) % arr.length]

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "a, b i c" */
function joinAnd(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean)
  if (xs.length === 0) return ''
  if (xs.length === 1) return xs[0]
  return `${xs.slice(0, -1).join(', ')} i ${xs[xs.length - 1]}`
}

function sentence(s: string): string {
  const t = s.trim()
  if (!t) return ''
  const c = cap(t)
  return /[.!?…»"]$/.test(c) ? c : `${c}.`
}

const stripPeriod = (s: string) => s.trim().replace(/[.]+$/, '')

/** every other sentence loses its opening "I " or "A ", so the relation does not drone */
function soften(text: string, id: string): string {
  if (hash(id + '#') % 2 === 0) return text
  const m = /^(I|A) (.)(.*)$/s.exec(text)
  return m ? `${m[2].toUpperCase()}${m[3]}` : text
}

/** how far, without a digit and without the word for a field */
function journeyWord(n: number): string {
  if (n <= 1) return 'na sąsiednie ziemie'
  if (n === 2) return 'przez dwie krainy'
  if (n === 3) return 'przez trzy krainy'
  return 'przez wiele krain'
}

// ---------- what the god saw ----------
/** things have no traits any more; the book says nothing after the deed but what the map tells */
export function describeSeen(_id: string, _god: GodRef, _ent: Entity, _changed: boolean): string {
  return ''
}

/** The opening sentence of a deed ("I stworzył X istoty, i nazwał je N."), for the dialog's draft. */
export function describeDeed(id: string, god: GodRef, key: ActionKey, name: string, kind: EntityKind | null): string {
  const n = name.trim() || 'bez imienia'
  return pick(id, OPENERS[key])(god.name, pastFor(god.gender), n, kind ? KIND_ACC[kind] : 'cywilizację')
}

/** A description drafted by the dialog is the whole verse: it names the god (and the thing, if there is one). */
function isWholeVerse(summary: string, G: string, ent: Entity | undefined): boolean {
  if (!summary || !summary.includes(G)) return false
  const n = ent?.name?.trim()
  return !n || summary.includes(n)
}

// ---------- the deeds ----------
type Opener = (G: string, p: P, n: string, kindAcc: string) => string

const OPENERS: Record<ActionKey, Opener[]> = {
  shape_land: [
    (G, p) => `I ${p('ukształtowa')} ${G} ląd.`,
    (G, p) => `${cap(p('rzek'))} ${G}: niech będzie ląd. I stało się tak.`,
    (G, p) => `${cap(p('pochyli'))} się ${G} nad światem i ${p('ukształtowa')} ląd.`,
  ],
  catastrophe: [
    (G, p) => `${cap(p('zesła'))} ${G} kataklizm.`,
    (G, p) => `${cap(p('rozgniewa'))} się ${G} i ${p('zesła')} kataklizm.`,
    (G, p) => `I ${p(PODNIOSL)} ${G} rękę na świat, i przyszedł kataklizm.`,
  ],
  great_miracle: [
    (G, p) => `${cap(p('uczyni'))} ${G} Wielki Cud.`,
    (G, p) => `Stało się to, czego nikt nie śmiał wypowiedzieć: ${G} ${p('uczyni')} Wielki Cud.`,
    (G, p) => `I ${p('wypowiedzia')} ${G} Słowo, jakiego świat nie słyszał, i ${p('uczyni')} Wielki Cud.`,
  ],
  create_creature: [
    (G, p, n) => `I ${p('stworzy')} ${G} istoty, i ${p('nazwa')} je ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech powstaną ${n}. I powstały.`,
    (G, p, n) => `${cap(p(TCHNAL))} ${G} życie w świat, i powstały ${n}.`,
  ],
  create_sapient: [
    (G, p, n) => `${cap(p('stworzy'))} ${G} istoty rozumne i ${p('nazwa')} je ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech powstaną ${n}, i niech myślą. I powstały.`,
    (G, p, n) => `I ${p('da')} ${G} światu istoty, które myślą, i ${p('nazwa')} je ${n}.`,
  ],
  change_creature: [
    (G, p, n) => `${cap(p('przekształci'))} ${G} istoty, i powstały ${n}.`,
    (G, p, n) => `I ${p(DOTKNAL)} ${G} istot, i odmieniły się w ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G} do istot: bądźcie inne. I stały się ${n}.`,
  ],
  migrate: [
    (G, p, n) => `${cap(p('posła'))} ${G} ${n} na nowe ziemie.`,
    (G, p, n) => `I ${p('rzek')} ${G} do ${n}: idźcie i rozmnażajcie się. I poszły.`,
    (G, p, n) => `${cap(p('otworzy'))} ${G} drogę, i rozeszły się ${n} dalej w świat.`,
  ],
  create_civilization: [
    (G, p, n) => `${cap(p('powoła'))} ${G} lud i ${p('nazwa')} go ${n}.`,
    (G, p, n) => `${cap(p('zebra'))} ${G} istoty rozumne w jeden lud i ${p('nazwa')} go ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G}: niech będzie lud ${n}. I stał się.`,
  ],
  develop_civilization: [
    (G, p, n) => `${cap(p('zstąpi'))} ${G} do miasta ${n} z darem.`,
    (G, p, n) => `I ${p('pochyli')} się ${G} nad miastem ${n}, i ${p('przynios')} mu dar.`,
    (G, p, n) => `${cap(p('rzek'))} ${G} do ludu ${n}: oto, co wam daję.`,
  ],
  exodus: [
    (G, p, n) => `${cap(p('wyprowadzi'))} ${G} swoich wyznawców z miasta ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G} do swoich w mieście ${n}: wstańcie i idźcie. I poszli.`,
    (G, p, n) => `${cap(p('wezwa'))} ${G} wiernych z miasta ${n} w drogę.`,
  ],
  convert: [
    (G, p, n) => `${cap(p('przemówi'))} ${G} do mieszkańców miasta ${n}, by odstąpili od swego boga.`,
    (G, p, n) => `I ${p('zstąpi')} ${G} do miasta ${n}, by nawracać.`,
    (G, p, n) => `${cap(p('szepta'))} ${G} w mieście ${n}: pójdźcie za mną.`,
  ],
  holy_war: [
    (G, p, n) => `${cap(p('wezwa'))} ${G} swoich do świętej wojny przeciw miastu ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G}: na ${n}. I wyruszyli.`,
    (G, p, n) => `${cap(p('posła'))} ${G} armię swoich wyznawców pod mury miasta ${n}.`,
  ],
  create_avatar: [
    (G, p, n) => `${cap(p('zesła'))} ${G} awatara i ${p('nazwa')} go ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech będzie mi ktoś na świecie. I ${p('zesła')} awatara ${n}.`,
    (G, p, n) => `I ${p('odłama')} ${G} cząstkę siebie, i ${p('posła')} ją na świat jako ${n}.`,
  ],
  command_avatar: [
    (G, p) => `${cap(p('rozkaza'))} ${G} awatarowi.`,
    (G, p) => `I ${p('przemówi')} ${G} do swojego awatara, i ten usłuchał.`,
    (G, p) => `${cap(p('posła'))} ${G} awatara, by czynił wolę bóstwa.`,
  ],
  resurrect_avatar: [
    (G, p, n) => `${cap(p('wskrzesi'))} ${G} awatara ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G} do awatara ${n}: powstań. I powstał.`,
    (G, p, n) => `${cap(p(SIEGNAL))} ${G} w śmierć i ${p('wyprowadzi')} z niej awatara ${n}.`,
  ],
}

const TIER_LINES = {
  strong: ['Sprzyjał temu los.', 'Niebo sprzyjało temu dziełu.', 'I stało się tak, jak chciano.'],
  mixed: ['Zawahał się los.', 'Nie było jasne, czy los temu sprzyja.', 'Stało się, lecz nie do końca tak, jak chciano.'],
  weak: ['Odmówił los.', 'Odwrócił się los od tego dzieła.', 'Nie stało się tak, jak chciano.'],
} as const

// ---------- what the word did to the map ----------
type O = Record<string, unknown>
const num = (o: O, k: string): number => (typeof o[k] === 'number' ? (o[k] as number) : 0)
const str = (o: O, k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '')
const biomeName = (k: string) => BIOME_BY_KEY[k as BiomeKey]?.name.toLowerCase() ?? k
const biomeLoc = (k: string) => BIOME_LOC[k as BiomeKey] ?? ''

/**
 * The sentences the book adds after the opener, from the outcome of the word. The player may keep
 * them, change them or throw them away: whatever stands in `summary` wins.
 */
export function outcomeSentences(l: ActionLog, ctx: VerseContext): string {
  const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
  const god = ctx.god(l.player_id)
  const G = god.name
  const p = pastFor(god.gender)
  const id = l.id
  const parts: string[] = []
  switch (l.action_key) {
    case 'shape_land': {
      const hexes = (Array.isArray(o.hexes) ? o.hexes : []) as O[]
      const toKey = str(o, 'biome') as BiomeKey
      const to = biomeName(toKey)
      const fromKeys = Array.from(new Set(hexes.map((h) => str(h, 'from')).filter((b) => b && b !== toKey))) as BiomeKey[]
      const from = fromKeys.map(biomeName)
      if (hexes.length) {
        parts.push(
          from.length
            ? pick(id + 'o', [`Tam, gdzie ${from.length > 1 ? 'były' : 'była'} ${joinAnd(from)}, rozpostarła się ${to}.`, `I odmieniła się ta kraina: z ${joinAnd(fromKeys.map((k) => BIOME_GEN[k] ?? k))} w ${BIOME_ACC[toKey] ?? to}.`])
            : `I utrwaliła się ${to} na tych ziemiach.`,
        )
      }
      break
    }
    case 'catastrophe': {
      const type = str(o, 'type').toLowerCase()
      const city = str(o, 'city_name')
      const loc = city ? `na ziemie miasta ${city}` : 'na świat'
      if (type) parts.push(pick(id + 'o', [`${cap(type)}: tak nazwano to, co przyszło ${loc}.`, `I spadło ${loc} to, co zwą: ${type}.`]))
      const hits = (Array.isArray(o.hits) ? o.hits : []) as O[]
      const dotsBy = new Map<string, number>()
      const creatures: string[] = []
      const extinct: string[] = []
      const wounded: string[] = []
      const fallen: string[] = []
      for (const h of hits) {
        const t = str(h, 't')
        if (t === 'dot') dotsBy.set(str(h, 'player_id'), (dotsBy.get(str(h, 'player_id')) ?? 0) + 1)
        else if (t === 'creature') (h.extinct ? extinct : creatures).push(str(h, 'name'))
        else if (t === 'avatar') (num(h, 'hp') === 0 ? fallen : wounded).push(str(h, 'name'))
      }
      const lost = Array.from(dotsBy.entries()).map(([pid, n]) => `${followersInWords(n)} bóstwa ${ctx.god(pid).name}`)
      if (lost.length) parts.push(`Zginęło ${joinAnd(lost)}.`)
      if (creatures.length) parts.push(`Przepadły z tej ziemi ${joinAnd(Array.from(new Set(creatures)))}.`)
      if (extinct.length) parts.push(`I wyginęły na zawsze ${joinAnd(extinct)}.`)
      if (wounded.length) parts.push(`Ranny został awatar ${joinAnd(wounded)}.`)
      if (fallen.length) parts.push(`A awatar ${joinAnd(fallen)} padł.`)
      if (o.city_destroyed) parts.push(`I nie zostało z miasta ${city} nic prócz ruin.`)
      if (hits.length === 0) parts.push('Lecz nie było tam nikogo, kto by to odczuł.')
      break
    }
    case 'create_creature':
    case 'create_sapient':
    case 'create_avatar': {
      const loc = biomeLoc(str(o, 'biome'))
      if (loc) parts.push(l.action_key === 'create_avatar' ? `I stanął awatar ${loc}.` : pick(id + 'o', [`Zamieszkały ${loc}.`, `A dom ich był ${loc}.`]))
      break
    }
    case 'change_creature': {
      const from = str(o, 'from_name')
      if (from) parts.push(`Wywiodły się z istot ${from}, lecz nie były już nimi.`)
      break
    }
    case 'migrate': {
      const d = num(o, 'distance')
      parts.push(pick(id + 'o', [`Rozeszły się ${journeyWord(d)} i nie opuściły dawnego domu.`, `I było ich odtąd więcej: ${journeyWord(d)} żyły tak samo.`]))
      break
    }
    case 'create_civilization': {
      const sp = str(o, 'species_name')
      const loc = biomeLoc(str(o, 'biome'))
      if (sp) parts.push(`Wyszedł ten lud z istot ${sp}${loc ? `, ${loc}` : ''}, i pierwsi jego wyznawcy modlili się do ${G}.`)
      break
    }
    case 'develop_civilization': {
      const gift = str(o, 'gift')
      const gained = num(o, 'gained')
      const added = num(o, 'added')
      if (gift) parts.push(`A darem tym było: ${lowerFirst(stripPeriod(gift))}.`)
      if (gained >= 2) parts.push(pick(id + 'o', ['Przyjęli go wyznawcy z radością, i urosło miasto dwakroć.', 'I rozkwitło miasto od tego daru, a wyznawców przybyło dwakroć.']))
      else if (gained === 1) parts.push(pick(id + 'o', ['Przyjęli go, i urosło miasto.', 'I przyjął lud ten dar, i przybyło wyznawców.']))
      else parts.push(pick(id + 'o', ['Lecz nie przyjęli daru, i nic się nie zmieniło.', `Odwrócili się jednak od daru, i ${G} ${p('odesz')} z niczym.`]))
      if (gained > added) parts.push('Miasto było już pełne i nie pomieściło wszystkich.')
      break
    }
    case 'exodus': {
      const n = num(o, 'dots')
      const to = str(o, 'to_name')
      const d = num(o, 'distance')
      const sp = str(o, 'species_name')
      const went = `${cap(followersInWords(n))} ${sp ? `z istot ${sp} ` : ''}${n === 1 ? 'przeszedł' : 'przeszło'} ${journeyWord(d)}`
      parts.push(o.new ? `${went} i ${n === 1 ? 'założył' : 'założyli'} miasto ${to}.` : `${went} i ${n === 1 ? 'dołączył' : 'dołączyli'} do miasta ${to}.`)
      if (o.source_destroyed) parts.push(`A miasto ${str(o, 'from_name')} opustoszało i obróciło się w ruinę.`)
      break
    }
    case 'convert': {
      const def = ctx.god(str(o, 'defender_id')).name
      const k = num(o, 'converted')
      parts.push(`Byli to wyznawcy bóstwa ${def}.`)
      parts.push(k >= 2 ? `I zwróciło się ku ${G} dwóch z nich.` : k === 1 ? `I zwrócił się ku ${G} jeden z nich.` : 'Lecz nikt nie odstąpił od swego boga.')
      break
    }
    case 'holy_war': {
      const def = ctx.god(str(o, 'defender_id')).name
      const diff = num(o, 'diff')
      const army = num(o, 'army')
      const removed = num(o, 'removed')
      const converted = num(o, 'converted')
      const attLost = num(o, 'attacker_lost')
      const defLost = num(o, 'defender_lost')
      parts.push(`Armia liczyła ${followersInWords(army)}, a bronił miasta ${def}.`)
      if (diff >= 3) parts.push(`Zwyciężyła armia w pełni: padło ${followersInWords(removed)} obrońców${converted ? `, a ${followersInWords(converted)} spośród jeńców ${converted === 1 ? 'uwierzył' : 'uwierzyło'} w ${G}` : ''}. I wróciła armia cała.`)
      else if (diff >= 1) parts.push(`Przełamano mury, lecz walka była krwawa: padło ${followersInWords(removed)} obrońców${converted ? `, ${followersInWords(converted)} ${converted === 1 ? 'uwierzył' : 'uwierzyło'} w ${G}` : ''}, a armia straciła ${followersInWords(attLost)}.`)
      else if (diff === 0) parts.push('Nikt nie zwyciężył: obie strony straciły po jednym, i wróciła armia do domu.')
      else if (diff >= -2) parts.push(`Załamał się atak na murach: z całej armii wrócił jeden, a obrońcy stracili ${followersInWords(defLost)}.`)
      else parts.push('Masakra: cała armia legła pod murami i nikt nie wrócił do domu, a miasto zostało nietknięte.')
      if (o.target_destroyed) parts.push(`I nie zostało z miasta ${str(o, 'target_name')} nic prócz ruin.`)
      if (o.source_destroyed) parts.push('A miasto, z którego wyszła armia, opustoszało.')
      break
    }
    case 'command_avatar': {
      const d = num(o, 'distance')
      const name = str(o, 'name')
      if (d > 0) parts.push(`I przeszedł awatar ${name} ${journeyWord(d)}.`)
      break
    }
    case 'resurrect_avatar':
      parts.push(pick(id + 'o', [`${cap(p(WZIAL))} ${G} awatara z objęć śmierci i ${p('postawi')} go na nowo w świecie.`, 'I stanął awatar znów na ziemi, z pełnym tchnieniem.']))
      break
    default:
      break
  }
  return parts.join(' ')
}

/** the entry a chaos_choice row points at */
function chaosEntry(l: ActionLog) {
  const cat = l.roll?.category as ChaosCategoryKey | undefined
  const idx = l.roll?.entry
  if (!cat || !idx) return null
  return CHAOS_BY_KEY[cat]?.entries[idx - 1] ?? null
}

/** the name the opener needs: the thing made, or the city the word touched */
function openerName(l: ActionLog, ent: Entity | undefined): string {
  const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
  switch (l.action_key) {
    case 'develop_civilization':
    case 'catastrophe':
      return str(o, 'city_name') || ent?.name || 'bez imienia'
    case 'exodus':
      return str(o, 'from_name') || 'bez imienia'
    case 'convert':
    case 'holy_war':
      return str(o, 'target_name') || ent?.name || 'bez imienia'
    case 'migrate':
      return str(o, 'name') || ent?.name || 'bez imienia'
    default:
      return ent?.name ?? 'bez imienia'
  }
}

/** One verse of the book for a Chronicle row; an empty string means the row stays out of the book. */
export function chronicleVerse(l: ActionLog, ctx: VerseContext): string {
  const god = ctx.god(l.player_id)
  const G = god.name
  const p = pastFor(god.gender)
  const key = l.action_key
  const action = ACTION_BY_KEY[key as ActionKey]

  if (action) {
    const ent = ctx.entity(l.entity_id)
    const n = openerName(l, ent)
    const kindAcc = ent ? KIND_ACC[ent.kind] : 'cywilizację'
    const whole = isWholeVerse(l.summary, G, ent)
    const parts = whole ? [sentence(l.summary)] : [pick(l.id, OPENERS[action.key])(G, p, n, kindAcc)]
    if (l.summary && !whole) parts.push(sentence(l.summary))
    if (!whole) {
      const told = outcomeSentences(l, ctx)
      if (told) parts.push(told)
    }
    if (l.is_avatar_free_action) parts.push(pick(l.id + 'a', [`${cap(p('uczyni'))} to rękami swojego awatara.`, 'Rękami awatara stało się to na świecie.']))
    return parts.join(' ')
  }

  switch (key) {
    case 'logos_roll':
      return ''
    case 'dice': {
      // a loose table roll ("Rzuć 2k6" from the bar) is not a deed; only a roll made for an action is told
      if (!l.summary || /^rzut 2k6$/i.test(l.summary.trim())) return ''
      const tier = l.roll?.tier
      return tier ? pick(l.id, [...TIER_LINES[tier]]) : ''
    }
    case 'rest':
      return pick(l.id, [
        `${cap(p(ZAMILKL))} ${G} i ${p('odpoczywa')} aż do nowego świtu.`,
        `${cap(p(ODPOCZAL))} ${G} od swoich dzieł.`,
        `Nie ${p('rzek')} ${G} już nic w tych czasach, lecz ${p('zapad')} w sen.`,
      ])
    case 'transfer': {
      // the summary is the receiving god's name (older rows hold a whole sentence)
      if (/ oddaje | przekazuje /.test(l.summary)) return sentence(l.summary)
      const T = l.summary.trim() || 'bez imienia'
      return pick(l.id, [
        `${cap(p('odda'))} ${G} część swej mocy bóstwu ${T}.`,
        `${cap(p('podzieli'))} się ${G} swoimi Słowami z bóstwem ${T}.`,
        `I ${p(ZDJAL)} ${G} ze swych barków część Słów, i ${p('złoży')} je na barki bóstwa ${T}.`,
      ])
    }
    case 'followers_gain':
      return pick(l.id, [`Złożyli wyznawcy daninę, a ${G} ją ${p(PRZYJAL)}.`, `I przynieśli wyznawcy dary, i ${p(PRZYJAL)} je ${G}.`])
    case 'followers_loss':
      return pick(l.id, [`Zawiedli wyznawcy, a ${G} ${p(PONIOSL)} stratę.`, `Nie usłuchali wyznawcy, i ${p('utraci')} ${G} część swej mocy.`])
    case 'contest_declared':
      return ''
    case 'contest_cancelled':
      return pick(l.id, [`${cap(p('cofn'))} ${G} swoje słowo, i nie doszło do starcia.`.replace(cap(p('cofn')), cap(god.gender === 'f' ? 'cofnęła' : god.gender === 'n' ? 'cofnęło' : 'cofnął')), `Lecz ${G} ${p('odwoła')} starcie, nim padły kości.`])
    case 'city_destroyed': {
      const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
      const name = str(o, 'name') || ctx.entity(l.entity_id)?.name || 'bez imienia'
      return pick(l.id, [`I nie zostało z miasta ${name} nic prócz ruin.`, `Opustoszało miasto ${name}, i wiatr chodził po jego ulicach.`])
    }
    case 'cities_grow': {
      const rows = (Array.isArray(l.outcome) ? l.outcome : []) as O[]
      if (rows.length === 0) return ''
      const items = rows.map((r) => `${str(r, 'name')} pod opieką bóstwa ${ctx.god(str(r, 'player_id')).name}`)
      return pick(l.id, [`Z wolna rosły miasta: ${joinAnd(items)}.`, `I przybywało ludzi w miastach: ${joinAnd(items)}.`])
    }
    case 'dots_reward': {
      const rows = ((Array.isArray(l.outcome) ? l.outcome : []) as O[]).filter((r) => num(r, 'logos') > 0).sort((a, b) => num(a, 'rank') - num(b, 'rank'))
      if (rows.length === 0) return ''
      const items = rows.map((r) => `${ctx.god(str(r, 'player_id')).name} (${logosWords(num(r, 'logos'))})`)
      return pick(l.id, [`A wiara śmiertelników była siłą: ${joinAnd(items)}.`, `I spłynęły na bóstwa modlitwy wyznawców: ${joinAnd(items)}.`])
    }
    case 'chaos_reveal':
      return l.roll?.seq && l.roll.seq > 1
        ? ''
        : pick(l.id, ['Zasnęły bóstwa, a świat toczył się sam.', 'Zapadła cisza w niebiosach, a świat toczył się dalej bez bóstw.', 'Gdy bóstwa spały, świat toczył się sam.'])
    case 'chaos_choice': {
      const e = chaosEntry(l)
      if (e) return soften(e.past, l.id)
      const i = l.summary.indexOf(': ')
      return sentence(i >= 0 ? l.summary.slice(i + 2) : l.summary)
    }
    case 'chaos_answer': {
      // "Question? Answer." -> the question's lead, then the answer
      const q = Object.keys(QUESTION_LEADS).find((x) => l.summary.startsWith(`${x} `))
      if (q) return sentence(`${soften(QUESTION_LEADS[q], l.id)} ${lowerFirst(l.summary.slice(q.length + 1).trim())}`)
      const i = l.summary.indexOf('? ')
      return sentence(i >= 0 ? l.summary.slice(i + 2) : l.summary)
    }
    case 'entity_removed': {
      if (/ wymazuje | usuwa /.test(l.summary)) return sentence(l.summary)
      const n = l.summary.trim()
      return pick(l.id, [
        `${cap(p('wymaza'))} ${G} ze świata ${n}, i nie został po tym żaden ślad.`,
        `${cap(p('rzek'))} ${G}: niech ${n} nie będzie. I nie było.`,
      ])
    }
    case 'round_end':
      return pick(l.id, ['Tak minęły te czasy, i zapadły bóstwa w sen.', 'I nastała noc nad światem, a bóstwa spały.', 'Zamknął się ten czas, i ucichły niebiosa.'])
    case 'era_advance': {
      const prev = ERA_NAMES[(l.era - 1) as Era]
      const cur = ERA_NAMES[l.era as Era]
      const story = ERA_STORY[l.era as Era]
      return prev && cur ? `Dobiegła końca ${prev}. Nadeszła ${cur}: ${story}.` : sentence(l.summary)
    }
    case 'game_start':
      return pick(l.id, [
        `Zaczęła się Pierwsza Era: ${ERA_STORY[1]}.`,
        `Nastała Pierwsza Era, ${ERA_STORY[1]}, i spojrzały bóstwa w pustkę, która czekała na pierwsze Słowo.`,
        `I otworzyła się Pierwsza Era, ${ERA_STORY[1]}, a nad bezkształtem unosił się oddech bóstw.`,
      ])
    case 'game_end':
      return 'Wygłosiły bóstwa epilogi, a świat trwał dalej.'
    case 'chaos_notes':
    case 'entity_edit':
      return soften(sentence(l.summary), l.id)
    default:
      return sentence(l.summary)
  }
}

/** The verse the window shows at its end, for the player to keep or rewrite: the row with no summary yet. */
export function composeVerse(l: ActionLog, ctx: VerseContext): string {
  return chronicleVerse({ ...l, summary: '' }, ctx)
}

/** "Pierwsza Era, runda 3" */
export function chapterTitle(era: number, round: number): string {
  return `${ERA_NAMES[era as Era] ?? `Era ${era}`}, runda ${round}`
}

export interface Verse {
  id: string
  text: string
}
export interface Chapter {
  era: number
  round: number
  verses: Verse[]
}

const CHAOS_KEYS = new Set(['chaos_reveal', 'chaos_choice', 'chaos_answer', 'chaos_notes', 'cities_grow', 'dots_reward', 'round_end'])
/** rows that belong to the turn of the god who acted just before them */
const FOLLOW_UP_KEYS = new Set(['dice', 'followers_gain', 'followers_loss', 'entity_edit', 'city_destroyed'])

/**
 * A verse is a turn, so its number means "the n-th thing that happened this round".
 * One god's action with its roll and its consequences is one verse; the whole Chaos phase
 * of a round (the card, whom it concerned, every answer, the end of the round) is one verse.
 */
export function buildChapters(log: ActionLog[], ctx: VerseContext): Chapter[] {
  const chapters: Chapter[] = []
  let chaosVerse: Verse | null = null
  let openTurn: { verse: Verse; playerId: string | null } | null = null
  // the dice are thrown before the deed: a fate line waits for the action of the same god
  let pendingFate: { text: string; playerId: string | null } | null = null

  for (const l of log) {
    if (l.action_key === 'prologue') continue
    const text = chronicleVerse(l, ctx)
    if (!text) continue

    let ch = chapters[chapters.length - 1]
    if (!ch || ch.round !== l.round_number || ch.era !== l.era) {
      ch = { era: l.era, round: l.round_number, verses: [] }
      chapters.push(ch)
      chaosVerse = null
      openTurn = null
      pendingFate = null
    }

    if (CHAOS_KEYS.has(l.action_key)) {
      if (chaosVerse) chaosVerse.text += ` ${text}`
      else {
        chaosVerse = { id: l.id, text }
        ch.verses.push(chaosVerse)
      }
      openTurn = null
      pendingFate = null
      continue
    }

    if (l.action_key === 'dice') {
      // an older flow rolled after the deed: attach to the open turn; otherwise hold it for the deed to come
      if (openTurn && openTurn.playerId === l.player_id) openTurn.verse.text += ` ${text}`
      else pendingFate = { text, playerId: l.player_id }
      continue
    }

    if (FOLLOW_UP_KEYS.has(l.action_key) && openTurn && (openTurn.playerId === l.player_id || l.player_id === null)) {
      openTurn.verse.text += ` ${text}`
      continue
    }

    const isAction = !!ACTION_BY_KEY[l.action_key as ActionKey]
    const fate = isAction && pendingFate && pendingFate.playerId === l.player_id ? ` ${pendingFate.text}` : ''
    pendingFate = null
    const verse = { id: l.id, text: text + fate }
    ch.verses.push(verse)
    openTurn = isAction ? { verse, playerId: l.player_id } : null
  }
  return chapters
}

/** the last verse written, for the quote above the altar */
export function latestVerse(chapters: Chapter[]): Verse | null {
  const ch = chapters[chapters.length - 1]
  return ch?.verses[ch.verses.length - 1] ?? null
}
