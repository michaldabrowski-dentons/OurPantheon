import { useEffect } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useGameStore, type RealtimeTable } from '@/store/useGameStore'

const GAME_TABLES: RealtimeTable[] = [
  'players', 'palette_entries', 'entities', 'entity_gods', 'entity_links', 'actions_log', 'chaos_draws', 'era_votes',
  'creation_options', 'creation_votes',
]

/** Loads a game into the store and keeps it in sync via Supabase Realtime. */
export function useGameRealtime(gameId: string | null | undefined) {
  const load = useGameStore((s) => s.load)
  const applyChange = useGameStore((s) => s.applyChange)
  const setConnected = useGameStore((s) => s.setConnected)
  const reset = useGameStore((s) => s.reset)

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    void load(gameId)

    const handle =
      (table: RealtimeTable) =>
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (cancelled) return
        applyChange(table, payload.eventType, payload.new, payload.old)
      }

    let channel = supabase.channel(`game:${gameId}`)
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      handle('games'),
    )
    for (const table of GAME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `game_id=eq.${gameId}` },
        handle(table),
      )
    }
    channel.subscribe((status) => {
      if (cancelled) return
      if (status === 'SUBSCRIBED') {
        setConnected(true)
        // Re-fetch to close any gap between the initial load and the subscription.
        void load(gameId)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnected(false)
      }
    })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
      reset()
    }
  }, [gameId, load, applyChange, setConnected, reset])
}
