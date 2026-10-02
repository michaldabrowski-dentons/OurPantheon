import { useState, type DragEvent, type FormEvent } from 'react'
import { rpc, supabase } from '@/lib/supabase'
import type { PaletteColumn, PaletteEntry } from '@/lib/types'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, Notice, inputClass } from '@/components/ui/Primitives'
import styles from './palette.module.css'

const COLUMNS: { key: PaletteColumn; title: string; hint: string; tone: string }[] = [
  {
    key: 'yes',
    title: 'Tak',
    hint: 'Rzeczy, które MOGŁYBY pojawić się w grze. Każdy dodaje je do świata swobodnie.',
    tone: styles.yes,
  },
  {
    key: 'veil',
    title: 'Zasłony',
    hint: 'Prawdopodobnie istnieją, ale nie będą w centrum uwagi. Gdy się pojawią: cięcie do czerni.',
    tone: styles.veil,
  },
  {
    key: 'no',
    title: 'Nie',
    hint: 'Zakazane. Nie pojawi się w grze w ogóle, nigdy, i nie istnieje w świecie.',
    tone: styles.no,
  },
]

const DRAG_TYPE = 'application/x-palette-entry'

export function PalettePage({ embedded }: { embedded?: boolean }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const palette = useGameStore((s) => s.palette)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<PaletteColumn, string>>({ yes: '', veil: '', no: '' })
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<PaletteColumn | null>(null)

  async function add(column: PaletteColumn, e: FormEvent) {
    e.preventDefault()
    const text = drafts[column].trim()
    if (!text || !me) return
    setError(null)
    const { error } = await supabase.from('palette_entries').insert({ game_id: game.id, player_id: me.id, column, text })
    if (error) setError(error.message)
    else setDrafts((d) => ({ ...d, [column]: '' }))
  }

  async function remove(id: string) {
    const { error } = await supabase.from('palette_entries').delete().eq('id', id)
    if (error) setError(error.message)
  }

  /** Moves one of my entries to another column (the row stays, only its column changes). */
  async function move(id: string, column: PaletteColumn) {
    const entry = palette.find((e) => e.id === id)
    if (!entry || entry.column === column || entry.player_id !== me?.id) return
    setError(null)
    const { error } = await supabase.from('palette_entries').update({ column }).eq('id', id)
    if (error) setError(error.message)
  }

  function onDragStart(e: DragEvent, entry: PaletteEntry) {
    e.dataTransfer.setData(DRAG_TYPE, entry.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragging(entry.id)
  }

  function onDrop(e: DragEvent, column: PaletteColumn) {
    e.preventDefault()
    const id = e.dataTransfer.getData(DRAG_TYPE) || dragging
    setOver(null)
    setDragging(null)
    if (id) void move(id, column)
  }

  async function next() {
    setError(null)
    try {
      await rpc('open_creation', { p_game_id: game.id })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const perPlayer = players.map((p) => ({ p, n: palette.filter((e) => e.player_id === p.id).length }))
  const maxN = Math.max(0, ...perPlayer.map((x) => x.n))

  return (
    <div className={styles.page} style={embedded ? { padding: 0 } : undefined}>
      {!embedded && (
        <header className={styles.head}>
          <h1 className="engraved-dark marble-text">Paleta</h1>
          <p>
            Po kolei, po jednej rzeczy do jednej kolumny. Omówcie powody. Nikt nie powinien dodać o więcej niż dwie
            rzeczy więcej niż ktokolwiek inny. Nie więcej niż kwadrans. Swoje wpisy możesz przeciągać między kolumnami;
            wszystko zapisuje się w świecie i w grze wraca pod przyciskiem Paleta nad ołtarzem.
          </p>
        </header>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className={styles.columns}>
        {COLUMNS.map((col) => (
          <MarblePanel
            key={col.key}
            className={[styles.column, col.tone, over === col.key ? styles.dropOver : ''].join(' ')}
            onDragOver={(e) => {
              if (!dragging) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (over !== col.key) setOver(col.key)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (over === col.key) setOver(null)
            }}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <h2 className="engraved">{col.title}</h2>
            <p className={styles.hint}>{col.hint}</p>
            <div className={['recess', styles.list].join(' ')}>
              {palette
                .filter((e) => e.column === col.key)
                .map((e) => {
                  const author = players.find((p) => p.id === e.player_id)
                  const mine = e.player_id === me?.id
                  return (
                    <div
                      key={e.id}
                      className={[styles.entry, mine ? styles.entryMine : '', dragging === e.id ? styles.entryDragging : ''].join(' ')}
                      draggable={mine}
                      onDragStart={mine ? (ev) => onDragStart(ev, e) : undefined}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                      title={mine ? 'Przeciągnij do innej kolumny' : undefined}
                    >
                      {mine && <span className={styles.grip} aria-hidden>⋮⋮</span>}
                      <p>
                        {e.text}
                        <small>{playerLabel(author, profiles)}</small>
                      </p>
                      {mine && (
                        <button className={styles.remove} onClick={() => remove(e.id)} aria-label="Usuń">
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              {dragging && over === col.key && <div className={styles.dropHint}>upuść tutaj</div>}
            </div>
            <form className={styles.add} onSubmit={(e) => add(col.key, e)}>
              <input
                className={inputClass}
                placeholder="Dodaj…"
                maxLength={120}
                value={drafts[col.key]}
                onChange={(e) => setDrafts((d) => ({ ...d, [col.key]: e.target.value }))}
                aria-label={`Nowy wpis: ${col.title}`}
              />
              <StoneButton type="submit" size="sm" disabled={!drafts[col.key].trim()}>
                Dodaj
              </StoneButton>
            </form>
          </MarblePanel>
        ))}
      </div>

      {!embedded && (
        <footer className={styles.footer}>
          <div className={styles.counts}>
            {perPlayer.map(({ p, n }) => (
              <span key={p.id} style={maxN - n > 2 ? { color: 'var(--gold-light)' } : undefined}>
                {playerLabel(p, profiles)}: <b>{n}</b>
              </span>
            ))}
          </div>
          {isHost ? (
            <StoneButton variant="gold" size="lg" onClick={next}>
              Dalej: Stwarzanie Świata
            </StoneButton>
          ) : (
            <span className={styles.wait}>Gospodarz otworzy Stwarzanie Świata, gdy paleta będzie gotowa.</span>
          )}
        </footer>
      )}
    </div>
  )
}
