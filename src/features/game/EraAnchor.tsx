import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import { ERA_NAMES, ERA_NUMERALS, ERA_THEMES } from '@/data/actions'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import styles from './game.module.css'

/** Top-left corner, as wide as the colonnade below: the numeral in a square, the Era and its vote beside it. */
export function EraAnchor({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const eraVotes = useGameStore((s) => s.eraVotes)
  const me = useGameStore(selectMyPlayer(user.id))
  const [busy, setBusy] = useState(false)

  const iVoted = eraVotes.some((v) => v.player_id === me?.id)
  const needed = Math.floor(players.length / 2) + 1

  async function vote() {
    setBusy(true)
    onError(null)
    try {
      await rpc('vote_advance_era', { p_game_id: game.id })
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={['basalt', styles.eraAnchor].join(' ')} title={ERA_THEMES[game.era]}>
      <div className={['obsidian-inlay', styles.eraSquare].join(' ')}>
        <span className={['engraved-dark', 'marble-text', styles.eraNumeral].join(' ')}>{ERA_NUMERALS[game.era]}</span>
      </div>
      <div className={styles.eraText}>
        <span className={styles.eraName}>{ERA_NAMES[game.era]}</span>
        <span className={styles.eraRound}>Runda {game.round_number}</span>
        {game.era < 3 && (
          <div className={styles.eraVote}>
            <StoneButton
              size="sm"
              variant={iVoted ? 'gold' : 'stone'}
              pressed={iVoted}
              disabled={busy}
              title="Głosuj za przejściem do następnej Ery. Decyduje większość bóstw."
              onClick={vote}
            >
              {iVoted ? 'Cofnij głos' : 'Następna Era'}
            </StoneButton>
            <span className={styles.votes}>
              {eraVotes.length} / {needed}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
