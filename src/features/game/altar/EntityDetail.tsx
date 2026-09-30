import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { Entity, EntityKind } from '@/lib/types'
import {
  AVATAR_CONDITIONS, CIV_FLAWS, CIV_SPECIALTIES, CIV_TRAITS, CREATURE_TRAITS, FACTION_DESIRES, FACTION_TRAITS, FACTION_TYPES,
  ORTHODOXY_REQUIREMENTS, SAPIENT_TRAITS,
} from '@/data/traits'
import { ENTITY_FRESCOES, frescoSrc } from '@/data/frescoes'
import { useGameStore, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, Tag, TextField, TextArea, FrescoFrame, Notice, Toggle, ConfirmDialog, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { TraitPicker } from '@/components/ui/TraitPicker'
import { kindLabel } from '../actions/ActionDialog'
import styles from '../game.module.css'
import formStyles from '../actions/actions.module.css'

interface EditForm {
  name: string
  description: string
  image_key: string
  faction_type: string
  parent_civilization_id: string
  traits: string[]
  specialties: string[]
  flaws: string[]
  desires: string[]
  requirements: string[]
  conditions: string[]
}

const fromEntity = (e: Entity): EditForm => ({
  name: e.name,
  description: e.description,
  image_key: e.image_key ?? '',
  faction_type: e.faction_type ?? FACTION_TYPES[0],
  parent_civilization_id: e.parent_civilization_id ?? '',
  traits: e.traits,
  specialties: e.specialties,
  flaws: e.flaws,
  desires: e.desires,
  requirements: e.requirements,
  conditions: e.conditions,
})

export function EntityDetail({ entity, onClose, onError }: { entity: Entity; onClose: () => void; onError: (m: string | null) => void }) {
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const entityLinks = useGameStore((s) => s.entityLinks)
  const players = useGameStore((s) => s.players)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm>(() => fromEntity(entity))
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickRequirements, setPickRequirements] = useState(false)
  const [requirements, setRequirements] = useState<string[]>(entity.requirements)

  useEffect(() => {
    if (!editing) setForm(fromEntity(entity))
    setRequirements(entity.requirements)
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
  const civs = entities.filter((e) => e.kind === 'civilization' && e.id !== entity.id)

  const sapient = entity.traits.some((t) => SAPIENT_TRAITS.includes(t))

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
      image_key: form.image_key || undefined,
      traits: form.traits,
      specialties: form.specialties,
      flaws: form.flaws,
      desires: form.desires,
      requirements: form.requirements,
      conditions: form.conditions,
    }
    if (entity.kind === 'faction' || entity.kind === 'orthodoxy') {
      p.faction_type = form.faction_type
      p.parent_civilization_id = form.parent_civilization_id
    }
    if (await patch(p)) setEditing(false)
  }

  async function toggleSapient(on: boolean) {
    const traits = on
      ? [...entity.traits.filter((t) => !SAPIENT_TRAITS.includes(t)), 'Rozumne']
      : entity.traits.filter((t) => !SAPIENT_TRAITS.includes(t))
    await patch({ traits })
  }

  async function toggleReligion(on: boolean) {
    if (on) {
      setPickRequirements(true)
      return
    }
    await patch({ kind: 'faction' })
  }

  async function confirmReligion() {
    if (await patch({ kind: 'orthodoxy', requirements })) setPickRequirements(false)
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

  return (
    <Modal title={entity.name} onClose={onClose} wide={editing}>
      <div className={styles.detail}>
        <div className={styles.detailHead}>
          {entity.image_key && !editing && <FrescoFrame src={frescoSrc(entity.image_key)} alt="" size={84} />}
          <div>
            <p>
              {kindLabel(entity.kind)}
              {entity.faction_type ? ` · ${entity.faction_type}` : ''} · Era {entity.created_era}, runda {entity.created_round}
              {creator ? ` · ${godLabel(creator)}` : ''}
              {entity.is_chaos ? ' · dzieło Chaosu' : ''}
            </p>
            {entity.status !== 'active' && <Notice tone="error">{entity.status === 'dead' ? 'Poległ. Może wrócić przez Wskrzeszenie Awatara.' : 'Zniszczona.'}</Notice>}
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
            {(entity.kind === 'faction' || entity.kind === 'orthodoxy') && (
              <Toggle
                checked={entity.kind === 'orthodoxy'}
                disabled={busy}
                onChange={toggleReligion}
                label="Religia"
                hint={entity.kind === 'orthodoxy' ? 'czci bóstwo i daje mu +1 do Rzutu Logos' : 'neutralna frakcja, nie służy żadnemu bóstwu'}
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

        {pickRequirements && (
          <div className={styles.section}>
            <TraitPicker
              label="Wymagania religii (2)"
              options={ORTHODOXY_REQUIREMENTS.map((r) => r.name)}
              value={requirements}
              onChange={setRequirements}
              max={2}
              allowCustom={false}
              tone="gold"
            />
            <div className={styles.detailActions}>
              <StoneButton variant="gold" size="sm" disabled={busy || requirements.length === 0} onClick={confirmReligion}>
                Uczyń religią
              </StoneButton>
              <StoneButton size="sm" onClick={() => setPickRequirements(false)}>Anuluj</StoneButton>
            </div>
          </div>
        )}

        {editing ? (
          <EntityEditor kind={entity.kind} form={form} set={set} civs={civs} />
        ) : (
          <>
            {gods.length > 0 && (
              <div className={styles.section}>
                <h4 className="engraved">{entity.kind === 'orthodoxy' ? 'Czczą' : entity.kind === 'avatar' ? 'Twórcy' : 'Stworzone przez'}</h4>
                <div className={styles.detailActions}>
                  {gods.map(({ g, p }) => (
                    <span key={g.player_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <img src={frescoSrc(p?.avatar_key)} alt="" width={28} height={28} style={{ borderRadius: '50%', boxShadow: '0 0 0 2px var(--gold)' }} />
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
                  {parent && <Tag tone="lapis">Cywilizacja: {parent.name}</Tag>}
                  {children.map((c) => (
                    <Tag key={c.id}>{kindLabel(c.kind)}: {c.name}</Tag>
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
            <TraitBlock title="Pragnienia" items={entity.desires} tone="lapis" />
            {entity.requirements.length > 0 && (
              <div className={styles.section}>
                <h4 className="engraved">Wymagania</h4>
                {entity.requirements.map((r) => {
                  const def = ORTHODOXY_REQUIREMENTS.find((x) => x.name === r)
                  return (
                    <p key={r}>
                      <b>{r}</b>
                      {def ? `: ${def.text}` : ''}
                    </p>
                  )
                })}
              </div>
            )}
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
            <b>{entity.name}</b> zniknie ze świata razem ze swoimi powiązaniami. Kronika zapamięta tylko, że tak się stało. Tej decyzji nie da się cofnąć.
          </p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}

/** Everything about the entity, editable; the kind itself changes through the switch above. */
function EntityEditor({
  kind,
  form,
  set,
  civs,
}: {
  kind: EntityKind
  form: EditForm
  set: <K extends keyof EditForm>(k: K, v: EditForm[K]) => void
  civs: Entity[]
}) {
  return (
    <div className={formStyles.fields}>
      <div className={formStyles.nameRow}>
        <TextField id="e_name" label="Nazwa" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
        <label className={fieldClass}>
          <span className={labelClass}>Fresk</span>
          <div className={formStyles.frescoRow}>
            {ENTITY_FRESCOES.map((fr) => (
              <button
                key={fr.key}
                type="button"
                className={[formStyles.frescoBtn, form.image_key === fr.key ? formStyles.frescoOn : ''].join(' ')}
                onClick={() => set('image_key', fr.key)}
                title={fr.name}
              >
                <FrescoFrame src={frescoSrc(fr.key)} alt={fr.name} size={36} round aura={form.image_key === fr.key} />
              </button>
            ))}
          </div>
        </label>
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

      {(kind === 'faction' || kind === 'orthodoxy') && (
        <>
          <div className={formStyles.twoCol}>
            <label className={fieldClass}>
              <span className={labelClass}>Typ</span>
              <select className={inputClass} value={form.faction_type} onChange={(e) => set('faction_type', e.target.value)}>
                {FACTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Cywilizacja</span>
              <select className={inputClass} value={form.parent_civilization_id} onChange={(e) => set('parent_civilization_id', e.target.value)}>
                <option value="">żadna albo wiele</option>
                {civs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TraitPicker label="Cechy" options={FACTION_TRAITS} value={form.traits} onChange={(v) => set('traits', v)} />
          <TraitPicker label="Pragnienia" options={FACTION_DESIRES} value={form.desires} onChange={(v) => set('desires', v)} tone="lapis" />
          {kind === 'orthodoxy' && (
            <TraitPicker
              label="Wymagania (2)"
              options={ORTHODOXY_REQUIREMENTS.map((r) => r.name)}
              value={form.requirements}
              onChange={(v) => set('requirements', v)}
              max={2}
              allowCustom={false}
              tone="gold"
            />
          )}
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
