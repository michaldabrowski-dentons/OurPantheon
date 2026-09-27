import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, TextField, Notice } from '@/components/ui/Primitives'
import styles from './auth.module.css'

export function TempleLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className={styles.center}>
      <MarblePanel className={styles.card}>
        <header className={styles.templeHead}>
          <h1 className="engraved">Nasz Panteon</h1>
          <p>Wspólny stół dla bóstw, które budują świat.</p>
        </header>
        {sent ? (
          <Notice tone="ok">
            Posłaniec wyruszył. Otwórz wiadomość wysłaną na <strong>{email}</strong> i kliknij łącze, aby wejść do
            świątyni.
          </Notice>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <TextField
              id="email"
              label="Adres e-mail"
              type="email"
              required
              autoComplete="email"
              placeholder="ty@przyklad.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <Notice tone="error">{error}</Notice>}
            <StoneButton type="submit" variant="gold" size="lg" block disabled={busy}>
              {busy ? 'Wysyłanie…' : 'Wyślij łącze wejścia'}
            </StoneButton>
            <p className={styles.lead}>Bez hasła. Dostaniesz jednorazowe łącze na e-mail.</p>
          </form>
        )}
      </MarblePanel>
    </div>
  )
}
