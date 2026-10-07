import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
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

export interface Inspect {
  q: number
  r: number
  x: number
  y: number
}

/**
 * The map itself: 91 fields in an SVG that fills whatever room it gets. Only the polygons hear the
 * mouse; everything painted on them (decor, signs, dots) lets clicks through. In a map mode a click
 * is an answer; otherwise it opens the field's card beside the mouse.
 */
export function HexMap({ world, inspected, onInspect }: { world: WorldView; inspected: Inspect | null; onInspect: (i: Inspect | null) => void }) {
  const mode = useMapMode((s) => s.mode)
  const selection = useMapMode((s) => s.selection)
  const pick = useMapMode((s) => s.pick)
  const players = useGameStore((s) => s.players)
  const log = useGameStore((s) => s.log)
  const [chooser, setChooser] = useState<{ q: number; r: number; x: number; y: number; occupants: HexOccupant[] } | null>(null)

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

  const burst = useBurst(log)

  return (
    <div className={styles.board}>
      <svg className={styles.svg} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa świata">
        <defs>
          <filter id="signShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.85" />
          </filter>
        </defs>
        {/* the fields first, so no sign is ever covered by a neighbour */}
        {HEXES.map(({ q, r }) => {
          const hex = world.hexAt(q, r)
          const { x, y } = axialToPixel(q, r, R)
          const biome = hex ? BIOME_BY_KEY[hex.biome] : null
          const valid = mode ? canPick(mode, selection, q, r, world) : false
          const selected = selection.some((s) => s.q === q && s.r === r)
          const isInspected = !!inspected && inspected.q === q && inspected.r === r
          const cls = [styles.hex, mode ? (valid ? styles.hexValid : styles.hexDim) : '', selected ? styles.hexSelected : '', isInspected ? styles.hexInspected : ''].join(' ')
          return (
            <polygon
              key={hexKey(q, r)}
              className={cls}
              points={hexCorners(x, y, R, 0)}
              fill={biome?.fill ?? '#222'}
              stroke={biome?.fill ?? '#222'}
              strokeWidth={1.6}
              onClick={(e) => onHexClick(e, q, r)}
              data-q={q}
              data-r={r}
            >
              <title>{biome ? biome.name : 'poza światem'}</title>
            </polygon>
          )
        })}
        {HEXES.map(({ q, r }) => {
          const hex = world.hexAt(q, r)
          if (!hex) return null
          const { x, y } = axialToPixel(q, r, R)
          const occupants = world.occupantsAt(q, r)
          const city = world.cityAt(q, r)
          if (hex.decor.length === 0 && occupants.length === 0 && !city) return null
          return (
            <g key={hexKey(q, r)} className={styles.layer}>
              {hex.decor.map((d, i) => (
                <text
                  key={i}
                  className={[styles.decor, city ? styles.decorUnderCity : ''].join(' ')}
                  x={x + d.x * R}
                  y={y + d.y * R}
                  fontSize={R * 0.46}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {d.e}
                </text>
              ))}
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
