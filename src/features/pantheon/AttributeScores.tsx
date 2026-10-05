import type { AttrKey, DomainKey } from '@/lib/types'
import { ATTRIBUTE_BY_KEY, DOMAIN_BY_KEY, attributeArt, scoreText, scoresFor } from '@/data/pantheon'
import styles from './pantheon.module.css'

/** first row the three, second row their opposites right beneath: Gniew/Łaska, Majestat/Podszept, Mądrość/Żywioł */
const SHEET_ORDER: AttrKey[] = ['wrath', 'majesty', 'wisdom', 'grace', 'whisper', 'element']

/** The six attributes of a god on its sheet: a large painting, the name, the score. Nothing else. */
export function AttributeScores({ domain, primary, bonus }: { domain: DomainKey | null; primary: AttrKey | null; bonus: AttrKey | null }) {
  const scores = scoresFor(domain, primary, bonus)
  const mains: AttrKey[] = domain ? [...DOMAIN_BY_KEY[domain].mains] : []
  return (
    <div className={styles.scores} aria-label="Atrybuty">
      {SHEET_ORDER.map((key) => {
        const a = ATTRIBUTE_BY_KEY[key]
        const n = scores[a.key]
        return (
          <div key={a.key} className={[styles.score, mains.includes(a.key) ? styles.scoreMain : ''].join(' ')} title={a.tagline}>
            <img src={attributeArt(a.key)} alt="" />
            <span className={[styles.scoreNum, n > 0 ? styles.scorePlus : n < 0 ? styles.scoreMinus : ''].join(' ')}>{scoreText(n)}</span>
            <b className={styles.scoreName}>{a.name}</b>
          </div>
        )
      })}
    </div>
  )
}
