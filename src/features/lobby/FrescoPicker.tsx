import { FRESCOES } from '@/data/frescoes'
import { FrescoFrame } from '@/components/ui/Primitives'
import styles from './lobby.module.css'

export function FrescoPicker({ value, onChange, size = 64 }: { value: string; onChange: (key: string) => void; size?: number }) {
  return (
    <div className={styles.frescoGrid} role="radiogroup" aria-label="Fresk bóstwa">
      {FRESCOES.map((f) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={value === f.key}
          className={[styles.frescoPick, value === f.key ? styles.selected : ''].join(' ')}
          onClick={() => onChange(f.key)}
        >
          <FrescoFrame src={f.file} alt={f.name} size={size} aura={value === f.key} />
          <small>{f.name}</small>
        </button>
      ))}
    </div>
  )
}
