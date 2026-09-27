import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import { ACTIONS, ERA_NUMERALS, type ActionDef, type Era } from '@/data/actions'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, inputClass, labelClass, fieldClass, Notice, Dice2d6 } from '@/components/ui/Primitives'
import { ActionDialog } from './ActionDialog'
import styles from '../game.module.css'

export function ActionsPanel({ onError }: { onError: (msg: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const log = useGameStore((s) => s.log)
  const me = useGameStore(selectMyPlayer(user.id))
  const [open, setOpen] = useState<ActionDef | null>(null)
  const [transfer, setTransfer] = useState(false)
  const [busy, setBusy] = useState(false)

  const era = game.era as Era
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting
  const lastDice = [...log].reverse().find((l) => l.action_key === 'dice' && l.player_id === me?.id)

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

  return (
    <aside className={['basalt', styles.actions].join(' ')}>
      <div className={styles.actionsHead}>
        <h2 className="engraved-dark gold-text" style={{ fontSize: '1.1rem' }}>Akcje</h2>
        <p>{myTurn ? 'Wybierz i opisz, co czynisz.' : 'Koszt w tej Erze: duży. Pozostałe Ery: mniejsze.'}</p>
      </div>

      {ACTIONS.map((a) => {
        const cost = a.costs[era - 1]
        const affordable = !!me && me.logos >= cost
        return (
          <button
            key={a.key}
            className={[styles.stone, !affordable ? styles.unaffordable : ''].join(' ')}
            disabled={!myTurn || !affordable}
            onClick={() => setOpen(a)}
            title={a.summary}
          >
            <span className={styles.stoneName}>{a.name}</span>
            <span className={styles.costs}>
              {([1, 2, 3] as Era[]).map((e) => (
                <span key={e} className={[styles.cost, e === era ? styles.now : ''].join(' ')}>
                  {a.costs[e - 1]}
                  <sup>{ERA_NUMERALS[e]}</sup>
                </span>
              ))}
            </span>
            <span className={styles.stoneRoll}>{a.requiresRoll ? '⚄ wymaga rzutu' : ' '}</span>
          </button>
        )
      })}

      <div className={styles.actionsFoot}>
        <StoneButton
          variant="lapis"
          block
          disabled={busy || game.phase !== 'gods' || !me || me.is_resting}
          onClick={() => call('rest', { p_game_id: game.id })}
        >
          ☾ Odpoczynek
        </StoneButton>
        <StoneButton size="sm" block disabled={busy || game.phase === 'rolling'} onClick={() => setTransfer(true)}>
          Przekaż Logos
        </StoneButton>
        <StoneButton
          size="sm"
          block
          disabled={busy}
          onClick={() => call('log_dice_roll', { p_game_id: game.id, p_context: 'Rzut 2k6' })}
        >
          Rzuć 2k6
        </StoneButton>
        {lastDice?.roll && (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: 6 }}>
            <Dice2d6 d1={lastDice.roll.d1} d2={lastDice.roll.d2} animateKey={lastDice.id} />
            <small style={{ color: 'var(--marble-vein)' }}>{lastDice.summary}</small>
          </div>
        )}
      </div>

      {open && me && <ActionDialog action={open} me={me} onClose={() => setOpen(null)} />}

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
    </aside>
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
