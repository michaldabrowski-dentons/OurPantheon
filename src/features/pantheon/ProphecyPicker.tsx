import type { Prophecy } from '@/lib/types'
import styles from './pantheon.module.css'

/** "Wypełnij Proroctwo": none by default; a chosen one adds its hold to the roll and is spent. */
export function ProphecyPicker({ prophecies, value, onChange, disabled }: { prophecies: Prophecy[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const active = prophecies.filter((p) => p.status === 'active')
  if (active.length === 0) return null
  return (
    <div className={styles.prophecyPick}>
      <span className={styles.attrPickLabel}>Wypełnij proroctwo (dodaje się do rzutu, raz)</span>
      <label className={[styles.prophecyRow, value === null ? styles.prophecyOn : ''].join(' ')}>
        <input type="radio" name="prophecy" checked={value === null} disabled={disabled} onChange={() => onChange(null)} />
        <span>Bez proroctwa</span>
      </label>
      {active.map((p) => (
        <label key={p.id} className={[styles.prophecyRow, value === p.id ? styles.prophecyOn : ''].join(' ')}>
          <input type="radio" name="prophecy" checked={value === p.id} disabled={disabled} onChange={() => onChange(p.id)} />
          <span className={styles.prophecyText}>{p.text}</span>
          <b className={styles.prophecyHold}>+{p.hold}</b>
        </label>
      ))}
    </div>
  )
}
