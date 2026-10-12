import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import { Notice } from '@/components/ui/Primitives'
import type { WorldView } from '@/lib/world'
import { followersWord } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { useMapMode, riverStuck } from './mapMode'
import { neighbours } from '@/lib/hex'
import styles from './map.module.css'

/** The question the map is asking, with the running cost and the two buttons the brief wants. */
export function MapInstructionCard({ world }: { world: WorldView }) {
  const mode = useMapMode((s) => s.mode)
  const selection = useMapMode((s) => s.selection)
  const finish = useMapMode((s) => s.finish)
  const cancel = useMapMode((s) => s.cancel)
  if (!mode) return null
  const cost = mode.costFor ? mode.costFor(selection, world) : null
  const canFinish = mode.kind === 'hexes' ? selection.length > 0 : false
  const stuck = riverStuck(mode, selection, world, neighbours)
  return (
    <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.instruction].join(' ')} role="status" aria-live="polite">
      <h4>{mode.title}</h4>
      <p>{mode.instruction}</p>
      {mode.kind === 'hexes' && (
        <div className={styles.picked}>
          {selection.length === 0 ? 'Nic jeszcze nie zaznaczono.' : `Zaznaczono ${selection.length}${mode.max ? ` z ${mode.max}` : ''}`}
        </div>
      )}
      {mode.kind === 'river' && (
        <div className={styles.picked}>
          {selection.length === 0 ? (mode.start ? 'Rzeka czeka na nowe koryto.' : 'Najpierw źródło: kliknij górę.') : `Koryto: ${selection.length} ${selection.length === 1 ? 'pole' : selection.length <= 4 ? 'pola' : 'pól'}`}
        </div>
      )}
      {stuck && <Notice tone="error">Rzeka nie ma dokąd płynąć. Przerwij i zacznij od innej góry.</Notice>}
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
export function ContestBanner({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const pending = useGameStore(selectPendingContest)
  const [busy, setBusy] = useState(false)
  if (!pending) return null
  const att = players.find((p) => p.id === pending.attacker_id)
  const def = players.find((p) => p.id === pending.defender_id)
  const target = pending.target_city_id ? entities.find((e) => e.id === pending.target_city_id) : undefined
  const attAvatar = pending.attacker_avatar_id ? entities.find((e) => e.id === pending.attacker_avatar_id) : undefined
  const defAvatar = pending.defender_avatar_id ? entities.find((e) => e.id === pending.defender_avatar_id) : undefined
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
      <h4>{pending.kind === 'holy_war' ? 'Święta Wojna' : pending.kind === 'avatar_duel' ? 'Walka Awatarów' : 'Nawracanie'}</h4>
      <p>
        {pending.kind === 'avatar_duel'
          ? `${godLabel(att)} posyła awatara ${attAvatar?.emoji ?? ''} ${attAvatar?.name ?? ''} przeciw awatarowi ${defAvatar?.emoji ?? ''} ${defAvatar?.name ?? ''}.`
          : `${godLabel(att)} ${pending.kind === 'holy_war' ? `wysyła armię (${followersWord(pending.army ?? 0)}) na miasto` : 'nawraca wyznawców w mieście'} ${target?.name ?? 'bez imienia'}.`}{' '}
        Czekamy, aż {godLabel(def)} wybierze obronę i rzuci kośćmi.
      </p>
      {mine && (
        <StoneButton size="sm" disabled={busy} onClick={cancel}>
          Odwołaj starcie
        </StoneButton>
      )}
    </div>
  )
}

/** every god's colour and how many pray to it */
export function GodLegend({ world }: { world: WorldView }) {
  const players = useGameStore((s) => s.players)
  return (
    <div className={styles.legend}>
      {players.map((p) => {
        const c = godColor(p)
        const n = world.totalDots(p.id)
        return (
          <div key={p.id} className={styles.legendRow} title={followersWord(n)}>
            <span className={styles.swatch} style={{ background: c.fill, boxShadow: `0 0 0 1.5px ${c.stroke}` }} />
            <b title={godLabel(p)}>{godLabel(p)}</b>
            <span className={styles.legendDots}>{n}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The book waits for a verse before the turn moves on. The god who owes it gets the Holy Book window
 * (VerseDialog) once the map has shown what the word did; everyone else sees here who the table is
 * waiting for.
 */
export function VerseLockCard() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const owing = game.verse_pending_by
  if (!owing || !me || owing === me.id) return null
  const who = players.find((p) => p.id === owing)
  return (
    <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.contest].join(' ')} role="status" aria-live="polite">
      <h4>Święta Księga</h4>
      <p>{godLabel(who)} dopisuje werset. Tura i Faza Chaosu czekają na ten zapis.</p>
    </div>
  )
}
