import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, loginToEmail, validateLogin, validatePassword, LOGIN_MAX, PASSWORD_MIN } from '@/lib/login'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, Notice } from '@/components/ui/Primitives'
import styles from './auth.module.css'

/** Turns a guest (anonymous Supabase user) into a login + password account, keeping their worlds. */
export function ClaimAccountDialog({ displayName, onClose, onDone }: { displayName: string; onClose: () => void; onDone: () => void }) {
  const [login, setLogin] = useState(displayName)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const bad = validateLogin(login) ?? validatePassword(password)
    if (bad) return setError(bad)
    if (again !== password) return setError('Hasła się różnią.')
    setBusy(true)
    try {
      const email = loginToEmail(login)
      const { error } = await supabase.auth.updateUser({ email, password })
      if (error) throw error
      const { data } = await supabase.auth.getUser()
      if (data.user?.email !== email) {
        throw new Error(
          'Supabase nie przypisało loginu od razu, bo wymaga potwierdzenia e-mailem. Wyłącz „Confirm email” w Authentication → Sign In / Providers → Email i spróbuj ponownie.',
        )
      }
      onDone()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nadaj gościowi konto" onClose={busy ? undefined : onClose}>
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.lead}>
          Twoje światy zostają. Z loginem i hasłem wrócisz do nich z każdej przeglądarki i każdego urządzenia.
        </p>
        <TextField
          id="claim_login"
          label="Login"
          required
          autoFocus
          autoComplete="username"
          maxLength={LOGIN_MAX}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
        <TextField
          id="claim_password"
          label="Hasło"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          id="claim_again"
          label="Powtórz hasło"
          type="password"
          required
          minLength={PASSWORD_MIN}
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <StoneButton type="submit" variant="gold" block disabled={busy}>
          {busy ? 'Chwila…' : 'Załóż konto'}
        </StoneButton>
        <p className={styles.lead}>Hasło zapamiętaj: bez e-maila nie ma jak go odzyskać.</p>
      </form>
    </Modal>
  )
}
