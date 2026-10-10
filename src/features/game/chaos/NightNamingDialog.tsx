import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectNight } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, TextField } from '@/components/ui/Primitives'
import mapStyles from '../map/map.module.css'
import styles from './chaos.module.css'

const GRACE_MS = 60000

/** A city rose in the night: its god names it (the host may, and after a minute anyone). */
export function NightNamingDialog() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const night = useGameStore(selectNight)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const naming = night?.pending?.kind === 'naming' ? night.pending : null

  useEffect(() => {
    if (!naming) return
    setName(naming.placeholder)
    setError(null)
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [naming?.city_id, naming?.placeholder]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!naming || !me) return null
  const namer = players.find((p) => p.id === naming.namer_id)
  const late = now - new Date(naming.since).getTime() > GRACE_MS
  const mine = naming.namer_id === null || naming.namer_id === me.id || isHost || late
  const city = entities.find((e) => e.id === naming.city_id)
  const species = city ? entities.find((e) => e.id === naming.city_id)?.name : ''
  void species

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await rpc('chaos_name_city', { p_game_id: game.id, p_name: name.trim() })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nowe miasto" wide>
      <div className={mapStyles.contestBody}>
        <p className={styles.nightLead}>
          W nocy powstało miasto{city ? ` (na razie: ${city.name})` : ''}. {mine ? 'Nadaj mu nazwę.' : `Czekamy, aż ${godLabel(namer)} nada mu nazwę.`}
        </p>
        {mine ? (
          <>
            <TextField id="night_city_name" label="Nazwa nowego miasta" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            {late && naming.namer_id !== me.id && !isHost && <Notice>Minęła minuta: nazwę może nadać każdy.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <div className={mapStyles.footer}>
              <StoneButton variant="gold" size="lg" disabled={busy || !name.trim()} onClick={save}>
                {busy ? 'Zapisuję…' : 'Nazwij miasto'}
              </StoneButton>
            </div>
          </>
        ) : (
          <p className={styles.nightHint}>Noc ruszy dalej, gdy miasto dostanie nazwę.</p>
        )}
      </div>
    </Modal>
  )
}
