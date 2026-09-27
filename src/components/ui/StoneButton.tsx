import { forwardRef, type ButtonHTMLAttributes } from 'react'
import styles from './StoneButton.module.css'

type Variant = 'stone' | 'gold' | 'lapis' | 'clay' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface StoneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  aura?: boolean
  pressed?: boolean
}

export const StoneButton = forwardRef<HTMLButtonElement, StoneButtonProps>(function StoneButton(
  { variant = 'stone', size = 'md', block, aura, pressed, className, type = 'button', ...rest },
  ref,
) {
  const cls = [
    styles.btn,
    variant !== 'stone' ? styles[variant] : '',
    size !== 'md' ? styles[size] : '',
    block ? styles.block : '',
    aura ? styles.aura : '',
    pressed ? styles.pressed : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return <button ref={ref} type={type} className={cls} {...rest} />
})
