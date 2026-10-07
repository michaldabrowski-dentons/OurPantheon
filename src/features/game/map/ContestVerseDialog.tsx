import { useEffect, useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { Entity } from '@/lib/types'
import { composeVerse } from '@/data/chronicle'
import { followersWord } from '@/data/cities'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, playerLabel, selectMyPlayer } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, TextArea, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { useDiceWait, useVerseDialogFlag } from '../diceGate'
import { ContestSides, KIND_TITLE, verdict } from './ContestOverlay'
import { useWorld } from './useWorld'
import styles from './map.module.css'
import formStyles from '../actions/actions.module.css'

/**
 * The attacker's last step: the dice have spoken, now the verse goes into the book. After a won holy
 * war the attacker first decides where the successes land: followers of the city, the enemy avatar
 * standing there, creatures living there.
 */
export function ContestVerseDialog() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const contests = useGameStore((s) => s.contests)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const world = useWorld()
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dots, setDots] = useState<number | null>(null)
  const [avatar, setAvatar] = useState(0)
  const [creatures, setCreatures] = useState<string[]>([])

  const contest = useMemo(() => contests.find((c) => c.status === 'resolved' && c.attacker_id === me?.id) ?? null, [contests, me?.id])
  const row = contest?.log_id ? log.find((l) => l.id === contest.log_id) ?? null : null
  const waiting = useDiceWait(contest?.log_id ?? null)

  const o = (contest?.outcome ?? {}) as Record<string, unknown>
  const pendingWar = contest?.kind === 'holy_war' && o.pending === true
  const successes = Number(o.successes ?? 0)
  const city = contest?.target_city_id ? world.cityOf(contest.target_city_id) : undefined
  const defenderDots = contest?.target_city_id ? world.dotsOf(contest.target_city_id, contest.defender_id) : 0
  const defAvatar = contest && city ? world.avatarsOf(contest.defender_id).find((a) => a.occupant && a.occupant.q === city.q && a.occupant.r === city.r)?.entity : undefined
  const creaturesHere = city ? world.occupantsAt(city.q, city.r).map((occ) => ({ occ, e: world.entityById(occ.entity_id) })).filter((x): x is { occ: typeof x.occ; e: Entity } => !!x.e && x.e.kind === 'creature') : []
  const dotsChosen = dots ?? Math.min(successes, defenderDots)
  const spent = dotsChosen + avatar + creatures.length
  const left = successes - spent

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
  // the book's draft: for a pending war, as if the chosen split had already happened
  const drafted = useMemo(() => {
    if (!row) return ''
    if (!pendingWar) return composeVerse(row, ctx)
    const killed = creatures.map((id) => creaturesHere.find((c) => c.occ.id === id)?.e).filter((e): e is Entity => !!e).map((e) => ({ entity_id: e.id, name: e.name, emoji: e.emoji }))
    const patched = { ...row, outcome: { ...o, pending: false, removed: dotsChosen, converted: Math.ceil(dotsChosen / 2), defender_lost: dotsChosen + Number(o.defender_lost ?? 0), avatar_wounds: avatar, avatar_name: defAvatar?.name ?? '', avatar_dead: !!defAvatar && avatar >= (defAvatar.hp ?? 0), creatures_killed: killed, target_destroyed: !!city && dotsChosen >= defenderDots && world.cityDots(city.entity_id) - dotsChosen + Math.ceil(dotsChosen / 2) <= 0 } }
    return composeVerse(patched, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, ctx, pendingWar, dotsChosen, avatar, creatures])
  useEffect(() => {
    if (!edited) setText(drafted)
  }, [drafted, edited])

  useVerseDialogFlag(!!contest && !!me && !waiting)
  if (!contest || !me || waiting) return null
  const def = players.find((p) => p.id === contest.defender_id)

  async function commit(summary: string) {
    setBusy(true)
    setError(null)
    try {
      const args: Record<string, unknown> = { p_contest_id: contest!.id, p_summary: summary }
      if (pendingWar) args.p_allocation = { dots: dotsChosen, avatar, creatures }
      await rpc('commit_contest', args)
      setEdited(false)
      setText('')
      setDots(null)
      setAvatar(0)
      setCreatures([])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const clampDots = (n: number) => Math.max(0, Math.min(n, defenderDots, successes - avatar - creatures.length))
  const clampAvatar = (n: number) => Math.max(0, Math.min(n, defAvatar?.hp ?? 0, successes - dotsChosen - creatures.length))

  return (
    <Modal title={`${KIND_TITLE[contest.kind]} rozstrzygnięta`} wide>
      <div className={styles.contestBody}>
        <ContestSides contest={contest} attackerName={godLabel(me)} defenderName={godLabel(def)} />
        <p className={styles.verdict}>{verdict(contest, godLabel(me), godLabel(def), Number(o.converted ?? 0))}</p>
        {pendingWar && (
          <div className={styles.alloc}>
            <p className={styles.allocHead}>
              Rozdziel {successes} {successes === 1 ? 'sukces' : successes < 5 ? 'sukcesy' : 'sukcesów'}. {left > 0 ? `Jeszcze ${left} do rozdania (przepadnie, jeśli nie wskażesz celu).` : 'Wszystkie rozdane.'}
            </p>
            <label className={fieldClass}>
              <span className={labelClass}>Wyznawcy {godLabel(def)} w mieście (jest ich {defenderDots}): każdy sukces zabija jednego, połowa zabitych (w górę) nawraca się na ciebie</span>
              <input className={inputClass} type="number" min={0} max={Math.min(defenderDots, successes)} value={dotsChosen} onChange={(e) => setDots(clampDots(Number(e.target.value) || 0))} />
            </label>
            {defAvatar ? (
              <label className={fieldClass}>
                <span className={labelClass}>Rany awatara {defAvatar.emoji ?? ''} {defAvatar.name} (życie {defAvatar.hp ?? 0} z 3): jeden sukces to jedna rana</span>
                <input className={inputClass} type="number" min={0} max={Math.min(defAvatar.hp ?? 0, successes)} value={avatar} onChange={(e) => setAvatar(clampAvatar(Number(e.target.value) || 0))} />
              </label>
            ) : (
              <p className={formStyles.hint}>Na tym polu nie stoi awatar obrońcy.</p>
            )}
            {creaturesHere.length > 0 && (
              <div className={fieldClass}>
                <span className={labelClass}>Istoty na tym polu: jeden sukces usuwa jedną</span>
                <div className={styles.allocList}>
                  {creaturesHere.map(({ occ, e }) => {
                    const on = creatures.includes(occ.id)
                    const full = !on && left <= 0
                    return (
                      <label key={occ.id} className={[styles.allocItem, on ? styles.allocOn : '', full ? styles.allocOff : ''].join(' ')}>
                        <input type="checkbox" checked={on} disabled={full} onChange={(ev) => setCreatures(ev.target.checked ? [...creatures, occ.id] : creatures.filter((id) => id !== occ.id))} />
                        <span>{e.emoji ?? ''} {e.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            <p className={formStyles.hint}>{followersWord(dotsChosen)} ginie, {Math.ceil(dotsChosen / 2)} nawraca się{avatar ? `, awatar traci ${avatar}` : ''}{creatures.length ? `, istot ubywa ${creatures.length}` : ''}.</p>
          </div>
        )}
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
