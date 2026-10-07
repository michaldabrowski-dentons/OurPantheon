import type { AttrKey } from '@/lib/types'
import { ATTRIBUTE_BY_KEY, attributeArt, scoreText } from '@/data/pantheon'
import styles from './pantheon.module.css'

/** The same hands as on the god's sheet: pick the attribute a roll leans on. */
export function AttrPicker({ label, options, value, scores, onChange, disabled }: { label?: string; options: AttrKey[]; value: AttrKey | null; scores: Record<AttrKey, number>; onChange: (v: AttrKey) => void; disabled?: boolean }) {
  return (
    <div className={styles.attrPick}>
      {label && <span className={styles.attrPickLabel}>{label}</span>}
      <div className={styles.attrPickGrid} role="radiogroup" aria-label={label}>
        {options.map((k) => {
          const a = ATTRIBUTE_BY_KEY[k]
          const on = value === k
          return (
            <button key={k} type="button" role="radio" aria-checked={on} className={[styles.attrPickBtn, on ? styles.attrPickOn : ''].join(' ')} onClick={() => onChange(k)} disabled={disabled}>
              <img src={attributeArt(k)} alt="" />
              <span className={styles.attrPickNum}>{scoreText(scores[k])}</span>
              <b>{a.name}</b>
            </button>
          )
        })}
      </div>
    </div>
  )
}
