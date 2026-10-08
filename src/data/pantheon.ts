// The pantheon's playbooks: six attributes in three opposite pairs and twelve domains, each with two
// main attributes. Scores are derived here from three stored keys (domain, primary, bonus); the SQL
// side mirrors the mains in domain_mains() (supabase/migrations/0011_playbooks.sql).
import type { AttrKey, DomainKey, GodGender } from '@/lib/types'

export type { AttrKey, DomainKey }

export interface Attribute {
  key: AttrKey
  name: string
  opposite: AttrKey
  /** one line: how this god acts */
  tagline: string
  description: string
  examples: string[]
}

export interface Domain {
  key: DomainKey
  /** "Wojny", "Zemsty": the genitive after Bóg / Bogini / Bóstwo */
  name: string
  mains: [AttrKey, AttrKey]
  description: string
  examples: string[]
}

export const ATTRIBUTES: Attribute[] = [
  {
    key: 'wrath',
    name: 'Gniew',
    opposite: 'grace',
    tagline: 'Działanie przez siłę, agresję i brutalność',
    description:
      'Bóg nie negocjuje, nie prosi i nie czeka. Rozwiązuje problemy poprzez bezpośrednie uderzenie, niszczenie i bezwzględne przełamywanie oporu. To opcja dla bóstwa, które uważa, że najkrótszą drogą do celu jest zmiażdżenie przeszkody i wrogów w otwartej walce lub przy pomocy niszczycielskiej siły.',
    examples: [
      'Zesłanie gromu z jasnego nieba, by natychmiast rozbić mury zbuntowanego miasta (jak Zeus lub Thor).',
      'Fizyczne wejście na pole bitwy i rozrywanie wrogich szeregów gołymi rękami w ślepym szale (jak Ares lub Khorne).',
    ],
  },
  {
    key: 'majesty',
    name: 'Majestat',
    opposite: 'whisper',
    tagline: 'Działanie przez autorytet, chwałę i rozkaz',
    description:
      'Bóg nie musi brudzić sobie rąk przemocą ani ukrywać się w cieniu. Działa jawnie, olśniewając otoczenie swoją wielkością, świętą obecnością oraz potęgą urzędu. Jego metoda opiera się na żądaniu bezwzględnego posłuszeństwa: śmiertelnicy i mniejsze siły klękają, bo nie potrafią znieść ciężaru jego boskiego autorytetu.',
    examples: [
      'Zjawienie się nad stolicą w koronie z czystego światła i wydanie głosem grzmiącym jak dzwon rozkazu: „Złóżcie broń i ukorzcie się”, tak że armia natychmiast rzuca oręż z przerażenia i szacunku (jak Manwë lub Jahwe).',
      'Ustanowienie boskiego prawa, które król musi ogłosić pod groźbą natychmiastowej utraty rozumu.',
    ],
  },
  {
    key: 'grace',
    name: 'Łaska',
    opposite: 'wrath',
    tagline: 'Działanie przez opiekę, troskę i miłosierdzie',
    description:
      'Bóg interweniuje po to, by ratować, leczyć, osłaniać i podtrzymywać życie. Jego metoda to miękka siła empatii, dawania i bezwarunkowego wsparcia. Zamiast niszczyć wrogów, woli ocalić swoich wiernych, przynosząc im ukojenie, obfitość lub wybaczając ich grzechy.',
    examples: [
      'Oczyszczenie zatrutej studni w oblężonym mieście i sprawienie, by ranni ozdrowieli w jedną noc, co budzi w nich głęboką, dozgonną miłość do bóstwa (jak Demeter lub Ozyrys).',
      'Stworzenie niewidzialnej, ciepłej tarczy wokół wędrującego przez burzę plemienia, by żaden członek rodu nie zaznał mrozu.',
    ],
  },
  {
    key: 'whisper',
    name: 'Podszept',
    opposite: 'majesty',
    tagline: 'Działanie przez manipulację, iluzję i tajemnicę',
    description:
      'Bóg działa jak sprytny intrygant z tylnego siedzenia. Nigdy nie pokazuje twarzy i nie uderza wprost. Pociąga za sznurki, podsuwa myśli we śnie, rozsiewa fałszywe plotki, mąci w umysłach i doprowadza do celu ukrytymi ścieżkami, sprawiając, że śmiertelnicy sami robią to, czego bóg pragnie, myśląc, że to ich własny pomysł.',
    examples: [
      'Zesłanie proroczego, niepokojącego snu na króla sąsiedniego państwa, w którym ten widzi zdradę swojego brata, co natychmiast wywołuje wojnę domową bez udziału samego bóstwa (jak Loki lub Odyn).',
      'Podrzucenie na dwór skłóconych dowódców fałszywego listu, który niszczy sojusz potężnego imperium od środka.',
    ],
  },
  {
    key: 'element',
    name: 'Żywioł',
    opposite: 'wisdom',
    tagline: 'Działanie chaotyczne, w euforii, pasji i namiętności',
    description:
      'Bóg odrzuca wszelkie kalkulacje, chłód i planowanie. Działa pod wpływem czystego, dzikiego impulsu, ekstazy, pożądania lub nieokiełznanej natury. To metoda gwałtowna, płynąca z trzewi, która wyzwala w świecie potężną, nieprzewidywalną energię: potrafi stworzyć niesamowite piękno lub obrócić wszystko w ruinę tylko dlatego, że „tak poczuła”.',
    examples: [
      'Zesłanie na całe miasto świętego obłędu i dzikiej, niczym niespętanej bachanaliowej pasji, w której mieszkańcy porzucają codzienne obowiązki, by tańczyć w lasach do utraty tchu (jak Dionizos lub Slaanesh).',
      'Uwolnienie ślepej, dzikiej furii natury, która sprawia, że rzeka nagle występuje z brzegów i porywa las, bo bóg poczuł nagły przypływ gniewnego pragnienia wolności.',
    ],
  },
  {
    key: 'wisdom',
    name: 'Mądrość',
    opposite: 'element',
    tagline: 'Działanie mądre, rozumowe i spokojne',
    description:
      'Bóg opiera się na chłodnej kalkulacji, głębokim zrozumieniu praw wszechświata, strategii i cierpliwości. Nie ulega emocjom, nie wrzeszczy w gniewie i nie szaleje w euforii. Patrzy na szachownicę świata z dystansu i rozwiązuje problemy za pomocą precyzyjnego planu, innowacji, technologii lub przekazania kluczowej wiedzy.',
    examples: [
      'Opracowanie i zesłanie ludzkości sekretu budowy wielkich tam i kanałów irygacyjnych, by powstrzymać coroczne powodzie za pomocą czystej inżynierii (jak Enki lub Atena).',
      'Rozwiązanie wielopokoleniowego konfliktu poprzez sprytne, bezkrwawe zaprojektowanie nowego traktatu handlowego, który zmusza oba państwa do pokoju z czystego wyrachowania ekonomicznego.',
    ],
  },
]

export const ATTRIBUTE_BY_KEY = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, a])) as Record<AttrKey, Attribute>
export const ATTR_KEYS: AttrKey[] = ATTRIBUTES.map((a) => a.key)

export const DOMAINS: Domain[] = [
  {
    key: 'war',
    name: 'Wojny',
    mains: ['wrath', 'majesty'],
    description:
      'Potęga pchająca ku zwycięstwu, ostatecznej chwale i podbojowi. To furia napędzająca tych, którzy wchodzą w ogień z podniesionym sztandarem, łaknąc wiecznej pamięci i absolutnego triumfu.',
    examples: ['Ares', 'Khorne', 'Tyr', 'Świętowit', 'Huitzilopochtli', 'Montu', 'Guan Yu', 'Bishamonten', 'Tulkas'],
  },
  {
    key: 'vengeance',
    name: 'Zemsty',
    mains: ['wrath', 'whisper'],
    description:
      'Cień, który sączy kłamstwa, tka intrygi i cierpliwie czeka na właściwy moment, by zadać cios w plecy. To przenikliwa siła chaosu i oszustwa, bezlitosna obecność dążąca do tego, by przeciwnik stracił absolutnie wszystko.',
    examples: ['Loki', 'Set', 'Eris', 'Czarnobóg', 'Sauron', 'Diabeł', 'Aryman', 'Tzeentch', 'Tezcatlipoca'],
  },
  {
    key: 'rule',
    name: 'Władzy',
    mains: ['grace', 'majesty'],
    description:
      'Władza, która panuje poprzez boski majestat, niewzruszoną hierarchię i niezaprzeczalny autorytet. To fundament tronów i imperiów i przytłaczająca obecność, która staje się dla śmiertelników najwyższym rozkazem.',
    examples: ['Jahwe', 'Allah', 'Ozyrys', 'Dagda', 'Frigg', 'Amaterasu', 'Anu', 'Manwë', 'El'],
  },
  {
    key: 'love',
    name: 'Miłości',
    mains: ['grace', 'whisper'],
    description:
      'Energia, która przyciąga, uwodzi, rozpala serca i każe rozumowi ustąpić miejsca czystej ekstazie. To pulsująca siła namiętności i pożądania, zdolna w jednej chwili uczynić z wroga kochanka, a z rozsądnego mędrca niewolnika pragnienia.',
    examples: ['Afrodyta', 'Eros', 'Freyja', 'Kama', 'Dziewanna', 'Inanna', 'Hathor', 'Slaanesh'],
  },
  {
    key: 'order',
    name: 'Porządku',
    mains: ['majesty', 'wisdom'],
    description:
      'Nieugięta sprawiedliwość, która powstrzymuje cywilizowany świat przed zapadnięciem się w bezkresnym chaosie. Wyznacza twarde granice, ustanawia zasady i bezlitośnie przywraca porządek.',
    examples: ['Tyr', 'Atena', 'Maat', 'Mitra', 'Forseti', 'Szamasz'],
  },
  {
    key: 'light',
    name: 'Światła',
    mains: ['majesty', 'element'],
    description:
      'Światło samego nieba, które z absolutną pewnością siebie rozprasza wszelką ciemność. To źródło blasku, gwiazd i onieśmielającego piękna. Czysta energia ogarniająca świat z wysokości i nadająca mu sens poprzez emanację energii.',
    examples: ['Helios', 'Ra', 'Dażbóg', 'Inti', 'Surya', 'Lugh', 'Varda'],
  },
  {
    key: 'secrets',
    name: 'Tajemnic',
    mains: ['whisper', 'wisdom'],
    description:
      'Nieuchwytny spryt, proroctwo, sekret i mroczna odpowiedź, zarezerwowana wyłącznie dla wybranych. To tajemnicza esencja okultyzmu, przenikająca umysły tych, którzy z ciekawością patrzą w ciemność, pragnąc zgłębić drugą stronę rzeczywistości.',
    examples: ['Odyn', 'Hekate', 'Weles', 'Thot', 'Morrigan', 'Hermes'],
  },
  {
    key: 'nature',
    name: 'Natury',
    mains: ['whisper', 'element'],
    description:
      'Siła całkowicie wolna, nieokiełznana i o wiele starsza niż jakiekolwiek ustanowione przez ludzkość prawa. Dzikość, brutalnie przypominająca, że pod cienką warstwą cywilizacji wciąż bije tętniące serce bestii. To pradawny zew drapieżników, natury i bezdroży.',
    examples: ['Artemida', 'Leszy', 'Cernunnos', 'Ullr', 'Tapio', 'Oromë'],
  },
  {
    key: 'forge',
    name: 'Kuźni',
    mains: ['wisdom', 'wrath'],
    description:
      'Mądrość zahartowana w ogniu. Przenika surowy kamień, metal oraz iskrę pomysłu, zmuszając je do przeobrażenia się w coś wielkiego. To napęd wynalazców, kowali i budowniczych; stwórcza energia niosąca pewność, że przyszłość musi zostać z trudem wykuta w żarze wulkanów.',
    examples: ['Hefajstos', 'Swarożyc', 'Brokkr i Sindri', 'Goibniu', 'Ilmarinen', 'Aulë'],
  },
  {
    key: 'knowledge',
    name: 'Wiedzy',
    mains: ['wisdom', 'grace'],
    description:
      'Mądrość, która przenika strukturę świata i aktywnie odsłania jego najcenniejsze sekrety. To oświecająca energia przenikająca umysły uczonych, odkrywców i skrybów, zapalająca lampę postępu tam, gdzie wciąż zalega mrok ignorancji.',
    examples: ['Prometeusz', 'Enki', 'Saraswati', 'Ogma', 'Seszat', 'Mimir', 'Atena'],
  },
  {
    key: 'storm',
    name: 'Burzy',
    mains: ['element', 'wrath'],
    description:
      'Potęga kataklizmu, bezduszne przypomnienie o istnieniu czystej, destrukcyjnej siły, która potrafi w mgnieniu oka obrócić imperia w pył. Oślepiający piorun spadający z nieba, fale pochłaniające wybrzeża i ogień rozrywający ziemię.',
    examples: ['Thor', 'Zeus', 'Posejdon', 'Perun', 'Susanoo', 'Tlaloc', "Ba'al", 'Ulmo', 'Melkor'],
  },
  {
    key: 'harvest',
    name: 'Urodzaju',
    mains: ['element', 'grace'],
    description:
      'Bijące serce natury, płodności i obfitości. Deszcz budzący ziarno, wilgotna ziemia rodząca plony i witalność jednocząca życie. Radosna siła, która z bezwarunkową hojnością stale odnawia i wprawia w ruch biologiczny cykl świata.',
    examples: ['Demeter', 'Mokosz', 'Frey', 'Dionizos', 'Ceres', 'Izyda', 'Yavanna'],
  },
]

export const DOMAIN_BY_KEY = Object.fromEntries(DOMAINS.map((d) => [d.key, d])) as Record<DomainKey, Domain>

/**
 * The clock, clockwise from twelve: opposites face each other (six steps apart) and neighbours
 * share an attribute. The six attribute poles sit on the even slots (Gniew at Światła, Majestat at
 * Kuźni, Mądrość at Władzy, Łaska at Tajemnic, Podszept at Urodzaju, Żywioł at Zemsty).
 */
export const CLOCK_ORDER: DomainKey[] = ['light', 'war', 'forge', 'order', 'rule', 'knowledge', 'secrets', 'love', 'harvest', 'nature', 'vengeance', 'storm']

export function oppositeDomain(key: DomainKey): DomainKey {
  const i = CLOCK_ORDER.indexOf(key)
  return CLOCK_ORDER[(i + 6) % 12]
}

export type Scores = Record<AttrKey, number>

/** +1 on both mains, -1 on their opposites; the primary main rises to +2; the bonus adds +1 elsewhere. */
export function scoresFor(domain: DomainKey | null, primary: AttrKey | null, bonus: AttrKey | null): Scores {
  const s: Scores = { wrath: 0, majesty: 0, grace: 0, whisper: 0, element: 0, wisdom: 0 }
  if (!domain) return s
  const d = DOMAIN_BY_KEY[domain]
  for (const m of d.mains) {
    s[m] += 1
    s[ATTRIBUTE_BY_KEY[m].opposite] -= 1
  }
  if (primary && d.mains.includes(primary)) s[primary] += 1
  if (bonus && !d.mains.includes(bonus)) s[bonus] += 1
  return s
}

/** the four attributes that are not the domain's mains, in canonical order */
export function restOf(domain: DomainKey): AttrKey[] {
  const mains = DOMAIN_BY_KEY[domain].mains
  return ATTR_KEYS.filter((k) => !mains.includes(k))
}

export function isComplete(domain: DomainKey | null, primary: AttrKey | null, bonus: AttrKey | null): boolean {
  return !!domain && !!primary && !!bonus && DOMAIN_BY_KEY[domain].mains.includes(primary) && !DOMAIN_BY_KEY[domain].mains.includes(bonus)
}

/** "+2", "0", "−1" (a real minus sign) */
export function scoreText(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** "Bóg Wojny" / "Bogini Wojny" / "Bóstwo Wojny"; without a domain just the word for the god */
export function domainTitle(domain: DomainKey | null, gender: GodGender): string {
  const head = gender === 'f' ? 'Bogini' : gender === 'n' ? 'Bóstwo' : 'Bóg'
  return domain ? `${head} ${DOMAIN_BY_KEY[domain].name}` : `${head} bez domeny`
}

/** every god's colour on the map: the dots of its followers, its outline, its place in the legend */
export interface GodColor {
  fill: string
  /** a light rim for the dark ones, so they read on dark fields */
  stroke: string
  name: string
}
/** three shades per domain; the god picks one when it is made */
export const DOMAIN_COLOR_OPTIONS: Record<DomainKey, GodColor[]> = {
  light: [
    { fill: '#f2cf3a', stroke: '#7a5f00', name: 'żółty' },
    { fill: '#f6efe0', stroke: '#6b5a2a', name: 'biały' },
    { fill: '#ff8c1a', stroke: '#7a3a00', name: 'pomarańczowy' },
  ],
  love: [
    { fill: '#ff79b5', stroke: '#8a2d5b', name: 'różowy' },
    { fill: '#a23aa8', stroke: '#45103f', name: 'purpurowy' },
    { fill: '#ffd9b0', stroke: '#8a5a2a', name: 'kremowy' },
  ],
  forge: [
    { fill: '#ff6a1f', stroke: '#7a2400', name: 'pomarańczowy' },
    { fill: '#b87333', stroke: '#4a2a0a', name: 'miedziany' },
    { fill: '#1d1d22', stroke: '#e6e2d8', name: 'czarny' },
  ],
  war: [
    { fill: '#cf1f2a', stroke: '#5c0b11', name: 'czerwony' },
    { fill: '#7a7f8a', stroke: '#2a2d33', name: 'stalowy' },
    { fill: '#d9a400', stroke: '#5a4300', name: 'złoty' },
  ],
  rule: [
    { fill: '#6b2bb5', stroke: '#2b0d4f', name: 'purpurowy' },
    { fill: '#d9a400', stroke: '#5a4300', name: 'złoty' },
    { fill: '#1d1d22', stroke: '#e6e2d8', name: 'czarny' },
  ],
  order: [
    { fill: '#2b6fd6', stroke: '#0e2f66', name: 'niebieski' },
    { fill: '#f6efe0', stroke: '#6b5a2a', name: 'biały' },
    { fill: '#b8bfc8', stroke: '#4a515a', name: 'srebrny' },
  ],
  harvest: [
    { fill: '#2fc4b2', stroke: '#0d5a52', name: 'turkusowy' },
    { fill: '#e0b420', stroke: '#6a5200', name: 'złocisty' },
    { fill: '#4caf50', stroke: '#1b4d1e', name: 'zielony' },
  ],
  storm: [
    { fill: '#17171a', stroke: '#e6e2d8', name: 'czarny' },
    { fill: '#7fd0ff', stroke: '#1f5f8a', name: 'błękitny' },
    { fill: '#c4c9d2', stroke: '#4a515a', name: 'srebrny' },
  ],
  secrets: [
    { fill: '#8d3fd6', stroke: '#3c1363', name: 'fioletowy' },
    { fill: '#1d1d22', stroke: '#e6e2d8', name: 'czarny' },
    { fill: '#1f8a6a', stroke: '#0a3a2c', name: 'jadeitowy' },
  ],
  knowledge: [
    { fill: '#5b53d9', stroke: '#221c6b', name: 'indygo' },
    { fill: '#f6efe0', stroke: '#6b5a2a', name: 'biały' },
    { fill: '#2fc4b2', stroke: '#0d5a52', name: 'turkusowy' },
  ],
  nature: [
    { fill: '#1f6b2e', stroke: '#0a2f13', name: 'zielony' },
    { fill: '#8a5a2b', stroke: '#3a2208', name: 'brązowy' },
    { fill: '#a3c644', stroke: '#3f5a0a', name: 'żółtozielony' },
  ],
  vengeance: [
    { fill: '#55602a', stroke: '#1d2208', name: 'oliwkowy' },
    { fill: '#8f0f18', stroke: '#3a0408', name: 'krwisty' },
    { fill: '#1d1d22', stroke: '#e6e2d8', name: 'czarny' },
  ],
}
/** the first shade of each domain */
export const DOMAIN_COLORS: Record<DomainKey, GodColor> = Object.fromEntries(
  (Object.keys(DOMAIN_COLOR_OPTIONS) as DomainKey[]).map((k) => [k, DOMAIN_COLOR_OPTIONS[k][0]]),
) as Record<DomainKey, GodColor>
/** a god without a domain is marble grey */
export const NO_DOMAIN_COLOR: GodColor = { fill: '#c9c2b6', stroke: '#5c554b', name: 'szary' }
/** the colour a god wears: its own pick, else the first shade of its domain */
export function godColor(p: { domain_key: DomainKey | null; god_color?: string | null } | null | undefined): GodColor {
  if (!p || !p.domain_key) return NO_DOMAIN_COLOR
  const options = DOMAIN_COLOR_OPTIONS[p.domain_key]
  if (p.god_color) {
    const own = options.find((o) => o.fill.toLowerCase() === p.god_color!.toLowerCase())
    if (own) return own
    return { fill: p.god_color, stroke: '#1a120c', name: 'własny' }
  }
  return options[0]
}

/** Paintings in public/domains and public/attributes (768/192 px and 384/96 px JPEGs made from src/img). */
export function domainArt(key: DomainKey | null | undefined, size: 'full' | 'thumb' = 'full'): string {
  const k = key ?? 'base'
  return `/domains/${k}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

export function attributeArt(key: AttrKey, size: 'full' | 'thumb' = 'full'): string {
  return `/attributes/${key}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

/** Polish Wikipedia article for an example god; a few titles differ from the plain name. */
const WIKI_TITLES: Record<string, string> = {
  "Ba'al": 'Baal',
  'Brokkr i Sindri': 'Brokk',
  Tyr: 'Tyr_(mitologia)',
  Set: 'Set_(bóg)',
  Eris: 'Eris_(mitologia)',
  El: 'El_(bóg)',
  Kama: 'Kama_(bóg)',
  Frey: 'Frejr',
  Freyja: 'Freja',
  Ceres: 'Ceres_(mitologia)',
  Mitra: 'Mitra_(bóg)',
  Ra: 'Ra_(bóg)',
  Ares: 'Ares',
  Inti: 'Inti_(bóg)',
  Anu: 'Anu_(bóg)',
  Dagda: 'Dagda_(mitologia)',
  Lugh: 'Lug_(mitologia)',
  Mimir: 'Mimir_(mitologia)',
  Ogma: 'Ogma_(mitologia)',
  Montu: 'Montu_(bóg)',
}
export function wikiUrl(name: string): string {
  const title = WIKI_TITLES[name] ?? name.replace(/ /g, '_')
  return 'https://pl.wikipedia.org/wiki/' + encodeURI(title)
}

/** the afterlife each domain keeps for its fallen followers; the god may rewrite it on its sheet */
export const AFTERLIFE_DEFAULT: Record<DomainKey, string> = {
  war: 'Wieczne Pole Bitwy. Za dnia dusze wojowników ścierają się w chwalebnej rzezi, nocą rany zrastają się, a polegli zasiadają przy wielkich ogniskach, by pić ze złotych rogów i chwalić się bliznami.',
  love: 'Ogrody Rozkoszy. Świetliste altany i ogrody, które nigdy nie przestają kwitnąć. Dusze oddają się tańcom, uniesieniom i czułości, nie znając bólu, starości ani zmartwień.',
  nature: 'Wieczna Puszcza. Bezkresna, dzika kraina potężnych dębów i złotych łanów. Dusze wracają do korzeni, zrastają się z ziemią i stają się ogniwem wielkiego, nieprzerwanego kręgu życia.',
  rule: 'Niebiańskie Pałace. Miasto ze złota i białego marmuru zawieszone w chmurach. Każda dusza zna tam swoje miejsce w doskonałej, niewzruszonej hierarchii i nie pragnie innego.',
  light: 'Słoneczna Barka. Ognisty okręt żeglujący po bezkresnym błękicie. Dusze stają się jego świetlistymi pasażerami: promieniami, które o świcie spadają na świat jako ciepło.',
  forge: 'Wielka Kuźnia. Rozżarzone, lawą rozświetlone jaskinie w sercu świata. Dusze w pocie czoła wykuwają tam arcydzieła, a ich młoty biją w kowadła w rytmie serca ziemi.',
  knowledge: 'Nieskończona Biblioteka. Astralna przestrzeń pełna lewitujących ksiąg i zwojów. Dusze spędzają wieczność, zgłębiając tajemnice wszechświata i czytając własne losy od końca.',
  storm: 'Pandemonium. Wirujący cyklon burz, ognia i pękniętej materii. Dusze tracą w nim kształt i stają się czystą, niszczącą energią, która zasila kolejne nawałnice.',
  secrets: 'Ciemna Strona Księżyca. Miejsce, którego nikt nie widział i skąd nie wracają żadne wieści. Co się tam dzieje, wiedzą tylko ci, którzy już tam są.',
  harvest: 'Złote Łany. Kraina wiecznej, łagodnej jesieni. Dusze zasiadają do biesiady bez końca, przy stołach uginających się od chleba, miodu i wina, a wokół szumią pola, które nie znają zimy.',
  vengeance: 'Przepaść. Surowa, mroczna otchłań, w której dusze zdrajców i mścicieli trwają w wiecznej czujności: spiskują, podsłuchują i wbijają sobie noże w plecy, bo nie ma tam nikogo, komu można zaufać.',
  order: 'Kryształowy Trybunał. Dusze zrzucają tu chaos ludzkich uczuć i stają się skrzydlatymi, bezwzględnymi sługami, które w ordynku strzegą porządku świata i ważą każdy jego czyn.',
}

/** what the god's sheet says about its afterlife: its own words, or the domain's */
export function afterlifeText(player: { domain_key: DomainKey | null; afterlife_description?: string }): string {
  const own = (player.afterlife_description ?? '').trim()
  if (own) return own
  return player.domain_key ? AFTERLIFE_DEFAULT[player.domain_key] : 'Zaświaty tego bóstwa nie mają jeszcze kształtu.'
}
