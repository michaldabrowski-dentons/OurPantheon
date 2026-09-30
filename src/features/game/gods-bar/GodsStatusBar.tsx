import { useState, type CSSProperties } from 'react'
import type { Player } from '@/lib/types'
import { frescoSrc } from '@/data/frescoes'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { FrescoFrame } from '@/components/ui/Primitives'
import { GodEditor } from './GodEditor'
import styles from '../game.module.css'

/** The top of the temple, above the altar: only the gods, seated in a centred row. */
export function GodsStatusBar() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entityGods = useGameStore((s) => s.entityGods)
  const entities = useGameStore((s) => s.entities)
  const me = useGameStore(selectMyPlayer(user.id))
  const [editing, setEditing] = useState(false)

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
            <div
              key={p.id}
              className={['marble', 'emerge-from-dark', styles.plaque, isTurn ? styles.active : '', isMe ? styles.me : ''].join(' ')}
              style={{ '--emerge-delay': `${80 + idx * 60}ms` } as CSSProperties}
              aria-current={isTurn ? 'true' : undefined}
            >
              {isTurn && <span className={styles.turnMark}>TWORZY</span>}
              {isMe && (
                <button type="button" className={styles.plaqueEdit} onClick={() => setEditing(true)} title="Edytuj imię, opis i fresk" aria-label="Edytuj bóstwo">
                  ✎
                </button>
              )}
              <FrescoFrame src={frescoSrc(p.avatar_key)} alt="" size={56} round aura={isTurn} />
              <div className={styles.plaqueText}>
                <strong title={p.god_name}>{p.god_name || 'Bóstwo bez imienia'}</strong>
                <small title={profiles[p.user_id]?.display_name ? `gracz: ${profiles[p.user_id]?.display_name}` : undefined}>
                  {p.god_description || ' '}
                </small>
                <span className={styles.logos}>
                  <span className={['engraved', styles.logosNum].join(' ')}>{p.logos}</span>
                  <span className={styles.logosWord}>LOGOS</span>
                  {bonus > 0 && (
                    <span className={styles.bonus} title={`Premia do Rzutu Logos: skromność +${p.low_logos_streak}, religie +${orthodoxyBonus(p)}`}>
                      +{bonus}
                    </span>
                  )}
                </span>
              </div>
              {game.phase === 'rolling' && !p.has_rolled && <span className={styles.waiting}>CZEKA NA RZUT</span>}
              {game.phase !== 'rolling' && p.is_resting && <span className={styles.sleep}>ŚPI</span>}
            </div>
          )
        })}
      </div>
      {editing && me && <GodEditor me={me} onClose={() => setEditing(false)} />}
    </header>
  )
}
