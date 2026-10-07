import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Entity } from '@/lib/types'
import type { WorldView } from '@/lib/world'
import { BIOME_BY_KEY } from '@/data/biomes'
import { cityLevelLabel, followersWord } from '@/data/cities'
import { godColor } from '@/data/pantheon'
import { useGameStore, godLabel, selectMyPlayer, selectPendingContest } from '@/store/useGameStore'
import { useUser } from '@/features/auth/AuthGate'
import { useMapMode } from './mapMode'
import { godPortraitSrc } from '@/features/pantheon/GodPortrait'
import type { Inspect } from './HexMap'
import styles from './map.module.css'

/** The card of a field, hung beside the mouse: one flat slab, the city's name as its title when there is one. */
export function HexInfoPopup({ at, world, onClose, onOpenEntity }: { at: Inspect; world: WorldView; onClose: () => void; onOpenEntity: (e: Entity) => void }) {
  const players = useGameStore((s) => s.players)
  const { user } = useUser()
  const me = useGameStore(selectMyPlayer(user.id))
  const game = useGameStore((s) => s.game)
  const pending = useGameStore(selectPendingContest)
  const request = useMapMode((s) => s.request)
  const mapMode = useMapMode((s) => s.mode)
  const myTurn = !!game && !!me && game.phase === 'gods' && game.current_turn_player_id === me.id && !me.is_resting && !pending && !game.verse_pending_by && !mapMode
  const myAvatarIds = new Set(me ? world.avatarsOf(me.id).map((a) => a.entity.id) : [])
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: at.x + 14, top: at.y + 14 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = at.x + 14
    let top = at.y + 14
    if (left + w > window.innerWidth - 8) left = Math.max(8, at.x - w - 14)
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
    setPos({ left, top })
  }, [at])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hex = world.hexAt(at.q, at.r)
  const biome = hex ? BIOME_BY_KEY[hex.biome] : null
  const occupants = world.occupantsAt(at.q, at.r).map((o) => world.entityById(o.entity_id)).filter((e): e is Entity => !!e)
  const creatures = occupants.filter((e) => e.kind === 'creature' && !world.isSapient(e))
  const sapients = occupants.filter((e) => world.isSapient(e))
  const avatars = occupants.filter((e) => e.kind === 'avatar')
  const city = world.cityAt(at.q, at.r)
  const cityEnt = city ? world.entityById(city.entity_id) : undefined
  const followers = city ? world.followersOf(city.entity_id) : []
  const ruler = city ? world.majorityOf(city.entity_id) : null
  const gifts = city ? world.giftsOf(city.entity_id) : []
  const byId = (id: string) => players.find((p) => p.id === id)

  return (
    <div ref={ref} className={['marble', 'emerge-from-dark', styles.popup].join(' ')} style={pos} role="dialog" aria-label={cityEnt ? cityEnt.name : `Heks ${at.q}, ${at.r}`}>
      <div className={styles.popupHead}>
        {biome && <img className={styles.popupBiome} src={biome.image} alt="" />}
        {cityEnt ? (
          <button type="button" className={styles.popupTitleBtn} onClick={() => onOpenEntity(cityEnt)} title="Otwórz kartę miasta">
            {cityEnt.name}
          </button>
        ) : (
          <h4>{biome?.name ?? 'Poza światem'}</h4>
        )}
        <span className={styles.popupCoords}>({at.q}, {at.r})</span>
        <button type="button" className={styles.popupClose} onClick={onClose} aria-label="Zamknij">✕</button>
      </div>
      <p className={styles.popupStatus}>
        {cityEnt && city ? `${cityLevelLabel(world.cityDots(city.entity_id))} · ${biome?.name.toLowerCase() ?? ''}` : biome?.name ?? ''}
        {' · '}
        <span className={biome?.blocked ? styles.popupBlocked : ''}>{biome?.blocked ? 'zablokowany: ani miasta, ani istot, ani wyznawców' : 'dostępny'}</span>
      </p>

      {cityEnt && city && (
        <>
          <div className={styles.popupSection}>
            <h5>Wyznawcy</h5>
            {followers.length === 0 && <span className={styles.popupEmpty}>Nikt tu nie wierzy.</span>}
            {followers.map((f) => {
              const p = byId(f.player_id)
              const c = godColor(p)
              const rules = ruler === f.player_id
              return (
                <div key={f.player_id} className={[styles.followerRow, rules ? styles.ruler : ''].join(' ')}>
                  <span className={styles.swatch} style={{ background: c.fill, boxShadow: `0 0 0 1.5px ${c.stroke}` }} />
                  <span>{godLabel(p)}: {followersWord(f.dots)}</span>
                  {rules && <img className={styles.rulerPortrait} src={godPortraitSrc(p?.domain_key)} alt="" title="Rządzi miastem" />}
                </div>
              )
            })}
          </div>
          {gifts.length > 0 && (
            <div className={styles.popupSection}>
              <h5>Dary</h5>
              <div className={styles.gifts}>
                {gifts.map((g) => (
                  <span key={g.id} className={g.accepted ? '' : styles.giftRejected} title={g.accepted ? `dar bóstwa ${godLabel(byId(g.player_id ?? ''))}` : 'dar odrzucony'}>
                    {g.accepted ? '✦' : '✕'} {g.text}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cityEnt.description && <p className={styles.popupDesc}>{cityEnt.description}</p>}
        </>
      )}

      <div className={styles.popupSection}>
        <h5>Istoty rozumne</h5>
        {sapients.length === 0 && <span className={styles.popupEmpty}>Nikt rozumny tu nie mieszka.</span>}
        {sapients.map((e) => <Row key={e.id} e={e} onOpen={onOpenEntity} />)}
      </div>
      <div className={styles.popupSection}>
        <h5>Istoty</h5>
        {creatures.length === 0 && <span className={styles.popupEmpty}>Pusto.</span>}
        {creatures.map((e) => <Row key={e.id} e={e} onOpen={onOpenEntity} />)}
      </div>
      {avatars.length > 0 && (
        <div className={styles.popupSection}>
          <h5>Awatary</h5>
          {avatars.map((e) => (
            <Row key={e.id} e={e} onOpen={onOpenEntity} extra={`życie ${e.hp ?? 0} z 3`}>
              {myAvatarIds.has(e.id) && myTurn && (
                <button type="button" className={styles.popupAct} title="Awatar przemawia o tym, co nadejdzie" onClick={() => { request({ key: 'prophecy', avatarId: e.id }); onClose() }}>
                  Proroctwo
                </button>
              )}
            </Row>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ e, onOpen, extra, children }: { e: Entity; onOpen: (e: Entity) => void; extra?: string; children?: ReactNode }) {
  return (
    <div className={styles.popupRow}>
      <span className={styles.popupEmoji} aria-hidden>{e.emoji ?? '●'}</span>
      <button type="button" onClick={() => onOpen(e)}>{e.name}</button>
      {extra && <small style={{ color: 'var(--ink-soft)' }}>{extra}</small>}
      {children}
    </div>
  )
}
