import type { ActionKey } from './actions'

/**
 * Painted plates for the words, in public/actions: 512px squares and 160px thumbnails, one per key
 * (cut from the paintings in src/img). 'transfer' is the plate of Przekazanie Logos.
 */
export function actionArt(key: ActionKey | 'transfer', size: 'full' | 'thumb' = 'full'): string {
  return `/actions/${key}${size === 'thumb' ? '-thumb' : ''}.jpg`
}

export const FREE_ACTION_ICON = '/actions/free_action.png'
