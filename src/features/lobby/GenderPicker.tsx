import type { GodGender } from '@/lib/types'
import { inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'

/** How the Chronicle speaks of this god: "stworzył", "stworzyła" or "stworzyło". */
export function GenderPicker({ value, onChange, name }: { value: GodGender; onChange: (g: GodGender) => void; name?: string }) {
  const who = name?.trim() || 'bóstwo'
  const sample = value === 'm' ? `I stworzył ${who} istoty.` : value === 'f' ? `I stworzyła ${who} istoty.` : `I stworzyło ${who} istoty.`
  return (
    <label className={fieldClass}>
      <span className={labelClass}>Jak mówi o nim Kronika</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as GodGender)}>
        <option value="m">bóg (stworzył)</option>
        <option value="f">bogini (stworzyła)</option>
        <option value="n">bóstwo (stworzyło)</option>
      </select>
      <small style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>{sample}</small>
    </label>
  )
}
