// The dice window and the windows that wait for it. A roll row opens the gate (the dice tumble, the
// table reads the result and clicks "Kontynuuj"); only then may the result windows show.
// The god who throws sees the dice in its own window instead: it claims the next roll, and the
// table's dice window stays quiet for it while everyone else still watches the throw.
import { useEffect, useState } from 'react'
import { create } from 'zustand'

interface DiceGateState {
  /** the roll row on the table right now */
  open: string | null
  /** the last roll row the table has dismissed */
  dismissed: string | null
  /** a verse window (a word's last step, a contest's verse) is on screen */
  verseDialog: boolean
  /** my own window shows my next throw: the table's dice window keeps quiet for it */
  claimed: boolean
  show: (rowId: string) => void
  dismiss: (rowId: string) => void
  setVerseDialog: (on: boolean) => void
  claim: () => void
  unclaim: () => void
}

export const useDiceGate = create<DiceGateState>((set) => ({
  open: null,
  dismissed: null,
  verseDialog: false,
  claimed: false,
  show: (rowId) => set({ open: rowId }),
  dismiss: (rowId) => set((s) => ({ open: s.open === rowId ? null : s.open, dismissed: rowId })),
  setVerseDialog: (on) => set({ verseDialog: on }),
  claim: () => set({ claimed: true }),
  unclaim: () => set({ claimed: false }),
}))

/** how long a window waits for the dice window to pick the row up before it stops waiting */
const GRACE_MS = 4000

/**
 * true while the dice of this row are still on the table: the window shows them, or has not had the
 * chance yet. A row the dice window never picks up (an old one, a lost event) stops blocking after a
 * moment, so nothing hangs on it.
 */
export function useDiceWait(rowId: string | null | undefined): boolean {
  const open = useDiceGate((s) => s.open)
  const dismissed = useDiceGate((s) => s.dismissed)
  const [grace, setGrace] = useState(true)
  useEffect(() => {
    setGrace(true)
    if (!rowId) return
    const t = window.setTimeout(() => setGrace(false), GRACE_MS)
    return () => window.clearTimeout(t)
  }, [rowId])
  if (!rowId) return false
  if (dismissed === rowId) return false
  if (open === rowId) return true
  return grace
}

/** marks a verse window as present for as long as the component lives */
export function useVerseDialogFlag(active = true) {
  const setVerseDialog = useDiceGate((s) => s.setVerseDialog)
  useEffect(() => {
    if (!active) return
    setVerseDialog(true)
    return () => setVerseDialog(false)
  }, [setVerseDialog, active])
}
