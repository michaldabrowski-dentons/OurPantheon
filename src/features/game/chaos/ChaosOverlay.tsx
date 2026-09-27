import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { rpc } from '@/lib/supabase'
import { CHAOS_BY_KEY, chaosCategoryByDie, type ChaosCategoryKey } from '@/data/chaosTables'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, selectCurrentChaosDraw, playerLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Dice2d6, MarblePanel, TextArea } from '@/components/ui/Primitives'
import styles from './chaos.module.css'

const FLIP = { duration: 1.15, ease: [0.72, 0, 0.22, 1] as [number, number, number, number] }

export function ChaosOverlay({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const draw = useGameStore(selectCurrentChaosDraw)
  const me = useGameStore(selectMyPlayer(user.id))
  const [busy, setBusy] = useState(false)
  const [flipped, setFlipped] = useState(Boolean(draw))
  const [dustKey, setDustKey] = useState(0)
  const reduce = useReducedMotion()

  // when a draw appears (from anyone), flip the card for everyone
  useEffect(() => {
    if (draw && !flipped) {
      setFlipped(true)
      setDustKey((k) => k + 1)
    }
  }, [draw, flipped])

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true)
    onError(null)
    try {
      await rpc(fn, args)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const revealer = players.find((p) => p.id === draw?.revealed_by)
  const iRevealed = !!draw && draw.revealed_by === me?.id
  const chosen = draw?.category_key ? CHAOS_BY_KEY[draw.category_key as ChaosCategoryKey] : null
  const entry = chosen && draw?.entry_index ? chosen.entries[draw.entry_index - 1] : null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Faza Chaosu">
      <div className={styles.stage}>
        <h2 className={['engraved-dark', 'gold-text', styles.stageTitle].join(' ')}>Faza Chaosu</h2>
        <p className={styles.stageSub}>
          {!draw && 'Bóstwa zasnęły. Świat toczy się sam: pogoda, wolna wola, nieokiełznana magia. Odwróć relikwię.'}
          {draw && !chosen && (iRevealed ? 'Wybierz, która kość wskazuje kategorię. Druga wskaże wpis.' : `${playerLabel(revealer, profiles)} wybiera kość…`)}
          {chosen && 'Odpowiedzcie na pytania, które wam odpowiadają. Wymyślajcie własne.'}
        </p>

        {!chosen && (
          <div className={styles.scene}>
            <motion.div
              className={styles.card}
              initial={false}
              animate={{ rotateY: flipped ? 180 : 0, y: flipped ? [0, -26, 0] : 0 }}
              transition={reduce ? { duration: 0 } : FLIP}
            >
              <div className={styles.edge} />
              <button
                type="button"
                className={[styles.face, styles.front].join(' ')}
                disabled={busy || flipped}
                onClick={() => call('reveal_chaos', { p_game_id: game.id })}
                aria-label="Odwróć Kartę Chaosu"
              >
                <Sigil />
                <span className={styles.frontLabel}>CHAOS</span>
              </button>
              <div className={[styles.face, styles.back].join(' ')}>
                <h3 className="engraved-dark">Kości Chaosu</h3>
                {draw ? (
                  <span className={styles.backDice}>
                    <Dice2d6 d1={draw.die1} d2={draw.die2} showTotal={false} animateKey={draw.id} />
                  </span>
                ) : (
                  <span className={styles.backDice}>…</span>
                )}
                <span className={styles.backHint}>Jedna kość to kategoria, druga to wpis.</span>
              </div>
            </motion.div>
            {!reduce && <Dust trigger={dustKey} />}
          </div>
        )}

        {draw && !chosen && iRevealed && (
          <div className={styles.choice}>
            {([1, 2] as const).map((which) => {
              const cat = chaosCategoryByDie(which === 1 ? draw.die1 : draw.die2)
              const idx = which === 1 ? draw.die2 : draw.die1
              const e = cat.entries[idx - 1]
              return (
                <button
                  key={which}
                  className={['marble', styles.choiceBtn].join(' ')}
                  disabled={busy}
                  onClick={() => call('choose_chaos_die', { p_game_id: game.id, p_category_die: which })}
                >
                  <small>kość {which} = kategoria</small>
                  <strong>{cat.name}</strong>
                  <span>
                    {idx}. {e.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {chosen && entry && draw && (
          <ChaosResult
            categoryName={chosen.name}
            categoryNumber={chosen.number}
            related={chosen.relatedActions}
            entryIndex={draw.entry_index!}
            title={entry.title}
            text={entry.text}
            questions={entry.questions}
            dice={[draw.die1, draw.die2]}
            notes={draw.resolution_notes}
            onNotes={(n) => rpc('set_chaos_notes', { p_game_id: game.id, p_notes: n }).catch((e) => onError((e as Error).message))}
          />
        )}

        <div className={styles.resultFoot}>
          <StoneButton variant="gold" size="lg" disabled={busy} onClick={() => call('end_chaos_phase', { p_game_id: game.id })}>
            {chosen ? 'Zakończ rundę' : draw ? 'Zakończ rundę bez wyboru' : 'Pomiń Chaos i zakończ rundę'}
          </StoneButton>
        </div>
        {!draw && <p className={styles.skip}>Każda runda w Erze {game.era} to {game.era === 1 ? 'tysiące lat' : game.era === 2 ? 'setki lat' : 'dekady'}. Chaos jest opcjonalny.</p>}
      </div>
    </div>
  )
}

function ChaosResult({
  categoryName,
  categoryNumber,
  related,
  entryIndex,
  title,
  text,
  questions,
  dice,
  notes,
  onNotes,
}: {
  categoryName: string
  categoryNumber: number
  related: string
  entryIndex: number
  title: string
  text: string
  questions: string[]
  dice: [number, number]
  notes: string
  onNotes: (n: string) => void
}) {
  const [local, setLocal] = useState(notes)
  const timer = useRef<number | null>(null)
  useEffect(() => setLocal(notes), [notes])

  function change(v: string) {
    setLocal(v)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onNotes(v), 700)
  }

  return (
    <MarblePanel material="parchment" className={styles.result}>
      <div className={styles.resultHead}>
        <span className={styles.resultCat}>
          {categoryNumber}. {categoryName} · wpis {entryIndex} · kości {dice[0]} i {dice[1]}
        </span>
        <h3 className={['engraved', styles.resultTitle].join(' ')}>{title}</h3>
      </div>
      <p className={styles.resultText}>{text}</p>
      <ul className={styles.questions}>
        {questions.map((q) => (
          <li key={q}>
            <span>{q}</span>
          </li>
        ))}
      </ul>
      <p className={styles.related}>Powiązane akcje Chaosu (bez Logos, niezwiązane z bóstwem): {related}</p>
      <TextArea id="chaos_notes" label="Co się wydarzyło (wspólne notatki)" value={local} onChange={(e) => change(e.target.value)} placeholder="Zapiszcie ustalenia sceny…" />
    </MarblePanel>
  )
}

function Dust({ trigger }: { trigger: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: `${trigger}-${i}`,
        x: (Math.random() - 0.5) * 420,
        y: -40 - Math.random() * 180,
        s: 0.5 + Math.random() * 1.6,
        d: 0.9 + Math.random() * 0.9,
        delay: 0.35 + Math.random() * 0.25,
      })),
    [trigger],
  )
  if (trigger === 0) return null
  return (
    <div className={styles.dust} aria-hidden>
      {motes.map((m) => (
        <motion.span
          key={m.id}
          className={styles.mote}
          initial={{ opacity: 0, x: 0, y: 0, scale: m.s }}
          animate={{ opacity: [0, 0.9, 0], x: m.x, y: m.y, scale: m.s * 1.6 }}
          transition={{ duration: m.d, delay: m.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

function Sigil() {
  return (
    <svg className={styles.sigil} viewBox="0 0 200 200" aria-hidden>
      <g fill="none" stroke="#4b3407" strokeWidth="5" strokeLinecap="round">
        <circle cx="100" cy="100" r="78" />
        <circle cx="100" cy="100" r="58" strokeDasharray="6 10" />
        <path d="M100 30v140M30 100h140M50 50l100 100M150 50L50 150" strokeWidth="3" />
        <path d="M100 62c22 0 38 16 38 38s-16 38-38 38-38-16-38-38" strokeWidth="7" />
        <circle cx="100" cy="100" r="12" fill="#4b3407" />
      </g>
    </svg>
  )
}

