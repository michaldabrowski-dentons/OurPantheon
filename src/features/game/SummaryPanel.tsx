import { useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { rollOf } from '@/data/dice'
import { describeEvent } from '@/data/tableEvents'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, selectPendingContest, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Dice2d6, Die } from '@/components/ui/Primitives'
import { PalettePage } from '@/features/palette/PalettePage'
import { AltarGrid } from './altar/AltarGrid'
import { useWorld } from './map/useWorld'
import { MapInstructionCard, ContestBanner, VerseLockCard } from './map/MapCards'
import styles from './game.module.css'

/** the Logos the faithful will pay at the end of Chaos, by the god's place among the pantheon */
export function followersPrize(rank: number): number {
  return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0
}

/**
 * The left slab of the temple, read from the top: the game speaking to me (the turn, the last
 * thing that happened), the dice everyone sees and the two roll buttons, my Words and premiums,
 * the world (the book, the Palette, the lists), and at the very bottom the rest.
 */
export function SummaryPanel({ onError, chronicleOpen, onChronicle }: { onError: (m: string | null) => void; chronicleOpen: boolean; onChronicle: () => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const me = useGameStore(selectMyPlayer(user.id))
  const pending = useGameStore(selectPendingContest)
  const world = useWorld()
  const [busy, setBusy] = useState(false)
  const [palette, setPalette] = useState(false)
  const [lists, setLists] = useState(false)

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true)
    onError(null)
    try {
      await rpc(fn, args)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rolling = game.phase === 'rolling'
  const versePending = !!game.verse_pending_by
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting && !pending && !versePending
  const myDots = me ? world.totalDots(me.id) : 0
  // my place among the gods by followers, and what it will pay at the end of Chaos
  const totals = players.map((p) => world.totalDots(p.id)).filter((n) => n > 0)
  const myRank = myDots > 0 ? 1 + new Set(totals.filter((n) => n > myDots)).size : 0
  const prize = followersPrize(myRank)
  const myAvatars = me ? world.avatarsOf(me.id) : []

  const ctx = useMemo(
    () => ({
      god: (id: string | null) => {
        const p = players.find((x) => x.id === id)
        return { name: playerLabel(p, profiles), gender: p?.god_gender ?? ('n' as const) }
      },
      entity: (id: string | null) => (id ? entities.find((e) => e.id === id) : undefined),
    }),
    [players, profiles, entities],
  )

  // the dice everyone sees: the last roll anybody made this round, whoever made it and for whatever word
  const shown = useMemo(() => [...log].reverse().find((l) => l.round_number === game.round_number && rollOf(l) !== null) ?? null, [log, game.round_number])
  const shownRoll = shown ? rollOf(shown) : null

  // the last thing anyone did at the table: who clicked what, what the dice said
  const lastRow = [...log].reverse().find((l) => l.action_key !== 'prologue')
  const lastEvent = lastRow ? describeEvent(lastRow, ctx) : null

  const status = rolling
    ? me?.has_rolled
      ? 'Czekamy na pozostałe bóstwa…'
      : 'Nowa runda. Śnij nowe Słowa.'
    : game.phase === 'chaos'
      ? 'Faza Chaosu'
      : pending
        ? 'Trwa starcie'
        : versePending
          ? game.verse_pending_by === me?.id
            ? 'Święta Księga czeka na twój werset.'
            : 'Księga czeka na werset.'
          : myTurn
          ? 'Twoja tura. Świat czeka.'
          : me?.is_resting
            ? 'Odpoczywasz do końca rundy.'
            : 'Inne bóstwo przemawia.'

  return (
    <aside className={['basalt', styles.summary].join(' ')} aria-label="Podsumowanie">
      {/* the game speaking to me */}
      <section className={styles.sumBlock} aria-live="polite">
        <span className={styles.bbStatus}>{status}</span>
        {lastEvent && (
          <span key={lastRow!.id} className={['emerge-from-dark', styles.bbEvent].join(' ')} title={lastEvent}>
            {lastEvent}
          </span>
        )}
      </section>

      {/* what the map or a contest asks of me right now */}
      <MapInstructionCard world={world} />
      <ContestBanner onError={onError} />
      <VerseLockCard />

      {/* the dice everyone sees, and the two throws */}
      <section className={styles.sumBlock}>
        <div className={[styles.bbDice, shown ? '' : styles.bbDiceIdle].join(' ')} aria-live="polite">
          {shown && shownRoll ? (
            <div className={styles.bbDiceInner} key={shown.id}>
              {shownRoll.kind === 'd6' ? <Die value={shownRoll.d1} /> : <Dice2d6 d1={shownRoll.d1} d2={shownRoll.d2} showTotal={false} animateKey={shown.id} />}
              <span className={styles.bbTotal}>
                <b className="engraved">{shownRoll.total}</b>
                <small>{shownRoll.label}</small>
              </span>
            </div>
          ) : (
            <span className={styles.bbDicePlaceholder}>? ?</span>
          )}
        </div>
        {shown && shownRoll && <small className={styles.sumDiceWho}>{ctx.god(shown.player_id).name}: {shownRoll.label}</small>}
        <div className={styles.sumRow}>
          <StoneButton
            variant="marble"
            size="sm"
            disabled={busy}
            onClick={() => call('log_dice_roll', { p_game_id: game.id, p_context: 'Rzut 2k6' })}
            title="Rzuć 2k6 na oczach wszystkich. Taki rzut nie trafia do Świętej Księgi."
          >
            <DieIcon /> 2k6
          </StoneButton>
          <StoneButton
            variant="marble"
            size="sm"
            aura={rolling && !!me && !me.has_rolled}
            disabled={busy || !rolling || !me || me.has_rolled}
            onClick={() => call('roll_logos', { p_game_id: game.id })}
            title={rolling ? 'Rzuć 2k6 na Logos: nowe Słowa na tę rundę.' : 'Na Logos rzuca się na początku rundy.'}
          >
            <DieIcon /> Logos
          </StoneButton>
        </div>
      </section>

      {/* my Words and premiums */}
      <section className={styles.sumBlock}>
        <div className={styles.bbMe} aria-label="Twoje Słowa i premie">
          <div className={styles.bbLogos}>
            <b className="engraved-dark marble-text">{me?.logos ?? 0}</b>
            <small>Logos</small>
          </div>
          <div className={styles.bbChips}>
            <span className={[styles.chip, myDots > 0 ? styles.chipOn : ''].join(' ')} title="Twoi wyznawcy na mapie: liczba grup wiernych we wszystkich miastach.">
              <TempleIcon /> wyznawcy {myDots}
            </span>
            <span className={[styles.chip, prize > 0 ? styles.chipOn : ''].join(' ')} title="Pod koniec Chaosu trzy najwierniej czczone bóstwa dostają +3, +2 i +1 Logos.">
              premia z wyznawców {prize > 0 ? `+${prize}` : '0'}
            </span>
            <span className={[styles.chip, me && me.low_logos_streak > 0 ? styles.chipOn : ''].join(' ')} title="Premia za skromność do Rzutu Logos: kolejne rundy zakończone z 5 lub mniej Słowami.">
              skromność +{me?.low_logos_streak ?? 0}
            </span>
            {myAvatars.length === 0 ? (
              <span className={[styles.chip, styles.chipOff].join(' ')} title="Nie masz żywego awatara.">
                <AvatarIcon /> brak awatara
              </span>
            ) : (
              myAvatars.map((a) => (
                <span key={a.entity.id} className={[styles.chip, styles.chipGold].join(' ')} title={`${a.entity.name}: życie ${a.entity.hp ?? 0} z ${a.entity.max_hp ?? 3}. Słowa awatara wypowiada tam, gdzie stoi: najwyżej dwa heksy od siebie.`}>
                  <AvatarIcon /> {a.entity.emoji ?? ''} {a.entity.name} {a.entity.hp ?? 0} z {a.entity.max_hp ?? 3}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* the world: the book, the Palette, the lists */}
      <section className={styles.sumBlock}>
        <h4 className={styles.sumTitle}>Świat</h4>
        <div className={styles.sumRow}>
          <StoneButton variant="clay" size="sm" pressed={chronicleOpen} onClick={onChronicle}>
            <BookIcon /> Święta Księga
          </StoneButton>
          <StoneButton size="sm" onClick={() => setPalette(true)} title="Paleta: co w tym świecie jest na Tak, za Zasłoną i na Nie.">
            <PaletteIcon /> Paleta
          </StoneButton>
          <StoneButton size="sm" onClick={() => setLists(true)} title="Istoty rozumne, istoty, cywilizacje i awatary jako listy.">
            <ListIcon /> Byty świata
          </StoneButton>
        </div>
      </section>

      {/* at the very bottom: the rest */}
      <div className={styles.sumBottom}>
        <StoneButton
          variant="marble"
          block
          disabled={busy || game.phase !== 'gods' || !me || me.is_resting || !!pending}
          onClick={() => call('rest', { p_game_id: game.id })}
          title="Pas: zachowujesz Logos, ale do końca rundy nie działasz."
        >
          <Hourglass /> Odpoczynek
        </StoneButton>
      </div>

      {palette && (
        <Modal title="Paleta świata" onClose={() => setPalette(false)} wide material="basalt">
          <PalettePage embedded />
        </Modal>
      )}
      {lists && (
        <Modal title="Byty świata" onClose={() => setLists(false)} wide>
          <div className={styles.altarLists}>
            <AltarGrid onError={onError} />
          </div>
        </Modal>
      )}
    </aside>
  )
}

function Hourglass() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12M6 21h12M7 3c0 5 5 6.5 5 9s-5 4-5 9M17 3c0 5-5 6.5-5 9s5 4 5 9" />
      <path d="M9.5 19.5h5" />
    </svg>
  )
}

function DieIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TempleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 8 12 3l10 5H2zM5 8v9M12 8v9M19 8v9M2 20h20" />
    </svg>
  )
}

function AvatarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 22c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v16H5.5A2.5 2.5 0 0 0 3 21z" />
      <path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H12v16h6.5a2.5 2.5 0 0 1 2.5 2z" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="9.5" y="4" width="5" height="16" rx="1" />
      <rect x="16" y="4" width="5" height="16" rx="1" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
