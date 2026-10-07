import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, ActionPayload, AttrKey, BiomeKey, Entity, EntityKind, HexRef, Player } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { hexDistance } from '@/lib/hex'
import { costFor, picksText, type ActionDef, type Era, type FlowStep, type Tier, type TierPicks } from '@/data/actions'
import { AVATAR_CONDITIONS, CIV_FLAWS, CIV_SPECIALTIES, CIV_TRAITS, CREATURE_TRAITS, SAPIENT_TRAITS } from '@/data/traits'
import { BIOMES, BIOME_BY_KEY, CATASTROPHE_TYPES } from '@/data/biomes'
import { AVATAR_EMOJI, CREATURE_EMOJI, SAPIENT_EMOJI } from '@/data/emoji'
import { ATTRIBUTE_BY_KEY, scoreText, scoresFor } from '@/data/pantheon'
import { composeVerse } from '@/data/chronicle'
import { draftDeedSummary } from '@/data/draft'
import { describeEvent } from '@/data/tableEvents'
import { followersWord } from '@/data/cities'
import { useGameStore, playerLabel, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice, Dice2d6, FrescoFrame, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { actionArt } from '@/data/actionArt'
import { TraitPicker } from '@/components/ui/TraitPicker'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { ActionIcon } from '@/components/ui/ActionIcons'
import { useMapMode, type MapMode } from '../map/mapMode'
import { useWorld } from '../map/useWorld'
import styles from './actions.module.css'

/** the avatar subtracts 2 from any roll it makes for its god */
const AVATAR_ROLL_PENALTY = -2

interface FormState {
  useAvatar: boolean
  name: string
  description: string
  traits: string[]
  specialties: string[]
  flaws: string[]
  conditions: string[]
  co_god_ids: string[]
  emoji: string
  biome: BiomeKey
  catastrophe: string
  hexes: HexRef[]
  /** the clicked field: where a thing appears, where the blow lands, where people go */
  target: HexRef | null
  occupantId: string
  from: HexRef | null
  cityId: string
  targetCityId: string
  speciesId: string
  attr: AttrKey
  gift: string
  dots: number
  army: number
  defenderId: string
  avatarId: string
  moveAvatar: boolean
  summary: string
  deadAvatarId: string
}

const initial = (useAvatar: boolean): FormState => ({
  useAvatar,
  name: '',
  description: '',
  traits: [],
  specialties: [],
  flaws: [],
  conditions: [],
  co_god_ids: [],
  emoji: '',
  biome: 'trawa',
  catastrophe: CATASTROPHE_TYPES[0],
  hexes: [],
  target: null,
  occupantId: '',
  from: null,
  cityId: '',
  targetCityId: '',
  speciesId: '',
  attr: 'grace',
  gift: '',
  dots: 1,
  army: 1,
  defenderId: '',
  avatarId: '',
  moveAvatar: false,
  summary: '',
  deadAvatarId: '',
})

// a plain creature is not sapient; that is what Stworzenie Istoty Rozumnej is for
const PLAIN_CREATURE_TRAITS = CREATURE_TRAITS.filter((t) => !SAPIENT_TRAITS.includes(t))

const avatarAt = (w: WorldView, q: number, r: number) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'avatar')

export function ActionDialog({ action, me, onClose }: { action: ActionDef; me: Player; onClose: () => void }) {
  const game = useGameStore((s) => s.game)!
  const entities = useGameStore((s) => s.entities)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const log = useGameStore((s) => s.log)
  const world = useWorld()
  const setMode = useMapMode((s) => s.setMode)

  const era = game.era as Era
  const baseCost = costFor(action.key, era)
  const myAvatars = world.avatarsOf(me.id)
  const hasAvatar = myAvatars.length > 0
  const avatarFree = hasAvatar && !me.avatar_action_used
  // the rulebook's limits on the free action
  const isCreatureAction = action.key === 'create_creature' || action.key === 'create_sapient'
  const avatarMadeCreatureThisEra = log.some(
    (l) => l.is_avatar_free_action && l.player_id === me.id && l.era === game.era && (l.action_key === 'create_creature' || l.action_key === 'create_sapient'),
  )
  const avatarBlocked = (isCreatureAction && avatarMadeCreatureThisEra) || action.contested === true
  const avatarNote = avatarBlocked
    ? action.contested
      ? 'Starcia toczą bóstwa same.'
      : 'Awatar stworzył już istotę w tej Erze. Może to zrobić tylko raz na Erę.'
    : action.key === 'great_miracle'
      ? 'Wielki Cud niszczy awatara. Trzeba go będzie wskrzesić.'
      : action.key === 'resurrect_avatar'
        ? 'Awatar poświęci samego siebie, by tamten mógł powrócić.'
        : action.requiresRoll || action.key === 'develop_civilization'
          ? 'Awatar odejmuje 2 od wyniku rzutu.'
          : null

  const flow = action.flow
  const [stepIdx, setStepIdx] = useState(0)
  const step: FlowStep = flow[stepIdx]
  const [f, setF] = useState<FormState>(() => {
    const s = initial(avatarFree && !avatarBlocked && me.logos < baseCost)
    if (action.key === 'command_avatar') s.avatarId = myAvatars[0]?.entity.id ?? ''
    if (action.key === 'resurrect_avatar') s.deadAvatarId = entities.find((e) => e.kind === 'avatar' && e.status !== 'active')?.id ?? ''
    if (action.key === 'convert') s.attr = 'majesty'
    return s
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roll, setRoll] = useState<ActionLog | null>(null)
  const [rules, setRules] = useState(false)
  const [row, setRow] = useState<ActionLog | null>(null)
  const [verse, setVerse] = useState('')
  const [verseEdited, setVerseEdited] = useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const god = { name: me.god_name?.trim() || 'bóstwo', gender: me.god_gender ?? 'm' }
  const scores = scoresFor(me.domain_key, me.attr_primary, me.attr_bonus)
  const others = players.filter((p) => p.id !== me.id)

  // ---------- distance and cost ----------
  const srcCity = f.cityId ? world.cityOf(f.cityId) : undefined
  const avatarOcc = f.avatarId ? world.occupantsOf(f.avatarId)[0] : undefined
  const distance = (() => {
    switch (action.key) {
      case 'migrate':
        return f.from && f.target ? hexDistance(f.from, f.target) : 0
      case 'exodus':
        return srcCity && f.target ? hexDistance(srcCity, f.target) : 0
      case 'holy_war': {
        const t = f.targetCityId ? world.cityOf(f.targetCityId) : undefined
        return srcCity && t ? hexDistance(srcCity, t) : 0
      }
      case 'command_avatar':
        return f.moveAvatar && avatarOcc && f.target ? hexDistance(avatarOcc, f.target) : 0
      default:
        return 0
    }
  })()
  const cost = baseCost + distance
  const paid = f.useAvatar ? 0 : cost
  const canPay = f.useAvatar || me.logos >= cost

  // ---------- the map's questions ----------
  const mapOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'map').length
  const skipMap = (i: number) => flow[i] === 'map' && action.key === 'command_avatar' && !f.moveAvatar

  function advance(from: number) {
    let i = from + 1
    while (i < flow.length && skipMap(i)) i++
    if (i >= flow.length) onClose()
    else setStepIdx(i)
  }

  function mapSpec(): Omit<MapMode, 'onFinish' | 'onCancel'> | null {
    const key = action.key
    const biomeName = BIOME_BY_KEY[f.biome].name.toLowerCase()
    switch (key) {
      case 'shape_land':
        return {
          kind: 'hexes',
          max: 3,
          contiguous: true,
          title: 'Kształtowanie Lądów',
          instruction: `Kliknij do trzech sąsiadujących heksów, które staną się terenem: ${biomeName}. Trzeci klik kończy akcję sam.`,
          valid: (q, r, w) => !(BIOME_BY_KEY[f.biome].blocked && (!!w.cityAt(q, r) || avatarAt(w, q, r))),
        }
      case 'catastrophe':
        return { kind: 'hex', title: 'Kataklizm', instruction: `Kliknij heks, w który uderza: ${f.catastrophe.toLowerCase()}.`, valid: () => true }
      case 'create_creature':
      case 'create_sapient':
        return { kind: 'hex', title: action.name, instruction: `Kliknij heks z wolnym miejscem, na którym pojawią się ${f.name.trim() || 'nowe istoty'}.`, valid: (q, r, w) => w.freeSlot(q, r) !== null }
      case 'create_avatar':
      case 'resurrect_avatar':
        return { kind: 'hex', title: action.name, instruction: 'Kliknij heks, na którym staje awatar: wolne miejsce, nie Woda, nie Góry.', valid: (q, r, w) => w.freeSlot(q, r) !== null && !w.blocked(q, r) }
      case 'change_creature':
        return {
          kind: 'occupant',
          title: 'Zmiana Istoty',
          instruction: 'Kliknij istotę, która się odmieni. Zmienia się tylko ona, tylko na tym jednym heksie.',
          valid: (q, r, w) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'),
          validOccupant: (o, w) => w.entityById(o.entity_id)?.kind === 'creature',
        }
      case 'migrate':
        if (mapOrdinal === 0) {
          return {
            kind: 'occupant',
            title: 'Migracja',
            instruction: 'Kliknij istotę, która się rozprzestrzenia.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'),
            validOccupant: (o, w) => w.entityById(o.entity_id)?.kind === 'creature',
          }
        }
        return {
          kind: 'hex',
          title: 'Migracja',
          instruction: `Kliknij heks, na który rozejdą się ${world.entityById(f.speciesId)?.name ?? 'istoty'}: wolne miejsce, bez tego gatunku. 1 Logos za każdy heks dystansu.`,
          valid: (q, r, w) => w.freeSlot(q, r) !== null && !w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId) && (!f.from || hexDistance(f.from, { q, r }) >= 1),
          costFor: (sel) => (f.from && sel[0] ? hexDistance(f.from, sel[0]) : null),
        }
      case 'create_civilization':
        return {
          kind: 'hex',
          title: 'Stworzenie Cywilizacji',
          instruction: 'Kliknij heks, na którym żyje istota rozumna i nie stoi jeszcze miasto (nie Wodę, nie Góry).',
          valid: (q, r, w) => !w.blocked(q, r) && !w.cityAt(q, r) && w.occupantsAt(q, r).some((o) => w.isSapient(w.entityById(o.entity_id))),
        }
      case 'develop_civilization':
        return { kind: 'city', title: 'Rozwój Cywilizacji', instruction: 'Kliknij miasto, któremu niesiesz dar.', valid: (q, r, w) => !!w.cityAt(q, r) }
      case 'exodus':
        if (mapOrdinal === 0) {
          return { kind: 'city', title: 'Exodus', instruction: 'Kliknij miasto, w którym masz wyznawców.', valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.dotsOf(c.entity_id, me.id) > 0 } }
        }
        return {
          kind: 'hex',
          title: 'Exodus',
          instruction: `Kliknij heks, dokąd idzie ${followersWord(f.dots)}: nie Wodę, nie Góry. Na wolne pole albo do innego miasta. 1 Logos za każdy heks.`,
          valid: (q, r, w) => !w.blocked(q, r) && (!srcCity || hexDistance(srcCity, { q, r }) >= 1) && (!!w.cityAt(q, r) || w.freeSlot(q, r) !== null || w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId)),
          costFor: (sel) => (srcCity && sel[0] ? hexDistance(srcCity, sel[0]) : null),
        }
      case 'convert':
        return { kind: 'city', title: 'Nawracanie', instruction: 'Kliknij miasto, w którym inne bóstwo ma wyznawców.', valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.followersOf(c.entity_id).some((x) => x.player_id !== me.id) } }
      case 'holy_war':
        if (mapOrdinal === 0) {
          return { kind: 'city', title: 'Święta Wojna', instruction: 'Kliknij swoje miasto: to, w którym masz najwięcej wyznawców (co najmniej dwóch, bo jeden zostaje).', valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.holds(c.entity_id, me.id) && w.dotsOf(c.entity_id, me.id) >= 2 } }
        }
        return {
          kind: 'city',
          title: 'Święta Wojna',
          instruction: `Kliknij miasto, na które rusza armia (${followersWord(f.army)}). 1 Logos za każdy heks między miastami.`,
          valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && c.entity_id !== f.cityId && w.followersOf(c.entity_id).some((x) => x.player_id !== me.id) },
          costFor: (sel) => (srcCity && sel[0] ? hexDistance(srcCity, sel[0]) : null),
        }
      case 'command_avatar':
        return {
          kind: 'hex',
          title: 'Rozkaz dla Awatara',
          instruction: 'Kliknij heks do trzech pól od awatara: wolne miejsce, nie Woda, nie Góry. 1 Logos za każdy heks.',
          valid: (q, r, w) => !w.blocked(q, r) && w.freeSlot(q, r) !== null && !!avatarOcc && hexDistance(avatarOcc, { q, r }) >= 1 && hexDistance(avatarOcc, { q, r }) <= 3,
          costFor: (sel) => (avatarOcc && sel[0] ? hexDistance(avatarOcc, sel[0]) : null),
        }
      default:
        return null
    }
  }

  function applyPicks(picks: MapPick[]) {
    const p = picks[0]
    setF((s) => {
      const n = { ...s }
      switch (action.key) {
        case 'shape_land':
          n.hexes = picks.map(({ q, r }) => ({ q, r }))
          break
        case 'change_creature': {
          n.occupantId = p.occupantId ?? ''
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          const src = occ ? world.entityById(occ.entity_id) : undefined
          if (src) {
            n.speciesId = src.id
            n.name = `${src.name} (odmiana)`
            n.traits = src.traits
          }
          break
        }
        case 'migrate':
          if (mapOrdinal === 0) {
            n.occupantId = p.occupantId ?? ''
            const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
            n.speciesId = occ?.entity_id ?? ''
            n.from = { q: p.q, r: p.r }
          } else n.target = { q: p.q, r: p.r }
          break
        case 'create_civilization': {
          n.target = { q: p.q, r: p.r }
          const sap = world.occupantsAt(p.q, p.r).map((o) => world.entityById(o.entity_id)).filter((e) => world.isSapient(e))
          n.speciesId = sap[0]?.id ?? ''
          break
        }
        case 'develop_civilization':
        case 'convert':
          n.cityId = p.cityId ?? ''
          break
        case 'exodus':
          if (mapOrdinal === 0) {
            n.cityId = p.cityId ?? ''
            const c = world.cityOf(p.cityId ?? '')
            const sap = c ? world.occupantsAt(c.q, c.r).map((o) => world.entityById(o.entity_id)).filter((e) => world.isSapient(e)) : []
            n.speciesId = sap[0]?.id ?? ''
            n.dots = Math.max(1, Math.min(n.dots, world.dotsOf(p.cityId ?? '', me.id)))
          } else n.target = { q: p.q, r: p.r }
          break
        case 'holy_war':
          if (mapOrdinal === 0) {
            n.cityId = p.cityId ?? ''
            n.army = Math.max(1, Math.min(n.army, world.dotsOf(p.cityId ?? '', me.id) - 1))
          } else {
            n.targetCityId = p.cityId ?? ''
            const rivals = world.followersOf(p.cityId ?? '').filter((x) => x.player_id !== me.id)
            n.defenderId = rivals[0]?.player_id ?? ''
          }
          break
        default:
          n.target = { q: p.q, r: p.r }
      }
      return n
    })
  }

  // hand the question to the map when a map step begins; take it back when the window goes
  useEffect(() => {
    if (step !== 'map') return
    const spec = mapSpec()
    if (!spec) {
      advance(stepIdx)
      return
    }
    setMode({
      ...spec,
      onFinish: (picks) => {
        applyPicks(picks)
        advance(stepIdx)
      },
      onCancel: onClose,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepIdx])
  useEffect(() => () => setMode(null), [setMode])

  // ---------- the dice (Stworzenie Cywilizacji) ----------
  const tier = (roll?.roll?.tier ?? null) as Tier | null
  const picks: TierPicks | null = tier && action.picks ? action.picks[tier] : null
  const rollTotal = roll?.roll ? (roll.roll.total ?? roll.roll.d1 + roll.roll.d2 + (roll.roll.modifier ?? 0)) : 0

  async function doRoll() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<ActionLog>('log_dice_roll', { p_game_id: game.id, p_context: action.name, p_modifier: f.useAvatar ? AVATAR_ROLL_PENALTY : 0 })
      setRoll(r)
      if (step === 'setup') advance(stepIdx)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- the payload ----------
  function buildPayload(): ActionPayload {
    const base: ActionPayload = { use_avatar_action: f.useAvatar, summary: '' }
    const t = f.target ?? { q: 0, r: 0 }
    switch (action.key) {
      case 'shape_land':
        return { ...base, biome: f.biome, hexes: f.hexes }
      case 'catastrophe':
        return { ...base, type: f.catastrophe.trim(), q: t.q, r: t.r }
      case 'great_miracle':
        return base
      case 'create_creature':
        return { ...base, entity: { op: 'create', name: f.name, traits: f.traits.filter((x) => !SAPIENT_TRAITS.includes(x)), co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'create_sapient':
        return { ...base, entity: { op: 'create', name: f.name, traits: f.traits.some((x) => SAPIENT_TRAITS.includes(x)) ? f.traits : [...f.traits, 'Rozumne'], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'create_avatar':
        return { ...base, entity: { op: 'create', name: f.name, conditions: f.conditions, co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'change_creature':
        return { ...base, occupant_id: f.occupantId, entity: { op: 'create', name: f.name, traits: f.traits }, emoji: f.emoji }
      case 'migrate':
        return { ...base, entity_id: f.speciesId, from: f.from ?? undefined, to: f.target ?? undefined }
      case 'create_civilization':
        return { ...base, entity: { op: 'create', name: f.name, traits: f.traits, specialties: f.specialties, flaws: f.flaws, co_god_ids: f.co_god_ids }, q: t.q, r: t.r, species_id: f.speciesId }
      case 'develop_civilization':
        return { ...base, city_id: f.cityId, attr: f.attr, gift: f.gift.trim() }
      case 'exodus':
        return { ...base, city_id: f.cityId, dots: f.dots, species_id: f.speciesId, to: f.target ?? undefined, name: f.name.trim(), description: f.description.trim() }
      case 'command_avatar':
        return { ...base, avatar_id: f.avatarId, summary: f.summary.trim(), to: f.moveAvatar ? f.target ?? undefined : undefined }
      case 'resurrect_avatar':
        return { ...base, entity: { op: 'update', id: f.deadAvatarId, description: f.description, conditions: f.conditions }, q: t.q, r: t.r }
      default:
        return base
    }
  }

  const ctx = useMemo(
    () => ({
      god: (id: string | null) => {
        const p = players.find((x) => x.id === id)
        return { name: playerLabel(p, profiles), gender: p?.god_gender ?? 'n' }
      },
      entity: (id: string | null) => (id ? entities.find((e) => e.id === id) : undefined),
    }),
    [players, profiles, entities],
  )

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await rpc<ActionLog>('perform_action', { p_game_id: game.id, p_action_key: action.key, p_payload: buildPayload() })
      setRow(r)
      advance(stepIdx)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function declare() {
    setBusy(true)
    setError(null)
    try {
      const payload = action.key === 'convert'
        ? { city_id: f.cityId, defender_id: f.defenderId, attr: f.attr }
        : { source_city_id: f.cityId, army: f.army, target_city_id: f.targetCityId, defender_id: f.defenderId }
      await rpc('declare_contest', { p_game_id: game.id, p_kind: action.key, p_payload: payload })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- the verse ----------
  const drafted = useMemo(() => {
    if (!row) return ''
    const live = log.find((l) => l.id === row.id) ?? row
    if (action.key === 'great_miracle') return draftDeedSummary(action, god, null)
    const base = composeVerse(live, ctx)
    if (action.key === 'command_avatar' && f.summary.trim()) {
      const s = f.summary.trim()
      return `${base} ${s.endsWith('.') ? s : `${s}.`}`
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, log, ctx, action.key])
  useEffect(() => {
    if (!verseEdited) setVerse(drafted)
  }, [drafted, verseEdited])

  async function saveVerse(text: string) {
    if (!row) return onClose()
    setBusy(true)
    setError(null)
    try {
      await rpc('edit_log_summary', { p_log_id: row.id, p_summary: text })
      if (action.entityOp === 'create' && row.entity_id) {
        await rpc('edit_entity', { p_entity_id: row.entity_id, p_patch: { description: text } })
      } else if (action.key === 'exodus' && row.entity_id && f.target && !world.cityAt(f.target.q, f.target.r)) {
        await rpc('edit_entity', { p_entity_id: row.entity_id, p_patch: { description: text } })
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- shell ----------
  const title = (
    <span className={styles.titleRow}>
      <ActionIcon k={action.key} size={26} className={styles.titleIcon} />
      {action.name}
    </span>
  )

  const shell = (children: ReactNode, closable: (() => void) | undefined, sealLabel: string, lead: ReactNode) => (
    <Modal title={title} onClose={closable} wide={rules || !!action.entityKind || step === 'verse'}>
      <div className={styles.withRules}>
        <RulesAside action={action} era={era} open={rules} onHide={() => setRules(false)} />
        <div className={styles.main}>
          <div className={styles.mainHead}>
            <FrescoFrame src={actionArt(action.key)} alt={action.name} size={210} className={styles.plate} />
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

  const avatarRow = avatarFree && !action.contested && (
    <div className={styles.avatarRow}>
      <label className={styles.check}>
        <input type="checkbox" checked={f.useAvatar} disabled={avatarBlocked} onChange={(e) => set('useAvatar', e.target.checked)} />
        Darmowa akcja awatara (raz na rundę)
      </label>
      {avatarNote && <small className={styles.avatarNote}>{avatarNote}</small>}
      {me.logos < cost && !f.useAvatar && <small className={styles.avatarNote}>Masz za mało Logos: to słowo padnie tylko przez awatara.</small>}
    </div>
  )

  const footer = (primary: ReactNode, back?: () => void) => (
    <div className={styles.footer}>
      <StoneButton onClick={onClose}>Odstąp</StoneButton>
      {back && <StoneButton onClick={back}>Wstecz</StoneButton>}
      {primary}
    </div>
  )

  // the map is asking: the window steps aside
  if (step === 'map') return null

  // ---------- setup: whose hands, which people; then the dice ----------
  if (step === 'setup') {
    const sap = f.target ? world.occupantsAt(f.target.q, f.target.r).map((o) => world.entityById(o.entity_id)).filter((e): e is Entity => world.isSapient(e)) : []
    return shell(
      <div className={styles.form}>
        {avatarRow}
        {sap.length > 1 && (
          <label className={fieldClass}>
            <span className={labelClass}>Z której istoty rozumnej wychodzi ten lud</span>
            <select className={inputClass} value={f.speciesId} onChange={(e) => set('speciesId', e.target.value)}>
              {sap.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji ?? ''} {s.name}</option>
              ))}
            </select>
          </label>
        )}
        {sap.length === 1 && <p className={styles.hint}>Lud wychodzi z istot {sap[0].emoji ?? ''} {sap[0].name}, na heksie ({f.target?.q}, {f.target?.r}).</p>}
        <p className={styles.hint}>
          Najpierw rzut, potem opis i cechy: to, co wyrzucisz, mówi, ile możesz wybrać. Możesz wydać dodatkowe Słowa jako
          modyfikator (do +3), zapłacić 5 za wynik 10+ albo przyjąć 6− bez rzutu; inni mogą pomagać lub przeszkadzać
          w stosunku 2 za 1. Rozliczcie to przy stole. Zapłacisz dopiero na końcu.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay} onClick={doRoll}>
            {busy ? 'Kości lecą…' : f.useAvatar ? 'Rzuć 2k6 (awatar, −2)' : 'Rzuć 2k6'}
          </StoneButton>,
        )}
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
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !roll} onClick={() => advance(stepIdx)}>
            Dalej: opisz i wybierz
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <Notice tone="ok">Kości rzucone{f.useAvatar ? ' rękami awatara, z −2' : ''}. Zapłacisz, gdy skończysz.</Notice>,
    )
  }

  // ---------- form: what the word needs before (or after) the map ----------
  if (step === 'form') {
    const formOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'form').length
    const { fields, ready } = renderForm(formOrdinal)
    return shell(
      <div className={styles.form}>
        {picks && <PicksNotice picks={picks} />}
        {fields}
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={!ready || busy} onClick={() => advance(stepIdx)}>
            {flow[stepIdx + 1] === 'map' ? 'Dalej: wskaż na mapie' : 'Dalej'}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- confirm: what was chosen, what it costs ----------
  if (step === 'confirm') {
    return shell(
      <div className={styles.form}>
        {avatarRow}
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {distance > 0 && <p className={styles.hint}>Dystans: {distance} {distance === 1 ? 'heks' : 'heksów'}, czyli {distance} Logos{baseCost ? ` doliczone do ${baseCost}` : ''}.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay} title={!canPay ? 'Za mało Logos. Zaznacz darmową akcję awatara albo odstąp.' : undefined} onClick={submit}>
            {busy ? 'Słowo pada…' : f.useAvatar ? 'Czyń przez awatara (0 Logos)' : `Zapłać ${paid} Logos`}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- declare: a contest begins, the defender answers ----------
  if (step === 'declare') {
    const def = players.find((p) => p.id === f.defenderId)
    return shell(
      <div className={styles.form}>
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <Notice>
          Kości rzuca księga od razu. Potem {godLabel(def)} wybiera obronę i rzuca u siebie; twoja tura czeka na odpowiedź. Logos płacisz teraz.
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay || !f.defenderId} onClick={declare}>
            {busy ? 'Kości lecą…' : `Rozpocznij starcie (${cost} Logos)`}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- verse: the book's words, the player's last say ----------
  const liveRow = row ? log.find((l) => l.id === row.id) ?? row : null
  const happened = liveRow ? describeEvent(liveRow, ctx) : ''
  return shell(
    <div className={styles.form}>
      <Notice tone="ok">Słowo padło. {happened}</Notice>
      <TextArea id="verse" label="Werset do Świętej Księgi" value={verse} onChange={(e) => { setVerse(e.target.value); setVerseEdited(e.target.value.trim() !== '') }} />
      <p className={styles.draftHint}>{verseEdited ? 'Twoje słowa. Wyczyść pole, by wrócić do podpowiedzi.' : 'Podpowiedź księgi. Zmień ją, jeśli chcesz opowiedzieć to inaczej.'}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={styles.footer}>
        <StoneButton disabled={busy} onClick={() => saveVerse(drafted)}>Zostaw jak jest</StoneButton>
        <StoneButton variant="gold" size="lg" disabled={busy || !verse.trim()} onClick={() => saveVerse(verse.trim())}>
          Zapisz do Świętej Księgi
        </StoneButton>
      </div>
    </div>,
    undefined,
    'Zapłacono',
    <p className={styles.summary}>Tak zapamięta to Święta Księga.</p>,
  )

  // ---------- per-key forms ----------
  function renderForm(ordinal: number): { fields: ReactNode; ready: boolean } {
    const key = action.key
    switch (key) {
      case 'shape_land':
        return {
          ready: true,
          fields: (
            <div className={styles.fields}>
              <span className={labelClass}>Biom</span>
              <div className={styles.biomes} role="radiogroup" aria-label="Biom">
                {BIOMES.map((b) => (
                  <button key={b.key} type="button" role="radio" aria-checked={f.biome === b.key} className={[styles.biomeBtn, f.biome === b.key ? styles.biomeOn : ''].join(' ')} style={{ '--biome': b.fill } as React.CSSProperties} onClick={() => set('biome', b.key)}>
                    <span className={styles.biomeSwatch} aria-hidden>{b.emoji}</span>
                    <span>{b.name}</span>
                    {b.blocked && <small>zablokowany</small>}
                  </button>
                ))}
              </div>
            </div>
          ),
        }
      case 'catastrophe':
        return {
          ready: f.catastrophe.trim().length > 0,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Rodzaj kataklizmu</span>
                <select className={inputClass} value={CATASTROPHE_TYPES.includes(f.catastrophe) ? f.catastrophe : '__own'} onChange={(e) => set('catastrophe', e.target.value === '__own' ? '' : e.target.value)}>
                  {CATASTROPHE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option value="__own">Własny…</option>
                </select>
              </label>
              {!CATASTROPHE_TYPES.includes(f.catastrophe) && <TextField id="cat_own" label="Nazwij kataklizm" value={f.catastrophe} onChange={(e) => set('catastrophe', e.target.value)} maxLength={60} />}
              <p className={styles.hint}>Obrażenia: k6 + Gniew ({scoreText(scores.wrath)}), najmniej 1. Każde trafia losowo w kropkę miasta, istotę albo awatara.</p>
            </div>
          ),
        }
      case 'create_creature':
      case 'create_sapient':
        return {
          ready: f.name.trim().length > 0 && !!f.emoji,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <TraitPicker
                label={key === 'create_sapient' ? 'Cechy (do 3; „Rozumne” dochodzi samo)' : 'Cechy (do 3)'}
                options={key === 'create_creature' ? PLAIN_CREATURE_TRAITS : CREATURE_TRAITS}
                value={f.traits}
                onChange={(v) => set('traits', v)}
                max={3}
              />
              <EmojiPicker label="Znak na mapie" options={key === 'create_sapient' ? SAPIENT_EMOJI : CREATURE_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
            </div>
          ),
        }
      case 'create_avatar':
        return {
          ready: f.name.trim().length > 0 && !!f.emoji && f.conditions.length >= 1 && f.conditions.length <= 3,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Imię awatara" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <TraitPicker label="Uwarunkowania (od 1 do 3, obowiązkowe)" options={AVATAR_CONDITIONS} value={f.conditions} onChange={(v) => set('conditions', v)} max={3} />
              <EmojiPicker label="Znak na mapie" options={AVATAR_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
              {others.length > 0 && (
                <label className={fieldClass}>
                  <span className={labelClass}>Współtwórcy (bóstwa, które zsyłają go razem z tobą)</span>
                  <MultiSelect options={others.map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))} value={f.co_god_ids} onChange={(v) => set('co_god_ids', v)} />
                </label>
              )}
            </div>
          ),
        }
      case 'change_creature': {
        const src = world.entityById(f.speciesId)
        const kept = src ? f.traits.filter((t) => src.traits.includes(t)).length : 0
        const added = src ? f.traits.filter((t) => !src.traits.includes(t)).length : 0
        return {
          ready: f.name.trim().length > 0 && !!f.emoji && (!src || src.traits.length < 2 || kept >= 2) && added >= 1,
          fields: (
            <div className={styles.fields}>
              {src && <p className={styles.hint}>Odmiana istot {src.emoji ?? ''} {src.name}. Zachowaj co najmniej 2 cechy i dodaj 1 nową; zmienia się tylko ta jedna, na swoim heksie.</p>}
              <TextField id="ent_name" label="Nazwa odmiany" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <TraitPicker label="Cechy" options={src && world.isSapient(src) ? CREATURE_TRAITS : PLAIN_CREATURE_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} />
              <EmojiPicker label="Nowy znak na mapie" options={src && world.isSapient(src) ? SAPIENT_EMOJI : CREATURE_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
            </div>
          ),
        }
      }
      case 'create_civilization': {
        const lim = (own?: number, other?: number) => (picks ? (own ?? 0) + (other ?? 0) || undefined : 3)
        return {
          ready: f.name.trim().length > 0,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <TraitPicker label={`Cechy${count(lim(picks?.traits, picks?.otherTraits))}`} options={CIV_TRAITS} value={f.traits} onChange={(v) => set('traits', v)} max={lim(picks?.traits, picks?.otherTraits)} />
              <TraitPicker label={`Specjalności${count(lim(picks?.specialties))}`} options={CIV_SPECIALTIES} value={f.specialties} onChange={(v) => set('specialties', v)} max={lim(picks?.specialties)} tone="lapis" />
              <TraitPicker label={`Braki${count(lim(picks?.flaws, picks?.otherFlaws))}`} options={CIV_FLAWS} value={f.flaws} onChange={(v) => set('flaws', v)} max={lim(picks?.flaws, picks?.otherFlaws)} tone="flaw" />
              {others.length > 0 && (
                <label className={fieldClass}>
                  <span className={labelClass}>Współtwórcy (bóstwa, które tworzą ten lud razem z tobą)</span>
                  <MultiSelect options={others.map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))} value={f.co_god_ids} onChange={(v) => set('co_god_ids', v)} />
                </label>
              )}
            </div>
          ),
        }
      }
      case 'develop_civilization': {
        const city = world.entityById(f.cityId)
        return {
          ready: f.gift.trim().length > 0,
          fields: (
            <div className={styles.fields}>
              {city && <p className={styles.hint}>Miasto {city.name}, {followersWord(world.cityDots(city.id))}, z tego twoich: {world.dotsOf(city.id, me.id)}.</p>}
              <TextArea id="gift" label="Co ofiarowujesz wyznawcom" placeholder="Ogień, oliwki, pismo, sztuka rolnictwa, wielka świątynia…" value={f.gift} onChange={(e) => set('gift', e.target.value)} />
              <AttrChoice label="Co wspiera ten dar" options={['grace', 'wisdom']} value={f.attr} scores={scores} onChange={(v) => set('attr', v)} />
              <p className={styles.hint}>Księga rzuci 2k6 + atrybut{f.useAvatar ? ' − 2 (awatar)' : ''}: 10+ to dwie kropki, 7..9 jedna, 6- nic.</p>
            </div>
          ),
        }
      }
      case 'exodus': {
        const city = world.cityOf(f.cityId)
        const cityEnt = world.entityById(f.cityId)
        const mine = world.dotsOf(f.cityId, me.id)
        const sap = city ? world.occupantsAt(city.q, city.r).map((o) => world.entityById(o.entity_id)).filter((e): e is Entity => world.isSapient(e)) : []
        return {
          ready: f.dots >= 1 && f.dots <= mine && !!f.speciesId && f.name.trim().length > 0,
          fields: (
            <div className={styles.fields}>
              {cityEnt && <p className={styles.hint}>Z miasta {cityEnt.name}, gdzie masz {followersWord(mine)}.</p>}
              <label className={fieldClass}>
                <span className={labelClass}>Ilu wyznawców zabierasz (1..{mine})</span>
                <input className={inputClass} type="number" min={1} max={mine} value={f.dots} onChange={(e) => set('dots', Math.max(1, Math.min(mine, Number(e.target.value) || 1)))} />
              </label>
              <label className={fieldClass}>
                <span className={labelClass}>Którą istotę rozumną zabierasz</span>
                <select className={inputClass} value={f.speciesId} onChange={(e) => set('speciesId', e.target.value)}>
                  {sap.map((s) => (
                    <option key={s.id} value={s.id}>{s.emoji ?? ''} {s.name}</option>
                  ))}
                </select>
                {sap.length === 0 && <small className={styles.hint}>W tym mieście nie ma istoty rozumnej, którą dałoby się zabrać.</small>}
              </label>
              <TextField id="ent_name" label="Nazwa nowego miasta (jeśli cel jest pusty)" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
            </div>
          ),
        }
      }
      case 'convert': {
        const rivals = world.followersOf(f.cityId).filter((x) => x.player_id !== me.id)
        if (!f.defenderId && rivals[0]) set('defenderId', rivals[0].player_id)
        return {
          ready: !!f.defenderId,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Czyich wyznawców nawracasz</span>
                <select className={inputClass} value={f.defenderId} onChange={(e) => set('defenderId', e.target.value)}>
                  {rivals.map((x) => {
                    const p = players.find((pp) => pp.id === x.player_id)
                    return (
                      <option key={x.player_id} value={x.player_id}>{godLabel(p)} ({followersWord(x.dots)})</option>
                    )
                  })}
                </select>
              </label>
              <AttrChoice label="Czym nawracasz" options={['majesty', 'whisper']} value={f.attr} scores={scores} onChange={(v) => set('attr', v)} />
            </div>
          ),
        }
      }
      case 'holy_war': {
        if (ordinal === 0) {
          const mine = world.dotsOf(f.cityId, me.id)
          const max = Math.max(1, mine - 1)
          return {
            ready: f.army >= 1 && f.army <= max,
            fields: (
              <div className={styles.fields}>
                <p className={styles.hint}>Z miasta {world.entityById(f.cityId)?.name ?? ''} masz {followersWord(mine)}. Co najmniej jeden zostaje w domu.</p>
                <label className={fieldClass}>
                  <span className={labelClass}>Wielkość Armii (1..{max})</span>
                  <input className={inputClass} type="number" min={1} max={max} value={f.army} onChange={(e) => set('army', Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
                </label>
                <p className={styles.hint}>Rzut: 2k6 + Gniew ({scoreText(scores.wrath)}) + Armia.</p>
              </div>
            ),
          }
        }
        const rivals = world.followersOf(f.targetCityId).filter((x) => x.player_id !== me.id)
        return {
          ready: !!f.defenderId,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Kto broni miasta {world.entityById(f.targetCityId)?.name ?? ''}</span>
                <select className={inputClass} value={f.defenderId} onChange={(e) => set('defenderId', e.target.value)}>
                  {rivals.map((x) => {
                    const p = players.find((pp) => pp.id === x.player_id)
                    return (
                      <option key={x.player_id} value={x.player_id}>{godLabel(p)} ({followersWord(x.dots)})</option>
                    )
                  })}
                </select>
              </label>
            </div>
          ),
        }
      }
      case 'command_avatar':
        return {
          ready: !!f.avatarId,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Awatar</span>
                <select className={inputClass} value={f.avatarId} onChange={(e) => set('avatarId', e.target.value)}>
                  {myAvatars.map((a) => (
                    <option key={a.entity.id} value={a.entity.id}>{a.entity.emoji ?? ''} {a.entity.name}{a.occupant ? ` (${a.occupant.q}, ${a.occupant.r})` : ''}</option>
                  ))}
                </select>
              </label>
              <TextArea id="order" label="Co rozkazujesz" placeholder="Krótko: co awatar czyni i jak." value={f.summary} onChange={(e) => set('summary', e.target.value)} />
              <label className={styles.check}>
                <input type="checkbox" checked={f.moveAvatar} disabled={!avatarOcc} onChange={(e) => set('moveAvatar', e.target.checked)} />
                Awatar przechodzi na inny heks (do 3 pól, 1 Logos za każdy)
              </label>
            </div>
          ),
        }
      case 'resurrect_avatar': {
        const dead = entities.filter((e) => e.kind === 'avatar' && e.status !== 'active')
        return {
          ready: !!f.deadAvatarId,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Poległy awatar</span>
                <select className={inputClass} value={f.deadAvatarId} onChange={(e) => { set('deadAvatarId', e.target.value); const d = dead.find((x) => x.id === e.target.value); if (d) set('conditions', d.conditions) }}>
                  {dead.map((d) => (
                    <option key={d.id} value={d.id}>{d.emoji ?? ''} {d.name}</option>
                  ))}
                </select>
              </label>
              <TextArea id="ent_desc" label="Jak zmieniła go śmierć" value={f.description} onChange={(e) => set('description', e.target.value)} />
              <TraitPicker label="Uwarunkowania (od 1 do 3)" options={AVATAR_CONDITIONS} value={f.conditions} onChange={(v) => set('conditions', v)} max={3} />
            </div>
          ),
        }
      }
      default:
        return { ready: true, fields: null }
    }
  }

  function confirmLines(): string[] {
    const at = f.target ? `heks (${f.target.q}, ${f.target.r})` : ''
    switch (action.key) {
      case 'shape_land':
        return [`Biom: ${BIOME_BY_KEY[f.biome].name}`, `Heksy: ${f.hexes.map((h) => `(${h.q}, ${h.r})`).join(' ')}`]
      case 'catastrophe':
        return [`Kataklizm: ${f.catastrophe}`, `Cel: ${at}`, `Obrażenia: k6 + Gniew (${scoreText(scores.wrath)}), najmniej 1`]
      case 'great_miracle':
        return ['Coś WIELKIEGO na skalę całego świata. Opowiesz to w wersecie.']
      case 'create_creature':
      case 'create_sapient':
        return [`${f.emoji} ${f.name}`, `Cechy: ${f.traits.join(', ') || 'brak'}`, `Miejsce: ${at}`]
      case 'create_avatar':
        return [`${f.emoji} ${f.name}`, `Uwarunkowania: ${f.conditions.join('; ')}`, `Miejsce: ${at}`]
      case 'change_creature':
        return [`Odmiana: ${f.emoji} ${f.name}`, `Cechy: ${f.traits.join(', ')}`]
      case 'migrate':
        return [`${world.entityById(f.speciesId)?.emoji ?? ''} ${world.entityById(f.speciesId)?.name ?? ''}: z (${f.from?.q}, ${f.from?.r}) na (${f.target?.q}, ${f.target?.r})`]
      case 'create_civilization':
        return [`Lud: ${f.name}`, `Z istoty: ${world.entityById(f.speciesId)?.name ?? ''}`, `Miejsce: ${at}`, `Cechy: ${f.traits.join(', ') || 'brak'}`]
      case 'develop_civilization':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Dar: ${f.gift}`, `Atrybut: ${ATTRIBUTE_BY_KEY[f.attr].name} (${scoreText(scores[f.attr])})`]
      case 'exodus':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}`, `${followersWord(f.dots)} i istota ${world.entityById(f.speciesId)?.name ?? ''}`, `Cel: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (dołączają do miasta ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name})` : ` (nowe miasto ${f.name})`}`]
      case 'convert':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Nawracasz wyznawców: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Atrybut: ${ATTRIBUTE_BY_KEY[f.attr].name} (${scoreText(scores[f.attr])})`]
      case 'holy_war':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}, Armia: ${followersWord(f.army)}`, `Cel: ${world.entityById(f.targetCityId)?.name ?? ''}, broni: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Rzut: 2k6 + Gniew (${scoreText(scores.wrath)}) + ${f.army}`]
      case 'command_avatar':
        return [`Awatar: ${world.entityById(f.avatarId)?.name ?? ''}`, f.summary.trim() ? `Rozkaz: ${f.summary.trim()}` : 'Rozkaz opowiesz w wersecie.', f.moveAvatar && f.target ? `Przejście na ${at}` : 'Bez przejścia']
      case 'resurrect_avatar':
        return [`Awatar: ${entities.find((e) => e.id === f.deadAvatarId)?.name ?? ''}`, `Wraca na ${at}, z pełnym życiem`]
      default:
        return []
    }
  }
}

const count = (n?: number) => (n ? ` (${n})` : '')

/** two or six attributes to choose from, with the god's scores */
function AttrChoice({ label, options, value, scores, onChange }: { label: string; options: AttrKey[]; value: AttrKey; scores: Record<AttrKey, number>; onChange: (v: AttrKey) => void }) {
  return (
    <div className={fieldClass}>
      <span className={labelClass}>{label}</span>
      <div className={styles.multi} role="radiogroup" aria-label={label}>
        {options.map((k) => (
          <label key={k} className={[styles.multiItem, value === k ? styles.multiOn : ''].join(' ')}>
            <input type="radio" name={label} checked={value === k} onChange={() => onChange(k)} />
            {ATTRIBUTE_BY_KEY[k].name} ({scoreText(scores[k])})
          </label>
        ))}
      </div>
    </div>
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
              {action.distance ? `${action.costs[e - 1]}+` : action.costs[e - 1]}
            </span>
          ))}
        </div>
        {action.requirement && <p className={styles.rulesReq}>Warunek: {action.requirement.text}.</p>}
        {action.distance && <p className={styles.rulesReq}>Plus 1 Logos za każdy heks dystansu.</p>}
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

export function kindLabel(k: EntityKind): string {
  return { creature: 'istota', civilization: 'cywilizacja', faction: 'frakcja', orthodoxy: 'religia', avatar: 'awatar' }[k]
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
