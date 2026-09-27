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
   `0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_realtime.sql`.
   (Alternatywnie: `npx supabase link` i `npx supabase db push`.)
3. Skopiuj `.env.example` do `.env.local` i wpisz `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
4. `npm install`, potem `npm run dev`. Otwórz `http://localhost:5173`.

Do testu wieloosobowego wystarczą dwie przeglądarki (lub okno prywatne) i dwa adresy e-mail.

- `npm run test:db` — uruchamia migracje i rozgrywa dwuosobową partię w PGlite (Postgres w WASM), bez Supabase.
- `npm run dev` i `http://localhost:5173/preview?screen=game` — podgląd ekranów na sztucznych danych
  (`screen=login|lobby|room|palette|game|rolling|chaos`, `&turn=me`, `&draw=1|chosen`). Tylko w trybie dev.

## Przebieg

`/` – zaloguj się łączem z e-maila, podaj imię gracza, stwórz świat albo wpisz kod →
`/room/KOD` – przedsionek (imię bóstwa, fresk, kod do zaproszenia) → Paleta (Tak / Zasłony / Nie) →
gra: Rzut Logos → Faza Bóstw (turę ma bóstwo z największym Logos) → Faza Chaosu (Karta) → następna runda.

## Zasady wdrożone w bazie

- Start 5 Logos; co rundę 2k6 + premia za skromność (≤5 Logos na koniec rundy, do +3) + ortodoksje (do +3).
- Tura zawsze u bóstwa z największym Logos wśród nieśpiących; remis: aktualny gracz zachowuje turę, potem
  najniższe miejsce przy stole. Spadek poniżej innego gracza przekazuje turę natychmiast (Realtime).
- Runda kończy się, gdy wszyscy odpoczywają lub mają 0 Logos → Faza Chaosu.
- Kości rzuca serwer (`log_dice_roll`, `roll_logos`, `reveal_chaos`), więc wszyscy widzą to samo.
- Era: głosowanie; od 5. rundy Ery, większość bóstw.

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
