import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { AttrKey, Contest } from '@/lib/types'
import { ATTRIBUTES, scoresFor } from '@/data/pantheon'
import { ACTION_BY_KEY, rollOptions } from '@/data/actions'
import { ProphecyPicker } from '@/features/pantheon/ProphecyPicker'
import { followersWord } from '@/data/cities'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest, selectPropheciesOf } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Notice, Dice2d6 } from '@/components/ui/Primitives'
import { useDiceGate, useDiceWait } from '../diceGate'
import { AttributeTiles } from '../actions/AttributeTiles'
import { RollReveal } from '../actions/RollReveal'
import { useWorld } from './useWorld'
import styles from './map.module.css'

export const KIND_TITLE: Record<Contest['kind'], string> = { convert: 'Nawracanie', holy_war: 'Święta Wojna', avatar_duel: 'Walka Awatarów' }

/**
 * The defender's window: a god wants my followers or my avatar's blood. Two tiles say how I stand
 * against it; a click throws. It cannot be closed while the contest waits; after the roll the dice
 * fall right here and the verdict is read. It waits for the dice window once, for the attacker's throw.
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
  const claim = useDiceGate((s) => s.claim)
  const unclaim = useDiceGate((s) => s.unclaim)
  const dismiss = useDiceGate((s) => s.dismiss)
  const [attr, setAttr] = useState<AttrKey | null>(null)
  const [prophecyId, setProphecyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Contest | null>(null)
  /** the dice have been read: the two rolls side by side */
  const [read, setRead] = useState(false)

  const contest = done ?? pending
  const mine = !!me && !!contest && contest.defender_id === me.id
  const declaredRow = mine && !done ? log.find((l) => l.action_key === 'contest_declared' && !!l.outcome && !Array.isArray(l.outcome) && (l.outcome as Record<string, unknown>).contest_id === contest!.id) : undefined
  const waiting = useDiceWait(mine && !done ? declaredRow?.id : null)
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
  const action = ACTION_BY_KEY[contest.kind]
  const options = rollOptions(contest.kind, 'defence')
  const attAvatar = contest.attacker_avatar_id ? entities.find((e) => e.id === contest.attacker_avatar_id) : undefined
  const defAvatar = contest.defender_avatar_id ? entities.find((e) => e.id === contest.defender_avatar_id) : undefined
  const chosenHold = prophecies.find((p) => p.id === prophecyId)?.hold ?? 0
  /** what stands with me besides the attribute: my followers in the city and my avatar on the walls */
  const extra = war ? myDots + wallHp : 0

  async function roll(a: AttrKey) {
    setAttr(a)
    setBusy(true)
    setError(null)
    // my window shows this throw: the table's dice window keeps quiet for me
    claim()
    try {
      const c = await rpc<Contest>('answer_contest', { p_contest_id: contest!.id, p_attr: a, p_prophecy_id: prophecyId })
      setDone(c)
    } catch (err) {
      setError((err as Error).message)
      setAttr(null)
      unclaim()
    } finally {
      setBusy(false)
    }
  }

  function close() {
    if (done?.log_id) dismiss(done.log_id)
    unclaim()
    setDone(null)
    setRead(false)
    setAttr(null)
  }

  const title = action.defence?.title ? `${KIND_TITLE[contest.kind]}: ${action.defence.title.toLowerCase()}` : war ? 'Święta Wojna: broń miasta' : duel ? 'Walka Awatarów: broń awatara' : 'Nawracanie: broń wyznawców'
  const o = (done?.outcome ?? {}) as Record<string, unknown>

  return (
    <Modal title={title} onClose={done && read ? close : undefined} wide>
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
                ? 'Wygrana napastnika o 3+ to pełne zwycięstwo armii, o 1..2 pyrrusowe; remis kosztuje obie strony po jednym; twoja wygrana odpiera atak albo niszczy armię.'
                : duel
                  ? 'Wygrana napastnika o 3+ to dwie rany twojego awatara, o 1..2 po jednej ranie dla obu, remis po jednej, twoja wygrana rani napastnika.'
                  : 'Wygrana atakującego o 3 lub więcej zabiera dwóch wyznawców, o 1 lub 2 jednego. Remis i twoja wygrana nie zmieniają nic.'}
            </p>
            <ProphecyPicker prophecies={prophecies} value={prophecyId} onChange={setProphecyId} disabled={busy} />
            {error && <Notice tone="error">{error}</Notice>}
            {options && (
              <AttributeTiles
                options={options}
                scores={scores}
                bonus={chosenHold + extra}
                chosen={attr}
                disabled={busy}
                onChoose={roll}
                label={busy ? 'Kości lecą…' : `Czym bronisz? Klik rzuca 2k6${extra ? ` (w tym +${extra} za obrońców${wallHp ? ' i awatara' : ''})` : ''}`}
              />
            )}
          </>
        ) : !read ? (
          <RollReveal
            id={done.id}
            d1={done.defender_d1 ?? 0}
            d2={done.defender_d2 ?? 0}
            total={done.defender_total ?? 0}
            modifier={(done.defender_mod ?? 0) - chosenHold - extra}
            bonus={chosenHold}
            attr={done.defender_attr}
            verdict={verdictHead(done)}
            consequence={extra ? `Do rzutu doliczono +${extra}: ${war ? `${followersWord(myDots)} w mieście${wallHp ? ` i życie awatara (${wallHp})` : ''}` : ''}. Atakujący rzucił ${done.attacker_total}.` : `Atakujący rzucił ${done.attacker_total}.`}
            what={`${KIND_TITLE[done.kind]}: obrona, 2k6 + ${ATTRIBUTES.find((x) => x.key === done.defender_attr)?.name ?? ''}`}
            onDone={() => setRead(true)}
            doneLabel="Zobacz wynik"
            autoClose={false}
          />
        ) : (
          <>
            <ContestSides contest={done} attackerName={godLabel(att)} defenderName={godLabel(me)} />
            <p className={styles.verdict}>{verdict(done, godLabel(att), godLabel(me), Number(o.converted ?? 0))}</p>
            <div className={styles.footer}>
              <StoneButton variant="gold" onClick={close}>Zamknij</StoneButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/** the short head of the verdict: who won and by how much */
function verdictHead(c: Contest): string {
  const diff = c.attacker_total - (c.defender_total ?? 0)
  if (diff > 0) return `Atak wygrywa o ${diff}`
  if (diff === 0) return 'Remis'
  return `Obrona wygrywa o ${-diff}`
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
