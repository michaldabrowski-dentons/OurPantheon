import type { ActionKey } from './actions'

/** the painted plates in public/actions keep their old file names; the new words borrow fitting ones */
const ART_FILE: Partial<Record<ActionKey, string>> = {
  develop_civilization: 'change_civilization',
  exodus: 'command_followers',
  convert: 'create_orthodoxy',
  avatar_duel: 'avatar_fight',
}

/** Painted plates for the words, in public/actions: 512px squares and 160px thumbnails. */
export function actionArt(key: ActionKey, size: 'full' | 'thumb' = 'full'): string {
  const file = ART_FILE[key] ?? key
  return `/actions/${file}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

export const FREE_ACTION_ICON = '/actions/free_action.png'
