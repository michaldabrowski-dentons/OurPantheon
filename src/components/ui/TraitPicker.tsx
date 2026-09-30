import { useMemo, useState } from 'react'
import styles from './TraitPicker.module.css'

const collator = new Intl.Collator('pl')

export function TraitPicker({
  label,
  options,
  value,
  onChange,
  max,
  allowCustom = true,
  tone,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  allowCustom?: boolean
  tone?: 'flaw' | 'gold' | 'lapis'
}) {
  const [custom, setCustom] = useState('')
  const full = max !== undefined && value.length >= max
  // every list of things to choose from is read alphabetically
  const sorted = useMemo(() => [...options].sort((a, b) => collator.compare(a, b)), [options])

  function toggle(opt: string) {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt))
    else if (!full) onChange([...value, opt])
  }

  function addCustom() {
    const t = custom.trim()
    if (!t || value.includes(t) || full) return
    onChange([...value, t])
    setCustom('')
  }

  const extras = value.filter((v) => !options.includes(v))

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>
          {value.length}
          {max !== undefined ? ` / ${max}` : ''}
        </span>
      </div>
      <div className={styles.chips}>
        {sorted.map((opt) => {
          const on = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className={[styles.chip, on ? styles.on : '', tone ? styles[tone] : ''].join(' ')}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(opt)}
            >
              {opt}
            </button>
          )
        })}
        {extras.map((opt) => (
          <button key={opt} type="button" className={[styles.chip, styles.on, tone ? styles[tone] : ''].join(' ')} onClick={() => toggle(opt)}>
            {opt} ✕
          </button>
        ))}
      </div>
      {allowCustom && (
        <div className={styles.custom}>
          <input
            className={styles.customInput}
            placeholder="Własna…"
            value={custom}
            disabled={full}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
          />
          <button type="button" className={styles.customBtn} onClick={addCustom} disabled={full || !custom.trim()}>
            Dodaj
          </button>
        </div>
      )}
    </div>
  )
}
