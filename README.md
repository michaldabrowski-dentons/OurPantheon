# O BOGOWIE!: wirtualny stół

Wieloosobowy, przeglądarkowy stół do gry *Our Pantheon* (hack *Dawn of Worlds*, D. W. O'Boyle, CC BY-SA 4.0).
Śledzi Logos, dynamiczną inicjatywę, Paletę, byty świata (istoty, cywilizacje, frakcje, ortodoksje, awatary),
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
   `0010_ensure_turn.sql`.
   (Alternatywnie: `npx supabase link` i `npx supabase db push`.)
   Jeśli baza działała już wcześniej, wystarczy dograć brakujące pliki od końca listy.
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
  `&step=N&host=0` dla Stwarzania Świata, `&overture=1|2|3` odtwarza otwarcie Ery, `&overture=0` je pomija).
  Tylko w trybie dev.

## Przebieg

`/` – zaloguj się loginem i hasłem, stwórz świat albo wpisz kod →
`/room/KOD` – przedsionek (imię i opis bóstwa, rodzaj gramatyczny, fresk przełączany strzałkami, kod do
zaproszenia) → Paleta (Tak / Zasłony / Nie; swoje wpisy przeciąga się między kolumnami, a w grze Paleta wraca
pod przyciskiem nad ołtarzem) → Stwarzanie Świata (gospodarz przewraca pytania, wszyscy widzą to samo i głosują;
przy remisie rozstrzyga głos gospodarza; wynik trafia do Świętej Księgi jako Prolog) → otwarcie Ery (kurtyna z
rysunkiem epoki, `EraOverture`) → gra: Rzut Logos → Faza Bóstw (turę ma bóstwo z największym Logos) →
Faza Chaosu (Karta z ogniem, wybór jednego z dwóch zdarzeń, pytania przydzielone bóstwom) → następna runda.

## Zasady wdrożone w bazie

- Start bez Logos: pierwsza runda zaczyna się od rzutu wszystkich bóstw. Co rundę 2k6 + premia za skromność
  (≤5 Logos na koniec rundy, do +3) + religie (do +3). Rzut Logos jest w dolnym pasku, z animacją kości.
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
- Stwarzanie Świata: bieżące pytanie trzyma `games.settings.creation_step` (`set_creation_step`, tylko gospodarz).
- Ekran gry: u góry tylko bóstwa; cały lewy panel to akcje z obrazami (`public/actions`, źródła w `src/img`);
  dolny pasek trzyma Odpoczynek, Przekaż Logos, Rzuć 2k6, Rzuć 2k6 na Logos, animację kości i wyjście.
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
- Akcje w panelu: Terraformacja, Tworzenie Życia, Śmiertelnicy, Działania Awatara; w kategorii od najtańszej.
  Stworzenie Istoty Rozumnej (15 / 4 / 18) nadaje cechę „Rozumne”. Akcje z warunkiem (np. „musi istnieć
  cywilizacja”) są nieaktywne, póki świat go nie spełnia.
- Bez Logos, przez `edit_entity`: istota ↔ istota rozumna, frakcja ↔ religia, śmierć awatara; `delete_entity`
  usuwa byt po potwierdzeniu. Każda taka zmiana ma wpis w Świętej Księdze.

## Struktura

```
supabase/migrations/   schemat, RLS, funkcje RPC, publikacja Realtime
src/data/              koszty akcji, listy cech, tabele Chaosu, freski, rysunki Er (eraArt.tsx)
src/store/             stan gry synchronizowany z Realtime
src/features/          auth, lobby, palette, creation, game (gods-bar, actions, altar, chaos, chronicle)
src/components/ui/     StoneButton, MarblePanel, FrescoFrame, kości, TraitPicker
src/styles/            tokeny materiałów i tekstury CSS
src/img/               źródłowe obrazy akcji (PNG 512px); public/actions to ich kopie JPG 512px i miniatury 160px
public/frescoes/       12 zastępczych fresków SVG (podmień na własne, klucze w src/data/frescoes.ts)
```
