import { useMemo, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, ActionPayload, Entity, EntityKind, EntityPayload, Player } from '@/lib/types'
import { costFor, type ActionDef, type Era } from '@/data/actions'
import {
  AVATAR_CONDITIONS, CIV_FLAWS, CIV_SPECIALTIES, CIV_TRAITS, CREATURE_QUESTIONS, CREATURE_TRAITS,
  FACTION_DESIRES, FACTION_TRAITS, FACTION_TYPES, ORTHODOXY_REQUIREMENTS, SAPIENT_TRAITS,
} from '@/data/traits'
import { ENTITY_FRESCOES, frescoSrc } from '@/data/frescoes'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice, Dice2d6, FrescoFrame, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { TraitPicker } from '@/components/ui/TraitPicker'
import styles from './actions.module.css'

type Step = 'form' | 'roll'

interface FormState {
  summary: string
  useAvatar: boolean
  targetId: string
  asVariant: boolean
  name: string
  description: string
  image_key: string
  faction_type: string
  parent_civilization_id: string
  kind: EntityKind
  traits: string[]
  specialties: string[]
  flaws: string[]
  desires: string[]
  requirements: string[]
  conditions: string[]
  co_god_ids: string[]
  species_ids: string[]
}

const initial = (kind: EntityKind | undefined): FormState => ({
  summary: '',
  useAvatar: false,
  targetId: '',
  asVariant: false,
  name: '',
  description: '',
  image_key: '',
  faction_type: FACTION_TYPES[0],
  parent_civilization_id: '',
  kind: kind ?? 'creature',
  traits: [],
  specialties: [],
  flaws: [],
  desires: [],
  requirements: [],
  conditions: [],
  co_god_ids: [],
  species_ids: [],
})

export function ActionDialog({ action, me, onClose }: { action: ActionDef; me: Player; onClose: () => void }) {
  const game = useGameStore((s) => s.game)!
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)

  const [step, setStep] = useState<Step>('form')
  const [f, setF] = useState<FormState>(() => initial(action.entityKind))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roll, setRoll] = useState<ActionLog | null>(null)
  const [settled, setSettled] = useState(false)

  const era = game.era as Era
  const cost = costFor(action.key, era)
  const hasAvatar = entityGods.some((g) => g.player_id === me.id && entities.some((e) => e.id === g.entity_id && e.kind === 'avatar' && e.status === 'active'))
  const avatarFree = hasAvatar && !me.avatar_action_used

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  // candidate targets for "change" actions
  const targetKinds: EntityKind[] = useMemo(() => {
    switch (action.key) {
      case 'change_creature': return ['creature']
      case 'change_civilization': return ['civilization']
      case 'change_faction': return ['faction', 'orthodoxy']
      case 'resurrect_avatar': return ['avatar']
      default: return []
    }
  }, [action.key])
  const targets = entities.filter((e) => targetKinds.includes(e.kind) && (action.key === 'resurrect_avatar' ? e.status !== 'active' : true))
  const target = entities.find((e) => e.id === f.targetId) ?? null

  function loadTarget(id: string) {
    const t = entities.find((e) => e.id === id)
    if (!t) return set('targetId', id)
    setF((s) => ({
      ...s,
      targetId: id,
      name: t.name,
      description: t.description,
      image_key: t.image_key ?? '',
      faction_type: t.faction_type ?? FACTION_TYPES[0],
      parent_civilization_id: t.parent_civilization_id ?? '',
      kind: t.kind,
      traits: t.traits,
      specialties: t.specialties,
      flaws: t.flaws,
      desires: t.desires,
      requirements: t.requirements,
      conditions: t.conditions,
    }))
  }

  const civs = entities.filter((e) => e.kind === 'civilization')
  const sapient = entities.filter((e) => e.kind === 'creature' && e.traits.some((t) => SAPIENT_TRAITS.includes(t)))
  const others = players.filter((p) => p.id !== me.id)

  function buildEntity(): EntityPayload | undefined {
    if (!action.entityKind) return undefined
    const base = {
      name: f.name,
      description: f.description,
      image_key: f.image_key || undefined,
      traits: f.traits,
      specialties: f.specialties,
      flaws: f.flaws,
      desires: f.desires,
      requirements: f.requirements,
      conditions: f.conditions,
      co_god_ids: f.co_god_ids,
    }
    if (action.key === 'change_creature' && f.asVariant) {
      return { op: 'create', kind: 'creature', ...base, species_ids: f.targetId ? [f.targetId] : [] }
    }
    if (action.entityOp === 'create') {
      const kind = action.key === 'create_orthodoxy' ? 'orthodoxy' : action.entityKind
      return {
        op: 'create',
        kind,
        ...base,
        faction_type: kind === 'faction' || kind === 'orthodoxy' ? f.faction_type : undefined,
        parent_civilization_id: f.parent_civilization_id || null,
        species_ids: kind === 'civilization' ? f.species_ids : [],
      }
    }
    if (!f.targetId) return undefined
    return {
      op: 'update',
      id: f.targetId,
      ...base,
      kind: action.key === 'change_faction' ? f.kind : undefined,
      faction_type: f.kind === 'faction' || f.kind === 'orthodoxy' ? f.faction_type : undefined,
      parent_civilization_id: f.parent_civilization_id || null,
      status: action.key === 'resurrect_avatar' ? 'active' : undefined,
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const entity = buildEntity()
      if (action.entityOp === 'update' && !entity) throw new Error('Wybierz, co zmieniasz.')
      const payload: ActionPayload = { summary: f.summary.trim(), use_avatar_action: f.useAvatar, entity }
      await rpc('perform_action', { p_game_id: game.id, p_action_key: action.key, p_payload: payload })
      if (action.requiresRoll) setStep('roll')
      else onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doRoll() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<ActionLog>('log_dice_roll', { p_game_id: game.id, p_context: `${action.name}: rzut 2k6` })
      setRoll(r)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function adjust(delta: number, reason: string) {
    setBusy(true)
    setError(null)
    try {
      await rpc('adjust_logos', { p_game_id: game.id, p_delta: delta, p_reason: reason })
      setSettled(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function forcedRest() {
    setBusy(true)
    try {
      await rpc('rest', { p_game_id: game.id })
      setSettled(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const tier = roll?.roll?.tier
  const maxDie = roll?.roll ? Math.max(roll.roll.d1, roll.roll.d2) : 0

  // ---------- roll step ----------
  if (step === 'roll') {
    return (
      <Modal title={action.name} onClose={settled || !roll || action.key !== 'command_followers' ? onClose : undefined}>
        <div className={styles.rollStep}>
          <Notice tone="ok">Zapłacono {f.useAvatar ? 0 : cost} Logos. Teraz rzut 2k6.</Notice>
          <p className={styles.hint}>
            Możesz wydać dodatkowe Słowa jako modyfikator (do +3), zapłacić 5 za wynik 10+ albo przyjąć 6− bez rzutu.
            Inni mogą pomagać lub przeszkadzać w stosunku 2 za 1. Rozliczcie to przy stole; kości rzuca świątynia.
          </p>
          <div className={styles.diceRow}>
            {roll?.roll ? <Dice2d6 d1={roll.roll.d1} d2={roll.roll.d2} animateKey={roll.id} /> : <span className={styles.dicePlaceholder}>? ?</span>}
            <StoneButton variant="gold" disabled={busy} onClick={doRoll}>
              {roll ? 'Rzuć ponownie' : 'Rzuć 2k6'}
            </StoneButton>
          </div>
          {action.tiers && (
            <div className={styles.tiers}>
              <TierRow label="10+" text={action.tiers.strong} on={tier === 'strong'} />
              <TierRow label="7–9" text={action.tiers.mixed} on={tier === 'mixed'} />
              <TierRow label="6−" text={action.tiers.weak} on={tier === 'weak'} />
            </div>
          )}
          {action.key === 'command_followers' && roll?.roll && !settled && (
            <div className={styles.settle}>
              {tier !== 'weak' ? (
                <>
                  <StoneButton variant="gold" disabled={busy} onClick={() => adjust(maxDie + 1 + (tier === 'strong' ? 2 : 0), tier === 'strong' ? 'Żądanie daniny (10+): najwyższa kość + 1, zwrot 2 Słów' : 'Żądanie daniny: najwyższa kość + 1')}>
                    Żądanie daniny: +{maxDie + 1 + (tier === 'strong' ? 2 : 0)} Logos
                  </StoneButton>
                  <StoneButton disabled={busy} onClick={() => (tier === 'strong' ? adjust(2, 'Wielki czyn (10+): zwrot 2 Słów') : setSettled(true))}>
                    Wielki czyn{tier === 'strong' ? ' (+2 zwrotu)' : ''}
                  </StoneButton>
                </>
              ) : (
                <>
                  <StoneButton variant="lapis" disabled={busy} onClick={forcedRest}>
                    Zmuszony do Odpoczynku
                  </StoneButton>
                  <StoneButton variant="danger" disabled={busy || maxDie - 1 <= 0} onClick={() => adjust(-(maxDie - 1), 'Kara wyznawców: najwyższa kość − 1')}>
                    Strata: −{Math.max(0, maxDie - 1)} Logos
                  </StoneButton>
                </>
              )}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {(settled || action.key !== 'command_followers') && (
            <StoneButton onClick={onClose}>Zamknij</StoneButton>
          )}
        </div>
      </Modal>
    )
  }

  // ---------- form step ----------
  const needsTarget = action.entityOp === 'update'
  const canSubmit = !busy && (!needsTarget || !!f.targetId) && (!action.entityKind || action.entityOp === 'update' || f.name.trim().length > 0)

  return (
    <Modal title={action.name} onClose={onClose} wide={!!action.entityKind}>
      <div className={styles.form}>
        <p className={styles.summary}>{action.summary}</p>
        <div className={styles.costLine}>
          <span>
            Koszt w tej Erze: <b className="engraved">{f.useAvatar ? 0 : cost}</b> Logos (masz {me.logos})
          </span>
          {avatarFree && (
            <label className={styles.check}>
              <input type="checkbox" checked={f.useAvatar} onChange={(e) => set('useAvatar', e.target.checked)} />
              Darmowa akcja awatara (raz na rundę)
            </label>
          )}
        </div>

        {needsTarget && (
          <label className={fieldClass}>
            <span className={labelClass}>{action.key === 'resurrect_avatar' ? 'Poległy awatar' : 'Co zmieniasz'}</span>
            <select className={inputClass} value={f.targetId} onChange={(e) => loadTarget(e.target.value)}>
              <option value="">— wybierz —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({kindLabel(t.kind)})
                </option>
              ))}
            </select>
            {targets.length === 0 && <small className={styles.hint}>Nie ma jeszcze niczego, co dałoby się zmienić.</small>}
          </label>
        )}

        {action.key === 'change_creature' && target && (
          <label className={styles.check}>
            <input type="checkbox" checked={f.asVariant} onChange={(e) => set('asVariant', e.target.checked)} />
            Stwórz odmianę (nowa istota; zachowaj co najmniej 2 cechy, dodaj 1 nową)
          </label>
        )}

        {action.entityKind && (!needsTarget || target) && (
          <EntityFields
            action={action}
            f={f}
            set={set}
            civs={civs}
            sapient={sapient}
            others={others.map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))}
          />
        )}

        <TextArea
          id="summary"
          label={action.entityKind ? 'Opis w Kronice' : 'Co czynisz'}
          placeholder={placeholderFor(action)}
          value={f.summary}
          onChange={(e) => set('summary', e.target.value)}
        />

        {error && <Notice tone="error">{error}</Notice>}
        <div className={styles.footer}>
          <StoneButton onClick={onClose}>Odstąp</StoneButton>
          <StoneButton variant="gold" size="lg" disabled={!canSubmit} onClick={submit}>
            {busy ? 'Słowo pada…' : action.requiresRoll ? `Zapłać ${f.useAvatar ? 0 : cost} i rzuć` : `Zapłać ${f.useAvatar ? 0 : cost} Logos`}
          </StoneButton>
        </div>
      </div>
    </Modal>
  )
}

function TierRow({ label, text, on }: { label: string; text: string; on: boolean }) {
  return (
    <div className={[styles.tier, on ? styles.tierOn : ''].join(' ')}>
      <span className={['engraved', styles.tierLabel].join(' ')}>{label}</span>
      <span>{text}</span>
    </div>
  )
}

function placeholderFor(a: ActionDef): string {
  switch (a.key) {
    case 'shape_land': return 'Gdzie i co powstaje? Natychmiast czy przez dekady?'
    case 'change_biome': return 'Który obszar i w co się zmienia?'
    case 'catastrophe': return 'Co spotyka świat i dlaczego? Z zazdrości, sprawiedliwości czy z nudów?'
    case 'great_miracle': return 'Co WIELKIEGO staje się prawdą o całym świecie?'
    case 'command_avatar': return 'Który awatar, jaką akcję, jak jego uwarunkowania wpływają na scenę?'
    case 'command_followers': return 'Czego żądasz od wyznawców? Krótka scena.'
    case 'create_creature': return CREATURE_QUESTIONS.join(' ')
    default: return 'Jedna linijka do Kroniki.'
  }
}

export function kindLabel(k: EntityKind): string {
  return { creature: 'istota', civilization: 'cywilizacja', faction: 'frakcja', orthodoxy: 'ortodoksja', avatar: 'awatar' }[k]
}

// ---------- per-kind fields ----------
function EntityFields({
  action,
  f,
  set,
  civs,
  sapient,
  others,
}: {
  action: ActionDef
  f: FormState
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  civs: Entity[]
  sapient: Entity[]
  others: { id: string; label: string }[]
}) {
  const kind = action.key === 'change_faction' ? f.kind : action.key === 'create_orthodoxy' ? 'orthodoxy' : action.entityKind!
  const isNew = action.entityOp === 'create' || (action.key === 'change_creature' && f.asVariant)

  return (
    <div className={styles.fields}>
      <div className={styles.nameRow}>
        <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
        <label className={fieldClass}>
          <span className={labelClass}>Fresk</span>
          <div className={styles.frescoRow}>
            {ENTITY_FRESCOES.map((fr) => (
              <button
                key={fr.key}
                type="button"
                className={[styles.frescoBtn, f.image_key === fr.key ? styles.frescoOn : ''].join(' ')}
                onClick={() => set('image_key', fr.key)}
                title={fr.name}
              >
                <FrescoFrame src={frescoSrc(fr.key)} alt={fr.name} size={36} round aura={f.image_key === fr.key} />
              </button>
            ))}
          </div>
        </label>
      </div>

      <TextArea id="ent_desc" label="Opis" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={kind === 'creature' ? CREATURE_QUESTIONS.join(' ') : 'Jak wyglądają, jaka jest ich kultura, gdzie żyją?'} />

      {kind === 'creature' && <TraitPicker label="Cechy (do 3)" options={CREATURE_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={isNew ? 3 : undefined} />}

      {kind === 'civilization' && (
        <>
          <label className={fieldClass}>
            <span className={labelClass}>Gatunki (istoty rozumne lub o umyśle roju)</span>
            <MultiSelect options={sapient.map((s) => ({ id: s.id, label: s.name }))} value={f.species_ids} onChange={(v) => set('species_ids', v)} empty="Nie ma jeszcze rozumnych istot. Możesz stworzyć cywilizację i tak; dodaj gatunek później." />
          </label>
          <TraitPicker label="Cechy" options={CIV_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={isNew ? 3 : undefined} />
          <TraitPicker label="Specjalności" options={CIV_SPECIALTIES} value={f.specialties} onChange={(v) => set('specialties', v)} max={isNew ? 2 : undefined} tone="lapis" />
          <TraitPicker label="Braki" options={CIV_FLAWS} value={f.flaws} onChange={(v) => set('flaws', v)} tone="flaw" />
        </>
      )}

      {(kind === 'faction' || kind === 'orthodoxy') && (
        <>
          {action.key === 'change_faction' && (
            <label className={fieldClass}>
              <span className={labelClass}>Rodzaj</span>
              <select className={inputClass} value={f.kind} onChange={(e) => set('kind', e.target.value as EntityKind)}>
                <option value="faction">Frakcja (neutralna)</option>
                <option value="orthodoxy">Ortodoksja (czci twoje bóstwo)</option>
              </select>
            </label>
          )}
          <div className={styles.twoCol}>
            <label className={fieldClass}>
              <span className={labelClass}>Typ</span>
              <select className={inputClass} value={f.faction_type} onChange={(e) => set('faction_type', e.target.value)}>
                {FACTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Cywilizacja</span>
              <select className={inputClass} value={f.parent_civilization_id} onChange={(e) => set('parent_civilization_id', e.target.value)}>
                <option value="">— żadna / wiele —</option>
                {civs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TraitPicker label="Cechy" options={FACTION_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={isNew ? 2 : undefined} />
          <TraitPicker label="Pragnienia" options={FACTION_DESIRES} value={f.desires} onChange={(v) => set('desires', v)} tone="lapis" />
          {kind === 'orthodoxy' && (
            <TraitPicker
              label="Wymagania (2)"
              options={ORTHODOXY_REQUIREMENTS.map((r) => r.name)}
              value={f.requirements}
              onChange={(v) => set('requirements', v)}
              max={2}
              allowCustom={false}
              tone="gold"
            />
          )}
        </>
      )}

      {kind === 'avatar' && (
        <TraitPicker label="Uwarunkowania (1–3)" options={AVATAR_CONDITIONS} value={f.conditions} onChange={(v) => set('conditions', v)} max={3} />
      )}

      {(kind === 'avatar' || kind === 'orthodoxy' || kind === 'civilization') && others.length > 0 && isNew && (
        <label className={fieldClass}>
          <span className={labelClass}>Współtwórcy (bóstwa, które tworzą to razem z tobą)</span>
          <MultiSelect options={others} value={f.co_god_ids} onChange={(v) => set('co_god_ids', v)} />
        </label>
      )}
    </div>
  )
}

function MultiSelect({
  options,
  value,
  onChange,
  empty,
}: {
  options: { id: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  empty?: string
}) {
  if (options.length === 0) return <small className={styles.hint}>{empty ?? 'Brak.'}</small>
  return (
    <div className={styles.multi}>
      {options.map((o) => {
        const on = value.includes(o.id)
        return (
          <label key={o.id} className={[styles.multiItem, on ? styles.multiOn : ''].join(' ')}>
            <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))} />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}
