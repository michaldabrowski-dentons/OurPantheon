import { useMemo, useState, type ReactNode } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, ActionPayload, Entity, EntityKind, EntityPayload, Player } from '@/lib/types'
import { costFor, picksText, type ActionDef, type Era, type Tier, type TierPicks } from '@/data/actions'
import {
  AVATAR_CONDITIONS, CIV_FLAWS, CIV_SPECIALTIES, CIV_TRAITS, CREATURE_TRAITS,
  FACTION_DESIRES, FACTION_TRAITS, FACTION_TYPES, ORTHODOXY_REQUIREMENTS, SAPIENT_TRAITS,
} from '@/data/traits'
import { useGameStore, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice, Dice2d6, FrescoFrame, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { actionArt } from '@/data/actionArt'
import { TraitPicker } from '@/components/ui/TraitPicker'
import { ActionIcon } from '@/components/ui/ActionIcons'
import styles from './actions.module.css'

/**
 * Steps. An action without a roll: form -> done.
 * An action with a roll: setup (whose hands, what is changed) -> roll -> form (limits from the roll) -> done,
 * and Objawienie Wyznawcom ends with settling the tribute.
 */
type Step = 'setup' | 'roll' | 'form' | 'settle'

/** the avatar subtracts 2 from any roll it makes for its god */
const AVATAR_ROLL_PENALTY = -2

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

const initial = (kind: EntityKind | undefined, useAvatar: boolean): FormState => ({
  summary: '',
  useAvatar,
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

// a plain creature is not sapient; that is what Stworzenie Istoty Rozumnej is for
const PLAIN_CREATURE_TRAITS = CREATURE_TRAITS.filter((t) => !SAPIENT_TRAITS.includes(t))

export function ActionDialog({ action, me, onClose }: { action: ActionDef; me: Player; onClose: () => void }) {
  const game = useGameStore((s) => s.game)!
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const log = useGameStore((s) => s.log)

  const era = game.era as Era
  const cost = costFor(action.key, era)
  const affordable = me.logos >= cost
  const hasAvatar = entityGods.some((g) => g.player_id === me.id && entities.some((e) => e.id === g.entity_id && e.kind === 'avatar' && e.status === 'active'))
  const avatarFree = hasAvatar && !me.avatar_action_used
  // the rulebook's limits on the free action
  const isCreatureAction = action.key === 'create_creature' || action.key === 'create_sapient'
  const avatarMadeCreatureThisEra = log.some(
    (l) => l.is_avatar_free_action && l.player_id === me.id && l.era === game.era && (l.action_key === 'create_creature' || l.action_key === 'create_sapient'),
  )
  const avatarBlocked = isCreatureAction && avatarMadeCreatureThisEra
  const avatarNote = avatarBlocked
    ? 'Awatar stworzył już istotę w tej Erze. Może to zrobić tylko raz na Erę.'
    : action.key === 'great_miracle'
      ? 'Wielki Cud niszczy awatara. Trzeba go będzie wskrzesić.'
      : action.key === 'resurrect_avatar'
        ? 'Awatar poświęci samego siebie, by tamten mógł powrócić.'
        : action.requiresRoll
          ? 'Awatar odejmuje 2 od wyniku rzutu.'
          : null

  const [step, setStep] = useState<Step>(action.requiresRoll ? 'setup' : 'form')
  // when the Words are short, the only way is the avatar: start with it checked
  const [f, setF] = useState<FormState>(() => initial(action.entityKind, avatarFree && !avatarBlocked && !affordable))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roll, setRoll] = useState<ActionLog | null>(null)
  const [settled, setSettled] = useState(false)
  const [rules, setRules] = useState(false)

  const paid = f.useAvatar ? 0 : cost
  const canPay = f.useAvatar || affordable

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

  const tier = (roll?.roll?.tier ?? null) as Tier | null
  const picks: TierPicks | null = tier && action.picks ? action.picks[tier] : null
  const maxDie = roll?.roll ? Math.max(roll.roll.d1, roll.roll.d2) : 0
  const rollTotal = roll?.roll ? (roll.roll.total ?? roll.roll.d1 + roll.roll.d2 + (roll.roll.modifier ?? 0)) : 0

  function buildEntity(): EntityPayload | undefined {
    if (!action.entityKind) return undefined
    // a sapient creature always carries the trait that makes it one; a plain one never does
    const traits =
      action.key === 'create_sapient' && !f.traits.some((t) => SAPIENT_TRAITS.includes(t))
        ? [...f.traits, 'Rozumne']
        : action.key === 'create_creature'
          ? f.traits.filter((t) => !SAPIENT_TRAITS.includes(t))
          : f.traits
    const base = {
      name: f.name,
      description: f.description,
      image_key: f.image_key || undefined,
      traits,
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

  async function doRoll() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<ActionLog>('log_dice_roll', {
        p_game_id: game.id,
        p_context: action.name,
        p_modifier: f.useAvatar ? AVATAR_ROLL_PENALTY : 0,
      })
      setRoll(r)
      setStep('roll')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const entity = buildEntity()
      if (action.entityOp === 'update' && !entity) throw new Error('Wybierz, co zmieniasz.')
      // one description: it is the entity's and it is the Chronicle line
      const summary = (action.entityKind ? f.description : f.summary).trim()
      const payload: ActionPayload = { summary, use_avatar_action: f.useAvatar, entity }
      await rpc('perform_action', { p_game_id: game.id, p_action_key: action.key, p_payload: payload })
      if (action.key === 'command_followers' && roll) setStep('settle')
      else onClose()
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

  const title = (
    <span className={styles.titleRow}>
      <ActionIcon k={action.key} size={26} className={styles.titleIcon} />
      {action.name}
    </span>
  )

  const shell = (children: ReactNode, closable: (() => void) | undefined, sealLabel: string, lead: ReactNode) => (
    <Modal title={title} onClose={closable} wide={rules || !!action.entityKind}>
      <div className={styles.withRules}>
        <RulesAside action={action} era={era} open={rules} onHide={() => setRules(false)} />
        <div className={styles.main}>
          <div className={styles.mainHead}>
            <FrescoFrame src={actionArt(action.key)} alt={action.name} size={128} className={styles.plate} />
            <div className={styles.mainLead}>
              <button type="button" className={styles.rulesToggle} aria-expanded={rules} onClick={() => setRules((v) => !v)}>
                {rules ? '✕ Ukryj zasady' : '☰ Pokaż pełne zasady tej akcji'}
              </button>
              {lead}
            </div>
            <CostSeal label={sealLabel} cost={paid} have={me.logos} free={f.useAvatar} />
          </div>
          {children}
        </div>
      </div>
    </Modal>
  )

  const avatarRow = avatarFree && (
    <div className={styles.avatarRow}>
      <label className={styles.check}>
        <input type="checkbox" checked={f.useAvatar} disabled={avatarBlocked} onChange={(e) => set('useAvatar', e.target.checked)} />
        Darmowa akcja awatara (raz na rundę)
      </label>
      {avatarNote && <small className={styles.avatarNote}>{avatarNote}</small>}
      {!affordable && !f.useAvatar && <small className={styles.avatarNote}>Masz za mało Logos: to słowo padnie tylko przez awatara.</small>}
    </div>
  )

  const needsTarget = action.entityOp === 'update'
  const targetField = needsTarget && (
    <label className={fieldClass}>
      <span className={labelClass}>{action.key === 'resurrect_avatar' ? 'Poległy awatar' : 'Co zmieniasz'}</span>
      <select className={inputClass} value={f.targetId} onChange={(e) => loadTarget(e.target.value)}>
        <option value="">wybierz…</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({kindLabel(t.kind)})
          </option>
        ))}
      </select>
      {targets.length === 0 && <small className={styles.hint}>Nie ma jeszcze niczego, co dałoby się zmienić.</small>}
    </label>
  )

  // ---------- setup: whose hands, what is changed; then the dice ----------
  if (step === 'setup') {
    return shell(
      <div className={styles.form}>
        {avatarRow}
        {targetField}
        <p className={styles.hint}>
          Najpierw rzut, potem opis i cechy: to, co wyrzucisz, mówi, ile możesz wybrać. Możesz wydać dodatkowe Słowa jako
          modyfikator (do +3), zapłacić 5 za wynik 10+ albo przyjąć 6− bez rzutu; inni mogą pomagać lub przeszkadzać
          w stosunku 2 za 1. Rozliczcie to przy stole. Zapłacisz dopiero na końcu.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className={styles.footer}>
          <StoneButton onClick={onClose}>Odstąp</StoneButton>
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay || (needsTarget && !f.targetId)} onClick={doRoll}>
            {busy ? 'Kości lecą…' : f.useAvatar ? 'Rzuć 2k6 (awatar, −2)' : 'Rzuć 2k6'}
          </StoneButton>
        </div>
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- roll: the dice, the tiers, then on to the form ----------
  if (step === 'roll') {
    return shell(
      <div className={styles.rollStep}>
        <div className={styles.diceRow}>
          {roll?.roll ? (
            <>
              <Dice2d6 d1={roll.roll.d1} d2={roll.roll.d2} showTotal={false} animateKey={roll.id} />
              <span className={styles.rollTotal}>
                <b className="engraved">{rollTotal}</b>
                {roll.roll.modifier ? <small>{roll.roll.d1} + {roll.roll.d2} {roll.roll.modifier < 0 ? '−' : '+'} {Math.abs(roll.roll.modifier)}</small> : null}
              </span>
            </>
          ) : (
            <span className={styles.dicePlaceholder}>? ?</span>
          )}
          <StoneButton disabled={busy} onClick={doRoll} title="Tylko gdy stół tak postanowi.">
            Rzuć ponownie
          </StoneButton>
        </div>
        {action.tiers && (
          <div className={styles.tiers}>
            <TierRow label="10+" text={action.tiers.strong} on={tier === 'strong'} />
            <TierRow label="7–9" text={action.tiers.mixed} on={tier === 'mixed'} />
            <TierRow label="6−" text={action.tiers.weak} on={tier === 'weak'} />
          </div>
        )}
        {picks && <PicksNotice picks={picks} />}
        {error && <Notice tone="error">{error}</Notice>}
        <div className={styles.footer}>
          <StoneButton onClick={onClose}>Odstąp</StoneButton>
          <StoneButton variant="gold" size="lg" disabled={busy || !roll} onClick={() => setStep('form')}>
            Dalej: opisz i wybierz
          </StoneButton>
        </div>
      </div>,
      onClose,
      'Koszt',
      <Notice tone="ok">Kości rzucone{f.useAvatar ? ' rękami awatara, z −2' : ''}. Zapłacisz, gdy skończysz.</Notice>,
    )
  }

  // ---------- settle: Objawienie Wyznawcom after paying ----------
  if (step === 'settle') {
    return shell(
      <div className={styles.rollStep}>
        {roll?.roll && !settled && (
          <div className={styles.settle}>
            {tier !== 'weak' ? (
              <>
                <StoneButton variant="gold" disabled={busy} onClick={() => adjust(maxDie + 1 + (tier === 'strong' ? 2 : 0), tier === 'strong' ? 'Wyznawcy składają daninę: najwyższa kość i jedno Słowo więcej, a wydane Słowa wracają.' : 'Wyznawcy składają daninę: najwyższa kość i jedno Słowo więcej.')}>
                  Żądanie daniny: +{maxDie + 1 + (tier === 'strong' ? 2 : 0)} Logos
                </StoneButton>
                <StoneButton disabled={busy} onClick={() => (tier === 'strong' ? adjust(2, 'Wyznawcy podejmują wielki czyn, a wydane Słowa wracają.') : setSettled(true))}>
                  Wielki czyn{tier === 'strong' ? ' (+2 zwrotu)' : ''}
                </StoneButton>
              </>
            ) : (
              <>
                <StoneButton variant="lapis" disabled={busy} onClick={forcedRest}>
                  Zmuszony do Odpoczynku
                </StoneButton>
                <StoneButton variant="danger" disabled={busy || maxDie - 1 <= 0} onClick={() => adjust(-(maxDie - 1), 'Wyznawcy zawodzą: najwyższa kość bez jednego.')}>
                  Strata: −{Math.max(0, maxDie - 1)} Logos
                </StoneButton>
              </>
            )}
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {settled && <StoneButton onClick={onClose}>Zamknij</StoneButton>}
      </div>,
      settled ? onClose : undefined,
      'Zapłacono',
      <Notice tone="ok">Słowo padło. Rozlicz, co przyniosło objawienie.</Notice>,
    )
  }

  // ---------- form ----------
  const needsConditions = action.key === 'create_avatar'
  const canSubmit =
    !busy &&
    canPay &&
    (!needsTarget || !!f.targetId) &&
    (!action.entityKind || action.entityOp === 'update' || f.name.trim().length > 0) &&
    (!needsConditions || (f.conditions.length >= 1 && f.conditions.length <= 3))

  return shell(
    <div className={styles.form}>
      {!action.requiresRoll && avatarRow}
      {!action.requiresRoll && targetField}

      {action.key === 'change_creature' && target && (
        <label className={styles.check}>
          <input type="checkbox" checked={f.asVariant} onChange={(e) => set('asVariant', e.target.checked)} />
          Stwórz odmianę (nowa istota; zachowaj co najmniej 2 cechy, dodaj 1 nową)
        </label>
      )}

      {picks && <PicksNotice picks={picks} />}
      {action.requiresRoll && tier && !picks && action.tiers && (
        <Notice tone="ok">{action.tiers[tier]}</Notice>
      )}

      {action.entityKind && (!needsTarget || target) && (
        <EntityFields
          action={action}
          f={f}
          set={set}
          picks={picks}
          civs={civs}
          sapient={sapient}
          others={others.map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))}
        />
      )}

      {!action.entityKind && (
        <TextArea id="summary" label="Opis" placeholder={placeholderFor(action)} value={f.summary} onChange={(e) => set('summary', e.target.value)} />
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className={styles.footer}>
        <StoneButton onClick={onClose}>Odstąp</StoneButton>
        <StoneButton
          variant="gold"
          size="lg"
          disabled={!canSubmit}
          title={!canPay ? 'Za mało Logos. Zaznacz darmową akcję awatara albo odstąp.' : undefined}
          onClick={submit}
        >
          {busy ? 'Słowo pada…' : f.useAvatar ? 'Czyń przez awatara (0 Logos)' : `Zapłać ${paid} Logos`}
        </StoneButton>
      </div>
    </div>,
    onClose,
    'Koszt',
    <p className={styles.summary}>{action.summary}</p>,
  )
}

/** Tells the table what the roll allows, and what the other players choose for you. */
function PicksNotice({ picks }: { picks: TierPicks }) {
  const t = picksText(picks)
  return (
    <Notice tone="ok">
      <b>Ty wybierasz:</b> {t.mine}.
      {t.others && (
        <>
          {' '}
          <b>Pozostali gracze wybierają:</b> {t.others}. Ustalcie przy stole, kto co dodaje, i kliknij to za nich.
        </>
      )}
    </Notice>
  )
}

/** A marble medallion in the top right corner: only the cost, carved in gold. */
function CostSeal({ label, cost, have, free }: { label: string; cost: number; have: number; free: boolean }) {
  const over = cost > have
  return (
    <div
      className={[styles.seal, over ? styles.sealOver : '', free ? styles.sealFree : ''].join(' ')}
      role="status"
      aria-label={`${label}: ${cost} Logos, masz ${have}`}
      title={free ? 'Darmowa akcja awatara' : over ? `Brakuje ${cost - have} Logos` : `${label}: ${cost} Logos (masz ${have})`}
    >
      <span className={styles.sealCost}>{cost}</span>
    </div>
  )
}

/** The rulebook text for this action; slides in beside the form. Always mounted so it can animate. */
function RulesAside({ action, era, open, onHide }: { action: ActionDef; era: Era; open: boolean; onHide: () => void }) {
  return (
    <aside className={[styles.rules, open ? styles.rulesShown : ''].join(' ')} aria-label="Zasady akcji" aria-hidden={!open}>
      <div className={styles.rulesInner}>
        <div className={styles.rulesHead}>
          <h4 className="engraved">Zasady</h4>
          <button type="button" className={styles.rulesToggle} onClick={onHide} tabIndex={open ? 0 : -1}>
            ✕ Ukryj
          </button>
        </div>
        <div className={styles.rulesCosts} aria-label="Koszt">
          {([1, 2, 3] as Era[]).map((e) => (
            <span key={e} className={e === era ? styles.rulesCostNow : ''}>
              {action.costs[e - 1]}
            </span>
          ))}
        </div>
        {action.requirement && <p className={styles.rulesReq}>Warunek: {action.requirement.text}.</p>}
        {action.requiresRoll && <p className={styles.rulesReq}>Wymaga rzutu 2k6 + Słowa (do +3).</p>}
        {action.details.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {action.tiers && (
          <dl className={styles.rulesTiers}>
            <dt>10+</dt>
            <dd>{action.tiers.strong}</dd>
            <dt>7–9</dt>
            <dd>{action.tiers.mixed}</dd>
            <dt>6−</dt>
            <dd>{action.tiers.weak}</dd>
          </dl>
        )}
      </div>
    </aside>
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
    case 'shape_land': return 'Krótko: gdzie i co powstaje.'
    case 'change_biome': return 'Krótko: który obszar i w co się zmienia.'
    case 'catastrophe': return 'Krótko: co spotyka świat i dlaczego.'
    case 'great_miracle': return 'Krótko: co staje się prawdą o całym świecie.'
    case 'command_avatar': return 'Krótko: który awatar i co czyni.'
    case 'command_followers': return 'Krótko: czego żądasz od wyznawców.'
    default: return 'Jedno, dwa zdania do Świętej Księgi.'
  }
}

export function kindLabel(k: EntityKind): string {
  return { creature: 'istota', civilization: 'cywilizacja', faction: 'frakcja', orthodoxy: 'religia', avatar: 'awatar' }[k]
}

// ---------- per-kind fields ----------
function EntityFields({
  action,
  f,
  set,
  picks,
  civs,
  sapient,
  others,
}: {
  action: ActionDef
  f: FormState
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  picks: TierPicks | null
  civs: Entity[]
  sapient: Entity[]
  others: { id: string; label: string }[]
}) {
  const kind = action.key === 'change_faction' ? f.kind : action.key === 'create_orthodoxy' ? 'orthodoxy' : action.entityKind!
  const isNew = action.entityOp === 'create' || (action.key === 'change_creature' && f.asVariant)
  // limits from the roll: mine plus what the others add through my hands
  const lim = (own?: number, other?: number, fallback?: number) => (picks ? (own ?? 0) + (other ?? 0) || undefined : fallback)
  const traitMax = lim(picks?.traits, picks?.otherTraits, isNew ? (kind === 'faction' || kind === 'orthodoxy' ? 2 : 3) : undefined)
  const specMax = lim(picks?.specialties, undefined, isNew ? 2 : undefined)
  const flawMax = lim(picks?.flaws, picks?.otherFlaws, undefined)
  const desireMax = lim(picks?.desires, picks?.otherDesires, undefined)
  const count = (n?: number) => (n ? ` (${n})` : '')

  return (
    <div className={styles.fields}>
      <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />

      <TextArea
        id="ent_desc"
        label="Opis (trafi też do Świętej Księgi)"
        value={f.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder={kind === 'creature' ? 'Krótko: gdzie żyją, jak wyglądają, co im zagraża.' : 'Krótko: jacy są i gdzie żyją.'}
      />

      {kind === 'creature' && (
        <TraitPicker
          label={action.key === 'create_sapient' ? 'Cechy (do 3; „Rozumne” dochodzi samo)' : 'Cechy (do 3)'}
          options={action.key === 'create_creature' ? PLAIN_CREATURE_TRAITS : CREATURE_TRAITS}
          value={f.traits}
          onChange={(v) => set('traits', v)}
          max={isNew ? 3 : undefined}
        />
      )}

      {kind === 'civilization' && (
        <>
          <label className={fieldClass}>
            <span className={labelClass}>Gatunki (istoty rozumne lub o umyśle roju)</span>
            <MultiSelect options={sapient.map((s) => ({ id: s.id, label: s.name }))} value={f.species_ids} onChange={(v) => set('species_ids', v)} empty="Nie ma jeszcze rozumnych istot. Możesz stworzyć cywilizację i tak; dodaj gatunek później." />
          </label>
          <TraitPicker label={`Cechy${count(traitMax)}`} options={CIV_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={traitMax} />
          <TraitPicker label={`Specjalności${count(specMax)}`} options={CIV_SPECIALTIES} value={f.specialties} onChange={(v) => set('specialties', v)} max={specMax} tone="lapis" />
          <TraitPicker label={`Braki${count(flawMax)}`} options={CIV_FLAWS} value={f.flaws} onChange={(v) => set('flaws', v)} max={flawMax} tone="flaw" />
        </>
      )}

      {(kind === 'faction' || kind === 'orthodoxy') && (
        <>
          {action.key === 'change_faction' && (
            <label className={fieldClass}>
              <span className={labelClass}>Rodzaj</span>
              <select className={inputClass} value={f.kind} onChange={(e) => set('kind', e.target.value as EntityKind)}>
                <option value="faction">Frakcja (neutralna)</option>
                <option value="orthodoxy">Religia (czci twoje bóstwo)</option>
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
                <option value="">żadna albo wiele</option>
                {civs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TraitPicker label={`Cechy${count(traitMax)}`} options={FACTION_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={traitMax} />
          <TraitPicker label={`Pragnienia${count(desireMax)}`} options={FACTION_DESIRES} value={f.desires} onChange={(v) => set('desires', v)} max={desireMax} tone="lapis" />
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
        <TraitPicker label="Uwarunkowania (od 1 do 3, obowiązkowe)" options={AVATAR_CONDITIONS} value={f.conditions} onChange={(v) => set('conditions', v)} max={3} />
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
