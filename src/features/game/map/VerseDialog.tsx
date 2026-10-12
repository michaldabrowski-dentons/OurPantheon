import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { ACTION_BY_KEY, logActionKey } from '@/data/actions'
import { composeVerse } from '@/data/chronicle'
import { describeEvent } from '@/data/tableEvents'
import { Modal, Notice, TextArea } from '@/components/ui/Primitives'
import { StoneButton } from '@/components/ui/StoneButton'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, playerLabel, selectMyPlayer } from '@/store/useGameStore'
import { useDiceGate } from '../diceGate'
import styles from './map.module.css'
import formStyles from '../actions/actions.module.css'

/** how long the map keeps the stage after a word's window closes: the burst plays, then the book opens */
const AFTER_WORD_MS = 3600

/**
 * The Holy Book opens by itself after every word of mine: the window of the word has closed, the map
 * has shown what happened, and now the verse goes in. Nothing else may be spoken until it is written
 * (games.verse_pending_by). Contests write their verse in their own window (ContestVerseDialog).
 */
export function VerseDialog() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const contests = useGameStore((s) => s.contests)
  const log = useGameStore((s) => s.log)
  const wordOpen = useDiceGate((s) => s.verseDialog)
  const claimed = useDiceGate((s) => s.claimed)
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const owing = game.verse_pending_by
  const mine = !!me && owing === me.id
  // a contest of mine waiting for its verse has its own window
  const contestVerse = !!me && contests.some((c) => c.status === 'resolved' && c.attacker_id === me.id)
  // the stage belongs to the word's own window and to the map for a moment after it closes
  const waiting = wordOpen || claimed
  useEffect(() => {
    setReady(false)
    if (!mine || waiting || contestVerse) return
    const t = window.setTimeout(() => setReady(true), AFTER_WORD_MS)
    return () => window.clearTimeout(t)
  }, [mine, waiting, contestVerse, owing])

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
  const drafted = useMemo(() => (myRow ? composeVerse(myRow, ctx) : ''), [myRow, ctx])
  useEffect(() => {
    if (!edited) setText(drafted)
  }, [drafted, edited])

  if (!mine || !me || waiting || contestVerse || !ready) return null
  const happened = myRow ? describeEvent(myRow, ctx) : ''
  const key = myRow ? logActionKey(myRow) : undefined
  const action = key ? ACTION_BY_KEY[key] : undefined

  async function save(summary: string | null) {
    setBusy(true)
    setError(null)
    try {
      if (summary !== null && myRow) {
        await rpc('edit_log_summary', { p_log_id: myRow.id, p_summary: summary })
        // a thing made by this word carries the verse as its description
        if (action?.entityOp === 'create' && myRow.entity_id) await rpc('edit_entity', { p_entity_id: myRow.entity_id, p_patch: { description: summary } })
      } else await rpc('release_verse', { p_game_id: game.id })
      setEdited(false)
      setText('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Święta Księga${action ? `: ${action.name}` : ''}`} wide>
      <div className={styles.contestBody}>
        {happened && <Notice tone="ok">Słowo padło. {happened}</Notice>}
        {myRow ? (
          <TextArea id="verse" label="Werset do Świętej Księgi" value={text} onChange={(e) => { setText(e.target.value); setEdited(e.target.value.trim() !== '') }} />
        ) : (
          <Notice>Księga nie znalazła tego słowa. Zostaw werset taki, jak go zapisała.</Notice>
        )}
        <p className={formStyles.draftHint}>{edited ? 'Twoje słowa. Wyczyść pole, by wrócić do podpowiedzi.' : 'Podpowiedź księgi. Zmień ją, jeśli chcesz opowiedzieć to inaczej.'}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className={styles.footer}>
          <StoneButton disabled={busy} onClick={() => save(myRow ? drafted : null)}>Zostaw jak jest</StoneButton>
          <StoneButton variant="gold" size="lg" disabled={busy || !myRow || !text.trim()} onClick={() => save(text.trim())}>
            Zapisz do Świętej Księgi
          </StoneButton>
        </div>
      </div>
    </Modal>
  )
}
