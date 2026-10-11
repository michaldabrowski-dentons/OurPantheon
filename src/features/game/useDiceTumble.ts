import { useEffect, useState } from 'react'

/** how long the dice tumble before they settle on the thrown faces */
export const TUMBLE_MS = 1600

/**
 * The tumble every throw at the table gets: random faces for a moment, then the real ones.
 * Starts over whenever `key` changes; with no key the dice lie still and unsettled.
 */
export function useDiceTumble(key: string | number | null | undefined, ms = TUMBLE_MS): { faces: [number, number]; settled: boolean } {
  const [faces, setFaces] = useState<[number, number]>([3, 4])
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    if (key === null || key === undefined) return
    const tick = window.setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 90)
    const stop = window.setTimeout(() => {
      window.clearInterval(tick)
      setSettled(true)
    }, ms)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(stop)
    }
  }, [key, ms])
  return { faces, settled }
}
