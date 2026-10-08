// The words of O BOGOWIE!, grouped the way the table wants them. Costs are per Era: [I, II, III].
// Keys match action_cost() in supabase/migrations/0012_hex_map.sql. Most words act on the map.
import type { Entity, Player } from '@/lib/types'
import type { WorldView } from '@/lib/world'
import { SAPIENT_TRAITS } from './traits'

export type ActionKey =
  | 'shape_land'
  | 'catastrophe'
  | 'great_miracle'
  | 'create_creature'
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

export type FlowStep = 'via' | 'setup' | 'roll' | 'map' | 'form' | 'confirm' | 'verse' | 'declare'

export interface TierText {
  strong: string // 10+
  mixed: string // 7–9
  weak: string // 6−
}

/** how many things the roll lets you pick, and how many the other players pick for you */
export interface TierPicks {
  traits?: number
  specialties?: number
  flaws?: number
  otherTraits?: number
  otherFlaws?: number
}
export type Tier = 'strong' | 'mixed' | 'weak'

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
  /** a 2k6 with picks before the form (Stworzenie Cywilizacji); other dice are rolled by the server */
  requiresRoll: boolean
  /** which kind of entity the action creates or edits, if any */
  entityKind?: 'creature' | 'civilization' | 'avatar'
  entityOp?: 'create' | 'update'
  /** waits for the defender's answer (Nawracanie, Święta Wojna) */
  contested?: boolean
  flow: FlowStep[]
  /** one-line summary shown in the dialog */
  summary: string
  /** full rules text, one paragraph per entry */
  details: string[]
  requirement?: ActionRequirement
  tiers?: TierText
  /** structured limits per roll result, for actions that create something */
  picks?: Record<Tier, TierPicks>
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

export const ACTIONS: ActionDef[] = [
  // ---------- Terraformacja ----------
  {
    key: 'shape_land',
    name: 'Kształtowanie Lądów',
    category: 'terraform',
    costs: [2, 5, 12],
    requiresRoll: false,
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
    requiresRoll: false,
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Wybierz rodzaj kataklizmu, heks i co zostanie po zniszczeniu. Obrażenia: połowa z 2k6 + Gniew. Każde zabiera miastu wyznawcę, zabija istotę albo rani awatara.',
    details: [
      'Bóstwa muszą czasem okazać swój gniew. Wybierz rodzaj kataklizmu (deszcz ognia, tsunami, susza, trzęsienie ziemi, meteor, plaga albo własny), a potem kliknij heks. Kości rzuca księga: 2k6 plus twój Gniew, a obrażeń jest połowa tego wyniku (w dół), najmniej jedno.',
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
    requiresRoll: false,
    flow: ['confirm', 'verse'],
    summary: 'Coś WIELKIEGO na skalę całego świata. Nie ma ograniczeń. Użyj, gdy chcesz pójść na całość.',
    details: [
      'Czasem chcesz zrobić coś WIELKIEGO, co nie do końca pasuje do żadnej z pozostałych akcji. Być może chcesz określić coś prawdziwego na całym świecie: wskrzesić wszystkich, którzy zginęli podczas nuklearnej zimy, albo sprawić, by cały kontynent unosił się w przestworzach.',
      'Nie ma ograniczeń co do rzeczy, które można określić tą akcją. Użyj jej, gdy chcesz pójść na całość, naprawdę na całość.',
      'Jeśli Wielkiego Cudu użyje awatar, ulega on zniszczeniu i musi zostać wskrzeszony.',
    ],
  },

  // ---------- Tworzenie Życia ----------
  {
    key: 'create_creature',
    name: 'Stworzenie Istoty',
    category: 'life',
    costs: [10, 3, 12],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'create',
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Nowy gatunek z własną emotikoną. Potem kliknij ląd, na którym się pojawia.',
    details: [
      'Zwierzęta i rośliny wszelkiego rodzaju powstają same wskutek kształtowania lądów, ale czasem chcesz stworzyć coś bardziej konkretnego: cały gatunek z własnym znakiem na mapie. Nazwij go i wybierz emotikonę, której nikt jeszcze nie nosi.',
      'Potem kliknij heks: istota zajmuje jedno z trzech miejsc w jego rogach. Na Wodzie ani w Górach nikt nie zamieszka.',
      'Istoty nierozumne nie założą cywilizacji. Do tego służy Stworzenie Istoty Rozumnej.',
    ],
  },
  {
    key: 'create_sapient',
    name: 'Stworzenie Istoty Rozumnej',
    category: 'life',
    costs: [15, 4, 18],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'create',
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Lud zdolny do kultury: swój znak i miejsce na lądzie. Tam, gdzie żyje, można założyć cywilizację.',
    details: [
      'Tak jak Stworzenie Istoty, ale to, co powstaje, ma świadomość, język i zdolność do kultury. Od tej pory na heksie, gdzie żyje, można założyć cywilizację.',
      'Nazwij lud, wybierz emotikonę i kliknij heks (nie Wodę, nie Góry). Zastanów się, jak myślą i co uznają za święte.',
    ],
  },
  {
    key: 'change_creature',
    name: 'Zmiana Istoty',
    category: 'life',
    costs: [5, 1, 6],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'update',
    flow: ['map', 'form', 'confirm', 'verse'],
    summary: 'Kliknij jedną istotę na jednym heksie: tam powstaje jej odmiana z nową nazwą i znakiem.',
    details: [
      'Kliknij istotę na mapie. Tylko ta jedna, na tym jednym heksie, odmienia się: gdy niedźwiedzie żyją na dwóch polach, kliknięcie jednego z nich daje tam niedźwiedzia polarnego, a na drugim polu zostają zwykłe niedźwiedzie.',
      'Odmiana to nowa istota: nadaj jej nazwę i wolną emotikonę, a w wersecie opowiedz, czym różni się od pierwowzoru. Dotyczy to tak samo istot rozumnych.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },
  {
    key: 'migrate',
    name: 'Migracja',
    category: 'life',
    costs: [3, 1, 3],
    distance: true,
    requiresRoll: false,
    flow: ['map', 'map', 'confirm', 'verse'],
    summary: 'Kliknij istotę, potem heks docelowy. Gatunek mnoży się na nowe pole; do ceny dochodzi 1 Logos za każdy heks dystansu.',
    details: [
      'Kliknij heks z istotą i wybierz, którą istotę to dotyczy; potem kliknij heks, na który się rozprzestrzenia. Migracja nie opróżnia starego pola: gatunek mnoży się i żyje odtąd w obu miejscach.',
      'Do ceny słowa dochodzi dystans: 1 Logos za każdy heks; mapa podświetla tylko tyle, na ile cię stać. Na docelowym heksie musi być wolne miejsce (trzy na heks), tego gatunku nie może tam jeszcze być, a Woda i Góry odpadają.',
    ],
    requirement: { text: 'musi istnieć istota na mapie', check: (w) => anyCreatureOnMap(w) },
  },

  // ---------- Śmiertelnicy ----------
  {
    key: 'create_civilization',
    name: 'Stworzenie Cywilizacji',
    category: 'mortals',
    costs: [22, 12, 6],
    requiresRoll: false,
    entityKind: 'civilization',
    entityOp: 'create',
    flow: ['map', 'form', 'confirm', 'verse'],
    summary: 'Kliknij heks z istotą rozumną i nazwij lud. Miasto rodzi się z pierwszymi wyznawcami w twoim kolorze.',
    details: [
      'To są ludy świata: nie zwierzęta, ale istoty zdolne do kultury. Kliknij heks, na którym żyje istota rozumna (albo o umyśle roju) i który nie jest Wodą ani Górami. Na jednym heksie stoi jedno miasto.',
      'Nazwij lud i opowiedz w wersecie, jak wygląda i jaka jest jego kultura.',
      'Miasto powstaje jako Koczowisko z pierwszymi wyznawcami w twoim kolorze. Miasto może gromadzić wyznawców wielu bóstw; rządzi nim to, które ma ich najwięcej.',
    ],
    requirement: { text: 'istota rozumna na wolnym lądzie', check: (w) => sapientCanSettle(w) },
  },
  {
    key: 'develop_civilization',
    name: 'Rozwój Cywilizacji',
    category: 'mortals',
    costs: [12, 8, 4],
    requiresRoll: false,
    flow: ['map', 'form', 'confirm', 'verse'],
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
    requiresRoll: false,
    flow: ['map', 'form', 'map', 'confirm', 'verse'],
    summary: 'Z miasta, w którym masz wyznawców, zabierz ich część i istotę rozumną na nowy heks. Tam powstaje twoje miasto; do ceny dochodzi 1 Logos za heks.',
    details: [
      'Kliknij miasto, w którym masz wyznawców, i wybierz, ilu wyznawców zabierasz oraz którą istotę rozumną (jeśli żyje tam kilka). Potem kliknij heks docelowy: nie Wodę i nie Góry.',
      'Do ceny słowa dochodzi dystans: 1 Logos za każdy heks. Na nowym heksie powstaje nowe miasto z twoimi wyznawcami i znakiem zabranej istoty; dziedziczy cechy i dary macierzystego. Jeśli na celu stoi już miasto, twoi wyznawcy i istota dołączają do niego.',
      'Miasto, z którego wyszli wszyscy, staje się ruiną.',
    ],
    requirement: { text: 'miasto z twoimi wyznawcami', check: (w, me) => myCities(w, me).length > 0 },
  },
  {
    key: 'convert',
    name: 'Nawracanie',
    category: 'mortals',
    costs: [6, 4, 3],
    requiresRoll: false,
    contested: true,
    flow: ['map', 'form', 'declare'],
    summary: 'Kliknij miasto i wskaż, czyich wyznawców nawracasz. Rzut sporny: 2k6 + Majestat albo Podszept po obu stronach.',
    details: [
      'Kliknij miasto, w którym inne bóstwo ma wyznawców, i wskaż to bóstwo. Wybierz, czy działasz Majestatem, czy Podszeptem; kości rzuca księga. Broniące się bóstwo odpowiada u siebie: też wybiera Majestat albo Podszept i rzuca. Twoja tura czeka na jego odpowiedź.',
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
    requiresRoll: false,
    contested: true,
    flow: ['map', 'form', 'map', 'form', 'declare'],
    summary: 'Z miasta, w którym rządzisz, wyślij armię wyznawców na cudze miasto. Do ceny dochodzi 1 Logos za heks. Obie strony rzucają 2k6 + atrybut + siły.',
    details: [
      'Wybierz swoje miasto (takie, w którym masz najwięcej wyznawców) i zdecyduj, ilu swoich wyznawców zabierasz: to twoja Armia. Co najmniej jeden zostaje w domu. Wybierz cel i broniące się bóstwo. Do ceny słowa dochodzi 1 Logos za każdy heks dystansu między miastami.',
      'Atakujący rzuca 2k6 + Gniew + wielkość Armii; jeśli wojnę wypowiada przez awatara, ten prowadzi lud jak generał i dolicza swoje życie. Obrońca rzuca 2k6 + wybrany atrybut (Łaska to mury, Gniew to wyjście przed mury) + liczba swoich wyznawców w atakowanym mieście + życie swojego awatara, jeśli stoi w tym mieście. Różnica wyników decyduje.',
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
    requiresRoll: false,
    entityKind: 'avatar',
    entityOp: 'create',
    flow: ['form', 'map', 'confirm', 'verse'],
    summary: 'Most między boskością a śmiertelnikami: własny znak, miejsce na mapie, 3 punkty życia. Co rundę 1 darmowa akcja.',
    details: [
      'Gdy zsyłasz awatara, tworzysz coś, co przerzuca most nad przepaścią między boskością a śmiertelnikami. Twoje awatary nie są tobą, lecz twoim przedłużeniem. Mogą mieć własne pragnienia i ambicje, a nawet ulegać wpływom innych bóstw.',
      'Awatar staje na wybranym heksie (nie na Wodzie ani w Górach), nosi własny znak i ma 2 punkty życia; Kataklizm, wojna i walka mogą go ranić, a sen Fazy Chaosu leczy jedno życie. Gdy życie spadnie do zera, ginie i wraca tylko przez Wskrzeszenie. Każde kolejne wcielenie wraca o jedno życie silniejsze, najwyżej dwanaście.',
      'Awatar to ręka bóstwa na ziemi: słowa Terraformacji, Tworzenia Życia i Śmiertelników wypowiedziane przez niego kosztują połowę, lecz ich cel musi leżeć najwyżej dwa heksy od niego. Na wojnę idzie jak generał: jego życie dolicza się do rzutu armii, a gdy stoi w atakowanym mieście, do rzutu obrony. Wielki Cud przez awatara spala go.',
    ],
  },
  {
    key: 'pilgrimage',
    name: 'Pielgrzymka Awatara',
    category: 'avatar',
    costs: [0, 0, 0],
    distance: true,
    requiresRoll: false,
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
    requiresRoll: false,
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
    requiresRoll: false,
    contested: true,
    flow: ['map', 'map', 'form', 'declare'],
    summary: 'Twój awatar staje przeciw awatarowi innego bóstwa najwyżej dwa heksy od siebie. Rzut sporny: 2k6 + Gniew, Majestat albo Podszept.',
    details: [
      'Kliknij swojego awatara, potem awatara przeciwnika stojącego najwyżej dwa heksy od niego. Jeśli jest dalej, najpierw wyślij awatara na Pielgrzymkę.',
      'Wybierz, czym walczysz: Gniew to brutalne starcie siłowe, Majestat to pojedynek boskiej aury, Podszept to skrytobójstwo i mroczna magia. Obrońca też wybiera atrybut. Obaj rzucają 2k6 + atrybut.',
      'Wygrana o 3+: awatar wroga traci 2 życia, twój bez szwanku. Wygrana o 1..2: wróg traci 1, ty też 1. Remis: obaj tracą po 1. Przegrana o 1..2: ty tracisz 1. Przegrana o 3+: ty tracisz 2. Awatar bez życia ginie i znika z mapy.',
    ],
    requirement: { text: 'twój awatar w zasięgu cudzego', check: (w, me) => duelPossible(w, me) },
  },
  {
    key: 'prophecy',
    name: 'Proroctwo',
    category: 'avatar',
    costs: [10, 5, 3],
    requiresRoll: false,
    entityOp: 'update',
    flow: ['map', 'form', 'confirm', 'verse'],
    summary: 'Kliknij swojego awatara i zapisz, co zapowiada. Proroctwo dojrzewa co Chaos (+1 do +3) i raz dodaje się do rzutu.',
    details: [
      'Awatar przemawia o tym, co nadejdzie. Kliknij swojego awatara na mapie i wpisz treść proroctwa własnymi słowami. Księga zapamięta: „Prorok X zapowiedział, że: …”.',
      'Proroctwo ma nieuchronność: +1 w chwili wypowiedzenia, potem każda Faza Chaosu dodaje +1, aż do +3.',
      'Przy rzucie (Rozwój, Kataklizm, Nawracanie, Święta Wojna, Walka Awatarów, także w obronie) możesz wypełnić jedno proroctwo: jego nieuchronność dodaje się do rzutu, a ono trafia do spełnionych na karcie bóstwa.',
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

function plural(n: number, forms: [string, string, string]): string {
  const tens = n % 100
  const ones = n % 10
  const f = n === 1 ? forms[0] : ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? forms[1] : forms[2]
  return `${n} ${f}`
}
const TRAIT = ['cechę', 'cechy', 'cech'] as [string, string, string]
const SPEC = ['specjalność', 'specjalności', 'specjalności'] as [string, string, string]
const FLAW = ['brak', 'braki', 'braków'] as [string, string, string]

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} i ${items[items.length - 1]}`
}

/** "Ty wybierasz: 2 cechy, 2 specjalności i 1 brak. Pozostali gracze: 1 cechę i 1 brak." */
export function picksText(p: TierPicks): { mine: string; others: string | null } {
  const mine: string[] = []
  if (p.traits) mine.push(plural(p.traits, TRAIT))
  if (p.specialties) mine.push(plural(p.specialties, SPEC))
  if (p.flaws) mine.push(plural(p.flaws, FLAW))
  const others: string[] = []
  if (p.otherTraits) others.push(plural(p.otherTraits, TRAIT))
  if (p.otherFlaws) others.push(plural(p.otherFlaws, FLAW))
  return { mine: list(mine), others: others.length ? list(others) : null }
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
const VIA_AVATAR = new Set<ActionKey>(['shape_land', 'catastrophe', 'great_miracle', 'create_creature', 'create_sapient', 'change_creature', 'migrate', 'create_civilization', 'develop_civilization', 'exodus', 'convert', 'holy_war'])
export function viaAvatarAllowed(key: ActionKey): boolean {
  return VIA_AVATAR.has(key)
}
/** what a word costs when the avatar speaks it */
export function viaAvatarCost(cost: number): number {
  return Math.ceil(cost / 2)
}
