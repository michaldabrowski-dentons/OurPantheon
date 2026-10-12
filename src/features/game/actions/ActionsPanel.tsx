import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ACTION_BY_KEY, ACTION_GROUPS, actionsByCategory, standingAvatars, type ActionDef, type ActionGroupKey, type Era } from '@/data/actions'
import { rpc } from '@/lib/supabase'
import { TransferDialog } from '../TransferDialog'
import { useUser } from '@/features/auth/AuthGate'
import { useGameStore, selectMyPlayer, selectPendingContest, playerLabel } from '@/store/useGameStore'
import { actionArt } from '@/data/actionArt'
import { useWorld } from '../map/useWorld'
import { useMapMode } from '../map/mapMode'
import { ActionDialog } from './ActionDialog'
import styles from '../game.module.css'

/**
 * The whole left colonnade is the choice of a word: two fold-out books, the words of the sky and the
 * words of the avatar (greyed out and folded while no avatar of mine stands on the map), each with its
 * categories of marble tiles.
 */
export function ActionsPanel() {
  const { user } = useUser()
  const game = useGameStore((s) => s.game)!
  const me = useGameStore(selectMyPlayer(user.id))
  const pending = useGameStore(selectPendingContest)
  const world = useWorld()
  const [open, setOpen] = useState<ActionDef | null>(null)
  const [preset, setPreset] = useState<{ avatarId?: string } | undefined>(undefined)
  const requested = useMapMode((s) => s.requested)
  const request = useMapMode((s) => s.request)
  const [transfer, setTransfer] = useState(false)
  const players = useGameStore((s) => s.players)
  const profiles = useGameStore((s) => s.profiles)
  const [folded, setFolded] = useState<Record<ActionGroupKey, boolean>>({ divine: false, avatar: false })

  const era = game.era as Era
  const versePending = !!game.verse_pending_by
  const myTurn = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting && !pending && !versePending
  // the words of the avatar need one standing on the map
  const avatarStands = standingAvatars(world, me).length > 0
  const groups = useMemo(() => actionsByCategory(era), [era])

  // the window of a word closes by itself when the Gods phase ends or the turn moves on:
  // nothing in it could be paid for any more, and the Chaos curtain must not hang behind it
  const turnLive = game.phase === 'gods' && !!me && game.current_turn_player_id === me.id && !me.is_resting && !pending
  useEffect(() => {
    if (open && !turnLive) setOpen(null)
  }, [open, turnLive])

  // the map asked for a word (a click on my avatar): open it with that avatar already chosen
  useEffect(() => {
    if (!requested) return
    request(null)
    if (!myTurn) return
    setPreset({ avatarId: requested.avatarId })
    setOpen(ACTION_BY_KEY[requested.key])
  }, [requested, request, myTurn])

  let tile = 0

  const transferOff = game.phase === 'rolling' || !!pending || !me || me.logos < 1
  const transferStone = (
    <button
      key="transfer"
      className={['marble', 'emerge-from-dark', styles.stone, transferOff ? styles.stoneOff : ''].join(' ')}
      style={{ '--emerge-delay': `${60 + tile++ * 30}ms` } as CSSProperties}
      disabled={transferOff}
      onClick={() => setTransfer(true)}
      title="Oddaj część swoich Słów innemu bóstwu. Bez mapy, bez wersetu."
    >
      <span className={styles.stoneIcon}>
        <img src={actionArt('transfer', 'thumb')} alt="" loading="lazy" width={66} height={66} />
      </span>
      <span className={styles.stoneBody}>
        <span className={styles.stoneName}>Przekazanie Logos</span>
        <span className={styles.stoneMeta}>
          <span className={styles.stoneReq}>dowolna liczba Słów</span>
        </span>
      </span>
      <span className={styles.stoneCosts}>
        <span className={styles.stoneCost}>?</span>
      </span>
    </button>
  )

  return (
    <aside className={styles.actions}>
      <p className={styles.actionsHint}>
        {pending ? 'Trwa starcie. Słowa czekają na odpowiedź obrońcy.' : versePending ? 'Święta Księga czeka na werset. Dopiero potem padnie następne słowo.' : myTurn ? 'Twoja tura. Wybierz słowo i wskaż na mapie, co czynisz.' : 'W każdej kategorii od najtańszego słowa do najdroższego.'}
      </p>

      {ACTION_GROUPS.map((group) => {
        const groupOff = group.key === 'avatar' && !avatarStands
        const isOpen = !folded[group.key] && !groupOff
        const cats = groups.filter((g) => g.category.group === group.key)
        const count = cats.reduce((n, g) => n + g.actions.length, 0) + (group.key === 'divine' ? 1 : 0)
        return (
          <section key={group.key} className={styles.actionsGroup} aria-label={group.name}>
            <button
              type="button"
              className={['marble', styles.groupHead, groupOff ? styles.groupHeadOff : ''].join(' ')}
              aria-expanded={isOpen}
              onClick={() => { if (!groupOff) setFolded((f) => ({ ...f, [group.key]: !f[group.key] })) }}
              title={groupOff ? 'Słowa awatara wypowiada twój awatar stojący na mapie. Najpierw go ześlij.' : group.hint}
            >
              <span className={[styles.groupChevron, isOpen ? styles.groupChevronOpen : ''].join(' ')} aria-hidden />
              <span className={styles.groupTitle}>
                <b className="engraved">{group.name}</b>
                <small>{groupOff ? 'Brak awatara na mapie. Ześlij go, by te słowa ożyły.' : group.hint}</small>
              </span>
              <span className={styles.groupCount}>{count}</span>
            </button>
            {isOpen && (
              <div className={styles.groupBody}>
                {cats.map(({ category, actions }) => (
                  <section key={category.key} className={styles.actionsCat} aria-label={category.name}>
                    <h3 className="carved-glow">{category.name}</h3>
                    {actions.map((a) => {
                      const cost = a.costs[era - 1]
                      const affordable = !!me && me.logos >= cost + (a.distance ? 1 : 0)
                      const reqOk = !a.requirement || a.requirement.check(world, me)
                      const off = !myTurn || !affordable || !reqOk
                      const delay = 60 + tile++ * 30
                      return (
                        <button
                          key={a.key}
                          className={['marble', 'emerge-from-dark', styles.stone, off ? styles.stoneOff : ''].join(' ')}
                          style={{ '--emerge-delay': `${delay}ms` } as CSSProperties}
                          disabled={off}
                          onClick={() => setOpen(a)}
                          title={!reqOk && a.requirement ? `Najpierw: ${a.requirement.text}.` : !affordable ? `Za mało Logos: potrzeba ${cost}${a.distance ? ' plus dystans' : ''}.` : a.summary}
                        >
                          <span className={styles.stoneIcon}>
                            <img src={actionArt(a.key, 'thumb')} alt="" loading="lazy" width={66} height={66} />
                          </span>
                          <span className={styles.stoneBody}>
                            <span className={styles.stoneName}>{a.name}</span>
                            {(a.requirement || a.roll || a.distance || a.contested) && (
                              <span className={styles.stoneMeta}>
                                {a.requirement && (
                                  <span className={[styles.stoneReq, reqOk ? '' : styles.reqUnmet].join(' ')}>{a.requirement.text}</span>
                                )}
                                {a.roll && !a.contested && <span className={styles.stoneRoll}>2k6 + atrybut</span>}
                                {a.contested && <span className={styles.stoneRoll}>rzut sporny</span>}
                                {a.distance && <span className={styles.stoneRoll}>1 Logos za heks</span>}
                              </span>
                            )}
                          </span>
                          {/* the three Eras side by side: the current one in gold, the others small and grey */}
                          <span className={styles.stoneCosts}>
                            {([1, 2, 3] as Era[]).map((e) => (
                              <span
                                key={e}
                                className={[
                                  e === era ? styles.stoneCost : styles.stoneOther,
                                  e === era && !affordable ? styles.costOver : '',
                                ].join(' ')}
                              >
                                {a.distance ? Math.max(1, a.costs[e - 1]) : a.costs[e - 1]}
                              </span>
                            ))}
                          </span>
                        </button>
                      )
                    })}
                    {category.key === 'pantheon' && transferStone}
                  </section>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {open && me && <ActionDialog action={open} me={me} preset={preset} onClose={() => { setOpen(null); setPreset(undefined) }} />}
      {transfer && me && (
        <TransferDialog
          onClose={() => setTransfer(false)}
          max={me.logos}
          targets={players.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, label: playerLabel(p, profiles) }))}
          onSubmit={async (to, amount) => {
            try {
              await rpc('transfer_logos', { p_game_id: game.id, p_to_player_id: to, p_amount: amount })
            } finally {
              setTransfer(false)
            }
          }}
        />
      )}
    </aside>
  )
}
