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
   `0010_ensure_turn.sql`, `0011_playbooks.sql`, `0012_hex_map.sql`, `0013_ocean_start.sql`, `0014_biome_tiles.sql`, `0015_fix_biome_draw.sql`.
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
  `&contest=defender|attacker|resolved` pokazuje starcie w danym stanie). Podgląd odpowiada na wołania
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
  Siedem biomów z malowanymi kaflami (`src/data/biomes.ts`, pliki `public/biomes/*.png` skopiowane
  z `src/img/biomy`, 128 px): woda, góry, puszcza, dżungla, trawa, pustynia, zima. Kafle lądu to miękkie
  kwadraty, które na siebie nachodzą; woda jest ostrym heksem rysowanym nad lądem, a na krawędzi z lądem
  biegnie brązowa linia brzegu. Bez emotikon na polach i bez szwów. Znaki istot i piramidy kropek leżą na
  ciemnych płytkach z cieniem. Mapa przewija się, gdy nie mieści się w oknie; przybliżenie przyciskami
  w rogu albo Ctrl i kółkiem myszy.
- Woda i Góry są zablokowane: nie powstanie tam miasto, nie dojdzie Exodus, nie stanie awatar ani istota
  (także przez Migrację).
- Każde pole ma trzy miejsca w rogach (`hex_occupants`): istoty, istoty rozumne i awatary stoją tam jako
  emotikony (`entities.emoji`, unikalne w grze; pule w `src/data/emoji.ts`). Awatar ma 3 punkty życia
  (`entities.hp`).
- Miasto (`cities`, jedno na pole) leży na środku jako piramida kropek; każda kropka to wyznawca jednego
  bóstwa (`city_followers`), w kolorze jego domeny (`DOMAIN_COLORS` w `src/data/pantheon.ts`). Poziom miasta
  to liczba kropek (1 Koczowisko … 10 Wielkie imperium, `src/data/cities.ts`); dziesięć to sufit. Miasto bez
  kropek obraca się w ruinę (`destroy_city_if_empty`). Rządzi nim bóstwo z największą liczbą kropek.
- Mysz słyszą tylko wielokąty pól; emotikony i kropki mają `pointer-events: none`. Klik poza akcją otwiera
  kartę pola przy myszce, jedną płaską płytę: tytułem jest nazwa miasta (albo biom), pod nim poziom, dostępność,
  wyznawcy z portretem rządzącego, dary, opis, istoty rozumne, istoty, awatary. W trakcie akcji dozwolone pola
  mają złoty obrys i jaśnieją; na lewym panelu stoi karta z pytaniem, kosztem oraz przyciskami „Zakończ akcję”
  i „Przerwij” (`src/features/game/map/`). Przy słowach płatnych dystansem świecą tylko pola, na które
  starcza Logos.
- Ekran gry to trzy kolumny: lewy panel podsumowań (`SummaryPanel`: pytanie mapy i starcie, status tury
  i Logos z premiami, Odpoczynek i Przekaż Logos, kości widoczne dla wszystkich z ostatnim rzutem kogokolwiek,
  Święta Księga, Paleta, Byty świata, legenda bóstw z liczbą wyznawców, wyjście), kolumna akcji i mapa na
  reszcie ekranu. Dawne listy bytów otwiera „Byty świata”.
- Cechy, specjalności, braki i uwarunkowania zniknęły: istota, cywilizacja i awatar mają tylko nazwę, znak
  i opis (opis nowego bytu to werset z księgi). Stworzenie Cywilizacji nie wymaga rzutu.

## Słowa na mapie

- Kształtowanie Lądów: biom, potem do trzech sąsiadujących pól (trzeci klik kończy sam). Pola z miastem lub
  awatarem nie staną się Wodą ani Górami.
- Kataklizm: rodzaj i pole; obrażenia k6 + Gniew (najmniej 1), każde losowo w kropkę miasta, istotę nierozumną
  albo awatara (−1 życia); istoty rozumne giną dopiero bez miasta. Na polu wybucha animacja.
- Stworzenie Istoty / Istoty Rozumnej / Zesłanie Awatara: nazwa i emotikona, potem ląd z wolnym miejscem.
- Zmiana Istoty: klik w jedną istotę na jednym polu; tam powstaje odmiana (nowy byt, `variant_of`).
- Migracja: istota, potem pole docelowe; gatunek mnoży się na nowe pole; koszt to dystans w Logos.
- Stworzenie Cywilizacji: pole z istotą rozumną i nazwa; miasto rodzi się z jedną kropką twórcy.
- Rozwój Cywilizacji: miasto, dar z listy (`GIFTS` w `src/data/cities.ts`, albo własny) i Łaska albo Mądrość
  wybierane tymi samymi dłońmi co na karcie postaci (`AttrPicker`); księga rzuca 2k6 + atrybut: 10+ to dwie
  kropki, 7..9 jedna, 6- nic (dar odnotowany jako odrzucony w `city_gifts`). Kości widać w kroku wersetu
  i na lewym panelu u wszystkich.
- Exodus: miasto z moimi kropkami, liczba kropek i istota rozumna, pole docelowe; 1 Logos za heks; na pustym
  polu powstaje nowe miasto (dziedziczy cechy i dary), w zajętym wyznawcy dołączają.
- Nawracanie i Święta Wojna to starcia (`contests`): atakujący deklaruje i płaci (`declare_contest`), księga
  rzuca za niego; tura zamiera, aż obrońca u siebie wybierze atrybut i rzuci (`answer_contest`), potem atakujący
  dopisuje werset (`commit_contest`) albo odwołuje starcie przed odpowiedzią (`cancel_contest`). Nawracanie:
  2k6 + Majestat albo Podszept po obu stronach, wygrana o 3+ przejmuje dwóch wyznawców, o 1..2 jednego. Wojna:
  armia to moje kropki z miasta, w którym rządzę (jedna zostaje), koszt to dystans; atakujący 2k6 + Gniew +
  armia, obrońca 2k6 + atrybut + swoje kropki w celu; skala zwycięstwa jak w briefie (pełne, pyrrusowe, remis
  bez oblężenia, odparcie, masakra).
- Rozkaz dla Awatara może przesunąć awatara do trzech pól (1 Logos za heks); Wskrzeszenie stawia go na
  wybranym polu z pełnym życiem.
- Koniec Chaosu (`end_chaos_phase`): każde miasto zyskuje kropkę dla bóstwa, które nim rządzi (remis losowo),
  a suma kropek daje +3, +2 i +1 Logos trzem najwierniej czczonym bóstwom.
- Każde słowo kończy się krokiem wersetu: księga układa werset z wyniku (`actions_log.outcome`,
  `composeVerse`), gracz może go przepisać (`edit_log_summary`). Wersety nie znają słów „heks” ani „pole”
  ani cyfr: mówią o ziemiach i krainach, liczby piszą słowami. Frakcje i religie zniknęły z gry.
- Faza Chaosu: kartę odwraca, losuje ponownie i zamyka rundę bez wyboru tylko gospodarz; po wyborze
  zdarzenia rundę może zamknąć każdy.

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
- Akcje w panelu: Terraformacja (Kształtowanie Lądów, Kataklizm, Wielki Cud), Tworzenie Życia (Stworzenie
  Istoty, Stworzenie Istoty Rozumnej, Zmiana Istoty, Migracja), Śmiertelnicy (Stworzenie Cywilizacji, Rozwój
  Cywilizacji, Exodus, Nawracanie, Święta Wojna), Działania Awatara (Zesłanie, Rozkaz, Wskrzeszenie); w kategorii
  od najtańszej. Akcje z warunkiem (np. „musi istnieć miasto”) są nieaktywne, póki mapa go nie spełnia.
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
