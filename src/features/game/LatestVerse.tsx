import { useMemo, useState } from 'react'
import { buildChapters, latestVerse } from '@/data/chronicle'
import { useGameStore, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal } from '@/components/ui/Primitives'
import { PalettePage } from '@/features/palette/PalettePage'
import styles from './game.module.css'

/** The last verse of the book, carved above the altar; beside it the book itself and the Palette the table agreed on. */
export function LatestVerse({ chronicleOpen, onChronicle }: { chronicleOpen: boolean; onChronicle: () => void }) {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const [palette, setPalette] = useState(false)

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
      <span className={styles.quoteBtns}>
        <StoneButton variant="clay" size="sm" pressed={chronicleOpen} onClick={onChronicle} className={styles.quoteBtn}>
          <BookIcon /> Święta Księga
        </StoneButton>
        <StoneButton size="sm" onClick={() => setPalette(true)} className={styles.quoteBtn} title="Paleta: co w tym świecie jest na Tak, za Zasłoną i na Nie.">
          <PaletteIcon /> Paleta
        </StoneButton>
      </span>
      {palette && (
        <Modal title="Paleta świata" onClose={() => setPalette(false)} wide material="basalt">
          <PalettePage embedded />
        </Modal>
      )}
    </div>
  )
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v16H5.5A2.5 2.5 0 0 0 3 21z" />
      <path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H12v16h6.5a2.5 2.5 0 0 1 2.5 2z" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="9.5" y="4" width="5" height="16" rx="1" />
      <rect x="16" y="4" width="5" height="16" rx="1" />
    </svg>
  )
}
