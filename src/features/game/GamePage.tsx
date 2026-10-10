import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, supabase } from '@/lib/supabase'
import type { Game } from '@/lib/types'
import { useGameStore } from '@/store/useGameStore'
import type { Era } from '@/data/actions'
import { Notice } from '@/components/ui/Primitives'
import { StoneButton } from '@/components/ui/StoneButton'
import { GodsStatusBar } from './gods-bar/GodsStatusBar'
import { EraAnchor } from './EraAnchor'
import { SummaryPanel } from './SummaryPanel'
import { DiceOverlay } from './DiceOverlay'
import { LatestVerse } from './LatestVerse'
import { EraOverture, useEraOverture } from './EraOverture'
import { ActionsPanel } from './actions/ActionsPanel'
import { MapStage } from './map/MapStage'
import { ContestOverlay } from './map/ContestOverlay'
import { ContestVerseDialog } from './map/ContestVerseDialog'
import { ChaosOverlay } from './chaos/ChaosOverlay'
import { NightFightDialog } from './chaos/NightFightDialog'
import { NightNamingDialog } from './chaos/NightNamingDialog'
import { ChronicleDrawer } from './chronicle/ChronicleDrawer'
import styles from './game.module.css'

/** dev preview only: /preview?screen=game&overture=2 replays the curtain of that Era; overture=0 skips it */
function forcedOverture(): Era | 0 | null {
  if (!import.meta.env.DEV) return null
  const raw = new URLSearchParams(window.location.search).get('overture')
  if (raw === null) return null
  const v = Number(raw)
  return v === 1 || v === 2 || v === 3 ? v : 0
}

/**
 * Tables saw rounds where everyone had rolled, the phase was 'gods' and nobody held the turn.
 * When that state lasts more than a moment, re-read the game row (a lost Realtime event) and,
 * if it is really stuck, ask the server to settle the turn (ensure_turn, any member may).
 */
function useTurnGuard(game: Game) {
  const stuck = game.status === 'playing' && game.phase === 'gods' && !game.current_turn_player_id
  useEffect(() => {
    const preview = import.meta.env.DEV && !!(window as unknown as { __previewRpc?: unknown }).__previewRpc
    if (!stuck || preview) return
    const t = window.setTimeout(async () => {
      const { data } = await supabase.from('games').select('*').eq('id', game.id).single()
      if (data && (data as Game).current_turn_player_id) {
        useGameStore.setState({ game: data as Game })
        return
      }
      try {
        const fixed = await rpc<Game>('ensure_turn', { p_game_id: game.id })
        if (fixed) useGameStore.setState({ game: fixed })
      } catch {
        /* an older database without ensure_turn: nothing more to do here */
      }
    }, 1500)
    return () => window.clearTimeout(t)
  }, [stuck, game.id])
}

/**
 * The temple, as a strict grid:
 *   era     | gods    | gods
 *   summary | actions | altar
 * The summary slab and the colonnade of actions run the full height on the left; the map takes the rest.
 */
export function GamePage() {
  const game = useGameStore((s) => s.game)!
  const connected = useGameStore((s) => s.connected)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [chronicle, setChronicle] = useState(false)
  const [overture, enterEra] = useEraOverture(game.id, game.era as Era, forcedOverture())
  useTurnGuard(game)

  return (
    <div className={styles.layout}>
      <EraAnchor onError={setError} />
      <GodsStatusBar />
      <SummaryPanel onError={setError} chronicleOpen={chronicle} onChronicle={() => setChronicle((v) => !v)} />
      <ActionsPanel />
      <main className={styles.altar}>
        <LatestVerse />
        {error && (
          <div className={styles.altarBanner} style={{ padding: 0 }}>
            <Notice tone="error">{error}</Notice>
            <StoneButton size="sm" onClick={() => setError(null)}>OK</StoneButton>
          </div>
        )}
        <MapStage onError={setError} />
      </main>

      {game.phase === 'chaos' && !overture && <ChaosOverlay onError={setError} />}
      {game.status === 'playing' && <ContestOverlay />}
      {game.status === 'playing' && <NightFightDialog />}
      {game.status === 'playing' && <NightNamingDialog />}
      {game.status === 'playing' && <ContestVerseDialog />}
      {game.status === 'playing' && <DiceOverlay />}
      {chronicle && <ChronicleDrawer onClose={() => setChronicle(false)} />}
      {overture && game.status === 'playing' && <EraOverture era={overture} onEnter={enterEra} />}

      {!connected && (
        <div className={styles.offline}>
          <Notice tone="error">Łączność ze świątynią przerwana. Próbujemy ponownie…</Notice>
        </div>
      )}

      {game.status === 'finished' && (
        <div className={styles.offline}>
          <Notice tone="ok">
            Gra zakończona. <button className="engraved" onClick={() => navigate('/')}>Wróć do światów</button>
          </Notice>
        </div>
      )}
    </div>
  )
}
