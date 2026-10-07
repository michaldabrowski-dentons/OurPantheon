import { useEffect, useState } from 'react'
import type { Entity } from '@/lib/types'
import { useMapMode } from './mapMode'
import { useWorld } from './useWorld'
import { HexMap, type Inspect } from './HexMap'
import { HexInfoPopup } from './HexInfoPopup'
import { EntityDetail } from '../altar/EntityDetail'
import styles from './map.module.css'

/** The altar: the map, the field's card, and the detail of a thing opened from it. */
export function MapStage({ onError }: { onError: (m: string | null) => void }) {
  const world = useWorld()
  const mode = useMapMode((s) => s.mode)
  const [inspected, setInspected] = useState<Inspect | null>(null)
  const [openEntity, setOpenEntity] = useState<Entity | null>(null)

  // the card closes when the map starts asking questions
  useEffect(() => {
    if (mode) setInspected(null)
  }, [mode])

  const live = openEntity ? world.entityById(openEntity.id) ?? null : null

  return (
    <div className={styles.stage}>
      <HexMap world={world} inspected={inspected} onInspect={setInspected} />
      {inspected && <HexInfoPopup at={inspected} world={world} onClose={() => setInspected(null)} onOpenEntity={(e) => setOpenEntity(e)} />}
      {live && <EntityDetail entity={live} onClose={() => setOpenEntity(null)} onError={onError} />}
    </div>
  )
}
