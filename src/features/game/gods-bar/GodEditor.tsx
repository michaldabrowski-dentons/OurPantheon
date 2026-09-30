import { useState } from 'react'
import { rpc } from '@/lib/supabase'
import type { GodGender, Player } from '@/lib/types'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, Notice } from '@/components/ui/Primitives'
import { FrescoPicker } from '@/features/lobby/FrescoPicker'
import { GenderPicker } from '@/features/lobby/GenderPicker'

/** Everything about my god, editable mid-game: name, what it is a god of, how the book speaks of it, its fresco. */
export function GodEditor({ me, onClose }: { me: Player; onClose: () => void }) {
  const [name, setName] = useState(me.god_name)
  const [desc, setDesc] = useState(me.god_description ?? '')
  const [gender, setGender] = useState<GodGender>(me.god_gender ?? 'n')
  const [avatar, setAvatar] = useState(me.avatar_key)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await rpc('set_god', { p_game_id: me.game_id, p_god_name: name, p_avatar_key: avatar, p_god_description: desc, p_god_gender: gender })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Twoje bóstwo" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <TextField id="g_name" label="Imię bóstwa" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          id="g_desc"
          label="Czym jest twoje bóstwo (krótko)"
          placeholder="np. bogini rzek, cierpliwości i powodzi"
          maxLength={120}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <GenderPicker value={gender} onChange={setGender} name={name} />
        <div>
          <span className="engraved" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Fresk</span>
          <FrescoPicker value={avatar} onChange={setAvatar} size={56} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <StoneButton onClick={onClose}>Anuluj</StoneButton>
          <StoneButton variant="gold" disabled={busy} onClick={save}>
            Zapisz
          </StoneButton>
        </div>
      </div>
    </Modal>
  )
}
