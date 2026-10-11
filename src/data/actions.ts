// The words of O BOGOWIE!, grouped the way the table wants them. Costs are per Era: [I, II, III].
// Keys match action_cost() in supabase/migrations/0012_hex_map.sql. Most words act on the map.
import type { ActionLog, AttrKey, Entity, Player } from '@/lib/types'
import type { WorldView } from '@/lib/world'
import { SAPIENT_TRAITS } from './traits'
import { isMountain } from './fertility'
import { neighbours } from '@/lib/hex'

export type ActionKey =
  | 'shape_land'
  | 'catastrophe'
  | 'great_miracle'
  | 'bless_land'
  | 'pour_river'
  | 'create_beast'
  | 'create_herd'
  | 'multiply'
  | 'create_sapient'
  | 'change_creature'
  | 'migrate'
  | 'create_civilization'
  | 'develop_civilization'
  | 'exodus'
  | 'convert'
  | 'holy_war'
  | 'create_avatar'
  | 'pilgrimage'
  | 'resurrect_avatar'
  | 'avatar_duel'
  | 'prophecy'

export type Era = 1 | 2 | 3
export type ActionCategoryKey = 'terraform' | 'life' | 'mortals' | 'avatar' | 'words'

/** the steps of a word's window, in order; 'map' hands the choice to the map */
/** how far the avatar reaches: the fields its words, its duels and its exoduses may begin on */
export const AVATAR_REACH = 2

/** 'roll' is the last step of a rolled word: two attribute tiles, a click pays and throws */
export type FlowStep = 'via' | 'map' | 'form' | 'confirm' | 'verse' | 'roll'

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

export const ACTION_CATEGORIES: { key: ActionCategoryKey; name: string }[] = [
  { key: 'terraform', name: 'Terraformacja' },
  { key: 'life', name: 'Tworzenie Życia' },
  { key: 'mortals', name: 'Śmiertelnicy' },
  { key: 'avatar', name: 'Działania Awatara' },
  { key: 'words', name: 'Proroctwa i Słowa' },
]

export const isSapient = (e: Entity) => e.kind === 'creature' && e.traits.some((t) => SAPIENT_TRAITS.includes(t))

const anyCreatureOnMap = (w: WorldView) => w.hexes.some((h) => w.occupantsAt(h.q, h.r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'))
const anyCityOnMap = (w: WorldView) => w.cities.length > 0
const sapientCanSettle = (w: WorldView) =>
  w.hexes.some((h) => !w.blocked(h.q, h.r) && !w.cityAt(h.q, h.r) && w.occupantsAt(h.q, h.r).some((o) => w.isSapient(w.entityById(o.entity_id))))
const myCities = (w: WorldView, me: Player | null) => (me ? w.cities.filter((c) => w.dotsOf(c.entity_id, me.id) > 0) : [])
const rivalCities = (w: WorldView, me: Player | null) => (me ? w.cities.filter((c) => w.followersOf(c.entity_id).some((f) => f.player_id !== me.id)) : [])
const aliveAvatar = (w: WorldView, me: Player | null) => !!me && w.avatarsOf(me.id).length > 0
const unblessedLand = (w: WorldView) => w.hexes.some((h) => h.biome !== 'woda' && !h.resource)
const riverSource = (w: WorldView) =>
  w.hexes.some((h) => isMountain(h.biome) && !w.riverAt(h.q, h.r) && neighbours(h).some((n) => { const b = w.hexAt(n.q, n.r)?.biome; return !!b && !isMountain(b) }))

export const ACTIONS: ActionDef[] = [
  // ---------- Terraformacja ----------
  {
    key: 'shape_land',
    name: 'Kształtowanie Lądów',
    category: 'terraform',
    costs: [2, 5, 12],
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Wybierz biom i zaznacz do trzech sąsiadujących heksów. Ląd zmienia się od razu.',
    details: [
      'Ta akcja zmienia teren świata: góry, lasy, pustynie, stepy, tundry, bagna, sawanny, morza i śniegi. Wybierz biom, a potem kliknij na mapie od jednego do trzech heksów. Każdy kolejny heks musi sąsiadować z już zaznaczonym; trzeci klik kończy akcję sam.',
      'Woda i Góry są zablokowane: nie powstanie na nich miasto, nie dojdzie tam Exodus i nie stanie tam awatar. Istoty mogą tam żyć. Heksu, na którym stoi miasto lub awatar, nie da się zatopić ani wypiętrzyć.',
      'Czy ląd pojawia się natychmiast, czy zmienia się powoli przez dekady? To opowiedz w wersecie.',
    ],
  },
  {
    key: 'catastrophe',
    name: 'Kataklizm',
    category: 'terraform',
    costs: [10, 10, 10],
    flow: ['form', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'wrath', line: 'Ukarz bezbożników świętym gniewem bożym!' },
        { attr: 'element', line: 'Uwolnij ślepą potęgę dzikiej natury!' },
      ],
      tiers: {
        strong: 'Obrażeń jest połowa wyniku. Gdy nikt nie przeżyje, ziemia zmienia się tak, jak chciano.',
        mixed: 'Obrażeń jest ćwierć wyniku, najmniej jedno. Ziemia zostaje, jaka była.',
        weak: 'Kataklizm wygasa, nie raniąc nikogo. Logos przepada.',
      },
    },
    summary: 'Wybierz rodzaj kataklizmu, heks i co zostanie po zniszczeniu, potem Gniew albo Żywioł. Obrażenia: połowa z 2k6 + atrybut przy 10+, ćwierć przy 7..9, nic przy 6-.',
    details: [
      'Bóstwa muszą czasem okazać swój gniew. Wybierz rodzaj kataklizmu (deszcz ognia, tsunami, susza, trzęsienie ziemi, meteor, plaga albo własny), a potem kliknij heks. Na koniec wybierz, czy uderza Gniew, czy Żywioł: kości rzuca księga, 2k6 plus atrybut. Przy 10+ obrażeń jest połowa wyniku (w dół), przy 7..9 ćwierć (najmniej jedno), przy 6- kataklizm wygasa, a Logos przepada.',
      'Możesz wybrać, co zostanie po zniszczeniu: pustynia, ugór albo woda. Ziemia zmienia się tylko wtedy, gdy na polu nikt nie przeżyje: miasto obróci się w ruinę, istoty przepadną, awatar zginie. Jeśli ktokolwiek przeżyje, teren zostaje bez zmian.',
      'Każde obrażenie trafia losowo w to, co stoi na heksie: w jednego wyznawcę miasta (losowego bóstwa), w jedną istotę nierozumną (znika z tego pola) albo w awatara (traci jedno życie). Istoty rozumne giną dopiero wtedy, gdy nie ma już miasta. Miasto bez wyznawców staje się ruiną.',
      'Kataklizm jest lokalny. Aby wpłynąć na świat na większą skalę, użyj Wielkiego Cudu.',
    ],
  },
  {
    key: 'great_miracle',
    name: 'Wielki Cud',
    category: 'terraform',
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
        weak: 'Świat nie drgnął. Logos przepada, a awatar, który miał spłonąć, żyje.',
      },
    },

    summary: 'Coś WIELKIEGO na skalę całego świata. Nie ma ograniczeń. Użyj, gdy chcesz pójść na całość.',
    details: [
      'Czasem chcesz zrobić coś WIELKIEGO, co nie do końca pasuje do żadnej z pozostałych akcji. Być może chcesz określić coś prawdziwego na całym świecie: wskrzesić wszystkich, którzy zginęli podczas nuklearnej zimy, albo sprawić, by cały kontynent unosił się w przestworzach.',
      'Nie ma ograniczeń co do rzeczy, które można określić tą akcją. Użyj jej, gdy chcesz pójść na całość, naprawdę na całość.',
      'Kości rzuca księga: 2k6 plus Majestat albo Mądrość. Przy 10+ cud zachodzi w pełni, przy 7..9 zachodzi, lecz ma cenę, którą opowiesz w wersecie, przy 6- świat nie drgnie, a Logos przepada.',
      'Jeśli Wielkiego Cudu użyje awatar, ulega on zniszczeniu i musi zostać wskrzeszony (chyba że cud się nie udał).',
    ],
  },
  {
    key: 'bless_land',
    name: 'Pobłogosław ziemię',
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
      'Każdy ląd ma Żyzność: liczbę u góry heksa. Trawa i puszcza dają dwa, góry, dżungla i bagno jeden, pustynia, śnieg, ugór i góry pustynne lub śnieżne nic. Sąsiedztwo wody dodaje jeden, rzeka jeden (na pustyni trzy), stado jeden, surowiec jeden.',
      'Błogosławieństwo kładzie na polu jeden surowiec: klejnoty, zboże, drewno, żelazo, winorośl, owoce, kukurydzę, glinę, złoto, kamień albo bulwy. Jeden surowiec na pole, na zawsze; góry też go przyjmą, woda nie.',
      'Żyzność karmi stada i miasta: w nocy Chaosu miasto rzuca k6 przeciw Żyzności swojego pola i rośnie, gdy wyrzuci mniej.',
    ],
    requirement: { text: 'ląd bez surowca', check: (w) => unblessedLand(w) },
  },
  {
    key: 'pour_river',
    name: 'Wylej Rzekę',
    category: 'terraform',
    costs: [3, 8, 12],
    flow: ['map', 'confirm', 'verse'],
    summary: 'Kliknij górę, potem kolejne sąsiednie pola, aż do wody albo innej rzeki. Każde pole z rzeką ma Żyzność większą o jeden, pustynia o trzy.',
    details: [
      'Rzeka wypływa z góry: kliknij ją jako źródło, a potem kolejne pola, każde sąsiadujące z poprzednim. Rzeka nie płynie pod górę ani nie zawraca. Klik w wodę kończy ją ujściem, klik w pole z inną rzeką czyni ją dopływem.',
      'Gdy rzeka nie ma dokąd płynąć, przerwij słowo i zacznij od innej góry. Cena jest stała, niezależna od długości.',
      'Każde pole, przez które płynie rzeka, ma Żyzność większą o jeden (dwie rzeki nie dodają się). Rzeka na pustyni to Nil: trzy zamiast jednego. Góra, którą ktoś potem wypiętrzy na jej drodze, przecina rzekę; ten, kto ją wypiętrzył, od razu wyklikuje nowe koryto.',
    ],
    requirement: { text: 'góra z lądem obok', check: (w) => riverSource(w) },
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
      'Tak jak Stworzenie Istoty, ale to, co powstaje, ma świadomość, język i zdolność do kultury. Od tej pory na heksie, gdzie żyje, można założyć cywilizację.',
      'Nazwij lud, wybierz emotikonę i kliknij heks (nie Wodę, nie Góry). Lud stoi na dole heksa, tam gdzie bestia: jedno z dwojga na pole. Potem wybierz Majestat albo Mądrość: księga rzuca 2k6 plus atrybut. Przy 10+ lud jest liczny i obsadza też najżyźniejsze wolne pole obok, przy 7..9 staje tylko tam, gdzie wskazano, przy 6- nie powstaje.',
      'Bez miasta lud jest plemieniem: w nocy Chaosu obozuje, wędruje ku żyznej ziemi, udomawia stada, walczy z bestiami (siła 0), a na szóstce na ziemi o Żyzności co najmniej jeden zakłada miasto, które nazywa jego bóstwo. Lud w mieście nie wędruje.',
    ],
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
        strong: 'Odmiana silniejsza od pierwowzoru: siła lub ranga o jeden wyżej (do +3).',
        mixed: 'Odmiana o sile pierwowzoru.',
        weak: 'Istoty pozostały sobą. Logos przepada.',
      },
    },

    summary: 'Kliknij jedną istotę na jednym heksie: tam powstaje jej odmiana z nową nazwą i znakiem.',
    details: [
      'Kliknij istotę na mapie. Tylko ta jedna, na tym jednym heksie, odmienia się: gdy niedźwiedzie żyją na dwóch polach, kliknięcie jednego z nich daje tam niedźwiedzia polarnego, a na drugim polu zostają zwykłe niedźwiedzie.',
      'Odmiana to nowa istota: nadaj jej nazwę i wolną emotikonę, a w wersecie opowiedz, czym różni się od pierwowzoru. Dotyczy to tak samo istot rozumnych.',
      'Wybierz Podszept albo Żywioł: księga rzuca 2k6 plus atrybut. Przy 10+ odmiana jest silniejsza od pierwowzoru (siła bestii lub ranga stada o jeden wyżej, do +3), przy 7..9 dziedziczy jego siłę, przy 6- nic się nie zmienia.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },
  {
    key: 'migrate',
    name: 'Migracja',
    category: 'life',
    costs: [3, 1, 3],
    distance: true,
    flow: ['map', 'map', 'roll'],
    roll: {
      options: [
        { attr: 'whisper', line: 'Ześlij wizje ziemi obiecanej.' },
        { attr: 'element', line: 'Wypędź ich z ziemi pogodą.' },
      ],
      tiers: {
        strong: 'Gatunek mnoży się: żyje odtąd w obu miejscach.',
        mixed: 'Gatunek przenosi się: opuszcza stare pole.',
        weak: 'Nikt nie ruszył. Logos i dystans przepadają.',
      },
    },
    summary: 'Kliknij istotę, potem heks docelowy, potem Podszept albo Żywioł. 10+: gatunek mnoży się na nowe pole, 7..9: przenosi się. Do ceny dochodzi 1 Logos za każdy heks dystansu.',
    details: [
      'Kliknij heks z istotą i wybierz, którą istotę to dotyczy; potem kliknij heks, na który się rozprzestrzenia. Na koniec wybierz Podszept albo Żywioł: księga rzuca 2k6 plus atrybut. Przy 10+ gatunek mnoży się i żyje odtąd w obu miejscach, przy 7..9 przenosi się i opuszcza stare pole, przy 6- nikt nie rusza.',
      'Do ceny słowa dochodzi dystans: 1 Logos za każdy heks; mapa podświetla tylko tyle, na ile cię stać. Na docelowym heksie musi być wolne miejsce (trzy na heks), tego gatunku nie może tam jeszcze być, a Woda i Góry odpadają.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },
  {
    key: 'multiply',
    name: 'Rozmnożenie',
    category: 'life',
    costs: [5, 2, 6],
    flow: ['map', 'roll'],
    roll: {
      options: [
        { attr: 'grace', line: 'Błogosław lud obfitością narodzin i witalnością.' },
        { attr: 'element', line: 'Rozbudź w nich szalony instynkt rozmnażania.' },
      ],
      tiers: {
        strong: 'Dwie kopie: na dwóch najżyźniejszych wolnych polach obok.',
        mixed: 'Jedna kopia na losowym wolnym polu obok.',
        weak: 'Nie przybyło nikogo. Logos przepada.',
      },
    },
    summary: 'Kliknij istotę (stado, bestię albo plemię), potem Łaskę albo Żywioł. 10+: kopie na dwóch najżyźniejszych wolnych polach obok, 7..9: jedna na losowym.',
    details: [
      'Kliknij istotę na mapie: stado, bestię albo plemię. Potem wybierz Łaskę albo Żywioł; księga rzuca 2k6 plus atrybut.',
      'Przy 10+ gatunek pojawia się na dwóch najżyźniejszych wolnych polach sąsiadujących z klikniętym (na jednym, gdy tylko jedno jest wolne). Przy 7..9 na jednym losowym wolnym polu obok. Przy 6- nie przybywa nikogo.',
      'Wolne pole to takie, na którym jest miejsce dla tego rodzaju istoty: lewy górny róg dla stada, dół heksa dla bestii i plemienia. Woda odpada, góry tylko dla stad i bestii. Kopie dziedziczą siłę gatunku.',
    ],
    requirement: { text: 'istota z wolnym polem obok', check: (w) => anyCreatureOnMap(w) },
  },

  // ---------- Śmiertelnicy ----------
  {
    key: 'create_civilization',
    name: 'Stworzenie Cywilizacji',
    category: 'mortals',
    costs: [22, 12, 6],
    entityKind: 'civilization',
    entityOp: 'create',
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'wisdom', line: 'Natchnij ich umysły wizją praw, społeczeństwa i porządku.' },
        { attr: 'grace', line: 'Zapewnij im bezpieczeństwo, by sami zapragnęli osiąść.' },
      ],
      tiers: {
        strong: 'Miasto rodzi się z dwoma twoimi wyznawcami.',
        mixed: 'Miasto rodzi się z jednym twoim wyznawcą.',
        weak: 'Lud nie osiadł. Logos przepada.',
      },
    },

    summary: 'Kliknij heks z istotą rozumną i nazwij lud. Miasto rodzi się z pierwszymi wyznawcami w twoim kolorze.',
    details: [
      'To są ludy świata: nie zwierzęta, ale istoty zdolne do kultury. Kliknij heks, na którym żyje istota rozumna (albo o umyśle roju) i który nie jest Wodą ani Górami. Na jednym heksie stoi jedno miasto.',
      'Nazwij lud i opowiedz w wersecie, jak wygląda i jaka jest jego kultura.',
      'Wybierz Mądrość albo Łaskę: księga rzuca 2k6 plus atrybut. Przy 10+ miasto rodzi się z dwoma twoimi wyznawcami, przy 7..9 z jednym, przy 6- lud nie osiada. Miasto może gromadzić wyznawców wielu bóstw; rządzi nim to, które ma ich najwięcej.',
    ],
    requirement: { text: 'istota rozumna na wolnym lądzie', check: (w) => sapientCanSettle(w) },
  },
  {
    key: 'develop_civilization',
    name: 'Rozwój Cywilizacji',
    category: 'mortals',
    costs: [12, 8, 4],
    flow: ['map', 'form', 'roll'],
    roll: {
      options: [
        { attr: 'grace', line: 'Ześlij dar obfitości, pozwalając wzrastać w pokoju.' },
        { attr: 'wisdom', line: 'Podaruj im wiedzę i technologię, taką jak pismo czy ogień.' },
      ],
      tiers: {
        strong: 'Dwóch nowych wyznawców w mieście.',
        mixed: 'Jeden nowy wyznawca.',
        weak: 'Dar odrzucony. Logos przepada.',
      },
    },
    summary: 'Kliknij miasto i napisz, co ofiarowujesz wyznawcom. Księga rzuca 2k6 + Łaska albo Mądrość: 10+ to dwóch wyznawców, 7..9 to jeden.',
    details: [
      'Ofiarowujesz coś wyznawcom: ogień, oliwki, rolnictwo, pismo, wielką budowlę. Kliknij miasto, napisz, co dajesz, i wybierz, czy wspiera cię Łaska, czy Mądrość. Kości rzuca księga: 2k6 plus atrybut.',
      'Przy 10+ miasto zyskuje dwóch twoich wyznawców, przy 7..9 jednego. Przy 6- dar nie chwyta: Logos przepadają, a księga odnotowuje, co odrzucono. Miasto mieści najwyżej dziesięciu wyznawców.',
      'Przyjęte dary zostają w karcie miasta na zawsze.',
    ],
    requirement: { text: 'musi istnieć miasto', check: (w) => anyCityOnMap(w) },
  },
  {
    key: 'exodus',
    name: 'Exodus',
    category: 'mortals',
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

    summary: 'Z miasta, w którym masz wyznawców, zabierz ich część i istotę rozumną na nowy heks. Tam powstaje twoje miasto; do ceny dochodzi 1 Logos za heks.',
    details: [
      'Kliknij miasto, w którym masz wyznawców, i wybierz, ilu wyznawców zabierasz oraz którą istotę rozumną (jeśli żyje tam kilka). Potem kliknij heks docelowy: nie Wodę i nie Góry.',
      'Do ceny słowa dochodzi dystans: 1 Logos za każdy heks. Na nowym heksie powstaje nowe miasto z twoimi wyznawcami i znakiem zabranej istoty; dziedziczy cechy i dary macierzystego. Jeśli na celu stoi już miasto, twoi wyznawcy i istota dołączają do niego.',
      'Wybierz Gniew albo Podszept: księga rzuca 2k6 plus atrybut. Przy 10+ wszyscy dochodzą, a nowe miasto dziedziczy dary macierzystego. Przy 7..9 jeden ginie w drodze (gdy wyszło ich co najmniej dwóch), a nowe miasto nie dziedziczy darów. Przy 6- nikt nie wychodzi.',
      'Miasto, z którego wyszli wszyscy, staje się ruiną.',
    ],
    requirement: { text: 'miasto z twoimi wyznawcami', check: (w, me) => myCities(w, me).length > 0 },
  },
  {
    key: 'convert',
    name: 'Nawracanie',
    category: 'mortals',
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
    summary: 'Kliknij miasto i wskaż, czyich wyznawców nawracasz. Rzut sporny: 2k6 + Majestat albo Podszept; obrońca odpowiada Majestatem albo Mądrością.',
    details: [
      'Kliknij miasto, w którym inne bóstwo ma wyznawców, i wskaż to bóstwo. Wybierz, czy działasz Majestatem, czy Podszeptem; kości rzuca księga. Broniące się bóstwo odpowiada u siebie: wybiera Majestat albo Mądrość i rzuca. Twoja tura czeka na jego odpowiedź.',
      'Jeśli wygrasz o 3 lub więcej, dwóch jego wyznawców przechodzi na twoją stronę; jeśli o 1 lub 2, jeden. Remis i przegrana nie zmieniają nic. Logos płacisz przy deklaracji.',
    ],
    requirement: { text: 'miasto z cudzymi wyznawcami', check: (w, me) => rivalCities(w, me).length > 0 },
  },
  {
    key: 'holy_war',
    name: 'Święta Wojna',
    category: 'mortals',
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

    summary: 'Z miasta, w którym rządzisz, wyślij armię wyznawców na cudze miasto. Do ceny dochodzi 1 Logos za heks. Obie strony rzucają 2k6 + atrybut + siły.',
    details: [
      'Wybierz swoje miasto (takie, w którym masz najwięcej wyznawców) i zdecyduj, ilu swoich wyznawców zabierasz: to twoja Armia. Co najmniej jeden zostaje w domu. Wybierz cel i broniące się bóstwo. Do ceny słowa dochodzi 1 Logos za każdy heks dystansu między miastami.',
      'Atakujący rzuca 2k6 + Gniew albo Podszept + wielkość Armii; jeśli wojnę wypowiada przez awatara, ten prowadzi lud jak generał i dolicza swoje życie. Obrońca rzuca 2k6 + Łaska (mury i tarcze) albo Gniew (wyjście przed mury) + liczba swoich wyznawców w atakowanym mieście + życie swojego awatara, jeśli stoi w tym mieście. Różnica wyników decyduje.',
      'Wygrana o 3+: wymazujesz tylu wyznawców wroga, ilu liczy Armia; połowa z nich (w górę) staje się twoimi wyznawcami w tym mieście, Armia wraca cała. Wygrana o 1..2: to samo, lecz tracisz połowę Armii. Remis: obie strony tracą po jednym wyznawcy, Armia wraca. Przegrana o 1..2: wraca jeden, obrońca traci jednego. Przegrana o 3+: Armia ginie co do jednego, miasto nietknięte.',
    ],
    requirement: { text: 'miasto, w którym rządzisz, i cudze miasto', check: (w, me) => !!me && w.cities.some((c) => w.holds(c.entity_id, me.id)) && rivalCities(w, me).length > 0 },
  },

  // ---------- Działania Awatara ----------
  {
    key: 'create_avatar',
    name: 'Zesłanie Awatara',
    category: 'avatar',
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

    summary: 'Most między boskością a śmiertelnikami: własny znak, miejsce na mapie, 3 punkty życia. Co rundę 1 darmowa akcja.',
    details: [
      'Gdy zsyłasz awatara, tworzysz coś, co przerzuca most nad przepaścią między boskością a śmiertelnikami. Twoje awatary nie są tobą, lecz twoim przedłużeniem. Mogą mieć własne pragnienia i ambicje, a nawet ulegać wpływom innych bóstw.',
      'Awatar staje na wybranym heksie (nie na Wodzie ani w Górach), nosi własny znak i ma 2 punkty życia; Kataklizm, wojna i walka mogą go ranić, a sen Fazy Chaosu leczy jedno życie. Gdy życie spadnie do zera, ginie i wraca tylko przez Wskrzeszenie. Każde kolejne wcielenie wraca o jedno życie silniejsze, najwyżej dwanaście.',
      'Wybierz Majestat albo Podszept: księga rzuca 2k6 plus atrybut. Przy 10+ awatar zstępuje z pełnym życiem, przy 7..9 ranny (o jedno życie mniej, sen go uleczy), przy 6- nie zstępuje wcale.',
      'Awatar to ręka bóstwa na ziemi: słowa Terraformacji, Tworzenia Życia i Śmiertelników wypowiedziane przez niego kosztują połowę, lecz ich cel musi leżeć najwyżej dwa heksy od niego. Na wojnę idzie jak generał: jego życie dolicza się do rzutu armii, a gdy stoi w atakowanym mieście, do rzutu obrony. Wielki Cud przez awatara spala go.',
    ],
  },
  {
    key: 'pilgrimage',
    name: 'Pielgrzymka Awatara',
    category: 'avatar',
    costs: [0, 0, 0],
    distance: true,
    flow: ['map', 'map', 'confirm', 'verse'],
    summary: 'Awatar rusza w drogę: 1 Logos za każdy heks, bez granicy. Kliknij awatara, potem pole.',
    details: [
      'Awatar to ręka bóstwa na ziemi i sięga tylko dwa heksy od siebie. Pielgrzymka przenosi go tam, gdzie ma działać: na pole z wolnym miejscem, nie na Wodę ani w Góry.',
      'Koszt to dystans: 1 Logos za każdy heks drogi, bez górnej granicy. Świecą tylko pola, na które cię stać.',
      'W drodze awatar nie czyni cudów; dopiero z nowego miejsca wypowiada słowa za połowę ceny, rusza na wojnę, nawraca albo staje do walki.',
    ],
    requirement: { text: 'musi istnieć twój żywy awatar', check: (w, me) => aliveAvatar(w, me) },
  },
  {
    key: 'resurrect_avatar',
    name: 'Wskrzeszenie Awatara',
    category: 'avatar',
    costs: [12, 15, 16],
    entityKind: 'avatar',
    entityOp: 'update',
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Awatar wraca na wybrany heks z pełnym życiem, lecz zawsze nieco inny. Możesz wskrzesić awatara innego bóstwa.',
    details: [
      'Jest wiele sposobów, na jakie awatar może spotkać nieszczęśliwy koniec. Gdy tak się stanie, ta akcja jest jedyną opcją, jeśli chcesz, by ten awatar nadal istniał w świecie. Kliknij heks, na którym powraca.',
      'Wskrzeszone awatary zawsze wracają nieco inne. Opisz, jak zmieniła go śmierć. Możesz wskrzeszać poległe awatary innych bóstw; traktuj takiego awatara jako mającego odtąd wielu twórców.',
    ],
    requirement: { text: 'musi umrzeć awatar', check: (w) => w.entities.some((e) => e.kind === 'avatar' && e.status === 'dead') },
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
    requirement: { text: 'musi istnieć twój żywy awatar na mapie', check: (w, me) => !!me && w.avatarsOf(me.id).some((a) => !!a.occupant) },
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
    return !!occ && mine.some((a) => Math.max(Math.abs(a.occupant!.q - occ.q), Math.abs(a.occupant!.r - occ.r), Math.abs(a.occupant!.q + a.occupant!.r - occ.q - occ.r)) <= AVATAR_REACH)
  })
}

export const ACTION_BY_KEY: Record<ActionKey, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
) as Record<ActionKey, ActionDef>

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
 * The word behind a book row. Rows written before 0023 carry 'create_creature'; they read as a beast
 * or a herd by the role in their outcome, so the old verses keep their openers and their art.
 */
export function logActionKey(l: Pick<ActionLog, 'action_key' | 'outcome'>): ActionKey | undefined {
  if (l.action_key === 'create_creature') {
    const o = (l.outcome && !Array.isArray(l.outcome) ? l.outcome : {}) as Record<string, unknown>
    return o.role === 'beast' ? 'create_beast' : 'create_herd'
  }
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

/** the words an avatar may speak for its god: half the price, the target within two fields */
const VIA_AVATAR = new Set<ActionKey>(['shape_land', 'catastrophe', 'great_miracle', 'bless_land', 'pour_river', 'create_beast', 'create_herd', 'create_sapient', 'change_creature', 'migrate', 'multiply', 'create_civilization', 'develop_civilization', 'exodus', 'convert', 'holy_war'])
export function viaAvatarAllowed(key: ActionKey): boolean {
  return VIA_AVATAR.has(key)
}
/** what a word costs when the avatar speaks it */
export function viaAvatarCost(cost: number): number {
  return Math.ceil(cost / 2)
}
