import { useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, NightFight, NightSide } from '@/lib/types'
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
 * Two sides, two rolls: the god of each side clicks for its own (the host for the absent). The
 * window cannot be closed while the night waits; once both rolled it shows what the dice decided.
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
  const [verdict, setVerdict] = useState<ActionLog | null>(null)
  const seen = useRef<string | null | undefined>(undefined)
  const [now, setNow] = useState(Date.now())

  const fight = night?.pending?.kind === 'fight' ? night.pending : null

  // the newest fight row, for a moment after the dice fell
  const latest = useMemo(() => [...log].reverse().find((l) => l.action_key === 'night_fight') ?? null, [log])
  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = latest?.id ?? null
      return
    }
    if (!latest || latest.id === seen.current) return
    seen.current = latest.id
    if (Date.now() - new Date(latest.created_at).getTime() > 20000) return
    setVerdict(latest)
    const t = window.setTimeout(() => setVerdict(null), 3200)
    return () => window.clearTimeout(t)
  }, [latest])

  useEffect(() => {
    if (!fight) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [fight])

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

  if (!fight && !verdict) return null

  async function roll(side: 'left' | 'right') {
    setBusy(side)
    setError(null)
    try {
      await rpc('chaos_fight_roll', { p_game_id: game.id, p_side: side })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (fight) {
    const since = new Date(fight.since).getTime()
    const late = now - since > GRACE_MS
    const mayRoll = (s: NightSide) => !!me && (s.player_id === null || s.player_id === me.id || isHost || late)
    const godOf = (s: NightSide) => (s.player_id ? godLabel(players.find((p) => p.id === s.player_id)) : 'bezbożni')
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
            <StoneButton variant="gold" size="sm" disabled={!!busy || !mayRoll(s)} onClick={() => roll(side)} title={mayRoll(s) ? undefined : 'Za tę stronę rzuca jej bóstwo albo gospodarz.'}>
              {busy === side ? 'Kości lecą…' : mayRoll(s) && me && s.player_id !== me.id ? 'Rzuć za nich' : 'Rzuć 2k6'}
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

  const v = verdict!
  const o = (v.outcome && !Array.isArray(v.outcome) ? v.outcome : {}) as Record<string, unknown>
  const L = (o.left ?? {}) as NightSide
  const R = (o.right ?? {}) as NightSide
  const SideDone = ({ s, side }: { s: NightSide; side: 'left' | 'right' }) => (
    <div className={mapStyles.side}>
      <b>{s.emoji ? `${s.emoji} ` : ''}{s.label}</b>
      {s.roll && <Dice2d6 d1={s.roll.d1} d2={s.roll.d2} showTotal={false} animateKey={`${v.id}-${side}`} />}
      <span className={mapStyles.sideTotal}>{s.roll?.total ?? '?'}</span>
    </div>
  )
  return (
    <Modal title="Kości padły" onClose={() => setVerdict(null)} wide>
      <div className={mapStyles.contestBody}>
        <div className={mapStyles.sides}>
          <SideDone s={L} side="left" />
          <span className={mapStyles.versus}>PRZECIW</span>
          <SideDone s={R} side="right" />
        </div>
        <p className={mapStyles.verdict}>{nightLine(v, ctx)}</p>
      </div>
    </Modal>
  )
}
