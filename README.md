# O BOGOWIE!: wirtualny stół

Wieloosobowy, przeglądarkowy stół do gry *Our Pantheon* (hack *Dawn of Worlds*, D. W. O'Boyle, CC BY-SA 4.0).
Śledzi Logos, dynamiczną inicjatywę, Paletę, mapę heksagonalną z istotami, miastami i wyznawcami bóstw,
Ery i Kartę Chaosu. Interfejs po polsku, w stylu kamiennej świątyni.

## Stos

- React 18 + TypeScript + Vite, CSS Modules, Framer Motion (flip Karty Chaosu), Zustand
- Supabase: Auth (login + hasło, bez e-maila), Postgres (stan gry), Realtime (synchronizacja bez odświeżania)
- Cała logika gry (koszty, tura, rzuty) żyje w funkcjach Postgres (`supabase/migrations/0003_functions.sql`);
  klient nigdy nie zapisuje stanu bezpośrednio, poza Paletą.

## Uruchomienie

1. Załóż projekt na [supabase.com](https://supabase.com). W **Authentication → Sign In / Providers → Email**
   zostaw włączone, ale **wyłącz „Confirm email”**. Konta to login + hasło; login zamienia się w syntetyczny
   adres `login@panteon.invalid` (`src/lib/login.ts`), na który nigdy nic nie jest wysyłane. Nie trzeba SMTP
   ani *Redirect URLs*.
2. W **SQL Editor** uruchom po kolei pliki z `supabase/migrations/`:
   `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_realtime.sql`, `0005_world_creation.sql`,
   `0006_chronicle_book.sql`, `0007_god_gender.sql`, `0008_login_and_guests.sql`, `0009_creation_sync.sql`,
   `0010_ensure_turn.sql`, `0011_playbooks.sql`, `0012_hex_map.sql`, `0013_ocean_start.sql`, `0014_biome_tiles.sql`, `0015_fix_biome_draw.sql`, `0016_colors_and_tiles.sql`, `0017_prices_and_ruins.sql`,
   `0018_verse_lock_avatars_prophecies.sql`, `0019_afterlife_avatar_hand.sql`, `0020_fertility_rivers_resources.sql`,
   `0021_chaos_night.sql`, `0022_night_2d6_ranks_mutations.sql`, `0023_two_tiles_pbta.sql`.
   (Alternatywnie: `npx supabase link` i `npx supabase db push`.)
   Jeśli baza działała już wcześniej, wystarczy dograć brakujące pliki od końca listy. Migracja 0012 nie
   przenosi starych światów: gry zaczęte przed nią nie mają mapy i trzeba je założyć od nowa.
3. Skopiuj `.env.example` do `.env.local` i wpisz `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
4. `npm install`, potem `npm run dev`. Otwórz `http://localhost:5173`.

Do testu wieloosobowego wystarczą dwie przeglądarki (lub okno prywatne) i dwa loginy.

### Konta

- **Zarejestruj**: login (litery, cyfry, kropka, myślnik, podkreślenie; polskie znaki dozwolone) i hasło
  (min. 6 znaków). Login staje się imieniem gracza. Nie ma odzyskiwania hasła, bo nie ma e-maila; w razie
  czego hasło można ustawić w SQL Editorze:
  `update auth.users set encrypted_password = crypt('NoweHaslo', gen_salt('bf')) where email = 'login@panteon.invalid';`
- Wejścia gości nie ma (zostało usunięte na życzenie); migracja 0008 nadal pozwala na użytkowników bez
  adresu, więc nic nie przeszkadza włączyć go z powrotem.

### Wdrożenie na Render

W repozytorium jest `render.yaml` (Blueprint): statyczna strona z `npm ci && npm run build`, katalog `dist`
i przekierowaniem `/*` na `index.html`. W Render: **New → Blueprint** (albo **New → Static Site** z tymi samymi
ustawieniami) i podaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. Vite wkleja je w trakcie builda,
więc po zmianie zmiennych trzeba zrobić redeploy.

### Wdrożenie na Railway

1. Nowy projekt z tego repozytorium na GitHubie. Railway (Nixpacks) sam wykryje Node, uruchomi `npm ci`,
   `npm run build` i `npm start` (`serve -s dist`, z przekierowaniem tras SPA na `index.html`).
2. W **Variables** usługi dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. Vite wkleja je w trakcie
   builda, więc po zmianie zmiennych trzeba zrobić redeploy.

- `npm run test:db`: uruchamia migracje i rozgrywa dwuosobową partię w PGlite (Postgres w WASM), bez Supabase.
- `npm run dev` i `http://localhost:5173/preview?screen=game`: podgląd ekranów na sztucznych danych
  (`screen=login|lobby|room|palette|creation|game|rolling|chaos`, `&turn=me`, `&draw=1|chosen`,
  `&step=N&host=0` dla Stwarzania Świata, `&overture=1|2|3` odtwarza otwarcie Ery, `&overture=0` je pomija,
  `&domain=0` w przedsionku to bóstwo bez domeny, `&sheet=p2` w grze otwiera kartę tego bóstwa,
  `&contest=defender|attacker|resolved` pokazuje starcie w danym stanie, `&dice=N` ustawia każdą kość podglądu na N:
  1 to porażka, 4 sukces z konsekwencjami, 6 pełen sukces). Podgląd odpowiada na wołania
  okien lokalnie (`window.__previewRpc`), więc każdą akcję na mapie da się przejść bez Supabase. Tylko w trybie dev.

## Przebieg

`/` – zaloguj się loginem i hasłem, stwórz świat albo wpisz kod →
`/room/KOD` – przedsionek: tworzenie postaci (imię, rodzaj gramatyczny, domena na zegarze dwunastu bóstw,
atrybuty, opis, dodatkowe informacje; kod do zaproszenia) → Paleta (Tak / Zasłony / Nie; swoje wpisy przeciąga się między kolumnami, a w grze Paleta wraca
pod przyciskiem nad ołtarzem) → Stwarzanie Świata (gospodarz przewraca pytania, wszyscy widzą to samo i głosują;
przy remisie rozstrzyga głos gospodarza; wynik trafia do Świętej Księgi jako Prolog) → otwarcie Ery (kurtyna z
rysunkiem epoki, `EraOverture`) → gra: Rzut Logos → Faza Bóstw (turę ma bóstwo z największym Logos; słowa
wskazuje się na mapie) → Faza Chaosu (Karta z ogniem, wybór jednego z dwóch zdarzeń, pytania przydzielone
bóstwom; na koniec miasta rosną i najwierniej czczone bóstwa dostają Logos) → następna runda.

## Mapa

- Wielki heksagon o promieniu 5 (91 pól, heksy wierzchołkiem do góry, współrzędne osiowe q, r, środek 0,0).
  Świat zaczyna się jako ocean (`generate_map` z migracji 0013): ląd wznoszą bóstwa Kształtowaniem Lądów.
  Jedenaście biomów z malowanymi kaflami w kształcie heksa (`src/data/biomes.ts`, pliki `public/biomes/*.png`
  skopiowane z `src/img/biomy`, 128 px wysokości, heks 112 px szerokości): woda, góry, góry pustynne, góry
  śnieżne, puszcza, dżungla, trawa, pustynia, zima, bagno, ugór. Kafel jest też ikoną biomu (karta pola,
  wybór biomu). Bez emotikon, bez szwów, bez linii brzegu. Znaki istot i piramidy wyznawców leżą na ciemnych
  płytkach z cieniem, pod miastem stoi jego nazwa. Mapa przewija się, gdy nie mieści się w oknie; przybliżenie
  przyciskami w rogu albo Ctrl i kółkiem myszy.
- Woda i Góry są zablokowane dla miast, plemion i awatarów (także przez Exodus i Migrację). Stada i bestie
  żyją też w górach, lecz nigdy na wodzie.
- Żyzność (0020): każdy ląd ma liczbę u góry heksa (`hex_fertility`, lustro w `world.fertilityOf`). Baza
  biomu: trawa 2, puszcza 2, góry 1, dżungla 1, bagno 1, pustynia, śnieg, ugór, góry pustynne i śnieżne 0,
  woda nic. Do tego +1 za sąsiednią wodę, +1 za rzekę (na pustyni +3: Nil), ranga stada na polu
  (`entities.strength` −1..+3) i ranga surowca (`hexes.resource_bonus` −1..+3). Bez przycinania.
- Rangi (0022): stado i surowiec dostają przy tworzeniu rzut 2k6 + Łaska: 6- to −1 (szkodniki / przeklęte
  złoże), 7..8 to 0 (dzika zwierzyna / pospolity surowiec), 9..10 to +1 (pożyteczne stado / cenne złoże),
  11 to +2 (tuczne stado / żyła złota), 12+ to +3 (święte stado / boski surowiec). Ranga stada jest cechą
  gatunku: wędruje z nim, dziedziczą ją kopie i odmiany; stada sprzed 0022 i te z Migracji mają +1. Karta pola
  i plakietka przy znaku pokazują rangę.
- Rzeki (`rivers`): koryto to lista pól od góry źródłowej przez lądy; ujście to krawędź pola wody
  (`mouth_kind` water), pole wspólne z inną rzeką (river) albo nic (none: rzeka urwana). Rysowane jako lekko
  falowana ścieżka przez środki pól (`RiverLayer` w `HexMap.tsx`). Woda postawiona na korycie czyni z tego
  pola ujście, góra przecina rzekę, a ten, kto ją wypiętrzył, od razu wyklikuje nowe koryto (`continue_river`,
  bez dopłaty, w tym samym słowie); gdy przerwie, rzeka zostaje urwana i dalej karmi swoje pola.
- Surowiec (`hexes.resource`): jedna emotikona z listy 💎 🌾 🪵 ⚙️ 🍇 🍋 🌽 🏺 🪙 🪨 🥔 w prawym górnym rogu
  heksa, na zawsze; pole zalane wodą traci surowiec.
- Miejsca na polu mają role (`hex_occupants.slot`): 0 stado (lewy górny róg), 1 bestia albo plemię (dół),
  2 i 3 awatary (dolne rogi); jedno stado, jedna bestia lub plemię, dwa awatary na pole. Istoty
  (`entities.diet` herbivore/carnivore, `entities.strength` −1..+3) stoją tam jako emotikony (`entities.emoji`,
  unikalne w grze; pule w `src/data/emoji.ts`); bestia nosi plakietkę siły. Awatar ma punkty życia
  (`entities.hp`). Każde bóstwo wybiera w przedsionku jeden z trzech odcieni swojej domeny
  (`players.god_color`, `DOMAIN_COLOR_OPTIONS`); w tekstach gry wyznawcy to zawsze „wyznawcy”, nigdy kropki.
- Miasto (`cities`, jedno na pole) leży na środku jako piramida kropek; każda kropka to wyznawca jednego
  bóstwa (`city_followers`), w kolorze jego domeny (`DOMAIN_COLORS` w `src/data/pantheon.ts`). Poziom miasta
  to liczba kropek (1 Koczowisko … 10 Wielkie imperium, `src/data/cities.ts`); dziesięć to sufit. Miasto bez
  kropek obraca się w ruinę (`destroy_city_if_empty`). Rządzi nim bóstwo z największą liczbą kropek. Bezbożni
  (`cities.atheists`, szare kropki) liczą się do ludności, lecz nie do wyznawców ani do władcy; Nawracanie
  i Rozwój biorą ich najpierw, a gdy giną, nikt ich nie opłakuje.
- Mysz słyszą tylko wielokąty pól; emotikony i kropki mają `pointer-events: none`. Klik poza akcją otwiera
  kartę pola przy myszce, jedną płaską płytę: tytułem jest nazwa miasta (albo biom), pod nim poziom, dostępność,
  wyznawcy z portretem rządzącego, dary, opis, istoty rozumne, istoty, awatary. W trakcie akcji dozwolone pola
  mają złoty obrys i jaśnieją; na lewym panelu stoi karta z pytaniem, kosztem oraz przyciskami „Zakończ akcję”
  i „Przerwij” (`src/features/game/map/`). Przy słowach płatnych dystansem świecą tylko pola, na które
  starcza Logos.
- Ekran gry to trzy kolumny: lewy panel podsumowań (`SummaryPanel`, od góry: status tury i ostatnie
  zdarzenie, pytanie mapy albo starcie, kości z ostatnim rzutem kogokolwiek i przyciski 2k6 / Logos, Logos
  z premiami (wyznawcy, premia z wyznawców na koniec Chaosu, skromność, awatar), Święta Księga / Paleta /
  Byty świata, a na samym dole Odpoczynek), kolumna akcji i mapa na reszcie ekranu. Przekaż Logos jest słowem
  w kategorii „Proroctwa i Słowa”; wyjście to ikona w prawym górnym rogu. Tabliczki bóstw u góry pokazują
  Logos, liczbę wyznawców i premię do rzutu. Każdy rzut kośćmi na akcję (Rozwój, Kataklizm, starcia, 2k6 przy stole) otwiera u wszystkich
  okno `DiceOverlay`: kości toczą się przez chwilę, dopiero potem pada wynik.
- Cechy, specjalności, braki i uwarunkowania zniknęły: istota, cywilizacja i awatar mają tylko nazwę, znak
  i opis (opis nowego bytu to werset z księgi). Stworzenie Cywilizacji nie wymaga rzutu.

## Słowa na mapie

- Kształtowanie Lądów: biom, potem do trzech sąsiadujących pól (trzeci klik kończy sam). Pola z miastem lub
  awatarem nie staną się Wodą ani Górami. Góra na rzece otwiera od razu krok „Nowe koryto”.
- Pobłogosław ziemię (4 / 7 / 10): surowiec z listy (💎 🌾 🪵 ⚙️ 🍇 🍋 🌽 🏺 🪙 🪨 🥔 ⭐ ✨ 🫒 🍄 🤢 ☣️, wszystkie
  zawsze do wyboru), potem ląd (góry też, woda nie); nowe błogosławieństwo zastępuje stary surowiec. Księga
  rzuca 2k6 + Łaska na rangę (okno kości), −1..+3 do Żyzności pola.
- Wylej Rzekę (3 / 8 / 12, cena stała): klik w górę to źródło, potem kolejne sąsiednie pola (tryb mapy
  `river`: klik w ostatnie pole cofa je, woda albo cudza rzeka kończy); gdy nie ma dokąd płynąć, karta mapy
  każe przerwać. Przez awatara liczy się zasięg do źródła.
- Dwa kafle i progi PbtA (0023): każde słowo poza Kształtowaniem Lądów, Wylej Rzekę, Pielgrzymką i
  Wskrzeszeniem kończy się dwoma kwadratowymi kaflami atrybutów (`AttributeTiles`; pary w `roll.options`
  w `src/data/actions.ts` i w `action_attrs()` w bazie). Kafel pokazuje grafikę, nazwę, zdanie o sposobie
  wykonania i tylko modyfikator bóstwa (plus wypełnione proroctwo). Klik płaci Logos i rzuca 2k6 + atrybut
  po stronie serwera; okno pokazuje kości i werdykt (`RollReveal`), zamyka się, i dopiero wtedy widać
  efekt na mapie. Progi: 10+ Pełen sukces, 7..9 Sukces z konsekwencjami, 6- Porażka: Logos przepada, świat
  nie zmienia się (wyjątek: Błogosławieństwo zostawia przeklęte złoże). Wykonujący nie widzi okna kości
  stołu (zgłasza rzut przez `claim()` w `diceGate.ts`), pozostali gracze widzą je jak dotąd. Werset dopisuje
  się potem z karty „Święta Księga czeka” na lewym panelu. Stare wiersze `create_creature` czyta
  `logActionKey()` jako bestię albo stado.
- Kataklizm (Gniew / Żywioł, domyślnie deszcz ognia): rodzaj, pole i co zostanie po zniszczeniu (bez zmian,
  pustynia, ugór, woda). 10+: obrażeń jest połowa (w dół) wyniku, każde losowo w wyznawcę miasta, istotę
  nierozumną albo awatara (−1 życia), a biom zmienia się, gdy na polu nikt nie przeżył (`outcome.biome_after`);
  7..9: ćwierć wyniku (najmniej jedno), ziemia bez zmian; 6-: nikt nie ranny. Istoty rozumne giną dopiero bez
  miasta. Ogień spada na pole, gdy okno z kośćmi się zamknie (`useBurst` czeka na `dismissed`).
  Zniszczone miasto zostawia na polu czaszkę (`entities.attributes.ruin`).
- Wielki Cud (Majestat / Mądrość): 10+ cud zachodzi, 7..9 zachodzi z ceną opisaną w wersecie, 6- nic; awatar
  użyty jako ręka spala się tylko wtedy, gdy cud zaszedł.
- Pobłogosław ziemię (Łaska / Mądrość): 10+ surowiec o randze +1..+3 wedle wyniku, 7..9 pospolity (0), 6-
  przeklęte złoże (−1).
- Stworzenie Bestii (Gniew / Żywioł) i Stworzenie Stada (Łaska / Żywioł): nazwa i emotikona z osobnej puli
  (`BEAST_EMOJI` / `HERBIVORE_EMOJI`), potem ląd z wolnym miejscem roli. 10+: siła albo ranga +1..+3 wedle
  wyniku (9..10: +1, 11..12: +2, 13+: +3), 7..9: 0, 6-: nic nie powstaje (znak zostaje wolny). Istota
  Rozumna (Majestat / Mądrość): 10+ plemię na wskazanym polu i drugie na najżyźniejszym wolnym polu obok,
  7..9 jedno, 6- nic. Zesłanie Awatara (Majestat / Podszept): 10+ pełne życie, 7..9 o jedno mniej, 6- nic.
- Zmiana Istoty (Podszept / Żywioł): klik w jedną istotę na jednym polu; 10+ odmiana o sile lub randze o jeden
  wyższej (do +3), 7..9 o sile pierwowzoru, 6- nic (`variant_of`).
- Migracja (Podszept / Żywioł, 3 / 1 / 3 plus 1 za heks): istota, potem pole docelowe; 10+ gatunek mnoży się
  na nowe pole, 7..9 przenosi się (opuszcza stare), 6- nikt nie rusza, dystans zapłacony.
- Rozmnożenie (Łaska / Żywioł, 5 / 2 / 6): klik w stado, bestię albo plemię z wolnym polem obok; 10+ kopie
  na dwóch najżyźniejszych wolnych polach obok, 7..9 jedna na losowym, 6- nic. Kopie dziedziczą siłę gatunku
  (`night_candidates` liczy wolne pola jak w nocy Chaosu).
- Stworzenie Cywilizacji (Mądrość / Łaska): pole z istotą rozumną i nazwa; 10+ miasto z dwiema kropkami
  twórcy, 7..9 z jedną, 6- lud nie osiada.
- Rozwój Cywilizacji (Łaska / Mądrość): miasto i dar z listy (`GIFTS` w `src/data/cities.ts`, albo własny);
  10+ dwie kropki, 7..9 jedna, 6- nic (dar odnotowany jako odrzucony w `city_gifts`).
- Exodus (Gniew / Podszept, 12 / 8 / 4 plus 1 za heks): miasto z moimi wyznawcami, ilu ich zabieram i którą
  istotę rozumną, pole docelowe; 10+ wszyscy dochodzą, a nowe miasto dziedziczy dary; 7..9 jeden ginie w
  drodze (gdy idzie ich co najmniej dwóch; dusza do zaświatów) i dary nie wędrują; 6- nikt nie wychodzi.
  W zajętym polu wyznawcy dołączają do miasta.
- Proroctwo (Majestat / Mądrość): 10+ nieuchronność +2, 7..9 +1, 6- prorok milczy.
- Nawracanie i Święta Wojna to starcia (`contests`): atakujący deklaruje i płaci (`declare_contest`), księga
  rzuca za niego; tura zamiera, aż obrońca u siebie wybierze atrybut i rzuci (`answer_contest`), potem atakujący
  dopisuje werset (`commit_contest`) albo odwołuje starcie przed odpowiedzią (`cancel_contest`). Obie strony
  wybierają atrybut dwoma kaflami (obrońca w `ContestOverlay`, pary w `defence.options` i w
  `action_attrs(kind, 'defence')`); różnica rzutów decyduje. Nawracanie: atak 2k6 + Majestat albo Podszept,
  obrona 2k6 + Majestat albo Mądrość; wygrana o 3+ przejmuje dwóch wyznawców, o 1..2 jednego. Wojna: armia to
  moi wyznawcy z miasta, w którym rządzę (jeden zostaje), koszt 8 / 6 / 4 plus 1 za heks; atakujący 2k6 +
  Gniew albo Podszept + armia, obrońca (Obrona Miasta) 2k6 + Łaska albo Gniew + swoje kropki w celu + życie
  awatara na murach; skala zwycięstwa jak w briefie (pełne, pyrrusowe, remis bez oblężenia, odparcie, masakra).
- Awatar jest ręką bóstwa na ziemi (0019): nie ma już darmowej akcji. Słowa Terraformacji, Tworzenia Życia
  i Śmiertelników (także Nawracanie i Święta Wojna) można wypowiedzieć przez awatara za połowę ceny (w górę,
  `via_avatar_id`), ale cel musi leżeć najwyżej dwa heksy od niego (wszystkie pola Kształtowania, pole
  kataklizmu, miejsce istoty, miasto Rozwoju i Nawracania, miasto źródłowe Exodusu i Wojny; cel Migracji;
  dalekie cele Exodusu i Wojny bez ograniczeń). Okno akcji zaczyna się od pytania „Kto wypowiada słowo”, kafle
  pokazują obok ceny bóstwa cenę przez awatara (kolor żaru). Przy Exodusie awatar idzie z ludem na nowe pole
  (gdy jest miejsce). Wielki Cud przez awatara spala go. Na wojnie awatar prowadzi lud: jego życie dolicza się
  do rzutu armii; awatar obrońcy stojący w atakowanym mieście dolicza życie do obrony.
- Pielgrzymka Awatara (zamiast Rozkazu): 1 Logos za heks, bez granicy, na pole z wolnym miejscem. Awatar
  rodzi się z 2 życiami (`entities.max_hp`), każde kolejne wcielenie (Wskrzeszenie 12 / 15 / 16 albo nowy awatar
  po śmierci poprzedniego) wraca o jedno życie silniejsze, najwyżej 12; sen Fazy Chaosu leczy jedno życie do
  maksimum (wiersz `avatars_heal`).
- Zaświaty: każdy wyznawca, który zginął (kataklizm, straty w wojnie po obu stronach, sukcesy po wygranej),
  trafia jako dusza do `players.afterlife` swojego bóstwa, pod znakiem ludu, z którego miasto powstało
  (`city_species_emoji`, `collect_souls`). Karta bóstwa ma sekcję „Zaświaty”: opis (domyślny z domeny,
  `AFTERLIFE_DEFAULT`, własny przez `set_afterlife`) i chmurę dusz.
- Walka Awatarów (5 / 4 / 3): mój awatar i awatar innego bóstwa najwyżej dwa heksy od siebie (dalszego trzeba
  najpierw dogonić Pielgrzymką); starcie 2k6 + Gniew albo Majestat po obu stronach (obrońca wybiera u siebie
  dwoma kaflami). Wygrana o 3+: wróg traci 2 życia; o 1..2: wróg 1 i ja 1; remis: obaj po 1; przegrana o 1..2: ja 1;
  o 3+: ja 2. Awatar bez życia ginie i znika z mapy. Plansza `avatar_fight.jpg`.
- Wygrana Święta Wojna (pełna albo pyrrusowa) daje atakującemu tyle sukcesów, ilu liczyła armia; w oknie
  wersetu rozdziela je między wyznawców miasta (jeden sukces zabija jednego, połowa zabitych w górę nawraca się),
  rany awatara obrońcy stojącego na tym polu (jeden sukces to jedno życie) i istoty tego pola (jeden sukces usuwa
  jedną); `commit_contest(p_contest_id, p_summary, p_allocation)`.
- Proroctwo (10 / 5 / 3): klik w własnego awatara na mapie (przycisk „Proroctwo” w karcie pola, albo kafel);
  treść wpisana w oknie trafia do księgi jako „Prorok X zapowiedział, że: …” i do tabeli `prophecies`
  z nieuchronnością +1, rosnącą o 1 każdej Fazy Chaosu do +3. Przy każdym rzucie (Rozwój, Kataklizm, obrona
  i atak w starciach) selektor „Wypełnij proroctwo” dodaje nieuchronność raz; proroctwo staje się spełnione,
  trafia do „Spełnione Proroctwa” na karcie bóstwa, a księga notuje „Słowa proroka X stały się ciałem: …”.
- Koniec Chaosu (`end_chaos_phase`): każde miasto zyskuje kropkę dla bóstwa, które nim rządzi (remis losowo),
  a suma kropek daje +3, +2 i +1 Logos trzem najwierniej czczonym bóstwom.
- Słowa bez rzutu kończą się krokiem wersetu w oknie; słowa z kaflami zamykają okno po kościach, a werset
  dopisuje się z karty „Święta Księga czeka”. Księga układa werset z wyniku (`actions_log.outcome`,
  `composeVerse`), gracz może go przepisać (`edit_log_summary`). Zapis do księgi jest ZAMKIEM tury
  (`games.verse_pending_by`): póki gracz nie dopisze wersetu (albo nie zostawi podpowiedzi), tura nie przechodzi
  dalej, a Faza Chaosu nie może się zacząć; po odświeżeniu strony karta „Święta Księga czeka” na lewym panelu
  pozwala dokończyć zapis (`release_verse` zostawia podpowiedź).
- Każdy rzut kośćmi otwiera u pozostałych graczy okno kości (toczenie, wynik i werdykt progu, przy starciach obie
  strony: „Atakujący: 2k6 + Gniew = 9 | Obrońca: 2k6 + Łaska = 7”) z przyciskiem „Kontynuuj” / „Zobacz wynik”;
  rzucający widzi kości we własnym oknie (`claim()`), a okna z wynikiem i decyzjami (werset starcia, podział
  sukcesów, obrona) pokazują się dopiero po kliknięciu (`diceGate.ts`, wspólny `useDiceTumble`). Wersety nie znają słów „heks” ani „pole”
  ani cyfr: mówią o ziemiach i krainach, liczby piszą słowami. Frakcje i religie zniknęły z gry.
- Faza Chaosu: kartę odwraca i losuje ponownie tylko gospodarz. Po karcie gospodarz klika „Rozpocznij noc”
  (`start_chaos_night`) albo „Pomiń noc i zakończ rundę” (`chaos_skip`).
- Noc Chaosu (0021, 0022; tabela `chaos_nights`): serwer rozgrywa jedną jednostkę na wywołanie `chaos_step`
  (gospodarz woła co ~1,5 s; po 20 s ciszy każdy może „Poprowadzić noc”), wszyscy patrzą na mapę (panel
  `NightPanel` w prawym dolnym rogu z nazwą fazy, pierścień wokół tego, kto się rusza, miecze tam, gdzie
  czeka walka). Fazy: Zwierzęta, Bestie, Plemiona, Miasta (w fazie losowo), potem leczenie awatarów,
  proroctwa, ranking wyznawców (+3/+2/+1 Logos) i koniec rundy; stary wzrost „+1 dla władcy” zniknął.
  Gospodarz ma „Pomiń fazę” (`chaos_skip_phase`: reszta fazy od razu, ale walki, wyniki i nazwy nadal czekają)
  i „Pomiń noc” (`chaos_skip`: księga rzuca walki sama, nadaje nazwy tymczasowe). Każdy rzut nocy to 2k6;
  komunikaty mówią o jednostce po imieniu w liczbie mnogiej („Nyki migrują”, `nightLine`).
  Stado 2k6: 2 wymiera, 3-5 migruje na losowy wolny sąsiedni heks, 6-8 pasie się, 9-10 migruje na
  najżyźniejszy wolny sąsiedni heks, 11 mnoży się (kopia na najlepszym sąsiednim heksie), 12 mutacja; przy
  plemieniu lub w mieście jest udomowione (3-10 nie rusza się). Bestia 2k6: 2 zdycha, 3-5 migruje, 6-8 leży
  w leżach, 9-10 poluje (atak na sąsiednie słabsze miasto: siła > ludność, lub awatara: siła > życia; inaczej
  krok ku najbliższemu stadu, a gdy stad brak, ku najbliższemu miastu, przy którym staje; nigdy nie wchodzi
  na pole z miastem), 11 kopia na najlepszym sąsiednim heksie, która od razu poluje, 12 mutacja (nowa wataha
  od razu poluje). Plemię 2k6: 2 przegrywa z naturą, 3-5 eksploruje, 6-8 obozuje, 9-10 idzie ku Ziemi
  Obiecanej (najżyźniejszy wolny sąsiad), a gdy już stoi na najlepszej ziemi wokół (Żyzność ≥ 1, bez miasta),
  osiada i zakłada miasto (1 bezbożny; nazwę nadaje jego bóstwo), 11 dzieli się (kopia rusza na najlepszy
  sąsiedni heks), 12 mutacja (schizma). Mutacja (`chaos_name_mutation`): noc czeka, aż bóstwo stwórca gatunku
  (gospodarz za nieobecnych, po minucie każdy) nada nowej odmianie nazwę i wolny znak; odmiana dziedziczy
  rangę lub siłę, jest `variant_of` pierwowzoru i pojawia się na najlepszym sąsiednim heksie.
  Walka (bestia wchodzi na pole z bestią lub plemieniem, bestia napada na miasto lub awatara, osadnicy na
  bestię): obie strony 2k6 + siła (plemię 0, miasto ludność, awatar życia, osadnicy liczba); klikają bogowie
  obu stron (lewa napastnik, prawa obrońca, `chaos_fight_roll`; gospodarz za nieobecnych, po minucie każdy).
  Różnica 3+: przegrany zjedzony (miasto traci grupy, awatar życia równe różnicy); 1..2: przegrany ucieka na
  wolne sąsiednie pole (ginie, gdy nie ma gdzie); remis: napastnik wraca. Osadnicy rozstrzygają tabelą Świętej
  Wojny. Po kościach wynik zostaje na stole (`status` verdict), aż obaj bogowie walki klikną „Przeczytałem”
  (`chaos_ack_fight`; gospodarz za wszystkich, po minucie każdy); dopiero potem noc rusza, a miasto założone
  w tej walce czeka na nazwę.
  Miasto 2k6 + Żyzność F − ludność P: 10+ rozkwit (+1 bezbożny, sufit 10); 7..9 przy P ≤ F lata spokoju,
  przy P > F kolonia: nadwyżka P−F (najpierw bezbożni, potem losowo) idzie na najlepsze pole w odległości
  1..2 bez miasta i cudzego plemienia; bestia na nim oznacza walkę, brak takiego pola oznacza, że nadwyżka
  zostaje; nowe miasto nazywa bóstwo z największą liczbą odchodzących grup; 6- głód: miasto traci losowego
  mieszkańca, a bez ostatniego obraca się w ruinę. Cała noc to jeden werset w Świętej Księdze (`nightVerse`).

## Zasady wdrożone w bazie

- Start bez Logos: pierwsza runda zaczyna się od rzutu wszystkich bóstw. Co rundę 2k6 + premia za skromność
  (≤5 Logos na koniec rundy, do +3). Rzut Logos jest w dolnym pasku, z animacją kości.
- Darmowa akcja awatara (raz na rundę) z bezpiecznikami z podręcznika: istotę tworzy tylko raz na Erę,
  Wielki Cud niszczy awatara, Wskrzeszenie przez awatara to jego poświęcenie, rzut z −2 (`log_dice_roll`
  z modyfikatorem), a każdy nowy awatar musi mieć od 1 do 3 uwarunkowań.
- Święta Księga czyta się jak Księga Rodzaju: Prolog bez pytań („Świat jest płaskim dyskiem…”), rozdział na
  rundę (nagłówek „Pierwsza Era, runda 3”), numerowane wersety w czasie przeszłym budowane w kliencie z wierszy
  `actions_log` (`src/data/chronicle.ts`): „I stworzyła Matka Soli istoty, i nazwała je Dzikie Stwory. I widziała
  Matka Soli, że były rozumne i łagodne.” Bez kosztów, bez liczb z kości (tylko „I sprzyjał temu los”), bez
  Rzutów Logos, a w wersetach bez słowa „runda” („Nie rzekł już nic w tych czasach, lecz zapadł w sen.”).
  Los i Chaos relacjonowane bezosobowo. Każdy typ wersetu ma kilka wariantów wybieranych z id wpisu.
  Rodzaj gramatyczny bóstwa (♂ bóg / ♀ bogini / bóstwo, `players.god_gender`, domyślnie bóg) ustawia się
  w przedsionku i w ✎; znak stoi przy imieniu na tabliczce.
- Playbooki (bez skutków mechanicznych na razie): każde bóstwo wybiera jedną z 12 domen (Wojny, Zemsty, Władzy,
  Miłości, Porządku, Światła, Tajemnic, Natury, Kuźni, Wiedzy, Burzy, Urodzaju) na zegarze, gdzie przeciwieństwa
  leżą naprzeciw siebie. Domena daje dwóm głównym atrybutom +1, ich przeciwieństwom −1; gracz podnosi jeden główny
  do +2 i dodaje +1 jednemu z pozostałych czterech. Sześć atrybutów: Gniew ↔ Łaska, Majestat ↔ Podszept,
  Mądrość ↔ Żywioł. W bazie są tylko trzy klucze (`domain_key`, `attr_primary`, `attr_bonus`, walidowane
  w `set_god`), wartości liczy `scoresFor` w `src/data/pantheon.ts`. Portret bóstwa to obraz domeny
  (bezkształtne bóstwo przed wyborem). Kliknięcie tabliczki w grze otwiera kartę postaci (atrybuty, opis,
  dodatkowe informacje, dzieła bóstwa); właściciel edytuje tam imię, rodzaj, opis i notatki.
- Stwarzanie Świata: bieżące pytanie trzyma `games.settings.creation_step` (`set_creation_step`, tylko gospodarz).
- Ekran gry: u góry tylko bóstwa (z barwą domeny i liczbą wyznawców); cały lewy panel to akcje z obrazami
  (`public/actions`, źródła w `src/img`); środek to mapa; dolny pasek trzyma Odpoczynek, Przekaż Logos,
  Rzuć 2k6, Rzuć 2k6 na Logos, animację kości i wyjście.
- Tura zawsze u bóstwa z największym Logos wśród nieśpiących; remis: aktualny gracz zachowuje turę, potem
  najniższe miejsce przy stole. Spadek poniżej innego gracza przekazuje turę natychmiast (Realtime).
  Bezpiecznik: gdy klient widzi Fazę Bóstw bez posiadacza tury dłużej niż chwilę, odświeża wiersz gry
  i woła `ensure_turn` (migracja 0010), który wyznacza turę od nowa albo domyka zakończone rzuty.
- Dolny pasek pod statusem pokazuje ostatnie zdarzenie przy stole (`src/data/tableEvents.ts`): kto co kliknął
  i ile wyrzucił. Okno akcji zamyka się samo, gdy tura się kończy albo zaczyna Faza Chaosu.
- Runda kończy się, gdy wszyscy odpoczywają lub mają 0 Logos → Faza Chaosu.
- Kości rzuca serwer (`log_dice_roll`, `roll_logos`, `reveal_chaos`), więc wszyscy widzą to samo.
- Era: głosowanie w dowolnej rundzie; decyduje większość bóstw. Każdą nową Erę (i pierwszą) otwiera kurtyna
  z rysunkiem epoki; to, którą już widziano, pamięta `localStorage` na danym urządzeniu.
- Akcje w panelu: Terraformacja (Kształtowanie Lądów, Kataklizm, Wielki Cud, Pobłogosław ziemię, Wylej Rzekę), Tworzenie Życia (Stworzenie
  Bestii, Stworzenie Stada, Stworzenie Istoty Rozumnej, Zmiana Istoty, Migracja, Rozmnożenie), Śmiertelnicy (Stworzenie Cywilizacji, Rozwój
  Cywilizacji, Exodus, Nawracanie, Święta Wojna), Działania Awatara (Zesłanie, Pielgrzymka, Wskrzeszenie, Walka Awatarów, Proroctwo), Proroctwa
  i Słowa (Przekaż Logos); zawsze w tej kolejności, nigdy wg ceny. Akcje z warunkiem (np. „musi istnieć miasto”) są nieaktywne, póki mapa go nie spełnia.
- Werset do Świętej Księgi powstaje na końcu każdej akcji z tego, co się stało (opener, wynik z mapy, zdanie
  o cechach); gracz może go przepisać; „Zostaw jak jest” zapisuje podpowiedź. Opis nowego bytu to ten sam
  werset.
- Przykładowi bogowie każdej domeny są odnośnikami do polskiej Wikipedii (`wikiUrl` w `src/data/pantheon.ts`).
- Bez Logos, przez `edit_entity`: istota ↔ istota rozumna, śmierć awatara; `delete_entity` usuwa byt (także
  z mapy) po potwierdzeniu. Każda taka zmiana ma wpis w Świętej Księdze.

## Struktura

```
supabase/migrations/   schemat, RLS, funkcje RPC, publikacja Realtime
src/data/              akcje i koszty, listy cech, biomy, emotikony, miasta, tabele Chaosu, panteon (atrybuty,
                       domeny, kolory), księga (chronicle.ts), rysunki Er (eraArt.tsx)
src/lib/               typy wierszy, geometria heksów (hex.ts), widok świata dla mapy i akcji (world.ts)
src/store/             stan gry synchronizowany z Realtime
src/features/          auth, lobby, palette, creation, pantheon (zegar domen, atrybuty, karta postaci, AttrPicker),
                       game (SummaryPanel, gods-bar, actions, map, altar, chaos, chronicle)
src/components/ui/     StoneButton, MarblePanel, FrescoFrame, kości, EmojiPicker
src/styles/            tokeny materiałów i tekstury CSS
src/img/               źródłowe obrazy: akcje (PNG 512px), domeny/ i atrybuty/ (PNG 1024px)
public/actions/        kopie JPG 512px i miniatury 160px
public/domains/        12 domen i base.jpg (bez domeny), JPG 768px i miniatury 192px
public/attributes/     6 atrybutów, JPG 384px i miniatury 96px
```
