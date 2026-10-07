import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { rollOf } from '@/data/dice'
import { describeEvent } from '@/data/tableEvents'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, selectPendingContest, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, inputClass, labelClass, fieldClass, Notice, Dice2d6, Die } from '@/components/ui/Primitives'
import { PalettePage } from '@/features/palette/PalettePage'
import { AltarGrid } from './altar/AltarGrid'
import { useWorld } from './map/useWorld'
import { MapInstructionCard, ContestBanner, GodLegend } from './map/MapCards'
import styles from './game.module.css'

/**
 * The left slab of the temple: everything that is not a word and not the map. At the top what the
 * map or a contest asks of me right now; then the world (the book, the Palette, the lists, the other
 * gods' followers); pinned to the bottom the dice everyone sees, the turn, my Words and the words
 * that need no map (rest, transfer), with the door out.
 */
export function SummaryPanel({ onError, chronicleOpen, onChronicle }: { onError: (m: string | null) => void; chronicleOpen: boolean; onChronicle: () => void }) {
  const { user } = useUser()
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const me = useGameStore(selectMyPlayer(user.id))
  const pending = useGameStore(selectPendingContest)
  const world = useWorld()
  const [busy, setBusy] = useState(false)
  const [transfer, setTransfer] = useState(false)
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
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting && !pending
  const myDots = me ? world.totalDots(me.id) : 0
  const hasAvatar = !!me && world.avatarsOf(me.id).length > 0
  const avatarState: 'free' | 'used' | 'none' = !hasAvatar ? 'none' : me?.avatar_action_used ? 'used' : 'free'

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
        : myTurn
          ? 'Twoja tura. Świat czeka.'
          : me?.is_resting
            ? 'Odpoczywasz do końca rundy.'
            : 'Inne bóstwo przemawia.'

  return (
    <aside className={['basalt', styles.summary].join(' ')} aria-label="Podsumowanie">
      {/* what the map or a contest asks of me right now */}
      <MapInstructionCard world={world} />
      <ContestBanner onError={onError} />

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
        <GodLegend world={world} />
      </section>

      {/* the dice everyone sees */}
      <section className={styles.sumBlock}>
        <h4 className={styles.sumTitle}>Kości</h4>
        <div className={styles.bbDiceGroup}>
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
          <StoneButton
            variant="marble"
            round
            disabled={busy}
            onClick={() => call('log_dice_roll', { p_game_id: game.id, p_context: 'Rzut 2k6' })}
            title="Rzuć 2k6 na oczach wszystkich. Taki rzut nie trafia do Świętej Księgi."
            aria-label="Rzuć 2k6"
          >
            <DieIcon />
            <small>2k6</small>
          </StoneButton>
          {rolling && me && !me.has_rolled && (
            <StoneButton
              variant="marble"
              round
              aura
              disabled={busy}
              onClick={() => call('roll_logos', { p_game_id: game.id })}
              title="Rzuć 2k6 na Logos: nowe Słowa na tę rundę."
              aria-label="Rzuć 2k6 na Logos"
              className={styles.bbLogosBtn}
            >
              <DieIcon />
              <small>Logos</small>
            </StoneButton>
          )}
        </div>
        {shown && shownRoll && <small className={styles.sumDiceWho}>{ctx.god(shown.player_id).name}: {shownRoll.label}</small>}
      </section>

      {/* the turn and my Words */}
      <section className={[styles.sumBlock, styles.sumBottom].join(' ')}>
        <span className={styles.bbStatus}>{status}</span>
        {lastEvent && (
          <span key={lastRow!.id} className={['emerge-from-dark', styles.bbEvent].join(' ')} aria-live="polite" title={lastEvent}>
            {lastEvent}
          </span>
        )}
        <div className={styles.bbMe} aria-label="Twoje Słowa i premie">
          <div className={styles.bbLogos}>
            <b className="engraved-dark marble-text">{me?.logos ?? 0}</b>
            <small>Logos</small>
          </div>
          <div className={styles.bbChips}>
            <span className={[styles.chip, myDots > 0 ? styles.chipOn : ''].join(' ')} title="Twoi wyznawcy na mapie. Najwierniej czczone bóstwa dostają Logos pod koniec Chaosu.">
              <TempleIcon /> wyznawcy {myDots}
            </span>
            {!!me && me.low_logos_streak > 0 && (
              <span className={[styles.chip, styles.chipOn].join(' ')} title="Premia za skromność: kolejne rundy zakończone z 5 lub mniej Słowami.">
                skromność +{me.low_logos_streak}
              </span>
            )}
            <span
              className={[styles.chip, avatarState === 'free' ? styles.chipGold : '', avatarState === 'none' ? styles.chipOff : ''].join(' ')}
              title={avatarState === 'none' ? 'Nie masz żywego awatara.' : avatarState === 'used' ? 'Darmowa akcja awatara zużyta w tej rundzie.' : 'Darmowa akcja awatara czeka: zaznacz ją w oknie akcji.'}
            >
              <AvatarIcon /> {avatarState === 'none' ? 'brak awatara' : avatarState === 'used' ? 'akcja awatara zużyta' : 'akcja awatara wolna'}
            </span>
          </div>
        </div>
        <div className={styles.sumRow}>
          <button className={styles.bbExit} onClick={() => navigate('/')} title="Wyjdź do listy światów. Gra trwa dalej." aria-label="Wyjdź do listy światów">
            <Exit />
          </button>
          <StoneButton
            variant="marble"
            size="sm"
            disabled={busy || game.phase !== 'gods' || !me || me.is_resting || !!pending}
            onClick={() => call('rest', { p_game_id: game.id })}
            title="Pas: zachowujesz Logos, ale do końca rundy nie działasz."
          >
            <Hourglass /> Odpoczynek
          </StoneButton>
          <StoneButton variant="marble" size="sm" disabled={busy || rolling || !!pending} onClick={() => setTransfer(true)}>
            Przekaż Logos
          </StoneButton>
        </div>
      </section>

      {transfer && me && (
        <TransferDialog
          onClose={() => setTransfer(false)}
          max={me.logos}
          targets={players.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))}
          onSubmit={async (to, amount) => {
            await call('transfer_logos', { p_game_id: game.id, p_to_player_id: to, p_amount: amount })
            setTransfer(false)
          }}
        />
      )}
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function Exit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
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

function TransferDialog({
  onClose,
  max,
  targets,
  onSubmit,
}: {
  onClose: () => void
  max: number
  targets: { id: string; label: string }[]
  onSubmit: (to: string, amount: number) => Promise<void>
}) {
  const [to, setTo] = useState(targets[0]?.id ?? '')
  const [amount, setAmount] = useState(1)
  return (
    <Modal title="Przekazanie mocy" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p>Możesz swobodnie oddać swój Logos innemu bóstwu. Ustawcie wokół tego krótką scenę, jeśli chcecie.</p>
        {targets.length === 0 && <Notice>Nie ma komu przekazać mocy.</Notice>}
        <label className={fieldClass}>
          <span className={labelClass}>Odbiorca</span>
          <select className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>Ile Logos (masz {max})</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={max}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          />
        </label>
        <StoneButton variant="gold" disabled={!to || amount < 1 || amount > max} onClick={() => onSubmit(to, amount)}>
          Przekaż {amount} Logos
        </StoneButton>
      </div>
    </Modal>
  )
}
