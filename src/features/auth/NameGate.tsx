import { useState, type FormEvent } from 'react'
import { rpc } from '@/lib/supabase'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, EngravedTitle, TextField, Notice } from '@/components/ui/Primitives'
import styles from './auth.module.css'

export function NameGate({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rpc('set_display_name', { p_name: name })
      await onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.center}>
      <MarblePanel className={styles.card}>
        <EngravedTitle>Jak cię zwą, śmiertelniku?</EngravedTitle>
        <p className={styles.lead}>To imię gracza. Imię bóstwa nadasz przy stole, osobno dla każdej gry.</p>
        <form className={styles.form} onSubmit={submit}>
          <TextField
            id="display_name"
            label="Imię gracza"
            required
            maxLength={40}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <StoneButton type="submit" variant="gold" block disabled={busy || !name.trim()}>
            Wejdź do świątyni
          </StoneButton>
        </form>
      </MarblePanel>
    </div>
  )
}
