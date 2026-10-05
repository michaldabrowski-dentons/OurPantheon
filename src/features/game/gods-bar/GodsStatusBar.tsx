import { useState, type CSSProperties } from 'react'
import type { Player } from '@/lib/types'
import { domainTitle } from '@/data/pantheon'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { GenderSign } from '@/features/lobby/GenderPicker'
import { GodPortrait } from '@/features/pantheon/GodPortrait'
import { GodSheet } from '@/features/pantheon/GodSheet'
import styles from '../game.module.css'

/** dev preview only: /preview?screen=game&sheet=p2 opens that god's sheet at once */
function initialSheet(): string | null {
  if (!import.meta.env.DEV) return null
  return new URLSearchParams(window.location.search).get('sheet')
}

/** The top of the temple, above the altar: only the gods, seated in a centred row. Each plaque opens the god's sheet. */
export function GodsStatusBar() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const entityGods = useGameStore((s) => s.entityGods)
  const entities = useGameStore((s) => s.entities)
  const me = useGameStore(selectMyPlayer(user.id))
  const [sheet, setSheet] = useState<string | null>(initialSheet)

  const orthodoxyBonus = (p: Player) =>
    Math.min(
      3,
      entityGods.filter((g) => g.player_id === p.id && entities.some((e) => e.id === g.entity_id && e.kind === 'orthodoxy' && e.status === 'active')).length,
    )

  return (
    <header className={['basalt', styles.godsBar].join(' ')}>
      <div className={styles.plaques}>
        {players.map((p, idx) => {
          const isTurn = game.phase === 'gods' && game.current_turn_player_id === p.id
          const isMe = p.id === me?.id
          const bonus = p.low_logos_streak + orthodoxyBonus(p)
          return (
            <button
              key={p.id}
              type="button"
              className={['marble', 'emerge-from-dark', styles.plaque, isTurn ? styles.active : '', isMe ? styles.me : ''].join(' ')}
              style={{ '--emerge-delay': `${80 + idx * 60}ms` } as CSSProperties}
              aria-current={isTurn ? 'true' : undefined}
              onClick={() => setSheet(p.id)}
              title={isMe ? 'Twoja karta bóstwa' : `Karta: ${p.god_name || 'bóstwo bez imienia'}`}
            >
              {isTurn && <span className={styles.turnMark}>TWORZY</span>}
              <GodPortrait domain={p.domain_key} size={56} aura={isTurn} alt="" />
              <span className={styles.plaqueText}>
                <strong title={p.god_name}>
                  <GenderSign kind={p.god_gender ?? 'm'} size={13} className={styles.plaqueSign} />
                  {p.god_name || 'Bóstwo bez imienia'}
                </strong>
                <small>{p.god_description || domainTitle(p.domain_key, p.god_gender ?? 'm')}</small>
                <span className={styles.logos}>
                  <span className={['engraved', styles.logosNum].join(' ')}>{p.logos}</span>
                  <span className={styles.logosWord}>LOGOS</span>
                  {bonus > 0 && (
                    <span className={styles.bonus} title={`Premia do Rzutu Logos: skromność +${p.low_logos_streak}, religie +${orthodoxyBonus(p)}`}>
                      +{bonus}
                    </span>
                  )}
                </span>
              </span>
              {game.phase === 'rolling' && !p.has_rolled && <span className={styles.waiting}>CZEKA NA RZUT</span>}
              {game.phase !== 'rolling' && p.is_resting && <span className={styles.sleep}>ŚPI</span>}
            </button>
          )
        })}
      </div>
      {sheet && <GodSheet playerId={sheet} onClose={() => setSheet(null)} />}
    </header>
  )
}
