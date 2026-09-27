import { useState } from 'react'
import type { Entity, EntityKind } from '@/lib/types'
import { SAPIENT_TRAITS } from '@/data/traits'
import { frescoSrc } from '@/data/frescoes'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { Tag } from '@/components/ui/Primitives'
import { EntityDetail } from './EntityDetail'
import styles from '../game.module.css'

interface Category {
  key: string
  title: string
  hint: string
  wide?: boolean
  filter: (e: Entity) => boolean
}

const isSapient = (e: Entity) => e.traits.some((t) => SAPIENT_TRAITS.includes(t))

const CATEGORIES: Category[] = [
  { key: 'creatures', title: 'Istoty', hint: 'flora i fauna', filter: (e) => e.kind === 'creature' && !isSapient(e) },
  { key: 'sapient', title: 'Istoty rozumne', hint: 'zdolne do kultury', filter: (e) => e.kind === 'creature' && isSapient(e) },
  { key: 'civilizations', title: 'Cywilizacje', hint: 'ludy świata', wide: true, filter: (e) => e.kind === 'civilization' },
  { key: 'organizations', title: 'Organizacje', hint: 'frakcje i ortodoksje', wide: true, filter: (e) => e.kind === 'faction' || e.kind === 'orthodoxy' },
  { key: 'avatars', title: 'Awatary', hint: 'most między boskością a śmiertelnikami', filter: (e) => e.kind === 'avatar' },
]

const MATERIAL: Record<EntityKind, string> = {
  creature: 'clay-tablet',
  civilization: 'plaster gold-bevel',
  faction: 'parchment',
  orthodoxy: 'parchment',
  avatar: 'plaster gold-bevel',
}

export function AltarGrid({ onError }: { onError: (m: string | null) => void }) {
  const entities = useGameStore((s) => s.entities)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = entities.find((e) => e.id === openId) ?? null

  return (
    <>
      {entities.length === 0 && (
        <div className={['marble', styles.altarBanner].join(' ')}>
          <p>
            Ołtarz jest pusty. Świat jest jałową równiną, oceanem z iskrą pod powierzchnią albo maleńkim czymś czekającym na wyrwanie z pustki.
            Pierwsze istoty, cywilizacje i awatary pojawią się tutaj.
          </p>
        </div>
      )}
      {CATEGORIES.map((cat) => {
        const list = entities.filter(cat.filter)
        return (
          <section key={cat.key} className={[styles.category, cat.wide ? styles.wide : ''].join(' ')} aria-label={cat.title}>
            <div className={styles.categoryHead}>
              <h3 className="engraved-dark">{cat.title}</h3>
              <small>{list.length ? `${list.length}` : cat.hint}</small>
            </div>
            <div className={styles.cards}>
              {list.length === 0 && <p className={styles.emptyCat}>Jeszcze nic nie istnieje.</p>}
              {list.map((e) => (
                <EntityCard key={e.id} entity={e} onOpen={() => setOpenId(e.id)} />
              ))}
            </div>
          </section>
        )
      })}
      {open && <EntityDetail entity={open} onClose={() => setOpenId(null)} onError={onError} />}
    </>
  )
}

function EntityCard({ entity, onOpen }: { entity: Entity; onOpen: () => void }) {
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)

  const gods = entityGods
    .filter((g) => g.entity_id === entity.id)
    .map((g) => players.find((p) => p.id === g.player_id))
    .filter(Boolean)
  const parent = entity.parent_civilization_id ? entities.find((e) => e.id === entity.parent_civilization_id) : null
  const showGods = entity.kind === 'avatar' || entity.kind === 'orthodoxy'
  const tags = [...entity.traits.slice(0, 3), ...entity.specialties.slice(0, 2)]

  return (
    <button className={[MATERIAL[entity.kind], styles.card, entity.status !== 'active' ? styles.dead : ''].join(' ')} onClick={onOpen}>
      {showGods && gods.length > 0 && (
        <span className={styles.pins} aria-label="Bóstwa">
          {gods.map((g) => (
            <img key={g!.id} className={styles.pin} src={frescoSrc(g!.avatar_key)} alt={playerLabel(g, profiles)} title={playerLabel(g, profiles)} />
          ))}
        </span>
      )}
      {entity.is_chaos && <span className={styles.chaosMark}>CHAOS</span>}
      <span className={styles.cardHead}>
        {entity.image_key && <img src={frescoSrc(entity.image_key)} alt="" width={36} height={36} style={{ borderRadius: '50%', boxShadow: '0 0 0 2px var(--gold-dark)' }} />}
        <span className={styles.cardName}>{entity.name}</span>
      </span>
      <span className={styles.cardSub}>
        {entity.kind === 'orthodoxy' && 'Ortodoksja · '}
        {entity.kind === 'faction' && 'Frakcja · '}
        {entity.faction_type ?? ''}
        {parent ? `${entity.faction_type ? ' · ' : ''}${parent.name}` : ''}
        {entity.status === 'dead' && ' · poległ'}
        {entity.status === 'destroyed' && ' · zniszczona'}
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
