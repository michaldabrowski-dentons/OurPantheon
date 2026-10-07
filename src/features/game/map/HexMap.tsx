import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react'
import type { ActionLog, Entity, HexOccupant, Player } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { allHexes, axialToPixel, hexCorners, hexKey, mapViewBox, SLOT_OFFSETS } from '@/lib/hex'
import { BIOME_BY_KEY } from '@/data/biomes'
import { PYRAMID, cityLevel } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { useGameStore } from '@/store/useGameStore'
import { canPick, useMapMode } from './mapMode'
import styles from './map.module.css'

const R = 40
const HEXES = allHexes()
const VIEW = mapViewBox(R)
/** the painted tiles are 128 px high for a hex 2R high: one tile is 2R by 2R */
const TILE = 2 * R
/** the six neighbours in corner order: the edge between corners i and i+1 faces this neighbour */
const EDGE_NEIGHBOURS: { q: number; r: number }[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
]
const ZOOMS = [1, 1.35, 1.8, 2.4, 3.2]

export interface Inspect {
  q: number
  r: number
  x: number
  y: number
}

function corner(cx: number, cy: number, i: number, inset = 0): { x: number; y: number } {
  const angle = (Math.PI / 180) * (60 * i - 30)
  return { x: cx + (R - inset) * Math.cos(angle), y: cy + (R - inset) * Math.sin(angle) }
}

/**
 * The map itself: 91 painted fields in an SVG. Land tiles overlap softly; water tiles lie above them
 * with a crisp hexagon, and where water meets land a brown shoreline runs along the edge. Only the
 * transparent polygons on top hear the mouse; everything painted lets clicks through. In a map mode
 * a click is an answer; otherwise it opens the field's card beside the mouse.
 */
export function HexMap({ world, inspected, onInspect }: { world: WorldView; inspected: Inspect | null; onInspect: (i: Inspect | null) => void }) {
  const mode = useMapMode((s) => s.mode)
  const selection = useMapMode((s) => s.selection)
  const pick = useMapMode((s) => s.pick)
  const players = useGameStore((s) => s.players)
  const log = useGameStore((s) => s.log)
  const [chooser, setChooser] = useState<{ q: number; r: number; x: number; y: number; occupants: HexOccupant[] } | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOMS[zoomIdx]

  const colorOf = useMemo(() => {
    const m = new Map<string, Player>()
    for (const p of players) m.set(p.id, p)
    return (playerId: string) => godColor(m.get(playerId)?.domain_key)
  }, [players])

  useEffect(() => {
    if (!mode) setChooser(null)
  }, [mode])

  function onHexClick(e: MouseEvent<SVGPolygonElement>, q: number, r: number) {
    if (!mode) {
      setChooser(null)
      onInspect(inspected && inspected.q === q && inspected.r === r ? null : { q, r, x: e.clientX, y: e.clientY })
      return
    }
    if (!canPick(mode, selection, q, r, world)) return
    if (mode.kind === 'occupant') {
      const list = world.occupantsAt(q, r).filter((o) => !mode.validOccupant || mode.validOccupant(o, world))
      if (list.length === 0) return
      if (list.length === 1) {
        pick({ q, r, occupantId: list[0].id })
        return
      }
      setChooser({ q, r, x: e.clientX, y: e.clientY, occupants: list })
      return
    }
    if (mode.kind === 'city') {
      const city = world.cityAt(q, r)
      if (!city) return
      pick({ q, r, cityId: city.entity_id })
      return
    }
    pick({ q, r })
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey) return
    e.preventDefault()
    setZoomIdx((i) => Math.max(0, Math.min(ZOOMS.length - 1, i + (e.deltaY < 0 ? 1 : -1))))
  }

  const burst = useBurst(log)

  // the painted ground: land first (soft squares that overlap), water on top (crisp hexagons)
  const land = HEXES.filter(({ q, r }) => world.hexAt(q, r)?.biome !== 'woda')
  const water = HEXES.filter(({ q, r }) => world.hexAt(q, r)?.biome === 'woda')

  return (
    <div className={styles.board} onWheel={onWheel}>
      <div className={styles.scroller}>
        <svg className={styles.svg} style={{ width: `${zoom * 100}%` }} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa świata">
          <defs>
            <filter id="signShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.85" />
            </filter>
          </defs>

          <g className={styles.layer}>
            {land.map(({ q, r }) => {
              const hex = world.hexAt(q, r)
              const { x, y } = axialToPixel(q, r, R)
              const biome = hex ? BIOME_BY_KEY[hex.biome] : undefined
              return <image key={hexKey(q, r)} href={biome?.image ?? BIOME_BY_KEY.trawa.image} x={x - TILE / 2} y={y - TILE / 2} width={TILE} height={TILE} preserveAspectRatio="xMidYMid slice" />
            })}
            {water.map(({ q, r }) => {
              const { x, y } = axialToPixel(q, r, R)
              return <image key={hexKey(q, r)} href={BIOME_BY_KEY.woda.image} x={x - TILE / 2} y={y - TILE / 2} width={TILE} height={TILE} preserveAspectRatio="xMidYMid meet" />
            })}
            {/* the shore: where water meets land, a brown rim on the water's side of the edge */}
            {water.map(({ q, r }) => {
              const { x, y } = axialToPixel(q, r, R)
              return EDGE_NEIGHBOURS.map((d, i) => {
                const n = world.hexAt(q + d.q, r + d.r)
                if (!n || n.biome === 'woda') return null
                const a = corner(x, y, i, 1)
                const b = corner(x, y, i + 1, 1)
                return <line key={`${hexKey(q, r)}-${i}`} className={styles.shore} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              })
            })}
          </g>

          {/* the fields that hear the mouse: transparent, lit when the map asks a question */}
          {HEXES.map(({ q, r }) => {
            const hex = world.hexAt(q, r)
            const { x, y } = axialToPixel(q, r, R)
            const biome = hex ? BIOME_BY_KEY[hex.biome] : null
            const valid = mode ? canPick(mode, selection, q, r, world) : false
            const selected = selection.some((s) => s.q === q && s.r === r)
            const isInspected = !!inspected && inspected.q === q && inspected.r === r
            const cls = [styles.hex, mode ? (valid ? styles.hexValid : styles.hexDim) : '', selected ? styles.hexSelected : '', isInspected ? styles.hexInspected : ''].join(' ')
            return (
              <polygon key={hexKey(q, r)} className={cls} points={hexCorners(x, y, R, 0.6)} onClick={(e) => onHexClick(e, q, r)} data-q={q} data-r={r}>
                <title>{biome ? biome.name : 'poza światem'}</title>
              </polygon>
            )
          })}

          {/* what lives and stands on the fields */}
          {HEXES.map(({ q, r }) => {
            const hex = world.hexAt(q, r)
            if (!hex) return null
            const { x, y } = axialToPixel(q, r, R)
            const occupants = world.occupantsAt(q, r)
            const city = world.cityAt(q, r)
            if (occupants.length === 0 && !city) return null
            return (
              <g key={hexKey(q, r)} className={styles.layer}>
                {occupants.map((o) => {
                  const ent = world.entityById(o.entity_id)
                  if (!ent) return null
                  const off = SLOT_OFFSETS[o.slot] ?? SLOT_OFFSETS[0]
                  const sx = x + off.x * R
                  const sy = y + off.y * R
                  const size = R * 0.46
                  return (
                    <g key={o.id} className={styles.sign}>
                      <rect className={styles.signPlate} x={sx - size * 0.62} y={sy - size * 0.6} width={size * 1.24} height={size * 1.2} rx={size * 0.3} />
                      <text x={sx} y={sy} fontSize={size} textAnchor="middle" dominantBaseline="central" filter="url(#signShadow)">
                        {ent.emoji ?? (ent.kind === 'avatar' ? '✦' : '●')}
                      </text>
                      {ent.kind === 'avatar' && <HpBar x={sx} y={sy + size * 0.68} hp={ent.hp ?? 0} />}
                    </g>
                  )
                })}
                {city && <CityPyramid x={x} y={y} city={city.entity_id} world={world} colorOf={colorOf} />}
              </g>
            )
          })}
          {burst && <Burst key={burst.id} q={burst.q} r={burst.r} />}
        </svg>
      </div>

      <div className={styles.zoom} aria-label="Przybliżenie">
        <button type="button" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0} title="Oddal (Ctrl i kółko myszy)" aria-label="Oddal">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1} title="Przybliż (Ctrl i kółko myszy)" aria-label="Przybliż">+</button>
      </div>

      {chooser && (
        <div className={['marble', styles.chooser].join(' ')} style={{ left: Math.min(chooser.x + 8, window.innerWidth - 200), top: Math.min(chooser.y + 8, window.innerHeight - 160) }} role="menu">
          {chooser.occupants.map((o) => {
            const ent = world.entityById(o.entity_id)
            return (
              <button key={o.id} type="button" className={styles.chooserBtn} role="menuitem" onClick={() => { setChooser(null); pick({ q: chooser.q, r: chooser.r, occupantId: o.id }) }}>
                <span className={styles.chooserEmoji}>{ent?.emoji ?? '●'}</span>
                {ent?.name ?? 'bez imienia'}
              </button>
            )
          })}
          <button type="button" className={styles.chooserBtn} onClick={() => setChooser(null)}>
            Nie ta
          </button>
        </div>
      )}
    </div>
  )
}

/** the pyramid of dots in the middle of a city's field, every dot in its god's colour */
function CityPyramid({ x, y, city, world, colorOf }: { x: number; y: number; city: string; world: WorldView; colorOf: (playerId: string) => { fill: string; stroke: string } }) {
  const followers = world.followersOf(city)
  const total = cityLevel(world.cityDots(city))
  if (total === 0) return null
  const rows = PYRAMID[total] ?? [total]
  const owners: string[] = []
  for (const f of followers) for (let i = 0; i < f.dots; i++) owners.push(f.player_id)
  const step = R * 0.2
  const dotR = R * 0.09
  const height = rows.length * step
  const plateW = Math.max(...rows) * step + step * 0.9
  let k = 0
  return (
    <g className={styles.dots}>
      <rect className={styles.cityPlate} x={x - plateW / 2} y={y - height / 2 - step * 0.35} width={plateW} height={height + step * 0.7} rx={5} />
      {rows.map((count, rowIdx) => {
        const cy = y + height / 2 - step / 2 - rowIdx * step
        const startX = x - ((count - 1) * step) / 2
        return Array.from({ length: count }, (_, i) => {
          const owner = owners[k++]
          const c = owner ? colorOf(owner) : { fill: '#c9c2b6', stroke: '#5c554b' }
          return (
            <g key={`${rowIdx}-${i}`}>
              <circle className={styles.dot} cx={startX + i * step} cy={cy} r={dotR} fill={c.fill} stroke={c.stroke} />
              <circle className={styles.dotRim} cx={startX + i * step} cy={cy} r={dotR + 1} />
            </g>
          )
        })
      })}
    </g>
  )
}

function HpBar({ x, y, hp }: { x: number; y: number; hp: number }) {
  const w = R * 0.5
  return (
    <g className={styles.hp}>
      <rect className={styles.hpBack} x={x - w / 2} y={y} width={w} height={3} rx={1.5} />
      <rect className={styles.hpBar} x={x - w / 2} y={y} width={(w * Math.max(0, Math.min(3, hp))) / 3} height={3} rx={1.5} />
    </g>
  )
}

/** the newest catastrophe, played once on its field */
function useBurst(log: ActionLog[]): { id: string; q: number; r: number } | null {
  const seen = useRef<string | null>(null)
  const [burst, setBurst] = useState<{ id: string; q: number; r: number } | null>(null)
  useEffect(() => {
    const last = [...log].reverse().find((l) => l.action_key === 'catastrophe')
    if (!last || seen.current === last.id) return
    const first = seen.current === null
    seen.current = last.id
    // only a cataclysm that just happened (not the one found on opening the game)
    if (first && Date.now() - new Date(last.created_at).getTime() > 15000) return
    const o = (last.outcome && !Array.isArray(last.outcome) ? last.outcome : {}) as Record<string, unknown>
    if (typeof o.q !== 'number' || typeof o.r !== 'number') return
    setBurst({ id: last.id, q: o.q, r: o.r })
    const t = window.setTimeout(() => setBurst(null), 1400)
    return () => window.clearTimeout(t)
  }, [log])
  return burst
}

function Burst({ q, r }: { q: number; r: number }) {
  const { x, y } = axialToPixel(q, r, R)
  return (
    <g className={styles.burst}>
      <circle className={styles.burstRing} cx={x} cy={y} r={R * 0.9} />
      <circle className={[styles.burstRing, styles.burstRing2].join(' ')} cx={x} cy={y} r={R * 0.7} />
      <text className={styles.burstSign} x={x} y={y} textAnchor="middle" dominantBaseline="central">
        💥
      </text>
    </g>
  )
}

export type { Entity as HexEntity, MapPick }
