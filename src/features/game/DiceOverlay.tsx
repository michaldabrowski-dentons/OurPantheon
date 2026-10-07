import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionLog } from '@/lib/types'
import { isWatchedRoll, rollOf } from '@/data/dice'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { Die } from '@/components/ui/Primitives'
import styles from './game.module.css'

const ROLLING_MS = 1600
const LINGER_MS = 5000
/** a cataclysm's die steps aside quickly: the fire is about to fall on the map */
const LINGER_WRATH_MS = 1300

/**
 * Every throw at the table, for everyone: the dice tumble for a moment before they settle, so the
 * result is a moment and not a number. Opens on a new roll row (whoever threw), closes by itself.
 */
export function DiceOverlay() {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
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
  }, [latest])

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

  useEffect(() => {
    if (!row || !settled) return
    const t = window.setTimeout(() => setRow(null), row.action_key === 'catastrophe' ? LINGER_WRATH_MS : LINGER_MS)
    return () => window.clearTimeout(t)
  }, [row, settled])

  if (!row) return null
  const roll = rollOf(row)
  if (!roll) return null
  const who = playerLabel(players.find((p) => p.id === row.player_id), profiles)

  return (
    <div className={styles.diceVeil} onClick={() => settled && setRow(null)} role="status" aria-live="assertive">
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
          {settled && roll.verdict && <small>{roll.verdict}</small>}
        </span>
        {settled && (
          <button type="button" className={styles.diceClose} onClick={() => setRow(null)}>
            Zamknij
          </button>
        )}
      </div>
    </div>
  )
}
