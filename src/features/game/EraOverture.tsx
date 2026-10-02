import { useEffect, useState } from 'react'
import { ERA_NAMES, ERA_NUMERALS, ERA_TITLES, type Era } from '@/data/actions'
import { ERA_STORY } from '@/data/chronicle'
import { EraArt } from '@/data/eraArt'
import { StoneButton } from '@/components/ui/StoneButton'
import styles from './game.module.css'

const seenKey = (gameId: string) => `obogowie:era-seen:${gameId}`

function readSeen(gameId: string): number {
  try {
    return Number(localStorage.getItem(seenKey(gameId)) ?? 0) || 0
  } catch {
    return 0
  }
}

function writeSeen(gameId: string, era: number) {
  try {
    localStorage.setItem(seenKey(gameId), String(era))
  } catch {
    /* private mode: the overture simply plays again next time */
  }
}

/** Which Era still needs its overture on this device, if any. `forced` (dev only): an Era to replay, or 0 for none. */
export function useEraOverture(gameId: string, era: Era, forced: Era | 0 | null): [Era | null, () => void] {
  const [pending, setPending] = useState<Era | null>(() => (forced === 0 ? null : forced ?? (era > readSeen(gameId) ? era : null)))
  useEffect(() => {
    if (forced !== null) return
    if (era > readSeen(gameId)) setPending(era)
  }, [gameId, era, forced])
  return [
    pending,
    () => {
      if (pending && forced === null) writeSeen(gameId, pending)
      setPending(null)
    },
  ]
}

/**
 * The curtain that opens an Era: the void, a drawing of the age carved line by line in gold,
 * the numeral, the name, and one button. The first Era is the beginning of everything.
 */
export function EraOverture({ era, onEnter }: { era: Era; onEnter: () => void }) {
  return (
    <div className={styles.overture} role="dialog" aria-modal="true" aria-label={`${ERA_NAMES[era]}: ${ERA_TITLES[era]}`}>
      <div className={styles.overtureLight} aria-hidden />
      <div className={styles.overtureStage}>
        <EraArt era={era} className={styles.overtureArt} />
        <div className={styles.overtureNumeral} aria-hidden>
          {ERA_NUMERALS[era]}
        </div>
        <h2 className={['engraved-dark', 'marble-text', styles.overtureTitle].join(' ')}>{ERA_TITLES[era]}</h2>
        <p className={styles.overtureName}>{ERA_NAMES[era]}</p>
        <p className={styles.overtureStory}>{cap(ERA_STORY[era])}.</p>
        <div className={styles.overtureAction}>
          <StoneButton variant="gold" size="lg" aura onClick={onEnter}>
            {era === 1 ? 'Rozpocznij' : 'Wkrocz w Erę'}
          </StoneButton>
        </div>
      </div>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
