// Chaos tables (PL). One die picks the category, the other the entry.
// `text` is what the card says at the table; `past` is how the Chronicle relates it afterwards.

export type ChaosCategoryKey = 'region' | 'event' | 'people' | 'magic' | 'culture' | 'disaster'

export interface ChaosEntry {
  title: string
  text: string
  /** the same event told in the past, for the book */
  past: string
  questions: string[]
}

export interface ChaosCategory {
  key: ChaosCategoryKey
  number: 1 | 2 | 3 | 4 | 5 | 6
  name: string
  relatedActions: string
  entries: [ChaosEntry, ChaosEntry, ChaosEntry, ChaosEntry, ChaosEntry, ChaosEntry]
}

export const CHAOS_CATEGORIES: ChaosCategory[] = [
  {
    key: 'region',
    number: 1,
    name: 'Region',
    relatedActions: 'Kataklizm, Kształtowanie Lądów, Migracja',
    entries: [
      { title: 'Kurczenie się', text: 'Obszar regionu się zmniejsza.', past: 'I skurczył się region, i było go mniej niż dawniej.', questions: ['Jaka jest przyczyna? Handel, podbój, pogoda?', 'Kim są główni gracze?'] },
      { title: 'Rozrost', text: 'Obszar regionu się zwiększa.', past: 'I rozrósł się region, i było go więcej niż dawniej.', questions: ['Jaka jest przyczyna? Handel, podbój, pogoda?', 'Kim są główni gracze?'] },
      { title: 'Niedola', text: 'Straszne wydarzenie uderza w region. Zaraza, głód, niszczycielskie idee, wybuch wulkanu.', past: 'I spadła na region niedola, jakiej nie pamiętano.', questions: ['Co to jest?', 'Kogo dotyka najbardziej?', 'Jaka ważna zmiana kulturowa z tego wynika?'] },
      { title: 'Obfitość', text: 'Regionowi przytrafia się coś pomyślnego. Dobre zbiory, nowe idee, rzeka zmienia bieg.', past: 'I nastała w regionie obfitość, i działo się ludziom dobrze.', questions: ['Co to jest?', 'Kogo dotyka najbardziej?', 'Jaka ważna zmiana kulturowa z tego wynika?'] },
      { title: 'Exodus', text: 'Lud opuszcza region: wyznawcy jednego bóstwa odchodzą z miasta na inny heks.', past: 'I opuścił lud swój region, i poszedł w świat.', questions: ['Dlaczego?', 'Dokąd się udają?'] },
      { title: 'Napływ', text: 'Duża grupa ludzi wkracza do regionu.', past: 'I wkroczyła do regionu wielka rzesza ludzi.', questions: ['Dlaczego?', 'Skąd przybywają?'] },
    ],
  },
  {
    key: 'event',
    number: 2,
    name: 'Wydarzenie',
    relatedActions: 'Kataklizm, Zmiana Istoty, Nawracanie, Święta Wojna',
    entries: [
      { title: 'Omen', text: 'Spadająca gwiazda, uderzenie pioruna, szelest liści. Coś sprawia, że ktoś wierzy, iż coś się święci.', past: 'I ukazał się omen, i uwierzyli ludzie, że coś się święci.', questions: ['Czym jest omen?', 'Gdzie i komu się przydarza?', 'Co według nich zwiastuje?', 'Jakie znaczące wydarzenie ostatecznie wywołuje?'] },
      { title: 'Spotkanie', text: 'Dochodzi do spotkania znaczących osób.', past: 'I spotkali się ci, których imiona coś znaczyły.', questions: ['Kim one są?', 'Czego dotyczy?', 'Kto nie dotrzymuje swojej części umowy?'] },
      { title: 'Burza', text: 'Pewnej nocy zdarza się szczególnie gwałtowna burza.', past: 'I przyszła nocą burza, jakiej nie widziano.', questions: ['Gdzie i jakiego rodzaju?', 'Kto utknął w środku i z czym musi się zmierzyć?'] },
      { title: 'Święto', text: 'Pojawia się nowa tradycja wokół konkretnego dnia.', past: 'I ustanowili ludzie nowe święto, i obchodzili je co roku.', questions: ['Kto je obchodzi?', 'Co się świętuje?', 'Jak się je obchodzi?', 'Kto jest z niego wykluczony?'] },
      { title: 'Konflikt', text: 'Wojna, bitwy, spory, sport.', past: 'I wybuchł konflikt, i stanęli ludzie przeciw sobie.', questions: ['O co chodzi?', 'Kto wygrywa i jakim kosztem?', 'Co zostaje utracone na zawsze?'] },
      { title: 'Chwila', text: 'Mała chwila spokoju i ciszy. Wytchnienie od czegoś nieustępliwego.', past: 'I nastała chwila spokoju, i odetchnął świat.', questions: ['Co pozwala, by do niej doszło?', 'Jaka burza następuje po niej?'] },
    ],
  },
  {
    key: 'people',
    number: 3,
    name: 'Ludzie',
    relatedActions: 'Stworzenie / Rozwój Cywilizacji, Exodus, Zmiana Istoty, Rozkaz dla Awatara',
    entries: [
      { title: 'Twórca', text: 'Artysta, bard, pisarz, rzeźbiarz stworzył jakieś wielkie dzieło.', past: 'I stworzył pewien twórca wielkie dzieło, o którym mówiono długo.', questions: ['Co to jest i gdzie się znajduje?', 'Jaki ma wpływ na szerszą kulturę?', 'Kim jest twórca i jak dzieło wpływa na jego życie?'] },
      { title: 'Przywódca', text: 'W wybranej cywilizacji pojawia się charyzmatyczny przywódca, niezwiązany z żadnym bóstwem. Opowiedzcie, kim jest i czego chce.', past: 'I powstał wśród ludu przywódca, za którym poszli.', questions: ['Jakie są jego cele?', 'Kim są jego sojusznicy?', 'Kim są jego wrogowie?', 'Czy odnosi sukces?'] },
      { title: 'Legenda', text: 'Opowieści o triumfie lub niedoli inspirują legendę lub opowieść ludową.', past: 'I zrodziła się legenda, i opowiadano ją przy ogniskach.', questions: ['Co opowiada się w karczmach i przy ogniskach?', 'Co wydarzyło się naprawdę?'] },
      { title: 'Wynalazca', text: 'Ktoś opracowuje nową rzecz, która ułatwia życie.', past: 'I wymyślił ktoś rzecz nową, która odmieniła życie ludzi.', questions: ['Co to jest?', 'Jaki problem rozwiązuje?', 'Komu pomaga najbardziej?', 'Jaki problem tworzy?'] },
      { title: 'Wyrocznia', text: 'Ktoś twierdzi, że ma wiedzę o przyszłości bez związku z bóstwami.', past: 'I ogłosił się ktoś wyrocznią, i mówił o przyszłości bez pytania bóstw.', questions: ['Kim jest?', 'Co przepowiada?', 'Jaki związek ma naprawdę?'] },
      { title: 'Nawrócony', text: 'Ktoś na eksponowanym stanowisku zaczyna czcić bóstwo albo je porzuca. W wybranym mieście jeden wyznawca zmienia bóstwo.', past: 'I nawrócił się ktoś możny, albo porzucił swoje bóstwo, a lud poszedł za nim.', questions: ['Kim jest i do jakiej grupy należy?', 'Które bóstwo zaczyna lub przestaje czcić?', 'Jakie komplikacje z tego wynikają?'] },
    ],
  },
  {
    key: 'magic',
    number: 4,
    name: 'Magia / Nieznane',
    relatedActions: 'Kataklizm, Kształtowanie Lądów, Wskrzeszenie / Rozkaz dla Awatara (Awatar Chaosu)',
    entries: [
      { title: 'Odpływ', text: 'Coś sprawia, że magia opuszcza region lub lud.', past: 'I odpłynęła magia, i został region bez niej.', questions: ['Gdzie lub komu się to przydarza?', 'Jaka jest przyczyna?', 'Czy da się to naprawić?'] },
      { title: 'Szarlatan', text: 'Ktoś twierdzi, że ma moc boga.', past: 'I pojawił się szarlatan, który mienił się bogiem.', questions: ['Co potrafi?', 'Co zapewnia mu jego rzekomą moc?', 'Jak to wszystko obraca się przeciwko niemu?'] },
      { title: 'Ukryte', text: 'Przedmiot o niewiarygodnej mocy zostaje wykonany i ukryty.', past: 'I wykonano przedmiot wielkiej mocy, i ukryto go przed światem.', questions: ['Kto go wykonuje i po co?', 'Gdzie i dlaczego jest ukryty?'] },
      { title: 'Błogosławiony', text: 'Ktoś wierzy, że odkrył sposób na rozmowę z bóstwami.', past: 'I uwierzył ktoś, że znalazł drogę do rozmowy z bóstwami.', questions: ['Kim jest?', 'Czy potrafi? Jak?', 'Które bóstwo odpowiada?', 'Co robi z tą wiedzą?'] },
      { title: 'Źródło', text: 'Zostaje odkryte źródło magicznej energii.', past: 'I odkryto źródło mocy, z którego biła magia.', questions: ['Gdzie i przez kogo?', 'Jakie cudowne korzyści przynosi?', 'Jakie koszmary się z niego wyłaniają?', 'Czy da się je okiełznać?'] },
      { title: 'Zakazane', text: 'Ktoś znajduje coś, na co nie jest gotowy.', past: 'I znalazł ktoś to, na co nie był gotowy.', questions: ['Kto to znajduje?', 'Co to jest?', 'Jak go to zmienia?', 'Czy chciało zostać znalezione?'] },
    ],
  },
  {
    key: 'culture',
    number: 5,
    name: 'Kultura',
    relatedActions: 'Stworzenie / Rozwój Cywilizacji, Nawracanie, Exodus',
    entries: [
      { title: 'Lustro pęka', text: 'Wybierz cywilizację i rozbij ją: część jej wyznawców odchodzi na sąsiedni heks i zakłada nowe miasto.', past: 'I pękło lustro, i rozpadł się lud na części.', questions: ['Co prowadzi do ich rozpadu?', 'Na ile grup się rozpadają?', 'Co połączy je z powrotem?'] },
      { title: 'Wieża upada', text: 'Następuje klęska albo sprawy podupadają. Wybierz cywilizację i dodaj jej dodatkowy brak.', past: 'I upadła wieża, i podupadły sprawy ludu.', questions: ['Co doprowadziło do tej klęski?', 'Jaka jest dobra strona tej sytuacji?'] },
      { title: 'Wiatry się zmieniają', text: 'Kulturowe odejście od czegoś. Wybierz cywilizację i zmień jedną z jej cech lub specjalności.', past: 'I zmieniły się wiatry, i odwrócił się lud od dawnych obyczajów.', questions: ['Kto lub co to zapoczątkowało?', 'Jak zmienia to oblicze cywilizacji?'] },
      { title: 'Luka zostaje wypełniona', text: 'Brak zostaje zaspokojony. Wybierz cywilizację i usuń lub zmień jeden z jej braków.', past: 'I wypełniła się luka, i nie brakowało już ludowi tego, czego brakowało.', questions: ['Jak przezwyciężają ten brak?', 'Jakie możliwości to otwiera i kto na nich korzysta?'] },
      { title: 'Fałszywy prorok', text: 'W wybranym mieście ktoś głosi fikcyjne bóstwo albo inną koncepcję. Wyznawcy jednego z bóstw słabną: jeden z nich odchodzi.', past: 'I zjawił się fałszywy prorok, i czcili ludzie odtąd to, czego nie było.', questions: ['Co lub kto wywołało tę zmianę?', 'Które bóstwo porzucili?', 'Co to bóstwo o tym sądzi i co z tym robi?'] },
      { title: 'Uzurpowany tron', text: 'Ci, którzy rządzą cywilizacją, zostają obaleni, odsunięci w głosowaniu lub usunięci.', past: 'I obalono tych, którzy rządzili, i tron przeszedł w inne ręce.', questions: ['Dlaczego zostaje obalona i co się z nią dzieje?', 'Kto może na tym najbardziej skorzystać?'] },
    ],
  },
  {
    key: 'disaster',
    number: 6,
    name: 'Katastrofa',
    relatedActions: 'Stworzenie / Zmiana Istoty, Kształtowanie Lądów, Awatar Chaosu',
    entries: [
      { title: 'Trzęsienie ziemi', text: 'Trzęsienie ziemi pustoszy region.', past: 'I zadrżała ziemia, i spustoszyła region.', questions: ['Gdzie się to dzieje?', 'Kto jest nieszczęsną ofiarą?', 'Co rozkwita na gruzach?'] },
      { title: 'Pożar', text: 'W dużym skupisku ludności wybucha wielki pożar.', past: 'I wybuchł wielki pożar tam, gdzie mieszkało wielu.', questions: ['Gdzie się to dzieje?', 'Co lub kto cudem ocalało?'] },
      { title: 'Powódź', text: 'Gdzieś dochodzi do wielkiej powodzi.', past: 'I przyszła wielka woda, i zalała, co napotkała.', questions: ['Jaka jest skala? Budynek, miasto, region?', 'Co ważnego zostało utracone i dla kogo?', 'Jak długo trwa?'] },
      { title: 'Rój', text: 'Rój istot, potworów albo armia spada na region.', past: 'I spadł na region rój, i nie było przed nim ucieczki.', questions: ['Z czego się składa?', 'Jaka jest jego przyczyna?', 'Jak zostaje powstrzymany?', 'Czy to się powtórzy?'] },
      { title: 'Przyziemna', text: 'Komuś przytrafia się mała, osobista katastrofa.', past: 'I przytrafiła się komuś mała katastrofa, która nie była mała dla niego.', questions: ['Co to jest?', 'Kogo dotyka?', 'Jaki efekt motyla wywołuje?'] },
      { title: 'To nadchodzi', text: 'Teraz wszystko jest jasne. Wszystkie omeny na to wskazywały. Gdy nadejdzie, to koniec.', past: 'I stało się jasne, na co wskazywały wszystkie omeny: nadchodził koniec.', questions: ['Za ile rund od teraz gra się skończy?', 'Czy to wszystko, czego się obawialiście?', 'Czy to jest to, czego od początku chcieliście?', 'Czy jest coś, co może to powstrzymać albo temu pomóc?'] },
    ],
  },
]

/**
 * How the Chronicle folds each question into the relation: the lead replaces the question,
 * the answer follows it. "Komu pomaga najbardziej?" + "Nikomu" -> "A najbardziej pomogło to: nikomu."
 */
export const QUESTION_LEADS: Record<string, string> = {
  // region
  'Jaka jest przyczyna? Handel, podbój, pogoda?': 'A przyczyną tego było:',
  'Kim są główni gracze?': 'A najwięcej mieli w tym do powiedzenia:',
  'Co to jest?': 'A było to:',
  'Kogo dotyka najbardziej?': 'A najbardziej dotknęło to:',
  'Jaka ważna zmiana kulturowa z tego wynika?': 'I odmieniło to obyczaje ludzi tak:',
  'Dlaczego?': 'A powodem było:',
  'Dokąd się udają?': 'I udali się:',
  'Skąd przybywają?': 'A przybyli:',
  // event
  'Czym jest omen?': 'A omenem tym było:',
  'Gdzie i komu się przydarza?': 'Przydarzyło się to:',
  'Co według nich zwiastuje?': 'A zwiastowało według nich:',
  'Jakie znaczące wydarzenie ostatecznie wywołuje?': 'I wywołało to ostatecznie:',
  'Kim one są?': 'A byli to:',
  'Czego dotyczy?': 'A dotyczyło to:',
  'Kto nie dotrzymuje swojej części umowy?': 'A umowy nie dotrzymał:',
  'Gdzie i jakiego rodzaju?': 'A przyszła ona:',
  'Kto utknął w środku i z czym musi się zmierzyć?': 'A w środku utknął:',
  'Kto je obchodzi?': 'Obchodzili je:',
  'Co się świętuje?': 'A świętowano:',
  'Jak się je obchodzi?': 'A obchodzono je tak:',
  'Kto jest z niego wykluczony?': 'Wykluczeni z niego byli:',
  'O co chodzi?': 'A poszło o:',
  'Kto wygrywa i jakim kosztem?': 'A wygrali:',
  'Co zostaje utracone na zawsze?': 'A utracono na zawsze:',
  'Co pozwala, by do niej doszło?': 'A pozwoliło na nią:',
  'Jaka burza następuje po niej?': 'A potem przyszła burza:',
  // people
  'Co to jest i gdzie się znajduje?': 'A dziełem tym było:',
  'Jaki ma wpływ na szerszą kulturę?': 'I wpłynęło to na kulturę tak:',
  'Kim jest twórca i jak dzieło wpływa na jego życie?': 'A twórcą był:',
  'Jakie są jego cele?': 'A celem jego było:',
  'Kim są jego sojusznicy?': 'A sojusznikami jego byli:',
  'Kim są jego wrogowie?': 'A wrogami jego byli:',
  'Czy odnosi sukces?': 'A czy mu się powiodło:',
  'Co opowiada się w karczmach i przy ogniskach?': 'A opowiadano w karczmach i przy ogniskach:',
  'Co wydarzyło się naprawdę?': 'A naprawdę wydarzyło się:',
  'Jaki problem rozwiązuje?': 'A rozwiązywało to:',
  'Komu pomaga najbardziej?': 'A najbardziej pomogło to:',
  'Jaki problem tworzy?': 'A nowym kłopotem było:',
  'Kim jest?': 'A był to:',
  'Co przepowiada?': 'A przepowiadał:',
  'Jaki związek ma naprawdę?': 'A naprawdę było tak:',
  'Kim jest i do jakiej grupy należy?': 'A był to:',
  'Które bóstwo zaczyna lub przestaje czcić?': 'A dotyczyło to bóstwa:',
  'Jakie komplikacje z tego wynikają?': 'I wynikło z tego:',
  // magic
  'Gdzie lub komu się to przydarza?': 'Przydarzyło się to:',
  'Jaka jest przyczyna?': 'A przyczyną było:',
  'Czy da się to naprawić?': 'A czy dało się to naprawić:',
  'Co potrafi?': 'A potrafił:',
  'Co zapewnia mu jego rzekomą moc?': 'A moc tę dawało mu:',
  'Jak to wszystko obraca się przeciwko niemu?': 'I obróciło się to przeciw niemu tak:',
  'Kto go wykonuje i po co?': 'A wykonał go:',
  'Gdzie i dlaczego jest ukryty?': 'A ukryto go:',
  'Czy potrafi? Jak?': 'A czy potrafił:',
  'Które bóstwo odpowiada?': 'A odpowiedziało bóstwo:',
  'Co robi z tą wiedzą?': 'A z wiedzą tą uczynił:',
  'Gdzie i przez kogo?': 'A odkryto je:',
  'Jakie cudowne korzyści przynosi?': 'A przyniosło ono:',
  'Jakie koszmary się z niego wyłaniają?': 'A wyłoniły się z niego:',
  'Czy da się je okiełznać?': 'A czy dało się je okiełznać:',
  'Kto to znajduje?': 'A znalazł to:',
  'Jak go to zmienia?': 'I zmieniło go to tak:',
  'Czy chciało zostać znalezione?': 'A czy chciało być znalezione:',
  // culture
  'Co prowadzi do ich rozpadu?': 'A do rozpadu doprowadziło:',
  'Na ile grup się rozpadają?': 'A rozpadli się na:',
  'Co połączy je z powrotem?': 'A połączyć ich mogło tylko:',
  'Co doprowadziło do tej klęski?': 'A do klęski doprowadziło:',
  'Jaka jest dobra strona tej sytuacji?': 'A dobrą stroną tego było:',
  'Kto lub co to zapoczątkowało?': 'A zapoczątkowało to:',
  'Jak zmienia to oblicze cywilizacji?': 'I zmieniło to oblicze ludu tak:',
  'Jak przezwyciężają ten brak?': 'A brak ten przezwyciężyli tak:',
  'Jakie możliwości to otwiera i kto na nich korzysta?': 'I otworzyło to drogę:',
  'Co lub kto wywołało tę zmianę?': 'A zmianę tę wywołało:',
  'Które bóstwo porzucili?': 'A porzucili bóstwo:',
  'Co to bóstwo o tym sądzi i co z tym robi?': 'A bóstwo to:',
  'Dlaczego zostaje obalona i co się z nią dzieje?': 'A obalono ją, bo:',
  'Kto może na tym najbardziej skorzystać?': 'A najwięcej zyskał na tym:',
  // disaster
  'Gdzie się to dzieje?': 'Stało się to:',
  'Kto jest nieszczęsną ofiarą?': 'A ofiarą padli:',
  'Co rozkwita na gruzach?': 'A na gruzach rozkwitło:',
  'Co lub kto cudem ocalało?': 'A cudem ocalało:',
  'Jaka jest skala? Budynek, miasto, region?': 'A sięgnęła ona:',
  'Co ważnego zostało utracone i dla kogo?': 'A utracono:',
  'Jak długo trwa?': 'A trwało to:',
  'Z czego się składa?': 'A składał się z:',
  'Jak zostaje powstrzymany?': 'A powstrzymano go tak:',
  'Czy to się powtórzy?': 'A czy miało się powtórzyć:',
  'Kogo dotyka?': 'A dotknęła ona:',
  'Jaki efekt motyla wywołuje?': 'A pociągnęło to za sobą:',
  'Za ile rund od teraz gra się skończy?': 'A koniec miał nadejść za tyle rund:',
  'Czy to wszystko, czego się obawialiście?': 'A czy tego się obawiano:',
  'Czy to jest to, czego od początku chcieliście?': 'A czy tego chciano od początku:',
  'Czy jest coś, co może to powstrzymać albo temu pomóc?': 'A powstrzymać to lub temu dopomóc mogło:',
}

export const CHAOS_BY_KEY: Record<ChaosCategoryKey, ChaosCategory> = Object.fromEntries(
  CHAOS_CATEGORIES.map((c) => [c.key, c]),
) as Record<ChaosCategoryKey, ChaosCategory>

export function chaosCategoryByDie(die: number): ChaosCategory {
  return CHAOS_CATEGORIES[Math.min(6, Math.max(1, die)) - 1]
}
