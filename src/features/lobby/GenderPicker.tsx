import type { GodGender } from '@/lib/types'
import { labelClass, fieldClass } from '@/components/ui/Primitives'
import styles from './lobby.module.css'

const CHOICES: { value: GodGender; label: string; verb: string }[] = [
  { value: 'm', label: 'bóg', verb: 'stworzył' },
  { value: 'f', label: 'bogini', verb: 'stworzyła' },
  { value: 'n', label: 'bóstwo', verb: 'stworzyło' },
]

/** How the Chronicle speaks of this god: "stworzył", "stworzyła" or "stworzyło". Three carved signs. */
export function GenderPicker({ value, onChange, name }: { value: GodGender; onChange: (g: GodGender) => void; name?: string }) {
  const who = name?.trim() || 'bóstwo'
  const verb = CHOICES.find((c) => c.value === value)?.verb ?? 'stworzył'
  return (
    <div className={fieldClass}>
      <span className={labelClass}>Jak mówi o nim Święta Księga</span>
      <div className={styles.genderRow} role="radiogroup" aria-label="Rodzaj bóstwa">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={[styles.genderBtn, value === c.value ? styles.genderOn : ''].join(' ')}
            onClick={() => onChange(c.value)}
            title={`${c.label}: ${c.verb}`}
          >
            <GenderSign kind={c.value} />
            <small>{c.label}</small>
          </button>
        ))}
      </div>
      <small style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
        I {verb} {who} istoty.
      </small>
    </div>
  )
}

/** The astronomical sign of a god's gender: Mars, Venus, or the plain circle with a stem. */
export function GenderSign({ kind, size = 26, className }: { kind: GodGender; size?: number; className?: string }) {
  const p = { width: size, height: size, className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'm') {
    return (
      <svg {...p}>
        <circle cx="10" cy="14" r="6" />
        <path d="M14.5 9.5 21 3M15 3h6v6" />
      </svg>
    )
  }
  if (kind === 'f') {
    return (
      <svg {...p}>
        <circle cx="12" cy="8.5" r="5.5" />
        <path d="M12 14v8M8.5 18.5h7" />
      </svg>
    )
  }
  return (
    <svg {...p}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M12 14.5V22" />
    </svg>
  )
}
