// What the map is asking for right now. A word's window hands a question to the map ("click up to
// three touching fields", "click a city of yours"), hides itself, and gets the answer back.
import { create } from 'zustand'
import type { HexOccupant } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { hexDistance } from '@/lib/hex'

export type MapModeKind = 'hexes' | 'hex' | 'occupant' | 'city'

export interface MapMode {
  kind: MapModeKind
  /** shown on the card beside the map */
  title: string
  instruction: string
  /** which fields may be clicked */
  valid: (q: number, r: number, world: WorldView, selection: MapPick[]) => boolean
  /** 'occupant': which of the field's occupants may be chosen */
  validOccupant?: (o: HexOccupant, world: WorldView) => boolean
  /** 'hexes': how many at most */
  max?: number
  /** 'hexes': every next field must touch one already chosen */
  contiguous?: boolean
  /** Logos for the current selection, shown live (distance words) */
  costFor?: (selection: MapPick[], world: WorldView) => number | null
  onFinish: (selection: MapPick[]) => void
  onCancel: () => void
}

interface MapModeState {
  mode: MapMode | null
  selection: MapPick[]
  setMode: (mode: MapMode | null) => void
  /** a click on the map; single-pick modes finish at once */
  pick: (p: MapPick) => void
  unpick: (p: MapPick) => void
  finish: () => void
  cancel: () => void
}

const same = (a: MapPick, b: MapPick) => a.q === b.q && a.r === b.r

export const useMapMode = create<MapModeState>((set, get) => ({
  mode: null,
  selection: [],
  setMode: (mode) => set({ mode, selection: [] }),
  pick: (p) => {
    const { mode, selection } = get()
    if (!mode) return
    if (mode.kind !== 'hexes') {
      set({ mode: null, selection: [] })
      mode.onFinish([p])
      return
    }
    if (selection.some((s) => same(s, p))) {
      set({ selection: selection.filter((s) => !same(s, p)) })
      return
    }
    if (mode.max && selection.length >= mode.max) return
    const next = [...selection, p]
    if (mode.max && next.length >= mode.max) {
      set({ mode: null, selection: [] })
      mode.onFinish(next)
      return
    }
    set({ selection: next })
  },
  unpick: (p) => set((s) => ({ selection: s.selection.filter((x) => !same(x, p)) })),
  finish: () => {
    const { mode, selection } = get()
    if (!mode || selection.length === 0) return
    set({ mode: null, selection: [] })
    mode.onFinish(selection)
  },
  cancel: () => {
    const { mode } = get()
    set({ mode: null, selection: [] })
    mode?.onCancel()
  },
}))

/** true when a field may be the next pick in the current mode */
export function canPick(mode: MapMode, selection: MapPick[], q: number, r: number, world: WorldView): boolean {
  if (!mode.valid(q, r, world, selection)) return false
  if (mode.kind === 'hexes' && mode.contiguous && selection.length > 0 && !selection.some((s) => same(s, { q, r }))) {
    return selection.some((s) => hexDistance(s, { q, r }) === 1)
  }
  return true
}
