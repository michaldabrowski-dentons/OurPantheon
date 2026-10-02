import { useEffect, useState } from 'react'
import { FRESCOES } from '@/data/frescoes'
import { FrescoFrame } from '@/components/ui/Primitives'
import styles from './lobby.module.css'

/** One fresco at a time, turned with the arrows (or the arrow keys once focused). */
export function FrescoPicker({ value, onChange, size = 120 }: { value: string; onChange: (key: string) => void; size?: number }) {
  const index = Math.max(0, FRESCOES.findIndex((f) => f.key === value))
  const fresco = FRESCOES[index]
  const [dir, setDir] = useState<'next' | 'prev' | null>(null)

  function step(delta: number) {
    const next = (index + delta + FRESCOES.length) % FRESCOES.length
    setDir(delta > 0 ? 'next' : 'prev')
    onChange(FRESCOES[next].key)
  }

  useEffect(() => {
    if (!dir) return
    const t = setTimeout(() => setDir(null), 260)
    return () => clearTimeout(t)
  }, [dir, value])

  return (
    <div
      className={styles.frescoCarousel}
      role="group"
      aria-label="Fresk bóstwa"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
      }}
    >
      <button type="button" className={styles.frescoArrow} onClick={() => step(-1)} aria-label="Poprzedni fresk">
        <Chevron flip />
      </button>
      <div className={styles.frescoStage}>
        <div key={fresco.key} className={[styles.frescoSlide, dir === 'next' ? styles.slideFromRight : dir === 'prev' ? styles.slideFromLeft : ''].join(' ')}>
          <FrescoFrame src={fresco.file} alt={fresco.name} size={size} aura />
        </div>
        <span className={styles.frescoName} aria-live="polite">
          {fresco.name}
          <small>
            {index + 1} / {FRESCOES.length}
          </small>
        </span>
      </div>
      <button type="button" className={styles.frescoArrow} onClick={() => step(1)} aria-label="Następny fresk">
        <Chevron />
      </button>
    </div>
  )
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}
