import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { WorldView } from '@/lib/world'
import { followersWord } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice } from '@/components/ui/Primitives'
import { AltarGrid } from '../altar/AltarGrid'
import { useMapMode } from './mapMode'
import styles from './map.module.css'
import gameStyles from '../game.module.css'

/** Beside the map: the lists of things, the legend of gods, the question the map asks, the contest. */
export function MapSideRail({ world, onError }: { world: WorldView; onError: (m: string | null) => void }) {
  const [lists, setLists] = useState(false)
  return (
    <aside className={styles.rail} aria-label="Obok mapy">
      <MapInstructionCard world={world} />
      <ContestBanner onError={onError} />
      <StoneButton variant="marble" block onClick={() => setLists(true)}>
        Byty świata
      </StoneButton>
      <GodLegend world={world} />
      {lists && (
        <Modal title="Byty świata" onClose={() => setLists(false)} wide>
          <div className={gameStyles.altarLists}>
            <AltarGrid onError={onError} />
          </div>
        </Modal>
      )}
    </aside>
  )
}

function GodLegend({ world }: { world: WorldView }) {
  const players = useGameStore((s) => s.players)
  return (
    <div className={['marble', styles.railPanel].join(' ')}>
      <h4>Bóstwa i wyznawcy</h4>
      {players.map((p) => {
        const c = godColor(p.domain_key)
        const n = world.totalDots(p.id)
        return (
          <div key={p.id} className={styles.legendRow}>
            <span className={styles.swatch} style={{ background: c.fill, boxShadow: `0 0 0 1.5px ${c.stroke}` }} />
            <b title={godLabel(p)}>{godLabel(p)}</b>
            <span className={styles.legendDots} title={followersWord(n)}>{n}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The question the map is asking, with the running cost and the two buttons the brief wants. */
function MapInstructionCard({ world }: { world: WorldView }) {
  const mode = useMapMode((s) => s.mode)
  const selection = useMapMode((s) => s.selection)
  const finish = useMapMode((s) => s.finish)
  const cancel = useMapMode((s) => s.cancel)
  if (!mode) return null
  const cost = mode.costFor ? mode.costFor(selection, world) : null
  const canFinish = mode.kind === 'hexes' ? selection.length > 0 : false
  return (
    <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.instruction].join(' ')} role="status" aria-live="polite">
      <h4>{mode.title}</h4>
      <p>{mode.instruction}</p>
      {mode.kind === 'hexes' && (
        <div className={styles.picked}>
          {selection.length === 0 ? 'Nic jeszcze nie zaznaczono.' : `Zaznaczono: ${selection.map((s) => `(${s.q}, ${s.r})`).join(' ')}${mode.max ? ` z ${mode.max}` : ''}`}
        </div>
      )}
      {cost !== null && <div className={styles.instructionCost}>Koszt: {cost} Logos</div>}
      <div className={styles.instructionBtns}>
        {mode.kind === 'hexes' && (
          <StoneButton variant="gold" disabled={!canFinish} onClick={finish}>
            Zakończ akcję
          </StoneButton>
        )}
        <StoneButton onClick={cancel}>Przerwij</StoneButton>
      </div>
    </div>
  )
}

/** Who waits for whom, for everyone at the table; the attacker may call the contest off. */
function ContestBanner({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const pending = useGameStore(selectPendingContest)
  const [busy, setBusy] = useState(false)
  if (!pending) return null
  const att = players.find((p) => p.id === pending.attacker_id)
  const def = players.find((p) => p.id === pending.defender_id)
  const target = entities.find((e) => e.id === pending.target_city_id)
  const mine = !!me && me.id === pending.attacker_id
  async function cancel() {
    setBusy(true)
    onError(null)
    try {
      await rpc('cancel_contest', { p_contest_id: pending!.id })
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.contest].join(' ')} role="status" aria-live="polite">
      <h4>{pending.kind === 'holy_war' ? 'Święta Wojna' : 'Nawracanie'}</h4>
      <p>
        {godLabel(att)} {pending.kind === 'holy_war' ? `wysyła armię ${pending.army ?? 0} wyznawców na miasto` : 'nawraca wyznawców w mieście'} {target?.name ?? 'bez imienia'}. Czekamy, aż{' '}
        {godLabel(def)} wybierze obronę i rzuci kośćmi.
      </p>
      {mine && (
        <StoneButton size="sm" disabled={busy} onClick={cancel}>
          Odwołaj starcie
        </StoneButton>
      )}
      {!mine && me?.id !== pending.defender_id && <Notice>Tura jest wstrzymana do końca starcia.</Notice>}
    </div>
  )
}
