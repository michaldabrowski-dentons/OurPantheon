import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { NightFight, NightSide } from '@/lib/types'
import { nightLine } from '@/data/tableEvents'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, playerLabel, selectMyPlayer, selectNight } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, Dice2d6 } from '@/components/ui/Primitives'
import mapStyles from '../map/map.module.css'
import styles from './chaos.module.css'

const SCENE_TITLE: Record<NightFight['scene'], string> = {
  creature: 'Walka w nocy',
  beast_city: 'Bestia u bram miasta',
  beast_avatar: 'Bestia napada na awatara',
  exodus_beast: 'Osadnicy przeciw bestii',
  exodus_city: 'Osadnicy u bram miasta',
}

const GRACE_MS = 60000

/**
 * Two sides, two rolls: the god of each side clicks for its own (the host for the absent). Once both
 * rolled, the verdict stays on the table until both gods have read it (the host reads for the absent,
 * after a minute anyone may); only then does the night go on.
 */
export function NightFightDialog() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const night = useGameStore(selectNight)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const fight = night?.pending?.kind === 'fight' ? night.pending : null
  const verdict = night?.pending?.kind === 'verdict' ? night.pending : null
  const waitingOn = !!fight || !!verdict

  useEffect(() => {
    if (!waitingOn) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [waitingOn])

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

  if (!me || (!fight && !verdict)) return null

  async function call(fn: string, args: Record<string, unknown>, key: string) {
    setBusy(key)
    setError(null)
    try {
      await rpc(fn, { p_game_id: game.id, ...args })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const godOf = (s: NightSide) => (s.player_id ? godLabel(players.find((p) => p.id === s.player_id)) : 'bezbożni')

  if (fight) {
    const since = new Date(fight.since).getTime()
    const late = now - since > GRACE_MS
    const mayRoll = (s: NightSide) => s.player_id === null || s.player_id === me.id || isHost || late
    const Side = ({ s, side }: { s: NightSide; side: 'left' | 'right' }) => (
      <div className={mapStyles.side}>
        <b>{s.emoji ? `${s.emoji} ` : ''}{s.label}</b>
        <small className={styles.nightSideGod}>{side === 'left' ? 'napastnik' : 'obrońca'} · {godOf(s)}</small>
        {s.roll ? (
          <>
            <Dice2d6 d1={s.roll.d1} d2={s.roll.d2} showTotal={false} animateKey={`${fight.log_id ?? 'f'}-${side}`} />
            <span className={mapStyles.sideTotal}>{s.roll.total}</span>
            <span className={mapStyles.sideMod}>{s.roll.d1} + {s.roll.d2} {s.mod < 0 ? '−' : '+'} {Math.abs(s.mod)}</span>
          </>
        ) : (
          <>
            <span className={mapStyles.sideTotal}>?</span>
            <span className={mapStyles.sideMod}>2k6 {s.mod < 0 ? '−' : '+'} {Math.abs(s.mod)}</span>
            <StoneButton variant="gold" size="sm" disabled={!!busy || !mayRoll(s)} onClick={() => call('chaos_fight_roll', { p_side: side }, side)} title={mayRoll(s) ? undefined : 'Za tę stronę rzuca jej bóstwo albo gospodarz.'}>
              {busy === side ? 'Kości lecą…' : mayRoll(s) && s.player_id !== me.id ? 'Rzuć za nich' : 'Rzuć 2k6'}
            </StoneButton>
          </>
        )}
      </div>
    )
    return (
      <Modal title={SCENE_TITLE[fight.scene] ?? 'Walka w nocy'} wide>
        <div className={mapStyles.contestBody}>
          <p className={styles.nightLead}>
            {fight.scene === 'creature' && 'Obie strony rzucają 2k6 plus siłę. Mniejszy wynik przegrywa: różnica trzech lub więcej to śmierć, mniejsza to ucieczka, remis to odwrót napastnika.'}
            {fight.scene === 'beast_city' && 'Bestia rzuca 2k6 plus siłę, miasto 2k6 plus ludność. Gdy bestia wygra, miasto traci tylu mieszkańców, ile wynosi różnica.'}
            {fight.scene === 'beast_avatar' && 'Bestia rzuca 2k6 plus siłę, awatar 2k6 plus życie. Gdy bestia wygra, awatar traci tyle żyć, ile wynosi różnica.'}
            {(fight.scene === 'exodus_beast' || fight.scene === 'exodus_city') && 'Osadnicy rzucają 2k6 plus swoją liczbę, obrońca 2k6 plus siłę albo ludność. Rozstrzyga tabela Świętej Wojny.'}
          </p>
          <div className={mapStyles.sides}>
            <Side s={fight.left} side="left" />
            <span className={mapStyles.versus}>PRZECIW</span>
            <Side s={fight.right} side="right" />
          </div>
          {late && <Notice>Minęła minuta: za nieobecnych może rzucić każdy.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Modal>
    )
  }

  // the verdict: read by both gods before the night goes on
  const v = verdict!
  const row = log.find((l) => l.id === v.log_id)
  const o = (row?.outcome && !Array.isArray(row.outcome) ? row.outcome : {}) as Record<string, unknown>
  const L = (o.left ?? {}) as NightSide
  const R = (o.right ?? {}) as NightSide
  const late = now - new Date(v.since).getTime() > GRACE_MS
  const acked = v.acks.includes(me.id)
  const mine = v.players.includes(me.id)
  const mayAck = !acked && (mine || isHost || late || v.players.length === 0)
  const waitingFor = v.players.filter((p) => !v.acks.includes(p)).map((p) => godLabel(players.find((x) => x.id === p)))
  const SideDone = ({ s, side }: { s: NightSide; side: 'left' | 'right' }) => (
    <div className={mapStyles.side}>
      <b>{s.emoji ? `${s.emoji} ` : ''}{s.label}</b>
      <small className={styles.nightSideGod}>{side === 'left' ? 'napastnik' : 'obrońca'} · {godOf(s)}</small>
      {s.roll && <Dice2d6 d1={s.roll.d1} d2={s.roll.d2} showTotal={false} animateKey={`${v.log_id}-${side}`} />}
      <span className={mapStyles.sideTotal}>{s.roll?.total ?? '?'}</span>
      {s.roll && <span className={mapStyles.sideMod}>{s.roll.d1} + {s.roll.d2} {s.mod < 0 ? '−' : '+'} {Math.abs(s.mod)}</span>}
    </div>
  )
  return (
    <Modal title="Kości padły" wide>
      <div className={mapStyles.contestBody}>
        <div className={mapStyles.sides}>
          <SideDone s={L} side="left" />
          <span className={mapStyles.versus}>PRZECIW</span>
          <SideDone s={R} side="right" />
        </div>
        <p className={mapStyles.verdict}>{row ? nightLine(row, ctx) : 'Kości padły.'}</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className={mapStyles.footer}>
          {waitingFor.length > 0 && !acked && !mine && !isHost && !late && <small className={styles.nightHint}>Czekamy, aż {waitingFor.join(' i ')} przeczyta wynik.</small>}
          {acked && <small className={styles.nightHint}>Przeczytane. Czekamy na {waitingFor.join(' i ') || 'resztę stołu'}.</small>}
          {mayAck && (
            <StoneButton variant="gold" size="lg" disabled={!!busy} onClick={() => call('chaos_ack_fight', {}, 'ack')}>
              {busy === 'ack' ? 'Chwila…' : isHost && !mine ? 'Dalej (za wszystkich)' : 'Przeczytałem, dalej'}
            </StoneButton>
          )}
        </div>
      </div>
    </Modal>
  )
}
