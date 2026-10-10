import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ActionLog, Entity, HexOccupant, HexRef, Player, River } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { allHexes, axialToPixel, hexCorners, hexEdgeMidpoint, hexKey, mapViewBox, FERTILITY_OFFSET, RESOURCE_OFFSET, SLOT_OFFSETS } from '@/lib/hex'
import { BIOME_BY_KEY } from '@/data/biomes'
import { PYRAMID, cityLevel } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { strengthLabel } from '@/data/fertility'
import { useGameStore, selectNight } from '@/store/useGameStore'
import { canPick, useMapMode } from './mapMode'
import { useDiceGate } from '../diceGate'
import styles from './map.module.css'

const R = 40
const HEXES = allHexes()
const VIEW = mapViewBox(R)
/** the painted tiles are 128 px high for a hex 2R high: one tile is 2R by 2R */
const TILE = 2 * R
const ZOOMS = [1, 1.35, 1.8, 2.4, 3.2]
/** the godless: grey, no god's shade */
const GODLESS = { fill: '#9b9b9b', stroke: '#4a4a4a' }

export interface Inspect {
  q: number
  r: number
  x: number
  y: number
}

/**
 * The map itself: 91 painted hexagonal tiles in an SVG. Only the transparent polygons on top hear
 * the mouse; everything painted lets clicks through. In a map mode a click is an answer; otherwise
 * it opens the field's card beside the mouse. Rivers run between the tiles and the polygons; every
 * land field shows its fertility at the top and its resource top-right; herds stand top-left,
 * beasts and tribes at the bottom, avatars in the lower corners; the city sits in the middle.
 */
export function HexMap({ world, inspected, onInspect }: { world: WorldView; inspected: Inspect | null; onInspect: (i: Inspect | null) => void }) {
  const mode = useMapMode((s) => s.mode)
  const selection = useMapMode((s) => s.selection)
  const pick = useMapMode((s) => s.pick)
  const players = useGameStore((s) => s.players)
  const occupants = useGameStore((s) => s.occupants)
  const log = useGameStore((s) => s.log)
  const night = useGameStore(selectNight)
  const reduce = useReducedMotion()
  const [chooser, setChooser] = useState<{ q: number; r: number; x: number; y: number; occupants: HexOccupant[] } | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOMS[zoomIdx]

  const colorOf = useMemo(() => {
    const m = new Map<string, Player>()
    for (const p of players) m.set(p.id, p)
    return (playerId: string | null) => (playerId ? godColor(m.get(playerId)) : GODLESS)
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
    if (mode.kind === 'river') {
      pick({ q, r }, !!mode.isTerminal?.(q, r, world))
      return
    }
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
  // ruined cities keep their place: a skull, until a new city rises there
  const ruins = world.entities
    .filter((e) => e.kind === 'civilization' && e.status === 'destroyed')
    .map((e) => {
      const ru = (e.attributes as { ruin?: { q: number; r: number } }).ruin
      return ru ? { id: e.id, name: e.name, q: ru.q, r: ru.r } : null
    })
    .filter((x): x is { id: string; name: string; q: number; r: number } => !!x && !world.cityAt(x.q, x.r))

  // the river being drawn right now
  const riverDraft: HexRef[] | null = mode?.kind === 'river' ? [...(mode.start ? [mode.start] : []), ...selection.map(({ q, r }) => ({ q, r }))] : null

  // the night: who moves now, and where a fight waits
  const nightUnit = night && night.cursor > 0 ? night.queue[night.cursor - 1] : null
  const unitAt: HexRef | null = nightUnit
    ? nightUnit.t === 'city'
      ? (world.cityOf(nightUnit.id) ?? null)
      : (occupants.find((o) => o.id === nightUnit.id) ?? null)
    : null
  const fight = night?.pending?.kind === 'fight' ? night.pending : null

  const standing = occupants.filter((o) => world.entityById(o.entity_id))

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
            {HEXES.map(({ q, r }) => {
              const hex = world.hexAt(q, r)
              const { x, y } = axialToPixel(q, r, R)
              const biome = hex ? BIOME_BY_KEY[hex.biome] : undefined
              return <image key={hexKey(q, r)} href={biome?.image ?? BIOME_BY_KEY.woda.image} x={x - TILE / 2} y={y - TILE / 2} width={TILE} height={TILE} preserveAspectRatio="xMidYMid meet" />
            })}
          </g>

          <RiverLayer rivers={world.rivers} draft={riverDraft} />

          {/* the fields that hear the mouse: transparent, lit when the map asks a question */}
          {HEXES.map(({ q, r }) => {
            const hex = world.hexAt(q, r)
            const { x, y } = axialToPixel(q, r, R)
            const biome = hex ? BIOME_BY_KEY[hex.biome] : null
            const valid = mode ? canPick(mode, selection, q, r, world) : false
            const selected = selection.some((s) => s.q === q && s.r === r) || (!!mode?.start && mode.start.q === q && mode.start.r === r)
            const isInspected = !!inspected && inspected.q === q && inspected.r === r
            const cls = [styles.hex, mode ? (valid ? styles.hexValid : styles.hexDim) : '', selected ? styles.hexSelected : '', isInspected ? styles.hexInspected : ''].join(' ')
            return (
              <polygon key={hexKey(q, r)} className={cls} points={hexCorners(x, y, R, 0.6)} onClick={(e) => onHexClick(e, q, r)} data-q={q} data-r={r}>
                <title>{biome ? biome.name : 'poza światem'}</title>
              </polygon>
            )
          })}

          {/* where a city once stood */}
          {ruins.map((ru) => {
            const { x, y } = axialToPixel(ru.q, ru.r, R)
            return (
              <g key={`ruin-${ru.id}`} className={styles.layer}>
                <text className={styles.ruin} x={x} y={y} fontSize={R * 0.5} textAnchor="middle" dominantBaseline="central" filter="url(#signShadow)">
                  💀
                </text>
                <text className={styles.cityName} x={x} y={y + R * 0.42} textAnchor="middle" dominantBaseline="central" fontSize={R * 0.14}>
                  {nameLines(ru.name)[0]}
                </text>
              </g>
            )
          })}

          {/* what the land gives: its fertility at the top, its resource top-right */}
          {HEXES.map(({ q, r }) => {
            const hex = world.hexAt(q, r)
            if (!hex || hex.biome === 'woda') return null
            const f = world.fertilityOf(q, r)
            const { x, y } = axialToPixel(q, r, R)
            const fy = y + FERTILITY_OFFSET.y * R
            const rx = x + RESOURCE_OFFSET.x * R
            const ry = y + RESOURCE_OFFSET.y * R
            const size = R * 0.4
            return (
              <g key={`land-${hexKey(q, r)}`} className={styles.layer}>
                {f !== null && (
                  <>
                    <rect className={styles.fertPlate} x={x - R * 0.19} y={fy - R * 0.12} width={R * 0.38} height={R * 0.24} rx={R * 0.12} />
                    <text className={styles.fertility} x={x} y={fy + 0.5} fontSize={R * 0.19} textAnchor="middle" dominantBaseline="central">
                      {f}
                    </text>
                  </>
                )}
                {hex.resource && (
                  <g className={styles.sign}>
                    <rect className={styles.signPlate} x={rx - size * 0.62} y={ry - size * 0.6} width={size * 1.24} height={size * 1.2} rx={size * 0.3} />
                    <text x={rx} y={ry} fontSize={size} textAnchor="middle" dominantBaseline="central" filter="url(#signShadow)">
                      {hex.resource}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* the night: a ring around whoever moves, swords where a fight waits */}
          {unitAt && (() => {
            const { x, y } = axialToPixel(unitAt.q, unitAt.r, R)
            return <circle className={styles.nightRing} cx={x} cy={y} r={R * 0.92} />
          })()}
          {fight && (() => {
            const a = axialToPixel(fight.origin.q, fight.origin.r, R)
            const b = axialToPixel(fight.at.q, fight.at.r, R)
            return (
              <g className={styles.layer}>
                {(a.x !== b.x || a.y !== b.y) && <line className={styles.fightLine} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                <text className={styles.fightMark} x={b.x} y={b.y - R * 0.1} fontSize={R * 0.7} textAnchor="middle" dominantBaseline="central" filter="url(#signShadow)" style={{ transformOrigin: `${b.x}px ${b.y}px` }}>
                  ⚔️
                </text>
              </g>
            )
          })()}

          {/* the cities in the middle of their fields */}
          {world.cities.map((c) => {
            const { x, y } = axialToPixel(c.q, c.r, R)
            return (
              <motion.g key={c.entity_id} className={styles.layer} initial={reduce ? false : { opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduce ? 0 : 0.9 }} style={{ transformOrigin: `${x}px ${y}px` }}>
                <CityPyramid x={x} y={y} city={c.entity_id} world={world} colorOf={colorOf} />
              </motion.g>
            )
          })}

          {/* what lives and stands on the fields: a sign glides when its row moves */}
          <AnimatePresence>
            {standing.map((o) => {
              const ent = world.entityById(o.entity_id)
              if (!ent) return null
              const { x, y } = axialToPixel(o.q, o.r, R)
              const off = SLOT_OFFSETS[o.slot] ?? SLOT_OFFSETS[0]
              const sx = x + off.x * R
              const sy = y + off.y * R
              const size = R * 0.46
              const role = world.roleOf(ent)
              return (
                <motion.g
                  key={o.id}
                  className={styles.sign}
                  initial={reduce ? { x: sx, y: sy, opacity: 1 } : { x: sx, y: sy, opacity: 0, scale: 0.6 }}
                  animate={{ x: sx, y: sy, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ duration: reduce ? 0 : 1.1, ease: 'easeInOut' }}
                >
                  <rect className={styles.signPlate} x={-size * 0.62} y={-size * 0.6} width={size * 1.24} height={size * 1.2} rx={size * 0.3} />
                  <text x={0} y={0} fontSize={size} textAnchor="middle" dominantBaseline="central" filter="url(#signShadow)">
                    {ent.emoji ?? (ent.kind === 'avatar' ? '✦' : '●')}
                  </text>
                  {ent.kind === 'avatar' && <HpBar x={0} y={size * 0.68} hp={ent.hp ?? 0} max={ent.max_hp ?? 3} />}
                  {role === 'beast' && (
                    <text className={styles.strength} x={size * 0.66} y={size * 0.52} fontSize={size * 0.42} textAnchor="middle" dominantBaseline="central">
                      {strengthLabel(ent.strength ?? 0)}
                    </text>
                  )}
                </motion.g>
              )
            })}
          </AnimatePresence>
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

function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** a gently winding path through the given points: every leg bends a little to one side */
function riverPath(pts: { x: number; y: number }[], seed: string): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const sign = hashStr(`${seed}:${i}`) % 2 === 0 ? 1 : -1
    const amp = R * 0.14
    d += ` Q ${(mx + nx * amp * sign).toFixed(1)} ${(my + ny * amp * sign).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
  }
  return d
}

/** the rivers: from the mountain through the land to the edge of the sea, or into another river */
function RiverLayer({ rivers, draft }: { rivers: River[]; draft: HexRef[] | null }) {
  const lines = (pts: { x: number; y: number }[], seed: string, cls?: string) => {
    const d = riverPath(pts, seed)
    if (!d) {
      const p = pts[0]
      return p ? <circle className={styles.riverTop} cx={p.x} cy={p.y} r={R * 0.08} /> : null
    }
    return (
      <g className={cls}>
        <path className={styles.riverBase} d={d} strokeWidth={R * 0.22} />
        <path className={styles.riverTop} d={d} strokeWidth={R * 0.11} />
      </g>
    )
  }
  return (
    <g className={styles.river}>
      {rivers.map((rv) => {
        const pts = rv.path.map((n) => axialToPixel(n.q, n.r, R))
        if (rv.mouth_kind === 'water' && rv.mouth_q !== null && rv.mouth_r !== null && rv.path.length > 0) {
          pts.push(hexEdgeMidpoint(rv.path[rv.path.length - 1], { q: rv.mouth_q, r: rv.mouth_r }, R))
        }
        return <g key={rv.id}>{lines(pts, rv.id, rv.mouth_kind === 'none' ? styles.riverOpen : undefined)}</g>
      })}
      {draft && draft.length > 0 && lines(draft.map((n) => axialToPixel(n.q, n.r, R)), 'draft', styles.riverDraft)}
    </g>
  )
}

/** a city's name under its pyramid: at most two short lines, so it stays inside the field */
function nameLines(name: string): string[] {
  const words = name.trim().split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= 11) cur = `${cur} ${w}`
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  const out = lines.slice(0, 2).map((l) => (l.length > 12 ? `${l.slice(0, 11)}…` : l))
  if (lines.length > 2 && !out[1].endsWith('…')) out[1] = `${out[1].slice(0, 11)}…`
  return out
}

/** the pyramid of dots in the middle of a city's field, every dot in its god's colour, the godless grey */
function CityPyramid({ x, y, city, world, colorOf }: { x: number; y: number; city: string; world: WorldView; colorOf: (playerId: string | null) => { fill: string; stroke: string } }) {
  const followers = world.followersOf(city)
  const total = cityLevel(world.cityDots(city))
  if (total === 0) return null
  const rows = PYRAMID[total] ?? [total]
  const owners: (string | null)[] = []
  for (const f of followers) for (let i = 0; i < f.dots; i++) owners.push(f.player_id)
  for (let i = 0; i < world.atheistsOf(city); i++) owners.push(null)
  const step = R * 0.16
  const dotR = R * 0.068
  const height = rows.length * step
  const plateW = Math.max(...rows) * step + step * 0.9
  const name = world.entityById(city)?.name ?? ''
  let k = 0
  return (
    <g className={styles.dots}>
      <rect className={styles.cityPlate} x={x - plateW / 2} y={y - height / 2 - step * 0.35} width={plateW} height={height + step * 0.7} rx={4} />
      <text className={styles.cityName} x={x} y={y + height / 2 + step * 0.35 + R * 0.17} textAnchor="middle" dominantBaseline="central" fontSize={R * 0.15}>
        {nameLines(name).map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : R * 0.17}>
            {line}
          </tspan>
        ))}
      </text>
      {rows.map((count, rowIdx) => {
        const cy = y + height / 2 - step / 2 - rowIdx * step
        const startX = x - ((count - 1) * step) / 2
        return Array.from({ length: count }, (_, i) => {
          const owner = owners[k++]
          const c = owner === undefined ? GODLESS : colorOf(owner)
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

function HpBar({ x, y, hp, max }: { x: number; y: number; hp: number; max: number }) {
  const w = R * 0.5
  return (
    <g className={styles.hp}>
      <rect className={styles.hpBack} x={x - w / 2} y={y} width={w} height={3} rx={1.5} />
      <rect className={styles.hpBar} x={x - w / 2} y={y} width={(w * Math.max(0, Math.min(max, hp))) / Math.max(1, max)} height={3} rx={1.5} />
    </g>
  )
}

/** the newest catastrophe, played once on its field, after the die's window has been dismissed */
function useBurst(log: ActionLog[]): { id: string; q: number; r: number } | null {
  const seen = useRef<string | null>(null)
  const [queued, setQueued] = useState<{ id: string; q: number; r: number; at: number; tick: number } | null>(null)
  const [burst, setBurst] = useState<{ id: string; q: number; r: number } | null>(null)
  const open = useDiceGate((s) => s.open)
  const dismissed = useDiceGate((s) => s.dismissed)
  useEffect(() => {
    const last = [...log].reverse().find((l) => l.action_key === 'catastrophe')
    if (!last || seen.current === last.id) return
    const first = seen.current === null
    seen.current = last.id
    // only a cataclysm that just happened (not the one found on opening the game)
    if (first && Date.now() - new Date(last.created_at).getTime() > 15000) return
    const o = (last.outcome && !Array.isArray(last.outcome) ? last.outcome : {}) as Record<string, unknown>
    if (typeof o.q !== 'number' || typeof o.r !== 'number') return
    setQueued({ id: last.id, q: o.q, r: o.r, at: Date.now(), tick: 0 })
  }, [log])
  // the die tumbles in its window first (DiceOverlay); the fire falls once the table has clicked on
  useEffect(() => {
    if (!queued) return
    const ready = dismissed === queued.id || (open !== queued.id && Date.now() - queued.at > 5000)
    if (!ready) {
      const t = window.setTimeout(() => setQueued((q) => (q ? { ...q, tick: q.tick + 1 } : q)), 500)
      return () => window.clearTimeout(t)
    }
    setBurst({ id: queued.id, q: queued.q, r: queued.r })
    setQueued(null)
  }, [queued, open, dismissed])
  useEffect(() => {
    if (!burst) return
    const stop = window.setTimeout(() => setBurst(null), 3400)
    return () => window.clearTimeout(stop)
  }, [burst])
  return burst
}

/** the wrath of a god: a flash over the world, fire raining on the field, rings running out of it */
function Burst({ q, r }: { q: number; r: number }) {
  const { x, y } = axialToPixel(q, r, R)
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 10
    return { dx: Math.cos(a) * R * 1.6, dy: Math.sin(a) * R * 1.6, delay: 0.3 + (i % 3) * 0.12 }
  })
  return (
    <g className={styles.burst}>
      <rect className={styles.burstFlash} x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} />
      {[0, 1, 2].map((i) => (
        <text key={`rain-${i}`} className={styles.burstRain} style={{ animationDelay: `${i * 0.22}s` }} x={x + (i - 1) * R * 0.45} y={y - R * 2.2} fontSize={R * 0.5} textAnchor="middle" dominantBaseline="central">
          ☄️
        </text>
      ))}
      <circle className={styles.burstRing} cx={x} cy={y} r={R * 1.1} />
      <circle className={[styles.burstRing, styles.burstRing2].join(' ')} cx={x} cy={y} r={R * 0.8} />
      <circle className={[styles.burstRing, styles.burstRing3].join(' ')} cx={x} cy={y} r={R * 0.6} />
      {sparks.map((sp, i) => (
        <text key={i} className={styles.burstSpark} style={{ '--dx': `${sp.dx}px`, '--dy': `${sp.dy}px`, animationDelay: `${sp.delay}s` } as React.CSSProperties} x={x} y={y} fontSize={R * 0.34} textAnchor="middle" dominantBaseline="central">
          🔥
        </text>
      ))}
      <text className={styles.burstSign} x={x} y={y} fontSize={R * 0.9} textAnchor="middle" dominantBaseline="central">
        💥
      </text>
    </g>
  )
}

export type { Entity as HexEntity, MapPick }
