import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { ACTION_BY_KEY, logActionKey } from '@/data/actions'
import { composeVerse } from '@/data/chronicle'
import { Modal, Notice, TextArea } from '@/components/ui/Primitives'
import { useDiceGate } from '../diceGate'
import type { WorldView } from '@/lib/world'
import { followersWord } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, playerLabel, selectMyPlayer, selectPendingContest } from '@/store/useGameStore'
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
 * The book waits for a verse before the turn moves on. The god who owes it sees this card when the
 * word's own window is gone (a reload, a closed tab): the verse can be written here, or left as the
 * book drafted it. Everyone else sees who the table is waiting for.
 */
export function VerseLockCard({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const verseDialog = useDiceGate((s) => s.verseDialog)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a moment's patience: the word's own window may still be about to mount
  const [settled, setSettled] = useState(false)
  const owing = game.verse_pending_by
  useEffect(() => {
    setSettled(false)
    if (!owing) return
    const t = window.setTimeout(() => setSettled(true), 1500)
    return () => window.clearTimeout(t)
  }, [owing])

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
  const myRow = useMemo(() => (me ? [...log].reverse().find((l) => l.player_id === me.id && !!logActionKey(l)) ?? null : null), [log, me])

  if (!owing || !me) return null
  const mine = owing === me.id
  if (!mine) {
    const who = players.find((p) => p.id === owing)
    return (
      <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.contest].join(' ')} role="status" aria-live="polite">
        <h4>Święta Księga</h4>
        <p>{godLabel(who)} dopisuje werset. Tura i Faza Chaosu czekają na ten zapis.</p>
      </div>
    )
  }
  if (verseDialog || !settled) return null
  const drafted = myRow ? composeVerse(myRow, ctx) : ''

  async function save(summary: string | null) {
    setBusy(true)
    setError(null)
    onError(null)
    try {
      if (summary !== null && myRow) {
        await rpc('edit_log_summary', { p_log_id: myRow.id, p_summary: summary })
        // a thing made by this word carries the verse as its description
        const key = logActionKey(myRow)
        if (key && ACTION_BY_KEY[key].entityOp === 'create' && myRow.entity_id) await rpc('edit_entity', { p_entity_id: myRow.entity_id, p_patch: { description: summary } })
      } else await rpc('release_verse', { p_game_id: game.id })
      setOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={['marble', 'emerge-from-dark', styles.railPanel, styles.contest].join(' ')} role="status" aria-live="polite">
        <h4>Święta Księga czeka</h4>
        <p>Twoje ostatnie słowo nie ma jeszcze wersetu. Dopisz go, a tura ruszy dalej.</p>
        <StoneButton variant="gold" size="sm" disabled={busy} onClick={() => { setText(drafted); setOpen(true) }}>
          Dopisz werset
        </StoneButton>
      </div>
      {open && (
        <Modal title="Werset do Świętej Księgi" onClose={() => setOpen(false)}>
          <div className={styles.contestBody}>
            {myRow ? (
              <TextArea id="lock_verse" label="Werset do Świętej Księgi" value={text} onChange={(e) => setText(e.target.value)} />
            ) : (
              <Notice>Księga nie znalazła tego słowa. Zostaw werset taki, jak go zapisała.</Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <div className={styles.footer}>
              <StoneButton disabled={busy} onClick={() => save(null)}>Zostaw jak jest</StoneButton>
              <StoneButton variant="gold" size="lg" disabled={busy || !myRow || !text.trim()} onClick={() => save(text.trim())}>
                Zapisz do Świętej Księgi
              </StoneButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
