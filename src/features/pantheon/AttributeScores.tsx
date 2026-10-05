import type { AttrKey, DomainKey } from '@/lib/types'
import { ATTRIBUTES, DOMAIN_BY_KEY, attributeArt, scoreText, scoresFor } from '@/data/pantheon'
import styles from './pantheon.module.css'

/** The six attributes of a god, painted, with their scores. */
export function AttributeScores({ domain, primary, bonus }: { domain: DomainKey | null; primary: AttrKey | null; bonus: AttrKey | null }) {
  const scores = scoresFor(domain, primary, bonus)
  const mains: AttrKey[] = domain ? [...DOMAIN_BY_KEY[domain].mains] : []
  return (
    <div className={styles.scores} aria-label="Atrybuty">
      {ATTRIBUTES.map((a) => {
        const n = scores[a.key]
        return (
          <div key={a.key} className={[styles.score, mains.includes(a.key) ? styles.scoreMain : ''].join(' ')} title={`${a.name}: ${a.tagline}`}>
            <img src={attributeArt(a.key, 'thumb')} alt="" />
            <span className={styles.scoreName}>
              <b>{a.name}</b>
              <small>{a.tagline}</small>
            </span>
            <span className={[styles.scoreNum, n > 0 ? styles.scorePlus : n < 0 ? styles.scoreMinus : ''].join(' ')}>{scoreText(n)}</span>
          </div>
        )
      })}
    </div>
  )
}
