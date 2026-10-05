import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { rpc } from '@/lib/supabase'
import { WORLD_QUESTIONS, OPTION_LETTERS, PROLOGUE_OPENING, prologueLine, type WorldQuestion } from '@/data/worldQuestions'
import { godPortraitSrc } from '@/features/pantheon/GodPortrait'
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

interface Tally {
  /** the answer that wins now, or null when nobody voted */
  winner: Choice | null
  /** the answers sharing the top count (more than one means a tie) */
  leaders: Choice[]
  /** the tie was broken by the host's own vote */
  byHost: boolean
  /** a tie the host has not broken yet */
  open: boolean
}

/** Most votes wins. On a tie the host's vote decides; until the host votes among the tied, the tie stays open. */
function tally(q: WorldQuestion, options: CreationOption[], votes: CreationVote[], hostPlayerId: string | null): Tally {
  const choices = choicesFor(q, options)
  const mine = votes.filter((v) => v.question_key === q.key)
  const count = (c: Choice) => mine.filter((v) => v.option_key === c.key).length
  const top = Math.max(0, ...choices.map(count))
  if (top === 0) return { winner: null, leaders: [], byHost: false, open: false }
  const leaders = choices.filter((c) => count(c) === top)
  if (leaders.length === 1) return { winner: leaders[0], leaders, byHost: false, open: false }
  const hostVote = mine.find((v) => v.player_id === hostPlayerId)?.option_key
  const hostPick = leaders.find((c) => c.key === hostVote)
  if (hostPick) return { winner: hostPick, leaders, byHost: true, open: false }
  return { winner: leaders[0], leaders, byHost: false, open: true }
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
  const host = players.find((p) => p.user_id === game.host_id) ?? null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // the host turns the pages; everyone reads the same one (games.settings.creation_step over Realtime)
  const total = WORLD_QUESTIONS.length
  const step = Math.max(0, Math.min(total, Number(game.settings?.creation_step ?? 0) || 0))
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

  const turnTo = (s: number) => call('set_creation_step', { p_game_id: game.id, p_step: Math.max(0, Math.min(total, s)) })

  const settled = WORLD_QUESTIONS.map((q) => ({ q, t: tally(q, options, votes, host?.id ?? null) }))
  const lines = [PROLOGUE_OPENING, ...settled.filter((s) => s.t.winner).map((s) => prologueLine(s.q, s.t.winner!))]
  const openTies = settled.filter((s) => s.t.open).length

  async function begin() {
    await call('start_game', { p_game_id: game.id, p_prologue: lines.map((text) => ({ text })) })
  }

  const q = WORLD_QUESTIONS[Math.min(step, total - 1)]

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className="engraved-dark marble-text">Stwarzanie Świata</h1>
        <p>
          Zanim padnie pierwsze Słowo, ustalcie, czym jest świat. Jedno pytanie na raz, jeden głos na bóstwo.
          {isHost ? ' Ty przewracasz karty.' : ` Karty przewraca ${godLabel(host)}.`} Przy remisie rozstrzyga głos gospodarza.
        </p>
        <button className={styles.linkBtn} onClick={() => navigate('/')}>← Wszystkie światy</button>
      </header>

      <ol className={styles.steps} aria-label="Pytania">
        {WORLD_QUESTIONS.map((wq, i) => {
          const t = settled[i].t
          const mine = votes.some((v) => v.question_key === wq.key && v.player_id === me?.id)
          const cls = [styles.stepDot, i === step ? styles.stepNow : '', t.winner ? styles.stepVoted : '', mine ? styles.stepMine : '', t.open ? styles.stepTie : ''].join(' ')
          return (
            <li key={wq.key}>
              {isHost ? (
                <button type="button" className={cls} onClick={() => turnTo(i)} disabled={busy} title={wq.title} aria-current={i === step ? 'step' : undefined}>
                  {i + 1}
                </button>
              ) : (
                <span className={cls} title={wq.title} aria-current={i === step ? 'step' : undefined}>
                  {i + 1}
                </span>
              )}
            </li>
          )
        })}
        <li>
          {isHost ? (
            <button type="button" className={[styles.stepDot, styles.stepEnd, atSummary ? styles.stepNow : ''].join(' ')} onClick={() => turnTo(total)} disabled={busy} title="Prolog">
              ✦
            </button>
          ) : (
            <span className={[styles.stepDot, styles.stepEnd, atSummary ? styles.stepNow : ''].join(' ')} title="Prolog">
              ✦
            </span>
          )}
        </li>
      </ol>

      {error && <Notice tone="error">{error}</Notice>}

      {!atSummary ? (
        <QuestionPanel
          key={q.key}
          q={q}
          index={step}
          choices={choicesFor(q, options)}
          tally={settled[step].t}
          votes={votes.filter((v) => v.question_key === q.key)}
          players={players}
          hostId={host?.id ?? null}
          me={me}
          busy={busy}
          onVote={(optionKey) => call('vote_creation', { p_game_id: game.id, p_question_key: q.key, p_option_key: optionKey })}
          onAdd={(label) => call('add_creation_option', { p_game_id: game.id, p_question_key: q.key, p_label: label })}
        />
      ) : (
        <MarblePanel className={styles.summary}>
          <h2 className="engraved">Prolog</h2>
          <p className={styles.summaryHint}>Tak zapisze się w Świętej Księdze. Pytania bez głosów pomijamy.</p>
          {openTies > 0 && (
            <Notice>
              {openTies === 1 ? 'Jedno pytanie ma remis' : `${openTies} pytania mają remis`}: rozstrzyga głos gospodarza. Póki go nie ma, liczy się wcześniejsza odpowiedź.
            </Notice>
          )}
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
        {isHost ? (
          <StoneButton size="sm" disabled={busy || step === 0} onClick={() => turnTo(step - 1)}>
            ← Wstecz
          </StoneButton>
        ) : (
          <span />
        )}
        <span className={styles.navCount}>{atSummary ? 'Prolog' : `${step + 1} / ${total}`}</span>
        {isHost ? (
          <StoneButton size="sm" variant={atSummary ? 'stone' : 'gold'} disabled={busy || atSummary} onClick={() => turnTo(step + 1)}>
            {step === total - 1 ? 'Do Prologu →' : 'Dalej →'}
          </StoneButton>
        ) : (
          <span className={styles.navWait}>{atSummary ? '' : 'Gospodarz przewraca karty'}</span>
        )}
      </div>
    </div>
  )
}

function QuestionPanel({
  q,
  index,
  choices,
  tally: t,
  votes,
  players,
  hostId,
  me,
  busy,
  onVote,
  onAdd,
}: {
  q: WorldQuestion
  index: number
  choices: Choice[]
  tally: Tally
  votes: CreationVote[]
  players: Player[]
  hostId: string | null
  me: Player | null
  busy: boolean
  onVote: (optionKey: string) => void
  onAdd: (label: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const myVote = votes.find((v) => v.player_id === me?.id)?.option_key ?? null

  async function add(e: FormEvent) {
    e.preventDefault()
    const d = draft.trim()
    if (!d) return
    await onAdd(d)
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
          const isWinner = t.winner?.key === c.key && !t.open
          const tied = t.open && t.leaders.some((l) => l.key === c.key)
          const author = c.custom ? players.find((p) => p.id === c.custom!.created_by) : null
          return (
            <button
              key={c.key}
              type="button"
              className={[styles.option, on ? styles.optionOn : '', isWinner ? styles.optionLead : '', tied ? styles.optionTie : ''].join(' ')}
              aria-pressed={on}
              disabled={busy}
              onClick={() => onVote(c.key)}
            >
              <span className={styles.letter}>{OPTION_LETTERS[i] ?? '·'}</span>
              <span className={styles.optionText}>
                {c.label}
                {author && <small>dopisało bóstwo {godLabel(author)}</small>}
              </span>
              <span className={styles.optionRight}>
                {isWinner && (
                  <span className={styles.winMark} title={t.byHost ? 'Remis rozstrzygnął głos gospodarza.' : 'Ta odpowiedź wygrywa.'}>
                    <Laurel /> {t.byHost ? 'wygrywa głosem gospodarza' : 'wygrywa'}
                  </span>
                )}
                {tied && <span className={[styles.winMark, styles.tieMark].join(' ')}>remis</span>}
                <span className={styles.voters} aria-label={`${voters.length} głosów`}>
                  {voters.map((p) => (
                    <img key={p.id} src={godPortraitSrc(p.domain_key)} alt="" title={godLabel(p) + (p.id === hostId ? ' (gospodarz)' : '')} className={p.id === hostId ? styles.hostVoter : ''} />
                  ))}
                  {voters.length > 0 && <b>{voters.length}</b>}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {t.open && <p className={styles.tieNote}>Remis. Rozstrzyga głos gospodarza: niech {hostId === me?.id ? 'twój' : 'jego'} głos padnie na jedną z remisujących odpowiedzi.</p>}

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

function Laurel() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21V9M12 13c-4 0-7-3-7-7 4 0 7 3 7 7zM12 13c4 0 7-3 7-7-4 0-7 3-7 7z" />
    </svg>
  )
}
