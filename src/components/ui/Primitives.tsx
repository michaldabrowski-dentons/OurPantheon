import { useEffect, useState, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import styles from './Primitives.module.css'

// ---------- MarblePanel ----------
type Material = 'marble' | 'sandstone' | 'parchment' | 'clay-tablet' | 'basalt' | 'plaster'

export function MarblePanel({
  material = 'marble',
  tight,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { material?: Material; tight?: boolean; children?: ReactNode }) {
  return (
    <div className={[material, 'emerge-from-dark', styles.panel, tight ? styles.tight : '', className ?? ''].join(' ')} {...rest}>
      {children}
    </div>
  )
}

// ---------- EngravedTitle ----------
export function EngravedTitle({
  children,
  as: Tag = 'h2',
  align = 'center',
  dark,
  className,
}: {
  children: ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'h4'
  align?: 'center' | 'left'
  dark?: boolean
  className?: string
}) {
  return (
    <Tag className={[styles.title, align === 'left' ? styles.left : '', dark ? 'engraved-dark' : 'engraved', className ?? ''].join(' ')}>
      <span>{children}</span>
    </Tag>
  )
}

// ---------- FrescoFrame ----------
export function FrescoFrame({
  src,
  alt,
  size = 72,
  round,
  aura,
  className,
  style,
}: {
  src: string
  alt: string
  size?: number | string
  round?: boolean
  aura?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      className={[styles.fresco, round ? styles.round : '', aura ? styles.aura : '', className ?? ''].join(' ')}
      style={{ width: size, height: size, ...style }}
    >
      <img src={src} alt={alt} />
    </span>
  )
}

// ---------- TextField ----------
export function TextField({
  label,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <input id={id} className={styles.input} {...rest} />
    </label>
  )
}

export function TextArea({
  label,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <textarea id={id} className={styles.input} {...rest} />
    </label>
  )
}

export const inputClass = styles.input
export const labelClass = styles.label
export const fieldClass = styles.field

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  wide,
  material = 'marble',
}: {
  title: ReactNode
  onClose?: () => void
  children: ReactNode
  wide?: boolean
  material?: Material
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={['veil-in', styles.backdrop].join(' ')} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={[material, 'emerge-from-dark', styles.dialog, wide ? styles.wide : ''].join(' ')} role="dialog" aria-modal="true">
        <div className={styles.dialogHead}>
          <h3 className="engraved">{title}</h3>
          {onClose && (
            <button className={styles.close} onClick={onClose} aria-label="Zamknij">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- ConfirmDialog ----------
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Wróć',
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: ReactNode
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className={['veil-in', styles.backdrop, styles.backdropTop].join(' ')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={['marble', 'emerge-from-dark', styles.dialog, styles.confirm].join(' ')} role="alertdialog" aria-modal="true">
        <h3 className="engraved">{title}</h3>
        <div className={styles.confirmBody}>{children}</div>
        <div className={styles.confirmFoot}>
          <button
            type="button"
            className={[styles.confirmBtn, danger ? styles.confirmDanger : styles.confirmGold].join(' ')}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className={[styles.confirmBtn, styles.confirmQuiet].join(' ')} disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Toggle: a gold switch set into the marble ----------
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={[styles.toggle, checked ? styles.toggleOn : '', disabled ? styles.toggleDisabled : ''].join(' ')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.toggleTrack} aria-hidden>
        <span className={styles.toggleKnob} />
      </span>
      <span className={styles.toggleText}>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

// ---------- Dice ----------
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function Die({ value, rolling }: { value: number; rolling?: boolean }) {
  const on = PIPS[value] ?? []
  return (
    <span className={[styles.die, rolling ? styles.rolling : ''].join(' ')} aria-label={`kość: ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={[styles.pip, on.includes(i) ? styles.on : ''].join(' ')} />
      ))}
    </span>
  )
}

export function Dice2d6({ d1, d2, showTotal = true, animateKey }: { d1: number; d2: number; showTotal?: boolean; animateKey?: string | number }) {
  const [rolling, setRolling] = useState(false)
  useEffect(() => {
    if (animateKey === undefined) return
    setRolling(true)
    const t = setTimeout(() => setRolling(false), 600)
    return () => clearTimeout(t)
  }, [animateKey])
  return (
    <span className={styles.dice}>
      <Die value={d1} rolling={rolling} />
      <Die value={d2} rolling={rolling} />
      {showTotal && <span className={[styles.diceTotal, 'engraved'].join(' ')}>{d1 + d2}</span>}
    </span>
  )
}

// ---------- Tag ----------
export function Tag({ children, tone }: { children: ReactNode; tone?: 'flaw' | 'gold' | 'lapis' }) {
  return <span className={[styles.tag, tone ? styles[tone] : ''].join(' ')}>{children}</span>
}

// ---------- Notice ----------
export function Notice({ children, tone }: { children: ReactNode; tone?: 'error' | 'ok' }) {
  return <div className={[styles.notice, tone ? styles[tone] : ''].join(' ')}>{children}</div>
}
