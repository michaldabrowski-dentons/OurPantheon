import styles from './EmojiPicker.module.css'

/** A grid of signs; the ones already worn in this game are greyed out. */
export function EmojiPicker({ label, options, used, value, onChange }: { label: string; options: string[]; used: Set<string>; value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.label}>
        {label}
        {value && <span className={styles.chosen}> wybrano {value}</span>}
      </span>
      <div className={styles.grid} role="listbox" aria-label={label}>
        {options.map((e) => {
          const taken = used.has(e) && e !== value
          const on = e === value
          return (
            <button
              key={e}
              type="button"
              role="option"
              aria-selected={on}
              className={[styles.cell, on ? styles.on : '', taken ? styles.taken : ''].join(' ')}
              disabled={taken}
              title={taken ? 'Ten znak już ktoś nosi.' : e}
              onClick={() => onChange(on ? '' : e)}
            >
              {e}
            </button>
          )
        })}
      </div>
    </div>
  )
}
