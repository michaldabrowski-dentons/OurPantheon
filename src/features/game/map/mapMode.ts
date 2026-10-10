// What the map is asking for right now. A word's window hands a question to the map ("click up to
// three touching fields", "click a city of yours", "lead the river on"), hides itself, and gets the
// answer back.
import { create } from 'zustand'
import type { HexOccupant, HexRef } from '@/lib/types'
import type { MapPick, WorldView } from '@/lib/world'
import { hexDistance } from '@/lib/hex'

export type MapModeKind = 'hexes' | 'hex' | 'occupant' | 'city' | 'river'

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
  /** 'river': the channel continues from this field (a cut river); every pick must then touch the last node */
  start?: HexRef
  /** 'river': a click on such a field ends the river at once (water, another river) */
  isTerminal?: (q: number, r: number, world: WorldView) => boolean
  /** Logos for the current selection, shown live (distance words) */
  costFor?: (selection: MapPick[], world: WorldView) => number | null
  onFinish: (selection: MapPick[]) => void
  onCancel: () => void
}

/** the map asks for a word to open (a click on my avatar opens a prophecy) */
export interface ActionRequest {
  key: 'prophecy' | 'avatar_duel'
  avatarId: string
}

interface MapModeState {
  mode: MapMode | null
  selection: MapPick[]
  requested: ActionRequest | null
  request: (r: ActionRequest | null) => void
  setMode: (mode: MapMode | null) => void
  /** a click on the map; single-pick modes finish at once, a river ends on a terminal field */
  pick: (p: MapPick, terminal?: boolean) => void
  unpick: (p: MapPick) => void
  finish: () => void
  cancel: () => void
}

const same = (a: HexRef, b: HexRef) => a.q === b.q && a.r === b.r

export const useMapMode = create<MapModeState>((set, get) => ({
  mode: null,
  selection: [],
  requested: null,
  request: (requested) => set({ requested }),
  setMode: (mode) => set({ mode, selection: [] }),
  pick: (p, terminal = false) => {
    const { mode, selection } = get()
    if (!mode) return
    if (mode.kind === 'river') {
      // a click on the last node takes it back; the river ends the moment it reaches water or another river
      if (selection.some((s) => same(s, p))) {
        const last = selection[selection.length - 1]
        if (last && same(last, p)) set({ selection: selection.slice(0, -1) })
        return
      }
      const next = [...selection, p]
      if (terminal) {
        set({ mode: null, selection: [] })
        mode.onFinish(next)
        return
      }
      set({ selection: next })
      return
    }
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
  if (mode.kind === 'river') {
    const last = selection[selection.length - 1] ?? mode.start
    if (selection.some((s) => same(s, { q, r }))) return !!last && same(last, { q, r })
    if (mode.start && same(mode.start, { q, r })) return false
    if (!mode.valid(q, r, world, selection)) return false
    return !last || hexDistance(last, { q, r }) === 1
  }
  if (!mode.valid(q, r, world, selection)) return false
  if (mode.kind === 'hexes' && mode.contiguous && selection.length > 0 && !selection.some((s) => same(s, { q, r }))) {
    return selection.some((s) => hexDistance(s, { q, r }) === 1)
  }
  return true
}

/** 'river': the last node has nowhere to flow; the word must be broken off */
export function riverStuck(mode: MapMode, selection: MapPick[], world: WorldView, neighboursOf: (h: HexRef) => HexRef[]): boolean {
  if (mode.kind !== 'river') return false
  const last = selection[selection.length - 1] ?? mode.start
  if (!last) return false
  return !neighboursOf(last).some((n) => canPick(mode, selection, n.q, n.r, world) && !selection.some((s) => same(s, n)))
}
