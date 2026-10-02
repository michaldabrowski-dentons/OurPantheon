import type { ActionKey } from './actions'

/** Painted plates for the sixteen words, in public/actions: 512px squares and 160px thumbnails. */
export function actionArt(key: ActionKey, size: 'full' | 'thumb' = 'full'): string {
  return `/actions/${key}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

export const FREE_ACTION_ICON = '/actions/free_action.png'
