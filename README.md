# Nasz Panteon — wirtualny stół

Wieloosobowy, przeglądarkowy stół do gry *Our Pantheon* (hack *Dawn of Worlds*, D. W. O'Boyle, CC BY-SA 4.0).
Śledzi Logos, dynamiczną inicjatywę, Paletę, byty świata (istoty, cywilizacje, frakcje, ortodoksje, awatary),
Ery i Kartę Chaosu. Interfejs po polsku, w stylu kamiennej świątyni.

## Stos

- React 18 + TypeScript + Vite, CSS Modules, Framer Motion (flip Karty Chaosu), Zustand
- Supabase: Auth (magic link), Postgres (stan gry), Realtime (synchronizacja bez odświeżania)
- Cała logika gry (koszty, tura, rzuty) żyje w funkcjach Postgres (`supabase/migrations/0003_functions.sql`);
  klient nigdy nie zapisuje stanu bezpośrednio, poza Paletą.

## Uruchomienie

1. Załóż projekt na [supabase.com](https://supabase.com). W **Authentication → Providers → Email** zostaw
   włączone „Enable email provider” (magic link działa domyślnie). W **Authentication → URL Configuration**
   dodaj `http://localhost:5173` do *Redirect URLs* (oraz adres produkcyjny, gdy będzie).
2. W **SQL Editor** uruchom po kolei pliki z `supabase/migrations/`:
   `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_realtime.sql`, `0005_world_creation.sql`,
   `0006_chronicle_book.sql`, `0007_god_gender.sql`. (Alternatywnie: `npx supabase link` i `npx supabase db push`.)
   Jeśli baza działała już wcześniej, wystarczy dograć brakujące pliki od końca listy.
3. Skopiuj `.env.example` do `.env.local` i wpisz `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
4. `npm install`, potem `npm run dev`. Otwórz `http://localhost:5173`.

Do testu wieloosobowego wystarczą dwie przeglądarki (lub okno prywatne) i dwa adresy e-mail.

### Wdrożenie na Railway

1. Nowy projekt z tego repozytorium na GitHubie. Railway (Nixpacks) sam wykryje Node, uruchomi `npm ci`,
   `npm run build` i `npm start` (`serve -s dist`, z przekierowaniem tras SPA na `index.html`).
2. W **Variables** usługi dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. Vite wkleja je w trakcie
   builda, więc po zmianie zmiennych trzeba zrobić redeploy.
3. W Supabase, **Authentication → URL Configuration**, dodaj adres z Railway do *Redirect URLs* (magic link).

- `npm run test:db` — uruchamia migracje i rozgrywa dwuosobową partię w PGlite (Postgres w WASM), bez Supabase.
- `npm run dev` i `http://localhost:5173/preview?screen=game` — podgląd ekranów na sztucznych danych
  (`screen=login|lobby|room|palette|creation|game|rolling|chaos`, `&turn=me`, `&draw=1|chosen`). Tylko w trybie dev.

## Przebieg

`/` – zaloguj się łączem z e-maila, podaj imię gracza, stwórz świat albo wpisz kod →
`/room/KOD` – przedsionek (imię i opis bóstwa, fresk, kod do zaproszenia) → Paleta (Tak / Zasłony / Nie) →
Stwarzanie Świata (głosowanie nad pytaniami o kształt świata; wynik trafia do Kroniki jako Prolog) →
gra: Rzut Logos → Faza Bóstw (turę ma bóstwo z największym Logos) → Faza Chaosu (Karta, wybór kości,
pytania przydzielone bóstwom) → następna runda.

## Zasady wdrożone w bazie

- Start bez Logos: pierwsza runda zaczyna się od rzutu wszystkich bóstw. Co rundę 2k6 + premia za skromność
  (≤5 Logos na koniec rundy, do +3) + religie (do +3). Rzut Logos jest w panelu po lewej, z animacją kości.
- Darmowa akcja awatara (raz na rundę) z bezpiecznikami z podręcznika: istotę tworzy tylko raz na Erę,
  Wielki Cud niszczy awatara, Wskrzeszenie przez awatara to jego poświęcenie, rzut z −2 (`log_dice_roll`
  z modyfikatorem), a każdy nowy awatar musi mieć od 1 do 3 uwarunkowań.
- Kronika czyta się jak Księga Rodzaju: Prolog bez pytań („Świat jest płaskim dyskiem…”), rozdział na rundę,
  numerowane wersety w czasie przeszłym budowane w kliencie z wierszy `actions_log` (`src/data/chronicle.ts`):
  „I stworzyła Matka Soli istoty, i nazwała je Dzikie Stwory. I widziała Matka Soli, że były rozumne i łagodne.”
  Bez kosztów, bez liczb z kości (tylko „I sprzyjał temu los”), bez Rzutów Logos. Los i Chaos relacjonowane
  bezosobowo („I opuściła frakcja swój region.”). Każdy typ wersetu ma kilka wariantów wybieranych z id wpisu.
  Rodzaj gramatyczny bóstwa (bóg / bogini / bóstwo, `players.god_gender`) ustawia się w przedsionku i w ✎.
- Ekran gry: u góry tylko bóstwa; cały lewy panel to akcje; dolny pasek trzyma Erę i głos „Następna Era”,
  Odpoczynek, Przekaż Logos, Rzuć 2k6, Rzuć 2k6 na Logos, animację kości, Kronikę i wyjście.
- Tura zawsze u bóstwa z największym Logos wśród nieśpiących; remis: aktualny gracz zachowuje turę, potem
  najniższe miejsce przy stole. Spadek poniżej innego gracza przekazuje turę natychmiast (Realtime).
- Runda kończy się, gdy wszyscy odpoczywają lub mają 0 Logos → Faza Chaosu.
- Kości rzuca serwer (`log_dice_roll`, `roll_logos`, `reveal_chaos`), więc wszyscy widzą to samo.
- Era: głosowanie w dowolnej rundzie; decyduje większość bóstw.
- Akcje w panelu: Terraformacja, Tworzenie Życia, Śmiertelnicy, Działania Awatara; w kategorii od najtańszej.
  Stworzenie Istoty Rozumnej (15 / 4 / 18) nadaje cechę „Rozumne”. Akcje z warunkiem (np. „musi istnieć
  cywilizacja”) są nieaktywne, póki świat go nie spełnia.
- Bez Logos, przez `edit_entity`: istota ↔ istota rozumna, frakcja ↔ religia, śmierć awatara; `delete_entity`
  usuwa byt po potwierdzeniu. Każda taka zmiana ma wpis w Kronice.

## Struktura

```
supabase/migrations/   schemat, RLS, funkcje RPC, publikacja Realtime
src/data/              koszty akcji, listy cech, tabele Chaosu, freski
src/store/             stan gry synchronizowany z Realtime
src/features/          auth, lobby, palette, game (gods-bar, actions, altar, chaos, chronicle)
src/components/ui/     StoneButton, MarblePanel, FrescoFrame, kości, TraitPicker
src/styles/            tokeny materiałów i tekstury CSS
public/frescoes/       12 zastępczych fresków SVG (podmień na własne, klucze w src/data/frescoes.ts)
```
