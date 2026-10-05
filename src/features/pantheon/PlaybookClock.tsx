import type { CSSProperties } from 'react'
import type { DomainKey, GodGender } from '@/lib/types'
import { CLOCK_ORDER, DOMAIN_BY_KEY, ATTRIBUTE_BY_KEY, attributeArt, domainTitle, oppositeDomain } from '@/data/pantheon'
import { GodPortrait } from './GodPortrait'
import styles from './pantheon.module.css'

/**
 * The clock of domains: twelve marble medallions on a ring, the chosen god painted in the middle.
 * Opposites face each other; neighbours share an attribute.
 */
export function PlaybookClock({ value, onChange, gender }: { value: DomainKey | null; onChange: (d: DomainKey) => void; gender: GodGender }) {
  const opposite = value ? oppositeDomain(value) : null
  return (
    <div className={styles.clock} role="radiogroup" aria-label="Domena bóstwa">
      <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="40.5" />
        <circle cx="50" cy="50" r="27" strokeDasharray="1.2 2.4" />
        {CLOCK_ORDER.map((_, i) => {
          const a = (i * Math.PI) / 6
          const x1 = 50 + Math.sin(a) * 30
          const y1 = 50 - Math.cos(a) * 30
          const x2 = 50 + Math.sin(a) * 32.5
          const y2 = 50 - Math.cos(a) * 32.5
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        })}
      </svg>
      <div className={styles.center}>
        <GodPortrait domain={value} size={150} aura={!!value} alt="" />
        <span className={styles.centerName}>{value ? domainTitle(value, gender) : 'wybierz domenę'}</span>
      </div>
      {CLOCK_ORDER.map((key, i) => {
        const d = DOMAIN_BY_KEY[key]
        const on = key === value
        return (
          <div key={key} className={styles.slot} style={{ '--a': `${i * 30}deg` } as CSSProperties}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              className={[styles.medal, on ? styles.medalOn : '', key === opposite ? styles.medalOpposite : ''].join(' ')}
              onClick={() => onChange(key)}
              title={`${domainTitle(key, gender)}: ${ATTRIBUTE_BY_KEY[d.mains[0]].name} i ${ATTRIBUTE_BY_KEY[d.mains[1]].name}`}
            >
              <span>
                {d.name}
                {key === opposite && <small>przeciwieństwo</small>}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** The chosen domain told: its name in the god's gender, its two attributes, the description, the examples. */
export function DomainBlurb({ domain, gender }: { domain: DomainKey | null; gender: GodGender }) {
  if (!domain) {
    return (
      <div className={styles.blurb}>
        <p className={styles.blurbEmpty}>Kliknij jedną z dwunastu domen na zegarze. Przeciwieństwa leżą naprzeciw siebie, podobne bóstwa obok siebie.</p>
      </div>
    )
  }
  const d = DOMAIN_BY_KEY[domain]
  return (
    <div className={styles.blurb}>
      <h3 className={['engraved', styles.blurbTitle].join(' ')}>{domainTitle(domain, gender)}</h3>
      <div className={styles.mains}>
        {d.mains.map((m) => (
          <span key={m} className={styles.mainTag}>
            <img src={attributeArt(m, 'thumb')} alt="" /> {ATTRIBUTE_BY_KEY[m].name}
          </span>
        ))}
      </div>
      <p className={styles.blurbText}>{d.description}</p>
      <p className={styles.blurbExamples}>{d.examples}</p>
    </div>
  )
}
