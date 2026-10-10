import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, ActionPayload, AttrKey, BiomeKey, Entity, EntityKind, HexRef, Player } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { hexDistance } from '@/lib/hex'
import { AVATAR_REACH, costFor, viaAvatarAllowed, viaAvatarCost, type ActionDef, type Era, type FlowStep } from '@/data/actions'
import { SAPIENT_TRAITS } from '@/data/traits'
import { BIOMES, BIOME_BY_KEY, CATASTROPHE_TYPES } from '@/data/biomes'
import { AVATAR_EMOJI, BEAST_EMOJI, CREATURE_EMOJI, HERBIVORE_EMOJI, SAPIENT_EMOJI } from '@/data/emoji'
import { RESOURCES, RESOURCE_NAMES, isMountain, temperOf, herdRankName, resourceRankName } from '@/data/fertility'
import { ATTRIBUTE_BY_KEY, scoreText, scoresFor } from '@/data/pantheon'
import { composeVerse } from '@/data/chronicle'
import { isWatchedRoll } from '@/data/dice'
import { draftDeedSummary } from '@/data/draft'
import { describeEvent } from '@/data/tableEvents'
import { GIFTS, followersWord } from '@/data/cities'
import { useGameStore, playerLabel, godLabel, selectPropheciesOf } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice, Dice2d6, FrescoFrame, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { actionArt } from '@/data/actionArt'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { ActionIcon } from '@/components/ui/ActionIcons'
import { AttrPicker } from '@/features/pantheon/AttrPicker'
import { ProphecyPicker } from '@/features/pantheon/ProphecyPicker'
import { useDiceWait, useVerseDialogFlag } from '../diceGate'
import { useMapMode, type MapMode } from '../map/mapMode'
import { useWorld } from '../map/useWorld'
import styles from './actions.module.css'

const OWN_GIFT = '__own'

interface FormState {
  /** the avatar that speaks the word (half the price, reach of two fields); empty = the god itself */
  viaAvatarId: string
  /** catastrophe: the land left when nothing survives */
  after: '' | BiomeKey
  name: string
  description: string
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
  giftOwn: string
  dots: number
  army: number
  defenderId: string
  avatarId: string
  moveAvatar: boolean
  summary: string
  deadAvatarId: string
  /** a prophecy spent on this roll */
  prophecyId: string | null
  /** avatar duel: the enemy's avatar */
  enemyAvatarId: string
  /** prophecy: what is foretold */
  text: string
  /** create_creature: a herd or a beast */
  diet: 'herbivore' | 'carnivore'
  /** bless_land */
  resource: string
  /** pour_river: the channel from the source, and the water it ends in */
  path: HexRef[]
  mouth: HexRef | null
}

const initial = (): FormState => ({
  viaAvatarId: '',
  after: '',
  name: '',
  description: '',
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
  gift: GIFTS[0],
  giftOwn: '',
  dots: 1,
  army: 1,
  defenderId: '',
  avatarId: '',
  moveAvatar: false,
  summary: '',
  deadAvatarId: '',
  prophecyId: null,
  enemyAvatarId: '',
  text: '',
  diet: 'herbivore',
  resource: '',
  path: [],
  mouth: null,
})

const avatarAt = (w: WorldView, q: number, r: number) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'avatar')

export function ActionDialog({ action, me, onClose, preset }: { action: ActionDef; me: Player; onClose: () => void; preset?: { avatarId?: string } }) {
  const game = useGameStore((s) => s.game)!
  const entities = useGameStore((s) => s.entities)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const log = useGameStore((s) => s.log)
  const prophecies = useGameStore(selectPropheciesOf(me.id))
  const world = useWorld()
  const setMode = useMapMode((s) => s.setMode)
  useVerseDialogFlag()

  const era = game.era as Era
  const baseCost = costFor(action.key, era)
  const myAvatars = world.avatarsOf(me.id)
  const standing = myAvatars.filter((a) => a.occupant)
  // the avatar may speak this word: the window first asks who speaks
  const viaAllowed = viaAvatarAllowed(action.key) && standing.length > 0
  const flow = useMemo<FlowStep[]>(() => (viaAllowed ? ['via', ...action.flow] : action.flow), [viaAllowed, action.flow])
  // a prophecy opened from the avatar on the map skips the question which avatar speaks
  const [stepIdx, setStepIdx] = useState(action.key === 'prophecy' && preset?.avatarId ? 1 : 0)
  const step: FlowStep = flow[stepIdx]
  const [f, setF] = useState<FormState>(() => {
    const s = initial()
    if (action.key === 'prophecy' && preset?.avatarId) s.avatarId = preset.avatarId
    if (action.key === 'avatar_duel') s.attr = 'wrath'
    if (action.key === 'resurrect_avatar') s.deadAvatarId = entities.find((e) => e.kind === 'avatar' && e.status !== 'active')?.id ?? ''
    if (action.key === 'convert') s.attr = 'majesty'
    return s
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rules, setRules] = useState(false)
  const [row, setRow] = useState<ActionLog | null>(null)
  const [verse, setVerse] = useState('')
  const [verseEdited, setVerseEdited] = useState(false)
  /** a mountain cut a river in this word: the map asks for the new bed before the verse */
  const [reroute, setReroute] = useState<{ riverId: string; from: HexRef } | null>(null)
  // the verse step waits until the table has seen the dice; a cataclysm then plays on the map
  const waitingDice = useDiceWait(row && isWatchedRoll(row) ? row.id : null)
  const [curtain, setCurtain] = useState(false)
  const wasWaiting = useRef(false)
  useEffect(() => {
    const fell = wasWaiting.current && !waitingDice && action.key === 'catastrophe'
    wasWaiting.current = waitingDice
    if (!fell) return
    setCurtain(true)
    const t = window.setTimeout(() => setCurtain(false), 3600)
    return () => window.clearTimeout(t)
  }, [waitingDice, action.key])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const god = { name: me.god_name?.trim() || 'bóstwo', gender: me.god_gender ?? 'm' }
  const scores = scoresFor(me.domain_key, me.attr_primary, me.attr_bonus)
  const others = players.filter((p) => p.id !== me.id)
  const giftText = f.gift === OWN_GIFT ? f.giftOwn.trim() : f.gift

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
      case 'pilgrimage':
        return avatarOcc && f.target ? hexDistance(avatarOcc, f.target) : 0
      default:
        return 0
    }
  })()
  const cost = baseCost + distance
  const viaAv = f.viaAvatarId ? standing.find((a) => a.entity.id === f.viaAvatarId) : undefined
  const viaOcc = viaAv?.occupant
  const paid = viaAv ? viaAvatarCost(cost) : cost
  const canPay = me.logos >= paid
  /** how many fields of distance my Words still buy (half price through the avatar) */
  const budget = viaAv ? 2 * me.logos - baseCost : me.logos - baseCost
  const inReach = (q: number, r: number) => !viaOcc || hexDistance(viaOcc, { q, r }) <= AVATAR_REACH

  // ---------- the map's questions ----------
  const mapOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'map').length
  const skipMap = (_i: number) => false

  function advance(from: number) {
    let i = from + 1
    while (i < flow.length && skipMap(i)) i++
    if (i >= flow.length) onClose()
    else setStepIdx(i)
  }

  function mapSpec(): Omit<MapMode, 'onFinish' | 'onCancel'> | null {
    const key = action.key
    const biomeName = BIOME_BY_KEY[f.biome].name.toLowerCase()
    const reach = (from: HexRef | undefined, q: number, r: number) => !!from && hexDistance(from, { q, r }) >= 1 && hexDistance(from, { q, r }) <= budget
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
      case 'bless_land':
        return { kind: 'hex', title: 'Pobłogosław ziemię', instruction: `Kliknij ląd, który dostanie ${f.resource} ${RESOURCE_NAMES[f.resource] ?? 'surowiec'}. Góry też, woda nie; dotychczasowy surowiec zostanie zastąpiony.`, valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' } }
      case 'pour_river':
        return {
          kind: 'river',
          title: 'Wylej Rzekę',
          instruction: 'Kliknij górę, z której wypływa rzeka, potem kolejne sąsiednie pola. Klik w wodę albo w inną rzekę kończy rzekę. Klik w ostatnie pole cofa je.',
          valid: (q, r, w, sel) => {
            const b = w.hexAt(q, r)?.biome
            if (!b) return false
            if (sel.length === 0) return isMountain(b) && !w.riverAt(q, r)
            return !isMountain(b)
          },
          isTerminal: (q, r, w) => w.hexAt(q, r)?.biome === 'woda' || !!w.riverAt(q, r),
        }
      case 'create_creature':
        return { kind: 'hex', title: action.name, instruction: `Kliknij ląd (także góry) z wolnym miejscem ${f.diet === 'carnivore' ? 'na dole heksa' : 'w lewym górnym rogu heksa'}, na którym pojawią się ${f.name.trim() || 'nowe istoty'}. Nie wodę.`, valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' && w.slotFor(q, r, f.diet === 'carnivore' ? 'beast' : 'herbivore') !== null } }
      case 'create_sapient':
        return { kind: 'hex', title: action.name, instruction: `Kliknij ląd z wolnym dołem heksa, na którym pojawią się ${f.name.trim() || 'nowe istoty'}. Nie Wodę, nie Góry.`, valid: (q, r, w) => w.slotFor(q, r, 'tribe') !== null && !w.blocked(q, r) }
      case 'create_avatar':
      case 'resurrect_avatar':
        return { kind: 'hex', title: action.name, instruction: 'Kliknij heks, na którym staje awatar: wolny dolny róg, nie Woda, nie Góry.', valid: (q, r, w) => w.slotFor(q, r, 'avatar') !== null && !w.blocked(q, r) }
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
          instruction: `Kliknij ląd, na który rozejdą się ${world.entityById(f.speciesId)?.name ?? 'istoty'}: wolne miejsce, bez tego gatunku. 1 Logos za każdy heks; świecą tylko te, na które cię stać.`,
          valid: (q, r, w) => {
            const role = w.roleOf(w.entityById(f.speciesId)) ?? 'herbivore'
            const h = w.hexAt(q, r)
            const landOk = role === 'tribe' ? !w.blocked(q, r) : !!h && h.biome !== 'woda'
            return landOk && w.slotFor(q, r, role) !== null && !w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId) && reach(f.from ?? undefined, q, r)
          },
          costFor: (sel) => (f.from && sel[0] ? hexDistance(f.from, sel[0]) : null),
        }
      case 'create_civilization':
        return {
          kind: 'hex',
          title: 'Stworzenie Cywilizacji',
          instruction: 'Kliknij heks, na którym żyje istota rozumna i nie stoi jeszcze miasto.',
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
          instruction: `Kliknij ląd, dokąd idzie ${followersWord(f.dots)}: na wolne pole albo do innego miasta. 1 Logos za każdy heks; świecą tylko te, na które cię stać.`,
          valid: (q, r, w) => !w.blocked(q, r) && reach(srcCity, q, r) && (!!w.cityAt(q, r) || w.slotFor(q, r, 'tribe') !== null || w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId)),
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
          instruction: `Kliknij miasto, na które rusza armia (${followersWord(f.army)}). 1 Logos za każdy heks między miastami; świecą tylko te, na które cię stać.`,
          valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && c.entity_id !== f.cityId && w.followersOf(c.entity_id).some((x) => x.player_id !== me.id) && reach(srcCity, q, r) },
          costFor: (sel) => (srcCity && sel[0] ? hexDistance(srcCity, sel[0]) : null),
        }
      case 'avatar_duel': {
        const myIds = new Set(myAvatars.map((a) => a.entity.id))
        if (mapOrdinal === 0) {
          return {
            kind: 'occupant',
            title: 'Walka Awatarów',
            instruction: 'Kliknij swojego awatara, który rusza do walki.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => myIds.has(o.entity_id)),
            validOccupant: (o) => myIds.has(o.entity_id),
          }
        }
        const mineOcc = f.avatarId ? world.occupantsOf(f.avatarId)[0] : undefined
        const enemy = (o: { entity_id: string }, w: WorldView) => {
          const e = w.entityById(o.entity_id)
          return !!e && e.kind === 'avatar' && e.status === 'active' && !myIds.has(e.id)
        }
        return {
          kind: 'occupant',
          title: 'Walka Awatarów',
          instruction: 'Kliknij awatara innego bóstwa najwyżej dwa heksy od twojego. Dalszego trzeba najpierw dogonić Pielgrzymką.',
          valid: (q, r, w) => !!mineOcc && hexDistance(mineOcc, { q, r }) <= AVATAR_REACH && w.occupantsAt(q, r).some((o) => enemy(o, w)),
          validOccupant: (o, w) => enemy(o, w),
        }
      }
      case 'prophecy': {
        const myIds = new Set(myAvatars.map((a) => a.entity.id))
        return {
          kind: 'occupant',
          title: 'Proroctwo',
          instruction: 'Kliknij swojego awatara, który przemówi.',
          valid: (q, r, w) => w.occupantsAt(q, r).some((o) => myIds.has(o.entity_id)),
          validOccupant: (o) => myIds.has(o.entity_id),
        }
      }
      case 'pilgrimage': {
        const myIds = new Set(myAvatars.map((a) => a.entity.id))
        if (mapOrdinal === 0) {
          return {
            kind: 'occupant',
            title: 'Pielgrzymka Awatara',
            instruction: 'Kliknij swojego awatara, który rusza w drogę.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => myIds.has(o.entity_id)),
            validOccupant: (o) => myIds.has(o.entity_id),
          }
        }
        return {
          kind: 'hex',
          title: 'Pielgrzymka Awatara',
          instruction: 'Kliknij heks, na który idzie awatar: wolne miejsce, nie Woda, nie Góry. 1 Logos za każdy heks; świecą tylko te, na które cię stać.',
          valid: (q, r, w) => !w.blocked(q, r) && w.slotFor(q, r, 'avatar') !== null && !!avatarOcc && reach(avatarOcc, q, r),
          costFor: (sel) => (avatarOcc && sel[0] ? hexDistance(avatarOcc, sel[0]) : null),
        }
      }
      default:
        return null
    }
  }

  /** the same question, limited to the avatar's reach when it speaks the word */
  function reachSpec(spec: Omit<MapMode, 'onFinish' | 'onCancel'> | null): Omit<MapMode, 'onFinish' | 'onCancel'> | null {
    if (!spec || !viaOcc) return spec
    const key = action.key
    // the far end of a journey is not limited: only where the word begins
    const unlimited = (key === 'migrate' && mapOrdinal === 0) || ((key === 'exodus' || key === 'holy_war') && mapOrdinal === 1)
    if (unlimited) return spec
    const valid = spec.valid
    if (key === 'pour_river') return { ...spec, instruction: `${spec.instruction} Źródło w zasięgu awatara: do dwóch heksów od niego.`, valid: (q, r, w, sel) => (sel.length > 0 || inReach(q, r)) && valid(q, r, w, sel) }
    return { ...spec, instruction: `${spec.instruction} W zasięgu awatara: do dwóch heksów od niego.`, valid: (q, r, w, sel) => inReach(q, r) && valid(q, r, w, sel) }
  }

  function applyPicks(picks: MapPick[]) {
    const p = picks[0]
    setF((s) => {
      const n = { ...s }
      switch (action.key) {
        case 'shape_land':
          n.hexes = picks.map(({ q, r }) => ({ q, r }))
          break
        case 'pour_river': {
          const last = picks[picks.length - 1]
          const water = !!last && world.hexAt(last.q, last.r)?.biome === 'woda'
          n.path = (water ? picks.slice(0, -1) : picks).map(({ q, r }) => ({ q, r }))
          n.mouth = water && last ? { q: last.q, r: last.r } : null
          break
        }
        case 'change_creature': {
          n.occupantId = p.occupantId ?? ''
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          const src = occ ? world.entityById(occ.entity_id) : undefined
          if (src) {
            n.speciesId = src.id
            n.name = `${src.name} (odmiana)`
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
        case 'avatar_duel': {
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          if (mapOrdinal === 0) n.avatarId = occ?.entity_id ?? ''
          else {
            n.enemyAvatarId = occ?.entity_id ?? ''
            n.defenderId = players.find((pl) => world.avatarsOf(pl.id).some((a) => a.entity.id === n.enemyAvatarId))?.id ?? ''
          }
          break
        }
        case 'prophecy': {
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          n.avatarId = occ?.entity_id ?? ''
          break
        }
        case 'pilgrimage': {
          if (mapOrdinal === 0) {
            const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
            n.avatarId = occ?.entity_id ?? ''
          } else n.target = { q: p.q, r: p.r }
          break
        }
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
    const spec = reachSpec(mapSpec())
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

  useEffect(() => {
    if (!reroute) return
    const { riverId, from } = reroute
    const done = () => {
      setReroute(null)
      advance(stepIdx)
    }
    setMode({
      kind: 'river',
      start: from,
      title: 'Nowe koryto',
      instruction: 'Góra przecięła rzekę. Kliknij, którędy popłynie dalej: kolejne sąsiednie pola, aż do wody albo innej rzeki. Przerwij, a rzeka zostanie urwana.',
      valid: (q, r, w) => {
        const b = w.hexAt(q, r)?.biome
        return !!b && !isMountain(b) && w.riverAt(q, r)?.id !== riverId
      },
      isTerminal: (q, r, w) => {
        const rv = w.riverAt(q, r)
        return w.hexAt(q, r)?.biome === 'woda' || (!!rv && rv.id !== riverId)
      },
      onFinish: async (picks) => {
        const last = picks[picks.length - 1]
        const water = !!last && world.hexAt(last.q, last.r)?.biome === 'woda'
        const nodes = (water ? picks.slice(0, -1) : picks).map(({ q, r }) => ({ q, r }))
        try {
          await rpc('continue_river', { p_game_id: game.id, p_river_id: riverId, p_nodes: nodes, p_mouth: water && last ? { q: last.q, r: last.r } : null })
        } catch (err) {
          setError((err as Error).message)
        }
        done()
      },
      onCancel: done,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reroute])

  // ---------- the payload ----------
  function buildPayload(): ActionPayload {
    const base: ActionPayload = { via_avatar_id: f.viaAvatarId || undefined, summary: '' }
    const t = f.target ?? { q: 0, r: 0 }
    switch (action.key) {
      case 'shape_land':
        return { ...base, biome: f.biome, hexes: f.hexes }
      case 'catastrophe':
        return { ...base, type: f.catastrophe.trim(), q: t.q, r: t.r, prophecy_id: f.prophecyId ?? undefined, after: f.after || undefined }
      case 'great_miracle':
        return base
      case 'bless_land':
        return { ...base, q: t.q, r: t.r, resource: f.resource }
      case 'pour_river':
        return { ...base, path: f.path, mouth: f.mouth }
      case 'create_creature':
        return { ...base, entity: { op: 'create', name: f.name, traits: [], co_god_ids: f.co_god_ids, diet: f.diet }, emoji: f.emoji, q: t.q, r: t.r }
      case 'create_sapient':
        return { ...base, entity: { op: 'create', name: f.name, traits: [SAPIENT_TRAITS[0]], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'create_avatar':
        return { ...base, entity: { op: 'create', name: f.name, conditions: [], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'change_creature': {
        const src = world.entityById(f.speciesId)
        return { ...base, occupant_id: f.occupantId, entity: { op: 'create', name: f.name, traits: src && world.isSapient(src) ? [SAPIENT_TRAITS[0]] : [] }, emoji: f.emoji }
      }
      case 'migrate':
        return { ...base, entity_id: f.speciesId, from: f.from ?? undefined, to: f.target ?? undefined }
      case 'create_civilization':
        return { ...base, entity: { op: 'create', name: f.name, co_god_ids: f.co_god_ids }, q: t.q, r: t.r, species_id: f.speciesId }
      case 'develop_civilization':
        return { ...base, city_id: f.cityId, attr: f.attr, gift: giftText, prophecy_id: f.prophecyId ?? undefined }
      case 'prophecy':
        return { ...base, avatar_id: f.avatarId, text: f.text.trim() }
      case 'exodus':
        return { ...base, city_id: f.cityId, dots: f.dots, species_id: f.speciesId, to: f.target ?? undefined, name: f.name.trim(), description: '' }
      case 'pilgrimage':
        return { ...base, avatar_id: f.avatarId, to: f.target ?? undefined }
      case 'resurrect_avatar':
        return { ...base, entity: { op: 'update', id: f.deadAvatarId, description: f.description }, q: t.q, r: t.r }
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
      const o = r.outcome && !Array.isArray(r.outcome) ? (r.outcome as Record<string, unknown>) : null
      const cut = action.key === 'shape_land' && o && o.reroute && typeof o.reroute === 'object' ? (o.reroute as { river_id: string; from: HexRef }) : null
      if (cut && cut.river_id && cut.from) setReroute({ riverId: cut.river_id, from: cut.from })
      else advance(stepIdx)
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
        ? { city_id: f.cityId, defender_id: f.defenderId, attr: f.attr, prophecy_id: f.prophecyId, via_avatar_id: f.viaAvatarId || undefined }
        : action.key === 'avatar_duel'
          ? { attacker_avatar_id: f.avatarId, defender_avatar_id: f.enemyAvatarId, attr: f.attr, prophecy_id: f.prophecyId }
          : { source_city_id: f.cityId, army: f.army, target_city_id: f.targetCityId, defender_id: f.defenderId, prophecy_id: f.prophecyId, via_avatar_id: f.viaAvatarId || undefined }
      await rpc('declare_contest', { p_game_id: game.id, p_kind: action.key, p_payload: payload })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- the verse ----------
  const liveRow = row ? log.find((l) => l.id === row.id) ?? row : null
  const drafted = useMemo(() => {
    if (!liveRow) return ''
    if (action.key === 'great_miracle') return draftDeedSummary(action, god, null)
    return composeVerse(liveRow, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRow, ctx, action.key])
  useEffect(() => {
    if (!verseEdited) setVerse(drafted)
  }, [drafted, verseEdited])

  async function saveVerse(text: string) {
    if (!row) return onClose()
    setBusy(true)
    setError(null)
    try {
      await rpc('edit_log_summary', { p_log_id: row.id, p_summary: text })
      const newThing = (action.entityOp === 'create' || (action.key === 'exodus' && f.target && !world.cityAt(f.target.q, f.target.r))) && row.entity_id
      if (newThing) await rpc('edit_entity', { p_entity_id: row.entity_id, p_patch: { description: text } })
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
    <Modal title={title} onClose={closable} wide={rules || !!action.entityKind || step === 'verse' || step === 'form'}>
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
            <CostSeal label={sealLabel} cost={action.distance ? Math.max(1, paid) : paid} have={me.logos} free={!!viaAv} />
          </div>
          {children}
        </div>
      </div>
    </Modal>
  )

  // who speaks: the god itself, or one of its avatars standing on the map (half the price, reach of two)
  const viaRow = viaAv && (
    <p className={styles.viaNote}>
      Przez awatara {viaAv.entity.emoji ?? ''} {viaAv.entity.name}: {paid} zamiast {cost} Logos{action.key === 'great_miracle' ? '. Awatar spłonie w Wielkim Cudzie.' : '.'}
    </p>
  )

  const footer = (primary: ReactNode) => (
    <div className={styles.footer}>
      <StoneButton onClick={onClose}>Odstąp</StoneButton>
      {primary}
    </div>
  )

  // the map is asking, or the wrath is playing: the window steps aside
  if (step === 'map' || curtain || reroute || (step === 'verse' && waitingDice)) return null

  // ---------- via: who speaks the word ----------
  if (step === 'via') {
    const full = action.distance ? `${baseCost} + dystans` : String(baseCost)
    const half = action.distance ? `${viaAvatarCost(baseCost)} + połowa dystansu` : String(viaAvatarCost(baseCost))
    return shell(
      <div className={styles.form}>
        <div className={styles.viaPick} role="radiogroup" aria-label="Kto wypowiada słowo">
          <span className={labelClass}>Kto wypowiada słowo</span>
          <label className={[styles.viaRow, !f.viaAvatarId ? styles.viaOn : ''].join(' ')}>
            <input type="radio" name="via" checked={!f.viaAvatarId} onChange={() => set('viaAvatarId', '')} />
            <span className={styles.viaWho}>
              <b>{godLabel(me)}</b>
              <small>Bóstwo samo, z nieba. Cel gdziekolwiek na świecie.</small>
            </span>
            <span className={styles.viaCost}>{full}</span>
          </label>
          {standing.map((a) => (
            <label key={a.entity.id} className={[styles.viaRow, styles.viaAvatar, f.viaAvatarId === a.entity.id ? styles.viaOn : ''].join(' ')}>
              <input type="radio" name="via" checked={f.viaAvatarId === a.entity.id} onChange={() => set('viaAvatarId', a.entity.id)} />
              <span className={styles.viaWho}>
                <b>{a.entity.emoji ?? ''} {a.entity.name} <small>życie {a.entity.hp ?? 0} z {a.entity.max_hp ?? 3}</small></b>
                <small>
                  Przez awatara: połowa ceny, cel najwyżej dwa heksy od niego.
                  {action.key === 'great_miracle' ? ' Wielki Cud spali awatara.' : ''}
                  {action.key === 'holy_war' ? ' Awatar poprowadzi armię: jego życie dolicza się do rzutu.' : ''}
                  {action.key === 'exodus' ? ' Awatar pójdzie z ludem na nowe miejsce.' : ''}
                </small>
              </span>
              <span className={[styles.viaCost, styles.viaCostHalf].join(' ')}>{half}</span>
            </label>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy} onClick={() => advance(stepIdx)}>
            {flow[stepIdx + 1] === 'map' ? 'Dalej: wskaż na mapie' : 'Dalej'}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- form: what the word needs before (or after) the map ----------
  if (step === 'form') {
    const formOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'form').length
    const { fields, ready } = renderForm(formOrdinal)
    return shell(
      <div className={styles.form}>
        {fields}
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={!ready || busy} onClick={() => advance(stepIdx)}>
            {flow[stepIdx + 1] === 'map' && !skipMap(stepIdx + 1) ? 'Dalej: wskaż na mapie' : 'Dalej'}
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
        {viaRow}
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {distance > 0 && <p className={styles.hint}>Dystans: {distance} {distance === 1 ? 'heks' : 'heksów'}, czyli {distance} Logos{baseCost ? ` doliczone do ${baseCost}` : ''}.</p>}
        {(action.key === 'develop_civilization' || action.key === 'catastrophe') && <ProphecyPicker prophecies={prophecies} value={f.prophecyId} onChange={(v) => set('prophecyId', v)} disabled={busy} />}
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay} title={!canPay ? 'Za mało Logos. Odstąp albo wypowiedz słowo przez awatara.' : undefined} onClick={submit}>
            {busy ? 'Słowo pada…' : viaAv ? `Czyń przez awatara (${paid} Logos)` : `Zapłać ${paid} Logos`}
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
        {viaRow}
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <Notice>
          Kości rzuca księga od razu. Potem {godLabel(def)} wybiera obronę i rzuca u siebie; twoja tura czeka na odpowiedź. Logos płacisz teraz.
        </Notice>
        <ProphecyPicker prophecies={prophecies} value={f.prophecyId} onChange={(v) => set('prophecyId', v)} disabled={busy} />
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay || !f.defenderId} onClick={declare}>
            {busy ? 'Kości lecą…' : `Rozpocznij starcie (${paid} Logos)`}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- verse: the dice everyone saw, the book's words, the player's last say ----------
  const happened = liveRow ? describeEvent(liveRow, ctx) : ''
  const o = (liveRow?.outcome && !Array.isArray(liveRow.outcome) ? liveRow.outcome : {}) as Record<string, unknown>
  return shell(
    <div className={styles.form}>
      {action.key === 'develop_civilization' && typeof o.d1 === 'number' && (
        <div className={styles.diceRow}>
          <Dice2d6 d1={Number(o.d1)} d2={Number(o.d2)} showTotal={false} animateKey={liveRow?.id} />
          <span className={styles.rollTotal}>
            <b className="engraved">{Number(o.total)}</b>
            <small>{Number(o.d1)} + {Number(o.d2)} {Number(o.score) < 0 ? '−' : '+'} {Math.abs(Number(o.score))} ({ATTRIBUTE_BY_KEY[String(o.attr) as AttrKey]?.name ?? ''}){o.avatar ? ' − 2' : ''}{o.prophecy ? ` + ${Number((o.prophecy as Record<string, unknown>).hold ?? 0)} (proroctwo)` : ''}</small>
          </span>
          <span className={styles.hint}>{o.tier === 'strong' ? '10+: dwóch wyznawców' : o.tier === 'mixed' ? '7..9: jeden wyznawca' : '6-: dar odrzucony'}</span>
        </div>
      )}
      {action.key === 'create_creature' && (o.role === 'beast' || o.role === 'herbivore') && typeof o.d1 === 'number' && (
        <div className={styles.diceRow}>
          <Dice2d6 d1={Number(o.d1)} d2={Number(o.d2)} showTotal={false} animateKey={liveRow?.id} />
          <span className={styles.rollTotal}>
            <b className="engraved">{Number(o.strength) > 0 ? `+${o.strength}` : String(o.strength)}</b>
            <small>{Number(o.d1)} + {Number(o.d2)} {Number(o.role === 'beast' ? o.wrath : o.grace) < 0 ? '−' : '+'} {Math.abs(Number(o.role === 'beast' ? o.wrath : o.grace))} ({o.role === 'beast' ? 'Gniew' : 'Łaska'}) = {Number(o.total)}</small>
          </span>
          <span className={styles.hint}>{o.role === 'beast' ? `siła: bestie ${temperOf(Number(o.strength))}` : `${herdRankName(Number(o.strength))}: Żyzność pola ${Number(o.strength) > 0 ? '+' : ''}${o.strength}`}</span>
        </div>
      )}
      {action.key === 'bless_land' && typeof o.d1 === 'number' && (
        <div className={styles.diceRow}>
          <Dice2d6 d1={Number(o.d1)} d2={Number(o.d2)} showTotal={false} animateKey={liveRow?.id} />
          <span className={styles.rollTotal}>
            <b className="engraved">{Number(o.bonus) > 0 ? `+${o.bonus}` : String(o.bonus)}</b>
            <small>{Number(o.d1)} + {Number(o.d2)} {Number(o.grace) < 0 ? '−' : '+'} {Math.abs(Number(o.grace))} (Łaska) = {Number(o.total)}</small>
          </span>
          <span className={styles.hint}>{resourceRankName(Number(o.bonus))}{o.replaced ? `, w miejsce ${String(o.replaced)}` : ''}</span>
        </div>
      )}
      {action.key === 'catastrophe' && typeof o.d1 === 'number' && (
        <div className={styles.diceRow}>
          <Dice2d6 d1={Number(o.d1)} d2={Number(o.d2)} showTotal={false} animateKey={liveRow?.id} />
          <span className={styles.rollTotal}>
            <b className="engraved">{Number(o.damage)}</b>
            <small>{Number(o.d1)} + {Number(o.d2)} {Number(o.wrath) < 0 ? '−' : '+'} {Math.abs(Number(o.wrath))} (Gniew){o.prophecy ? ` + ${Number(o.prophecy)} (proroctwo)` : ''} = {Number(o.total)}, połowa w dół, najmniej 1</small>
          </span>
          <span className={styles.hint}>obrażeń</span>
        </div>
      )}
      <Notice tone="ok">Słowo padło. {happened}</Notice>
      {action.key === 'catastrophe' && Array.isArray(o.hits) && (
        <ul className={styles.chosen}>
          {(o.hits as Record<string, unknown>[]).length === 0 && <li>Nie było tam nikogo, kto by to odczuł.</li>}
          {Object.entries((o.hits as Record<string, unknown>[]).filter((h) => h.t === 'dot').reduce<Record<string, number>>((acc, h) => ({ ...acc, [String(h.player_id)]: (acc[String(h.player_id)] ?? 0) + 1 }), {})).map(([pid, n]) => (
            <li key={pid}>{ctx.god(pid).name}: {followersWord(n)} mniej w mieście {String(o.city_name ?? '')}</li>
          ))}
          {(o.hits as Record<string, unknown>[]).filter((h) => h.t === 'creature').map((h, i) => (
            <li key={`c${i}`}>{String(h.emoji ?? '')} {String(h.name)}: {h.extinct ? 'wyginęły na zawsze' : 'przepadły z tego pola'}</li>
          ))}
          {(o.hits as Record<string, unknown>[]).filter((h) => h.t === 'avatar').map((h, i) => (
            <li key={`a${i}`}>Awatar {String(h.name)}: {Number(h.hp) === 0 ? 'poległ' : `ranny, życie ${h.hp} z ${h.max_hp ?? 3}`}</li>
          ))}
          {o.city_destroyed ? <li>Miasto {String(o.city_name ?? '')} obróciło się w ruinę.</li> : null}
          {o.biome_after ? <li>Nikt nie przeżył: ziemia stała się terenem {BIOME_BY_KEY[String(o.biome_after) as BiomeKey]?.name.toLowerCase() ?? ''}.</li> : f.after ? <li>Ktoś przeżył, więc ziemia została, jaka była.</li> : null}
          {Number(o.wasted) > 0 && <li>Obrażeń bez celu: {String(o.wasted)}.</li>}
        </ul>
      )}
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
    const coCreators = others.length > 0 && (
      <label className={fieldClass}>
        <span className={labelClass}>Współtwórcy (bóstwa, które czynią to razem z tobą)</span>
        <MultiSelect options={others.map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))} value={f.co_god_ids} onChange={(v) => set('co_god_ids', v)} />
      </label>
    )
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
                    <img className={styles.biomeSwatch} src={b.image} alt="" />
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
                <select className={inputClass} value={CATASTROPHE_TYPES.includes(f.catastrophe) ? f.catastrophe : OWN_GIFT} onChange={(e) => set('catastrophe', e.target.value === OWN_GIFT ? '' : e.target.value)}>
                  {CATASTROPHE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option value={OWN_GIFT}>Własny…</option>
                </select>
              </label>
              {!CATASTROPHE_TYPES.includes(f.catastrophe) && <TextField id="cat_own" label="Nazwij kataklizm" value={f.catastrophe} onChange={(e) => set('catastrophe', e.target.value)} maxLength={60} />}
              <label className={fieldClass}>
                <span className={labelClass}>Co zostanie po zniszczeniu</span>
                <select className={inputClass} value={f.after} onChange={(e) => set('after', e.target.value as FormState['after'])}>
                  <option value="">Bez zmian</option>
                  <option value="pustynia">Pustynia 🏜️</option>
                  <option value="ziemia">Ugór 🪨</option>
                  <option value="woda">Woda 🌊</option>
                </select>
              </label>
              <p className={styles.hint}>Obrażenia: 2k6 + Gniew ({scoreText(scores.wrath)}), połowa w dół, najmniej 1. Każde trafia losowo w wyznawcę miasta, istotę albo awatara. Teren zmieni się tylko wtedy, gdy na polu nikt nie przeżyje.</p>
            </div>
          ),
        }
      case 'bless_land':
        return {
          ready: !!f.resource,
          fields: (
            <div className={styles.fields}>
              <EmojiPicker label="Surowiec" options={[...RESOURCES]} used={new Set()} value={f.resource} onChange={(v) => set('resource', v)} />
              <p className={styles.hint}>{f.resource ? `${f.resource} ${RESOURCE_NAMES[f.resource] ?? ''}: ` : ''}Jeden surowiec na pole; nowe błogosławieństwo zastępuje stary. Jego rangę rzuca księga: 2k6 + Łaska ({scoreText(scores.grace)}), od przeklętego złoża (−1) po boski surowiec (+3) do Żyzności pola.</p>
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
              {key === 'create_creature' && (
                <div className={styles.viaPick} role="radiogroup" aria-label="Stado czy bestia">
                  <span className={labelClass}>Stado czy bestia</span>
                  <label className={[styles.viaRow, f.diet === 'herbivore' ? styles.viaOn : ''].join(' ')}>
                    <input type="radio" name="diet" checked={f.diet === 'herbivore'} onChange={() => set('diet', 'herbivore')} />
                    <span className={styles.viaWho}>
                      <b>Stado (roślinożerne)</b>
                      <small>Lewy górny róg heksa, jedno na pole. Rangę rzuca księga: 2k6 + Łaska ({scoreText(scores.grace)}), od szkodników (−1) po święte stado (+3) do Żyzności pola, na którym się pasie. Szuka pastwisk, mnoży się, nigdy nie walczy.</small>
                    </span>
                  </label>
                  <label className={[styles.viaRow, f.diet === 'carnivore' ? styles.viaOn : ''].join(' ')}>
                    <input type="radio" name="diet" checked={f.diet === 'carnivore'} onChange={() => set('diet', 'carnivore')} />
                    <span className={styles.viaWho}>
                      <b>Bestia</b>
                      <small>Dół heksa, jedna bestia albo plemię na pole. Siłę rzuca księga: 2k6 + Gniew ({scoreText(scores.wrath)}), od potulnej (−1) po niszczycielską (+3). Poluje, mnoży się i walczy.</small>
                    </span>
                  </label>
                </div>
              )}
              <EmojiPicker label="Znak na mapie" options={key === 'create_sapient' ? SAPIENT_EMOJI : f.diet === 'carnivore' ? BEAST_EMOJI : HERBIVORE_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
            </div>
          ),
        }
      case 'create_avatar':
        return {
          ready: f.name.trim().length > 0 && !!f.emoji,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Imię awatara" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <EmojiPicker label="Znak na mapie" options={AVATAR_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
              {coCreators}
            </div>
          ),
        }
      case 'change_creature': {
        const src = world.entityById(f.speciesId)
        return {
          ready: f.name.trim().length > 0 && !!f.emoji,
          fields: (
            <div className={styles.fields}>
              {src && <p className={styles.hint}>Odmiana istot {src.emoji ?? ''} {src.name}: zmienia się tylko ta jedna, na swoim heksie. Czym różni się od pierwowzoru, opowiesz w wersecie.</p>}
              <TextField id="ent_name" label="Nazwa odmiany" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <EmojiPicker label="Nowy znak na mapie" options={src && world.isSapient(src) ? SAPIENT_EMOJI : world.roleOf(src) === 'beast' ? BEAST_EMOJI : world.roleOf(src) === 'herbivore' ? HERBIVORE_EMOJI : CREATURE_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
            </div>
          ),
        }
      }
      case 'create_civilization': {
        const sap = f.target ? world.occupantsAt(f.target.q, f.target.r).map((o) => world.entityById(o.entity_id)).filter((e): e is Entity => world.isSapient(e)) : []
        return {
          ready: f.name.trim().length > 0 && !!f.speciesId,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Nazwa ludu" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              {sap.length > 1 ? (
                <label className={fieldClass}>
                  <span className={labelClass}>Z której istoty rozumnej wychodzi ten lud</span>
                  <select className={inputClass} value={f.speciesId} onChange={(e) => set('speciesId', e.target.value)}>
                    {sap.map((s) => (
                      <option key={s.id} value={s.id}>{s.emoji ?? ''} {s.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                sap[0] && <p className={styles.hint}>Lud wychodzi z istot {sap[0].emoji ?? ''} {sap[0].name}. Miasto rodzi się z pierwszymi wyznawcami w twoim kolorze.</p>
              )}
              {coCreators}
            </div>
          ),
        }
      }
      case 'develop_civilization': {
        const city = world.entityById(f.cityId)
        return {
          ready: giftText.length > 0,
          fields: (
            <div className={styles.fields}>
              {city && <p className={styles.hint}>Miasto {city.name}, {followersWord(world.cityDots(city.id))}, z tego twoich: {world.dotsOf(city.id, me.id)}.</p>}
              <label className={fieldClass}>
                <span className={labelClass}>Co ofiarowujesz wyznawcom</span>
                <select className={inputClass} value={f.gift} onChange={(e) => set('gift', e.target.value)}>
                  {GIFTS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                  <option value={OWN_GIFT}>Własny dar…</option>
                </select>
              </label>
              {f.gift === OWN_GIFT && <TextField id="gift_own" label="Nazwij dar" value={f.giftOwn} onChange={(e) => set('giftOwn', e.target.value)} maxLength={80} />}
              <AttrPicker label="Co wspiera ten dar" options={['grace', 'wisdom']} value={f.attr} scores={scores} onChange={(v) => set('attr', v)} />
              <p className={styles.hint}>Księga rzuci 2k6 + atrybut: 10+ to dwóch wyznawców, 7..9 jeden, 6- nic.</p>
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
              <AttrPicker label="Czym nawracasz" options={['majesty', 'whisper']} value={f.attr} scores={scores} onChange={(v) => set('attr', v)} />
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
                <AttrPicker label="Armię prowadzi Gniew" options={['wrath']} value="wrath" scores={scores} onChange={() => undefined} />
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
      case 'avatar_duel': {
        const mine = world.entityById(f.avatarId)
        const enemy = world.entityById(f.enemyAvatarId)
        return {
          ready: !!f.avatarId && !!f.enemyAvatarId && !!f.defenderId,
          fields: (
            <div className={styles.fields}>
              <p className={styles.hint}>
                {mine?.emoji ?? ''} {mine?.name ?? 'Twój awatar'} (życie {mine?.hp ?? 0} z {mine?.max_hp ?? 3}) przeciw {enemy?.emoji ?? ''} {enemy?.name ?? 'awatarowi'} (życie {enemy?.hp ?? 0} z {enemy?.max_hp ?? 3}), którym włada {godLabel(players.find((pl) => pl.id === f.defenderId))}.
              </p>
              <AttrPicker label="Czym walczysz" options={['wrath', 'majesty', 'whisper']} value={f.attr} scores={scores} onChange={(v) => set('attr', v)} />
              <p className={styles.hint}>Gniew to siła, Majestat to boska aura, Podszept to skrytobójstwo. Obrońca też wybiera. Wygrana o 3+ rani wroga dwa razy, o 1..2 rani obu, remis rani obu, przegrana rani ciebie.</p>
            </div>
          ),
        }
      }
      case 'prophecy': {
        const av = world.entityById(f.avatarId)
        return {
          ready: f.text.trim().length > 0 && !!f.avatarId,
          fields: (
            <div className={styles.fields}>
              <p className={styles.hint}>Prorok {av?.emoji ?? ''} {av?.name ?? ''} zapowiada, że:</p>
              <TextArea id="prophecy_text" label="Treść proroctwa" placeholder="Co nadejdzie. Jednym tchem, jak wyrocznia." value={f.text} onChange={(e) => set('text', e.target.value)} rows={4} maxLength={400} />
              <p className={styles.hint}>Nieuchronność zaczyna od +1 i rośnie o 1 każdej Fazy Chaosu, aż do +3. Przy rzucie wybierzesz „Wypełnij proroctwo” i dodasz ją raz.</p>
            </div>
          ),
        }
      }
      case 'resurrect_avatar': {
        const dead = entities.filter((e) => e.kind === 'avatar' && e.status !== 'active')
        return {
          ready: !!f.deadAvatarId,
          fields: (
            <div className={styles.fields}>
              <label className={fieldClass}>
                <span className={labelClass}>Poległy awatar</span>
                <select className={inputClass} value={f.deadAvatarId} onChange={(e) => set('deadAvatarId', e.target.value)}>
                  {dead.map((d) => (
                    <option key={d.id} value={d.id}>{d.emoji ?? ''} {d.name}</option>
                  ))}
                </select>
              </label>
              <TextArea id="ent_desc" label="Jak zmieniła go śmierć" value={f.description} onChange={(e) => set('description', e.target.value)} />
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
        return [`Kataklizm: ${f.catastrophe}`, `Cel: ${at}`, `Obrażenia: połowa z 2k6 + Gniew (${scoreText(scores.wrath)}), najmniej 1`, f.after ? `Gdy nikt nie przeżyje: ${BIOME_BY_KEY[f.after].name}` : 'Teren bez zmian']
      case 'great_miracle':
        return ['Coś WIELKIEGO na skalę całego świata. Opowiesz to w wersecie.']
      case 'bless_land':
        return [`Surowiec: ${f.resource} ${RESOURCE_NAMES[f.resource] ?? ''}`, `Miejsce: ${at}${f.target && world.resourceAt(f.target.q, f.target.r) ? ` (zastąpi ${world.resourceAt(f.target.q, f.target.r)})` : ''}`, `Rangę rzuci księga: 2k6 + Łaska (${scoreText(scores.grace)})`]
      case 'pour_river':
        return [
          `Źródło: ${f.path[0] ? `(${f.path[0].q}, ${f.path[0].r})` : ''}`,
          `Koryto: ${Math.max(0, f.path.length - 1)} ${f.path.length - 1 === 1 ? 'pole' : f.path.length - 1 >= 2 && f.path.length - 1 <= 4 ? 'pola' : 'pól'} za źródłem`,
          f.mouth ? `Ujście: woda (${f.mouth.q}, ${f.mouth.r})` : 'Wpada do innej rzeki',
        ]
      case 'create_creature':
        return [`${f.emoji} ${f.name}`, f.diet === 'carnivore' ? `Bestia: siłę rzuci księga (2k6 + Gniew ${scoreText(scores.wrath)})` : `Stado: rangę rzuci księga (2k6 + Łaska ${scoreText(scores.grace)})`, `Miejsce: ${at}`]
      case 'create_sapient':
        return [`${f.emoji} ${f.name}`, `Miejsce: ${at}`]
      case 'create_avatar':
        return [`${f.emoji} ${f.name}`, `Miejsce: ${at}`]
      case 'change_creature':
        return [`Odmiana: ${f.emoji} ${f.name}`]
      case 'migrate':
        return [`${world.entityById(f.speciesId)?.emoji ?? ''} ${world.entityById(f.speciesId)?.name ?? ''}: z (${f.from?.q}, ${f.from?.r}) na (${f.target?.q}, ${f.target?.r})`]
      case 'create_civilization':
        return [`Lud: ${f.name}`, `Z istoty: ${world.entityById(f.speciesId)?.name ?? ''}`, `Miejsce: ${at}`]
      case 'develop_civilization':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Dar: ${giftText}`, `Atrybut: ${ATTRIBUTE_BY_KEY[f.attr].name} (${scoreText(scores[f.attr])})`]
      case 'exodus':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}`, `${followersWord(f.dots)} i istota ${world.entityById(f.speciesId)?.name ?? ''}`, `Cel: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (dołączają do miasta ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name})` : ` (nowe miasto ${f.name})`}`]
      case 'convert':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Nawracasz wyznawców: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Atrybut: ${ATTRIBUTE_BY_KEY[f.attr].name} (${scoreText(scores[f.attr])})`]
      case 'holy_war':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}, Armia: ${followersWord(f.army)}`, `Cel: ${world.entityById(f.targetCityId)?.name ?? ''}, broni: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Rzut: 2k6 + Gniew (${scoreText(scores.wrath)}) + ${f.army}`]
      case 'pilgrimage':
        return [`Awatar: ${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''}`, `Idzie na ${at}`]
      case 'resurrect_avatar':
        return [`Awatar: ${entities.find((e) => e.id === f.deadAvatarId)?.name ?? ''}`, `Wraca na ${at}, z pełnym życiem`]
      case 'avatar_duel':
        return [`${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''} przeciw ${world.entityById(f.enemyAvatarId)?.emoji ?? ''} ${world.entityById(f.enemyAvatarId)?.name ?? ''}`, `Broni: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Rzut: 2k6 + ${ATTRIBUTE_BY_KEY[f.attr].name} (${scoreText(scores[f.attr])})${f.prophecyId ? ' + proroctwo' : ''}`]
      case 'prophecy':
        return [`Prorok: ${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''}`, `Zapowiada, że: ${f.text.trim()}`]
      default:
        return []
    }
  }
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
              {action.distance ? (action.costs[e - 1] === 0 ? '1 za heks' : `${action.costs[e - 1]}+`) : action.costs[e - 1]}
            </span>
          ))}
        </div>
        {action.requirement && <p className={styles.rulesReq}>Warunek: {action.requirement.text}.</p>}
        {action.distance && <p className={styles.rulesReq}>Plus 1 Logos za każdy heks dystansu.</p>}
        {action.details.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </aside>
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
