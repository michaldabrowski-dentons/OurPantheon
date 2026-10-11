import { useEffect } from 'react'
import type { AttrKey } from '@/lib/types'
import { TIER_LABEL, type Tier } from '@/data/actions'
import { ATTRIBUTE_BY_KEY } from '@/data/pantheon'
import { Die } from '@/components/ui/Primitives'
import { StoneButton } from '@/components/ui/StoneButton'
import { useDiceTumble } from '../useDiceTumble'
import styles from './AttributeTiles.module.css'

/** how long the settled dice stay before the window closes by itself */
const LINGER_MS = 2600

/**
 * The dice falling inside the word's own window: they tumble, settle, and the verdict is read.
 * The window closes by itself a moment later, or at once on the button; only then does the
 * world show what the word did.
 */
export function RollReveal({
  id,
  d1,
  d2,
  total,
  modifier,
  attr,
  bonus = 0,
  tier,
  verdict,
  consequence,
  what,
  onDone,
  doneLabel = 'Dalej',
  autoClose = true,
}: {
  /** restarts the tumble when it changes */
  id: string
  d1: number
  d2: number
  total: number
  /** the attribute's score (without the prophecy) */
  modifier: number
  attr?: AttrKey | string | null
  /** a fulfilled prophecy added on top */
  bonus?: number
  /** the PbtA band; contests pass none and bring their own verdict */
  tier?: Tier | null
  /** overrides the band's name (contests: "Czekamy na obronę") */
  verdict?: string
  /** one line on what the band did */
  consequence?: string
  /** what is thrown, e.g. "Kataklizm, 2k6 + Gniew" */
  what?: string
  onDone: () => void
  doneLabel?: string
  autoClose?: boolean
}) {
  const { faces, settled } = useDiceTumble(id)
  useEffect(() => {
    if (!settled || !autoClose) return
    const t = window.setTimeout(onDone, LINGER_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, autoClose, id])

  const attrName = attr ? ATTRIBUTE_BY_KEY[attr as AttrKey]?.name ?? '' : ''
  const sign = (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`
  const title = verdict ?? (tier ? TIER_LABEL[tier] : '')
  const tone = tier === 'strong' ? styles.verdictStrong : tier === 'mixed' ? styles.verdictMixed : tier === 'weak' ? styles.verdictWeak : styles.verdictMixed

  return (
    <div className={styles.reveal} role="status" aria-live="assertive">
      {what && <span className={styles.revealWhat}>{what}</span>}
      <div className={styles.revealDice}>
        <Die value={settled ? d1 : faces[0]} rolling={!settled} />
        <Die value={settled ? d2 : faces[1]} rolling={!settled} />
      </div>
      <span className={[styles.revealTotal, settled ? styles.revealTotalOn : ''].join(' ')}>
        <b className="engraved">{settled ? total : '?'}</b>
        <small>
          {settled ? `${d1} + ${d2} ${sign(modifier)}${attrName ? ` (${attrName})` : ''}${bonus ? ` + ${bonus} (proroctwo)` : ''} = ${total}` : 'kości lecą…'}
        </small>
      </span>
      <span className={[styles.verdict, tone, settled ? styles.verdictOn : ''].join(' ')}>{title}</span>
      {consequence && <p className={[styles.consequence, settled ? styles.consequenceOn : ''].join(' ')}>{consequence}</p>}
      <div className={styles.revealFooter}>
        <StoneButton variant="gold" size="lg" disabled={!settled} onClick={onDone}>
          {doneLabel}
        </StoneButton>
      </div>
    </div>
  )
}
