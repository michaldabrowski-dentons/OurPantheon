import { useState } from 'react'
import { createPortal } from 'react-dom'
import { rpc } from '@/lib/supabase'
import type { Entity, EntityKind, GodGender } from '@/lib/types'
import { DOMAIN_BY_KEY, domainTitle } from '@/data/pantheon'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, godLabel, selectEntitiesOf } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Modal, TextField, TextArea, Notice } from '@/components/ui/Primitives'
import { GenderPicker, GenderSign } from '@/features/lobby/GenderPicker'
import { kindLabel } from '@/features/game/actions/ActionDialog'
import { GodPortrait } from './GodPortrait'
import { AttributeScores } from './AttributeScores'
import styles from './pantheon.module.css'

const WORK_ORDER: { kind: EntityKind; title: string }[] = [
  { kind: 'avatar', title: 'Awatary' },
  { kind: 'civilization', title: 'Cywilizacje' },
  { kind: 'creature', title: 'Istoty' },
]

/** A god's sheet: the painting, the domain, the six attributes, the god's own words, and its works. */
export function GodSheet({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { user } = useUser()
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId) ?? null)
  const works = useGameStore(selectEntitiesOf(playerId))
  const [editing, setEditing] = useState(false)
  if (!player) return null
  const mine = player.user_id === user.id
  const domain = player.domain_key ? DOMAIN_BY_KEY[player.domain_key] : null

  // the plaques live in a bar with its own stacking context, so the sheet is hung on the body
  return createPortal(
    <Modal
      title={
        <>
          <GenderSign kind={player.god_gender ?? 'm'} size={18} className={styles.titleSign} /> {godLabel(player)}
        </>
      }
      onClose={onClose}
      wide
    >
      <div className={styles.sheet}>
        <div className={styles.sheetTop}>
          <div className={styles.sheetLeft}>
            <GodPortrait domain={player.domain_key} size={240} round={false} aura alt={domainTitle(player.domain_key, player.god_gender)} />
            <h3 className={['engraved', styles.blurbTitle].join(' ')}>{domainTitle(player.domain_key, player.god_gender)}</h3>
            {domain ? <p className={styles.blurbExamples}>{domain.description}</p> : <p className={styles.blurbEmpty}>To bóstwo nie wybrało jeszcze domeny.</p>}
          </div>

          <div className={styles.sheetRight}>
            <AttributeScores domain={player.domain_key} primary={player.attr_primary} bonus={player.attr_bonus} />
            {editing && mine ? (
              <SheetEditor
                playerId={player.id}
                gameId={player.game_id}
                initial={{ name: player.god_name, desc: player.god_description ?? '', gender: player.god_gender ?? 'm', notes: player.god_notes ?? '' }}
                keys={{ domain: player.domain_key, primary: player.attr_primary, bonus: player.attr_bonus, color: player.god_color }}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <div className={styles.sheetHead}>
                  <p className={styles.sheetDesc}>{player.god_description || <i>Bez opisu.</i>}</p>
                  {mine && (
                    <StoneButton size="sm" onClick={() => setEditing(true)}>
                      Edytuj
                    </StoneButton>
                  )}
                </div>
                {player.god_notes ? <p className={styles.sheetNotes}>{player.god_notes}</p> : null}
              </>
            )}
          </div>
        </div>

        <div className={styles.works}>
          <p className={styles.sectionTitle}>Dzieła bóstwa</p>
          {works.length === 0 && <p className={styles.worksEmpty}>Jeszcze nic nie stworzyło.</p>}
          {WORK_ORDER.map(({ kind, title }) => {
            const list = works.filter((w) => w.entity.kind === kind)
            if (list.length === 0) return null
            return (
              <div key={kind} className={styles.worksGroup}>
                <h5>{title}</h5>
                {list.map(({ entity, role }) => (
                  <WorkRow key={entity.id} entity={entity} co={role === 'co_creator'} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>,
    document.body,
  )
}

function WorkRow({ entity, co }: { entity: Entity; co: boolean }) {
  return (
    <div className={[styles.work, entity.status !== 'active' ? styles.workDead : ''].join(' ')}>
      <b>{entity.emoji ? `${entity.emoji} ` : ''}{entity.name}</b>
      <small>
        {kindLabel(entity.kind)}
        {co ? ' · współtwórca' : ''}
        {entity.status === 'dead' ? (entity.kind === 'avatar' ? ' · poległ' : ' · wymarły') : entity.status === 'destroyed' ? ' · ruina' : ''}
      </small>
    </div>
  )
}

function SheetEditor({
  gameId,
  initial,
  keys,
  onDone,
}: {
  playerId: string
  gameId: string
  initial: { name: string; desc: string; gender: GodGender; notes: string }
  keys: { domain: string | null; primary: string | null; bonus: string | null; color: string | null }
  onDone: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [desc, setDesc] = useState(initial.desc)
  const [gender, setGender] = useState<GodGender>(initial.gender)
  const [notes, setNotes] = useState(initial.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await rpc('set_god', {
        p_game_id: gameId,
        p_god_name: name,
        p_god_description: desc,
        p_god_gender: gender,
        p_domain_key: keys.domain,
        p_attr_primary: keys.primary,
        p_attr_bonus: keys.bonus,
        p_god_notes: notes,
        p_god_color: keys.color,
      })
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className={styles.creation}>
      <TextField id="s_name" label="Imię bóstwa" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <GenderPicker value={gender} name={name} onChange={setGender} />
      <TextField id="s_desc" label="Czym jest twoje bóstwo (krótko, na tabliczkę)" maxLength={120} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <TextArea id="s_notes" label="Dodatkowe informacje" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <p className={styles.missing}>Domenę i atrybuty ustala się w przedsionku, przed grą.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <StoneButton onClick={onDone} disabled={busy}>
          Anuluj
        </StoneButton>
        <StoneButton variant="gold" disabled={busy} onClick={save}>
          Zapisz
        </StoneButton>
      </div>
    </div>
  )
}
