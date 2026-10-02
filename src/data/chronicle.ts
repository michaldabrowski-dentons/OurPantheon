// The Chronicle is read like a book of genesis: a relation in the past tense, one verse per turn.
// No costs, no dice numbers, no Logos counts: only what happened and what the gods saw.
// Several phrasings exist for every kind of verse; the log row's id picks one, so every god
// reads the same book. Only some sentences open with "I" or "A", so the book breathes.
import type { ActionLog, Entity, EntityKind, GodGender } from '@/lib/types'
import { ACTION_BY_KEY, ERA_NAMES, type ActionKey, type Era } from './actions'
import { CHAOS_BY_KEY, QUESTION_LEADS, type ChaosCategoryKey } from './chaosTables'

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

/** accusative of each kind: "spotkało to frakcję ..." */
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

// ---------- what the god saw ----------
const REQUIREMENT_PHRASE: Record<string, string> = {
  Szerzyć: 'szerzyli jego słowo',
  Bronić: 'bronili tego, co im wskazano',
  Uciskać: 'uciskali tych, których im wskazano',
  Folgować: 'folgowali sobie w święta',
  Pokutować: 'pokutowali za grzechy',
  'Wstrzymywać się': 'wstrzymywali się od tego, co zakazane',
  Uległość: 'stawiali to bóstwo ponad wszystko',
}

const CONDITION_PAST: Record<string, string> = {
  'Nadmiernie przejmują się sprawami śmiertelników.': 'nadmiernie przejmował się sprawami śmiertelników',
  'Mają nienasycony głód lub pragnienie czegoś.': 'miał nienasycony głód, którego nic nie mogło zaspokoić',
  'Nie mogą wchodzić na gęsto zaludnione obszary.': 'nie mógł wchodzić tam, gdzie mieszkało wielu',
  'Mają wyjątkową słabość na coś przyziemnego, jak srebro, czekolada lub woda.': 'miał słabość na coś zgoła przyziemnego',
  'Są nieożywionym przedmiotem, jak posąg, klejnot, góra.': 'był rzeczą nieożywioną',
  'Są przedmiotem, który trzeba dzierżyć: broń, tarcza, księga, pojazd.': 'był rzeczą, którą trzeba dzierżyć',
  'Są niematerialne: język, baśń lub duch.': 'nie miał ciała',
  'Są śmiertelne i przechodzą przez cykl reinkarnacji.': 'był śmiertelny i wracał w nowych ciałach',
  'Brak im wolnej woli; wykonują wszystko, co każe twórca.': 'nie miał własnej woli i czynił tylko to, co mu kazano',
  'Jest ich wiele (np. anioły).': 'był wieloma naraz',
  'Nie wiedzą, że są Awatarem.': 'nie wiedział, że jest awatarem',
}

/** the sentence(s) after the deed: what the god saw in the thing made or changed */
function seen(id: string, G: string, p: P, ent: Entity | undefined, changed: boolean): string {
  if (!ent) return ''
  const odtad = changed ? ' odtąd' : ''
  const traits = ent.traits.map((t) => t.toLowerCase())
  const parts: string[] = []
  const saw = (were: string, list: string) =>
    pick(id + 's', [
      `I ${p('widzia')} ${G}, że ${were}${odtad} ${list}.`,
      `${cap(p('widzia'))} ${G}, że ${were}${odtad} ${list}, i było to dobre.`,
      `${cap(were)}${odtad} ${list}.`,
    ])
  switch (ent.kind) {
    case 'creature':
      if (traits.length) parts.push(saw('były', joinAnd(traits)))
      break
    case 'civilization': {
      if (traits.length) parts.push(saw('była', joinAnd(traits)))
      const s = ent.specialties.map((x) => x.toLowerCase())
      const f = ent.flaws.map((x) => x.toLowerCase())
      if (s.length && f.length) parts.push(pick(id + 'f', [`Siłą jej było: ${joinAnd(s)}; brakiem zaś: ${joinAnd(f)}.`, `Słynęła z tego: ${joinAnd(s)}. Brakło jej zaś tego: ${joinAnd(f)}.`]))
      else if (s.length) parts.push(`Siłą jej było: ${joinAnd(s)}.`)
      else if (f.length) parts.push(`Brakiem jej było: ${joinAnd(f)}.`)
      break
    }
    case 'faction':
    case 'orthodoxy': {
      const d = ent.desires.map((x) => x.toLowerCase())
      if (traits.length) parts.push(saw('była', joinAnd(traits)))
      if (d.length) parts.push(pick(id + 'd', [`Pragnieniem jej było: ${joinAnd(d)}.`, `A pragnęła tego: ${joinAnd(d)}.`]))
      if (ent.kind === 'orthodoxy' && ent.requirements.length) {
        const req = joinAnd(ent.requirements.map((r) => REQUIREMENT_PHRASE[r] ?? lowerFirst(stripPeriod(r))))
        parts.push(pick(id + 'r', [`${cap(p('zażąda'))} ${G} od wyznawców, by ${req}.`, `Od wyznawców żądał ${G}, by ${req}.`]))
      }
      break
    }
    case 'avatar': {
      const c = ent.conditions.map((x) => CONDITION_PAST[x] ?? lowerFirst(stripPeriod(x)))
      if (c.length) parts.push(pick(id + 'c', [`Awatar ten ${joinAnd(c)}.`, `A awatar ten ${joinAnd(c)}.`]))
      break
    }
  }
  return parts.join(' ')
}

// ---------- the deeds ----------
type Opener = (G: string, p: P, n: string, kindAcc: string) => string

const OPENERS: Record<ActionKey, Opener[]> = {
  shape_land: [
    (G, p) => `I ${p('ukształtowa')} ${G} ląd.`,
    (G, p) => `${cap(p('rzek'))} ${G}: niech będzie ląd. I stało się tak.`,
    (G, p) => `${cap(p('pochyli'))} się ${G} nad światem i ${p('ukształtowa')} ląd.`,
  ],
  change_biome: [
    (G, p) => `${cap(p('odmieni'))} ${G} klimat krainy.`,
    (G, p) => `I ${p(TCHNAL)} ${G} w krainę inne powietrze, i odmienił się jej klimat.`,
    (G, p) => `${cap(p('rzek'))} ${G}: niech kraina ta będzie inna. Stała się inna.`,
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
    (G, p, n) => `${cap(p('przekształci'))} ${G} istoty ${n}.`,
    (G, p, n) => `I ${p(DOTKNAL)} ${G} istot ${n}, i odmieniły się.`,
    (G, p, n) => `${cap(p('rzek'))} ${G} do istot ${n}: bądźcie inne. Stały się inne.`,
  ],
  create_civilization: [
    (G, p, n) => `${cap(p('powoła'))} ${G} lud i ${p('nazwa')} go ${n}.`,
    (G, p, n) => `${cap(p('zebra'))} ${G} istoty rozumne w jeden lud i ${p('nazwa')} go ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G}: niech będzie lud ${n}. I stał się.`,
  ],
  change_civilization: [
    (G, p, n) => `${cap(p('odmieni'))} ${G} lud ${n}.`,
    (G, p, n) => `${cap(p('zstąpi'))} ${G} między lud ${n} i ${p('odmieni')} go.`,
    (G, p, n) => `I ${p('rzek')} ${G} do ludu ${n}: bądźcie inni. I stali się inni.`,
  ],
  create_faction: [
    (G, p, n) => `${cap(p('zawiąza'))} ${G} frakcję i ${p('nazwa')} ją ${n}.`,
    (G, p, n) => `I ${p('zebra')} ${G} ludzi razem, i powstała frakcja ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech ci trzymają się razem. Tak powstała frakcja ${n}.`,
  ],
  create_orthodoxy: [
    (G, p, n) => `${cap(p('założy'))} ${G} religię i ${p('nazwa')} ją ${n}.`,
    (G, p, n) => `I ${p('objawi')} się ${G} ludziom, i powstała religia ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech mnie czczą. Tak powstała religia ${n}.`,
  ],
  change_faction: [
    (G, p, n, k) => `${cap(p('przekształci'))} ${G} ${k} ${n}.`,
    (G, p, n, k) => `I ${p('odmieni')} ${G} ${k} ${n}.`,
    (G, p, n, k) => `${cap(p(TCHNAL))} ${G} nowego ducha w ${k} ${n}.`,
  ],
  command_followers: [
    (G, p) => `${cap(p('objawi'))} się ${G} wyznawcom.`,
    (G, p) => `I ${p('przemówi')} ${G} do swoich wyznawców.`,
    (G, p) => `${cap(p('zstąpi'))} ${G} do wyznawców i ${p('rzek')} im, czego żąda.`,
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

/** the entry a chaos_choice row points at */
function chaosEntry(l: ActionLog) {
  const cat = l.roll?.category as ChaosCategoryKey | undefined
  const idx = l.roll?.entry
  if (!cat || !idx) return null
  return CHAOS_BY_KEY[cat]?.entries[idx - 1] ?? null
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
    const n = ent?.name ?? 'bez imienia'
    const kindAcc = ent ? KIND_ACC[ent.kind] : 'frakcję'
    const parts = [pick(l.id, OPENERS[action.key])(G, p, n, kindAcc)]
    if (l.summary) parts.push(sentence(l.summary))
    const detail = seen(l.id, G, p, ent, action.entityOp === 'update')
    if (detail) parts.push(detail)
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

const CHAOS_KEYS = new Set(['chaos_reveal', 'chaos_choice', 'chaos_answer', 'chaos_notes', 'round_end'])
/** rows that belong to the turn of the god who acted just before them */
const FOLLOW_UP_KEYS = new Set(['dice', 'followers_gain', 'followers_loss', 'entity_edit'])

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

    if (FOLLOW_UP_KEYS.has(l.action_key) && openTurn && openTurn.playerId === l.player_id) {
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
