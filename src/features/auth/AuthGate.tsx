import { createContext, useContext, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/lib/types'
import { supabaseConfigured } from '@/lib/supabase'
import { TempleLogin } from './TempleLogin'
import { NameGate } from './NameGate'
import { MarblePanel, EngravedTitle, Notice } from '@/components/ui/Primitives'
import styles from './auth.module.css'

interface AuthCtx {
  user: User
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)
/** Exposed for the dev preview route only. */
export const AuthContext = Ctx

export function useUser(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUser outside AuthGate')
  return v
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, profile, loading, refreshProfile } = useAuth()

  if (!supabaseConfigured) {
    return (
      <div className={styles.center}>
        <MarblePanel className={styles.card}>
          <EngravedTitle>Świątynia nie ma fundamentów</EngravedTitle>
          <p className={styles.lead}>
            Brakuje kluczy Supabase. Skopiuj <code>.env.example</code> do <code>.env.local</code>, wpisz
            <code> VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code>, a potem uruchom aplikację ponownie.
          </p>
          <Notice>Migracje z katalogu <code>supabase/migrations</code> uruchom w SQL Editorze projektu, po kolei.</Notice>
        </MarblePanel>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <p className="engraved">Ogień na ołtarzu się rozpala…</p>
      </div>
    )
  }

  if (!user) return <TempleLogin />

  if (!profile || !profile.display_name.trim()) {
    return <NameGate onDone={refreshProfile} />
  }

  return <Ctx.Provider value={{ user, profile, refreshProfile }}>{children}</Ctx.Provider>
}
