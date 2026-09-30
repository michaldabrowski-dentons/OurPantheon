import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { Notice } from '@/components/ui/Primitives'
import { StoneButton } from '@/components/ui/StoneButton'
import { GodsStatusBar } from './gods-bar/GodsStatusBar'
import { EraAnchor } from './EraAnchor'
import { BottomBar } from './BottomBar'
import { LatestVerse } from './LatestVerse'
import { ActionsPanel } from './actions/ActionsPanel'
import { AltarGrid } from './altar/AltarGrid'
import { ChaosOverlay } from './chaos/ChaosOverlay'
import { ChronicleDrawer } from './chronicle/ChronicleDrawer'
import styles from './game.module.css'

/**
 * The temple, as a strict grid:
 *   era    | gods
 *   actions| altar
 *   actions| bottom
 * The colonnade of actions runs the full height on the left; the bottom bar sits under the altar only.
 */
export function GamePage() {
  const game = useGameStore((s) => s.game)!
  const connected = useGameStore((s) => s.connected)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [chronicle, setChronicle] = useState(false)

  return (
    <div className={styles.layout}>
      <EraAnchor onError={setError} />
      <GodsStatusBar />
      <ActionsPanel />
      <main className={styles.altar}>
        <LatestVerse chronicleOpen={chronicle} onChronicle={() => setChronicle((v) => !v)} />
        {error && (
          <div className={styles.altarBanner} style={{ padding: 0 }}>
            <Notice tone="error">{error}</Notice>
            <StoneButton size="sm" onClick={() => setError(null)}>OK</StoneButton>
          </div>
        )}
        <AltarGrid onError={setError} />
      </main>
      <BottomBar onError={setError} />

      {game.phase === 'chaos' && <ChaosOverlay onError={setError} />}
      {chronicle && <ChronicleDrawer onClose={() => setChronicle(false)} />}

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
