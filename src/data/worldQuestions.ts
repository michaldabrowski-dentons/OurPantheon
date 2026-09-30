// World Creation: the questions every pantheon answers before the First Era.
// Drawn from creation myths across cultures: the cosmic egg and the primordial waters,
// the earth-diver, the dismembered giant, the world tree, the sky dome, the wheel of ages.
// Preset option keys are single letters; custom answers are stored as creation_options rows.
// The Prologue never asks: every preset option carries its own `story` sentence, and a custom
// answer is hung on the question's declarative `lead`.

export interface WorldOption {
  key: string
  label: string
  /** the sentence this answer becomes in the Prologue */
  story: string
}

export interface WorldQuestion {
  key: string
  title: string
  hint?: string
  /** prefix for a custom answer's Prologue sentence; the answer follows it (lowercased when `lower`) */
  lead: string
  lower?: boolean
  options: WorldOption[]
}

export const WORLD_QUESTIONS: WorldQuestion[] = [
  {
    key: 'shape',
    title: 'Jaki kształt ma świat?',
    hint: 'Płaska Ziemia Mezopotamii, kula Greków, nieskończona równina.',
    lead: 'Na początku był świat, a był to',
    lower: true,
    options: [
      { key: 'a', label: 'Płaski dysk z krawędzią, za którą jest tylko spadek', story: 'Świat jest płaskim dyskiem z krawędzią, za którą jest tylko spadek.' },
      { key: 'b', label: 'Kula, planeta wśród innych', story: 'Świat jest kulą, planetą wśród innych.' },
      { key: 'c', label: 'Nieskończenie rozległa równina, która powstaje, gdy ktoś tam dotrze', story: 'Świat jest nieskończenie rozległą równiną, która powstaje dopiero wtedy, gdy ktoś tam dotrze.' },
      { key: 'd', label: 'Coś innego: drzewo, sześcian, wstęga Möbiusa, grzbiet zwierzęcia', story: 'Świat ma kształt, jakiego nikt by się nie spodziewał: drzewa, sześcianu, wstęgi albo grzbietu zwierzęcia.' },
    ],
  },
  {
    key: 'origin',
    title: 'Z czego wyłania się świat?',
    hint: 'Ciemność, pustka, chaos, pierwotne wody, kosmiczne jajo, ciało pradawnego olbrzyma.',
    lead: 'Wyłonił się',
    lower: true,
    options: [
      { key: 'a', label: 'Z ciemności, którą trzeba rozświetlić', story: 'Wyłonił się z ciemności, którą trzeba było rozświetlić.' },
      { key: 'b', label: 'Z pustki, w której nie było nic, nawet czasu', story: 'Wyłonił się z pustki, w której nie było nic, nawet czasu.' },
      { key: 'c', label: 'Z chaosu, który wciąż się w nim kłębi', story: 'Wyłonił się z chaosu, który wciąż się w nim kłębi.' },
      { key: 'd', label: 'Z pierwotnych wód, które są wszędzie', story: 'Wyłonił się z pierwotnych wód, które są wszędzie.' },
      { key: 'e', label: 'Z ciała pradawnej istoty, którą zabiliśmy lub która sama się rozpadła', story: 'Wyłonił się z ciała pradawnej istoty, która została zabita albo sama się rozpadła.' },
      { key: 'f', label: 'Z jaja, które pękło', story: 'Wyłonił się z jaja, które pękło.' },
    ],
  },
  {
    key: 'gods',
    title: 'Skąd wzięliśmy się my, bóstwa?',
    hint: 'Tytani i olbrzymi, Bóg-Ojciec zabity przez dzieci, bogowie stworzeni przez ludzką wiarę.',
    lead: 'O bóstwach wiadomo tyle, że',
    lower: true,
    options: [
      { key: 'a', label: 'Jesteśmy rodzeństwem, dziećmi pierwszego boga, którego zabiliśmy', story: 'Bóstwa są rodzeństwem, dziećmi pierwszego boga, którego same zabiły.' },
      { key: 'b', label: 'Byliśmy zawsze. Nie ma „przed nami”', story: 'Bóstwa były zawsze. Nie ma żadnego „przed nimi”.' },
      { key: 'c', label: 'Sami nie wiemy skąd. Obudziliśmy się tutaj', story: 'Bóstwa same nie wiedzą, skąd się wzięły. Obudziły się tutaj.' },
      { key: 'd', label: 'To śmiertelnicy nas stwarzają swoją wiarą. Bez nich zblakniemy', story: 'Bóstwa stwarzają śmiertelnicy swoją wiarą. Bez niej bóstwa zblakną.' },
      { key: 'e', label: 'Jesteśmy pierwszymi myślami chaosu, które zaczęły myśleć o sobie', story: 'Bóstwa są pierwszymi myślami chaosu, które zaczęły myśleć o sobie.' },
    ],
  },
  {
    key: 'sun',
    title: 'Czy istnieje słońce?',
    hint: 'Ra na barce, Sol w rydwanie, kruk, który ukradł światło.',
    lead: 'Ze słońcem jest tak, że',
    lower: true,
    options: [
      { key: 'a', label: 'Tak, już wisi na niebie i nikt nie pamięta, kto je zawiesił', story: 'Słońce już wisi na niebie i nikt nie pamięta, kto je zawiesił.' },
      { key: 'b', label: 'Nie. Ktoś musi je stworzyć, a to kosztuje', story: 'Słońca jeszcze nie ma. Ktoś musi je stworzyć, a to kosztuje.' },
      { key: 'c', label: 'Jest wiele słońc', story: 'Słońc jest wiele.' },
      { key: 'd', label: 'Nie ma słońca. Świat świeci od wewnątrz albo światło idzie z nas', story: 'Nie ma słońca. Świat świeci od wewnątrz albo światło idzie z samych bóstw.' },
    ],
  },
  {
    key: 'moon',
    title: 'Czy istnieje księżyc?',
    hint: 'Selene, Chandra, Máni, księżyc jako oko lub odcięta głowa.',
    lead: 'Z księżycem jest tak, że',
    lower: true,
    options: [
      { key: 'a', label: 'Tak, jeden, i już odmierza noce', story: 'Księżyc jest jeden i już odmierza noce.' },
      { key: 'b', label: 'Nie. Ktoś musi go stworzyć, a to kosztuje', story: 'Księżyca jeszcze nie ma. Ktoś musi go stworzyć, a to kosztuje.' },
      { key: 'c', label: 'Jest ich kilka i każdy ma inne oblicze', story: 'Księżyców jest kilka i każdy ma inne oblicze.' },
      { key: 'd', label: 'Nie ma księżyca. Noce są zupełnie ciemne', story: 'Nie ma księżyca. Noce są zupełnie ciemne.' },
    ],
  },
  {
    key: 'above',
    title: 'Co jest ponad światem?',
    hint: 'Firmament z wodami nad nim, gałęzie Yggdrasilu, sfery niebieskie, pustka i gwiazdy.',
    lead: 'Ponad światem jest',
    lower: true,
    options: [
      { key: 'a', label: 'Pustka kosmiczna, zimna, z gwiazdami, które są odległymi słońcami', story: 'Ponad światem jest pustka kosmiczna, zimna, z gwiazdami, które są odległymi słońcami.' },
      { key: 'b', label: 'Kopuła nieba, a nad nią wody górne', story: 'Ponad światem jest kopuła nieba, a nad nią wody górne.' },
      { key: 'c', label: 'Gałęzie i korzenie drzewa świata, po których można się wspiąć', story: 'Ponad światem rozpościerają się gałęzie i korzenie drzewa świata, po których można się wspiąć.' },
      { key: 'd', label: 'Nic. Niebo jest końcem świata, jak sufit', story: 'Ponad światem nie ma nic. Niebo jest końcem świata, jak sufit.' },
    ],
  },
  {
    key: 'land',
    title: 'Od czego zaczyna się ląd?',
    hint: 'Mit nurka, który wyławia ziemię z dna, i mit skały, którą trzeba nawodnić.',
    lead: 'Na dole zaś',
    lower: true,
    options: [
      { key: 'a', label: 'Wszystko jest nagą skałą. Trzeba lać wodę', story: 'Na dole wszystko jest nagą skałą. Trzeba lać wodę.' },
      { key: 'b', label: 'Wszystko jest oceanem. Ląd trzeba wyławiać z dna', story: 'Na dole wszystko jest oceanem. Ląd trzeba wyławiać z dna.' },
      { key: 'c', label: 'Jest pusta, cicha równina, na której nic nie rośnie', story: 'Na dole jest pusta, cicha równina, na której nic nie rośnie.' },
      { key: 'd', label: 'Wszystko jest lodem albo ogniem. Trzeba to stopić lub ugasić', story: 'Na dole wszystko jest lodem albo ogniem. Trzeba to stopić lub ugasić.' },
    ],
  },
  {
    key: 'time',
    title: 'Jak płynie czas?',
    hint: 'Linia proroków, koło jug i eonów, czas, który dopiero ruszy.',
    lead: 'Czas płynie',
    lower: true,
    options: [
      { key: 'a', label: 'Liniowo, od początku ku końcowi, którego jeszcze nie znamy', story: 'Czas płynie liniowo, od początku ku końcowi, którego nikt jeszcze nie zna.' },
      { key: 'b', label: 'Kołem. Ery wracają, świat już kiedyś był i będzie znowu', story: 'Czas płynie kołem. Ery wracają, świat już kiedyś był i będzie znowu.' },
      { key: 'c', label: 'Dopiero od pierwszego śmiertelnika. Do tej pory stoi', story: 'Czas ruszy dopiero od pierwszego śmiertelnika. Do tej pory stoi.' },
      { key: 'd', label: 'Różnie w różnych miejscach. Są krainy, gdzie stoi', story: 'Czas płynie różnie w różnych miejscach. Są krainy, gdzie stoi.' },
    ],
  },
  {
    key: 'death',
    title: 'Czy istnieje już śmierć?',
    hint: 'Hades i Duat, koło reinkarnacji, światy bez śmierci sprzed upadku.',
    lead: 'Ze śmiercią jest tak, że',
    lower: true,
    options: [
      { key: 'a', label: 'Śmierć jeszcze nie istnieje. Ktoś ją sprowadzi', story: 'Śmierć jeszcze nie istnieje. Ktoś ją sprowadzi.' },
      { key: 'b', label: 'Umarli schodzą do podziemi i tam trwają', story: 'Umarli schodzą do podziemi i tam trwają.' },
      { key: 'c', label: 'Dusze wracają w nowych ciałach', story: 'Dusze wracają w nowych ciałach.' },
      { key: 'd', label: 'Umarli po prostu znikają, bez śladu i bez zaświatów', story: 'Umarli po prostu znikają, bez śladu i bez zaświatów.' },
    ],
  },
  {
    key: 'older',
    title: 'Czy jest coś starszego od nas?',
    hint: 'Mojry i Wyrd, tytani w Tartarze, śpiące pradawne rzeczy.',
    lead: 'Starsze od bóstw jest',
    lower: true,
    options: [
      { key: 'a', label: 'Nic. My jesteśmy najstarsi', story: 'Nic nie jest starsze od bóstw. One są najstarsze.' },
      { key: 'b', label: 'Pierwsi, których pokonaliśmy i uwięziliśmy. Śpią pod światem', story: 'Starsi od bóstw są Pierwsi, których bóstwa pokonały i uwięziły. Śpią pod światem.' },
      { key: 'c', label: 'Los, któremu i my podlegamy', story: 'Starszy od bóstw jest Los, któremu i one podlegają.' },
      { key: 'd', label: 'Coś śpi w głębi i lepiej tego nie budzić', story: 'Starsze od bóstw jest coś, co śpi w głębi, i lepiej tego nie budzić.' },
    ],
  },
  {
    key: 'magic',
    title: 'Czym jest magia?',
    hint: 'Dar Prometeusza, runy Odyna, resztki chaosu, tkanka świata.',
    lead: 'Magia jest',
    lower: true,
    options: [
      { key: 'a', label: 'Jeszcze jej nie ma. Może się pojawi', story: 'Magii jeszcze nie ma. Może się pojawi.' },
      { key: 'b', label: 'Jest tkanką świata i każdy może ją naciągnąć', story: 'Magia jest tkanką świata i każdy może ją naciągnąć.' },
      { key: 'c', label: 'Jest darem bóstw i tylko my ją dajemy', story: 'Magia jest darem bóstw i tylko one ją dają.' },
      { key: 'd', label: 'Jest resztką chaosu: niebezpieczna, nieprzewidywalna, kusząca', story: 'Magia jest resztką chaosu: niebezpieczna, nieprzewidywalna, kusząca.' },
    ],
  },
  {
    key: 'presence',
    title: 'Jak bóstwa objawiają się śmiertelnikom?',
    hint: 'Sny i znaki, bogowie w przebraniu wędrowca, grzmot z góry.',
    lead: 'Śmiertelnikom bóstwa objawiają się tak, że',
    lower: true,
    options: [
      { key: 'a', label: 'Nigdy wprost, tylko przez sny, znaki i wyrocznie', story: 'Bóstwa nigdy nie objawiają się wprost, tylko przez sny, znaki i wyrocznie.' },
      { key: 'b', label: 'Chodzimy wśród nich w przebraniu', story: 'Bóstwa chodzą wśród śmiertelników w przebraniu.' },
      { key: 'c', label: 'Przemawiamy grzmotem, ogniem i cudem, bez ogródek', story: 'Bóstwa przemawiają grzmotem, ogniem i cudem, bez ogródek.' },
      { key: 'd', label: 'Śmiertelnicy nie wiedzą, że istniejemy, i długo się nie dowiedzą', story: 'Śmiertelnicy nie wiedzą, że bóstwa istnieją, i długo się nie dowiedzą.' },
    ],
  },
  {
    key: 'many',
    title: 'Ile jest bóstw naprawdę?',
    hint: 'Panteon, który znamy, i ci, o których milczymy.',
    lead: 'A bóstw naprawdę jest',
    lower: true,
    options: [
      { key: 'a', label: 'Tyle, ilu nas przy tym stole', story: 'Bóstw jest tyle, ile zasiada przy tym stole.' },
      { key: 'b', label: 'Są jeszcze inni, którzy odeszli, śpią albo się ukrywają', story: 'Są jeszcze inne bóstwa, które odeszły, śpią albo się ukrywają.' },
      { key: 'c', label: 'Poza nami są niezliczone pomniejsze duchy miejsc i rzeczy', story: 'Poza bóstwami są niezliczone pomniejsze duchy miejsc i rzeczy.' },
      { key: 'd', label: 'Jest ktoś ponad nami, kto nie odpowiada na wołanie', story: 'Jest ktoś ponad bóstwami, kto nie odpowiada na wołanie.' },
    ],
  },
]

export const WORLD_QUESTION_BY_KEY: Record<string, WorldQuestion> = Object.fromEntries(WORLD_QUESTIONS.map((q) => [q.key, q]))

export const OPTION_LETTERS = 'ABCDEFGHIJ'

/** One Prologue sentence from a settled answer: the preset's story, or the lead plus a custom answer. */
export function prologueLine(q: WorldQuestion, answer: { key: string; label: string }): string {
  const preset = q.options.find((o) => o.key === answer.key)
  if (preset) return preset.story
  const a = answer.label.trim().replace(/[.]+$/, '')
  const body = q.lower ? a.charAt(0).toLowerCase() + a.slice(1) : a
  return `${q.lead} ${body}.`
}

export const PROLOGUE_OPENING = 'Na początku, zanim padło pierwsze Słowo, bóstwa spojrzały w pustkę i powiedziały, jak jest.'
