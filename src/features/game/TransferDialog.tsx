import { useState } from 'react'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, inputClass, labelClass, fieldClass, Notice } from '@/components/ui/Primitives'

/** Przekazanie mocy: a word of the Proroctwa i Słowa kind, with no map and no verse. */
export function TransferDialog({
  onClose,
  max,
  targets,
  onSubmit,
}: {
  onClose: () => void
  max: number
  targets: { id: string; label: string }[]
  onSubmit: (to: string, amount: number) => Promise<void>
}) {
  const [to, setTo] = useState(targets[0]?.id ?? '')
  const [amount, setAmount] = useState(1)
  return (
    <Modal title="Przekazanie mocy" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p>Możesz swobodnie oddać swój Logos innemu bóstwu. Ustawcie wokół tego krótką scenę, jeśli chcecie.</p>
        {targets.length === 0 && <Notice>Nie ma komu przekazać mocy.</Notice>}
        <label className={fieldClass}>
          <span className={labelClass}>Odbiorca</span>
          <select className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>Ile Logos (masz {max})</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={max}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          />
        </label>
        <StoneButton variant="gold" disabled={!to || amount < 1 || amount > max} onClick={() => onSubmit(to, amount)}>
          Przekaż {amount} Logos
        </StoneButton>
      </div>
    </Modal>
  )
}
