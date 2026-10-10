import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { BEAST_EMOJI, HERBIVORE_EMOJI, SAPIENT_EMOJI } from '@/data/emoji'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectNight } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, TextField } from '@/components/ui/Primitives'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { useWorld } from '../map/useWorld'
import mapStyles from '../map/map.module.css'
import styles from './chaos.module.css'

const GRACE_MS = 60000

/** A 12 in the night: a new kind is born. The god of the species names it and gives it a sign. */
export function NightMutationDialog() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const night = useGameStore(selectNight)
  const me = useGameStore(selectMyPlayer(user.id))
  const world = useWorld()
  const isHost = game.host_id === user.id
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const mutation = night?.pending?.kind === 'mutation' ? night.pending : null

  useEffect(() => {
    if (!mutation) return
    setName(mutation.placeholder)
    setEmoji('')
    setError(null)
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [mutation?.parent_id, mutation?.placeholder]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mutation || !me) return null
  const namer = players.find((p) => p.id === mutation.namer_id)
  const late = now - new Date(mutation.since).getTime() > GRACE_MS
  const mine = mutation.namer_id === null || mutation.namer_id === me.id || isHost || late
  const pool = mutation.role === 'beast' ? BEAST_EMOJI : mutation.role === 'tribe' ? SAPIENT_EMOJI : HERBIVORE_EMOJI
  const what = mutation.role === 'beast' ? 'Wataha dzieli się: powstaje nowa bestia' : mutation.role === 'tribe' ? 'Schizma: rodzi się nowy lud' : 'Ewolucja tworzy nowy gatunek'

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await rpc('chaos_name_mutation', { p_game_id: game.id, p_name: name.trim(), p_emoji: emoji })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nowa odmiana" wide>
      <div className={mapStyles.contestBody}>
        <p className={styles.nightLead}>
          {what} z {mutation.parent_emoji ?? ''} {mutation.parent_name}. {mine ? 'Nadaj jej nazwę i znak.' : `Czekamy, aż ${godLabel(namer)} nada jej nazwę i znak.`}
          {mutation.role === 'beast' ? ' Nowa wataha od razu rusza na łowy.' : ''}
        </p>
        {mine ? (
          <>
            <TextField id="mutation_name" label="Nazwa nowej odmiany" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <EmojiPicker label="Znak na mapie" options={pool} used={world.usedEmoji} value={emoji} onChange={setEmoji} />
            {late && mutation.namer_id !== me.id && !isHost && <Notice>Minęła minuta: nazwę może nadać każdy.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <div className={mapStyles.footer}>
              <StoneButton variant="gold" size="lg" disabled={busy || !name.trim() || !emoji} onClick={save}>
                {busy ? 'Zapisuję…' : 'Niech powstaną'}
              </StoneButton>
            </div>
          </>
        ) : (
          <p className={styles.nightHint}>Noc ruszy dalej, gdy nowa odmiana dostanie nazwę.</p>
        )}
      </div>
    </Modal>
  )
}
