import type { CSSProperties } from 'react'
import type { DomainKey, GodGender } from '@/lib/types'
import { CLOCK_ORDER, DOMAIN_BY_KEY, ATTRIBUTE_BY_KEY, domainTitle, wikiUrl } from '@/data/pantheon'
import { GodPortrait } from './GodPortrait'
import styles from './pantheon.module.css'

/**
 * The clock of domains: twelve marble medallions on a ring, the chosen god painted large in the middle.
 * Opposites face each other; neighbours share an attribute.
 */
export function PlaybookClock({ value, onChange, gender }: { value: DomainKey | null; onChange: (d: DomainKey) => void; gender: GodGender }) {
  return (
    <div className={styles.clockWrap}>
    <div className={styles.clock} role="radiogroup" aria-label="Domena bóstwa">
      <div className={styles.center}>
        <GodPortrait domain={value} size="var(--portrait)" aura={!!value} alt={value ? domainTitle(value, gender) : 'bóstwo bez domeny'} className={styles.centerPortrait} />
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
              className={[styles.medal, on ? styles.medalOn : ''].join(' ')}
              onClick={() => onChange(key)}
              title={`${domainTitle(key, gender)}: ${ATTRIBUTE_BY_KEY[d.mains[0]].name} i ${ATTRIBUTE_BY_KEY[d.mains[1]].name}`}
            >
              <span>{d.name}</span>
            </button>
          </div>
        )
      })}
    </div>
    </div>
  )
}

/** The chosen domain told: its name in the god's gender, the description, the gods of old as links. */
export function DomainBlurb({ domain, gender }: { domain: DomainKey | null; gender: GodGender }) {
  if (!domain) {
    return (
      <div className={styles.blurb}>
        <h3 className={['engraved', styles.blurbTitle].join(' ')}>{domainTitle(null, gender)}</h3>
        <p className={styles.blurbEmpty}>Kliknij jedną z dwunastu domen na zegarze. Przeciwieństwa leżą naprzeciw siebie, podobne bóstwa obok siebie.</p>
      </div>
    )
  }
  const d = DOMAIN_BY_KEY[domain]
  return (
    <div className={styles.blurb}>
      <h3 className={['engraved', styles.blurbTitle].join(' ')}>{domainTitle(domain, gender)}</h3>
      <div className={styles.examples} aria-label="Bogowie tej domeny">
        {splitRows(d.examples).map((row, i) => (
          <div key={i} className={styles.exampleRow}>
            {row.map((name) => (
              <a key={name} className={styles.exampleLink} href={wikiUrl(name)} target="_blank" rel="noopener noreferrer" title={`${name} w Wikipedii`}>
                {name}
                <WikiMark />
              </a>
            ))}
          </div>
        ))}
      </div>
      <p className={styles.blurbText}>{d.description}</p>
    </div>
  )
}

/** two rows of the same height, the first one taking the odd name */
function splitRows<T>(list: T[]): [T[], T[]] {
  const half = Math.ceil(list.length / 2)
  return [list.slice(0, half), list.slice(half)]
}

function WikiMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}
