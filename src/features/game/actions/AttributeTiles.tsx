import { Fragment, type CSSProperties } from 'react'
import type { AttrKey } from '@/lib/types'
import type { RollOption } from '@/data/actions'
import { ATTRIBUTE_BY_KEY, attributeArt, scoreText } from '@/data/pantheon'
import styles from './AttributeTiles.module.css'

/**
 * The last step of a word: two marble tiles, one attribute each, with the way the word is done
 * through it and the god's modifier. A click pays and throws; the chosen tile glows, the other dims.
 */
export function AttributeTiles({
  options,
  scores,
  bonus = 0,
  chosen,
  disabled,
  onChoose,
  label,
  hint,
}: {
  options: [RollOption, RollOption]
  scores: Record<AttrKey, number>
  /** a fulfilled prophecy, added to both tiles */
  bonus?: number
  chosen?: AttrKey | null
  disabled?: boolean
  onChoose: (attr: AttrKey) => void
  label?: string
  hint?: string
}) {
  return (
    <div className={styles.tilesWrap}>
      {label && <span className={styles.tilesLabel}>{label}</span>}
      <div className={styles.tiles} role="group" aria-label={label ?? 'Wybór atrybutu'}>
        {options.map((o, i) => {
          const attr = ATTRIBUTE_BY_KEY[o.attr]
          const mod = (scores[o.attr] ?? 0) + bonus
          const on = chosen === o.attr
          const dim = !!chosen && !on
          return (
            <Fragment key={o.attr}>
              {i === 1 && (
                <span className={styles.or} aria-hidden>
                  CZY
                </span>
              )}
              <button
                type="button"
                className={[styles.tile, on ? styles.tileChosen : '', dim ? styles.tileDim : ''].join(' ')}
                style={{ '--emerge-delay': `${60 + i * 80}ms` } as CSSProperties}
                disabled={disabled || !!chosen}
                aria-pressed={on}
                title={`${attr.name} ${scoreText(mod)}: ${o.line}`}
                onClick={() => onChoose(o.attr)}
              >
                <span className={styles.tileArt}>
                  <img src={attributeArt(o.attr)} alt="" />
                </span>
                <span className={styles.tileName}>{attr.name}</span>
                <span className={styles.tileLine}>{o.line}</span>
                <span className={[styles.tileMod, mod < 0 ? styles.tileModNeg : ''].join(' ')} aria-label={`modyfikator ${scoreText(mod)}`}>
                  {scoreText(mod)}
                </span>
              </button>
            </Fragment>
          )
        })}
      </div>
      {hint && <p className={styles.tileHint}>{hint}</p>}
    </div>
  )
}
