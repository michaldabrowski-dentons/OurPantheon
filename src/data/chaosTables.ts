// Chaos tables (PL). One die picks the category, the other the entry.

export type ChaosCategoryKey = 'region' | 'event' | 'people' | 'magic' | 'culture' | 'disaster'

export interface ChaosEntry {
  title: string
  text: string
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
    relatedActions: 'Katastrofa, Kształtowanie lądu / Zmiana biomu',
    entries: [
      { title: 'Kurczenie się', text: 'Obszar regionu się zmniejsza.', questions: ['Jaka jest przyczyna? Handel, podbój, pogoda?', 'Kim są główni gracze?'] },
      { title: 'Rozrost', text: 'Obszar regionu się zwiększa.', questions: ['Jaka jest przyczyna? Handel, podbój, pogoda?', 'Kim są główni gracze?'] },
      { title: 'Niedola', text: 'Straszne wydarzenie uderza w region. Zaraza, głód, niszczycielskie idee, wybuch wulkanu.', questions: ['Co to jest?', 'Kogo dotyka najbardziej?', 'Jaka ważna zmiana kulturowa z tego wynika?'] },
      { title: 'Obfitość', text: 'Regionowi przytrafia się coś pomyślnego. Dobre zbiory, nowe idee, rzeka zmienia bieg.', questions: ['Co to jest?', 'Kogo dotyka najbardziej?', 'Jaka ważna zmiana kulturowa z tego wynika?'] },
      { title: 'Exodus', text: 'Frakcja opuszcza region.', questions: ['Dlaczego?', 'Dokąd się udają?'] },
      { title: 'Napływ', text: 'Duża grupa ludzi wkracza do regionu.', questions: ['Dlaczego?', 'Skąd przybywają?'] },
    ],
  },
  {
    key: 'event',
    number: 2,
    name: 'Wydarzenie',
    relatedActions: 'Katastrofa, Stworzenie / Zmiana frakcji, Stworzenie ortodoksji, Zmiana istoty',
    entries: [
      { title: 'Omen', text: 'Spadająca gwiazda, uderzenie pioruna, szelest liści. Coś sprawia, że ktoś wierzy, iż coś się święci.', questions: ['Czym jest omen?', 'Gdzie i komu się przydarza?', 'Co według nich zwiastuje?', 'Jakie znaczące wydarzenie ostatecznie wywołuje?'] },
      { title: 'Spotkanie', text: 'Dochodzi do spotkania znaczących osób.', questions: ['Kim one są?', 'Czego dotyczy?', 'Kto nie dotrzymuje swojej części umowy?'] },
      { title: 'Burza', text: 'Pewnej nocy zdarza się szczególnie gwałtowna burza.', questions: ['Gdzie i jakiego rodzaju?', 'Kto utknął w środku i z czym musi się zmierzyć?'] },
      { title: 'Święto', text: 'Pojawia się nowa tradycja wokół konkretnego dnia.', questions: ['Kto je obchodzi?', 'Co się świętuje?', 'Jak się je obchodzi?', 'Kto jest z niego wykluczony?'] },
      { title: 'Konflikt', text: 'Wojna, bitwy, spory, sport.', questions: ['O co chodzi?', 'Kto wygrywa i jakim kosztem?', 'Co zostaje utracone na zawsze?'] },
      { title: 'Chwila', text: 'Mała chwila spokoju i ciszy. Wytchnienie od czegoś nieustępliwego.', questions: ['Co pozwala, by do niej doszło?', 'Jaka burza następuje po niej?'] },
    ],
  },
  {
    key: 'people',
    number: 3,
    name: 'Ludzie',
    relatedActions: 'Stworzenie / Zmiana cywilizacji, frakcji, istoty, Rozkaz dla awatara',
    entries: [
      { title: 'Twórca', text: 'Artysta, bard, pisarz, rzeźbiarz stworzył jakieś wielkie dzieło.', questions: ['Co to jest i gdzie się znajduje?', 'Jaki ma wpływ na szerszą kulturę?', 'Kim jest twórca i jak dzieło wpływa na jego życie?'] },
      { title: 'Przywódca', text: 'W wybranej cywilizacji pojawia się charyzmatyczny przywódca. Stwórz nową frakcję skupioną na nim, niezwiązaną z żadnym bóstwem.', questions: ['Jakie są jego cele?', 'Kim są jego sojusznicy?', 'Kim są jego wrogowie?', 'Czy odnosi sukces?'] },
      { title: 'Legenda', text: 'Opowieści o triumfie lub niedoli inspirują legendę lub opowieść ludową.', questions: ['Co opowiada się w karczmach i przy ogniskach?', 'Co wydarzyło się naprawdę?'] },
      { title: 'Wynalazca', text: 'Ktoś opracowuje nową rzecz, która ułatwia życie.', questions: ['Co to jest?', 'Jaki problem rozwiązuje?', 'Komu pomaga najbardziej?', 'Jaki problem tworzy?'] },
      { title: 'Wyrocznia', text: 'Ktoś twierdzi, że ma wiedzę o przyszłości bez związku z bóstwami.', questions: ['Kim jest?', 'Co przepowiada?', 'Jaki związek ma naprawdę?'] },
      { title: 'Nawrócony', text: 'Ktoś na eksponowanym stanowisku zaczyna czcić bóstwo albo je porzuca. Zmień neutralną frakcję w ortodoksję lub odwrotnie.', questions: ['Kim jest i do jakiej grupy należy?', 'Które bóstwo zaczyna lub przestaje czcić?', 'Jakie komplikacje z tego wynikają?'] },
    ],
  },
  {
    key: 'magic',
    number: 4,
    name: 'Magia / Nieznane',
    relatedActions: 'Katastrofa, Kształtowanie lądu / Zmiana biomu, Wskrzeszenie / Rozkaz dla awatara (Awatar Chaosu)',
    entries: [
      { title: 'Odpływ', text: 'Coś sprawia, że magia opuszcza region lub lud.', questions: ['Gdzie lub komu się to przydarza?', 'Jaka jest przyczyna?', 'Czy da się to naprawić?'] },
      { title: 'Szarlatan', text: 'Ktoś twierdzi, że ma moc boga.', questions: ['Co potrafi?', 'Co zapewnia mu jego rzekomą moc?', 'Jak to wszystko obraca się przeciwko niemu?'] },
      { title: 'Ukryte', text: 'Przedmiot o niewiarygodnej mocy zostaje wykonany i ukryty.', questions: ['Kto go wykonuje i po co?', 'Gdzie i dlaczego jest ukryty?'] },
      { title: 'Błogosławiony', text: 'Ktoś wierzy, że odkrył sposób na rozmowę z bóstwami.', questions: ['Kim jest?', 'Czy potrafi? Jak?', 'Które bóstwo odpowiada?', 'Co robi z tą wiedzą?'] },
      { title: 'Źródło', text: 'Zostaje odkryte źródło magicznej energii.', questions: ['Gdzie i przez kogo?', 'Jakie cudowne korzyści przynosi?', 'Jakie koszmary się z niego wyłaniają?', 'Czy da się je okiełznać?'] },
      { title: 'Zakazane', text: 'Ktoś znajduje coś, na co nie jest gotowy.', questions: ['Kto to znajduje?', 'Co to jest?', 'Jak go to zmienia?', 'Czy chciało zostać znalezione?'] },
    ],
  },
  {
    key: 'culture',
    number: 5,
    name: 'Kultura',
    relatedActions: 'Stworzenie / Zmiana cywilizacji, frakcji, Stworzenie ortodoksji',
    entries: [
      { title: 'Lustro pęka', text: 'Wybierz cywilizację lub frakcję i rozbij ją na co najmniej 2 inne.', questions: ['Co prowadzi do ich rozpadu?', 'Na ile grup się rozpadają?', 'Co połączy je z powrotem?'] },
      { title: 'Wieża upada', text: 'Następuje klęska albo sprawy podupadają. Wybierz cywilizację i dodaj jej dodatkowy brak.', questions: ['Co doprowadziło do tej klęski?', 'Jaka jest dobra strona tej sytuacji?'] },
      { title: 'Wiatry się zmieniają', text: 'Kulturowe odejście od czegoś. Wybierz cywilizację i zmień jedną z jej cech lub specjalności.', questions: ['Kto lub co to zapoczątkowało?', 'Jak zmienia to oblicze cywilizacji?'] },
      { title: 'Luka zostaje wypełniona', text: 'Brak zostaje zaspokojony. Wybierz cywilizację i usuń lub zmień jeden z jej braków.', questions: ['Jak przezwyciężają ten brak?', 'Jakie możliwości to otwiera i kto na nich korzysta?'] },
      { title: 'Fałszywy', text: 'Wybierz Ortodoksję. Jest teraz neutralną frakcją, która czci fikcyjne bóstwo albo inną koncepcję.', questions: ['Co lub kto wywołało tę zmianę?', 'Które bóstwo porzucili?', 'Co to bóstwo o tym sądzi i co z tym robi?'] },
      { title: 'Uzurpowany tron', text: 'Frakcja kontrolująca cywilizację zostaje obalona, odsunięta w głosowaniu lub usunięta.', questions: ['Dlaczego zostaje obalona i co się z nią dzieje?', 'Kto może na tym najbardziej skorzystać?'] },
    ],
  },
  {
    key: 'disaster',
    number: 6,
    name: 'Katastrofa',
    relatedActions: 'Stworzenie / Zmiana istoty, Kształtowanie lądu / Zmiana biomu, Awatar Chaosu',
    entries: [
      { title: 'Trzęsienie ziemi', text: 'Trzęsienie ziemi pustoszy region.', questions: ['Gdzie się to dzieje?', 'Kto jest nieszczęsną ofiarą?', 'Co rozkwita na gruzach?'] },
      { title: 'Pożar', text: 'W dużym skupisku ludności wybucha wielki pożar.', questions: ['Gdzie się to dzieje?', 'Co lub kto cudem ocalało?'] },
      { title: 'Powódź', text: 'Gdzieś dochodzi do wielkiej powodzi.', questions: ['Jaka jest skala? Budynek, miasto, region?', 'Co ważnego zostało utracone i dla kogo?', 'Jak długo trwa?'] },
      { title: 'Rój', text: 'Rój istot, potworów albo armia spada na region.', questions: ['Z czego się składa?', 'Jaka jest jego przyczyna?', 'Jak zostaje powstrzymany?', 'Czy to się powtórzy?'] },
      { title: 'Przyziemna', text: 'Komuś przytrafia się mała, osobista katastrofa.', questions: ['Co to jest?', 'Kogo dotyka?', 'Jaki efekt motyla wywołuje?'] },
      { title: 'To nadchodzi', text: 'Teraz wszystko jest jasne. Wszystkie omeny na to wskazywały. Gdy nadejdzie, to koniec.', questions: ['Za ile rund od teraz gra się skończy?', 'Czy to wszystko, czego się obawialiście?', 'Czy to jest to, czego od początku chcieliście?', 'Czy jest coś, co może to powstrzymać albo temu pomóc?'] },
    ],
  },
]

export const CHAOS_BY_KEY: Record<ChaosCategoryKey, ChaosCategory> = Object.fromEntries(
  CHAOS_CATEGORIES.map((c) => [c.key, c]),
) as Record<ChaosCategoryKey, ChaosCategory>

export function chaosCategoryByDie(die: number): ChaosCategory {
  return CHAOS_CATEGORIES[Math.min(6, Math.max(1, die)) - 1]
}
