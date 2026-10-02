import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc, supabase } from '@/lib/supabase'
import type { Game } from '@/lib/types'
import { useUser } from '@/features/auth/AuthGate'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, EngravedTitle, TextField, Notice, ConfirmDialog } from '@/components/ui/Primitives'
import styles from './lobby.module.css'

const STATUS_PL: Record<Game['status'], string> = {
  lobby: 'przedsionek',
  palette: 'paleta',
  creation: 'stwarzanie świata',
  playing: 'w toku',
  finished: 'zakończona',
}

export function LobbyPage() {
  const { user, profile } = useUser()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [toDelete, setToDelete] = useState<Game | null>(null)

  function loadGames() {
    supabase
      .from('games')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setGames((data ?? []) as Game[]))
  }

  useEffect(loadGames, [])

  async function removeWorld() {
    if (!toDelete) return
    setBusy('delete')
    setError(null)
    try {
      await rpc('delete_game', { p_game_id: toDelete.id })
      setToDelete(null)
      loadGames()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy('create')
    setError(null)
    try {
      const g = await rpc<Game>('create_game', { p_name: name })
      navigate(`/room/${g.code}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy('join')
    setError(null)
    try {
      const g = await rpc<Game>('join_game', { p_code: code })
      navigate(`/room/${g.code}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1 className="engraved-dark marble-text">O BOGOWIE!</h1>
        <p>Gra o bogach, którzy stwarzają świat. Paleta, Logos, Ery i Chaos, we dwoje albo w sześcioro.</p>
        <div className={styles.who}>
          <span className={styles.whoName}>
            <PlayerIcon /> {profile?.display_name}
          </span>
          <button className={[styles.linkBtn, styles.whoExit].join(' ')} onClick={() => supabase.auth.signOut()} title="Wyloguj się">
            <DoorIcon /> Wyjdź
          </button>
        </div>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      <section className={styles.twoUp}>
        <MarblePanel>
          <form className={styles.form} onSubmit={create}>
            <EngravedTitle align="left" as="h2">Stwórz świat</EngravedTitle>
            <TextField
              id="game_name"
              label="Nazwa świata"
              placeholder="np. Ziemie za Mgłą"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <StoneButton type="submit" variant="gold" block disabled={busy !== null}>
              {busy === 'create' ? 'Stwarzanie…' : 'Stwórz świat'}
            </StoneButton>
          </form>
        </MarblePanel>

        <MarblePanel material="sandstone">
          <form className={styles.form} onSubmit={join}>
            <EngravedTitle align="left" as="h2">Dołącz do świata</EngravedTitle>
            <TextField
              id="join_code"
              label="Kod świata"
              placeholder="np. K7PX2M"
              maxLength={6}
              style={{ letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <StoneButton type="submit" variant="lapis" block disabled={busy !== null || code.length < 6}>
              {busy === 'join' ? 'Wchodzenie…' : 'Dołącz'}
            </StoneButton>
          </form>
        </MarblePanel>
      </section>

      {games.length > 0 && (
        <MarblePanel className={styles.myGames} material="marble">
          <EngravedTitle align="left" as="h2">Twoje światy</EngravedTitle>
          {games.map((g) => (
            <div key={g.id} className={styles.gameRow}>
              <div>
                <strong>{g.name}</strong>
                <br />
                <small>
                  kod {g.code} · {STATUS_PL[g.status]}
                  {g.status === 'playing' ? ` · Era ${g.era}, runda ${g.round_number}` : ''}
                </small>
              </div>
              <div className={styles.rowActions}>
                <StoneButton size="sm" onClick={() => navigate(`/room/${g.code}`)}>
                  Otwórz
                </StoneButton>
                {g.host_id === user.id && (
                  <StoneButton size="sm" variant="danger" disabled={busy !== null} onClick={() => setToDelete(g)} title="Tylko gospodarz może usunąć świat.">
                    Usuń
                  </StoneButton>
                )}
              </div>
            </div>
          ))}
        </MarblePanel>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Usunąć świat?"
          confirmLabel="Usuń na zawsze"
          danger
          busy={busy === 'delete'}
          onConfirm={removeWorld}
          onClose={() => setToDelete(null)}
        >
          <p>
            <b>{toDelete.name}</b> zniknie razem z bóstwami, Świętą Księgą i wszystkim, co powstało. Tej decyzji nie da się cofnąć.
          </p>
        </ConfirmDialog>
      )}
    </main>
  )
}

function PlayerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.5 3.5-7.5 8-7.5s8 3 8 7.5" />
    </svg>
  )
}

function DoorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </svg>
  )
}
