import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer } from '@/store/useGameStore'
import { frescoSrc } from '@/data/frescoes'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, EngravedTitle, TextField, FrescoFrame, Notice } from '@/components/ui/Primitives'
import { FrescoPicker } from './FrescoPicker'
import { GenderPicker } from './GenderPicker'
import type { GodGender } from '@/lib/types'
import styles from './lobby.module.css'

export function RoomWaiting() {
  const { user } = useUser()
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id

  const [godName, setGodName] = useState('')
  const [godDesc, setGodDesc] = useState('')
  const [gender, setGender] = useState<GodGender>('n')
  const [avatar, setAvatar] = useState('fresco-01')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (me && !dirty) {
      setGodName(me.god_name)
      setGodDesc(me.god_description ?? '')
      setGender(me.god_gender ?? 'n')
      setAvatar(me.avatar_key)
    }
  }, [me, dirty])

  async function saveGod() {
    setBusy(true)
    setError(null)
    try {
      await rpc('set_god', { p_game_id: game.id, p_god_name: godName, p_avatar_key: avatar, p_god_description: godDesc, p_god_gender: gender })
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openPalette() {
    setError(null)
    try {
      await rpc('open_palette', { p_game_id: game.id })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const shareUrl = `${window.location.origin}/room/${game.code}`

  return (
    <div className={styles.room}>
      <div className={styles.topbar}>
        <h1 className="engraved-dark gold-text">{game.name}</h1>
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
              <div key={p.id} className={styles.seat}>
                <FrescoFrame src={frescoSrc(p.avatar_key)} alt="" size={48} round />
                <div className={styles.seatNames}>
                  <strong>{p.god_name || 'Bóstwo bez imienia'}</strong>
                  <small>
                    {profiles[p.user_id]?.display_name ?? '…'}
                    {p.god_description ? ` · ${p.god_description}` : ''}
                  </small>
                </div>
                {p.user_id === game.host_id && <span className={styles.hostMark}>GOSPODARZ</span>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className={[styles.seat, styles.empty].join(' ')}>wolne miejsce</div>
            ))}
          </div>

          {isHost ? (
            <StoneButton variant="gold" size="lg" block onClick={openPalette}>
              Otwórz Paletę
            </StoneButton>
          ) : (
            <Notice>Gospodarz otworzy Paletę, gdy wszyscy zasiądą.</Notice>
          )}
        </MarblePanel>

        <MarblePanel style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <EngravedTitle as="h3" align="left">Twoje bóstwo</EngravedTitle>
          <TextField
            id="god_name"
            label="Imię bóstwa"
            placeholder="np. Ta, Która Śpi Pod Rzeką"
            maxLength={60}
            value={godName}
            onChange={(e) => {
              setGodName(e.target.value)
              setDirty(true)
            }}
          />
          <TextField
            id="god_desc"
            label="Czym jest twoje bóstwo (krótko)"
            placeholder="np. bogini rzek, cierpliwości i powodzi"
            maxLength={120}
            value={godDesc}
            onChange={(e) => {
              setGodDesc(e.target.value)
              setDirty(true)
            }}
          />
          <GenderPicker
            value={gender}
            name={godName}
            onChange={(g) => {
              setGender(g)
              setDirty(true)
            }}
          />
          <div>
            <span className="engraved" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Fresk</span>
            <FrescoPicker
              value={avatar}
              onChange={(k) => {
                setAvatar(k)
                setDirty(true)
              }}
            />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <StoneButton variant="lapis" onClick={saveGod} disabled={busy || !dirty}>
            {busy ? 'Zapisywanie…' : dirty ? 'Zapisz bóstwo' : 'Zapisano'}
          </StoneButton>
          <p style={{ color: 'var(--ink-soft)' }}>
            Imię, opis i wygląd możesz zmienić także później. Nikt nie zaczyna ze Słowami: pierwsza runda otwiera się
            rzutem wszystkich. Opis to tylko punkt wyjścia: kultury same nadadzą ci znaczenie.
          </p>
        </MarblePanel>
      </div>
    </div>
  )
}
