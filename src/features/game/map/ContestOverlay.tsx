import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { AttrKey, Contest } from '@/lib/types'
import { ATTRIBUTES, scoresFor } from '@/data/pantheon'
import { AttrPicker } from '@/features/pantheon/AttrPicker'
import { ProphecyPicker } from '@/features/pantheon/ProphecyPicker'
import { followersWord } from '@/data/cities'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest, selectPropheciesOf } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, Dice2d6 } from '@/components/ui/Primitives'
import { useDiceWait } from '../diceGate'
import { useWorld } from './useWorld'
import styles from './map.module.css'

const CONVERT_ATTRS: AttrKey[] = ['majesty', 'whisper']
const DUEL_ATTRS: AttrKey[] = ['wrath', 'majesty', 'whisper']

export const KIND_TITLE: Record<Contest['kind'], string> = { convert: 'Nawracanie', holy_war: 'Święta Wojna', avatar_duel: 'Walka Awatarów' }

/**
 * The defender's window: a god wants my followers or my avatar's blood. I choose how I stand against
 * it and roll. It cannot be closed while the contest waits; after the roll it shows what happened.
 * It waits for the dice window twice: the attacker's throw first, then the throw of the defence.
 */
export function ContestOverlay() {
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const pending = useGameStore(selectPendingContest)
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const prophecies = useGameStore(selectPropheciesOf(me?.id))
  const world = useWorld()
  const [attr, setAttr] = useState<AttrKey | null>(null)
  const [prophecyId, setProphecyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Contest | null>(null)

  const contest = done ?? pending
  const mine = !!me && !!contest && contest.defender_id === me.id
  const declaredRow = mine && !done ? log.find((l) => l.action_key === 'contest_declared' && !!l.outcome && !Array.isArray(l.outcome) && (l.outcome as Record<string, unknown>).contest_id === contest!.id) : undefined
  const waitRow = done ? done.log_id : declaredRow?.id
  const waiting = useDiceWait(mine ? waitRow : null)
  if (!me || !contest || !mine || waiting) return null

  const att = players.find((p) => p.id === contest.attacker_id)
  const target = contest.target_city_id ? entities.find((e) => e.id === contest.target_city_id) : undefined
  const myDots = contest.target_city_id ? world.dotsOf(contest.target_city_id, me.id) : 0
  // my avatar standing in the attacked city fights with its life
  const targetCity = contest.target_city_id ? world.cityOf(contest.target_city_id) : undefined
  const wallAvatar = contest.kind === 'holy_war' && targetCity ? world.avatarsOf(me.id).find((a) => a.occupant && a.occupant.q === targetCity.q && a.occupant.r === targetCity.r)?.entity : undefined
  const wallHp = wallAvatar?.hp ?? 0
  const scores = scoresFor(me.domain_key, me.attr_primary, me.attr_bonus)
  const war = contest.kind === 'holy_war'
  const duel = contest.kind === 'avatar_duel'
  const options = war ? ATTRIBUTES.map((a) => a.key) : duel ? DUEL_ATTRS : CONVERT_ATTRS
  const attAvatar = contest.attacker_avatar_id ? entities.find((e) => e.id === contest.attacker_avatar_id) : undefined
  const defAvatar = contest.defender_avatar_id ? entities.find((e) => e.id === contest.defender_avatar_id) : undefined
  const chosenHold = prophecies.find((p) => p.id === prophecyId)?.hold ?? 0

  async function roll() {
    if (!attr) return
    setBusy(true)
    setError(null)
    try {
      const c = await rpc<Contest>('answer_contest', { p_contest_id: contest!.id, p_attr: attr, p_prophecy_id: prophecyId })
      setDone(c)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = war ? 'Święta Wojna: broń miasta' : duel ? 'Walka Awatarów: broń awatara' : 'Nawracanie: broń wyznawców'
  const o = (done?.outcome ?? {}) as Record<string, unknown>

  return (
    <Modal title={title} onClose={done ? () => setDone(null) : undefined} wide>
      <div className={styles.contestBody}>
        {!done ? (
          <>
            {duel ? (
              <p>
                <b>{godLabel(att)}</b> posyła awatara <b>{attAvatar?.emoji ?? ''} {attAvatar?.name ?? ''}</b> przeciw twojemu awatarowi <b>{defAvatar?.emoji ?? ''} {defAvatar?.name ?? ''}</b> (życie {defAvatar?.hp ?? 0} z {defAvatar?.max_hp ?? 3}).
              </p>
            ) : (
              <p>
                <b>{godLabel(att)}</b> {war ? `wysyła armię ${followersWord(contest.army ?? 0)} na miasto` : 'nawraca twoich wyznawców w mieście'} <b>{target?.name ?? 'bez imienia'}</b>. Masz tam {followersWord(myDots)}.
                {war ? ' Do rzutu doliczasz ich liczbę: to twoja obronna populacja.' : ''}
                {wallAvatar ? ` Na murach stoi twój awatar ${wallAvatar.emoji ?? ''} ${wallAvatar.name}: jego życie (${wallHp}) też dolicza się do rzutu.` : ''}
              </p>
            )}
            <p className={styles.verdict}>
              {war
                ? 'Wybierz, czym bronisz: Łaska to tarcze i mury, Gniew to wyjście przed mury. Potem rzuć 2k6.'
                : duel
                  ? 'Wybierz, czym walczysz: Gniew to siła, Majestat to boska aura, Podszept to skrytobójstwo. Wygrana napastnika o 3+ to dwie rany twojego awatara, o 1..2 po jednej ranie dla obu, remis po jednej, twoja wygrana rani napastnika.'
                  : 'Wybierz Majestat albo Podszept i rzuć 2k6. Wygrana atakującego o 3 lub więcej zabiera dwóch wyznawców, o 1 lub 2 jednego.'}
            </p>
            <AttrPicker label="Czym bronisz" options={options} value={attr} scores={scores} onChange={setAttr} disabled={busy} />
            <ProphecyPicker prophecies={prophecies} value={prophecyId} onChange={setProphecyId} disabled={busy} />
            {error && <Notice tone="error">{error}</Notice>}
            <div className={styles.footer}>
              <StoneButton variant="gold" size="lg" disabled={!attr || busy} onClick={roll}>
                {busy ? 'Kości lecą…' : `Rzuć 2k6${attr ? ` + ${ATTRIBUTES.find((x) => x.key === attr)!.name}` : ''}${war ? ` + ${myDots}` : ''}${wallHp ? ` + ${wallHp} (awatar)` : ''}${chosenHold ? ` + ${chosenHold}` : ''}`}
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
  const war = contest.kind === 'holy_war'
  return (
    <div className={styles.sides}>
      <div className={styles.side}>
        <b>{attackerName}</b>
        <Dice2d6 d1={contest.attacker_d1} d2={contest.attacker_d2} showTotal={false} animateKey={`${contest.id}-a`} />
        <span className={styles.sideTotal}>{contest.attacker_total}</span>
        <span className={styles.sideMod}>{contest.attacker_d1} + {contest.attacker_d2} {contest.attacker_mod < 0 ? '-' : '+'} {Math.abs(contest.attacker_mod)} ({attName}{war ? (contest.attacker_avatar_id ? ', armia i awatar' : ' i armia') : ''})</span>
      </div>
      <span className={styles.versus}>PRZECIW</span>
      <div className={styles.side}>
        <b>{defenderName}</b>
        {contest.defender_d1 !== null && contest.defender_d2 !== null && <Dice2d6 d1={contest.defender_d1} d2={contest.defender_d2} showTotal={false} animateKey={`${contest.id}-d`} />}
        <span className={styles.sideTotal}>{contest.defender_total ?? '?'}</span>
        <span className={styles.sideMod}>
          {contest.defender_d1 ?? '?'} + {contest.defender_d2 ?? '?'} {(contest.defender_mod ?? 0) < 0 ? '-' : '+'} {Math.abs(contest.defender_mod ?? 0)} ({defName}{war ? (contest.defender_avatar_id ? ', obrońcy i awatar' : ' i obrońcy') : ''})
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
  if (c.kind === 'avatar_duel') {
    const a = `${o.attacker_emoji ?? ''} ${o.attacker_avatar ?? 'awatar napastnika'}`.trim()
    const d = `${o.defender_emoji ?? ''} ${o.defender_avatar ?? 'awatar obrońcy'}`.trim()
    const aLoss = Number(o.attacker_loss ?? 0)
    const dLoss = Number(o.defender_loss ?? 0)
    const hp = (n: unknown) => `życie ${Number(n ?? 0)}`
    const fate = (dead: unknown, name: string, loss: number, left: unknown) => (dead ? `${name} ginie i znika z mapy` : loss > 0 ? `${name} traci ${loss === 1 ? 'jedno życie' : 'dwa życia'} (${hp(left)})` : `${name} bez szwanku`)
    const head = diff >= 3 ? `${attacker} dominuje (o ${diff})` : diff >= 1 ? `${attacker} wygrywa krwawo (o ${diff})` : diff === 0 ? 'Remis' : diff >= -2 ? `${defender} odpiera cios (o ${-diff})` : `${defender} miażdży napastnika (o ${-diff})`
    return `${head}: ${fate(o.defender_dead, d, dLoss, o.defender_hp)}, ${fate(o.attacker_dead, a, aLoss, o.attacker_hp)}.`
  }
  const removed = Number(o.removed ?? 0)
  const conv = Number(o.converted ?? 0)
  const returned = Number(o.returned ?? 0)
  const attLost = Number(o.attacker_lost ?? 0)
  const successes = Number(o.successes ?? 0)
  if (o.pending) {
    if (diff >= 3) return `Pełne zwycięstwo ${attacker} (o ${diff}): ${successes} ${successes === 1 ? 'sukces' : successes < 5 ? 'sukcesy' : 'sukcesów'} do rozdzielenia między wyznawców miasta, awatara obrońcy i istoty. Armia wraca cała (${returned}).`
    return `Pyrrusowe zwycięstwo ${attacker} (o ${diff}): ${successes} ${successes === 1 ? 'sukces' : successes < 5 ? 'sukcesy' : 'sukcesów'} do rozdzielenia, lecz armia traci ${attLost}. Wraca ${returned}.`
  }
  if (diff >= 3) return `Pełne zwycięstwo ${attacker} (o ${diff}): ${defender} traci ${followersWord(removed)}, ${conv} z nich przechodzi na stronę ${attacker}. Armia wraca cała (${returned}).`
  if (diff >= 1) return `Pyrrusowe zwycięstwo ${attacker} (o ${diff}): ${defender} traci ${followersWord(removed)}, ${conv} przechodzi na stronę ${attacker}, lecz armia traci ${attLost}. Wraca ${returned}.`
  if (diff === 0) return `Remis: obie strony tracą po jednym wyznawcy. Armia wraca do domu (${returned}).`
  if (diff >= -2) return `${defender} odpiera atak (o ${-diff}): z armii wraca tylko jeden, obrońca traci jednego.`
  return `Pełne zwycięstwo ${defender} (o ${-diff}): cała armia ginie, miasto nietknięte.`
}
