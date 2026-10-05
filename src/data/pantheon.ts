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
  examples: string
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
    examples: 'Ares, Khorne, Tyr, Świętowit, Huitzilopochtli, Montu, Guan Yu, Bishamonten, Tulkas',
  },
  {
    key: 'vengeance',
    name: 'Zemsty',
    mains: ['wrath', 'whisper'],
    description:
      'Cień, który sączy kłamstwa, tka intrygi i cierpliwie czeka na właściwy moment, by zadać cios w plecy. To przenikliwa siła chaosu i oszustwa, bezlitosna obecność dążąca do tego, by przeciwnik stracił absolutnie wszystko.',
    examples: 'Loki, Set, Eris, Czarnobóg, Sauron, Diabeł, Aryman, Tzeentch, Tezcatlipoca',
  },
  {
    key: 'rule',
    name: 'Władzy',
    mains: ['grace', 'majesty'],
    description:
      'Władza, która panuje poprzez boski majestat, niewzruszoną hierarchię i niezaprzeczalny autorytet. To fundament tronów i imperiów i przytłaczająca obecność, która staje się dla śmiertelników najwyższym rozkazem.',
    examples: 'Jahwe, Allah, Ozyrys, Dagda, Frigg, Amaterasu, Anu, Manwë, El',
  },
  {
    key: 'love',
    name: 'Miłości',
    mains: ['grace', 'whisper'],
    description:
      'Energia, która przyciąga, uwodzi, rozpala serca i każe rozumowi ustąpić miejsca czystej ekstazie. To pulsująca siła namiętności i pożądania, zdolna w jednej chwili uczynić z wroga kochanka, a z rozsądnego mędrca niewolnika pragnienia.',
    examples: 'Afrodyta, Eros, Freyja, Kama, Dziewanna, Inanna, Hathor, Slaanesh',
  },
  {
    key: 'order',
    name: 'Porządku',
    mains: ['majesty', 'wisdom'],
    description:
      'Nieugięta sprawiedliwość, która powstrzymuje cywilizowany świat przed zapadnięciem się w bezkresnym chaosie. Wyznacza twarde granice, ustanawia zasady i bezlitośnie przywraca porządek.',
    examples: 'Tyr, Atena, Maat, Mitra, Forseti, Szamasz',
  },
  {
    key: 'light',
    name: 'Światła',
    mains: ['majesty', 'element'],
    description:
      'Światło samego nieba, które z absolutną pewnością siebie rozprasza wszelką ciemność. To źródło blasku, gwiazd i onieśmielającego piękna. Czysta energia ogarniająca świat z wysokości i nadająca mu sens poprzez emanację energii.',
    examples: 'Helios, Ra, Dażbóg, Inti, Surya, Lugh, Varda',
  },
  {
    key: 'secrets',
    name: 'Tajemnic',
    mains: ['whisper', 'wisdom'],
    description:
      'Nieuchwytny spryt, proroctwo, sekret i mroczna odpowiedź, zarezerwowana wyłącznie dla wybranych. To tajemnicza esencja okultyzmu, przenikająca umysły tych, którzy z ciekawością patrzą w ciemność, pragnąc zgłębić drugą stronę rzeczywistości.',
    examples: 'Odyn, Hekate, Weles, Thot, Morrigan, Hermes',
  },
  {
    key: 'nature',
    name: 'Natury',
    mains: ['whisper', 'element'],
    description:
      'Siła całkowicie wolna, nieokiełznana i o wiele starsza niż jakiekolwiek ustanowione przez ludzkość prawa. Dzikość, brutalnie przypominająca, że pod cienką warstwą cywilizacji wciąż bije tętniące serce bestii. To pradawny zew drapieżników, natury i bezdroży.',
    examples: 'Artemida, Leszy, Cernunnos, Ullr, Tapio, Oromë',
  },
  {
    key: 'forge',
    name: 'Kuźni',
    mains: ['wisdom', 'wrath'],
    description:
      'Mądrość zahartowana w ogniu. Przenika surowy kamień, metal oraz iskrę pomysłu, zmuszając je do przeobrażenia się w coś wielkiego. To napęd wynalazców, kowali i budowniczych; stwórcza energia niosąca pewność, że przyszłość musi zostać z trudem wykuta w żarze wulkanów.',
    examples: 'Hefajstos, Swarożyc, Brokkr i Sindri, Goibniu, Ilmarinen, Aulë',
  },
  {
    key: 'knowledge',
    name: 'Wiedzy',
    mains: ['wisdom', 'grace'],
    description:
      'Mądrość, która przenika strukturę świata i aktywnie odsłania jego najcenniejsze sekrety. To oświecająca energia przenikająca umysły uczonych, odkrywców i skrybów, zapalająca lampę postępu tam, gdzie wciąż zalega mrok ignorancji.',
    examples: 'Prometeusz, Enki, Saraswati, Ogma, Seszat, Mimir, Atena',
  },
  {
    key: 'storm',
    name: 'Burzy',
    mains: ['element', 'wrath'],
    description:
      'Potęga kataklizmu, bezduszne przypomnienie o istnieniu czystej, destrukcyjnej siły, która potrafi w mgnieniu oka obrócić imperia w pył. Oślepiający piorun spadający z nieba, fale pochłaniające wybrzeża i ogień rozrywający ziemię.',
    examples: "Thor, Zeus, Posejdon, Perun, Susanoo, Tlaloc, Ba'al, Ulmo, Melkor",
  },
  {
    key: 'harvest',
    name: 'Urodzaju',
    mains: ['element', 'grace'],
    description:
      'Bijące serce natury, płodności i obfitości. Deszcz budzący ziarno, wilgotna ziemia rodząca plony i witalność jednocząca życie. Radosna siła, która z bezwarunkową hojnością stale odnawia i wprawia w ruch biologiczny cykl świata.',
    examples: 'Demeter, Mokosz, Frey, Dionizos, Ceres, Izyda, Yavanna',
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

/** Paintings in public/domains and public/attributes (768/192 px and 384/96 px JPEGs made from src/img). */
export function domainArt(key: DomainKey | null | undefined, size: 'full' | 'thumb' = 'full'): string {
  const k = key ?? 'base'
  return `/domains/${k}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

export function attributeArt(key: AttrKey, size: 'full' | 'thumb' = 'full'): string {
  return `/attributes/${key}${size === 'thumb' ? '-thumb' : ''}.jpg`
}
