import { Fragment, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { rpc } from '@/lib/supabase'
import { CHAOS_BY_KEY, chaosCategoryByDie, type ChaosCategoryKey } from '@/data/chaosTables'
import { KIND_ACC } from '@/data/chronicle'
import { frescoSrc } from '@/data/frescoes'
import type { Entity, EntityKind, Player } from '@/lib/types'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, selectCurrentChaosDraw, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { Dice2d6, MarblePanel, FrescoFrame, inputClass } from '@/components/ui/Primitives'
import { kindLabel } from '../actions/ActionDialog'
import styles from './chaos.module.css'

const FLIP = { duration: 1.15, ease: [0.72, 0, 0.22, 1] as [number, number, number, number] }

export function ChaosOverlay({ onError }: { onError: (m: string | null) => void }) {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const entities = useGameStore((s) => s.entities)
  const log = useGameStore((s) => s.log)
  const draw = useGameStore(selectCurrentChaosDraw)
  const me = useGameStore(selectMyPlayer(user.id))
  const [busy, setBusy] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [dustKey, setDustKey] = useState(0)
  const reduce = useReducedMotion()

  // every new card (first, redraw, one more) flips for everyone
  const drawId = draw?.id ?? null
  useEffect(() => {
    if (!drawId) {
      setFlipped(false)
      return
    }
    setFlipped(false)
    const t = window.setTimeout(() => {
      setFlipped(true)
      setDustKey((k) => k + 1)
    }, 80)
    return () => window.clearTimeout(t)
  }, [drawId])

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

  // Who answers which question: going round the table, starting with the god who revealed the card.
  // The god after the last question points at whom the card concerns, when it concerns someone.
  const { answerers, subjectChooser } = useMemo(() => {
    if (!entry) return { answerers: [] as Player[], subjectChooser: null as Player | null }
    const seated = [...players].sort((a, b) => a.seat_order - b.seat_order)
    const n = Math.max(1, seated.length)
    const start = Math.max(0, seated.findIndex((p) => p.id === draw?.revealed_by))
    return {
      answerers: entry.questions.map((_, i) => seated[(start + i) % n]),
      subjectChooser: seated[(start + entry.questions.length) % n] ?? null,
    }
  }, [entry, players, draw?.revealed_by])

  // answers of this card only: those logged after it was dealt
  const answers = log.filter((l) => l.action_key === 'chaos_answer' && l.round_number === game.round_number && (!draw || l.created_at >= draw.revealed_at))

  return (
    <div className={['veil-in', styles.overlay].join(' ')} role="dialog" aria-modal="true" aria-label="Faza Chaosu">
      <div className={['emerge-from-dark', styles.stage].join(' ')}>
        <h2 className={['engraved-dark', 'marble-text', styles.stageTitle].join(' ')}>Faza Chaosu</h2>
        <p className={styles.stageSub}>
          {!draw && 'Bóstwa zasnęły. Świat toczy się sam: pogoda, wolna wola, nieokiełznana magia. Odwróć relikwię.'}
          {draw && !chosen && 'Jedna kość wskazuje kategorię, druga wpis. Które będzie którym, rozstrzyga jedno bóstwo.'}
          {chosen && 'Każde pytanie ma swojego boga. Krótkie odpowiedzi trafiają prosto do Świętej Księgi.'}
        </p>

        {!chosen && (
          <div className={[styles.scene, draw ? styles.sceneDrawn : ''].join(' ')}>
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
                disabled={busy || !!draw}
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

        {draw && !chosen && (
          <>
            <div className={['obsidian-inlay', styles.chooser].join(' ')}>
              <FrescoFrame src={frescoSrc(revealer?.avatar_key)} alt="" size={48} round aura />
              <div>
                <span className={styles.chooserLabel}>Wybór należy do</span>
                <strong className="carved-glow">{godLabel(revealer)}</strong>
                <small>{iRevealed ? 'To ty. Wskaż, która kość jest kategorią.' : 'Czekamy na decyzję.'}</small>
              </div>
            </div>
            <p className={styles.choiceLead}>Jedno z dwóch zdarzeń. Które się wydarzy?</p>
            <div className={styles.choice}>
              {([1, 2] as const).map((which) => {
                const cat = chaosCategoryByDie(which === 1 ? draw.die1 : draw.die2)
                const idx = which === 1 ? draw.die2 : draw.die1
                const e = cat.entries[idx - 1]
                return (
                  <Fragment key={which}>
                    {which === 2 && (
                      <span className={styles.choiceOr} aria-hidden>
                        ALBO
                      </span>
                    )}
                    <button
                      className={['marble', styles.choiceBtn, !iRevealed ? styles.choiceLocked : ''].join(' ')}
                      disabled={busy || !iRevealed}
                      onClick={() => call('choose_chaos_die', { p_game_id: game.id, p_category_die: which, p_title: e.title, p_text: e.text })}
                    >
                      <small>kość {which} ({which === 1 ? draw.die1 : draw.die2}) jako kategoria</small>
                      <strong>{cat.name}</strong>
                      <span className={styles.choiceTitle}>
                        {idx}. {e.title}
                      </span>
                      <em className={styles.choiceText}>{e.text}</em>
                    </button>
                  </Fragment>
                )
              })}
            </div>
          </>
        )}

        {chosen && entry && draw && (
          <ChaosResult
            key={draw.id}
            categoryName={chosen.name}
            categoryNumber={chosen.number}
            related={chosen.relatedActions}
            entryIndex={draw.entry_index!}
            title={entry.title}
            text={entry.text}
            questions={entry.questions}
            answerers={answerers}
            subjectChooser={subjectChooser}
            answers={answers.map((a) => a.summary)}
            meId={me?.id ?? null}
            entities={entities}
            dice={[draw.die1, draw.die2]}
            notes={draw.resolution_notes}
            busy={busy}
            onAnswer={(q, a) => call('answer_chaos_question', { p_game_id: game.id, p_question: q, p_answer: a })}
            onSubject={(n) => call('set_chaos_notes', { p_game_id: game.id, p_notes: n })}
          />
        )}

        <div className={styles.resultFoot}>
          {draw && (
            <StoneButton size="sm" disabled={busy} onClick={() => call('reveal_chaos', { p_game_id: game.id })}
              title={chosen ? 'Jeszcze jedno zdarzenie Chaosu w tej rundzie.' : 'Ta karta nie ma sensu. Losujemy inną.'}>
              {chosen ? 'Kolejna Karta Chaosu' : 'Losuj jeszcze raz'}
            </StoneButton>
          )}
          <StoneButton variant="gold" size="lg" disabled={busy} onClick={() => call('end_chaos_phase', { p_game_id: game.id })}>
            {chosen ? 'Zakończ rundę' : draw ? 'Zakończ rundę bez wyboru' : 'Pomiń Chaos i zakończ rundę'}
          </StoneButton>
        </div>
        {!draw && <p className={styles.skip}>Każda runda w Erze {game.era} to {game.era === 1 ? 'tysiące lat' : game.era === 2 ? 'setki lat' : 'dekady'}. Chaos jest opcjonalny.</p>}
      </div>
    </div>
  )
}

/** Which kinds of thing a card is about, read off its text: "Frakcja opuszcza region" -> factions. */
function subjectKinds(text: string, title: string): EntityKind[] {
  const t = `${title} ${text}`.toLowerCase()
  const kinds: EntityKind[] = []
  if (/cywilizacj/.test(t)) kinds.push('civilization')
  if (/frakcj/.test(t)) kinds.push('faction')
  if (/religi/.test(t)) kinds.push('orthodoxy')
  if (/awatar/.test(t)) kinds.push('avatar')
  if (/istot|gatun/.test(t)) kinds.push('creature')
  return kinds
}

/** the Chronicle sentence for the chosen subject, told in the past like the rest of the book */
function subjectSentence(e: Entity): string {
  return `I spotkało to ${KIND_ACC[e.kind]} ${e.name}.`
}

function ChaosResult({
  categoryName,
  categoryNumber,
  related,
  entryIndex,
  title,
  text,
  questions,
  answerers,
  subjectChooser,
  answers,
  meId,
  entities,
  dice,
  notes,
  busy,
  onAnswer,
  onSubject,
}: {
  categoryName: string
  categoryNumber: number
  related: string
  entryIndex: number
  title: string
  text: string
  questions: string[]
  answerers: Player[]
  subjectChooser: Player | null
  answers: string[]
  meId: string | null
  entities: Entity[]
  dice: [number, number]
  notes: string
  busy: boolean
  onAnswer: (question: string, answer: string) => Promise<void>
  onSubject: (sentence: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  // a card about an existing faction, civilization, religion, avatar or creature gets one god to name it
  const kinds = subjectKinds(text, title)
  const candidates = entities.filter((e) => kinds.includes(e.kind) && e.status !== 'destroyed')
  const subject = candidates.find((e) => notes === subjectSentence(e)) ?? null
  const iChoose = !!subjectChooser && subjectChooser.id === meId

  return (
    <MarblePanel className={styles.result}>
      <div className={styles.resultHead}>
        <span className={styles.resultCat}>
          {categoryNumber}. {categoryName} · wpis {entryIndex} · kości {dice[0]} i {dice[1]}
        </span>
        <h3 className={['engraved', styles.resultTitle].join(' ')}>{title}</h3>
      </div>
      <p className={styles.resultText}>{text}</p>

      {candidates.length > 0 && (
        <div className={styles.question}>
          <div className={styles.questionWho}>
            <img src={frescoSrc(subjectChooser?.avatar_key)} alt="" width={30} height={30} />
            <span>
              <b>{godLabel(subjectChooser)}</b> wskazuje, kogo to dotyczy:
            </span>
          </div>
          {iChoose ? (
            <select
              className={[inputClass, styles.involve].join(' ')}
              value={subject?.id ?? ''}
              disabled={busy}
              onChange={(e) => {
                const ent = entities.find((x) => x.id === e.target.value)
                onSubject(ent ? subjectSentence(ent) : '')
              }}
              aria-label="Kogo dotyczy"
            >
              <option value="">wybierz…</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({kindLabel(e.kind)})
                </option>
              ))}
            </select>
          ) : subject ? (
            <p className={styles.answer}>
              {subject.name} ({kindLabel(subject.kind)})
            </p>
          ) : (
            <p className={styles.answerPending}>czeka na wskazanie…</p>
          )}
        </div>
      )}

      <ol className={styles.questions}>
        {questions.map((q, i) => {
          const god = answerers[i]
          const answered = answers.find((a) => a.startsWith(`${q} `))
          const mine = !!god && god.id === meId
          return (
            <li key={q} className={styles.question}>
              <div className={styles.questionWho}>
                <img src={frescoSrc(god?.avatar_key)} alt="" width={30} height={30} />
                <span>
                  <b>{godLabel(god)}</b> odpowiada:
                </span>
              </div>
              <div className={styles.questionText}>{q}</div>
              {answered ? (
                <p className={styles.answer}>{answered.slice(q.length + 1)}</p>
              ) : mine ? (
                <div className={styles.answerForm}>
                  <textarea
                    className={styles.answerInput}
                    placeholder="Jedno, dwa zdania."
                    value={drafts[i] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                  />
                  <StoneButton
                    variant="gold"
                    size="sm"
                    disabled={busy || !(drafts[i] ?? '').trim()}
                    onClick={() => onAnswer(q, (drafts[i] ?? '').trim())}
                  >
                    Zapisz w Świętej Księdze
                  </StoneButton>
                </div>
              ) : (
                <p className={styles.answerPending}>czeka na odpowiedź…</p>
              )}
            </li>
          )
        })}
      </ol>

      <p className={styles.related}>Powiązane akcje Chaosu (bez Logos, niezwiązane z bóstwem): {related}</p>
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
        <circle cx="100" cy="100" r="80" />
        <circle cx="100" cy="100" r="64" strokeDasharray="6 10" strokeWidth="3" />
        {/* the fire of Chaos */}
        <path d="M100 42c-6 22-30 34-30 62 0 20 14 36 30 36s30-16 30-36c0-14-8-22-12-32-4 10-10 14-10 14s2-24-8-44z" strokeWidth="7" strokeLinejoin="round" />
        <path d="M100 140c-8 0-14-7-14-16 0-10 10-16 10-26 6 8 18 14 18 26 0 9-6 16-14 16z" fill="#4b3407" stroke="none" />
      </g>
    </svg>
  )
}
