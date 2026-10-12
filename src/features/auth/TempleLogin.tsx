import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, loginToEmail, validateLogin, validatePassword, LOGIN_MAX, PASSWORD_MIN } from '@/lib/login'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, TextField, Notice } from '@/components/ui/Primitives'
import styles from './auth.module.css'

type Mode = 'signin' | 'signup'

export function TempleLogin() {
  const [mode, setMode] = useState<Mode>('signin')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState<'form' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setAgain('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const bad = validateLogin(login) ?? validatePassword(password)
    if (bad) return setError(bad)
    if (mode === 'signup' && again !== password) return setError('Hasła się różnią.')
    setBusy('form')
    try {
      const email = loginToEmail(login)
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: login.trim() } },
        })
        if (error) throw error
        // With confirmations on, Supabase answers a taken login with a user that has no identities.
        if (data.user && data.user.identities?.length === 0) throw new Error('User already registered')
        if (!data.session) throw new Error('Email not confirmed')
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const signup = mode === 'signup'

  return (
    <div className={[styles.center, styles.wall].join(' ')}>
      <MarblePanel className={styles.card}>
        <header className={styles.templeHead}>
          <h1 className="engraved">O BOGOWIE!</h1>
          <p>Gra o bogach, którzy stwarzają świat. Wspólny stół dla dwóch do sześciu bóstw.</p>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Wejście">
          <button
            type="button"
            role="tab"
            aria-selected={!signup}
            className={[styles.tab, !signup ? styles.tabOn : ''].join(' ')}
            onClick={() => switchMode('signin')}
          >
            Zaloguj
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signup}
            className={[styles.tab, signup ? styles.tabOn : ''].join(' ')}
            onClick={() => switchMode('signup')}
          >
            Zarejestruj
          </button>
        </div>

        <form className={styles.form} onSubmit={submit}>
          <TextField
            id="login"
            label="Login"
            required
            autoFocus
            autoComplete="username"
            maxLength={LOGIN_MAX}
            placeholder={signup ? 'to będzie też twoje imię gracza' : ''}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <TextField
            id="password"
            label="Hasło"
            type="password"
            required
            minLength={PASSWORD_MIN}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signup && (
            <TextField
              id="password_again"
              label="Powtórz hasło"
              type="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <StoneButton type="submit" variant="gold" size="lg" block disabled={busy !== null}>
            {busy === 'form' ? 'Chwila…' : signup ? 'Załóż konto i wejdź' : 'Wejdź do świątyni'}
          </StoneButton>
          <p className={styles.lead}>
            {signup
              ? `Bez e-maila. Login to litery, cyfry, kropka, myślnik lub podkreślenie; hasło co najmniej ${PASSWORD_MIN} znaków. Zapamiętaj je: nie ma jak go odzyskać.`
              : 'Bez e-maila. Wpisz login i hasło, które podałeś przy rejestracji.'}
          </p>
        </form>
      </MarblePanel>
    </div>
  )
}
