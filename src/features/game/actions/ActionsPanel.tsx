import { useMemo, useState, type CSSProperties } from 'react'
import { actionsByCategory, type ActionDef, type Era } from '@/data/actions'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { ActionIcon } from '@/components/ui/ActionIcons'
import { ActionDialog } from './ActionDialog'
import styles from '../game.module.css'

/** The whole left colonnade is the choice of a word: marble tiles, category by category. */
export function ActionsPanel() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const me = useGameStore(selectMyPlayer(user.id))
  const [open, setOpen] = useState<ActionDef | null>(null)

  const era = game.era as Era
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting
  // a living avatar with its free action still unspent opens every word, whatever the Words in hand
  const avatarFree =
    !!me && !me.avatar_action_used && entityGods.some((g) => g.player_id === me.id && entities.some((e) => e.id === g.entity_id && e.kind === 'avatar' && e.status === 'active'))
  const groups = useMemo(() => actionsByCategory(era), [era])

  let tile = 0

  return (
    <aside className={styles.actions}>
      <p className={styles.actionsHint}>
        {myTurn ? 'Twoja tura. Wybierz słowo i opisz, co czynisz.' : 'W każdej kategorii od najtańszego słowa do najdroższego.'}
      </p>

      {groups.map(({ category, actions }) => (
        <section key={category.key} className={styles.actionsCat} aria-label={category.name}>
          <h3 className="carved-glow">{category.name}</h3>
          {actions.map((a) => {
            const cost = a.costs[era - 1]
            const affordable = !!me && me.logos >= cost
            const reqOk = !a.requirement || a.requirement.check(entities)
            const off = !myTurn || !(affordable || avatarFree) || !reqOk
            const delay = 60 + tile++ * 30
            return (
              <button
                key={a.key}
                className={['marble', 'emerge-from-dark', styles.stone, off ? styles.stoneOff : ''].join(' ')}
                style={{ '--emerge-delay': `${delay}ms` } as CSSProperties}
                disabled={off}
                onClick={() => setOpen(a)}
                title={
                  !reqOk && a.requirement
                    ? `Najpierw: ${a.requirement.text}.`
                    : !affordable
                      ? avatarFree
                        ? `Za mało Logos (potrzeba ${cost}), ale awatar może to uczynić za darmo.`
                        : `Za mało Logos: potrzeba ${cost}.`
                      : a.summary
                }
              >
                <span className={styles.stoneIcon}>
                  <ActionIcon k={a.key} />
                </span>
                <span className={styles.stoneBody}>
                  <span className={styles.stoneName}>{a.name}</span>
                  {(a.requirement || a.requiresRoll) && (
                    <span className={styles.stoneMeta}>
                      {a.requirement && (
                        <span className={[styles.stoneReq, reqOk ? '' : styles.reqUnmet].join(' ')}>{a.requirement.text}</span>
                      )}
                      {a.requiresRoll && <span className={styles.stoneRoll}>wymaga rzutu</span>}
                    </span>
                  )}
                </span>
                {/* the three Eras side by side: the current one in gold, the others small and grey */}
                <span className={styles.stoneCosts}>
                  {([1, 2, 3] as Era[]).map((e) => (
                    <span
                      key={e}
                      className={[
                        e === era ? styles.stoneCost : styles.stoneOther,
                        e === era && !affordable ? styles.costOver : '',
                      ].join(' ')}
                    >
                      {a.costs[e - 1]}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </section>
      ))}

      {open && me && <ActionDialog action={open} me={me} onClose={() => setOpen(null)} />}
    </aside>
  )
}
