import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { buildWorld, type WorldView } from '@/lib/world'

/** The world as the map sees it, rebuilt only when one of its rows changes. */
export function useWorld(): WorldView {
  const hexes = useGameStore((s) => s.hexes)
  const occupants = useGameStore((s) => s.occupants)
  const cities = useGameStore((s) => s.cities)
  const followers = useGameStore((s) => s.followers)
  const gifts = useGameStore((s) => s.gifts)
  const entities = useGameStore((s) => s.entities)
  const entityGods = useGameStore((s) => s.entityGods)
  const rivers = useGameStore((s) => s.rivers)
  return useMemo(
    () => buildWorld({ hexes, occupants, cities, followers, gifts, entities, entityGods, rivers }),
    [hexes, occupants, cities, followers, gifts, entities, entityGods, rivers],
  )
}
