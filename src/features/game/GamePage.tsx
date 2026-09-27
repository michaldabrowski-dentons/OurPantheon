import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { Notice } from '@/components/ui/Primitives'
import { StoneButton } from '@/components/ui/StoneButton'
import { GodsStatusBar } from './gods-bar/GodsStatusBar'
import { ActionsPanel } from './actions/ActionsPanel'
import { AltarGrid } from './altar/AltarGrid'
import { ChaosOverlay } from './chaos/ChaosOverlay'
import { ChronicleDrawer } from './chronicle/ChronicleDrawer'
import styles from './game.module.css'

export function GamePage() {
  const game = useGameStore((s) => s.game)!
  const connected = useGameStore((s) => s.connected)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [chronicle, setChronicle] = useState(false)

  return (
    <div className={styles.layout}>
      <GodsStatusBar onError={setError} />
      <div className={styles.body}>
        <ActionsPanel onError={setError} />
        <main className={['altar-joints', styles.altar].join(' ')}>
          {error && (
            <div className={styles.altarBanner} style={{ padding: 0 }}>
              <Notice tone="error">{error}</Notice>
              <StoneButton size="sm" onClick={() => setError(null)}>OK</StoneButton>
            </div>
          )}
          <AltarGrid onError={setError} />
        </main>
      </div>

      {game.phase === 'chaos' && <ChaosOverlay onError={setError} />}

      <StoneButton className={styles.chronicleToggle} size="sm" variant="clay" onClick={() => setChronicle((v) => !v)}>
        Kronika
      </StoneButton>
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
