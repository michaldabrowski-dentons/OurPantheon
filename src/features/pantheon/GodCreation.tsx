import { useEffect, useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { AttrKey, DomainKey, GodGender, Player } from '@/lib/types'
import { isComplete } from '@/data/pantheon'
import { StoneButton } from '@/components/ui/StoneButton'
import { EngravedTitle, TextField, TextArea, Notice } from '@/components/ui/Primitives'
import { GenderPicker } from '@/features/lobby/GenderPicker'
import { PlaybookClock, DomainBlurb } from './PlaybookClock'
import { AttributeChoice } from './AttributeChoice'
import { AttributeScores } from './AttributeScores'
import styles from './pantheon.module.css'

/**
 * Making a god in the lobby: a name, the clock of domains, which of the two mains comes first,
 * where the extra +1 goes, how the book speaks of the god, and whatever else the player wants to say.
 */
export function GodCreation({ me, gameId }: { me: Player | null; gameId: string }) {
  const [godName, setGodName] = useState('')
  const [godDesc, setGodDesc] = useState('')
  const [gender, setGender] = useState<GodGender>('m')
  const [domain, setDomain] = useState<DomainKey | null>(null)
  const [primary, setPrimary] = useState<AttrKey | null>(null)
  const [bonus, setBonus] = useState<AttrKey | null>(null)
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (me && !dirty) {
      setGodName(me.god_name)
      setGodDesc(me.god_description ?? '')
      setGender(me.god_gender ?? 'm')
      setDomain(me.domain_key ?? null)
      setPrimary(me.attr_primary ?? null)
      setBonus(me.attr_bonus ?? null)
      setNotes(me.god_notes ?? '')
    }
  }, [me, dirty])

  const touch = () => setDirty(true)

  function pickDomain(d: DomainKey) {
    if (d === domain) return
    setDomain(d)
    setPrimary(null)
    setBonus(null)
    touch()
  }

  const complete = isComplete(domain, primary, bonus)
  const missing = !domain ? 'Wybierz domenę na zegarze.' : !primary ? 'Rozstrzygnij, który z dwóch atrybutów jest pierwszy.' : !bonus ? 'Dodaj +1 do jednego z pozostałych czterech.' : null

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await rpc('set_god', {
        p_game_id: gameId,
        p_god_name: godName,
        p_god_description: godDesc,
        p_god_gender: gender,
        p_domain_key: domain,
        p_attr_primary: primary,
        p_attr_bonus: bonus,
        p_god_notes: notes,
      })
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.creation}>
      <EngravedTitle as="h3" align="left">Twoje bóstwo</EngravedTitle>
      <div className={styles.nameRow}>
        <TextField
          id="god_name"
          label="Imię bóstwa"
          placeholder="np. Jahwe, Loki, Atena"
          maxLength={60}
          value={godName}
          onChange={(e) => {
            setGodName(e.target.value)
            touch()
          }}
        />
        <GenderPicker
          value={gender}
          name={godName}
          onChange={(g) => {
            setGender(g)
            touch()
          }}
        />
      </div>

      <p className={styles.sectionTitle}>Domena</p>
      <PlaybookClock value={domain} gender={gender} onChange={pickDomain} />
      <DomainBlurb domain={domain} gender={gender} />

      {domain && (
        <>
          <p className={styles.sectionTitle}>Atrybuty</p>
          <AttributeChoice
            domain={domain}
            primary={primary}
            bonus={bonus}
            onChange={(p, b) => {
              setPrimary(p)
              setBonus(b)
              touch()
            }}
          />
          <AttributeScores domain={domain} primary={primary} bonus={bonus} />
        </>
      )}

      <TextField
        id="god_desc"
        label="Czym jest twoje bóstwo (krótko, na tabliczkę)"
        placeholder="np. bóg piorunów i przysiąg"
        maxLength={120}
        value={godDesc}
        onChange={(e) => {
          setGodDesc(e.target.value)
          touch()
        }}
      />
      <TextArea
        id="god_notes"
        label="Dodatkowe informacje"
        placeholder="Skąd przyszło, czego pragnie, czego się boi, jak wygląda jego kult."
        rows={4}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          touch()
        }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <StoneButton variant="lapis" onClick={save} disabled={busy || !dirty || !complete}>
        {busy ? 'Zapisywanie…' : dirty ? 'Zapisz bóstwo' : 'Zapisano'}
      </StoneButton>
      {missing && dirty && <p className={styles.missing}>{missing}</p>}
    </div>
  )
}
