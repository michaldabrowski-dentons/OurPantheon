import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { WORLD_QUESTIONS, OPTION_LETTERS, PROLOGUE_OPENING, prologueLine, type WorldQuestion } from '@/data/worldQuestions'
import { frescoSrc } from '@/data/frescoes'
import type { CreationOption, CreationVote, Player } from '@/lib/types'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, godLabel } from '@/store/useGameStore'
import { StoneButton } from '@/components/ui/StoneButton'
import { MarblePanel, Notice, inputClass } from '@/components/ui/Primitives'
import styles from './creation.module.css'

interface Choice {
  key: string
  label: string
  custom?: CreationOption
}

function choicesFor(q: WorldQuestion, options: CreationOption[]): Choice[] {
  return [
    ...q.options.map((o) => ({ key: o.key, label: o.label })),
    ...options.filter((o) => o.question_key === q.key).map((o) => ({ key: o.id, label: o.label, custom: o })),
  ]
}

/** The answer with most votes; ties go to the earlier option. Nothing voted, nothing settled. */
function winner(q: WorldQuestion, options: CreationOption[], votes: CreationVote[]): Choice | null {
  let best: Choice | null = null
  let bestN = 0
  for (const c of choicesFor(q, options)) {
    const n = votes.filter((v) => v.question_key === q.key && v.option_key === c.key).length
    if (n > bestN) {
      best = c
      bestN = n
    }
  }
  return best
}

export function WorldCreationPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const players = useGameStore((s) => s.players)
  const options = useGameStore((s) => s.creationOptions)
  const votes = useGameStore((s) => s.creationVotes)
  const me = useGameStore(selectMyPlayer(user.id))
  const isHost = game.host_id === user.id
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // each god walks through the questions at their own pace; the votes are shared
  const [step, setStep] = useState(0)
  const total = WORLD_QUESTIONS.length
  const atSummary = step >= total

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await rpc(fn, args)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const settled = WORLD_QUESTIONS.map((q) => ({ q, w: winner(q, options, votes) }))
  const lines = [PROLOGUE_OPENING, ...settled.filter((s) => s.w).map((s) => prologueLine(s.q, s.w!))]

  async function begin() {
    await call('start_game', { p_game_id: game.id, p_prologue: lines.map((text) => ({ text })) })
  }

  const q = WORLD_QUESTIONS[Math.min(step, total - 1)]

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className="engraved-dark gold-text">Stwarzanie Świata</h1>
        <p>Zanim padnie pierwsze Słowo, ustalcie, czym jest świat. Jedno pytanie na raz, jeden głos na bóstwo.</p>
        <button className={styles.linkBtn} onClick={() => navigate('/')}>← Wszystkie światy</button>
      </header>

      <ol className={styles.steps} aria-label="Pytania">
        {WORLD_QUESTIONS.map((wq, i) => {
          const voted = votes.some((v) => v.question_key === wq.key)
          const mine = votes.some((v) => v.question_key === wq.key && v.player_id === me?.id)
          return (
            <li key={wq.key}>
              <button
                type="button"
                className={[styles.stepDot, i === step ? styles.stepNow : '', voted ? styles.stepVoted : '', mine ? styles.stepMine : ''].join(' ')}
                onClick={() => setStep(i)}
                title={wq.title}
                aria-current={i === step ? 'step' : undefined}
              >
                {i + 1}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            className={[styles.stepDot, styles.stepEnd, atSummary ? styles.stepNow : ''].join(' ')}
            onClick={() => setStep(total)}
            title="Prolog"
          >
            ✦
          </button>
        </li>
      </ol>

      {error && <Notice tone="error">{error}</Notice>}

      {!atSummary ? (
        <QuestionPanel
          key={q.key}
          q={q}
          index={step}
          choices={choicesFor(q, options)}
          votes={votes.filter((v) => v.question_key === q.key)}
          players={players}
          me={me}
          busy={busy}
          onVote={(optionKey) => call('vote_creation', { p_game_id: game.id, p_question_key: q.key, p_option_key: optionKey })}
          onAdd={(label) => call('add_creation_option', { p_game_id: game.id, p_question_key: q.key, p_label: label })}
        />
      ) : (
        <MarblePanel className={styles.summary}>
          <h2 className="engraved">Prolog</h2>
          <p className={styles.summaryHint}>Tak zapisze się w Kronice. Pytania bez głosów pomijamy.</p>
          <p className={styles.prologue}>{lines.join(' ')}</p>
          {isHost ? (
            <StoneButton variant="gold" size="lg" disabled={busy} onClick={begin}>
              Rozpocznij Pierwszą Erę
            </StoneButton>
          ) : (
            <span className={styles.wait}>Gospodarz rozpocznie Pierwszą Erę, gdy świat będzie ustalony.</span>
          )}
        </MarblePanel>
      )}

      <div className={styles.nav}>
        <StoneButton size="sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          ← Wstecz
        </StoneButton>
        <span className={styles.navCount}>
          {atSummary ? 'Prolog' : `${step + 1} / ${total}`}
        </span>
        <StoneButton size="sm" variant={atSummary ? 'stone' : 'gold'} disabled={atSummary} onClick={() => setStep((s) => Math.min(total, s + 1))}>
          {step === total - 1 ? 'Do Prologu →' : 'Dalej →'}
        </StoneButton>
      </div>
    </div>
  )
}

function QuestionPanel({
  q,
  index,
  choices,
  votes,
  players,
  me,
  busy,
  onVote,
  onAdd,
}: {
  q: WorldQuestion
  index: number
  choices: Choice[]
  votes: CreationVote[]
  players: Player[]
  me: Player | null
  busy: boolean
  onVote: (optionKey: string) => void
  onAdd: (label: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const myVote = votes.find((v) => v.player_id === me?.id)?.option_key ?? null
  const top = Math.max(0, ...choices.map((c) => votes.filter((v) => v.option_key === c.key).length))

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = draft.trim()
    if (!t) return
    await onAdd(t)
    setDraft('')
  }

  return (
    <MarblePanel className={styles.question}>
      <div className={styles.qHead}>
        <span className={styles.qNum}>{index + 1}</span>
        <div>
          <h2 className="engraved">{q.title}</h2>
          {q.hint && <p className={styles.qHint}>{q.hint}</p>}
        </div>
      </div>

      <div className={styles.options}>
        {choices.map((c, i) => {
          const voters = votes.filter((v) => v.option_key === c.key).map((v) => players.find((p) => p.id === v.player_id)).filter(Boolean) as Player[]
          const on = myVote === c.key
          const leading = voters.length > 0 && voters.length === top
          const author = c.custom ? players.find((p) => p.id === c.custom!.created_by) : null
          return (
            <button
              key={c.key}
              type="button"
              className={[styles.option, on ? styles.optionOn : '', leading ? styles.optionLead : ''].join(' ')}
              aria-pressed={on}
              disabled={busy}
              onClick={() => onVote(c.key)}
            >
              <span className={styles.letter}>{OPTION_LETTERS[i] ?? '·'}</span>
              <span className={styles.optionText}>
                {c.label}
                {author && <small>dopisało bóstwo {godLabel(author)}</small>}
              </span>
              <span className={styles.voters} aria-label={`${voters.length} głosów`}>
                {voters.map((p) => (
                  <img key={p.id} src={frescoSrc(p.avatar_key)} alt="" title={godLabel(p)} />
                ))}
                {voters.length > 0 && <b>{voters.length}</b>}
              </span>
            </button>
          )
        })}
      </div>

      <form className={styles.add} onSubmit={add}>
        <input
          className={inputClass}
          placeholder="Własna odpowiedź, krótko…"
          maxLength={140}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Własna odpowiedź: ${q.title}`}
        />
        <StoneButton type="submit" size="sm" disabled={busy || !draft.trim()}>
          Dopisz
        </StoneButton>
      </form>
    </MarblePanel>
  )
}
