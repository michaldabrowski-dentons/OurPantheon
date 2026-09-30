// Main actions of Our Pantheon (Alpha V2, PL), grouped the way the table wants them.
// Costs are per Era: [I, II, III]. Keys match action_cost() in supabase/migrations.
import type { Entity, EntityKind } from '@/lib/types'
import { SAPIENT_TRAITS } from './traits'

export type ActionKey =
  | 'shape_land'
  | 'change_biome'
  | 'catastrophe'
  | 'great_miracle'
  | 'create_creature'
  | 'create_sapient'
  | 'change_creature'
  | 'create_civilization'
  | 'change_civilization'
  | 'create_faction'
  | 'create_orthodoxy'
  | 'change_faction'
  | 'command_followers'
  | 'create_avatar'
  | 'command_avatar'
  | 'resurrect_avatar'

export type Era = 1 | 2 | 3
export type ActionCategoryKey = 'terraform' | 'life' | 'mortals' | 'avatar'

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
  desires?: number
  otherTraits?: number
  otherFlaws?: number
  otherDesires?: number
}
export type Tier = 'strong' | 'mixed' | 'weak'

export interface ActionRequirement {
  /** shown under the action name */
  text: string
  /** true when the world already holds what the action needs */
  check: (entities: Entity[]) => boolean
}

export interface ActionDef {
  key: ActionKey
  name: string
  category: ActionCategoryKey
  costs: [number, number, number]
  requiresRoll: boolean
  /** which kind of entity the action creates or edits, if any */
  entityKind?: EntityKind
  entityOp?: 'create' | 'update'
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
]

export const isSapient = (e: Entity) => e.kind === 'creature' && e.traits.some((t) => SAPIENT_TRAITS.includes(t))
const alive = (e: Entity) => e.status === 'active'
const has = (pred: (e: Entity) => boolean) => (entities: Entity[]) => entities.some(pred)

export const ACTIONS: ActionDef[] = [
  // ---------- Terraformacja ----------
  {
    key: 'shape_land',
    name: 'Kształtowanie Lądów',
    category: 'terraform',
    costs: [2, 5, 12],
    requiresRoll: false,
    summary: 'Stwórz lub zmień ląd: góry, lasy, pustynie, rzeki, wyspy, latające wyspy. Obszar około jednej jednostki.',
    details: [
      'Ta akcja pozwala tworzyć lub zmieniać ląd świata: góry, lasy, pustynie, stepy, tundry, łąki, jeziora, rzeki, doliny, wyspy, latające wyspy i wszystko, co przyjdzie wam do głowy. Cechy te mogą być tak realistyczne lub tak fantazyjne, jak chcesz.',
      'Wybierz do wypełnienia obszar około jednej jednostki albo taki, jaki jest rozsądny. Czy pojawia się natychmiast, czy zmienia się powoli przez dekady?',
      'Gdy kształtujesz ląd, automatycznie określasz też klimat tego obszaru oraz to, jaki rodzaj życia tam istnieje lub będzie istniał. Jeśli w przyszłości zechcesz zmienić klimat tego obszaru, użyj Zmiany Klimatu.',
    ],
  },
  {
    key: 'change_biome',
    name: 'Zmiana Klimatu',
    category: 'terraform',
    costs: [1, 3, 6],
    requiresRoll: false,
    summary: 'Zmień klimat istniejącego obszaru: las w pustynię, morze w lód, równiny nawiedzane przez niezwykłe burze.',
    details: [
      'Biom obszaru to złożona zależność między tym, co tam żyje, a jego warunkami klimatycznymi. Gdy zmieniasz klimat, zmieniasz ustalony klimat obszaru na jakiś inny. Trzeba to robić nad lądem, który został już stworzony lub uzgodniony jako istniejący.',
      'Obejmuje to między innymi: przemienienie lasu w pustynię, zamrożenie morza tak, by pokrył je lód, albo sprawienie, że na falistych równinach regularnie występują burze, podczas których padają niezwykłe przedmioty: żaby, ryby, rzeczy anachroniczne.',
      'Wybierz do wypełnienia obszar około jednej jednostki.',
    ],
  },
  {
    key: 'catastrophe',
    name: 'Kataklizm',
    category: 'terraform',
    costs: [10, 10, 10],
    requiresRoll: false,
    summary: 'Okaż gniew. Ziemia drży, góry wybuchają, niebiosa runęły. Znaczący, lecz lokalny.',
    details: [
      'Bóstwa muszą czasem okazać swój gniew. Spraw, by ziemia zadrżała, góry wybuchły, pole uschło, fale uderzyły, niebiosa runęły. Czy dzieje się to z zazdrości, sprawiedliwości czy z nudów, decyzja należy do ciebie.',
      'Kataklizm powinien być znaczący, ale lokalny. Może położyć kres miastu, cywilizacji lub wyspie, ale powinien obejmować około jednej jednostki. Aby wpłynąć na świat na większą skalę, użyj Wielkiego Cudu.',
    ],
  },
  {
    key: 'great_miracle',
    name: 'Wielki Cud',
    category: 'terraform',
    costs: [15, 30, 50],
    requiresRoll: false,
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
    summary: 'Pojedynczy byt lub cały gatunek. Wybierz do 3 cech. Gdzie się pojawiają, jak wyglądają, co jedzą, co im zagraża?',
    details: [
      'Zwierzęta i rośliny wszelkiego rodzaju będą powstawać wskutek kształtowania lądów i klimatu, ale czasem chcesz stworzyć coś bardziej konkretnego. Może to dotyczyć pojedynczego bytu lub całego gatunku. Jeśli chcesz, śmiało zrób szybki szkic istoty.',
      'Wybierz do 3 cech z listy. Następnie odpowiedz na dowolne lub wszystkie z pytań: Gdzie się pojawiają? Jak wyglądają? Co jedzą? Jak się rozmnażają? Co jest dla nich największym zagrożeniem?',
      'Istoty bez cechy „Rozumne” ani „Umysł roju” nie mogą założyć cywilizacji. Do tego służy Stworzenie Istoty Rozumnej.',
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
    summary: 'Gatunek zdolny do kultury. Otrzymuje cechę „Rozumne” i może założyć cywilizację.',
    details: [
      'Tak jak Stworzenie Istoty, ale to, co powstaje, ma świadomość, język i zdolność do kultury. Istota otrzymuje cechę „Rozumne” (albo „Umysł roju”, jeśli tak ją opiszesz) i od tej pory można z niej wywieść cywilizację.',
      'Wybierz do 3 cech i odpowiedz na te same pytania: gdzie się pojawiają, jak wyglądają, co jedzą, jak się rozmnażają, co im zagraża. Zastanów się też, jak myślą i co uznają za święte.',
    ],
  },
  {
    key: 'change_creature',
    name: 'Przekształcenie Istoty',
    category: 'life',
    costs: [5, 1, 6],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'update',
    summary: 'Dodaj, zmień lub usuń 1 cechę istoty. Albo stwórz odmianę: zachowaj co najmniej 2 cechy i dodaj 1 nową.',
    details: [
      'Użyj tej akcji, aby dodać istocie nową cechę lub zmienić istniejącą. W fikcji zmienia to każdego osobnika tej istoty. Może to następować przez pokolenia albo natychmiast, zależnie od tego, jak chcesz to przedstawić. Wybierz 1 cechę do dodania, zmiany lub usunięcia.',
      'Alternatywnie możesz użyć tej akcji, by stworzyć odmianę istniejącej istoty. Wybierz wtedy co najmniej 2 cechy do zachowania i 1 nową.',
    ],
    requirement: { text: 'musi istnieć istota', check: has((e) => e.kind === 'creature') },
  },

  // ---------- Śmiertelnicy ----------
  {
    key: 'create_civilization',
    name: 'Stworzenie Cywilizacji',
    category: 'mortals',
    costs: [22, 12, 6],
    requiresRoll: true,
    entityKind: 'civilization',
    entityOp: 'create',
    summary: 'Lud zdolny do kultury. Wybierz spośród istot rozumnych. Określ region i opisz, jacy są. Rzuć 2k6.',
    details: [
      'To są ludy świata. Nie po prostu zwierzęta czy gatunki, ale istoty zdolne do kultury i cywilizacji. Wybieraj spośród istot, które zostały już ustalone i mają cechę „Rozumne” lub „Umysł roju”. Jeden gatunek może mieć wiele skrajnie różnych cywilizacji, a jedna cywilizacja może składać się z wielu gatunków.',
      'Cywilizacje mają cechy, specjalności i braki. Choć jednostki będą od nich odbiegać, dają wyraźniejsze pojęcie o tym, kim są ci ludzie i co ceni ich kultura. Wybierz, gdzie pojawiają się na mapie, i z grubsza określ region. Opisz, jak wyglądają i jaka jest ich kultura. Następnie rzuć 2k6 plus liczba Słów, które chcesz wydać.',
      'Niezależnie od wyniku cywilizacja zaczyna z Religią poświęconą bóstwu-stwórcy albo z neutralną Frakcją: zakonem, formą rządów, tajemniczym kultem, czymkolwiek chcesz.',
    ],
    requirement: { text: 'musi istnieć istota rozumna', check: has(isSapient) },
    tiers: {
      strong: 'Wybierz 3 Cechy, 2 Specjalności i 1 Brak. Następnie stwórz Religię lub Frakcję.',
      mixed: 'Wybierz 2 Cechy, 2 Specjalności i 1 Brak. Wybierz, który z pozostałych graczy wybiera 1 Cechę, a który 1 Brak. Stwórz Frakcję.',
      weak: 'Wybierz 1 Cechę, 2 Specjalności, 1 Brak. Wybierz, który z pozostałych graczy wybiera 2 Cechy, a który 1 Brak. Stwórz Frakcję.',
    },
    picks: {
      strong: { traits: 3, specialties: 2, flaws: 1 },
      mixed: { traits: 2, specialties: 2, flaws: 1, otherTraits: 1, otherFlaws: 1 },
      weak: { traits: 1, specialties: 2, flaws: 1, otherTraits: 2, otherFlaws: 1 },
    },
  },
  {
    key: 'change_civilization',
    name: 'Przekształcenie Cywilizacji',
    category: 'mortals',
    costs: [12, 8, 4],
    requiresRoll: true,
    entityKind: 'civilization',
    entityOp: 'update',
    summary: 'Odłam od cywilizacji albo zmiana jej kultury. Rzuć 2k6 + wydane Słowa.',
    details: [
      'Być może ci ludzie oderwali się od głównej cywilizacji. A może po prostu zdecydowałeś, że muszą zmienić swoją kulturę. W pierwszym przypadku umieść nową grupę gdzieś w pobliżu pierwotnej cywilizacji albo odpowiednio podziel region.',
      'Tak czy inaczej, rzuć 2k6 plus liczba Słów, które chcesz wydać, i zastosuj wynik z tabeli poniżej.',
    ],
    requirement: { text: 'musi istnieć cywilizacja', check: has((e) => e.kind === 'civilization') },
    tiers: {
      strong: 'Zmień, dodaj lub usuń 1 cechę, 1 specjalność i/lub 1 brak, jak uznasz za stosowne.',
      mixed: 'Zmień, dodaj lub usuń cechę lub specjalność.',
      weak: 'Zmień cechę lub specjalność. Inny gracz może także zmienić jedną albo dodać brak.',
    },
  },
  {
    key: 'create_faction',
    name: 'Stworzenie Frakcji',
    category: 'mortals',
    costs: [10, 6, 4],
    requiresRoll: true,
    entityKind: 'faction',
    entityOp: 'create',
    summary: 'Neutralna grupa ludzi: od rodziny po organ rządzący. Nadaje wyrazistość ludom świata. Wybierz typ, potem rzuć.',
    details: [
      'Frakcje są w dużej mierze neutralne, jeśli chodzi o bóstwa. Może czczą niektóre z nich lub są ich świadome, ale jest zupełnie w porządku, by miały o nich błędne wyobrażenie, były całkowicie obojętne, a nawet nieświadome istnienia rzeczywistych bóstw świata.',
      'Mechanicznie neutralne frakcje same w sobie nie dają bóstwom żadnej korzyści ani utrudnienia. Można je przemienić w Religie, które korzyść już dają. Ich główną funkcją jest nadawanie wyrazistości ludom świata; to grupy, które tworzą ludzie, i do nich odwołują się zasady Chaosu.',
      'Najpierw wybierz rodzaj frakcji: od małej grupy około 10 osób po cały organ rządzący społeczeństwem. Następnie rzuć 2k6 plus liczba Słów, które chcesz wydać.',
    ],
    requirement: { text: 'musi istnieć cywilizacja', check: has((e) => e.kind === 'civilization') },
    tiers: {
      strong: 'Wybierz 2 Cechy i Pragnienie.',
      mixed: 'Wybierz 2 Cechy. Następnie inny gracz wybiera kolejne Pragnienie.',
      weak: 'Wybierz Cechę. Następnie pozostali gracze wybierają Cechę i Pragnienie.',
    },
    picks: {
      strong: { traits: 2, desires: 1 },
      mixed: { traits: 2, otherDesires: 1 },
      weak: { traits: 1, otherTraits: 1, otherDesires: 1 },
    },
  },
  {
    key: 'create_orthodoxy',
    name: 'Stworzenie Religii',
    category: 'mortals',
    costs: [12, 8, 6],
    requiresRoll: true,
    entityKind: 'orthodoxy',
    entityOp: 'create',
    summary: 'Grupa, która wie o tobie i cię czci. Każda religia daje +1 do Rzutu Logos (maks. +3). Stwórz jak frakcję, potem wybierz 2 wymagania.',
    details: [
      'Za każdą Religię, którą ma bóstwo, zyskuje ono +1 do swojego Rzutu Logos na początku rundy, maksymalnie do premii +3. Możesz mieć więcej religii, ale premia się za nie nie liczy.',
      'Te grupy wiedzą o bóstwach, a przynajmniej to, co im powiedziano, i prawdopodobnie je czczą. Czy dzieje się tak dlatego, że je wielbią, czy dlatego, że się ich boją, zależy od ciebie. Stwórz religię tak, jak stworzyłbyś frakcję, a następnie wybierz 2 rzeczy, których od nich wymagasz: Szerzyć, Bronić, Uciskać, Folgować, Pokutować, Wstrzymywać się, Uległość.',
      'Opisz też, w jaki sposób praktykują swój kult. Jakie są powszechne rytuały i obrzędy? Czy mają scentralizowane miejsce kultu, jak kościół lub świątynia? Gdy wiele bóstw tworzy religię wspólnie, wszystkie zyskują premię +1 do Rzutu Logos.',
    ],
    requirement: { text: 'musi istnieć cywilizacja', check: has((e) => e.kind === 'civilization') },
    tiers: {
      strong: 'Wybierz 2 Cechy i Pragnienie. Potem 2 wymagania.',
      mixed: 'Wybierz 2 Cechy. Inny gracz wybiera Pragnienie. Potem 2 wymagania.',
      weak: 'Wybierz Cechę. Pozostali gracze wybierają Cechę i Pragnienie. Potem 2 wymagania.',
    },
    picks: {
      strong: { traits: 2, desires: 1 },
      mixed: { traits: 2, otherDesires: 1 },
      weak: { traits: 1, otherTraits: 1, otherDesires: 1 },
    },
  },
  {
    key: 'change_faction',
    name: 'Przekształcenie Frakcji lub Religii',
    category: 'mortals',
    costs: [4, 4, 2],
    requiresRoll: true,
    entityKind: 'faction',
    entityOp: 'update',
    summary: 'Zmień frakcję lub religię. Możesz też zamienić frakcję w religię (wybierz 2 wymagania) albo religię w neutralną frakcję.',
    details: [
      'Frakcje i religie można zmieniać tak samo jak cywilizacje. Rzuć 2k6 plus liczba Słów, które chcesz wydać, i zastosuj wynik z tabeli.',
      'Używając tej akcji, możesz zmienić frakcję w religię i odwrotnie. Gdy frakcja zostaje zmieniona w religię, wybierasz 2 wymagania z listy Stworzenia Religii. Jeśli religia staje się neutralną frakcją, mechanicznie traci wymagania i nie zapewnia już premii do Rzutu Logos bóstwu, któremu dawniej służyła. Nadal możecie wykorzystywać te wymagania w fikcji.',
    ],
    requirement: { text: 'musi istnieć frakcja lub religia', check: has((e) => e.kind === 'faction' || e.kind === 'orthodoxy') },
    tiers: {
      strong: 'Zmień lub dodaj 1 Cechę i/lub 1 Pragnienie, jak uznasz za stosowne.',
      mixed: 'Zmień lub dodaj Cechę lub Pragnienie.',
      weak: 'Zmień Cechę lub Pragnienie. Jeśli zmieniłeś Pragnienie, w jaki sposób spełniono poprzednie?',
    },
  },
  {
    key: 'command_followers',
    name: 'Objawienie Wyznawcom',
    category: 'mortals',
    costs: [2, 2, 2],
    requiresRoll: true,
    summary: 'Zażądaj daniny (zyskujesz Logos równe najwyższej kości + 1) albo poleć wielki czyn. Przy 10+ odzyskujesz wydane Słowa.',
    details: [
      'Czy to z twoich Religii, czy skądinąd, twoje bóstwo prawdopodobnie ma ludzi, którzy je czczą. Ta akcja pozwala zyskać Logos od wyznawców albo polecić im zrobić coś konkretnego: coś zbudować, dokądś się udać.',
      'Opisz, czego żądasz, i rzuć 2k6 plus dowolna liczba dodatkowych Słów. Przy sukcesie wybierz 1 opcję i ustaw krótką scenę. Przy 10+ odzyskujesz wszystkie wydane Słowa. Żądanie daniny: ustaw krótką scenę wokół jednego z ich wymagań; zyskujesz tyle Słów, ile wynosi najwyższy wynik na kości plus 1. Podjęcie wielkiego czynu: stworzyć coś cudownego, wyruszyć na pielgrzymkę, wystawić armię, szukać czegoś utraconego.',
      'Przy porażce również wybierz jedną z powyższych opcji, opisz, co poszło nie tak, i wybierz: jesteś zmuszony do Odpoczynku aż do następnej rundy albo tracisz tyle Słów, ile wynosi najwyższy wynik na kości minus 1.',
    ],
    requirement: { text: 'musi istnieć religia', check: has((e) => e.kind === 'orthodoxy' && alive(e)) },
    tiers: {
      strong: 'Sukces. Wybierz: Żądanie daniny (zyskujesz najwyższą kość + 1 Logos) lub Wielki czyn. Odzyskujesz wydane Słowa.',
      mixed: 'Sukces. Wybierz: Żądanie daniny (zyskujesz najwyższą kość + 1 Logos) lub Wielki czyn.',
      weak: 'Porażka. Opisz, co poszło nie tak. Wybierz: Odpoczynek do końca rundy albo utrata najwyższej kości − 1 Logos.',
    },
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
    summary: 'Most między boskością a śmiertelnikami. Wybierz 1–3 uwarunkowania. Co rundę masz 1 darmową akcję awatara.',
    details: [
      'Gdy zsyłasz awatara, tworzysz coś, co przerzuca most nad przepaścią między boskością a śmiertelnikami. Twoje awatary nie są tobą, lecz twoim przedłużeniem. Mogą mieć własne pragnienia i ambicje, a nawet ulegać wpływom innych bóstw.',
      'W każdej rundzie masz 1 darmową akcję, którą może wykonać twój awatar. Możesz jej użyć w dowolnym momencie swojej tury bez wydawania Logos. Może z niej korzystać tylko bóstwo, które stworzyło awatara.',
      'Awatary wymagają uwarunkowań, by istnieć w świecie. Wybierz od 1 do 3 z listy albo stwórz własne. Pojedynczy awatar może zostać stworzony przez wiele bóstw; wtedy oba mają dostęp do darmowej akcji, ale można jej użyć tylko raz na rundę.',
    ],
  },
  {
    key: 'command_avatar',
    name: 'Rozkaz dla Awatara',
    category: 'avatar',
    costs: [2, 2, 2],
    requiresRoll: false,
    summary: 'Awatar używa mocy bóstwa. Przy rzutach odejmij 2. Wielki Cud niszczy awatara. Stworzenie istoty raz na Erę.',
    details: [
      'Awatary mają dostęp do tych samych mocy, które mają bóstwa, i możesz im rozkazać użyć tych akcji. Zastrzeżenia: Wielki Cud niszczy awatara, Stworzenie Istoty można wykonać tylko raz na Erę, Zesłanie Awatara jest dozwolone (półbóg, postać podobna do Heraklesa), Wskrzeszenie Awatara oznacza, że awatar poświęca samego siebie. Jeśli rozkazujesz awatarowi innego bóstwa, niech tamten gracz także rzuci; czyj rzut jest wyższy, ten ma kontrolę narracyjną.',
      'Niezależnie od akcji weź pod uwagę uwarunkowania awatara i zbuduj wokół nich krótką scenę. Jeśli to awatar twojego bóstwa, dostajesz z nim 1 darmową akcję na rundę; w przeciwnym razie płacisz koszt akcji w Logos. Jeśli akcja wymaga rzutu, odejmij 2 od wyniku.',
      'Przy 10+ uwarunkowania awatara pomagają w sytuacji. Przy 7–9 uwarunkowania komplikują sprawy. Przy 6− awatar nie jest w stanie posłuchać, odrzuca rozkaz albo zawodzi.',
    ],
    requirement: { text: 'musi istnieć awatar', check: has((e) => e.kind === 'avatar' && alive(e)) },
  },
  {
    key: 'resurrect_avatar',
    name: 'Wskrzeszenie Awatara',
    category: 'avatar',
    costs: [12, 15, 25],
    requiresRoll: false,
    entityKind: 'avatar',
    entityOp: 'update',
    summary: 'Awatar wraca, lecz zawsze nieco inny. Opisz, jak zmieniła go śmierć. Możesz wskrzesić awatara innego bóstwa.',
    details: [
      'Jest wiele sposobów, na jakie awatar może spotkać nieszczęśliwy koniec. Gdy tak się stanie, ta akcja jest jedyną opcją, jeśli chcesz, by ten awatar nadal istniał w świecie.',
      'Wskrzeszone awatary zawsze wracają nieco inne. Gdy decydujesz się jednego wskrzesić, opisz, jak zmieniła go śmierć. Pomysłów szukaj na liście uwarunkowań. Możesz wskrzeszać poległe awatary innych bóstw; traktuj takiego awatara jako mającego odtąd wielu twórców.',
    ],
    requirement: { text: 'musi umrzeć awatar', check: has((e) => e.kind === 'avatar' && e.status === 'dead') },
  },
]

export const ACTION_BY_KEY: Record<ActionKey, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
) as Record<ActionKey, ActionDef>

export const ERA_NAMES: Record<Era, string> = { 1: 'Pierwsza Era', 2: 'Druga Era', 3: 'Trzecia Era' }
export const ERA_NUMERALS: Record<Era, string> = { 1: 'I', 2: 'II', 3: 'III' }
export const ERA_THEMES: Record<Era, string> = {
  1: 'Geografia. Tanie kształtowanie lądu, drogie ludy.',
  2: 'Zaludnianie. Tanie gatunki i cywilizacje.',
  3: 'Polityka i kultura. Tanie mieszanie się w sprawy śmiertelników.',
}

export function costFor(key: ActionKey, era: Era): number {
  return ACTION_BY_KEY[key].costs[era - 1]
}

/** Actions grouped by category, each group sorted by cost in the given Era (ties keep rulebook order). */
export function actionsByCategory(era: Era): { category: (typeof ACTION_CATEGORIES)[number]; actions: ActionDef[] }[] {
  return ACTION_CATEGORIES.map((category) => ({
    category,
    actions: ACTIONS.map((a, i) => ({ a, i }))
      .filter((x) => x.a.category === category.key)
      .sort((x, y) => x.a.costs[era - 1] - y.a.costs[era - 1] || x.i - y.i)
      .map((x) => x.a),
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
const DESIRE = ['pragnienie', 'pragnienia', 'pragnień'] as [string, string, string]

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
  if (p.desires) mine.push(plural(p.desires, DESIRE))
  const others: string[] = []
  if (p.otherTraits) others.push(plural(p.otherTraits, TRAIT))
  if (p.otherFlaws) others.push(plural(p.otherFlaws, FLAW))
  if (p.otherDesires) others.push(plural(p.otherDesires, DESIRE))
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
  round_end: 'Koniec rundy',
  era_advance: 'Nowa Era',
  game_start: 'Początek',
  game_end: 'Epilog',
}
