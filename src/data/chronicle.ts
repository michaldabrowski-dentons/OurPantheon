// The Chronicle is read like a book of genesis: a relation in the past tense, one verse per turn.
// No costs, no Logos counts: only what happened and what the gods saw. Several phrasings exist for
// every kind of verse; the log row's id picks one, so every god reads the same book. Only some
// sentences open with "I" or "A", so the book breathes. Since the map, a row carries `outcome`
// (what the word did to the world) and the book tells it; the player may rewrite the whole verse.
import type { ActionLog, BiomeKey, Entity, EntityKind, GodGender } from '@/lib/types'
import { ACTION_BY_KEY, ERA_NAMES, logActionKey, type ActionKey, type Era } from './actions'
import { CHAOS_BY_KEY, QUESTION_LEADS, type ChaosCategoryKey } from './chaosTables'
import { BIOME_ACC, BIOME_BY_KEY, BIOME_GEN, BIOME_LOC } from './biomes'
import { followersInWords } from './cities'
import { RESOURCE_ACC, temperOf } from './fertility'

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
const CISNAL: Forms = { m: 'cisnął', f: 'cisnęła', n: 'cisnęło' }
const ROZDARL: Forms = { m: 'rozdarł', f: 'rozdarła', n: 'rozdarło' }

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
  lightning: [
    (G, p, n) => `${cap(p(CISNAL))} ${G} grom w ${n}.`,
    (G, p, n) => `I ${p(ROZDARL)} ${G} niebo, i spadł piorun na ${n}.`,
    (G, p, n) => `${cap(p('wskaza'))} ${G} palcem ${n}, i uderzył grom.`,
  ],
  flood: [
    (G, p) => `${cap(p('zesła'))} ${G} potop.`,
    (G, p) => `${cap(p('otworzy'))} ${G} upusty niebios, i przyszły wody.`,
    (G, p) => `I ${p(PODNIOSL)} ${G} morze, i wylało na ląd.`,
  ],
  fire_rain: [
    (G, p) => `${cap(p('zesła'))} ${G} deszcz ognia.`,
    (G, p) => `${cap(p('rozgniewa'))} się ${G} i ${p('zesła')} ogień z nieba.`,
    (G, p) => `I ${p(PODNIOSL)} ${G} rękę na świat, i spadł ogień.`,
  ],
  drought: [
    (G, p) => `${cap(p('zesła'))} ${G} suszę.`,
    (G, p) => `${cap(p('zatrzyma'))} ${G} deszcz, i słońce stanęło nad ziemią.`,
    (G, p) => `I ${p('odwróci')} ${G} chmury, a ziemia spękała.`,
  ],
  plague: [
    (G, p) => `${cap(p('zesła'))} ${G} plagę.`,
    (G, p) => `${cap(p(TCHNAL))} ${G} zarazę w studnie i bagna.`,
    (G, p) => `I ${p(DOTKNAL)} ${G} ziemi, a przyszła choroba.`,
  ],
  great_miracle: [
    (G, p) => `${cap(p('uczyni'))} ${G} Wielki Cud.`,
    (G, p) => `Stało się to, czego nikt nie śmiał wypowiedzieć: ${G} ${p('uczyni')} Wielki Cud.`,
    (G, p) => `I ${p('wypowiedzia')} ${G} Słowo, jakiego świat nie słyszał, i ${p('uczyni')} Wielki Cud.`,
  ],
  bless_land: [
    (G, p) => `I ${p('pobłogosławi')} ${G} ziemię.`,
    (G, p) => `${cap(p('pochyli'))} się ${G} nad polem i ${p('pobłogosławi')} je.`,
    (G, p) => `${cap(p('rzek'))} ${G}: niech ta ziemia rodzi. I rodziła.`,
  ],
  pour_river: [
    (G, p) => `I ${p('wyla')} ${G} rzekę z gór.`,
    (G, p) => `${cap(p('uderzy'))} ${G} w górę, i wytrysnęła z niej rzeka.`,
    (G, p) => `${cap(p('rzek'))} ${G}: niech płynie woda. I popłynęła rzeka.`,
  ],
  create_beast: [
    (G, p, n) => `I ${p('stworzy')} ${G} bestie, i ${p('nazwa')} je ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech powstaną ${n}, i niech polują. I powstały.`,
    (G, p, n) => `${cap(p(TCHNAL))} ${G} głód w świat, i powstały ${n}.`,
  ],
  create_herd: [
    (G, p, n) => `I ${p('stworzy')} ${G} stada, i ${p('nazwa')} je ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech powstaną ${n}, i niech się pasą. I powstały.`,
    (G, p, n) => `${cap(p(TCHNAL))} ${G} życie w świat, i powstały ${n}.`,
  ],
  multiply: [
    (G, p, n) => `${cap(p('pobłogosławi'))} ${G} ${n}, by się mnożyły.`,
    (G, p, n) => `I ${p('rzek')} ${G} do ${n}: rozmnażajcie się. I było ich więcej.`,
    (G, p, n) => `${cap(p('rozbudzi'))} ${G} w ${n} instynkt życia.`,
  ],
  create_sapient: [
    (G, p, n) => `${cap(p('stworzy'))} ${G} istoty rozumne i ${p('nazwa')} je ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G}: niech powstaną ${n}, i niech myślą. I powstały.`,
    (G, p, n) => `I ${p('da')} ${G} światu istoty, które myślą, i ${p('nazwa')} je ${n}.`,
  ],
  change_creature: [
    (G, p, n) => `${cap(p('przekształci'))} ${G} istoty, i stały się ${n}.`,
    (G, p, n) => `I ${p(DOTKNAL)} ${G} istot, i odmieniły się w ${n}.`,
    (G, p, n) => `${cap(p('rzek'))} ${G} do istot: bądźcie inne. I stały się ${n}.`,
  ],
  migrate: [
    (G, p, n) => `${cap(p('posła'))} ${G} ${n} na nowe ziemie.`,
    (G, p, n) => `I ${p('rzek')} ${G} do ${n}: idźcie. I poszły.`,
    (G, p, n) => `${cap(p('otworzy'))} ${G} drogę, i przeszły ${n} dalej w świat.`,
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
  pilgrimage: [
    (G, p, n) => `${cap(p('posła'))} ${G} awatara ${n} na pielgrzymkę.`,
    (G, p, n) => `I ${p('rzek')} ${G} do awatara ${n}: idź. I poszedł.`,
    (G, p, n) => `${cap(p('wyprawi'))} ${G} awatara ${n} w drogę przez świat.`,
  ],
  resurrect_avatar: [
    (G, p, n) => `${cap(p('wskrzesi'))} ${G} awatara ${n}.`,
    (G, p, n) => `I ${p('rzek')} ${G} do awatara ${n}: powstań. I powstał.`,
    (G, p, n) => `${cap(p(SIEGNAL))} ${G} w śmierć i ${p('wyprowadzi')} z niej awatara ${n}.`,
  ],
  avatar_duel: [
    (G, p, n) => `${cap(p('posła'))} ${G} awatara ${n} do walki.`,
    (G, p, n) => `I ${p('rzek')} ${G} do awatara ${n}: uderz. I uderzył.`,
    (G, p, n) => `${cap(p('rozgniewa'))} się ${G} i ${p('posła')} awatara ${n} przeciw cudzemu.`,
  ],
  prophecy: [
    (G, p, n) => `${cap(p('przemówi'))} ${G} ustami awatara ${n}.`,
    (G, p, n) => `I ${p('otworzy')} ${G} usta swojego awatara ${n}, by mówił o tym, co nadejdzie.`,
    (G, p, n) => `${cap(p('zesła'))} ${G} widzenie na awatara ${n}.`,
  ],
}

const TIER_LINES = {
  strong: ['Sprzyjał temu los.', 'Niebo sprzyjało temu dziełu.', 'I stało się tak, jak chciano.'],
  mixed: ['Zawahał się los.', 'Nie było jasne, czy los temu sprzyja.', 'Stało się, lecz nie do końca tak, jak chciano.'],
  weak: ['Odmówił los.', 'Odwrócił się los od tego dzieła.', 'Nie stało się tak, jak chciano.'],
} as const

/** what a failed word leaves behind: nothing, told in the book's own words */
const WEAK_LINES: Partial<Record<ActionKey, string[]>> = {
  lightning: ['Grom uderzył obok i nikogo nie dosięgnął.', 'Piorun chybił, a niebo ucichło.'],
  flood: ['Wody podniosły się i cofnęły, nie czyniąc nic.', 'Zalśniła fala i opadła, a ziemia została sucha.'],
  fire_rain: ['Zebrały się chmury i rozeszły, nie raniąc nikogo.', 'Ogień zgasł w powietrzu, nim dotknął ziemi.'],
  drought: ['Zebrały się chmury nad polem, i spadł deszcz, jak zawsze.', 'Słońce przygrzało i skryło się, a ziemia nie poczuła nic.'],
  plague: ['Zaraza nie chwyciła, a ludzie nawet o niej nie wiedzieli.', 'I nie zachorował nikt.'],
  great_miracle: ['Świat nie drgnął.', 'I nie stało się nic, choć niebo zdawało się słuchać.'],
  create_beast: ['Nie powstało nic, co by polowało.', 'Glina nie przyjęła głodu, i rozsypała się.'],
  create_herd: ['Nie powstało nic, co by się pasło.', 'Trawa została pusta.'],
  create_sapient: ['Materia nie przebudziła się.', 'I nie było w tym tchnieniu dość mocy, by coś pomyślało.'],
  change_creature: ['Istoty pozostały sobą.', 'I nie odmieniły się, choć coś je dotknęło.'],
  multiply: ['Nie przybyło nikogo.', 'Lecz nie było w tym błogosławieństwie życia.'],
  create_civilization: ['Lud nie osiadł.', 'Rozeszli się, nie założywszy niczego.'],
  exodus: ['Nikt nie wyszedł z miasta.', 'Zostali za murami, głusi na wezwanie.'],
  create_avatar: ['Niebo milczało, i nikt nie zstąpił.', 'I nie było komu zstąpić na ziemię.'],
  prophecy: ['Prorok otworzył usta i zamilkł.', 'I nie wyszło z proroka żadne słowo.'],
}

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
  const key = logActionKey(l) ?? l.action_key
  // a word that failed its roll: the Logos is gone and the world is as it was (a blessing still curses the lode)
  if (o.tier === 'weak' && key !== 'bless_land' && key !== 'develop_civilization') {
    return [pick(id + 't', [...TIER_LINES.weak]), pick(id + 'w', WEAK_LINES[key as ActionKey] ?? ['Nic się nie stało, a Słowa przepadły.'])].join(' ')
  }
  switch (key) {
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
      const cuts = (Array.isArray(o.rivers_cut) ? o.rivers_cut : []) as O[]
      if (cuts.some((c) => str(c, 'kind') === 'water' || str(c, 'kind') === 'drowned')) parts.push('I pochłonęła woda rzekę, która tamtędy płynęła.')
      if (cuts.some((c) => str(c, 'kind') === 'mountain')) {
        const rr = o.rerouted && typeof o.rerouted === 'object' ? (o.rerouted as O) : null
        parts.push(rr ? (str(rr, 'mouth_kind') === 'river' ? 'Góra przecięła rzekę, a ta znalazła nowe koryto i wpadła do innej rzeki.' : 'Góra przecięła rzekę, a ta znalazła nowe koryto aż do morza.') : 'Góra przecięła rzekę, i urwała się ona u jej stóp.')
      }
      if (cuts.some((c) => str(c, 'kind') === 'dry')) parts.push('A ujście rzeki wyschło, bo nie było już tam wody.')
      break
    }
    case 'bless_land': {
      const res = str(o, 'resource')
      const loc = biomeLoc(str(o, 'biome'))
      parts.push(pick(id + 'o', [`I zrodziła ta ziemia${loc ? `, ${loc},` : ''} ${RESOURCE_ACC[res] ?? 'dary'}.`, `I było odtąd ${loc ? `${loc} ` : ''}${RESOURCE_ACC[res] ?? 'dobro'}, i ziemia stała się żyźniejsza.`]))
      break
    }
    case 'pour_river': {
      const biomes = (Array.isArray(o.biomes) ? o.biomes : []) as string[]
      const through = Array.from(new Set(biomes.slice(1))).map((b) => BIOME_ACC[b as BiomeKey] ?? b)
      const len = num(o, 'length')
      const kind = str(o, 'mouth_kind')
      const end = kind === 'river' ? 'aż złączyła się z inną rzeką' : 'aż wpadła do morza'
      parts.push(through.length ? `Płynęła ${journeyWord(len)}, przez ${joinAnd(through)}, ${end}.` : `Płynęła ${journeyWord(len)}, ${end}.`)
      if (biomes.some((b) => b === 'pustynia')) parts.push('A pustynia przy jej brzegach rozkwitła.')
      break
    }
    case 'fire_rain':
    case 'flood': {
      // old Kataklizm rows carry the kind the god named; the new words name themselves
      const type = str(o, 'type').toLowerCase()
      const city = str(o, 'city_name')
      const loc = city ? `na ziemie miasta ${city}` : 'na tę ziemię'
      if (type) parts.push(pick(id + 'o', [`${cap(type)}: tak nazwano to, co przyszło ${loc}.`, `I spadło ${loc} to, co zwą: ${type}.`]))
      else if (key === 'flood' && o.drowned) parts.push(pick(id + 'o', [`Podniosły się wody ${loc} i nie opadły już nigdy.`, `I zalało morze tę ziemię${city ? ` razem z miastem ${city}` : ''}.`]))
      else if (key === 'flood' && num(o, 'damage') > 0) parts.push(pick(id + 'o', [`Wezbrały wody ${loc} i porwały, co napotkały, a potem opadły.`, `Fala przeszła ${loc} i cofnęła się.`]))
      else if (key === 'fire_rain' && num(o, 'damage') > 0) parts.push(pick(id + 'o', [`Spadł ogień z nieba ${loc}.`, `I płonęło niebo ${loc}.`]))
      const hits = (Array.isArray(o.hits) ? o.hits : []) as O[]
      const dotsBy = new Map<string, number>()
      const creatures: string[] = []
      const extinct: string[] = []
      const wounded: string[] = []
      const fallen: string[] = []
      for (const h of hits) {
        const t = str(h, 't')
        if (t === 'dot') dotsBy.set(str(h, 'player_id'), (dotsBy.get(str(h, 'player_id')) ?? 0) + 1)
        else if (t === 'dots') dotsBy.set(str(h, 'player_id'), (dotsBy.get(str(h, 'player_id')) ?? 0) + num(h, 'n'))
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
      if (hits.length === 0 && num(o, 'damage') > 0) parts.push('Lecz nie było tam nikogo, kto by to odczuł.')
      const after = str(o, 'biome_after')
      if (after) parts.push(`I nie został tam kamień na kamieniu: ziemia stała się ${after === 'woda' ? 'wodą' : after === 'pustynia' ? 'pustynią' : 'jałowym ugorem'}.`)
      break
    }
    case 'lightning': {
      const who = `${str(o, 'emoji') ? `${str(o, 'emoji')} ` : ''}${str(o, 'name')}`
      if (!o.hit) parts.push(pick(id + 'o', [`Grom uderzył obok ${who} i nikogo nie dosięgnął.`, `Zadrżało niebo, lecz ${who} ${str(o, 'role') === 'avatar' ? 'stał' : 'stały'} dalej.`]))
      else if (str(o, 'role') === 'avatar') parts.push(o.killed ? `I padł awatar ${who} spalony gromem, i nie było go więcej na ziemi.` : `Ranny został awatar ${who}: ${num(o, 'damage') === 1 ? 'jedno życie' : 'dwa życia'} odebrał mu grom.`)
      else parts.push(o.extinct ? `I wyginęły ${who} na zawsze, spalone jednym gromem.` : `Przepadły z tej ziemi ${who}, spalone gromem.`)
      break
    }
    case 'drought': {
      const city = str(o, 'city_name')
      const nights = num(o, 'rounds')
      if (nights > 0) parts.push(pick(id + 'o', [`Spękała ziemia${city ? ` wokół miasta ${city}` : ''} i nie rodziła nic przez ${nights === 2 ? 'dwie noce' : 'trzy noce'}.`, `Słońce stanęło nad tą ziemią${city ? `, nad miastem ${city},` : ''} i nie zeszło przez ${nights === 2 ? 'dwie noce' : 'trzy noce'}.`]))
      break
    }
    case 'plague': {
      const city = str(o, 'city_name')
      const nights = num(o, 'rounds')
      if (nights > 0) parts.push(pick(id + 'o', [`Przyszła zaraza ${city ? `do miasta ${city}` : 'na tę ziemię'} i zbierała żniwo przez ${nights === 1 ? 'jedną noc' : 'dwie noce'}.`, `I chorowali ${city ? `w mieście ${city}` : 'na tej ziemi'}, a śmierć chodziła między nimi przez ${nights === 1 ? 'jedną noc' : 'dwie noce'}.`]))
      break
    }
    case 'create_beast':
    case 'create_herd':
    case 'create_sapient':
    case 'create_avatar': {
      const loc = biomeLoc(str(o, 'biome'))
      if (loc) parts.push(key === 'create_avatar' ? `I stanął awatar ${loc}.` : pick(id + 'o', [`Zamieszkały ${loc}.`, `A dom ich był ${loc}.`]))
      if (str(o, 'role') === 'beast') parts.push(pick(id + 'b', [`Były to bestie ${temperOf(num(o, 'strength'))}, i polowały.`, `A były ${temperOf(num(o, 'strength'))} i głodne, i nikt nie był przy nich bezpieczny.`]))
      else if (str(o, 'role') === 'herbivore') parts.push(num(o, 'strength') > 0 ? pick(id + 'b', ['Były to stada łagodne, i pasły się.', 'A pasły się spokojnie, i ziemia była przy nich żyźniejsza.']) : 'Były to stada dzikie, i pasły się, gdzie chciały.')
      if (key === 'create_sapient' && Array.isArray(o.copies) && o.copies.length > 0) parts.push('A było ich tak wielu, że zajęli i ziemię obok.')
      if (key === 'create_avatar' && o.tier === 'mixed') parts.push('Zstąpił ranny, i musiał odpocząć, nim stanął w pełni sił.')
      break
    }
    case 'change_creature': {
      const from = str(o, 'from_name')
      const to = str(o, 'name')
      if (from && to && from !== to) parts.push(`Dotąd zwano je ${from}; odtąd były ${to}.`)
      if (o.tier === 'strong' && num(o, 'strength') > num(o, 'from_strength')) parts.push('I były silniejsze niż dotąd.')
      break
    }
    case 'migrate': {
      const d = num(o, 'distance')
      const fight = o.fight && typeof o.fight === 'object' ? (o.fight as O) : null
      if (fight) {
        const R = (fight.right ?? {}) as O
        const dName = `${str(R, 'emoji') ? `${str(R, 'emoji')} ` : ''}${str(R, 'label')}`
        const res = str(fight, 'result')
        if (str(fight, 'scene') === 'beast_city') {
          const lost = ((Array.isArray(fight.city_lost) ? fight.city_lost : []) as O[]).reduce((n, g) => n + num(g, 'n'), 0)
          if (res === 'city_hit') parts.push(`Poszły ${journeyWord(d)} i napadły na miasto ${dName}, i ${lost === 1 ? 'zginął jeden z jego mieszkańców' : `zginęło ${followersInWords(lost)}`}.${fight.city_destroyed ? ` I nie zostało z miasta ${dName} nic prócz ruin.` : ''}`)
          else if (res === 'return') parts.push(`Poszły ${journeyWord(d)} i napadły na miasto ${dName}, lecz mury wytrzymały.`)
          else parts.push(`Poszły ${journeyWord(d)} i napadły na miasto ${dName}, lecz lud je ${res === 'eaten' ? 'wybił' : 'odpędził'}.`)
        } else if (res === 'eaten' && str(fight, 'loser') === 'right') parts.push(`Poszły ${journeyWord(d)}, rzuciły się na ${dName} i ${fight.extinct ? 'pożarły je do ostatniego' : 'pożarły je'}, i zajęły ich ziemię.`)
        else if (res === 'eaten') parts.push(`Poszły ${journeyWord(d)} i rzuciły się na ${dName}, lecz te ${fight.extinct ? 'starły je z ziemi' : 'rozszarpały napastnika'}.`)
        else if (str(fight, 'loser') === 'right') parts.push(`Poszły ${journeyWord(d)} i napadły na ${dName}, a te uciekły${res === 'fled_nowhere' ? ' i zginęły, nie mając gdzie' : ' na sąsiednie ziemie'}; napastnicy zajęli ich ziemię.`)
        else if (res === 'return') parts.push(`Poszły ${journeyWord(d)} i stanęły przeciw ${dName}, lecz nikt nie ustąpił, i wróciły.`)
        else parts.push(`Poszły ${journeyWord(d)} i napadły na ${dName}, lecz zostały odparte i uciekły${res === 'fled_nowhere' ? ', nie mając gdzie: zginęły' : ''}.`)
      } else parts.push(pick(id + 'o', [`Przeszły ${journeyWord(d)} i nie wróciły do dawnego domu.`, `Opuściły swoją ziemię i poszły ${journeyWord(d)}.`]))
      break
    }
    case 'multiply': {
      parts.push(pick(id + 'o', ['I zajęły pole obok.', 'A było ich więcej, i poszły na sąsiednią ziemię.']))
      if (o.weakened) parts.push(pick(id + 'w', ['Lecz pomiot był słabszy od rodziców, i cały ród osłabł.', 'A że rodziły się w pośpiechu, cały ich ród stracił na sile.']))
      break
    }
    case 'create_civilization': {
      const sp = str(o, 'species_name')
      const loc = biomeLoc(str(o, 'biome'))
      if (sp) parts.push(`Wyszedł ten lud z istot ${sp}${loc ? `, ${loc}` : ''}, i pierwsi jego wyznawcy modlili się do ${G}.`)
      if (num(o, 'gained') >= 2) parts.push('A było ich od początku wielu.')
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
      if (num(o, 'converted_atheists') > 0) parts.push(num(o, 'converted_atheists') === 1 ? 'Pierwszy uwierzył ten, który nie miał boga.' : 'Pierwsi uwierzyli ci, którzy nie mieli boga.')
      break
    }
    case 'exodus': {
      const n = num(o, 'dots')
      const to = str(o, 'to_name')
      const d = num(o, 'distance')
      const sp = str(o, 'species_name')
      const went = `${cap(followersInWords(n))} ${sp ? `z istot ${sp} ` : ''}${n === 1 ? 'przeszedł' : 'przeszło'} ${journeyWord(d)}`
      parts.push(o.new ? `${went} i ${n === 1 ? 'założył' : 'założyli'} miasto ${to}.` : `${went} i ${n === 1 ? 'dołączył' : 'dołączyli'} do miasta ${to}.`)
      if (num(o, 'lost') > 0) parts.push('Jeden z nich nie dotarł: droga wzięła go sobie.')
      if (o.source_destroyed) parts.push(`A miasto ${str(o, 'from_name')} opustoszało i obróciło się w ruinę.`)
      if (o.avatar_moved) parts.push(`A prowadził ich awatar ${str(o, 'avatar_emoji') ? `${str(o, 'avatar_emoji')} ` : ''}${str(o, 'avatar_name')}, i poszedł z nimi.`)
      break
    }
    case 'convert': {
      const def = ctx.god(str(o, 'defender_id')).name
      const k = num(o, 'converted')
      const fromA = num(o, 'from_atheists')
      parts.push(`Byli to wyznawcy bóstwa ${def}.`)
      parts.push(k >= 2 ? `I zwróciło się ku ${G} dwóch z nich.` : k === 1 ? `I zwrócił się ku ${G} jeden z nich.` : 'Lecz nikt nie odstąpił od swego boga.')
      if (fromA > 0) parts.push(fromA === 1 ? 'Jeden z nich nie miał dotąd boga.' : 'Ci nie mieli dotąd boga.')
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
      const fell = removed === 0 ? 'nikt z obrońców nie padł' : removed === 1 ? 'padł jeden wyznawca obrońców' : `padło ${followersInWords(removed)} obrońców`
      if (o.pending) parts.push(`Zwyciężyła armia${diff >= 3 ? ' w pełni' : ', choć krwawo'}, a gdzie spadną jej ciosy, rozstrzyga jeszcze ${G}.`)
      else if (diff >= 3) parts.push(`Zwyciężyła armia w pełni: ${fell}${converted ? `, a ${followersInWords(converted)} spośród jeńców ${converted === 1 ? 'uwierzył' : 'uwierzyło'} w ${G}` : ''}. I wróciła armia cała.`)
      else if (diff >= 1) parts.push(`Przełamano mury, lecz walka była krwawa: ${fell}${converted ? `, ${followersInWords(converted)} ${converted === 1 ? 'uwierzył' : 'uwierzyło'} w ${G}` : ''}, a armia straciła ${followersInWords(attLost)}.`)
      else if (diff === 0) parts.push('Nikt nie zwyciężył: obie strony straciły po jednym, i wróciła armia do domu.')
      else if (diff >= -2) parts.push(`Załamał się atak na murach: z całej armii wrócił jeden, a obrońcy stracili ${followersInWords(defLost)}.`)
      else parts.push('Masakra: cała armia legła pod murami i nikt nie wrócił do domu, a miasto zostało nietknięte.')
      const wounds = num(o, 'avatar_wounds')
      if (wounds > 0) parts.push(o.avatar_dead ? `Dosięgła armia awatara ${str(o, 'avatar_name')}, i padł.` : `Dosięgła armia awatara ${str(o, 'avatar_name')} i zadała mu rany.`)
      const killed = (Array.isArray(o.creatures_killed) ? o.creatures_killed : []) as O[]
      if (killed.length) parts.push(`Wycięto też ${joinAnd(killed.map((k) => `${str(k, 'emoji') ? `${str(k, 'emoji')} ` : ''}${str(k, 'name')}`))}.`)
      if (o.target_destroyed) parts.push(`I nie zostało z miasta ${str(o, 'target_name')} nic prócz ruin.`)
      if (o.source_destroyed) parts.push('A miasto, z którego wyszła armia, opustoszało.')
      const general = `${str(o, 'attacker_avatar_emoji') ? `${str(o, 'attacker_avatar_emoji')} ` : ''}${str(o, 'attacker_avatar_name')}`
      if (str(o, 'attacker_avatar_name')) {
        if (o.attacker_avatar_to) parts.push(`A awatar ${general}, który prowadził armię, wszedł do zdobytego miasta.`)
        else if (num(o, 'attacker_avatar_wound') > 0) parts.push(o.attacker_avatar_dead ? `A awatar ${general}, który prowadził armię, padł w tej klęsce.` : `A awatar ${general}, który prowadził armię, wrócił ranny.`)
      }
      break
    }
    case 'pilgrimage': {
      const d = num(o, 'distance')
      const name = `${str(o, 'emoji') ? `${str(o, 'emoji')} ` : ''}${str(o, 'name')}`
      if (d > 0) parts.push(`I przeszedł awatar ${name} ${journeyWord(d)}, i stanął na nowej ziemi.`)
      break
    }
    case 'resurrect_avatar':
      parts.push(pick(id + 'o', [`${cap(p(WZIAL))} ${G} awatara z objęć śmierci i ${p('postawi')} go na nowo w świecie.`, 'I stanął awatar znów na ziemi, z pełnym tchnieniem.']))
      break
    case 'prophecy': {
      const av = `${str(o, 'emoji') ? `${str(o, 'emoji')} ` : ''}${str(o, 'avatar_name')}`
      const text = stripPeriod(str(o, 'text'))
      if (text) parts.push(`Prorok ${av} zapowiedział, że: ${lowerFirst(text)}.`)
      if (num(o, 'hold') >= 2) parts.push('A słowa te miały ciężar, jakiego dawno nie słyszano.')
      break
    }
    case 'great_miracle': {
      if (o.with_price) parts.push(pick(id + 'o', ['Lecz cud ten miał swoją cenę.', 'A świat zapłacił za ten cud, choć nie od razu było widać czym.']))
      break
    }
    case 'avatar_duel': {
      const a = `${str(o, 'attacker_emoji') ? `${str(o, 'attacker_emoji')} ` : ''}${str(o, 'attacker_avatar')}`
      const d = `${str(o, 'defender_emoji') ? `${str(o, 'defender_emoji')} ` : ''}${str(o, 'defender_avatar')}`
      const diff = num(o, 'diff')
      const aLoss = num(o, 'attacker_loss')
      const dLoss = num(o, 'defender_loss')
      parts.push(`Stanął ${a} przeciw ${d}.`)
      if (diff >= 3) parts.push(`Zdominował go: ${d} ${dLoss === 1 ? 'odniósł ranę' : 'odniósł ciężkie rany'}, a ${a} wyszedł bez szwanku.`)
      else if (diff >= 1) parts.push(`Walka była krwawa: ${d} odniósł ranę, lecz i ${a} krwawił.`)
      else if (diff === 0) parts.push('Nikt nie zwyciężył: obaj odnieśli ciężkie rany.')
      else if (diff >= -2) parts.push(`${cap(d)} odparł cios i ranił ${a}.`)
      else parts.push(`${cap(d)} zmiażdżył napastnika: ${a} ledwie uszedł z życiem.`)
      if (o.defender_dead) parts.push(`I padł ${d}, i nie było go więcej na ziemi.`)
      if (o.attacker_dead) parts.push(`I padł ${a}, i nie było go więcej na ziemi.`)
      void aLoss
      break
    }
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
  switch (logActionKey(l) ?? l.action_key) {
    case 'develop_civilization':
    case 'flood':
    case 'fire_rain':
    case 'drought':
    case 'plague':
      return str(o, 'city_name') || ent?.name || 'bez imienia'
    case 'lightning':
      return `${str(o, 'emoji') ? `${str(o, 'emoji')} ` : ''}${str(o, 'name') || ent?.name || 'bez imienia'}`
    case 'exodus':
      return str(o, 'from_name') || 'bez imienia'
    case 'convert':
    case 'holy_war':
      return str(o, 'target_name') || ent?.name || 'bez imienia'
    case 'migrate':
    case 'multiply':
      return str(o, 'name') || ent?.name || 'bez imienia'
    case 'prophecy':
      return str(o, 'avatar_name') || ent?.name || 'bez imienia'
    case 'avatar_duel':
      return str(o, 'attacker_avatar') || ent?.name || 'bez imienia'
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
  const actionKey = logActionKey(l)
  const action = actionKey ? ACTION_BY_KEY[actionKey] : undefined

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
    if (l.is_avatar_free_action && key !== 'pilgrimage') parts.push(pick(l.id + 'a', [`${cap(p('uczyni'))} to rękami swojego awatara.`, 'Rękami awatara stało się to na świecie.']))
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
    case 'prophecy_fulfilled': {
      const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
      const av = `${str(o, 'emoji') ? `${str(o, 'emoji')} ` : ''}${str(o, 'avatar_name')}`
      return `Słowa proroka ${av} stały się ciałem: ${lowerFirst(stripPeriod(str(o, 'text')))}.`
    }
    case 'avatars_heal': {
      const rows = (Array.isArray(l.outcome) ? l.outcome : []) as O[]
      if (rows.length === 0) return ''
      const names = rows.map((r) => `${str(r, 'emoji') ? `${str(r, 'emoji')} ` : ''}${str(r, 'name')}`)
      return pick(l.id, [`We śnie zabliźniły się rany: ${joinAnd(names)}.`, `I odpoczęły awatary, a ich rany się zamknęły: ${joinAnd(names)}.`])
    }
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
    case 'night_begin':
    case 'night_move':
    case 'night_fight':
    case 'night_city':
    case 'night_city_founded':
    case 'night_plague':
    case 'night_drought':
      return ''
    default:
      return sentence(l.summary)
  }
}

const NIGHT_KEYS = new Set(['night_begin', 'night_move', 'night_fight', 'night_city', 'night_city_founded', 'night_plague', 'night_drought'])

const thing = (o: O, emojiKey = 'emoji', nameKey = 'name') => `${str(o, emojiKey) ? `${str(o, emojiKey)} ` : ''}${str(o, nameKey)}`.trim()

/**
 * The night of Chaos as one verse: the world lived its own life. Only what mattered is told
 * (births, fights, cities), the wanderings in one breath. No digits, no fields.
 */
export function nightVerse(rows: ActionLog[], ctx: VerseContext): string {
  const first = rows[0]
  if (!first) return ''
  const parts: string[] = [pick(first.id, ['I zapadła noc, a świat żył własnym życiem.', 'Spały bóstwa, a pod gwiazdami świat szedł swoją drogą.', 'I przyszła noc, w której nikt nie rzekł Słowa, a jednak wiele się stało.'])]
  const born: string[] = []
  const wandered = new Set<string>()
  const grew: string[] = []
  const settled: string[] = []
  const died: string[] = []
  const starved: string[] = []
  for (const l of rows) {
    const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as O
    switch (l.action_key) {
      case 'night_move': {
        const res = str(o, 'result')
        const name = thing(o)
        if (res === 'reproduce' || res === 'pack' || res === 'split') born.push(name)
        else if (res === 'die') died.push(name)
        else if (res === 'mutation' && str(o, 'mutation_name')) parts.push(`${str(o, 'unit') === 'tribe' ? 'Z ludu' : 'Z'} ${name} ${str(o, 'unit') === 'tribe' ? 'narodził się nowy lud' : 'wziął się nowy rodzaj'}: ${str(o, 'mutation_emoji') ? `${str(o, 'mutation_emoji')} ` : ''}${str(o, 'mutation_name')}.`)
        else if (['move', 'move_best', 'hunt', 'hunting', 'wander', 'graze_best', 'explore', 'promised'].includes(res)) wandered.add(name)
        break
      }
      case 'night_fight': {
        const L = (o.left ?? {}) as O
        const R = (o.right ?? {}) as O
        const a = thing(L, 'emoji', 'label')
        const d = thing(R, 'emoji', 'label')
        const res = str(o, 'result')
        const scene = str(o, 'scene')
        if (scene === 'creature') {
          if (res === 'eaten' && str(o, 'loser') === 'right') parts.push(`Rzuciły się ${a} na ${d} i ${o.extinct ? 'pożarły je do ostatniego' : 'pożarły je'}.`)
          else if (res === 'eaten') parts.push(`Rzuciły się ${a} na ${d}, lecz ${d} ${o.extinct ? 'starły je z ziemi' : 'rozszarpały napastnika'}.`)
          else if (res === 'flee' && str(o, 'loser') === 'right') parts.push(`Napadły ${a} na ${d}, a te uciekły na sąsiednie ziemie.`)
          else if (res === 'flee' || res === 'fled_nowhere' || res === 'vanished') parts.push(`Napadły ${a} na ${d}, lecz zostały odparte i uciekły.`)
          else parts.push(`Stanęły ${a} przeciw ${d}, i nikt nie ustąpił.`)
        } else if (scene === 'beast_city') {
          const lost = ((Array.isArray(o.city_lost) ? o.city_lost : []) as O[]).reduce((n, g) => n + num(g, 'n'), 0)
          if (res === 'city_hit') parts.push(`Napadły ${a} na miasto ${d}, i ${lost === 1 ? 'zginął jeden z jego mieszkańców' : `zginęło ${followersInWords(lost)}`}.${o.city_destroyed ? ` I nie zostało z miasta ${d} nic prócz ruin.` : ''}`)
          else if (res === 'return') parts.push(`Napadły ${a} na miasto ${d}, lecz mury wytrzymały.`)
          else parts.push(`Napadły ${a} na miasto ${d}, lecz lud je odpędził${res === 'eaten' ? ' i wybił' : ''}.`)
        } else if (scene === 'beast_avatar') {
          if (res === 'avatar_hit') parts.push(`Napadły ${a} na awatara ${d} i ${num(o, 'avatar_hp') === 0 ? 'zabiły go' : 'raniły go'}.`)
          else parts.push(`Napadły ${a} na awatara ${d}, lecz ten je odparł.`)
        } else {
          const n = ((Array.isArray(o.groups_settled) ? o.groups_settled : []) as O[]).reduce((k, g) => k + num(g, 'n'), 0)
          const dead = ((Array.isArray(o.groups_dead) ? o.groups_dead : []) as O[]).reduce((k, g) => k + num(g, 'n'), 0)
          if (res === 'founded') parts.push(`Wyszli ${a.toLowerCase()} przeciw ${d}, pokonali je${dead ? `, choć ${followersInWords(dead)} legło` : ''}, i osiedli na tej ziemi.`)
          else if (res === 'joined') parts.push(`Wyszli ${a.toLowerCase()} na miasto ${d} i zdobyli je${dead ? `, choć ${followersInWords(dead)} legło` : ''}; ${n === 1 ? 'jeden' : followersInWords(n).split(' ')[0]} zamieszkał w nim.`)
          else if (res === 'returned') parts.push(`Wyszli ${a.toLowerCase()} na ${d}, lecz wrócili do domu${dead ? ` bez ${followersInWords(dead)}` : ''}.`)
          else parts.push(`Wyszli ${a.toLowerCase()} na ${d}, i nikt z nich nie wrócił.`)
        }
        break
      }
      case 'night_city': {
        const res = str(o, 'result')
        const name = str(o, 'name')
        if (res === 'grow' || res === 'bloom') grew.push(name)
        else if (res === 'famine') starved.push(`${name}${o.source_destroyed ? ' (i nie zostało z niego nic prócz ruin)' : ''}`)
        else if ((res === 'exodus' || res === 'colony') && str(o, 'target_kind') === 'found') {
          const n = ((Array.isArray(o.groups) ? o.groups : []) as O[]).reduce((k, g) => k + num(g, 'n'), 0)
          const newName = ctx.entity(str(o, 'new_city_id'))?.name ?? 'bez imienia'
          parts.push(`Zabrakło chleba w mieście ${name}: ${followersInWords(n)} ${n === 1 ? 'wyszedł' : 'wyszło'} w drogę i ${n === 1 ? 'założył' : 'założyło'} miasto ${newName}.${o.source_destroyed ? ` A ${name} opustoszało.` : ''}`)
        } else if (res === 'stay' && num(o, 'overflow') > 0) parts.push(`Głód zajrzał do miasta ${name}, lecz nie było dokąd pójść.`)
        break
      }
      case 'night_city_founded': {
        if (str(o, 'by') === 'tribe') settled.push(`${thing(o, 'emoji', 'species_name')} osiadły i założyły miasto ${ctx.entity(str(o, 'city_id'))?.name ?? str(o, 'name')}`)
        break
      }
      case 'night_plague': {
        const lost = ((Array.isArray(o.lost) ? o.lost : []) as O[]).reduce((n, g) => n + num(g, 'n'), 0)
        const killed = o.killed && typeof o.killed === 'object' ? (o.killed as O) : null
        if (str(o, 'name') && lost > 0) parts.push(`Zaraza zabrała w mieście ${str(o, 'name')} ${followersInWords(lost)}.${o.city_destroyed ? ` I nie zostało z miasta ${str(o, 'name')} nic prócz ruin.` : ''}`)
        else if (killed) parts.push(`Zaraza wybiła ${thing(killed)}${killed.extinct ? ', i nie było ich więcej' : ''}.`)
        break
      }
      case 'night_drought': {
        const killed = o.killed && typeof o.killed === 'object' ? (o.killed as O) : null
        if (killed) parts.push(`Susza wygubiła ${thing(killed)}${killed.extinct ? ', i wyginęły na zawsze' : ''}.`)
        break
      }
      default:
        break
    }
  }
  if (born.length) parts.push(`Rozmnożyły się ${joinAnd(Array.from(new Set(born)))}.`)
  if (died.length) parts.push(`Wymarły ${joinAnd(Array.from(new Set(died)))}.`)
  if (starved.length) parts.push(`Głód i zaraza nawiedziły ${starved.length === 1 ? 'miasto' : 'miasta'} ${joinAnd(starved)}.`)
  if (settled.length) parts.push(`A ${joinAnd(settled)}.`)
  if (grew.length) parts.push(`Rosły miasta: ${joinAnd(Array.from(new Set(grew)))}.`)
  if (wandered.size) parts.push(pick(first.id + 'w', [`A ${joinAnd(Array.from(wandered))} wędrowały po ziemi.`, `Stada i bestie szły za trawą i za krwią: ${joinAnd(Array.from(wandered))}.`]))
  return parts.join(' ')
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

const CHAOS_KEYS = new Set(['chaos_reveal', 'chaos_choice', 'chaos_answer', 'chaos_notes', 'cities_grow', 'avatars_heal', 'dots_reward', 'round_end'])
/** rows that belong to the turn of the god who acted just before them */
const FOLLOW_UP_KEYS = new Set(['dice', 'followers_gain', 'followers_loss', 'entity_edit', 'city_destroyed', 'prophecy_fulfilled'])

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
  // the night is told as one verse once all its rows are in
  let nightRows: ActionLog[] = []
  let nightVerseRef: Verse | null = null

  for (const l of log) {
    if (l.action_key === 'prologue') continue
    const isNight = NIGHT_KEYS.has(l.action_key)
    const text = isNight ? '' : chronicleVerse(l, ctx)
    if (!text && !isNight) continue

    let ch = chapters[chapters.length - 1]
    if (!ch || ch.round !== l.round_number || ch.era !== l.era) {
      ch = { era: l.era, round: l.round_number, verses: [] }
      chapters.push(ch)
      chaosVerse = null
      openTurn = null
      pendingFate = null
      nightRows = []
      nightVerseRef = null
    }

    if (isNight) {
      nightRows.push(l)
      if (!nightVerseRef) {
        nightVerseRef = { id: l.id, text: '' }
        ch.verses.push(nightVerseRef)
      }
      nightVerseRef.text = nightVerse(nightRows, ctx)
      openTurn = null
      pendingFate = null
      continue
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

    const isAction = !!logActionKey(l)
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
