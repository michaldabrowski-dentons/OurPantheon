// Accounts are login + password. Supabase Auth still wants an e-mail address under the hood,
// so the login is turned into a synthetic address on a reserved domain (RFC 2606: never deliverable).
// No mail is ever sent: "Confirm email" must be off in the Supabase project.

export const LOGIN_DOMAIN = 'panteon.invalid'
export const LOGIN_MIN = 3
export const LOGIN_MAX = 24
export const PASSWORD_MIN = 6

/** Lowercase ASCII slug of a login: "Michał_7" -> "michal_7". Used only for the synthetic address. */
export function loginSlug(login: string): string {
  return login
    .trim()
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function loginToEmail(login: string): string {
  return `${loginSlug(login)}@${LOGIN_DOMAIN}`
}

/** Returns a Polish error message, or null when the login is fine. */
export function validateLogin(login: string): string | null {
  const t = login.trim()
  if (t.length < LOGIN_MIN) return `Login musi mieć co najmniej ${LOGIN_MIN} znaki.`
  if (t.length > LOGIN_MAX) return `Login może mieć najwyżej ${LOGIN_MAX} znaki.`
  if (!/^[\p{L}\p{N}._-]+$/u.test(t)) return 'Login: litery, cyfry, kropka, myślnik i podkreślenie, bez spacji.'
  if (!/^[a-z0-9._-]+$/.test(loginSlug(t))) return 'Login może zawierać tylko litery alfabetu łacińskiego.'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków.`
  return null
}

/** Turns Supabase Auth errors into plain Polish. Unknown messages pass through. */
export function authErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Zły login albo hasło.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ten login jest już zajęty.'
  if (m.includes('email not confirmed')) {
    return 'Konto czeka na potwierdzenie e-mailem, a tu maili nie ma. W Supabase wyłącz „Confirm email” (Authentication → Sign In / Providers → Email).'
  }
  if (m.includes('anonymous sign-ins are disabled')) {
    return 'Wejście gości jest wyłączone. W Supabase włącz „Allow anonymous sign-ins” (Authentication → Sign In / Providers).'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Rejestracja jest wyłączona w Supabase.'
  if (m.includes('password should be at least') || m.includes('password is too short')) {
    return `Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków.`
  }
  if (m.includes('weak password') || m.includes('password should contain')) return 'Supabase uznało to hasło za zbyt słabe. Dodaj cyfry albo znaki.'
  if (m.includes('is invalid') && m.includes('email')) {
    return `Supabase odrzuciło ten login (adres na domenie ${LOGIN_DOMAIN}). Zmień LOGIN_DOMAIN w src/lib/login.ts na inną nazwę.`
  }
  if (m.includes('rate limit')) return 'Za dużo prób naraz. Odczekaj chwilę i spróbuj ponownie.'
  if (m.includes('failed to fetch') || m.includes('networkerror')) return 'Brak połączenia z Supabase.'
  return raw
}
