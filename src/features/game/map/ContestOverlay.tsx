import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { AttrKey, Contest } from '@/lib/types'
import { ATTRIBUTES, scoresFor } from '@/data/pantheon'
import { AttrPicker } from '@/features/pantheon/AttrPicker'
import { followersWord } from '@/data/cities'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, Dice2d6 } from '@/components/ui/Primitives'
import { useWorld } from './useWorld'
import styles from './map.module.css'

const CONVERT_ATTRS: AttrKey[] = ['majesty', 'whisper']

/**
 * The defender's window: a god wants my followers. I choose how I stand against it and roll.
 * It cannot be closed while the contest waits; after the roll it shows what happened.
 */
export function ContestOverlay() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const pending = useGameStore(selectPendingContest)
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const world = useWorld()
  const [attr, setAttr] = useState<AttrKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Contest | null>(null)

  const contest = done ?? pending
  if (!me || !contest || contest.defender_id !== me.id) return null
  const att = players.find((p) => p.id === contest.attacker_id)
  const target = entities.find((e) => e.id === contest.target_city_id)
  const myDots = world.dotsOf(contest.target_city_id, me.id)
  const scores = scoresFor(me.domain_key, me.attr_primary, me.attr_bonus)
  const war = contest.kind === 'holy_war'
  const options = war ? ATTRIBUTES.map((a) => a.key) : CONVERT_ATTRS

  async function roll() {
    if (!attr) return
    setBusy(true)
    setError(null)
    try {
      const c = await rpc<Contest>('answer_contest', { p_contest_id: contest!.id, p_attr: attr })
      setDone(c)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = war ? 'Święta Wojna: broń miasta' : 'Nawracanie: broń wyznawców'
  const o = (done?.outcome ?? {}) as Record<string, unknown>

  return (
    <Modal title={title} onClose={done ? () => setDone(null) : undefined} wide>
      <div className={styles.contestBody}>
        {!done ? (
          <>
            <p>
              <b>{godLabel(att)}</b> {war ? `wysyła armię ${followersWord(contest.army ?? 0)} na miasto` : 'nawraca twoich wyznawców w mieście'} <b>{target?.name ?? 'bez imienia'}</b>. Masz tam {followersWord(myDots)}.
              {war ? ' Do rzutu doliczasz ich liczbę: to twoja obronna populacja.' : ''}
            </p>
            <p className={styles.verdict}>
              {war ? 'Wybierz, czym bronisz: Łaska to tarcze i mury, Gniew to wyjście przed mury. Potem rzuć 2k6.' : 'Wybierz Majestat albo Podszept i rzuć 2k6. Wygrana atakującego o 3 lub więcej zabiera dwóch wyznawców, o 1 lub 2 jednego.'}
            </p>
            <AttrPicker label="Czym bronisz" options={options} value={attr} scores={scores} onChange={setAttr} disabled={busy} />
            {error && <Notice tone="error">{error}</Notice>}
            <div className={styles.footer}>
              <StoneButton variant="gold" size="lg" disabled={!attr || busy} onClick={roll}>
                {busy ? 'Kości lecą…' : `Rzuć 2k6${attr ? ` + ${ATTRIBUTES.find((x) => x.key === attr)!.name}` : ''}${war ? ` + ${myDots}` : ''}`}
              </StoneButton>
            </div>
          </>
        ) : (
          <>
            <ContestSides contest={done} attackerName={godLabel(att)} defenderName={godLabel(me)} />
            <p className={styles.verdict}>{verdict(done, godLabel(att), godLabel(me), Number(o.converted ?? 0))}</p>
            <div className={styles.footer}>
              <StoneButton variant="gold" onClick={() => setDone(null)}>Zamknij</StoneButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/** both rolls side by side */
export function ContestSides({ contest, attackerName, defenderName }: { contest: Contest; attackerName: string; defenderName: string }) {
  const attName = ATTRIBUTES.find((a) => a.key === contest.attacker_attr)?.name ?? ''
  const defName = ATTRIBUTES.find((a) => a.key === contest.defender_attr)?.name ?? ''
  return (
    <div className={styles.sides}>
      <div className={styles.side}>
        <b>{attackerName}</b>
        <Dice2d6 d1={contest.attacker_d1} d2={contest.attacker_d2} showTotal={false} animateKey={`${contest.id}-a`} />
        <span className={styles.sideTotal}>{contest.attacker_total}</span>
        <span className={styles.sideMod}>{contest.attacker_d1} + {contest.attacker_d2} {contest.attacker_mod < 0 ? '-' : '+'} {Math.abs(contest.attacker_mod)} ({attName}{contest.kind === 'holy_war' ? ' i armia' : ''})</span>
      </div>
      <span className={styles.versus}>PRZECIW</span>
      <div className={styles.side}>
        <b>{defenderName}</b>
        {contest.defender_d1 !== null && contest.defender_d2 !== null && <Dice2d6 d1={contest.defender_d1} d2={contest.defender_d2} showTotal={false} animateKey={`${contest.id}-d`} />}
        <span className={styles.sideTotal}>{contest.defender_total ?? '?'}</span>
        <span className={styles.sideMod}>
          {contest.defender_d1 ?? '?'} + {contest.defender_d2 ?? '?'} {(contest.defender_mod ?? 0) < 0 ? '-' : '+'} {Math.abs(contest.defender_mod ?? 0)} ({defName}{contest.kind === 'holy_war' ? ' i obrońcy' : ''})
        </span>
      </div>
    </div>
  )
}

/** one plain sentence on what the dice decided */
export function verdict(c: Contest, attacker: string, defender: string, converted: number): string {
  const diff = c.attacker_total - (c.defender_total ?? 0)
  const o = (c.outcome ?? {}) as Record<string, unknown>
  if (c.kind === 'convert') {
    if (converted >= 2) return `${attacker} wygrywa o ${diff}: dwóch wyznawców ${defender} zwraca się ku ${attacker}.`
    if (converted === 1) return `${attacker} wygrywa o ${diff}: jeden wyznawca ${defender} zwraca się ku ${attacker}.`
    return diff === 0 ? 'Remis: nikt nie zmienia wiary.' : `${defender} broni swoich: nikt nie zmienia wiary.`
  }
  const removed = Number(o.removed ?? 0)
  const conv = Number(o.converted ?? 0)
  const returned = Number(o.returned ?? 0)
  const attLost = Number(o.attacker_lost ?? 0)
  if (diff >= 3) return `Pełne zwycięstwo ${attacker} (o ${diff}): ${defender} traci ${followersWord(removed)}, ${conv} z nich przechodzi na stronę ${attacker}. Armia wraca cała (${returned}).`
  if (diff >= 1) return `Pyrrusowe zwycięstwo ${attacker} (o ${diff}): ${defender} traci ${followersWord(removed)}, ${conv} przechodzi na stronę ${attacker}, lecz armia traci ${attLost}. Wraca ${returned}.`
  if (diff === 0) return `Remis: obie strony tracą po jednej kropce. Armia wraca do domu (${returned}).`
  if (diff >= -2) return `${defender} odpiera atak (o ${-diff}): z armii wraca tylko jeden, obrońca traci jednego.`
  return `Pełne zwycięstwo ${defender} (o ${-diff}): cała armia ginie, miasto nietknięte.`
}
