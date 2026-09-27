import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { rpc, supabase } from '@/lib/supabase'
import type { Game } from '@/lib/types'
import { useGameRealtime } from '@/hooks/useGameRealtime'
import { useGameStore } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, EngravedTitle, Notice } from '@/components/ui/Primitives'
import { RoomWaiting } from './RoomWaiting'
import { PalettePage } from '@/features/palette/PalettePage'
import { GamePage } from '@/features/game/GamePage'
import styles from './lobby.module.css'

/** Resolves a join code to a game id (joining if needed), then renders the screen for its status. */
export function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [gameId, setGameId] = useState<string | null>(null)
  const [needsJoin, setNeedsJoin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setGameId(null)
    setNeedsJoin(false)
    supabase
      .from('games')
      .select('id')
      .eq('code', code.toUpperCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else if (data) setGameId(data.id)
        else setNeedsJoin(true)
      })
    return () => {
      active = false
    }
  }, [code])

  async function join() {
    setError(null)
    try {
      const g = await rpc<Game>('join_game', { p_code: code })
      setNeedsJoin(false)
      setGameId(g.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (needsJoin) {
    return (
      <div className={styles.room}>
        <MarblePanel style={{ width: 'min(480px, 100%)', display: 'grid', gap: 16 }}>
          <EngravedTitle>Brama świątyni {code.toUpperCase()}</EngravedTitle>
          <p>Nie zasiadasz jeszcze w tym panteonie.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className={styles.actions}>
            <StoneButton variant="gold" onClick={join}>Dołącz do stołu</StoneButton>
            <StoneButton onClick={() => navigate('/')}>Wróć</StoneButton>
          </div>
        </MarblePanel>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.room}>
        <Notice tone="error">{error}</Notice>
      </div>
    )
  }

  return <RoomLoaded gameId={gameId} />
}

function RoomLoaded({ gameId }: { gameId: string | null }) {
  useGameRealtime(gameId)
  const game = useGameStore((s) => s.game)
  const loading = useGameStore((s) => s.loading)
  const error = useGameStore((s) => s.error)

  if (error) {
    return (
      <div className={styles.room}>
        <Notice tone="error">{error}</Notice>
      </div>
    )
  }
  if (!game || (loading && !game)) {
    return (
      <div className={styles.room}>
        <p className="engraved">Odsuwamy kamienne wrota…</p>
      </div>
    )
  }
  if (game.status === 'lobby') return <RoomWaiting />
  if (game.status === 'palette') return <PalettePage />
  return <GamePage />
}
