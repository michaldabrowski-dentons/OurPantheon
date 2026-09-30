// Trait lists from the rulebook (PL). Sapient creatures are those with SAPIENT_TRAITS.

export const CREATURE_TRAITS = [
  'Latające', 'Długowieczne', 'Monstrualne', 'Podziemne', 'Krótko żyjące', 'Amorficzne',
  'Opancerzone', 'Zwinne', 'Nieuchwytne', 'Eteryczne', 'Wędrowne', 'Chciwe',
  'Duże/Ogromne', 'Magiczne', 'Bierne', 'Małe/Maleńkie', 'Psioniczne', 'Pasożytnicze',
  'Dobre', 'Wataha/Stado/Rój', 'Rozumne', 'Złe', 'Zmiennokształtne', 'Drapieżnik',
  'Agresywne', 'Umysł roju', 'Ofiara', 'Łagodne', 'Skonstruowane', 'Żywiołowe',
  'Wspólnotowe', 'Płynne', 'Nocne', 'Samotnicze', 'Piękne', 'Jadowite',
]

export const SAPIENT_TRAITS = ['Rozumne', 'Umysł roju']

export const CREATURE_QUESTIONS = [
  'Gdzie się pojawiają?',
  'Jak wyglądają?',
  'Co jedzą?',
  'Jak się rozmnażają?',
  'Co jest dla nich największym zagrożeniem?',
]

export const CIV_TRAITS = [
  'Dobra', 'Rywalizująca', 'Koczownicza', 'Zła', 'Współpracująca', 'Surowa',
  'Zachowawcza', 'Izolacjonistyczna', 'Obywatelska', 'Materialistyczna', 'Różnorodna',
  'Nieustępliwa', 'Kupiecka', 'Doktrynalna', 'Adaptacyjna',
]

export const CIV_SPECIALTIES = [
  'Sztuka, opowiadanie historii', 'Biurokracja', 'Budownictwo', 'Eksploracja', 'Wiara/Religia',
  'Wynalazczość', 'Magia', 'Medycyna', 'Handel', 'Rolnictwo', 'Sztuka wojenna', 'Rozmiar (rozległa/zwarta)',
]

export const CIV_FLAWS = [
  'Magia', 'Szczęście', 'Ziemia', 'Kontakty', 'Żywność/Woda', 'Porządek',
  'Potęga', 'Zdrowie', 'Ludność', 'Bezpieczeństwo', 'Wiedza', 'Konkretny zasób',
]

export const FACTION_TYPES = [
  'Rodzina', 'Rodzina królewska', 'Wojsko', 'Organ rządzący', 'Kolektyw',
  'Partia polityczna', 'Przedsiębiorstwo/Lokal', 'Sekta/Kult', 'Gang',
]

export const FACTION_TRAITS = [
  'Dobra', 'Dyplomatyczna', 'Brutalna', 'Zła', 'Fanatyczna', 'Żądna przygód',
  'Chaotyczna', 'Biurokratyczna', 'Pokojowa', 'Praworządna', 'Dewiacyjna', 'Hulaszcza',
  'Ambitna', 'Wędrowna', 'Magiczna', 'Mężna', 'Obowiązkowa', 'Skryta',
]

export const FACTION_DESIRES = [
  'Kontrola', 'Wiedza', 'Wolność', 'Chwała', 'Zniszczenie', 'Przezwyciężyć',
  'Zasoby', 'Dominować', 'Ochrona', 'Szacunek', 'Konkretny przedmiot', 'Przetrwanie',
  'Pokój', 'Współpraca', 'Przemiana',
]

export const ORTHODOXY_REQUIREMENTS: { name: string; text: string }[] = [
  { name: 'Szerzyć', text: 'Rozgłaszać słowo o tobie lub konkretnej idei albo zwiększać swoją liczebność.' },
  { name: 'Bronić', text: 'Chronić lub zachowywać coś, co wybierzesz: miejsce, cywilizację, ideę, przedmiot.' },
  { name: 'Uciskać', text: 'Gromić wybraną przez ciebie grupę: cywilizację, religię, frakcję, istotę.' },
  { name: 'Folgować', text: 'Świętowanie, uczty, hulanki, rytualne spożywanie czegoś.' },
  { name: 'Pokutować', text: 'Pokuta za grzechy własne lub cudze. Opisz te grzechy.' },
  { name: 'Wstrzymywać się', text: 'Wstrzemięźliwość od czegoś lub unikanie czegoś, kogoś lub jakiegoś miejsca.' },
  { name: 'Uległość', text: 'Muszą stawiać ciebie ponad wszystko inne.' },
]

export const AVATAR_CONDITIONS = [
  'Nadmiernie przejmują się sprawami śmiertelników.',
  'Mają nienasycony głód lub pragnienie czegoś.',
  'Nie mogą wchodzić na gęsto zaludnione obszary.',
  'Mają wyjątkową słabość na coś przyziemnego, jak srebro, czekolada lub woda.',
  'Są nieożywionym przedmiotem, jak posąg, klejnot, góra.',
  'Są przedmiotem, który trzeba dzierżyć: broń, tarcza, księga, pojazd.',
  'Są niematerialne: język, baśń lub duch.',
  'Są śmiertelne i przechodzą przez cykl reinkarnacji.',
  'Brak im wolnej woli; wykonują wszystko, co każe twórca.',
  'Jest ich wiele (np. anioły).',
  'Nie wiedzą, że są Awatarem.',
]
