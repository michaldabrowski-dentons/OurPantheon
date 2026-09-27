import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { Player } from '@/lib/types'
import { ERA_NAMES, ERA_NUMERALS, ERA_THEMES } from '@/data/actions'
import { frescoSrc } from '@/data/frescoes'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { FrescoFrame, Notice } from '@/components/ui/Primitives'
import styles from '../game.module.css'

export function GodsStatusBar({ onError }: { onError: (msg: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const entityGods = useGameStore((s) => s.entityGods)
  const entities = useGameStore((s) => s.entities)
  const eraVotes = useGameStore((s) => s.eraVotes)
  const me = useGameStore(selectMyPlayer(user.id))
  const [busy, setBusy] = useState(false)

  const orthodoxyBonus = (p: Player) =>
    Math.min(
      3,
      entityGods.filter((g) => g.player_id === p.id && entities.some((e) => e.id === g.entity_id && e.kind === 'orthodoxy' && e.status === 'active')).length,
    )

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true)
    onError(null)
    try {
      await rpc(fn, args)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const roundsInEra = game.round_number - game.era_started_round + 1
  const canVote = game.era < 3 && roundsInEra >= 5
  const iVoted = eraVotes.some((v) => v.player_id === me?.id)
  const needed = Math.floor(players.length / 2) + 1

  return (
    <header className={['basalt', styles.godsBar].join(' ')}>
      <div className={['lapis-inlay', styles.era].join(' ')} title={ERA_THEMES[game.era]}>
        <span className={['engraved-dark', 'gold-text', styles.eraNumeral].join(' ')}>{ERA_NUMERALS[game.era]}</span>
        <span className={styles.eraName}>{ERA_NAMES[game.era]}</span>
        <span className={styles.eraRound}>Runda {game.round_number}</span>
      </div>

      <div className={styles.plaques}>
        {players.map((p) => {
          const isTurn = game.phase === 'gods' && game.current_turn_player_id === p.id
          const isMe = p.id === me?.id
          const bonus = p.low_logos_streak + orthodoxyBonus(p)
          return (
            <div
              key={p.id}
              className={['marble', styles.plaque, isTurn ? styles.active : '', isMe ? styles.me : ''].join(' ')}
              aria-current={isTurn ? 'true' : undefined}
            >
              {isTurn && <span className={['lapis-inlay', styles.turnMark].join(' ')}>TWORZY</span>}
              <FrescoFrame src={frescoSrc(p.avatar_key)} alt="" size={56} round aura={isTurn} />
              <div className={styles.plaqueText}>
                <strong title={p.god_name}>{p.god_name || 'Bóstwo bez imienia'}</strong>
                <small>{profiles[p.user_id]?.display_name ?? '…'}</small>
                <span className={styles.logos}>
                  <span className={['engraved', styles.logosNum].join(' ')}>{p.logos}</span>
                  <span className={styles.logosWord}>LOGOS</span>
                  {bonus > 0 && (
                    <span className={styles.bonus} title={`Premia do Rzutu Logos: skromność +${p.low_logos_streak}, ortodoksje +${orthodoxyBonus(p)}`}>
                      +{bonus}
                    </span>
                  )}
                </span>
              </div>
              {game.phase === 'rolling' && !p.has_rolled && <span className={styles.waiting}>CZEKA NA RZUT</span>}
              {game.phase !== 'rolling' && p.is_resting && <span className={styles.sleep}>ŚPI</span>}
            </div>
          )
        })}
      </div>

      <div className={styles.barRight}>
        {game.phase === 'rolling' && me && !me.has_rolled && (
          <StoneButton variant="gold" size="lg" aura disabled={busy} onClick={() => call('roll_logos', { p_game_id: game.id })}>
            Rzuć 2k6 Logos
          </StoneButton>
        )}
        {game.phase === 'rolling' && me?.has_rolled && <Notice>Czekamy na pozostałe bóstwa…</Notice>}
        {game.phase === 'gods' && me && game.current_turn_player_id === me.id && (
          <span className="engraved gold-text" style={{ fontSize: '1.1rem' }}>Twoja tura. Świat czeka.</span>
        )}
        {game.phase === 'chaos' && <span className="engraved" style={{ color: 'var(--marble-vein)' }}>Faza Chaosu</span>}

        {game.era < 3 && (
          <div className={styles.barRow}>
            <StoneButton
              size="sm"
              variant={iVoted ? 'lapis' : 'stone'}
              pressed={iVoted}
              disabled={busy || !canVote}
              title={canVote ? 'Głosuj za przejściem do następnej Ery' : `Era trwa co najmniej 5 rund (teraz ${roundsInEra}).`}
              onClick={() => call('vote_advance_era', { p_game_id: game.id })}
            >
              {iVoted ? 'Cofnij głos' : `Następna Era`}
            </StoneButton>
            <span className={styles.votes}>
              {eraVotes.length} / {needed} głosów
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
