import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { rpc } from '@/lib/supabase'
import type { ActionLog, ActionPayload, AttrKey, BiomeKey, Contest, Entity, EntityKind, HexRef, Player } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { hexDistance } from '@/lib/hex'
import { AVATAR_REACH, TIER_RANGE, canMultiply, costFor, groupOf, standingAvatars, type ActionDef, type Era, type FlowStep, type Tier } from '@/data/actions'
import { SAPIENT_TRAITS } from '@/data/traits'
import { BIOMES, BIOME_BY_KEY } from '@/data/biomes'
import { AVATAR_EMOJI, BEAST_EMOJI, CREATURE_EMOJI, HERBIVORE_EMOJI, SAPIENT_EMOJI } from '@/data/emoji'
import { RESOURCES, RESOURCE_NAMES, isMountain, strengthLabel } from '@/data/fertility'
import { ATTRIBUTE_BY_KEY, scoresFor } from '@/data/pantheon'
import { tierDetail, fightLine } from '@/data/dice'
import { GIFTS, followersWord } from '@/data/cities'
import { useGameStore, playerLabel, godLabel, selectPropheciesOf } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice, FrescoFrame, inputClass, labelClass, fieldClass } from '@/components/ui/Primitives'
import { actionArt } from '@/data/actionArt'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { ActionIcon } from '@/components/ui/ActionIcons'
import { ProphecyPicker } from '@/features/pantheon/ProphecyPicker'
import { useDiceGate, useVerseDialogFlag } from '../diceGate'
import { AttributeTiles } from './AttributeTiles'
import { RollReveal } from './RollReveal'
import { useMapMode, type MapMode } from '../map/mapMode'
import { useWorld } from '../map/useWorld'
import styles from './actions.module.css'

const OWN_GIFT = '__own'

interface FormState {
  name: string
  description: string
  co_god_ids: string[]
  emoji: string
  biome: BiomeKey
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
  /** the avatar that speaks a word of the avatar, or walks, or prophesies */
  avatarId: string
  summary: string
  deadAvatarId: string
  /** a prophecy spent on this roll */
  prophecyId: string | null
  /** avatar duel: the enemy's avatar */
  enemyAvatarId: string
  /** prophecy: what is foretold */
  text: string
  /** bless_land */
  resource: string
  /** pour_river: the channel from the source, and the water it ends in */
  path: HexRef[]
  mouth: HexRef | null
}

const initial = (): FormState => ({
  name: '',
  description: '',
  co_god_ids: [],
  emoji: '',
  biome: 'trawa',
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
  summary: '',
  deadAvatarId: '',
  prophecyId: null,
  enemyAvatarId: '',
  text: '',
  resource: '',
  path: [],
  mouth: null,
})

const avatarAt = (w: WorldView, q: number, r: number) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'avatar')

/** the words of the avatar that first step into a city: the city must lie within its reach */
const ENTERS_CITY = new Set(['convert', 'exodus', 'holy_war'])

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
  const standing = standingAvatars(world, me)
  const avatarWord = groupOf(action.key) === 'avatar'
  const flow = useMemo<FlowStep[]>(() => action.flow, [action.flow])
  // a prophecy opened from the avatar on the map skips the question which avatar speaks
  const [stepIdx, setStepIdx] = useState(action.key === 'prophecy' && preset?.avatarId ? 1 : 0)
  const step: FlowStep = flow[stepIdx]
  const [f, setF] = useState<FormState>(() => {
    const s = initial()
    if (action.key === 'prophecy' && preset?.avatarId) s.avatarId = preset.avatarId
    if (action.key === 'resurrect_avatar') s.deadAvatarId = entities.find((e) => e.kind === 'avatar' && e.status !== 'active')?.id ?? ''
    return s
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rules, setRules] = useState(false)
  const [row, setRow] = useState<ActionLog | null>(null)
  /** a mountain cut a river in this word: the map asks for the new bed before the window closes */
  const [reroute, setReroute] = useState<{ riverId: string; from: HexRef } | null>(null)
  /** the dice fell for this word: the window shows them before it closes */
  const [rolled, setRolled] = useState<{ row?: ActionLog; contest?: Contest; attr: AttrKey } | null>(null)
  /** a migration ended in a fight: the window shows the two throws before it closes */
  const [fought, setFought] = useState<ActionLog | null>(null)
  const claim = useDiceGate((s) => s.claim)
  const unclaim = useDiceGate((s) => s.unclaim)
  const dismiss = useDiceGate((s) => s.dismiss)
  useEffect(() => () => unclaim(), [unclaim])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))

  const scores = scoresFor(me.domain_key, me.attr_primary, me.attr_bonus)
  /** the fulfilled prophecy's hold, added to the roll */
  const hold = prophecies.find((p) => p.id === f.prophecyId)?.hold ?? 0
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
  const paid = cost
  const canPay = me.logos >= paid
  /** how many fields of distance my Words still buy */
  const budget = me.logos - baseCost
  /** one of my avatars stands at most two fields from the place */
  const inReach = (q: number, r: number) => standing.some((a) => hexDistance(a.occupant!, { q, r }) <= AVATAR_REACH)
  /** the avatar nearest the place: the one that speaks the word */
  const nearestAvatar = (q: number, r: number) => [...standing].sort((a, b) => hexDistance(a.occupant!, { q, r }) - hexDistance(b.occupant!, { q, r }))[0]
  /** the avatar that speaks this word of the avatar (chosen when the city was clicked) */
  const speaker = avatarWord && action.key !== 'pilgrimage' && action.key !== 'prophecy' && action.key !== 'avatar_duel' ? standing.find((a) => a.entity.id === f.avatarId) ?? standing[0] : undefined

  // ---------- the map's questions ----------
  const mapOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'map').length

  function advance(from: number) {
    const i = from + 1
    if (i >= flow.length) onClose()
    else setStepIdx(i)
  }

  function mapSpec(): Omit<MapMode, 'onFinish' | 'onCancel'> | null {
    const key = action.key
    const biomeName = BIOME_BY_KEY[f.biome].name.toLowerCase()
    const reach = (from: HexRef | undefined, q: number, r: number) => !!from && hexDistance(from, { q, r }) >= 1 && hexDistance(from, { q, r }) <= budget
    const reachNote = ' Najwyżej dwa heksy od twojego awatara.'
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
      case 'lightning': {
        const target = (o: { entity_id: string }, w: WorldView) => { const role = w.roleOf(w.entityById(o.entity_id)); return role === 'beast' || role === 'herbivore' || role === 'avatar' }
        return {
          kind: 'occupant',
          title: 'Piorun',
          instruction: 'Kliknij cel pioruna: bestię, stado albo awatara. Lud i miasta są poza jego zasięgiem.',
          valid: (q, r, w) => w.occupantsAt(q, r).some((o) => target(o, w)),
          validOccupant: target,
        }
      }
      case 'flood':
        return { kind: 'hex', title: 'Potop', instruction: 'Kliknij ląd, który zalewają wody. Przy 10+ stanie się wodą na zawsze.', valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' } }
      case 'fire_rain':
        return { kind: 'hex', title: 'Deszcz Ognia', instruction: 'Kliknij ląd, na który spada ogień.', valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' } }
      case 'drought':
        return { kind: 'hex', title: 'Susza', instruction: 'Kliknij ląd, nad którym stanie słońce: jego Żyzność spadnie do zera na dwie albo trzy noce.', valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' } }
      case 'plague':
        return {
          kind: 'hex',
          title: 'Plaga',
          instruction: 'Kliknij pole, na którym ktoś żyje: miasto, stado albo bestię. Zaraza zabiera co noc dwoje mieszkańców.',
          valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' && (!!w.cityAt(q, r) || w.occupantsAt(q, r).some((o) => { const e = w.entityById(o.entity_id); return e?.kind === 'creature' && !w.isSapient(e) })) },
        }
      case 'bless_land':
        return { kind: 'hex', title: 'Błogosławienie Ziemi', instruction: `Kliknij ląd, który dostanie ${f.resource} ${RESOURCE_NAMES[f.resource] ?? 'surowiec'}. Góry też, woda nie; dotychczasowy surowiec zostanie zastąpiony.`, valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' } }
      case 'pour_river':
        return {
          kind: 'river',
          title: 'Wylanie Rzeki',
          instruction: 'Kliknij górę, z której wypływa rzeka, potem kolejne sąsiednie pola. Klik w wodę albo w inną rzekę kończy rzekę. Klik w ostatnie pole cofa je.',
          valid: (q, r, w, sel) => {
            const b = w.hexAt(q, r)?.biome
            if (!b) return false
            if (sel.length === 0) return isMountain(b) && !w.riverAt(q, r)
            return !isMountain(b)
          },
          isTerminal: (q, r, w) => w.hexAt(q, r)?.biome === 'woda' || !!w.riverAt(q, r),
        }
      case 'create_beast':
      case 'create_herd': {
        const role = key === 'create_beast' ? 'beast' : 'herbivore'
        return { kind: 'hex', title: action.name, instruction: `Kliknij ląd (także góry) z wolnym miejscem ${role === 'beast' ? 'na dole heksa' : 'w lewym górnym rogu heksa'}, na którym pojawią się ${f.name.trim() || 'nowe istoty'}. Nie wodę.`, valid: (q, r, w) => { const h = w.hexAt(q, r); return !!h && h.biome !== 'woda' && w.slotFor(q, r, role) !== null } }
      }
      case 'multiply': {
        if (mapOrdinal === 0) {
          return {
            kind: 'occupant',
            title: 'Rozmnożenie',
            instruction: 'Kliknij istotę, która się rozmnoży: stado, bestię albo plemię z wolnym polem obok.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => canMultiply(o, w)),
            validOccupant: (o, w) => canMultiply(o, w),
          }
        }
        const src = world.entityById(f.speciesId)
        const role = world.roleOf(src) ?? 'herbivore'
        return {
          kind: 'hex',
          title: 'Rozmnożenie',
          instruction: `Kliknij sąsiednie pole, na którym stanie kopia: ${src?.emoji ?? ''} ${src?.name ?? 'istoty'}. Wolne miejsce roli, bez tego gatunku.`,
          valid: (q, r, w) => {
            if (!f.from || hexDistance(f.from, { q, r }) !== 1) return false
            const h = w.hexAt(q, r)
            const landOk = role === 'tribe' ? !w.blocked(q, r) : !!h && h.biome !== 'woda'
            return landOk && w.slotFor(q, r, role) !== null && !w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId)
          },
        }
      }
      case 'create_sapient':
        return { kind: 'hex', title: action.name, instruction: `Kliknij ląd z wolnym dołem heksa, na którym pojawią się ${f.name.trim() || 'nowe istoty'}. Nie Wodę, nie Góry.`, valid: (q, r, w) => w.slotFor(q, r, 'tribe') !== null && !w.blocked(q, r) }
      case 'create_avatar':
      case 'resurrect_avatar':
        return { kind: 'hex', title: action.name, instruction: 'Kliknij heks, na którym staje awatar: wolny dolny róg, nie Woda, nie Góry.', valid: (q, r, w) => w.slotFor(q, r, 'avatar') !== null && !w.blocked(q, r) }
      case 'change_creature':
        return {
          kind: 'occupant',
          title: 'Zmiana Istoty',
          instruction: 'Kliknij istotę, która się odmieni: cały jej gatunek, wszędzie, gdzie żyje.',
          valid: (q, r, w) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'),
          validOccupant: (o, w) => w.entityById(o.entity_id)?.kind === 'creature',
        }
      case 'migrate': {
        if (mapOrdinal === 0) {
          return {
            kind: 'occupant',
            title: 'Migracja',
            instruction: 'Kliknij istotę, która rusza w drogę.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => w.entityById(o.entity_id)?.kind === 'creature'),
            validOccupant: (o, w) => w.entityById(o.entity_id)?.kind === 'creature',
          }
        }
        const src = world.entityById(f.speciesId)
        const role = world.roleOf(src) ?? 'herbivore'
        const canEnter = (q: number, r: number, w: WorldView) => {
          const h = w.hexAt(q, r)
          if (!h || h.biome === 'woda') return false
          if (w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId)) return false
          if (role === 'herbivore') return w.slotFor(q, r, 'herbivore') !== null
          if (role === 'tribe') {
            if (w.blocked(q, r) || w.cityAt(q, r)) return false
            const bottom = w.roleOf(w.entityById(w.bottomAt(q, r)?.entity_id))
            return !bottom || bottom === 'beast'
          }
          // a beast: a free bottom, a beast or a tribe to fight, or a city to attack
          if (w.cityAt(q, r)) return true
          const bottom = w.roleOf(w.entityById(w.bottomAt(q, r)?.entity_id))
          return !bottom || bottom === 'beast' || bottom === 'tribe'
        }
        return {
          kind: 'hex',
          title: 'Migracja',
          instruction: `Kliknij heks, na który idą ${src?.name ?? 'istoty'}. 1 Logos za każdy heks; świecą tylko te, na które cię stać.${role === 'beast' ? ' Bestia może wejść na bestię, plemię albo napaść na miasto: wtedy walczy od razu.' : role === 'tribe' ? ' Plemię może wejść na bestię: wtedy walczy od razu.' : ''}`,
          valid: (q, r, w) => canEnter(q, r, w) && reach(f.from ?? undefined, q, r),
          costFor: (sel) => (f.from && sel[0] ? hexDistance(f.from, sel[0]) : null),
        }
      }
      case 'create_civilization':
        return {
          kind: 'hex',
          title: 'Stworzenie Cywilizacji',
          instruction: 'Kliknij heks, na którym żyje istota rozumna i nie stoi jeszcze miasto.',
          valid: (q, r, w) => !w.blocked(q, r) && !w.cityAt(q, r) && w.occupantsAt(q, r).some((o) => w.isSapient(w.entityById(o.entity_id))),
        }
      case 'develop_civilization':
        return { kind: 'city', title: 'Rozwój Cywilizacji', instruction: `Kliknij miasto, któremu awatar niesie dar.${reachNote}`, valid: (q, r) => !!world.cityAt(q, r) && inReach(q, r) }
      case 'exodus':
        if (mapOrdinal === 0) {
          return { kind: 'city', title: 'Exodus', instruction: `Kliknij miasto, w którym masz wyznawców: awatar wejdzie do niego i wyprowadzi ich.${reachNote}`, valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.dotsOf(c.entity_id, me.id) > 0 && inReach(q, r) } }
        }
        return {
          kind: 'hex',
          title: 'Exodus',
          instruction: `Kliknij ląd, dokąd idzie ${followersWord(f.dots)}: na wolne pole albo do innego miasta. 1 Logos za każdy heks; świecą tylko te, na które cię stać.`,
          valid: (q, r, w) => !w.blocked(q, r) && reach(srcCity, q, r) && (!!w.cityAt(q, r) || w.slotFor(q, r, 'tribe') !== null || w.occupantsAt(q, r).some((o) => o.entity_id === f.speciesId)),
          costFor: (sel) => (srcCity && sel[0] ? hexDistance(srcCity, sel[0]) : null),
        }
      case 'convert':
        return { kind: 'city', title: 'Nawracanie', instruction: `Kliknij miasto, w którym inne bóstwo ma wyznawców: awatar wejdzie do niego i będzie nawracać.${reachNote}`, valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.followersOf(c.entity_id).some((x) => x.player_id !== me.id) && inReach(q, r) } }
      case 'holy_war':
        if (mapOrdinal === 0) {
          return { kind: 'city', title: 'Święta Wojna', instruction: `Kliknij swoje miasto: to, w którym masz najwięcej wyznawców (co najmniej dwóch, bo jeden zostaje). Awatar wejdzie do niego i poprowadzi armię.${reachNote}`, valid: (q, r, w) => { const c = w.cityAt(q, r); return !!c && w.holds(c.entity_id, me.id) && w.dotsOf(c.entity_id, me.id) >= 2 && inReach(q, r) } }
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
            title: 'Pielgrzymka',
            instruction: 'Kliknij swojego awatara, który rusza w drogę.',
            valid: (q, r, w) => w.occupantsAt(q, r).some((o) => myIds.has(o.entity_id)),
            validOccupant: (o) => myIds.has(o.entity_id),
          }
        }
        return {
          kind: 'hex',
          title: 'Pielgrzymka',
          instruction: 'Kliknij heks, na który idzie awatar: wolne miejsce, nie Woda, nie Góry. 1 Logos za każdy heks; świecą tylko te, na które cię stać.',
          valid: (q, r, w) => !w.blocked(q, r) && w.slotFor(q, r, 'avatar') !== null && !!avatarOcc && reach(avatarOcc, q, r),
          costFor: (sel) => (avatarOcc && sel[0] ? hexDistance(avatarOcc, sel[0]) : null),
        }
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
        case 'pour_river': {
          const last = picks[picks.length - 1]
          const water = !!last && world.hexAt(last.q, last.r)?.biome === 'woda'
          n.path = (water ? picks.slice(0, -1) : picks).map(({ q, r }) => ({ q, r }))
          n.mouth = water && last ? { q: last.q, r: last.r } : null
          break
        }
        case 'lightning': {
          n.occupantId = p.occupantId ?? ''
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          n.speciesId = occ?.entity_id ?? ''
          n.target = { q: p.q, r: p.r }
          break
        }
        case 'change_creature': {
          n.occupantId = p.occupantId ?? ''
          const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
          const src = occ ? world.entityById(occ.entity_id) : undefined
          if (src) {
            n.speciesId = src.id
            n.name = src.name
            n.emoji = src.emoji ?? ''
            n.description = src.description
          }
          break
        }
        case 'multiply': {
          if (mapOrdinal === 0) {
            n.occupantId = p.occupantId ?? ''
            const occ = world.occupantsAt(p.q, p.r).find((o) => o.id === p.occupantId)
            n.speciesId = occ?.entity_id ?? ''
            n.from = { q: p.q, r: p.r }
          } else n.target = { q: p.q, r: p.r }
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
          n.avatarId = nearestAvatar(p.q, p.r)?.entity.id ?? ''
          break
        case 'exodus':
          if (mapOrdinal === 0) {
            n.cityId = p.cityId ?? ''
            n.avatarId = nearestAvatar(p.q, p.r)?.entity.id ?? ''
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
            n.avatarId = nearestAvatar(p.q, p.r)?.entity.id ?? ''
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

  useEffect(() => {
    if (!reroute) return
    const { riverId, from } = reroute
    const done = () => {
      setReroute(null)
      onClose()
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
  function buildPayload(attr?: AttrKey): ActionPayload {
    const base: ActionPayload = {
      summary: '',
      ...(action.roll ? { attr: attr ?? f.attr, prophecy_id: f.prophecyId ?? undefined } : {}),
    }
    const t = f.target ?? { q: 0, r: 0 }
    switch (action.key) {
      case 'shape_land':
        return { ...base, biome: f.biome, hexes: f.hexes }
      case 'lightning':
        return { ...base, occupant_id: f.occupantId }
      case 'flood':
      case 'fire_rain':
      case 'drought':
      case 'plague':
        return { ...base, q: t.q, r: t.r }
      case 'great_miracle':
        return base
      case 'bless_land':
        return { ...base, q: t.q, r: t.r, resource: f.resource }
      case 'pour_river':
        return { ...base, path: f.path, mouth: f.mouth }
      case 'create_beast':
      case 'create_herd':
        return { ...base, entity: { op: 'create', name: f.name, traits: [], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'multiply':
        return { ...base, occupant_id: f.occupantId, to: f.target ?? undefined }
      case 'create_sapient':
        return { ...base, entity: { op: 'create', name: f.name, traits: [SAPIENT_TRAITS[0]], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'create_avatar':
        return { ...base, entity: { op: 'create', name: f.name, conditions: [], co_god_ids: f.co_god_ids }, emoji: f.emoji, q: t.q, r: t.r }
      case 'change_creature': {
        const src = world.entityById(f.speciesId)
        return { ...base, occupant_id: f.occupantId, entity: { op: 'update', name: f.name.trim(), description: f.description.trim() }, emoji: f.emoji && f.emoji !== (src?.emoji ?? '') ? f.emoji : undefined }
      }
      case 'migrate':
        return { ...base, entity_id: f.speciesId, from: f.from ?? undefined, to: f.target ?? undefined }
      case 'create_civilization':
        return { ...base, entity: { op: 'create', name: f.name, co_god_ids: f.co_god_ids }, q: t.q, r: t.r, species_id: f.speciesId }
      case 'develop_civilization':
        return { ...base, city_id: f.cityId, gift: giftText, avatar_id: f.avatarId || undefined }
      case 'prophecy':
        return { ...base, avatar_id: f.avatarId, text: f.text.trim() }
      case 'exodus':
        return { ...base, city_id: f.cityId, dots: f.dots, species_id: f.speciesId, to: f.target ?? undefined, name: f.name.trim(), description: '', avatar_id: f.avatarId || undefined }
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

  async function submit(attr?: AttrKey) {
    setBusy(true)
    setError(null)
    // my window shows this throw: the table's dice window keeps quiet for me (a migration may end in a fight)
    if (action.roll || action.key === 'migrate') claim()
    try {
      const r = await rpc<ActionLog>('perform_action', { p_game_id: game.id, p_action_key: action.key, p_payload: buildPayload(attr) })
      setRow(r)
      const o = r.outcome && !Array.isArray(r.outcome) ? (r.outcome as Record<string, unknown>) : null
      const cut = action.key === 'shape_land' && o && o.reroute && typeof o.reroute === 'object' ? (o.reroute as { river_id: string; from: HexRef }) : null
      if (cut && cut.river_id && cut.from) setReroute({ riverId: cut.river_id, from: cut.from })
      else if (action.roll) setRolled({ row: r, attr: attr ?? f.attr })
      else if (action.key === 'migrate' && o && o.fight) setFought(r)
      else {
        if (action.key === 'migrate') unclaim()
        onClose()
      }
    } catch (err) {
      setError((err as Error).message)
      if (action.roll || action.key === 'migrate') unclaim()
    } finally {
      setBusy(false)
    }
  }

  async function declare(attr: AttrKey) {
    setBusy(true)
    setError(null)
    claim()
    try {
      const payload = action.key === 'convert'
        ? { city_id: f.cityId, defender_id: f.defenderId, attr, prophecy_id: f.prophecyId, avatar_id: f.avatarId || undefined }
        : action.key === 'avatar_duel'
          ? { attacker_avatar_id: f.avatarId, defender_avatar_id: f.enemyAvatarId, attr, prophecy_id: f.prophecyId }
          : { source_city_id: f.cityId, army: f.army, target_city_id: f.targetCityId, defender_id: f.defenderId, attr, prophecy_id: f.prophecyId, avatar_id: f.avatarId || undefined }
      const c = await rpc<Contest>('declare_contest', { p_game_id: game.id, p_kind: action.key, p_payload: payload })
      setRolled({ contest: c, attr })
    } catch (err) {
      setError((err as Error).message)
      unclaim()
    } finally {
      setBusy(false)
    }
  }

  /** a tile was clicked: the word is paid and thrown with that attribute */
  function choose(attr: AttrKey) {
    set('attr', attr)
    if (action.contested) void declare(attr)
    else void submit(attr)
  }

  /** the dice have been read: the table may go on, the world shows what the word did */
  function finishRoll() {
    const c = rolled?.contest
    const declaredRow = c ? log.find((l) => l.action_key === 'contest_declared' && !!l.outcome && !Array.isArray(l.outcome) && (l.outcome as Record<string, unknown>).contest_id === c.id) : undefined
    const rowId = rolled?.row?.id ?? fought?.id ?? declaredRow?.id ?? c?.log_id ?? null
    if (rowId) dismiss(rowId)
    unclaim()
    onClose()
  }

  // ---------- shell ----------
  const title = (
    <span className={styles.titleRow}>
      <ActionIcon k={action.key} size={26} className={styles.titleIcon} />
      {action.name}
    </span>
  )

  const shell = (children: ReactNode, closable: (() => void) | undefined, sealLabel: string, lead: ReactNode) => (
    <Modal title={title} onClose={closable} wide={rules || !!action.entityKind || step === 'form' || step === 'roll'}>
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
            <CostSeal label={sealLabel} cost={action.distance ? Math.max(1, paid) : paid} have={me.logos} />
          </div>
          {children}
        </div>
      </div>
    </Modal>
  )

  // the avatar that speaks this word, and where it steps
  const speakerRow = speaker && (
    <p className={styles.viaNote}>
      Słowo wypowiada awatar {speaker.entity.emoji ?? ''} {speaker.entity.name} (życie {speaker.entity.hp ?? 0} z {speaker.entity.max_hp ?? 3})
      {ENTERS_CITY.has(action.key) && f.cityId ? `: wchodzi do miasta ${world.entityById(f.cityId)?.name ?? ''}${action.key === 'holy_war' ? ' i prowadzi armię, doliczając swoje życie do rzutu' : action.key === 'exodus' ? ' i idzie z ludem na nowe miejsce' : ''}.` : '.'}
    </p>
  )

  const footer = (primary: ReactNode) => (
    <div className={styles.footer}>
      <StoneButton onClick={onClose}>Odstąp</StoneButton>
      {primary}
    </div>
  )

  // the map is asking, or the wrath is playing: the window steps aside
  if (step === 'map' || reroute) return null

  // ---------- a migration that ended in a fight: both throws, then the window closes ----------
  if (fought) {
    const o = (fought.outcome && !Array.isArray(fought.outcome) ? fought.outcome : {}) as Record<string, unknown>
    const fight = (o.fight ?? {}) as Record<string, unknown>
    const att = (fight.att ?? {}) as Record<string, number>
    const def = (fight.def ?? {}) as Record<string, number>
    const diff = Number(fight.diff ?? 0)
    return shell(
      <RollReveal
        id={fought.id}
        d1={Number(att.d1 ?? 0)}
        d2={Number(att.d2 ?? 0)}
        total={Number(att.total ?? 0)}
        modifier={Number(att.modifier ?? 0)}
        attr={null}
        verdict={diff > 0 ? `Wygrana o ${diff}` : diff === 0 ? 'Remis' : `Przegrana o ${-diff}`}
        consequence={`${fightLine(fought) ?? ''} Obrońca rzucił ${def.d1 ?? '?'} + ${def.d2 ?? '?'} ${Number(def.modifier ?? 0) < 0 ? '−' : '+'} ${Math.abs(Number(def.modifier ?? 0))} = ${def.total ?? '?'}.`}
        what={`Walka: ${String(o.emoji ?? '')} ${String(o.name ?? '')}, 2k6 + siła`}
        onDone={finishRoll}
        doneLabel="Dalej"
      />,
      undefined,
      'Zapłacono',
      <p className={styles.summary}>Kości padły. Świat odpowie, gdy okno się zamknie.</p>,
    )
  }

  // ---------- form: what the word needs before (or after) the map ----------
  if (step === 'form') {
    const formOrdinal = flow.slice(0, stepIdx).filter((s) => s === 'form').length
    const { fields, ready } = renderForm(formOrdinal)
    return shell(
      <div className={styles.form}>
        {speakerRow}
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
        {speakerRow}
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {distance > 0 && <p className={styles.hint}>Dystans: {distance} {distance === 1 ? 'heks' : 'heksów'}, czyli {distance} Logos{baseCost ? ` doliczone do ${baseCost}` : ''}.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {footer(
          <StoneButton variant="gold" size="lg" disabled={busy || !canPay} title={!canPay ? 'Za mało Logos.' : undefined} onClick={() => submit()}>
            {busy ? 'Słowo pada…' : `Zapłać ${action.distance ? Math.max(1, paid) : paid} Logos`}
          </StoneButton>,
        )}
      </div>,
      onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // ---------- roll: two tiles; a click pays and throws, and the dice fall right here ----------
  if (step === 'roll' && action.roll) {
    const def = players.find((p) => p.id === f.defenderId)
    if (rolled) {
      const c = rolled.contest
      const o = (rolled.row?.outcome && !Array.isArray(rolled.row.outcome) ? rolled.row.outcome : {}) as Record<string, unknown>
      const tier = c ? null : ((o.tier as Tier | undefined) ?? null)
      const prophecyHold = c ? hold : Number(o.prophecy ?? 0)
      return shell(
        <RollReveal
          id={rolled.row?.id ?? c?.id ?? 'roll'}
          d1={c ? c.attacker_d1 : Number(o.d1)}
          d2={c ? c.attacker_d2 : Number(o.d2)}
          total={c ? c.attacker_total : Number(o.total)}
          modifier={c ? c.attacker_mod - prophecyHold : Number(o.score ?? 0)}
          bonus={prophecyHold}
          attr={rolled.attr}
          tier={tier}
          verdict={c ? 'Czekamy na obronę' : undefined}
          consequence={c ? `${godLabel(def)} wybiera obronę i rzuca u siebie. Twoja tura czeka na odpowiedź.` : rolled.row ? tierDetail(rolled.row) ?? (tier && action.roll.tiers ? action.roll.tiers[tier] : undefined) : undefined}
          what={`${action.name}, 2k6 + ${ATTRIBUTE_BY_KEY[rolled.attr].name}${action.key === 'holy_war' ? ' + Armia + życie awatara' : ''}`}
          onDone={finishRoll}
          doneLabel={c ? 'Zamknij' : 'Dalej'}
        />,
        undefined,
        'Zapłacono',
        <p className={styles.summary}>Kości padły. Świat odpowie, gdy okno się zamknie.</p>,
      )
    }
    return shell(
      <div className={styles.form}>
        {speakerRow}
        <ul className={styles.chosen}>
          {confirmLines().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {distance > 0 && <p className={styles.hint}>Dystans: {distance} {distance === 1 ? 'heks' : 'heksów'}, czyli {distance} Logos{baseCost ? ` doliczone do ${baseCost}` : ''}.</p>}
        {action.contested && <Notice>Kości rzuca księga od razu. Potem {godLabel(def)} wybiera obronę i rzuca u siebie; twoja tura czeka na odpowiedź. Logos płacisz teraz.</Notice>}
        <ProphecyPicker prophecies={prophecies} value={f.prophecyId} onChange={(v) => set('prophecyId', v)} disabled={busy} />
        {error && <Notice tone="error">{error}</Notice>}
        <AttributeTiles
          options={action.roll.options}
          scores={scores}
          bonus={hold}
          chosen={busy ? f.attr : null}
          disabled={busy || !canPay || (!!action.contested && !f.defenderId)}
          onChoose={choose}
          label={busy ? 'Kości lecą…' : canPay ? `Czym to czynisz? Klik płaci ${paid} Logos i rzuca 2k6` : 'Za mało Logos. Odstąp.'}
        />
        {action.roll.tiers && (
          <dl className={styles.rulesTiers}>
            <dt>{TIER_RANGE.strong}</dt>
            <dd>{action.roll.tiers.strong}</dd>
            <dt>{TIER_RANGE.mixed}</dt>
            <dd>{action.roll.tiers.mixed}</dd>
            <dt>{TIER_RANGE.weak}</dt>
            <dd>{action.roll.tiers.weak}</dd>
          </dl>
        )}
        {footer(null)}
      </div>,
      busy ? undefined : onClose,
      'Koszt',
      <p className={styles.summary}>{action.summary}</p>,
    )
  }

  // a step the flow does not know: nothing to show
  void row
  void ctx
  return null

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
      case 'bless_land':
        return {
          ready: !!f.resource,
          fields: (
            <div className={styles.fields}>
              <EmojiPicker label="Surowiec" options={[...RESOURCES]} used={new Set()} value={f.resource} onChange={(v) => set('resource', v)} />
              <p className={styles.hint}>{f.resource ? `${f.resource} ${RESOURCE_NAMES[f.resource] ?? ''}: ` : ''}Jeden surowiec na pole; nowe błogosławieństwo zastępuje stary. Jego rangę rzuca księga: 2k6 + Łaska albo Mądrość. Przy 10+ od +1 do +3 do Żyzności pola, przy 7..9 pospolity (0), przy 6- przeklęte złoże (−1).</p>
            </div>
          ),
        }
      case 'create_beast':
      case 'create_herd':
      case 'create_sapient':
        return {
          ready: f.name.trim().length > 0 && !!f.emoji,
          fields: (
            <div className={styles.fields}>
              <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              {key === 'create_herd' && <p className={styles.hint}>Stado stoi w lewym górnym rogu heksa, jedno na pole, i karmi ziemię swoją rangą. Szuka pastwisk, mnoży się, nigdy nie walczy.</p>}
              {key === 'create_beast' && <p className={styles.hint}>Bestia stoi na dole heksa: jedna bestia albo plemię na pole. Poluje, mnoży się i walczy z tym, co spotka.</p>}
              <EmojiPicker label="Znak na mapie" options={key === 'create_sapient' ? SAPIENT_EMOJI : key === 'create_beast' ? BEAST_EMOJI : HERBIVORE_EMOJI} used={world.usedEmoji} value={f.emoji} onChange={(v) => set('emoji', v)} />
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
        const used = new Set([...world.usedEmoji].filter((e) => e !== (src?.emoji ?? '')))
        const changed = !!src && (f.name.trim() !== src.name || (f.emoji && f.emoji !== (src.emoji ?? '')) || f.description.trim() !== src.description)
        return {
          ready: f.name.trim().length > 0 && !!changed,
          fields: (
            <div className={styles.fields}>
              {src && <p className={styles.hint}>Odmieniają się wszystkie {src.emoji ?? ''} {src.name}, na każdym polu, gdzie żyją{world.roleOf(src) === 'beast' ? ` (siła ${strengthLabel(src.strength)})` : world.roleOf(src) === 'herbivore' ? ` (ranga ${strengthLabel(src.strength)})` : ''}. Zmień nazwę, znak albo opis; przy 10+ rosną też w siłę.</p>}
              <TextField id="ent_name" label="Nazwa" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              <EmojiPicker label="Znak na mapie" options={src && world.isSapient(src) ? SAPIENT_EMOJI : world.roleOf(src) === 'beast' ? BEAST_EMOJI : world.roleOf(src) === 'herbivore' ? HERBIVORE_EMOJI : CREATURE_EMOJI} used={used} value={f.emoji} onChange={(v) => set('emoji', v)} />
              <TextArea id="ent_desc" label="Opis" value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} />
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
          ready: giftText.length > 0 && !!f.avatarId,
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
          ready: f.dots >= 1 && f.dots <= mine && !!f.speciesId && f.name.trim().length > 0 && !!f.avatarId,
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
          ready: !!f.defenderId && !!f.avatarId,
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
            </div>
          ),
        }
      }
      case 'holy_war': {
        if (ordinal === 0) {
          const mine = world.dotsOf(f.cityId, me.id)
          const max = Math.max(1, mine - 1)
          return {
            ready: f.army >= 1 && f.army <= max && !!f.avatarId,
            fields: (
              <div className={styles.fields}>
                <p className={styles.hint}>Z miasta {world.entityById(f.cityId)?.name ?? ''} masz {followersWord(mine)}. Co najmniej jeden zostaje w domu.</p>
                <label className={fieldClass}>
                  <span className={labelClass}>Wielkość Armii (1..{max})</span>
                  <input className={inputClass} type="number" min={1} max={max} value={f.army} onChange={(e) => set('army', Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
                </label>
                <p className={styles.hint}>Rzut: 2k6 + Gniew albo Podszept (wybierzesz na końcu) + Armia + życie awatara.</p>
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
    const unit = world.entityById(f.speciesId)
    switch (action.key) {
      case 'shape_land':
        return [`Biom: ${BIOME_BY_KEY[f.biome].name}`, `Heksy: ${f.hexes.map((h) => `(${h.q}, ${h.r})`).join(' ')}`]
      case 'lightning':
        return [`Cel: ${unit?.emoji ?? ''} ${unit?.name ?? ''}${unit?.kind === 'avatar' ? ` (życie ${unit.hp ?? 0} z ${unit.max_hp ?? 3})` : ''}`, `Miejsce: ${at}`, '10+: 2 obrażenia, 7..9: 1, 6-: chybienie']
      case 'flood':
        return [`Zalewane pole: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (miasto ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name ?? ''})` : ''}`, '10+: pole staje się wodą na zawsze, 7..9: trzy trafienia, 6-: nic']
      case 'fire_rain':
        return [`Pole: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (miasto ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name ?? ''})` : ''}`, '10+: sześć trafień, 7..9: trzy, 6-: nic; pole bez żywych obraca się w ugór']
      case 'drought':
        return [`Pole: ${at} (Żyzność ${f.target ? world.fertilityOf(f.target.q, f.target.r) ?? 0 : 0})`, '10+: trzy noce suszy, 7..9: dwie, 6-: nic']
      case 'plague':
        return [`Pole: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (miasto ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name ?? ''})` : ''}`, '10+: dwie noce zarazy, 7..9: jedna, 6-: nic']
      case 'great_miracle':
        return ['Coś WIELKIEGO na skalę całego świata. Opowiesz to w wersecie.']
      case 'bless_land':
        return [`Surowiec: ${f.resource} ${RESOURCE_NAMES[f.resource] ?? ''}`, `Miejsce: ${at}${f.target && world.resourceAt(f.target.q, f.target.r) ? ` (zastąpi ${world.resourceAt(f.target.q, f.target.r)})` : ''}`]
      case 'pour_river':
        return [
          `Źródło: ${f.path[0] ? `(${f.path[0].q}, ${f.path[0].r})` : ''}`,
          `Koryto: ${Math.max(0, f.path.length - 1)} ${f.path.length - 1 === 1 ? 'pole' : f.path.length - 1 >= 2 && f.path.length - 1 <= 4 ? 'pola' : 'pól'} za źródłem`,
          f.mouth ? `Ujście: woda (${f.mouth.q}, ${f.mouth.r})` : 'Wpada do innej rzeki',
        ]
      case 'create_beast':
        return [`${f.emoji} ${f.name}`, 'Bestia: siłę da wynik rzutu', `Miejsce: ${at}`]
      case 'create_herd':
        return [`${f.emoji} ${f.name}`, 'Stado: rangę da wynik rzutu', `Miejsce: ${at}`]
      case 'multiply':
        return [`${unit?.emoji ?? ''} ${unit?.name ?? 'Istoty'} z (${f.from?.q}, ${f.from?.r})`, `Kopia staje na ${at}`]
      case 'create_sapient':
        return [`${f.emoji} ${f.name}`, `Miejsce: ${at}`]
      case 'create_avatar':
        return [`${f.emoji} ${f.name}`, `Miejsce: ${at}`]
      case 'change_creature':
        return [`${unit?.emoji ?? ''} ${unit?.name ?? ''} stają się: ${f.emoji} ${f.name}`]
      case 'migrate': {
        const target = f.target
        const bottom = target ? world.roleOf(world.entityById(world.bottomAt(target.q, target.r)?.entity_id)) : null
        const city = target ? world.cityAt(target.q, target.r) : undefined
        const role = world.roleOf(unit)
        const clash = role === 'beast' && city ? `Napad na miasto ${world.entityById(city.entity_id)?.name ?? ''}: walka wedle zasad nocy, bestia zostaje na swoim polu` : (role === 'beast' && (bottom === 'beast' || bottom === 'tribe')) || (role === 'tribe' && bottom === 'beast') ? 'Na celu ktoś stoi: walka wedle zasad nocy, zwycięzca bierze pole' : 'Wolne pole: istoty po prostu przechodzą'
        return [`${unit?.emoji ?? ''} ${unit?.name ?? ''}: z (${f.from?.q}, ${f.from?.r}) na (${target?.q}, ${target?.r})`, clash]
      }
      case 'create_civilization':
        return [`Lud: ${f.name}`, `Z istoty: ${unit?.name ?? ''}`, `Miejsce: ${at}`]
      case 'develop_civilization':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Dar: ${giftText}`]
      case 'exodus':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}`, `${followersWord(f.dots)} i istota ${unit?.name ?? ''}`, `Cel: ${at}${f.target && world.cityAt(f.target.q, f.target.r) ? ` (dołączają do miasta ${world.entityById(world.cityAt(f.target.q, f.target.r)!.entity_id)?.name})` : ` (nowe miasto ${f.name})`}`]
      case 'convert':
        return [`Miasto: ${world.entityById(f.cityId)?.name ?? ''}`, `Nawracasz wyznawców: ${godLabel(players.find((p) => p.id === f.defenderId))}`]
      case 'holy_war':
        return [`Z miasta: ${world.entityById(f.cityId)?.name ?? ''}, Armia: ${followersWord(f.army)}`, `Cel: ${world.entityById(f.targetCityId)?.name ?? ''}, broni: ${godLabel(players.find((p) => p.id === f.defenderId))}`, `Rzut: 2k6 + atrybut + ${f.army} (Armia) + ${speaker?.entity.hp ?? 0} (życie awatara)`]
      case 'pilgrimage':
        return [`Awatar: ${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''}`, `Idzie na ${at}`]
      case 'resurrect_avatar':
        return [`Awatar: ${entities.find((e) => e.id === f.deadAvatarId)?.name ?? ''}`, `Wraca na ${at}, z pełnym życiem`]
      case 'avatar_duel':
        return [
          `${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''} (życie ${world.entityById(f.avatarId)?.hp ?? 0} z ${world.entityById(f.avatarId)?.max_hp ?? 3}) przeciw ${world.entityById(f.enemyAvatarId)?.emoji ?? ''} ${world.entityById(f.enemyAvatarId)?.name ?? ''} (życie ${world.entityById(f.enemyAvatarId)?.hp ?? 0} z ${world.entityById(f.enemyAvatarId)?.max_hp ?? 3})`,
          `Broni: ${godLabel(players.find((p) => p.id === f.defenderId))}`,
          'Wygrana o 3+ rani wroga dwa razy, o 1..2 rani obu, remis rani obu, przegrana rani ciebie.',
        ]
      case 'prophecy':
        return [`Prorok: ${world.entityById(f.avatarId)?.emoji ?? ''} ${world.entityById(f.avatarId)?.name ?? ''}`, `Zapowiada, że: ${f.text.trim()}`]
      default:
        return []
    }
  }
}

/** A marble medallion in the top right corner: only the cost, carved in gold. */
function CostSeal({ label, cost, have }: { label: string; cost: number; have: number }) {
  const over = cost > have
  return (
    <div
      className={[styles.seal, over ? styles.sealOver : ''].join(' ')}
      role="status"
      aria-label={`${label}: ${cost} Logos, masz ${have}`}
      title={over ? `Brakuje ${cost - have} Logos` : `${label}: ${cost} Logos (masz ${have})`}
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
        {action.roll?.tiers && (
          <dl className={styles.rulesTiers}>
            <dt>{TIER_RANGE.strong}</dt>
            <dd>{action.roll.tiers.strong}</dd>
            <dt>{TIER_RANGE.mixed}</dt>
            <dd>{action.roll.tiers.mixed}</dd>
            <dt>{TIER_RANGE.weak}</dt>
            <dd>{action.roll.tiers.weak}</dd>
          </dl>
        )}
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
