import { useMemo } from 'react'
import { buildChapters, latestVerse } from '@/data/chronicle'
import { useGameStore, godLabel } from '@/store/useGameStore'
import styles from './game.module.css'

/** The last verse of the book, carved above the map. */
export function LatestVerse() {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)

  const verse = useMemo(() => {
    const ctx = {
      god: (id: string | null) => {
        const p = players.find((x) => x.id === id)
        return { name: godLabel(p), gender: p?.god_gender ?? 'n' }
      },
      entity: (id: string | null) => (id ? entities.find((e) => e.id === id) : undefined),
    }
    const chapters = buildChapters(log, ctx)
    const last = latestVerse(chapters)
    if (last) return last
    const prologue = log.filter((l) => l.action_key === 'prologue').map((l) => l.summary)
    return prologue.length ? { id: 'prologue', text: prologue[prologue.length - 1] } : null
  }, [log, players, entities])

  return (
    <div className={styles.quoteBand}>
      <p key={verse?.id ?? 'none'} className={['emerge-from-dark', styles.quote].join(' ')}>
        {verse ? verse.text : 'Święta Księga czeka na pierwsze Słowo.'}
      </p>
    </div>
  )
}
