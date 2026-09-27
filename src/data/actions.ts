// Main actions of Our Pantheon (Alpha V2, PL). Costs are per Era: [I, II, III].
import type { EntityKind } from '@/lib/types'

export type ActionKey =
  | 'shape_land'
  | 'change_biome'
  | 'catastrophe'
  | 'create_creature'
  | 'change_creature'
  | 'create_civilization'
  | 'change_civilization'
  | 'create_faction'
  | 'change_faction'
  | 'create_orthodoxy'
  | 'command_followers'
  | 'create_avatar'
  | 'command_avatar'
  | 'resurrect_avatar'
  | 'great_miracle'

export type Era = 1 | 2 | 3

export interface TierText {
  strong: string // 10+
  mixed: string // 7–9
  weak: string // 6−
}

export interface ActionDef {
  key: ActionKey
  name: string
  costs: [number, number, number]
  requiresRoll: boolean
  /** which kind of entity the action creates or edits, if any */
  entityKind?: EntityKind
  entityOp?: 'create' | 'update'
  summary: string
  tiers?: TierText
}

export const ACTIONS: ActionDef[] = [
  {
    key: 'shape_land',
    name: 'Kształtowanie lądu',
    costs: [2, 5, 12],
    requiresRoll: false,
    summary:
      'Stwórz lub zmień ląd: góry, lasy, pustynie, rzeki, wyspy, latające wyspy. Obszar około jednej jednostki mapy. Określasz też klimat i to, co tam żyje.',
  },
  {
    key: 'change_biome',
    name: 'Zmiana biomu',
    costs: [1, 3, 6],
    requiresRoll: false,
    summary:
      'Zmień klimat istniejącego obszaru na inny: las w pustynię, morze w lód, równiny nawiedzane przez niezwykłe burze. Około jednej jednostki.',
  },
  {
    key: 'catastrophe',
    name: 'Katastrofa',
    costs: [10, 10, 10],
    requiresRoll: false,
    summary:
      'Okaż gniew. Ziemia drży, góry wybuchają, niebiosa runęły. Znacząca, lecz lokalna: może położyć kres miastu, cywilizacji lub wyspie.',
  },
  {
    key: 'create_creature',
    name: 'Stworzenie istoty',
    costs: [10, 3, 12],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'create',
    summary:
      'Pojedynczy byt lub cały gatunek. Wybierz do 3 cech. Gdzie się pojawiają, jak wyglądają, co jedzą, jak się rozmnażają, co im zagraża?',
  },
  {
    key: 'change_creature',
    name: 'Zmiana istoty',
    costs: [5, 1, 6],
    requiresRoll: false,
    entityKind: 'creature',
    entityOp: 'update',
    summary:
      'Dodaj, zmień lub usuń 1 cechę istoty. Albo stwórz odmianę: zachowaj co najmniej 2 cechy i dodaj 1 nową.',
  },
  {
    key: 'create_civilization',
    name: 'Stworzenie cywilizacji',
    costs: [22, 12, 6],
    requiresRoll: true,
    entityKind: 'civilization',
    entityOp: 'create',
    summary:
      'Lud zdolny do kultury. Wybierz spośród istot rozumnych lub o umyśle roju. Określ region i opisz, jacy są. Zacznij z Ortodoksją lub neutralną Frakcją.',
    tiers: {
      strong: 'Wybierz 3 Cechy, 2 Specjalności i 1 Brak. Następnie stwórz Ortodoksję lub Frakcję.',
      mixed:
        'Wybierz 2 Cechy, 2 Specjalności i 1 Brak. Wybierz, który z pozostałych graczy wybiera 1 Cechę, a który 1 Brak. Stwórz Frakcję.',
      weak: 'Wybierz 1 Cechę, 2 Specjalności, 1 Brak. Wybierz, który z pozostałych graczy wybiera 2 Cechy, a który 1 Brak. Stwórz Frakcję.',
    },
  },
  {
    key: 'change_civilization',
    name: 'Zmiana cywilizacji',
    costs: [12, 8, 4],
    requiresRoll: true,
    entityKind: 'civilization',
    entityOp: 'update',
    summary: 'Odłam od cywilizacji albo zmiana jej kultury. Rzuć 2k6 + wydane Słowa.',
    tiers: {
      strong: 'Zmień, dodaj lub usuń 1 cechę, 1 specjalność i/lub 1 brak, jak uznasz za stosowne.',
      mixed: 'Zmień, dodaj lub usuń cechę lub specjalność.',
      weak: 'Zmień cechę lub specjalność. Inny gracz może także zmienić jedną albo dodać brak.',
    },
  },
  {
    key: 'create_faction',
    name: 'Stworzenie frakcji',
    costs: [10, 6, 4],
    requiresRoll: true,
    entityKind: 'faction',
    entityOp: 'create',
    summary:
      'Neutralna grupa ludzi: od rodziny po organ rządzący. Nie daje bóstwu korzyści, nadaje wyrazistość ludom świata. Wybierz typ, potem rzuć.',
    tiers: {
      strong: 'Wybierz 2 Cechy i Pragnienie.',
      mixed: 'Wybierz 2 Cechy. Następnie inny gracz wybiera kolejne Pragnienie.',
      weak: 'Wybierz Cechę. Następnie pozostali gracze wybierają Cechę i Pragnienie.',
    },
  },
  {
    key: 'change_faction',
    name: 'Zmiana frakcji lub ortodoksji',
    costs: [4, 4, 2],
    requiresRoll: true,
    entityKind: 'faction',
    entityOp: 'update',
    summary:
      'Zmień frakcję lub ortodoksję. Możesz też zamienić frakcję w ortodoksję (wybierz 2 wymagania) albo ortodoksję w neutralną frakcję.',
    tiers: {
      strong: 'Zmień lub dodaj 1 Cechę i/lub 1 Pragnienie, jak uznasz za stosowne.',
      mixed: 'Zmień lub dodaj Cechę lub Pragnienie.',
      weak: 'Zmień Cechę lub Pragnienie. Jeśli zmieniłeś Pragnienie, w jaki sposób spełniono poprzednie?',
    },
  },
  {
    key: 'create_orthodoxy',
    name: 'Stworzenie ortodoksji',
    costs: [12, 8, 6],
    requiresRoll: true,
    entityKind: 'orthodoxy',
    entityOp: 'create',
    summary:
      'Grupa, która wie o tobie i cię czci. Każda ortodoksja daje +1 do Rzutu Logos (maks. +3). Stwórz jak frakcję, potem wybierz 2 wymagania.',
    tiers: {
      strong: 'Wybierz 2 Cechy i Pragnienie. Potem 2 wymagania.',
      mixed: 'Wybierz 2 Cechy. Inny gracz wybiera Pragnienie. Potem 2 wymagania.',
      weak: 'Wybierz Cechę. Pozostali gracze wybierają Cechę i Pragnienie. Potem 2 wymagania.',
    },
  },
  {
    key: 'command_followers',
    name: 'Rozkaz dla wyznawców',
    costs: [2, 2, 2],
    requiresRoll: true,
    summary:
      'Zażądaj daniny (zyskujesz Logos równe najwyższej kości + 1) albo poleć wielki czyn. Przy 10+ odzyskujesz wydane Słowa.',
    tiers: {
      strong: 'Sukces. Wybierz: Żądanie daniny (zyskujesz najwyższą kość + 1 Logos) lub Wielki czyn. Odzyskujesz wydane Słowa.',
      mixed: 'Sukces. Wybierz: Żądanie daniny (zyskujesz najwyższą kość + 1 Logos) lub Wielki czyn.',
      weak: 'Porażka. Opisz, co poszło nie tak. Wybierz: Odpoczynek do końca rundy albo utrata najwyższej kości − 1 Logos.',
    },
  },
  {
    key: 'create_avatar',
    name: 'Stworzenie awatara',
    costs: [10, 12, 15],
    requiresRoll: false,
    entityKind: 'avatar',
    entityOp: 'create',
    summary:
      'Most między boskością a śmiertelnikami. Wybierz 1–3 uwarunkowania. Co rundę masz 1 darmową akcję awatara.',
  },
  {
    key: 'command_avatar',
    name: 'Rozkaz dla awatara',
    costs: [2, 2, 2],
    requiresRoll: false,
    summary:
      'Awatar używa mocy bóstwa. Przy rzutach odejmij 2. Wielki cud niszczy awatara. Stworzenie istoty raz na Erę.',
  },
  {
    key: 'resurrect_avatar',
    name: 'Wskrzeszenie awatara',
    costs: [12, 15, 25],
    requiresRoll: false,
    entityKind: 'avatar',
    entityOp: 'update',
    summary: 'Awatar wraca, lecz zawsze nieco inny. Opisz, jak zmieniła go śmierć. Możesz wskrzesić awatara innego bóstwa.',
  },
  {
    key: 'great_miracle',
    name: 'Wielki cud',
    costs: [15, 30, 50],
    requiresRoll: false,
    summary: 'Coś WIELKIEGO na skalę całego świata. Nie ma ograniczeń. Użyj, gdy chcesz pójść na całość.',
  },
]

export const ACTION_BY_KEY: Record<ActionKey, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
) as Record<ActionKey, ActionDef>

export const ERA_NAMES: Record<Era, string> = { 1: 'Pierwsza Era', 2: 'Druga Era', 3: 'Trzecia Era' }
export const ERA_NUMERALS: Record<Era, string> = { 1: 'I', 2: 'II', 3: 'III' }
export const ERA_THEMES: Record<Era, string> = {
  1: 'Geografia. Tanie kształtowanie lądu, drogie ludy.',
  2: 'Zaludnianie. Tanie gatunki i cywilizacje.',
  3: 'Polityka i kultura. Tanie mieszanie się w sprawy śmiertelników.',
}

export function costFor(key: ActionKey, era: Era): number {
  return ACTION_BY_KEY[key].costs[era - 1]
}

/** Chronicle labels for non-action log rows */
export const LOG_LABELS: Record<string, string> = {
  logos_roll: 'Rzut Logos',
  rest: 'Odpoczynek',
  transfer: 'Przekazanie mocy',
  followers_gain: 'Danina',
  followers_loss: 'Kara',
  dice: 'Rzut kośćmi',
  chaos_reveal: 'Karta Chaosu',
  chaos_choice: 'Chaos',
  round_end: 'Koniec rundy',
  era_advance: 'Nowa Era',
  game_start: 'Początek',
  game_end: 'Epilog',
}
