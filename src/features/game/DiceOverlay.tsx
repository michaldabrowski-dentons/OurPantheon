import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionLog } from '@/lib/types'
import { isWatchedRoll, rollOf } from '@/data/dice'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { Die } from '@/components/ui/Primitives'
import { useDiceGate } from './diceGate'
import styles from './game.module.css'

const ROLLING_MS = 1600

/** rows after which a window with the outcome and its decisions follows */
const RESULT_FOLLOWS = new Set(['convert', 'holy_war', 'avatar_duel', 'develop_civilization', 'catastrophe', 'create_creature'])

/**
 * Every throw at the table, for everyone: the dice tumble for a moment before they settle, so the
 * result is a moment and not a number. Opens on a new roll row (whoever threw) and stays until the
 * table clicks on; the windows with the consequences wait for that click.
 */
export function DiceOverlay() {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const show = useDiceGate((s) => s.show)
  const dismiss = useDiceGate((s) => s.dismiss)
  const lastSeen = useRef<string | null | undefined>(undefined)
  const [row, setRow] = useState<ActionLog | null>(null)
  const [settled, setSettled] = useState(false)
  const [faces, setFaces] = useState<[number, number]>([3, 4])

  const latest = useMemo(() => [...log].reverse().find(isWatchedRoll) ?? null, [log])

  useEffect(() => {
    // the rolls found on opening the game are old news
    if (lastSeen.current === undefined) {
      lastSeen.current = latest?.id ?? null
      return
    }
    if (!latest || latest.id === lastSeen.current) return
    lastSeen.current = latest.id
    if (Date.now() - new Date(latest.created_at).getTime() > 20000) return
    setRow(latest)
    setSettled(false)
    show(latest.id)
  }, [latest, show])

  // the tumble: random faces until the dice settle
  useEffect(() => {
    if (!row || settled) return
    const tick = window.setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 90)
    const stop = window.setTimeout(() => {
      window.clearInterval(tick)
      setSettled(true)
    }, ROLLING_MS)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(stop)
    }
  }, [row, settled])

  if (!row) return null
  const roll = rollOf(row)
  if (!roll) return null
  const who = playerLabel(players.find((p) => p.id === row.player_id), profiles)
  const close = () => {
    dismiss(row.id)
    setRow(null)
  }

  return (
    <div className={styles.diceVeil} role="dialog" aria-label="Rzut kośćmi" aria-live="assertive">
      <div className={['basalt', 'emerge-from-dark', styles.diceCard].join(' ')} key={row.id}>
        <span className={styles.diceWho}>{who} rzuca kośćmi</span>
        <span className={styles.diceWhat}>{roll.label}</span>
        <div className={styles.diceStage}>
          {roll.kind === 'd6' ? (
            <Die value={settled ? roll.d1 : faces[0]} rolling={!settled} />
          ) : (
            <>
              <Die value={settled ? roll.d1 : faces[0]} rolling={!settled} />
              <Die value={settled ? roll.d2 : faces[1]} rolling={!settled} />
            </>
          )}
        </div>
        <span className={[styles.diceResult, settled ? styles.diceResultOn : ''].join(' ')}>
          <b className="engraved-dark marble-text">{settled ? roll.total : '?'}</b>
          {settled && roll.sides && (
            <span className={styles.diceSides}>
              <span>{roll.sides.attacker}</span>
              <span>{roll.sides.defender}</span>
            </span>
          )}
          {settled && roll.verdict && <small>{roll.verdict}</small>}
        </span>
        <button type="button" className={[styles.diceClose, settled ? styles.diceCloseOn : ''].join(' ')} disabled={!settled} onClick={close}>
          {RESULT_FOLLOWS.has(row.action_key) ? 'Zobacz wynik' : 'Kontynuuj'}
        </button>
      </div>
    </div>
  )
}
