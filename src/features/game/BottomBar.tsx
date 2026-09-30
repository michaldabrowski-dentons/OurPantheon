import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { logosWords } from '@/data/chronicle'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, inputClass, labelClass, fieldClass, Notice, Dice2d6 } from '@/components/ui/Primitives'
import styles from './game.module.css'

/**
 * Under the altar, read left to right: the door out; the turn's status; then on the right, together,
 * what I hold (my Words, my bonuses to the roll, my avatar's free action), the dice with the two round
 * dice buttons, and the words that need no altar (transfer, rest).
 */
export function BottomBar({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const log = useGameStore((s) => s.log)
  const me = useGameStore(selectMyPlayer(user.id))
  const [busy, setBusy] = useState(false)
  const [transfer, setTransfer] = useState(false)

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
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting

  // what I hold
  const myReligions = me ? entityGods.filter((g) => g.player_id === me.id && entities.some((e) => e.id === g.entity_id && e.kind === 'orthodoxy' && e.status === 'active')).length : 0
  const religionBonus = Math.min(3, myReligions)
  const hasAvatar = !!me && entityGods.some((g) => g.player_id === me.id && entities.some((e) => e.id === g.entity_id && e.kind === 'avatar' && e.status === 'active'))
  const avatarState: 'free' | 'used' | 'none' = !hasAvatar ? 'none' : me?.avatar_action_used ? 'used' : 'free'

  // the dice slot shows my latest roll of this round: the Logos roll, or a 2k6
  const shown = [...log].reverse().find((l) => l.player_id === me?.id && l.round_number === game.round_number && (l.action_key === 'logos_roll' || l.action_key === 'dice'))

  const status = rolling
    ? me?.has_rolled
      ? 'Czekamy na pozostałe bóstwa…'
      : 'Nowa runda. Śnij nowe Słowa.'
    : game.phase === 'chaos'
      ? 'Faza Chaosu'
      : myTurn
        ? 'Twoja tura. Świat czeka.'
        : me?.is_resting
          ? 'Odpoczywasz do końca rundy.'
          : 'Inne bóstwo przemawia.'

  return (
    <footer className={['basalt', styles.bottomBar].join(' ')}>
      {/* the door */}
      <button className={styles.bbExit} onClick={() => navigate('/')} title="Wyjdź do listy światów. Gra trwa dalej." aria-label="Wyjdź do listy światów">
        <Exit />
      </button>

      {/* the turn */}
      <div className={styles.bbCenter}>
        <span className={styles.bbStatus}>{status}</span>
      </div>

      {/* what I hold, beside the dice */}
      <div className={styles.bbMe} aria-label="Twoje Słowa i premie">
        <div className={styles.bbLogos}>
          <b className="engraved-dark gold-text">{me?.logos ?? 0}</b>
          <small>Logos</small>
        </div>
        <div className={styles.bbChips}>
          <span className={[styles.chip, religionBonus > 0 ? styles.chipOn : ''].join(' ')} title="Premia z religii do Rzutu Logos, najwyżej +3.">
            <TempleIcon /> religie +{religionBonus}
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

      {/* the dice */}
      <div className={styles.bbDiceGroup}>
        <div className={[styles.bbDice, shown ? '' : styles.bbDiceIdle].join(' ')} aria-live="polite">
          {shown?.roll ? (
            <div className={styles.bbDiceInner} key={shown.id}>
              <Dice2d6 d1={shown.roll.d1} d2={shown.roll.d2} showTotal={false} animateKey={shown.id} />
              {shown.action_key === 'logos_roll' ? (
                <span className={styles.logosGain}>+{logosWords(shown.logos_delta)}</span>
              ) : (
                <span className={styles.bbTotal}>
                  <b className="engraved">{shown.roll.total ?? shown.roll.d1 + shown.roll.d2}</b>
                  <small>{shown.summary === 'Rzut 2k6' ? 'rzut' : shown.summary}</small>
                </span>
              )}
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
          title="Rzuć 2k6 na oczach wszystkich. Taki rzut nie trafia do Kroniki."
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

      {/* the words that need no altar */}
      <div className={styles.bbWords}>
        <StoneButton variant="marble" disabled={busy || rolling} onClick={() => setTransfer(true)}>
          Przekaż Logos
        </StoneButton>
        <StoneButton
          variant="marble"
          disabled={busy || game.phase !== 'gods' || !me || me.is_resting}
          onClick={() => call('rest', { p_game_id: game.id })}
          title="Pas: zachowujesz Logos, ale do końca rundy nie działasz."
        >
          <Hourglass /> Odpoczynek
        </StoneButton>
      </div>

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
    </footer>
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
