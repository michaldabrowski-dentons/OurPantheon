import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { Entity } from '@/lib/types'
import { ORTHODOXY_REQUIREMENTS } from '@/data/traits'
import { frescoSrc } from '@/data/frescoes'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Tag, TextArea, FrescoFrame, Notice } from '@/components/ui/Primitives'
import { kindLabel } from '../actions/ActionDialog'
import styles from '../game.module.css'

export function EntityDetail({ entity, onClose, onError }: { entity: Entity; onClose: () => void; onError: (m: string | null) => void }) {
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const entityLinks = useGameStore((s) => s.entityLinks)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)

  const [notes, setNotes] = useState(entity.notes)
  const [desc, setDesc] = useState(entity.description)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) {
      setNotes(entity.notes)
      setDesc(entity.description)
    }
  }, [entity, editing])

  const gods = entityGods.filter((g) => g.entity_id === entity.id).map((g) => ({ g, p: players.find((p) => p.id === g.player_id) }))
  const parent = entity.parent_civilization_id ? entities.find((e) => e.id === entity.parent_civilization_id) : null
  const children = entities.filter((e) => e.parent_civilization_id === entity.id)
  const species = entityLinks.filter((l) => l.from_entity_id === entity.id && l.relation === 'member_species').map((l) => entities.find((e) => e.id === l.to_entity_id)).filter(Boolean) as Entity[]
  const memberOf = entityLinks.filter((l) => l.to_entity_id === entity.id && l.relation === 'member_species').map((l) => entities.find((e) => e.id === l.from_entity_id)).filter(Boolean) as Entity[]
  const variantOf = entityLinks.filter((l) => l.from_entity_id === entity.id && l.relation === 'variant_of').map((l) => entities.find((e) => e.id === l.to_entity_id)).filter(Boolean) as Entity[]
  const variants = entityLinks.filter((l) => l.to_entity_id === entity.id && l.relation === 'variant_of').map((l) => entities.find((e) => e.id === l.from_entity_id)).filter(Boolean) as Entity[]
  const creator = players.find((p) => p.id === entity.created_by_player_id)

  async function save() {
    setBusy(true)
    onError(null)
    try {
      await rpc('edit_entity', { p_entity_id: entity.id, p_patch: { notes, description: desc } })
      setEditing(false)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const material = entity.kind === 'creature' ? 'clay-tablet' : entity.kind === 'faction' || entity.kind === 'orthodoxy' ? 'parchment' : 'marble'

  return (
    <Modal title={entity.name} onClose={onClose} material={material}>
      <div className={styles.detail}>
        <div className={styles.detailHead}>
          {entity.image_key && <FrescoFrame src={frescoSrc(entity.image_key)} alt="" size={84} />}
          <div>
            <p>
              {kindLabel(entity.kind)}
              {entity.faction_type ? ` · ${entity.faction_type}` : ''} · Era {entity.created_era}, runda {entity.created_round}
              {creator ? ` · ${playerLabel(creator, profiles)}` : ''}
              {entity.is_chaos ? ' · dzieło Chaosu' : ''}
            </p>
            {entity.status !== 'active' && <Notice tone="error">{entity.status === 'dead' ? 'Poległ. Może wrócić przez Wskrzeszenie awatara.' : 'Zniszczona.'}</Notice>}
          </div>
        </div>

        {gods.length > 0 && (
          <div className={styles.section}>
            <h4 className="engraved">{entity.kind === 'orthodoxy' ? 'Czczą' : entity.kind === 'avatar' ? 'Twórcy' : 'Stworzone przez'}</h4>
            <div className={styles.detailActions}>
              {gods.map(({ g, p }) => (
                <span key={g.player_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <img src={frescoSrc(p?.avatar_key)} alt="" width={28} height={28} style={{ borderRadius: '50%', boxShadow: '0 0 0 2px var(--gold)' }} />
                  {playerLabel(p, profiles)}
                  {g.role === 'co_creator' ? ' (współtwórca)' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {(parent || children.length > 0 || species.length > 0 || memberOf.length > 0 || variantOf.length > 0 || variants.length > 0) && (
          <div className={styles.section}>
            <h4 className="engraved">Powiązania</h4>
            <div className={styles.detailActions}>
              {parent && <Tag tone="lapis">Cywilizacja: {parent.name}</Tag>}
              {children.map((c) => (
                <Tag key={c.id}>{kindLabel(c.kind)}: {c.name}</Tag>
              ))}
              {species.map((s) => (
                <Tag key={s.id}>gatunek: {s.name}</Tag>
              ))}
              {memberOf.map((s) => (
                <Tag key={s.id}>tworzy lud: {s.name}</Tag>
              ))}
              {variantOf.map((s) => (
                <Tag key={s.id}>odmiana: {s.name}</Tag>
              ))}
              {variants.map((s) => (
                <Tag key={s.id}>ma odmianę: {s.name}</Tag>
              ))}
            </div>
          </div>
        )}

        <TraitBlock title="Cechy" items={entity.traits} />
        <TraitBlock title="Specjalności" items={entity.specialties} tone="lapis" />
        <TraitBlock title="Braki" items={entity.flaws} tone="flaw" />
        <TraitBlock title="Pragnienia" items={entity.desires} tone="lapis" />
        {entity.requirements.length > 0 && (
          <div className={styles.section}>
            <h4 className="engraved">Wymagania</h4>
            {entity.requirements.map((r) => {
              const def = ORTHODOXY_REQUIREMENTS.find((x) => x.name === r)
              return (
                <p key={r}>
                  <b>{r}</b>
                  {def ? ` — ${def.text}` : ''}
                </p>
              )
            })}
          </div>
        )}
        <TraitBlock title="Uwarunkowania" items={entity.conditions} />

        <div className={styles.section}>
          <h4 className="engraved">Opis</h4>
          {editing ? <TextArea id="d_desc" label="" value={desc} onChange={(e) => setDesc(e.target.value)} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{entity.description || '—'}</p>}
        </div>
        <div className={styles.section}>
          <h4 className="engraved">Notatki</h4>
          {editing ? <TextArea id="d_notes" label="" value={notes} onChange={(e) => setNotes(e.target.value)} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{entity.notes || '—'}</p>}
        </div>

        <div className={styles.detailActions}>
          {editing ? (
            <>
              <StoneButton variant="gold" size="sm" disabled={busy} onClick={save}>Zapisz</StoneButton>
              <StoneButton size="sm" onClick={() => setEditing(false)}>Anuluj</StoneButton>
            </>
          ) : (
            <StoneButton size="sm" onClick={() => setEditing(true)}>Edytuj opis i notatki</StoneButton>
          )}
        </div>
      </div>
    </Modal>
  )
}

function TraitBlock({ title, items, tone }: { title: string; items: string[]; tone?: 'flaw' | 'lapis' }) {
  if (items.length === 0) return null
  return (
    <div className={styles.section}>
      <h4 className="engraved">{title}</h4>
      <div className={styles.detailActions}>
        {items.map((t) => (
          <Tag key={t} tone={tone}>
            {t}
          </Tag>
        ))}
      </div>
    </div>
  )
}
