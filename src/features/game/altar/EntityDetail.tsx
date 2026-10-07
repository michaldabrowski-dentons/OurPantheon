import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { Entity, EntityKind } from '@/lib/types'
import { AVATAR_CONDITIONS, CIV_FLAWS, CIV_SPECIALTIES, CIV_TRAITS, CREATURE_TRAITS, SAPIENT_TRAITS } from '@/data/traits'
import { BIOME_BY_KEY } from '@/data/biomes'
import { cityLevelLabel, followersWord } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { godPortraitSrc } from '@/features/pantheon/GodPortrait'
import { useGameStore, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Tag, TextField, TextArea, Notice, Toggle, ConfirmDialog } from '@/components/ui/Primitives'
import { TraitPicker } from '@/components/ui/TraitPicker'
import { kindLabel } from '../actions/ActionDialog'
import { useWorld } from '../map/useWorld'
import styles from '../game.module.css'
import formStyles from '../actions/actions.module.css'
import mapStyles from '../map/map.module.css'

interface EditForm {
  name: string
  description: string
  traits: string[]
  specialties: string[]
  flaws: string[]
  conditions: string[]
}

const fromEntity = (e: Entity): EditForm => ({
  name: e.name,
  description: e.description,
  traits: e.traits,
  specialties: e.specialties,
  flaws: e.flaws,
  conditions: e.conditions,
})

export function EntityDetail({ entity, onClose, onError }: { entity: Entity; onClose: () => void; onError: (m: string | null) => void }) {
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const entityLinks = useGameStore((s) => s.entityLinks)
  const players = useGameStore((s) => s.players)
  const world = useWorld()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>(() => fromEntity(entity))
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!editing) setForm(fromEntity(entity))
  }, [entity, editing])

  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm((s) => ({ ...s, [k]: v }))

  const gods = entityGods.filter((g) => g.entity_id === entity.id).map((g) => ({ g, p: players.find((p) => p.id === g.player_id) }))
  const parent = entity.parent_civilization_id ? entities.find((e) => e.id === entity.parent_civilization_id) : null
  const children = entities.filter((e) => e.parent_civilization_id === entity.id)
  const species = entityLinks.filter((l) => l.from_entity_id === entity.id && l.relation === 'member_species').map((l) => entities.find((e) => e.id === l.to_entity_id)).filter(Boolean) as Entity[]
  const memberOf = entityLinks.filter((l) => l.to_entity_id === entity.id && l.relation === 'member_species').map((l) => entities.find((e) => e.id === l.from_entity_id)).filter(Boolean) as Entity[]
  const variantOf = entityLinks.filter((l) => l.from_entity_id === entity.id && l.relation === 'variant_of').map((l) => entities.find((e) => e.id === l.to_entity_id)).filter(Boolean) as Entity[]
  const variants = entityLinks.filter((l) => l.to_entity_id === entity.id && l.relation === 'variant_of').map((l) => entities.find((e) => e.id === l.from_entity_id)).filter(Boolean) as Entity[]
  const creator = players.find((p) => p.id === entity.created_by_player_id)
  const sapient = entity.traits.some((t) => SAPIENT_TRAITS.includes(t))

  // on the map
  const places = world.occupantsOf(entity.id)
  const city = entity.kind === 'civilization' ? world.cityOf(entity.id) : undefined
  const followers = city ? world.followersOf(entity.id) : []
  const ruler = city ? world.majorityOf(entity.id) : null
  const gifts = entity.kind === 'civilization' ? world.giftsOf(entity.id) : []

  async function patch(p: Record<string, unknown>) {
    setBusy(true)
    onError(null)
    try {
      await rpc('edit_entity', { p_entity_id: entity.id, p_patch: p })
      return true
    } catch (err) {
      onError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const p: Record<string, unknown> = {
      name: form.name,
      description: form.description,
      traits: form.traits,
      specialties: form.specialties,
      flaws: form.flaws,
      conditions: form.conditions,
    }
    if (await patch(p)) setEditing(false)
  }

  async function toggleSapient(on: boolean) {
    const traits = on
      ? [...entity.traits.filter((t) => !SAPIENT_TRAITS.includes(t)), 'Rozumne']
      : entity.traits.filter((t) => !SAPIENT_TRAITS.includes(t))
    await patch({ traits })
  }

  async function remove() {
    setBusy(true)
    onError(null)
    try {
      await rpc('delete_entity', { p_entity_id: entity.id })
      onClose()
    } catch (err) {
      onError((err as Error).message)
      setBusy(false)
    }
  }

  const statusNote =
    entity.status === 'dead'
      ? entity.kind === 'avatar'
        ? 'Poległ. Może wrócić przez Wskrzeszenie Awatara.'
        : 'Wymarły: nie żyje już na żadnym heksie.'
      : entity.status === 'destroyed'
        ? 'Ruina: miasto zniknęło z mapy.'
        : null

  return (
    <Modal title={<>{entity.emoji ? `${entity.emoji} ` : ''}{entity.name}</>} onClose={onClose} wide={editing}>
      <div className={styles.detail}>
        <div className={styles.detailHead}>
          <div>
            <p>
              {kindLabel(entity.kind)}
              {sapient ? ' rozumna' : ''} · Era {entity.created_era}, runda {entity.created_round}
              {creator ? ` · ${godLabel(creator)}` : ''}
              {entity.is_chaos ? ' · dzieło Chaosu' : ''}
              {entity.kind === 'avatar' && entity.status === 'active' ? ` · życie ${entity.hp ?? 0} z 3` : ''}
            </p>
            {statusNote && <Notice tone="error">{statusNote}</Notice>}
          </div>
        </div>

        {/* Table-agreed switches: no Logos, written to the Chronicle */}
        {!editing && (
          <div className={styles.switches}>
            {entity.kind === 'creature' && (
              <Toggle
                checked={sapient}
                disabled={busy}
                onChange={toggleSapient}
                label="Istota rozumna"
                hint={sapient ? 'ma cechę „Rozumne”: może założyć cywilizację' : 'bez cechy „Rozumne”: zwykła flora lub fauna'}
              />
            )}
            {entity.kind === 'avatar' && (
              <Toggle
                checked={entity.status === 'dead'}
                disabled={busy}
                onChange={(dead) => patch({ status: dead ? 'dead' : 'active' })}
                label="Awatar nie żyje"
                hint={entity.status === 'dead' ? 'poległ; wróci tylko przez Wskrzeszenie Awatara' : 'żyje i działa w świecie'}
              />
            )}
          </div>
        )}

        {editing ? (
          <EntityEditor kind={entity.kind} form={form} set={set} />
        ) : (
          <>
            {(places.length > 0 || city) && (
              <div className={styles.section}>
                <h4 className="engraved">Na mapie</h4>
                <div className={styles.detailActions}>
                  {city && <Tag tone="gold">miasto na ({city.q}, {city.r}), {BIOME_BY_KEY[world.hexAt(city.q, city.r)?.biome ?? 'trawa']?.name.toLowerCase()}</Tag>}
                  {places.map((o) => (
                    <Tag key={o.id}>({o.q}, {o.r}) {BIOME_BY_KEY[world.hexAt(o.q, o.r)?.biome ?? 'trawa']?.name.toLowerCase()}</Tag>
                  ))}
                </div>
              </div>
            )}

            {entity.kind === 'civilization' && (
              <div className={styles.section}>
                <h4 className="engraved">{city ? cityLevelLabel(world.cityDots(entity.id)) : 'Ruina'}</h4>
                {followers.length === 0 && <p className={mapStyles.popupEmpty}>Nikt tu nie wierzy.</p>}
                {followers.map((f) => {
                  const p = players.find((x) => x.id === f.player_id)
                  const c = godColor(p?.domain_key)
                  const rules = ruler === f.player_id
                  return (
                    <div key={f.player_id} className={[mapStyles.followerRow, rules ? mapStyles.ruler : ''].join(' ')}>
                      <span className={mapStyles.swatch} style={{ background: c.fill, boxShadow: `0 0 0 1.5px ${c.stroke}` }} />
                      <span>{godLabel(p)}: {followersWord(f.dots)}</span>
                      {rules && <img className={mapStyles.rulerPortrait} src={godPortraitSrc(p?.domain_key)} alt="" title="Rządzi miastem" />}
                    </div>
                  )
                })}
                {gifts.length > 0 && (
                  <div className={mapStyles.gifts}>
                    {gifts.map((g) => (
                      <span key={g.id} className={g.accepted ? '' : mapStyles.giftRejected}>
                        {g.accepted ? '✦' : '✕'} {g.text} <small style={{ color: 'var(--ink-soft)' }}>({godLabel(players.find((x) => x.id === g.player_id))}, runda {g.round_number})</small>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {gods.length > 0 && (
              <div className={styles.section}>
                <h4 className="engraved">{entity.kind === 'avatar' ? 'Twórcy' : 'Stworzone przez'}</h4>
                <div className={styles.detailActions}>
                  {gods.map(({ g, p }) => (
                    <span key={g.player_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <img src={godPortraitSrc(p?.domain_key)} alt="" width={28} height={28} style={{ borderRadius: '50%', boxShadow: '0 0 0 2px var(--gold)' }} />
                      {godLabel(p)}
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
                  {parent && <Tag tone="lapis">miasto macierzyste: {parent.name}</Tag>}
                  {children.map((c) => (
                    <Tag key={c.id}>z niego wyszło: {c.name}</Tag>
                  ))}
                  {species.map((s) => (
                    <Tag key={s.id}>lud z istoty: {s.name}</Tag>
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
            <TraitBlock title="Uwarunkowania" items={entity.conditions} />

            <div className={styles.section}>
              <h4 className="engraved">Opis</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{entity.description || 'Jeszcze bez opisu.'}</p>
            </div>
          </>
        )}

        <div className={[styles.detailActions, styles.detailFoot].join(' ')}>
          {editing ? (
            <>
              <StoneButton variant="gold" size="sm" disabled={busy || !form.name.trim()} onClick={save}>Zapisz</StoneButton>
              <StoneButton size="sm" onClick={() => setEditing(false)}>Anuluj</StoneButton>
            </>
          ) : (
            <StoneButton size="sm" onClick={() => setEditing(true)}>Edytuj</StoneButton>
          )}
          <StoneButton variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)} className={styles.pushRight}>
            Usuń ze świata
          </StoneButton>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Usunąć ze świata?"
          confirmLabel="Usuń na zawsze"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        >
          <p>
            <b>{entity.name}</b> zniknie ze świata i z mapy razem ze swoimi powiązaniami. Święta Księga zapamięta tylko, że tak się stało. Tej decyzji nie da się cofnąć.
          </p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}

/** Everything about the entity, editable; the kind itself changes through the switch above. */
function EntityEditor({ kind, form, set }: { kind: EntityKind; form: EditForm; set: <K extends keyof EditForm>(k: K, v: EditForm[K]) => void }) {
  return (
    <div className={formStyles.fields}>
      <div className={formStyles.nameRow}>
        <TextField id="e_name" label="Nazwa" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
      </div>

      <TextArea id="e_desc" label="Opis" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Krótko, dwa lub trzy zdania." />

      {kind === 'creature' && <TraitPicker label="Cechy" options={CREATURE_TRAITS} value={form.traits} onChange={(v) => set('traits', v)} />}

      {kind === 'civilization' && (
        <>
          <TraitPicker label="Cechy" options={CIV_TRAITS} value={form.traits} onChange={(v) => set('traits', v)} />
          <TraitPicker label="Specjalności" options={CIV_SPECIALTIES} value={form.specialties} onChange={(v) => set('specialties', v)} tone="lapis" />
          <TraitPicker label="Braki" options={CIV_FLAWS} value={form.flaws} onChange={(v) => set('flaws', v)} tone="flaw" />
        </>
      )}

      {kind === 'avatar' && <TraitPicker label="Uwarunkowania" options={AVATAR_CONDITIONS} value={form.conditions} onChange={(v) => set('conditions', v)} max={3} />}
    </div>
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
