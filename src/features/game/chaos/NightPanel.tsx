import { useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { ChaosNight } from '@/lib/types'
import { nightLine } from '@/data/tableEvents'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, playerLabel, selectMyPlayer, selectNight } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { useWorld } from '../map/useWorld'
import styles from './chaos.module.css'

const STEP_MS = 1500
const NIGHT_KEYS = new Set(['night_begin', 'night_move', 'night_fight', 'night_city', 'night_city_founded'])

/**
 * The host's client walks the night: one unit, a moment for the table to see it on the map, the
 * next unit. The server does the rolling; this only knocks. A stale cursor makes a knock harmless,
 * so a doubled call changes nothing. When the host is gone, anyone may take the lead.
 */
function useNightDriver(night: ChaosNight | null, drive: boolean, gameId: string, onError: (m: string | null) => void) {
  const inFlight = useRef(false)
  const movedAt = useRef(Date.now())
  const [tick, setTick] = useState(0)
  const cursor = night?.cursor ?? -1
  const status = night?.status ?? 'none'
  useEffect(() => {
    movedAt.current = Date.now()
  }, [cursor, status])
  // a lost Realtime event must not freeze the night: re-arm every few seconds
  useEffect(() => {
    if (!drive || status !== 'running') return
    const t = window.setInterval(() => setTick((n) => n + 1), 4000)
    return () => window.clearInterval(t)
  }, [drive, status])
  useEffect(() => {
    if (!drive || !night || status !== 'running') return
    const wait = Math.max(0, STEP_MS - (Date.now() - movedAt.current))
    const t = window.setTimeout(async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        await rpc('chaos_step', { p_game_id: gameId, p_expected_cursor: cursor })
      } catch (err) {
        onError((err as Error).message)
      } finally {
        inFlight.current = false
      }
    }, wait)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive, status, cursor, gameId, tick])
}

/** The night over the world: who moves now, what just happened, and the host's reins. */
export function NightPanel({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const occupants = useGameStore((s) => s.occupants)
  const night = useGameStore(selectNight)
  const me = useGameStore(selectMyPlayer(user.id))
  const world = useWorld()
  const isHost = game.host_id === user.id
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lead, setLead] = useState(false)
  const [quietFor, setQuietFor] = useState(0)

  const drive = !!night && (isHost ? !paused : lead)
  useNightDriver(night, drive, game.id, onError)

  // a guest may take the reins after a while of silence
  const lastAt = night?.updated_at ? new Date(night.updated_at).getTime() : 0
  useEffect(() => {
    if (!night || isHost) return
    const t = window.setInterval(() => setQuietFor(Date.now() - Math.max(lastAt, 0)), 1000)
    return () => window.clearInterval(t)
  }, [night, isHost, lastAt])

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

  if (!night) return null
  const total = night.queue.length
  const done = Math.min(night.cursor, total)
  const unit = night.cursor > 0 ? night.queue[night.cursor - 1] : null
  const unitName = (() => {
    if (!unit) return 'Noc zapada…'
    if (unit.t === 'city') {
      const e = entities.find((x) => x.id === unit.id)
      return e ? `Miasto ${e.name}` : 'Miasto'
    }
    const occ = occupants.find((o) => o.id === unit.id)
    const e = occ ? world.entityById(occ.entity_id) : undefined
    const kind = unit.t === 'herbivore' ? 'Stado' : unit.t === 'beast' ? 'Bestia' : 'Plemię'
    return e ? `${kind}: ${e.emoji ?? ''} ${e.name}` : `${kind} (już go nie ma)`
  })()
  const feed = log.filter((l) => NIGHT_KEYS.has(l.action_key) && l.round_number === game.round_number).slice(-6).reverse()
  const waiting = night.status === 'fight' ? 'Walka: czekamy na rzuty.' : night.status === 'naming' ? 'Nowe miasto czeka na nazwę.' : null

  async function skip() {
    setBusy(true)
    onError(null)
    try {
      await rpc('chaos_skip', { p_game_id: game.id })
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={['marble', 'emerge-from-dark', styles.nightPanel].join(' ')} role="status" aria-live="polite" aria-label="Noc nad światem">
      <div className={styles.nightHead}>
        <h4 className="engraved">Noc nad światem</h4>
        <span className={styles.nightCount}>{done} / {total}</span>
      </div>
      <div className={styles.nightBar} aria-hidden>
        <span style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
      </div>
      <p className={styles.nightNow}>{waiting ?? unitName}</p>
      <ol className={styles.nightFeed}>
        {feed.map((l) => (
          <li key={l.id}>{nightLine(l, ctx)}</li>
        ))}
      </ol>
      <div className={styles.nightBtns}>
        {isHost ? (
          <>
            <StoneButton size="sm" disabled={busy || night.status !== 'running'} onClick={() => setPaused((v) => !v)}>
              {paused ? 'Wznów' : 'Wstrzymaj'}
            </StoneButton>
            <StoneButton variant="gold" size="sm" disabled={busy} onClick={skip} title="Księga dogra resztę nocy sama: rzuci walki i nada miastom nazwy tymczasowe.">
              Pomiń noc
            </StoneButton>
          </>
        ) : lead ? (
          <small className={styles.nightHint}>Prowadzisz noc za gospodarza.</small>
        ) : quietFor > 20000 && night.status === 'running' ? (
          <StoneButton size="sm" onClick={() => setLead(true)}>
            Poprowadź noc
          </StoneButton>
        ) : (
          <small className={styles.nightHint}>{me ? 'Noc prowadzi gospodarz.' : ''}</small>
        )}
      </div>
    </div>
  )
}
