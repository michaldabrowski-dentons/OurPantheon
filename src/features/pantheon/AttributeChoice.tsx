import { Fragment, type CSSProperties } from 'react'
import type { AttrKey, DomainKey } from '@/lib/types'
import { ATTRIBUTE_BY_KEY, DOMAIN_BY_KEY, attributeArt, restOf, scoreText, scoresFor } from '@/data/pantheon'
import styles from './pantheon.module.css'

/**
 * Two steps after the domain: which of its two mains is the god's first nature (+2 over +1),
 * then where the one extra +1 goes among the other four.
 */
export function AttributeChoice({
  domain,
  primary,
  bonus,
  onChange,
}: {
  domain: DomainKey
  primary: AttrKey | null
  bonus: AttrKey | null
  onChange: (primary: AttrKey | null, bonus: AttrKey | null) => void
}) {
  const d = DOMAIN_BY_KEY[domain]
  const base = scoresFor(domain, null, null)
  const withPrimary = scoresFor(domain, primary, null)
  const [a, b] = d.mains

  return (
    <div className={styles.choice}>
      <div className={styles.choiceHead}>
        <h4 className="engraved">
          {ATTRIBUTE_BY_KEY[a].name} czy {ATTRIBUTE_BY_KEY[b].name}?
        </h4>
        <small>Oba są twoje. Ten, który wybierzesz, dostaje +2, drugi +1.</small>
      </div>
      <div className={styles.duel}>
        {d.mains.map((m, i) => {
          const on = primary === m
          const attr = ATTRIBUTE_BY_KEY[m]
          return (
            <Fragment key={m}>
              {i === 1 && (
                <span className={styles.duelOr} aria-hidden>
                  CZY
                </span>
              )}
              <button type="button" className={[styles.attrTile, on ? styles.attrTileOn : ''].join(' ')} aria-pressed={on} onClick={() => onChange(m, bonus)}>
                <img src={attributeArt(m)} alt="" />
                <span className={styles.attrName}>{attr.name}</span>
                <span className={styles.attrTagline}>{attr.tagline}</span>
                <span className={styles.attrScore}>{primary ? scoreText(withPrimary[m]) : '+1'}</span>
              </button>
            </Fragment>
          )
        })}
      </div>

      <div className={styles.choiceHead}>
        <h4 className="engraved">Dodaj +1</h4>
        <small>{primary ? 'Jeden z pozostałych czterech. Słabość może stać się zerem, zero przewagą.' : 'Najpierw rozstrzygnij, co jest pierwsze.'}</small>
      </div>
      <div className={styles.four} style={{ '--img': '72px' } as CSSProperties}>
        {restOf(domain).map((k) => {
          const on = bonus === k
          const attr = ATTRIBUTE_BY_KEY[k]
          return (
            <button key={k} type="button" className={[styles.attrTile, on ? styles.attrTileOn : ''].join(' ')} aria-pressed={on} disabled={!primary} onClick={() => onChange(primary, k)}>
              <img src={attributeArt(k, 'thumb')} alt="" />
              <span className={styles.attrName}>{attr.name}</span>
              <span className={styles.attrScore}>{scoreText(on ? base[k] + 1 : base[k])}</span>
              {!on && <span className={styles.attrScoreNext}>po wyborze {scoreText(base[k] + 1)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
