// The words of O BOGOWIE!, grouped the way the table wants them. Costs are per Era: [I, II, III].
// Keys match action_cost() in supabase/migrations/0024_cataclysms_avatar_words.sql. Most words act on the map.
// Two groups: the words of the sky (AKCJE BOSKIE) and the words of the avatar (AKCJE AWATARA), which need
// the god's avatar standing on the map and are spoken from where it stands.
import type { ActionLog, AttrKey, Entity, Player } from '@/lib/types'
import type { WorldView } from '@/lib/world'
import { SAPIENT_TRAITS } from './traits'
import { isMountain } from './fertility'
import { hexDistance, neighbours } from '@/lib/hex'

export type ActionKey =
  | 'shape_land'
  | 'bless_land'
  | 'pour_river'
  | 'lightning'
  | 'flood'
  | 'fire_rain'
  | 'drought'
  | 'plague'
  | 'create_beast'
  | 'create_herd'
  | 'create_sapient'
  | 'migrate'
  | 'multiply'
  | 'change_creature'
  | 'create_civilization'
  | 'great_miracle'
  | 'create_avatar'
  | 'resurrect_avatar'
  | 'pilgrimage'
  | 'develop_civilization'
  | 'convert'
  | 'exodus'
  | 'holy_war'
  | 'prophecy'
  | 'avatar_duel'

export type Era = 1 | 2 | 3
export type ActionGroupKey = 'divine' | 'avatar'
export type ActionCategoryKey = 'terraform' | 'cataclysm' | 'life' | 'pantheon' | 'descent' | 'avatar'

/** how far the avatar reaches: the fields its words, its duels and its exoduses may begin on */
export const AVATAR_REACH = 2

/** the steps of a word's window, in order; 'map' hands the choice to the map; 'roll' ends a rolled word with two tiles */
export type FlowStep = 'map' | 'form' | 'confirm' | 'roll'

export interface TierText {
  strong: string // 10+
  mixed: string // 7–9
  weak: string // 6−
}
export type Tier = 'strong' | 'mixed' | 'weak'

/** one of the two tiles: the attribute and how the word is done through it */
export interface RollOption {
  attr: AttrKey
  line: string
}
export interface RollDef {
  options: [RollOption, RollOption]
  /** what 10+, 7–9 and 6− do; contests have none (the difference of the rolls decides) */
  tiers?: TierText
}
/** a contest: what the defender's two tiles say */
export interface DefenceDef {
  title: string
  options: [RollOption, RollOption]
}

export const TIER_LABEL: Record<Tier, string> = { strong: 'Pełen sukces', mixed: 'Sukces z konsekwencjami', weak: 'Porażka' }
export const TIER_RANGE: Record<Tier, string> = { strong: '10+', mixed: '7–9', weak: '6−' }
export function tierOf(total: number): Tier {
  return total >= 10 ? 'strong' : total >= 7 ? 'mixed' : 'weak'
}

export interface ActionRequirement {
  /** shown under the action name */
  text: string
  /** true when the world already holds what the action needs */
  check: (world: WorldView, me: Player | null) => boolean
}

export interface ActionDef {
  key: ActionKey
  name: string
  category: ActionCategoryKey
  costs: [number, number, number]
  /** the cost is paid on top of the distance on the map (1 Logos per field) */
  distance?: boolean
  /** which kind of entity the action creates or edits, if any */
  entityKind?: 'creature' | 'civilization' | 'avatar'
  entityOp?: 'create' | 'update'
  /** waits for the defender's answer (Nawracanie, Święta Wojna, Walka Awatarów) */
  contested?: boolean
  /** 2k6 + one of two attributes; the server throws, the tiles choose */
  roll?: RollDef
  /** contests: the defender's two tiles */
  defence?: DefenceDef
  flow: FlowStep[]
  /** one-line summary shown in the dialog */
  summary: string
  /** full rules text, one paragraph per entry */
  details: string[]
  requirement?: ActionRequirement
}

export const ACTION_GROUPS: { key: ActionGroupKey; name: string; hint: string }[] = [
  { key: 'divine', name: 'Akcje boskie', hint: 'Słowa wypowiadane z nieba, gdziekolwiek na świecie.' },
  { key: 'avatar', name: 'Akcje awatara', hint: 'Słowa, które wypowiada twój awatar tam, gdzie stoi: najwyżej dwa heksy od siebie.' },
]

export const ACTION_CATEGORIES: { key: ActionCategoryKey; name: string; group: ActionGroupKey }[] = [
  { key: 'terraform', name: 'Terraformacja', group: 'divine' },
  { key: 'cataclysm', name: 'Kataklizmy', group: 'divine' },
  { key: 'life', name: 'Tworzenie Życia', group: 'divine' },
  { key: 'pantheon', name: 'Działanie w Panteonie', group: 'divine' },
  { key: 'descent', name: 'Zstąpienie na ziemię', group: 'divine' },
  { key: 'avatar', name: 'Działalność Awatara', group: 'avatar' },
]

export const isSapient = (e: Entity) => e.kind === 'creature' && e.traits.some((t) => SAPIENT_TRAITS.includes(t))

const anyCreatureOnMap = (w: WorldView) => w.hexes.some((h) => w.occupantsAt(h.q, h.r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'))
const anyUnitOnMap = (w: WorldView) => w.hexes.some((h) => w.occupantsAt(h.q, h.r).some((o) => { const e = w.entityById(o.entity_id); const role = w.roleOf(e); return role === 'beast' || role === 'herbivore' || role === 'avatar' }))
const anyLivingLand = (w: WorldView) => w.hexes.some((h) => h.biome !== 'woda' && (!!w.cityAt(h.q, h.r) || w.occupantsAt(h.q, h.r).some((o) => { const e = w.entityById(o.entity_id); return e?.kind === 'creature' && !w.isSapient(e) })))
const anyLand = (w: WorldView) => w.hexes.some((h) => h.biome !== 'woda')
const sapientCanSettle = (w: WorldView) =>
  w.hexes.some((h) => !w.blocked(h.q, h.r) && !w.cityAt(h.q, h.r) && w.occupantsAt(h.q, h.r).some((o) => w.isSapient(w.entityById(o.entity_id))))
const myCities = (w: WorldView, me: Player | null) => (me ? w.cities.filter((c) => w.dotsOf(c.entity_id, me.id) > 0) : [])
const rivalCities = (w: WorldView, me: Player | null) => (me ? w.cities.filter((c) => w.followersOf(c.entity_id).some((f) => f.player_id !== me.id)) : [])
const unblessedLand = (w: WorldView) => w.hexes.some((h) => h.biome !== 'woda' && !h.resource)
const riverSource = (w: WorldView) =>
  w.hexes.some((h) => isMountain(h.biome) && !w.riverAt(h.q, h.r) && neighbours(h).some((n) => { const b = w.hexAt(n.q, n.r)?.biome; return !!b && !isMountain(b) }))
/** a creature with a free field next door for its kind: it may multiply */
export function canMultiply(o: { entity_id: string; q: number; r: number }, w: WorldView): boolean {
  const e = w.entityById(o.entity_id)
  if (!e || e.kind !== 'creature') return false
  const role = w.roleOf(e)
  if (!role || role === 'avatar') return false
  return neighbours({ q: o.q, r: o.r }).some((n) => {
    const h = w.hexAt(n.q, n.r)
    if (!h) return false
    const landOk = role === 'tribe' ? !w.blocked(n.q, n.r) : h.biome !== 'woda'
    return landOk && w.slotFor(n.q, n.r, role) !== null && !w.occupantsAt(n.q, n.r).some((x) => x.entity_id === e.id)
  })
}

/** my avatars standing on the map */
export const standingAvatars = (w: WorldView, me: Player | null) => (me ? w.avatarsOf(me.id).filter((a) => !!a.occupant) : [])
/** true when one of my avatars stands at most two fields from the place */
export const avatarReaches = (w: WorldView, me: Player | null, at: { q: number; r: number }) => standingAvatars(w, me).some((a) => hexDistance(a.occupant!, at) <= AVATAR_REACH)

export const ACTIONS: ActionDef[] = [
  // ---------- Terraformacja ----------
  {
    key: 'shape_land',
    name: 'Kształtowanie Lądów',
    category: 'terraform',
    costs: [2, 5, 12],
    flow: ['form', 'map', 'confirm'],
    summary: 'Wybierz biom i zaznacz do trzech sąsiadujących heksów. Ląd zmienia się od razu.',
    details: [
      'Ta akcja zmienia teren świata: góry, lasy, pustynie, stepy, tundry, bagna, sawanny, morza i śniegi. Wybierz biom, a potem kliknij na mapie od jednego do trzech heksów. Każdy kolejny heks musi sąsiadować z już zaznaczonym; trzeci klik kończy akcję sam.',
      'Woda i Góry są zablokowane: nie powstanie na nich miasto, nie dojdzie tam Exodus i nie stanie tam awatar. Istoty mogą tam żyć. Heksu, na którym stoi miasto lub awatar, nie da się zatopić ani wypiętrzyć.',
      'Czy ląd pojawia się natychmiast, czy zmienia się powoli przez dekady? To opowiedz w wersecie.',
    ],
  },
  {
    key: 'bless_land',
    name: 'Błogosławienie Ziemi',
    category: 'terraform',
    costs: [4, 7, 10],
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'grace', line: 'Tchnij w ziemię obfitość i urodzaj.' },
        { attr: 'wisdom', line: 'Ukształtuj w głębinach bezcenne surowce.' },
      ],
      tiers: {
        strong: 'Surowiec o randze od +1 do +3 do Żyzności, wedle wyniku.',
        mixed: 'Pospolity surowiec: nie dodaje nic do Żyzności.',
        weak: 'Przeklęte złoże: −1 do Żyzności pola.',
      },
    },
    summary: 'Wybierz surowiec, kliknij ląd, potem Łaskę albo Mądrość. Księga rzuca 2k6 + atrybut: 10+ to ranga +1..+3, 7..9 pospolity surowiec, 6- przeklęte złoże.',
    details: [
      'Każdy ląd ma Żyzność: liczbę u góry heksa. Trawa i puszcza dają dwa, góry, dżungla i bagno jeden, pustynia, śnieg, ugór i góry pustynne lub śnieżne nic. Sąsiedztwo wody dodaje jeden, rzeka jeden (na pustyni trzy), stado swoją rangę, surowiec swoją.',
      'Błogosławieństwo kładzie na polu jeden surowiec: klejnoty, zboże, drewno, żelazo, winorośl, owoce, kukurydzę, glinę, złoto, kamień albo bulwy. Jeden surowiec na pole, na zawsze; góry też go przyjmą, woda nie.',
      'Żyzność karmi stada i miasta: w nocy Chaosu miasto rzuca 2k6 + Żyzność − ludność i rośnie, gdy wyrzuci 10+.',
    ],
    requirement: { text: 'ląd bez surowca', check: (w) => unblessedLand(w) },
  },
  {
    key: 'pour_river',
    name: 'Wylanie Rzeki',
    category: 'terraform',
    costs: [3, 8, 12],
    flow: ['map', 'confirm'],
    summary: 'Kliknij górę, potem kolejne sąsiednie pola, aż do wody albo innej rzeki. Każde pole z rzeką ma Żyzność większą o jeden, pustynia o trzy.',
    details: [
      'Rzeka wypływa z góry: kliknij ją jako źródło, a potem kolejne pola, każde sąsiadujące z poprzednim. Rzeka nie płynie pod górę ani nie zawraca. Klik w wodę kończy ją ujściem, klik w pole z inną rzeką czyni ją dopływem.',
      'Gdy rzeka nie ma dokąd płynąć, przerwij słowo i zacznij od innej góry. Cena jest stała, niezależna od długości.',
      'Każde pole, przez które płynie rzeka, ma Żyzność większą o jeden (dwie rzeki nie dodają się). Rzeka na pustyni to Nil: trzy zamiast jednego. Góra, którą ktoś potem wypiętrzy na jej drodze, przecina rzekę; ten, kto ją wypiętrzył, od razu wyklikuje nowe koryto.',
    ],
    requirement: { text: 'góra z lądem obok', check: (w) => riverSource(w) },
  },

  // ---------- Kataklizmy ----------
  {
    key: 'lightning',
    name: 'Piorun',
    category: 'cataclysm',
    costs: [1, 2, 3],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Ciśnij grom w tego, kto ci się sprzeciwił.' },
        { attr: 'element', line: 'Niech burza sama wybierze chwilę i uderzy.' },
      ],
      tiers: {
        strong: 'Cel dostaje 2 obrażenia: bestia albo stado giną, awatar traci dwa życia.',
        mixed: 'Cel dostaje 1 obrażenie: bestia albo stado giną, awatar traci jedno życie.',
        weak: 'Piorun chybia. Logos przepada.',
      },
    },
    summary: 'Atak na jednostkę: kliknij bestię, stado albo awatara, potem Gniew albo Żywioł. 10+ to 2 obrażenia, 7..9 jedno, 6- chybienie.',
    details: [
      'Piorun trafia jedną rzecz stojącą na mapie: bestię, stado albo awatara. Nie trafia ludu ani miasta.',
      'Kości rzuca księga: 2k6 plus Gniew albo Żywioł. Przy 10+ cel dostaje dwa obrażenia, przy 7..9 jedno, przy 6- piorun chybia. Bestia albo stado trafione choć raz znikają z tego pola (gatunek ginie, gdy nie żył nigdzie indziej); awatar traci tyle życia, ile dostał obrażeń.',
    ],
    requirement: { text: 'bestia, stado albo awatar na mapie', check: (w) => anyUnitOnMap(w) },
  },
  {
    key: 'flood',
    name: 'Potop',
    category: 'cataclysm',
    costs: [6, 12, 18],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Zalej tę ziemię w gniewie, aż zamilknie.' },
        { attr: 'element', line: 'Spuść z gór wody, które niosą wszystko przed sobą.' },
      ],
      tiers: {
        strong: 'Heks staje się Wodą na zawsze; wszystko, co na nim stało, ginie, a miasto zostawia czaszkę.',
        mixed: 'Woda zabiera trzy losowe trafienia: wyznawców, istoty albo życie awatara. Ląd zostaje.',
        weak: 'Wody cofają się, nie czyniąc nic. Logos przepada.',
      },
    },
    summary: 'Zatopienie heksu: kliknij ląd, potem Gniew albo Żywioł. 10+ zatapia pole na zawsze, 7..9 zabiera trzech, 6- nic.',
    details: [
      'Kliknij ląd. Kości rzuca księga: 2k6 plus Gniew albo Żywioł.',
      'Przy 10+ heks bezpowrotnie staje się Wodą: miasto ginie i zostawia czaszkę, wyznawcy idą do zaświatów swoich bogów, stada i bestie toną, awatary giną, surowiec przepada, a rzeka, która tamtędy płynęła, urywa się.',
      'Przy 7..9 woda zabiera trzy losowe trafienia: każde w wyznawcę miasta, w stado albo bestię (znika z pola), albo w awatara (jedno życie). Lud miasta ginie dopiero bez miasta. Ląd zostaje, jaki był. Przy 6- nic się nie dzieje.',
    ],
    requirement: { text: 'ląd na mapie', check: (w) => anyLand(w) },
  },
  {
    key: 'fire_rain',
    name: 'Deszcz Ognia',
    category: 'cataclysm',
    costs: [6, 12, 18],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Ukarz bezbożników świętym gniewem bożym!' },
        { attr: 'element', line: 'Uwolnij ślepą potęgę dzikiej natury!' },
      ],
      tiers: {
        strong: 'Sześć losowych trafień: wyznawcy, istoty, życie awatarów. Gdy nikt nie przeżyje, heks staje się Ugorem.',
        mixed: 'Trzy losowe trafienia. Gdy nikt nie przeżyje, heks staje się Ugorem.',
        weak: 'Ogień gaśnie w powietrzu. Logos przepada.',
      },
    },
    summary: 'Zniszczenie heksu: kliknij ląd, potem Gniew albo Żywioł. 10+ to sześć trafień, 7..9 trzy, 6- nic. Pole bez żywych obraca się w ugór.',
    details: [
      'Kliknij ląd. Kości rzuca księga: 2k6 plus Gniew albo Żywioł. Przy 10+ spada sześć trafień, przy 7..9 trzy, przy 6- żadne.',
      'Każde trafienie pada losowo na to, co stoi na heksie: na jednego wyznawcę miasta (dowolnego bóstwa), na stado albo bestię (znika z pola) albo na awatara (traci jedno życie). Lud miasta ginie dopiero wtedy, gdy nie ma już miasta. Miasto bez wyznawców obraca się w ruinę i zostawia czaszkę.',
      'Gdy po deszczu ognia na polu nikt nie żyje, ziemia staje się Ugorem (góry zostają górami). Deszcz ognia jest lokalny; na skalę świata służy Wielki Cud.',
    ],
    requirement: { text: 'ląd na mapie', check: (w) => anyLand(w) },
  },
  {
    key: 'drought',
    name: 'Susza',
    category: 'cataclysm',
    costs: [3, 6, 9],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Odbierz tej ziemi deszcz za jej niewdzięczność.' },
        { attr: 'element', line: 'Niech słońce stanie nad nią i nie zejdzie.' },
      ],
      tiers: {
        strong: 'Przez trzy noce Żyzność pola to 0: miasto głoduje, stado na nim ginie.',
        mixed: 'Przez dwie noce Żyzność pola to 0.',
        weak: 'Chmury zbierają się nad polem i nic. Logos przepada.',
      },
    },
    summary: 'Obniżenie żyzności: kliknij ląd, potem Gniew albo Żywioł. Słońce u góry heksa oznacza Żyzność 0 przez 3 noce (10+) albo 2 (7..9).',
    details: [
      'Kliknij ląd. Kości rzuca księga: 2k6 plus Gniew albo Żywioł. Przy 10+ pole jest jałowe przez trzy noce Chaosu, przy 7..9 przez dwie, przy 6- nic się nie dzieje.',
      'Jałowe pole pokazuje u góry słońce zamiast liczby: jego Żyzność wynosi zero, więc miasto rzuca w nocy 2k6 − ludność i łatwo wpada w głód, a stado, które się tam pasie, ginie każdej nocy suszy. Każda noc odejmuje jedną noc suszy.',
    ],
    requirement: { text: 'ląd na mapie', check: (w) => anyLand(w) },
  },
  {
    key: 'plague',
    name: 'Plaga',
    category: 'cataclysm',
    costs: [9, 5, 8],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Ześlij zarazę na tych, którzy cię obrazili.' },
        { attr: 'element', line: 'Pozwól chorobie wylęgnąć się w bagnach i studniach.' },
      ],
      tiers: {
        strong: 'Przez dwie noce w mieście umiera dwoje losowych mieszkańców (albo stado, albo bestia).',
        mixed: 'Przez jedną noc w mieście umiera dwoje losowych mieszkańców (albo stado, albo bestia).',
        weak: 'Zaraza nie chwyta. Logos przepada.',
      },
    },
    summary: 'Atak na populację: kliknij pole z miastem, stadem albo bestią, potem Gniew albo Żywioł. Znak ☣️ u góry heksa: co noc giną dwoje mieszkańców (10+: dwie noce, 7..9: jedna).',
    details: [
      'Kliknij pole, na którym ktoś żyje: miasto, stado albo bestia. Kości rzuca księga: 2k6 plus Gniew albo Żywioł. Przy 10+ plaga trwa dwie noce Chaosu, przy 7..9 jedną, przy 6- nie chwyta.',
      'Każdej nocy plagi w mieście umiera dwoje losowych mieszkańców (wyznawcy dowolnych bogów albo bezbożni); miasto bez mieszkańców obraca się w ruinę i zostawia czaszkę. Gdy miasta nie ma, ginie stado albo bestia z tego pola. U góry heksa stoi znak ☣️, póki plaga trwa.',
    ],
    requirement: { text: 'miasto, stado albo bestia na lądzie', check: (w) => anyLivingLand(w) },
  },

  // ---------- Tworzenie Życia ----------
  {
    key: 'create_beast',
    name: 'Stworzenie Bestii',
    category: 'life',
    costs: [10, 3, 12],
    entityKind: 'creature',
    entityOp: 'create',
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Ześlij na ziemię krwiożercze bestie.' },
        { attr: 'element', line: 'Przebudź do życia uosobienie chaosu.' },
      ],
      tiers: {
        strong: 'Bestia o sile od +1 do +3, wedle wyniku.',
        mixed: 'Bestia o sile 0: dzika, lecz nie groźniejsza od plemienia.',
        weak: 'Nic nie powstaje. Logos przepada, znak zostaje wolny.',
      },
    },
    summary: 'Nowy drapieżny gatunek z własną emotikoną. Kliknij ląd, potem Gniew albo Żywioł: księga rzuca 2k6 + atrybut i daje bestii siłę.',
    details: [
      'Zwierzęta i rośliny wszelkiego rodzaju powstają same wskutek kształtowania lądów, ale czasem chcesz stworzyć coś bardziej konkretnego: cały gatunek z własnym znakiem na mapie. Nazwij bestię i wybierz emotikonę, której nikt jeszcze nie nosi.',
      'Bestia stoi na dole heksa (jedna bestia albo plemię na pole). Jej siłę rzuca księga: 2k6 plus Gniew albo Żywioł. Przy 10+ siła wynosi od +1 do +3 (wedle wyniku), przy 7..9 zero, przy 6- bestia nie powstaje. W nocy Chaosu poluje, mnoży się i walczy z tym, co spotka.',
      'Bestie żyją też w górach, lecz nie na wodzie. Istoty nierozumne nie założą cywilizacji. Do tego służy Stworzenie Istoty Rozumnej.',
    ],
  },
  {
    key: 'create_herd',
    name: 'Stworzenie Stada',
    category: 'life',
    costs: [10, 3, 12],
    entityKind: 'creature',
    entityOp: 'create',
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'grace', line: 'Ześlij potulne stworzenia, by karmiły swoich wyznawców.' },
        { attr: 'element', line: 'Wypuść w świat dzikie zwierzęta żyjące wolnością.' },
      ],
      tiers: {
        strong: 'Stado rangi od +1 do +3 do Żyzności pola, wedle wyniku.',
        mixed: 'Stado rangi 0: dzika zwierzyna, która nic nie dodaje ziemi.',
        weak: 'Nic nie powstaje. Logos przepada, znak zostaje wolny.',
      },
    },
    summary: 'Nowy roślinożerny gatunek z własną emotikoną. Kliknij ląd, potem Łaskę albo Żywioł: księga rzuca 2k6 + atrybut i daje stadu rangę.',
    details: [
      'Nazwij stado i wybierz emotikonę, której nikt jeszcze nie nosi, potem kliknij ląd, na którym się pojawia (także góry, nie wodę).',
      'Stado stoi w lewym górnym rogu heksa (jedno na pole) i karmi ziemię: jego ranga dodaje się do Żyzności pola, na którym się pasie. Rangę rzuca księga: 2k6 plus Łaska albo Żywioł. Przy 10+ od +1 do +3 (wedle wyniku), przy 7..9 zero, przy 6- stado nie powstaje. W nocy Chaosu szuka pastwisk albo się mnoży; nigdy nie walczy.',
      'Istoty nierozumne nie założą cywilizacji. Do tego służy Stworzenie Istoty Rozumnej.',
    ],
  },
  {
    key: 'create_sapient',
    name: 'Stworzenie Istoty Rozumnej',
    category: 'life',
    costs: [15, 4, 18],
    entityKind: 'creature',
    entityOp: 'create',
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'majesty', line: 'Ulep rasę na swój wzór i podobieństwo.' },
        { attr: 'wisdom', line: 'Obdarz materię wolną wolą, ciekawością i intelektem.' },
      ],
      tiers: {
        strong: 'Lud liczny: plemię na wskazanym polu i drugie na najżyźniejszym wolnym polu obok.',
        mixed: 'Plemię na wskazanym polu.',
        weak: 'Materia się nie przebudziła. Logos przepada.',
      },
    },
    summary: 'Lud zdolny do kultury: swój znak i miejsce na lądzie. Dopóki nie ma miasta, jest plemieniem, które wędruje i w końcu osiada.',
    details: [
      'Tak jak Stworzenie Bestii albo Stada, ale to, co powstaje, ma świadomość, język i zdolność do kultury. Od tej pory na heksie, gdzie żyje, można założyć cywilizację.',
      'Nazwij lud, wybierz emotikonę i kliknij heks (nie Wodę, nie Góry). Lud stoi na dole heksa, tam gdzie bestia: jedno z dwojga na pole. Potem wybierz Majestat albo Mądrość: księga rzuca 2k6 plus atrybut. Przy 10+ lud jest liczny i obsadza też najżyźniejsze wolne pole obok, przy 7..9 staje tylko tam, gdzie wskazano, przy 6- nie powstaje.',
      'Bez miasta lud jest plemieniem: w nocy Chaosu obozuje, wędruje ku żyznej ziemi, udomawia stada, walczy z bestiami (siła 0), a na ziemi o Żyzności co najmniej jeden zakłada miasto, które nazywa jego bóstwo. Lud w mieście nie wędruje.',
    ],
  },
  {
    key: 'migrate',
    name: 'Migracja',
    category: 'life',
    costs: [3, 1, 3],
    distance: true,
    flow: ['map', 'map', 'confirm'],
    summary: 'Kliknij istotę, potem heks docelowy: gatunek przenosi się tam (1 Logos za heks, bez kopii). Bestia wchodząca na bestię, plemię albo miasto walczy od razu wedle zasad nocy.',
    details: [
      'Kliknij heks z istotą i wybierz, którą istotę to dotyczy; potem kliknij heks, na który się przenosi. Bez rzutu: istota po prostu idzie, a do ceny słowa dochodzi 1 Logos za każdy heks drogi. Mapa podświetla tylko tyle, na ile cię stać.',
      'Na docelowym heksie musi być wolne miejsce roli (stado w lewym górnym rogu, bestia albo plemię na dole); Woda odpada, a plemię nie wejdzie w Góry ani do miasta. Stado nigdy nie walczy: idzie tylko tam, gdzie nie pasie się inne.',
      'Bestia może wejść na pole z inną bestią albo plemieniem, a także napaść na miasto: wtedy od razu toczy się walka wedle zasad nocy Chaosu. Obie strony rzucają 2k6 + siłę (plemię 0, miasto swoją ludność). Wygrana o 3+ pożera przegranego (miasto traci tyle grup, o ile wygrano), o 1..2 przegrany ucieka na wolne pole obok (ginie, gdy go nie ma), remis cofa napastnika. Zwycięska bestia zajmuje pole; miasta nie zajmuje nigdy.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },
  {
    key: 'multiply',
    name: 'Rozmnożenie',
    category: 'life',
    costs: [5, 2, 6],
    flow: ['map', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'grace', line: 'Pobłogosław ich płodność, by napełniali ziemię.' },
        { attr: 'element', line: 'Rozbudź w nich gorączkę wiosny i głód życia.' },
      ],
      tiers: {
        strong: 'Kopia istoty staje na wskazanym polu obok.',
        mixed: 'Kopia staje, lecz pośpieszny pomiot osłabia gatunek: siła lub ranga o jeden niżej (najmniej −1).',
        weak: 'Nie przybyło nikogo. Logos przepada.',
      },
    },
    summary: 'Kliknij stado, bestię albo plemię, potem wolne pole obok: tam staje kopia. Łaska albo Żywioł: 10+ kopia, 7..9 kopia, lecz gatunek słabnie o jeden, 6- nic.',
    details: [
      'Kliknij istotę na mapie (stado, bestię albo plemię z wolnym polem obok), potem kliknij sąsiednie pole, na którym ma stanąć kopia: wolne miejsce roli, bez tego gatunku, nie Woda (plemię także nie Góry).',
      'Wybierz Łaskę albo Żywioł: księga rzuca 2k6 plus atrybut. Przy 10+ kopia staje na wskazanym polu. Przy 7..9 też staje, lecz gatunek słabnie: siła bestii albo ranga stada spada o jeden (najmniej do −1), bo pośpieszny pomiot jest słabszy. Przy 6- nikt się nie rodzi.',
    ],
    requirement: { text: 'istota z wolnym polem obok', check: (w) => w.hexes.some((h) => w.occupantsAt(h.q, h.r).some((o) => canMultiply(o, w))) },
  },
  {
    key: 'change_creature',
    name: 'Zmiana Istoty',
    category: 'life',
    costs: [5, 1, 6],
    entityKind: 'creature',
    entityOp: 'update',
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'whisper', line: 'Zniekształć ich formę, skuś ich do zmiany swojej natury.' },
        { attr: 'element', line: 'Przeprowadź chaotyczną mutację siłami natury.' },
      ],
      tiers: {
        strong: 'Istoty się odmieniają i rosną w siłę: siła lub ranga o jeden wyżej (do +3).',
        mixed: 'Istoty się odmieniają: nowa nazwa, znak i opis.',
        weak: 'Istoty pozostały sobą. Logos przepada.',
      },
    },
    summary: 'Kliknij istotę i zmień jej nazwę, znak albo opis: odmienia się cały gatunek, wszędzie, gdzie żyje. Podszept albo Żywioł; 10+ dodaje też siłę.',
    details: [
      'Kliknij istotę na mapie. Zmienia się ona sama, a nie powstaje nowa: nowa nazwa, nowy znak na mapie i nowy opis dotyczą całego gatunku, na każdym polu, gdzie żyje. Dotyczy to tak samo istot rozumnych.',
      'Wybierz Podszept albo Żywioł: księga rzuca 2k6 plus atrybut. Przy 10+ istoty odmieniają się i rosną w siłę (siła bestii lub ranga stada o jeden wyżej, do +3), przy 7..9 odmieniają się bez zmiany siły, przy 6- nic się nie zmienia.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },
  {
    key: 'create_civilization',
    name: 'Stworzenie Cywilizacji',
    category: 'life',
    costs: [22, 12, 6],
    entityKind: 'civilization',
    entityOp: 'create',
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'wisdom', line: 'Zbuduj zalążek pierwszego zorganizowanego społeczeństwa.' },
        { attr: 'grace', line: 'Zjednocz lud wokół wspólnej miłości do życia.' },
      ],
      tiers: {
        strong: 'Miasto z dwoma wyznawcami twórcy.',
        mixed: 'Miasto z jednym wyznawcą.',
        weak: 'Lud nie osiadł. Logos przepada.',
      },
    },
    summary: 'Kliknij heks z istotą rozumną i nazwij lud. Księga rzuca 2k6 + Mądrość albo Łaska: 10+ to miasto z dwoma wyznawcami, 7..9 z jednym.',
    details: [
      'Cywilizacja to lud na heksie, na którym żyje istota rozumna i nie stoi jeszcze miasto. Kliknij heks, nazwij lud i wybierz, czy wspiera cię Mądrość, czy Łaska. Kości rzuca księga: 2k6 plus atrybut.',
      'Przy 10+ miasto rodzi się z dwoma wyznawcami w twoim kolorze, przy 7..9 z jednym, przy 6- lud nie osiada. Wyznawcy to kropki w piramidzie na środku heksa; miasto mieści najwyżej dziesięciu.',
      'Miasto nosi znak ludu, z którego wyszło. Lud w mieście nie wędruje w nocy Chaosu; miasto rzuca wtedy 2k6 + Żyzność − ludność i rośnie, głoduje albo wysyła nadwyżkę w kolonię.',
    ],
    requirement: { text: 'istota rozumna na wolnym heksie', check: (w) => sapientCanSettle(w) },
  },

  // ---------- Działanie w Panteonie ----------
  {
    key: 'great_miracle',
    name: 'Wielki Cud',
    category: 'pantheon',
    costs: [15, 30, 50],
    flow: ['roll'],
    roll: {
      options: [
        { attr: 'majesty', line: 'Nagnij zasady rzeczywistości potęgą swego boskiego autorytetu.' },
        { attr: 'wisdom', line: 'Zaprojektuj fundamentalne prawa fizyki, wprowadzając do świata nowe zjawiska.' },
      ],
      tiers: {
        strong: 'Cud zachodzi w pełni, tak jak go opowiesz.',
        mixed: 'Cud zachodzi, lecz ma cenę: opowiedz ją w wersecie.',
        weak: 'Świat nie drgnął. Logos przepada.',
      },
    },
    summary: 'Coś WIELKIEGO na skalę całego świata. Nie ma ograniczeń. Użyj, gdy chcesz pójść na całość.',
    details: [
      'Czasem chcesz zrobić coś WIELKIEGO, co nie do końca pasuje do żadnej z pozostałych akcji. Być może chcesz określić coś prawdziwego na całym świecie: wskrzesić wszystkich, którzy zginęli podczas nuklearnej zimy, albo sprawić, by cały kontynent unosił się w przestworzach.',
      'Nie ma ograniczeń co do rzeczy, które można określić tą akcją. Użyj jej, gdy chcesz pójść na całość, naprawdę na całość.',
      'Kości rzuca księga: 2k6 plus Majestat albo Mądrość. Przy 10+ cud zachodzi w pełni, przy 7..9 zachodzi, lecz ma cenę, którą opowiesz w wersecie, przy 6- świat nie drgnie, a Logos przepada.',
    ],
  },

  // ---------- Zstąpienie na ziemię ----------
  {
    key: 'create_avatar',
    name: 'Zesłanie Awatara',
    category: 'descent',
    costs: [10, 12, 15],
    entityKind: 'avatar',
    entityOp: 'create',
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'majesty', line: 'Objaw się w monumentalnej formie budzącej powszechny podziw.' },
        { attr: 'whisper', line: 'Zejdź na ziemię w przebraniu, by w tajemnicy testować śmiertelników.' },
      ],
      tiers: {
        strong: 'Awatar zstępuje z pełnym życiem.',
        mixed: 'Awatar zstępuje ranny: o jedno życie mniej.',
        weak: 'Niebo milczy: awatar nie zstąpił. Logos przepada.',
      },
    },
    summary: 'Most między boskością a śmiertelnikami: własny znak, miejsce na mapie, życie. Tylko awatar wypowiada słowa Działalności Awatara.',
    details: [
      'Gdy zsyłasz awatara, tworzysz coś, co przerzuca most nad przepaścią między boskością a śmiertelnikami. Twoje awatary nie są tobą, lecz twoim przedłużeniem. Mogą mieć własne pragnienia i ambicje, a nawet ulegać wpływom innych bóstw.',
      'Awatar staje na wybranym heksie (nie na Wodzie ani w Górach), nosi własny znak i ma 2 punkty życia; piorun, deszcz ognia, wojna i walka mogą go ranić, a sen Fazy Chaosu leczy jedno życie. Gdy życie spadnie do zera, ginie i wraca tylko przez Wskrzeszenie. Każde kolejne wcielenie wraca o jedno życie silniejsze, najwyżej dwanaście.',
      'Wybierz Majestat albo Podszept: księga rzuca 2k6 plus atrybut. Przy 10+ awatar zstępuje z pełnym życiem, przy 7..9 ranny (o jedno życie mniej, sen go uleczy), przy 6- nie zstępuje wcale.',
      'Awatar to ręka bóstwa na ziemi: tylko on wypowiada słowa Działalności Awatara (Pielgrzymka, Rozwój Cywilizacji, Nawracanie, Exodus, Święta Wojna, Proroctwo, Walka Awatarów), zawsze najwyżej dwa heksy od siebie. Na wojnę idzie jak generał: jego życie dolicza się do rzutu armii, a gdy stoi w atakowanym mieście, do rzutu obrony.',
    ],
  },
  {
    key: 'resurrect_avatar',
    name: 'Wskrzeszenie Awatara',
    category: 'descent',
    costs: [12, 15, 16],
    entityKind: 'avatar',
    entityOp: 'update',
    flow: ['form', 'map', 'confirm'],
    summary: 'Awatar wraca na wybrany heks z pełnym życiem, lecz zawsze nieco inny. Możesz wskrzesić awatara innego bóstwa.',
    details: [
      'Jest wiele sposobów, na jakie awatar może spotkać nieszczęśliwy koniec. Gdy tak się stanie, ta akcja jest jedyną opcją, jeśli chcesz, by ten awatar nadal istniał w świecie. Kliknij heks, na którym powraca.',
      'Wskrzeszone awatary zawsze wracają nieco inne. Opisz, jak zmieniła go śmierć. Możesz wskrzeszać poległe awatary innych bóstw; traktuj takiego awatara jako mającego odtąd wielu twórców.',
    ],
    requirement: { text: 'musi umrzeć awatar', check: (w) => w.entities.some((e) => e.kind === 'avatar' && e.status === 'dead') },
  },

  // ---------- Działalność Awatara ----------
  {
    key: 'pilgrimage',
    name: 'Pielgrzymka',
    category: 'avatar',
    costs: [0, 0, 0],
    distance: true,
    flow: ['map', 'map', 'confirm'],
    summary: 'Awatar rusza w drogę: 1 Logos za każdy heks, najmniej 1. Kliknij awatara, potem pole; świecą tylko pola, na które cię stać.',
    details: [
      'Awatar to ręka bóstwa na ziemi i sięga tylko dwa heksy od siebie. Pielgrzymka przenosi go tam, gdzie ma działać: na pole z wolnym miejscem, nie na Wodę ani w Góry.',
      'Koszt to dystans: 1 Logos za każdy heks drogi, najmniej jeden, bez górnej granicy. Nie da się wskazać pola dalej, niż masz Logos.',
      'W drodze awatar nie czyni cudów; dopiero z nowego miejsca wypowiada swoje słowa, rusza na wojnę, nawraca albo staje do walki.',
    ],
    requirement: { text: 'twój żywy awatar na mapie', check: (w, me) => standingAvatars(w, me).length > 0 },
  },
  {
    key: 'develop_civilization',
    name: 'Rozwój Cywilizacji',
    category: 'avatar',
    costs: [12, 8, 4],
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'wisdom', line: 'Naucz śmiertelników rolnictwa, inżynierii i pisma.' },
        { attr: 'whisper', line: 'Wejdź między lud i fizycznie płódź pokolenie jurnych półbogów.' },
      ],
      tiers: {
        strong: 'Dwóch nowych wyznawców w mieście.',
        mixed: 'Jeden nowy wyznawca.',
        weak: 'Dar odrzucony. Logos przepada.',
      },
    },
    summary: 'Kliknij miasto najwyżej dwa heksy od awatara i napisz, co ofiarowujesz. Księga rzuca 2k6 + Mądrość albo Podszept: 10+ to dwóch wyznawców, 7..9 jeden.',
    details: [
      'Awatar niesie miastu dar: ogień, oliwki, rolnictwo, pismo, wielką budowlę albo własną krew. Kliknij miasto najwyżej dwa heksy od awatara, napisz, co dajesz, i wybierz, czy czynisz to Mądrością, czy Podszeptem. Kości rzuca księga: 2k6 plus atrybut.',
      'Przy 10+ miasto zyskuje dwóch twoich wyznawców, przy 7..9 jednego. Przy 6- dar nie chwyta: Logos przepadają, a księga odnotowuje, co odrzucono. Miasto mieści najwyżej dziesięciu wyznawców; bezbożni nawracają się pierwsi.',
      'Przyjęte dary zostają w karcie miasta na zawsze.',
    ],
    requirement: { text: 'twój awatar najwyżej dwa heksy od miasta', check: (w, me) => w.cities.some((c) => avatarReaches(w, me, c)) },
  },
  {
    key: 'convert',
    name: 'Nawracanie',
    category: 'avatar',
    costs: [6, 4, 3],
    contested: true,
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'majesty', line: 'Zstąp w blasku chwały, imponując heretykom swoją niepodważalną potęgą.' },
        { attr: 'whisper', line: 'Ześlij wizje, tworząc tajne sekty działające w cieniu.' },
      ],
    },
    defence: {
      title: 'Obrona wiary',
      options: [
        { attr: 'majesty', line: 'Stań przed wiernymi w pełni chwały, by nie zwątpili.' },
        { attr: 'wisdom', line: 'Umocnij ich w wierze nauką i doktryną.' },
      ],
    },
    summary: 'Awatar wchodzi do miasta najwyżej dwa heksy od siebie i nawraca cudzych wyznawców. Rzut sporny: 2k6 + Majestat albo Podszept; obrońca odpowiada Majestatem albo Mądrością.',
    details: [
      'Kliknij miasto najwyżej dwa heksy od awatara, w którym inne bóstwo ma wyznawców, i wskaż to bóstwo. Awatar wchodzi do tego miasta (musi być tam wolne miejsce dla awatara) i działa stamtąd.',
      'Wybierz, czy działasz Majestatem, czy Podszeptem; kości rzuca księga. Broniące się bóstwo odpowiada u siebie: wybiera Majestat albo Mądrość i rzuca. Twoja tura czeka na jego odpowiedź.',
      'Jeśli wygrasz o 3 lub więcej, dwóch jego wyznawców przechodzi na twoją stronę; jeśli o 1 lub 2, jeden (bezbożni nawracają się pierwsi). Remis i przegrana nie zmieniają nic. Logos płacisz przy deklaracji.',
    ],
    requirement: { text: 'cudze miasto najwyżej dwa heksy od awatara', check: (w, me) => rivalCities(w, me).some((c) => avatarReaches(w, me, c)) },
  },
  {
    key: 'exodus',
    name: 'Exodus',
    category: 'avatar',
    costs: [12, 8, 4],
    distance: true,
    flow: ['map', 'form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Wypędź populację siłą poza mury miasta.' },
        { attr: 'whisper', line: 'Ześlij przywódcom wizję Ziemi Obiecanej, zmuszając do wyjścia.' },
      ],
      tiers: {
        strong: 'Wszyscy dochodzą; nowe miasto dziedziczy dary macierzystego.',
        mixed: 'Jeden ginie w drodze (gdy idzie ich więcej); nowe miasto nie dziedziczy darów.',
        weak: 'Nikt nie wyszedł z miasta. Logos i dystans przepadają.',
      },
    },
    summary: 'Awatar wchodzi do miasta najwyżej dwa heksy od siebie i wyprowadza stamtąd twoich wyznawców na nowy heks; idzie z nimi. Do ceny dochodzi 1 Logos za heks.',
    details: [
      'Kliknij miasto najwyżej dwa heksy od awatara, w którym masz wyznawców, i wybierz, ilu wyznawców zabierasz oraz którą istotę rozumną (jeśli żyje tam kilka). Awatar wchodzi do tego miasta (musi być tam wolne miejsce) i prowadzi lud. Potem kliknij heks docelowy: nie Wodę i nie Góry.',
      'Do ceny słowa dochodzi dystans: 1 Logos za każdy heks. Na nowym heksie powstaje nowe miasto z twoimi wyznawcami i znakiem zabranej istoty; dziedziczy cechy macierzystego. Jeśli na celu stoi już miasto, twoi wyznawcy i istota dołączają do niego. Awatar idzie z ludem, gdy jest dla niego miejsce.',
      'Wybierz Gniew albo Podszept: księga rzuca 2k6 plus atrybut. Przy 10+ wszyscy dochodzą, a nowe miasto dziedziczy dary macierzystego. Przy 7..9 jeden ginie w drodze (gdy wyszło ich co najmniej dwóch), a nowe miasto nie dziedziczy darów. Przy 6- nikt nie wychodzi.',
      'Miasto, z którego wyszli wszyscy, staje się ruiną.',
    ],
    requirement: { text: 'twoje miasto najwyżej dwa heksy od awatara', check: (w, me) => myCities(w, me).some((c) => avatarReaches(w, me, c)) },
  },
  {
    key: 'holy_war',
    name: 'Święta Wojna',
    category: 'avatar',
    costs: [8, 6, 4],
    distance: true,
    contested: true,
    flow: ['map', 'form', 'map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Rozpal w sercach zbrojnych bezlitosną furię skierowaną we wrogie miasto.' },
        { attr: 'whisper', line: 'Zatruj ich umysły wizją, że wróg to zło, które należy zniszczyć.' },
      ],
    },
    defence: {
      title: 'Obrona Miasta',
      options: [
        { attr: 'grace', line: 'Obejmij wyznawców cudowną, opiekuńczą ochroną.' },
        { attr: 'wrath', line: 'Ześlij furię w serca obrońców, zniszcz atakujących.' },
      ],
    },
    summary: 'Awatar wchodzi do twojego miasta najwyżej dwa heksy od siebie i prowadzi stamtąd armię wyznawców na cudze miasto; walczy z nią i idzie za nią. Do ceny dochodzi 1 Logos za heks.',
    details: [
      'Wybierz swoje miasto najwyżej dwa heksy od awatara (takie, w którym masz najwięcej wyznawców) i zdecyduj, ilu swoich wyznawców zabierasz: to twoja Armia. Co najmniej jeden zostaje w domu. Awatar wchodzi do tego miasta i prowadzi lud jak generał. Wybierz cel (dowolne miasto na świecie) i broniące się bóstwo (albo bezbożników, gdy nikt inny tam nie wierzy). Do ceny słowa dochodzi 1 Logos za każdy heks dystansu między miastami.',
      'Atakujący rzuca 2k6 + Gniew albo Podszept + wielkość Armii + życie awatara. Obrońca rzuca 2k6 + Łaska (mury i tarcze) albo Gniew (wyjście przed mury) + liczba swoich wyznawców w atakowanym mieście + życie swojego awatara, jeśli stoi w tym mieście. Różnica wyników decyduje.',
      'Wygrana o 3+: wymazujesz tylu wyznawców wroga, ilu liczy Armia; połowa z nich (w górę) staje się twoimi wyznawcami w tym mieście, Armia wraca cała. Wygrana o 1..2: to samo, lecz tracisz połowę Armii. Remis: obie strony tracą po jednym wyznawcy, Armia wraca. Przegrana o 1..2: wraca jeden, obrońca traci jednego. Przegrana o 3+: Armia ginie co do jednego, miasto nietknięte, a awatar odnosi ranę.',
      'Po wygranej (pełnej albo pyrrusowej) awatar stoi w zdobytym mieście, gdy jest tam dla niego miejsce; po remisie i przegranej zostaje w mieście, z którego wyszła armia.',
    ],
    requirement: { text: 'twoje miasto najwyżej dwa heksy od awatara i cudze miasto', check: (w, me) => !!me && w.cities.some((c) => w.holds(c.entity_id, me.id) && avatarReaches(w, me, c)) && rivalCities(w, me).length > 0 },
  },
  {
    key: 'prophecy',
    name: 'Proroctwo',
    category: 'avatar',
    costs: [10, 5, 3],
    entityOp: 'update',
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'majesty', line: 'Ogłoś światu swój twardy, niepodważalny wyrok z niebios.' },
        { attr: 'wisdom', line: 'Zapisz w świętych zwojach wiedzę o przyszłości.' },
      ],
      tiers: {
        strong: 'Proroctwo o nieuchronności +2.',
        mixed: 'Proroctwo o nieuchronności +1.',
        weak: 'Prorok zamilkł. Logos przepada.',
      },
    },
    summary: 'Kliknij swojego awatara i zapisz, co zapowiada. Proroctwo dojrzewa co Chaos (+1 do +3) i raz dodaje się do rzutu.',
    details: [
      'Awatar przemawia o tym, co nadejdzie. Kliknij swojego awatara na mapie i wpisz treść proroctwa własnymi słowami. Księga zapamięta: „Prorok X zapowiedział, że: …”.',
      'Wybierz Majestat albo Mądrość: księga rzuca 2k6 plus atrybut. Proroctwo ma nieuchronność: +2 przy 10+, +1 przy 7..9 (przy 6- prorok milczy), potem każda Faza Chaosu dodaje +1, aż do +3.',
      'Przy każdym rzucie (także w obronie) możesz wypełnić jedno proroctwo: jego nieuchronność dodaje się do rzutu, a ono trafia do spełnionych na karcie bóstwa.',
    ],
    requirement: { text: 'twój żywy awatar na mapie', check: (w, me) => standingAvatars(w, me).length > 0 },
  },
  {
    key: 'avatar_duel',
    name: 'Walka Awatarów',
    category: 'avatar',
    costs: [5, 4, 3],
    contested: true,
    flow: ['map', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Zetrzyj się z rywalem w brutalnej, fizycznej walce.' },
        { attr: 'majesty', line: 'Upokorz przeciwnika samym ciężarem swojej boskiej aury.' },
      ],
    },
    defence: {
      title: 'Obrona awatara',
      options: [
        { attr: 'wrath', line: 'Przyjmij cios i oddaj go dwakroć.' },
        { attr: 'majesty', line: 'Nie ugnij się przed cudzą aurą.' },
      ],
    },
    summary: 'Twój awatar staje przeciw awatarowi innego bóstwa najwyżej dwa heksy od siebie. Rzut sporny: 2k6 + Gniew albo Majestat po obu stronach.',
    details: [
      'Kliknij swojego awatara, potem awatara przeciwnika stojącego najwyżej dwa heksy od niego. Jeśli jest dalej, najpierw wyślij awatara na Pielgrzymkę.',
      'Wybierz, czym walczysz: Gniew to brutalne starcie siłowe, Majestat to pojedynek boskiej aury. Obrońca też wybiera Gniew albo Majestat. Obaj rzucają 2k6 + atrybut.',
      'Wygrana o 3+: awatar wroga traci 2 życia, twój bez szwanku. Wygrana o 1..2: wróg traci 1, ty też 1. Remis: obaj tracą po 1. Przegrana o 1..2: ty tracisz 1. Przegrana o 3+: ty tracisz 2. Awatar bez życia ginie i znika z mapy.',
    ],
    requirement: { text: 'twój awatar w zasięgu cudzego', check: (w, me) => duelPossible(w, me) },
  },
]

/** my avatar on the map with an enemy avatar on the same field or next to it */
function duelPossible(w: WorldView, me: Player | null): boolean {
  if (!me) return false
  const mine = w.avatarsOf(me.id).filter((a) => a.occupant)
  if (mine.length === 0) return false
  const enemies = w.entities.filter((e) => e.kind === 'avatar' && e.status === 'active' && !w.avatarsOf(me.id).some((a) => a.entity.id === e.id))
  return enemies.some((e) => {
    const occ = w.occupantsOf(e.id)[0]
    return !!occ && mine.some((a) => hexDistance(a.occupant!, occ) <= AVATAR_REACH)
  })
}

export const ACTION_BY_KEY: Record<ActionKey, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
) as Record<ActionKey, ActionDef>

/** the group a word belongs to: the sky's or the avatar's */
export function groupOf(key: ActionKey): ActionGroupKey {
  return ACTION_CATEGORIES.find((c) => c.key === ACTION_BY_KEY[key].category)?.group ?? 'divine'
}

export const ERA_NAMES: Record<Era, string> = { 1: 'Pierwsza Era', 2: 'Druga Era', 3: 'Trzecia Era' }
export const ERA_NUMERALS: Record<Era, string> = { 1: 'I', 2: 'II', 3: 'III' }
/** What each Era is about, for the overture that opens it. */
export const ERA_TITLES: Record<Era, string> = { 1: 'Era Terraformacji', 2: 'Era Życia', 3: 'Era Cywilizacji' }
export const ERA_THEMES: Record<Era, string> = {
  1: 'Geografia. Tanie kształtowanie lądu, drogie ludy.',
  2: 'Zaludnianie. Tanie gatunki i cywilizacje.',
  3: 'Polityka i kultura. Tanie mieszanie się w sprawy śmiertelników.',
}

export function costFor(key: ActionKey, era: Era): number {
  return ACTION_BY_KEY[key].costs[era - 1]
}

/** Actions grouped by category, in the rulebook's order (never by price). */
export function actionsByCategory(_era: Era): { category: (typeof ACTION_CATEGORIES)[number]; actions: ActionDef[] }[] {
  return ACTION_CATEGORIES.map((category) => ({
    category,
    actions: ACTIONS.filter((a) => a.category === category.key),
  }))
}

/**
 * The word behind a book row. Rows written before 0023 carry 'create_creature' (a beast or a herd by
 * the role in their outcome); rows written before 0024 carry 'catastrophe', which reads as a fire rain.
 */
export function logActionKey(l: Pick<ActionLog, 'action_key' | 'outcome'>): ActionKey | undefined {
  if (l.action_key === 'create_creature') {
    const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
    return o.role === 'beast' ? 'create_beast' : 'create_herd'
  }
  if (l.action_key === 'catastrophe') return 'fire_rain'
  return l.action_key in ACTION_BY_KEY ? (l.action_key as ActionKey) : undefined
}

/** the attribute pair a word rolls with, on the attacker's or the defender's side */
export function rollOptions(key: ActionKey, side: 'attack' | 'defence' = 'attack'): [RollOption, RollOption] | null {
  const a = ACTION_BY_KEY[key]
  if (side === 'defence') return a.defence?.options ?? a.roll?.options ?? null
  return a.roll?.options ?? null
}

/** Chronicle labels for non-action log rows */
export const LOG_LABELS: Record<string, string> = {
  prologue: 'Prolog',
  logos_roll: 'Rzut Logos',
  rest: 'Odpoczynek',
  transfer: 'Przekazanie mocy',
  followers_gain: 'Danina',
  followers_loss: 'Kara',
  dice: 'Rzut kośćmi',
  chaos_reveal: 'Karta Chaosu',
  chaos_choice: 'Chaos',
  chaos_answer: 'Chaos: odpowiedź',
  chaos_notes: 'Chaos: ustalenia',
  entity_edit: 'Zmiana w świecie',
  entity_removed: 'Usunięcie',
  city_destroyed: 'Ruina',
  cities_grow: 'Miasta rosną',
  night_begin: 'Noc Chaosu',
  night_move: 'Noc: wędrówka',
  night_fight: 'Noc: walka',
  night_city: 'Noc: miasto',
  night_city_founded: 'Noc: nowe miasto',
  night_plague: 'Noc: plaga',
  night_drought: 'Noc: susza',
  dots_reward: 'Dary wyznawców',
  contest_declared: 'Starcie',
  contest_cancelled: 'Starcie odwołane',
  command_avatar: 'Rozkaz dla Awatara',
  prophecy_fulfilled: 'Proroctwo spełnione',
  avatars_heal: 'Awatary leczą rany',
  round_end: 'Koniec rundy',
  era_advance: 'Nowa Era',
  game_start: 'Początek',
  game_end: 'Epilog',
}
