import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { domainTitle } from '@/data/pantheon'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, EngravedTitle, Notice } from '@/components/ui/Primitives'
import { GenderSign } from './GenderPicker'
import { GodPortrait } from '@/features/pantheon/GodPortrait'
import { GodCreation } from '@/features/pantheon/GodCreation'
import { GodSheet } from '@/features/pantheon/GodSheet'
import styles from './lobby.module.css'

export function RoomWaiting() {
  const { user } = useUser()
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)

  async function openPalette() {
    setError(null)
    try {
      await rpc('open_palette', { p_game_id: game.id })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const shareUrl = `${window.location.origin}/room/${game.code}`
  const unready = players.filter((p) => !p.domain_key || !p.attr_primary || !p.attr_bonus)

  return (
    <div className={styles.room}>
      <div className={styles.topbar}>
        <h1 className="engraved-dark marble-text">{game.name}</h1>
        <button className={styles.linkBtn} onClick={() => navigate('/')}>← Wszystkie światy</button>
      </div>

      <div className={styles.roomGrid}>
        <MarblePanel material="sandstone" style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className={styles.code}>
            <span className="engraved" style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Kod świata</span>
            <span className={['obsidian-inlay', styles.codeValue].join(' ')}>{game.code}</span>
            <span className={styles.codeHint}>Podaj kod albo prześlij łącze:</span>
            <StoneButton size="sm" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
              Kopiuj łącze
            </StoneButton>
          </div>

          <EngravedTitle as="h3" align="left">Zasiadają</EngravedTitle>
          <div className={styles.roster}>
            {players.map((p) => (
              <button key={p.id} type="button" className={styles.seat} onClick={() => setSheet(p.id)} title="Otwórz kartę bóstwa">
                <GodPortrait domain={p.domain_key} size={48} alt="" />
                <div className={styles.seatNames}>
                  <strong>
                    <GenderSign kind={p.god_gender ?? 'm'} size={13} className={styles.seatSign} />
                    {p.god_name || 'Bóstwo bez imienia'}
                  </strong>
                  <small>
                    {profiles[p.user_id]?.display_name ?? '…'}
                    {' · '}
                    {p.god_description || domainTitle(p.domain_key, p.god_gender ?? 'm')}
                  </small>
                </div>
                {p.user_id === game.host_id && <span className={styles.hostMark}>GOSPODARZ</span>}
              </button>
            ))}
            {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className={[styles.seat, styles.empty].join(' ')}>wolne miejsce</div>
            ))}
          </div>

          {error && <Notice tone="error">{error}</Notice>}
          {isHost ? (
            <>
              <StoneButton variant="gold" size="lg" block onClick={openPalette}>
                Otwórz Paletę
              </StoneButton>
              {unready.length > 0 && (
                <Notice>
                  {unready.length === 1 ? 'Jedno bóstwo nie ma jeszcze domeny i atrybutów' : `${unready.length} bóstw nie ma jeszcze domeny i atrybutów`}. Można zacząć, ale
                  kartę postaci warto domknąć teraz.
                </Notice>
              )}
            </>
          ) : (
            <Notice>Gospodarz otworzy Paletę, gdy wszyscy zasiądą.</Notice>
          )}
        </MarblePanel>

        <MarblePanel style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <GodCreation me={me} gameId={game.id} />
        </MarblePanel>
      </div>

      {sheet && <GodSheet playerId={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}
