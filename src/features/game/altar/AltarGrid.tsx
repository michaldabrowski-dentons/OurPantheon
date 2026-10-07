import { useState, type CSSProperties } from 'react'
import type { Entity } from '@/lib/types'
import { isSapient } from '@/data/actions'
import { godPortraitSrc } from '@/features/pantheon/GodPortrait'
import { useGameStore, godLabel } from '@/store/useGameStore'
import { Tag } from '@/components/ui/Primitives'
import { EntityDetail } from './EntityDetail'
import styles from '../game.module.css'

interface Category {
  key: string
  title: string
  hint: string
  filter: (e: Entity) => boolean
}

const SAPIENT: Category = { key: 'sapient', title: 'Istoty rozumne', hint: 'zdolne do kultury', filter: (e) => isSapient(e) }
const CREATURES: Category = { key: 'creatures', title: 'Istoty', hint: 'flora i fauna', filter: (e) => e.kind === 'creature' && !isSapient(e) }
const CIVILIZATIONS: Category = { key: 'civilizations', title: 'Cywilizacje', hint: 'ludy świata', filter: (e) => e.kind === 'civilization' }
const AVATARS: Category = { key: 'avatars', title: 'Awatary', hint: 'most między boskością a śmiertelnikami', filter: (e) => e.kind === 'avatar' }

/* The lists read left to right the way the world grows: life, peoples, our envoys. */
const COLUMNS: { key: string; sections: Category[] }[] = [
  { key: 'life', sections: [SAPIENT, CREATURES] },
  { key: 'peoples', sections: [CIVILIZATIONS] },
  { key: 'envoys', sections: [AVATARS] },
]

const emergeAt = (ms: number) => ({ '--emerge-delay': `${ms}ms` }) as CSSProperties

export function AltarGrid({ onError }: { onError: (m: string | null) => void }) {
  const entities = useGameStore((s) => s.entities)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = entities.find((e) => e.id === openId) ?? null

  // stagger cards across the whole altar so they surface one after another
  let cardIndex = 0

  return (
    <>
      {COLUMNS.map((col, colIdx) => (
        <div key={col.key} className={styles.altarCol}>
          {col.sections.map((cat, secIdx) => {
            const list = entities.filter(cat.filter)
            return (
              <section
                key={cat.key}
                className={['emerge-from-dark', styles.category].join(' ')}
                style={emergeAt(80 + colIdx * 70 + secIdx * 40)}
                aria-label={cat.title}
              >
                <div className={styles.categoryHead}>
                  <h3>{cat.title}</h3>
                  <small>{list.length ? `${list.length}` : cat.hint}</small>
                </div>
                <div className={styles.cards}>
                  {list.length === 0 && <p className={styles.emptyCat}>Jeszcze nic nie istnieje.</p>}
                  {list.map((e) => (
                    <EntityCard key={e.id} entity={e} delay={200 + cardIndex++ * 45} onOpen={() => setOpenId(e.id)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ))}
      {open && <EntityDetail entity={open} onClose={() => setOpenId(null)} onError={onError} />}
    </>
  )
}

function EntityCard({ entity, delay, onOpen }: { entity: Entity; delay: number; onOpen: () => void }) {
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const entityLinks = useGameStore((s) => s.entityLinks)
  const players = useGameStore((s) => s.players)

  const gods = entityGods
    .filter((g) => g.entity_id === entity.id)
    .map((g) => players.find((p) => p.id === g.player_id))
    .filter(Boolean)
  const parent = entity.parent_civilization_id ? entities.find((e) => e.id === entity.parent_civilization_id) : null
  const species =
    entity.kind === 'civilization'
      ? entityLinks
          .filter((l) => l.from_entity_id === entity.id && l.relation === 'member_species')
          .map((l) => entities.find((e) => e.id === l.to_entity_id)?.name)
          .filter(Boolean)
      : []
  const showGods = entity.kind === 'avatar'
  const tags = [...entity.traits.slice(0, 3), ...entity.specialties.slice(0, 2)]

  return (
    <button
      className={['marble', 'emerge-from-dark', styles.card, styles[entity.kind], entity.status !== 'active' ? styles.dead : ''].join(' ')}
      style={emergeAt(delay)}
      onClick={onOpen}
    >
      {showGods && gods.length > 0 && (
        <span className={styles.pins} aria-label="Bóstwa">
          {gods.map((g) => (
            <img key={g!.id} className={styles.pin} src={godPortraitSrc(g!.domain_key)} alt={godLabel(g)} title={godLabel(g)} />
          ))}
        </span>
      )}
      {entity.is_chaos && <span className={styles.chaosMark}>CHAOS</span>}
      <span className={styles.cardHead}>
        {entity.emoji && <span aria-hidden>{entity.emoji}</span>}
        <span className={styles.cardName}>{entity.name}</span>
      </span>
      {entity.kind === 'civilization' && (
        <span className={styles.cardSpecies}>
          {species.length > 0 ? `lud z istoty: ${species.join(', ')}` : 'gatunek nieustalony'}
        </span>
      )}
      <span className={styles.cardSub}>
        {parent ? `z miasta ${parent.name}` : ''}
        {entity.status === 'dead' && (entity.kind === 'avatar' ? ' · poległ' : ' · wymarły')}
        {entity.status === 'destroyed' && ' · ruina'}
      </span>
      {tags.length > 0 && (
        <span className={styles.cardTags}>
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          {entity.flaws.slice(0, 1).map((t) => (
            <Tag key={t} tone="flaw">
              {t}
            </Tag>
          ))}
        </span>
      )}
    </button>
  )
}
