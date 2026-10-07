import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { composeVerse } from '@/data/chronicle'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, playerLabel, selectMyPlayer } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, TextArea } from '@/components/ui/Primitives'
import { ContestSides, verdict } from './ContestOverlay'
import styles from './map.module.css'
import formStyles from '../actions/actions.module.css'

/** The attacker's last step: the dice have spoken, now the verse goes into the book. */
export function ContestVerseDialog() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const contests = useGameStore((s) => s.contests)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contest = useMemo(() => contests.find((c) => c.status === 'resolved' && c.attacker_id === me?.id) ?? null, [contests, me?.id])
  const row = contest?.log_id ? log.find((l) => l.id === contest.log_id) ?? null : null

  const ctx = useMemo(
    () => ({
      god: (id: string | null) => {
        const p = players.find((x) => x.id === id)
        return { name: playerLabel(p, profiles), gender: p?.god_gender ?? 'n' }
      },
      entity: (id: string | null) => (id ? entities.find((e) => e.id === id) : undefined),
    }),
    [players, profiles, entities],
  )
  const drafted = row ? composeVerse(row, ctx) : ''
  useEffect(() => {
    if (!edited) setText(drafted)
  }, [drafted, edited])

  if (!contest || !me) return null
  const def = players.find((p) => p.id === contest.defender_id)
  const o = (contest.outcome ?? {}) as Record<string, unknown>

  async function commit(summary: string) {
    setBusy(true)
    setError(null)
    try {
      await rpc('commit_contest', { p_contest_id: contest!.id, p_summary: summary })
      setEdited(false)
      setText('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={contest.kind === 'holy_war' ? 'Święta Wojna rozstrzygnięta' : 'Nawracanie rozstrzygnięte'} wide>
      <div className={styles.contestBody}>
        <ContestSides contest={contest} attackerName={godLabel(me)} defenderName={godLabel(def)} />
        <p className={styles.verdict}>{verdict(contest, godLabel(me), godLabel(def), Number(o.converted ?? 0))}</p>
        <TextArea id="contest_verse" label="Werset do Świętej Księgi" value={text} onChange={(e) => { setText(e.target.value); setEdited(e.target.value.trim() !== '') }} />
        <p className={formStyles.draftHint}>{edited ? 'Twoje słowa. Wyczyść pole, by wrócić do podpowiedzi.' : 'Podpowiedź księgi. Zmień ją, jeśli chcesz opowiedzieć to inaczej.'}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className={styles.footer}>
          <StoneButton disabled={busy} onClick={() => commit(drafted)}>Zostaw jak jest</StoneButton>
          <StoneButton variant="gold" size="lg" disabled={busy || !text.trim()} onClick={() => commit(text.trim())}>
            Zapisz do Świętej Księgi
          </StoneButton>
        </div>
      </div>
    </Modal>
  )
}
