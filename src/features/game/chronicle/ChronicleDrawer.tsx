import { useEffect, useRef } from 'react'
import { buildChapters, chapterTitle, ERA_STORY } from '@/data/chronicle'
import type { Era } from '@/data/actions'
import { useGameStore, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import styles from '../game.module.css'

export function ChronicleDrawer({ onClose }: { onClose: () => void }) {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length])

  const ctx = {
    god: (id: string | null) => {
      const p = players.find((x) => x.id === id)
      return { name: godLabel(p), gender: p?.god_gender ?? 'n' }
    },
    entity: (id: string | null) => (id ? entities.find((e) => e.id === id) : undefined),
  }

  // The Prologue is one story; every round after it is a chapter whose verses are turns.
  const prologue = log.filter((l) => l.action_key === 'prologue').map((l) => l.summary).join(' ')
  const chapters = buildChapters(log, ctx)

  return (
    <aside className={['marble', 'emerge-from-dark', styles.drawer].join(' ')} aria-label="Święta Księga">
      <div className={styles.drawerHead}>
        <h3 className="engraved">Święta Księga</h3>
        <StoneButton size="sm" onClick={onClose}>Zamknij</StoneButton>
      </div>
      <div className={styles.book}>
        {log.length === 0 && <p className={styles.bookEmpty}>Nic jeszcze nie zapisano.</p>}
        {prologue && (
          <section className={styles.chapter}>
            <h4 className={styles.chapterTitle}>Prolog</h4>
            <p className={styles.verse}>{prologue}</p>
          </section>
        )}
        {chapters.map((ch, i) => (
          <section key={`${ch.era}-${ch.round}`} className={styles.chapter}>
            <h4 className={styles.chapterTitle}>{chapterTitle(ch.era, ch.round)}</h4>
            {/* the first chapter of an Era says what the Era is for */}
            {(i === 0 || chapters[i - 1].era !== ch.era) && <div className={styles.chapterTheme}>{ERA_STORY[ch.era as Era]}</div>}
            {ch.verses.map((v, i) => (
              <p key={v.id} className={styles.verse}>
                <sup className={styles.verseNum}>{i + 1}</sup>
                {v.text}
              </p>
            ))}
          </section>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  )
}
