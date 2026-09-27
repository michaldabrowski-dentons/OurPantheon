import { Fragment, useEffect, useRef } from 'react'
import { ACTION_BY_KEY, LOG_LABELS, type ActionKey } from '@/data/actions'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Dice2d6 } from '@/components/ui/Primitives'
import styles from '../game.module.css'

export function ChronicleDrawer({ onClose }: { onClose: () => void }) {
  const log = useGameStore((s) => s.log)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entities = useGameStore((s) => s.entities)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log.length])

  let lastRound = -1

  return (
    <aside className={['parchment', styles.drawer].join(' ')} style={{ clipPath: 'none' }} aria-label="Kronika">
      <div className={styles.drawerHead}>
        <h3 className="engraved">Kronika</h3>
        <StoneButton size="sm" onClick={onClose}>Zamknij</StoneButton>
      </div>
      <div className={styles.drawerList}>
        {log.length === 0 && <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>Nic jeszcze nie zapisano.</p>}
        {log.map((l) => {
          const sep = l.round_number !== lastRound
          lastRound = l.round_number
          const who = players.find((p) => p.id === l.player_id)
          const label = ACTION_BY_KEY[l.action_key as ActionKey]?.name ?? LOG_LABELS[l.action_key] ?? l.action_key
          const ent = l.entity_id ? entities.find((e) => e.id === l.entity_id) : null
          return (
            <Fragment key={l.id}>
              {sep && <div className={styles.roundSep}>Era {l.era} · Runda {l.round_number}</div>}
              <div className={styles.entry}>
                <div className={styles.entryMeta}>
                  {who && <b>{playerLabel(who, profiles)}</b>}
                  <span>{label}</span>
                  {l.is_avatar_free_action && <span>(awatar)</span>}
                  {l.logos_delta !== 0 && (
                    <span className={[styles.delta, l.logos_delta < 0 ? styles.neg : styles.pos].join(' ')}>
                      {l.logos_delta > 0 ? '+' : ''}
                      {l.logos_delta}
                    </span>
                  )}
                </div>
                {ent && <div>→ {ent.name}</div>}
                {l.summary && <div>{l.summary}</div>}
                {l.roll && l.action_key !== 'logos_roll' && l.roll.d1 !== undefined && (
                  <div style={{ transform: 'scale(0.7)', transformOrigin: 'left', height: 44 }}>
                    <Dice2d6 d1={l.roll.d1} d2={l.roll.d2} />
                  </div>
                )}
              </div>
            </Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
    </aside>
  )
}
