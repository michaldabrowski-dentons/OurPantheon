// The signs creatures, sapient peoples and avatars wear on the map. A sign belongs to one thing per
// game (a unique index in the database), so a used one is greyed out in the picker. The strings must
// stay byte for byte as they are here: the database compares them literally.
import type { Entity } from '@/lib/types'

export const SAPIENT_EMOJI: string[] = [
  '👱🏻', '👱🏼', '👱🏽', '👱🏾', '👱🏿',
  '🧑🏻‍🦰', '🧑🏼‍🦰', '🧑🏽‍🦰', '🧑🏾‍🦰', '🧑🏿‍🦰',
  '🧔🏻', '🧔🏼', '🧔🏽', '🧔🏾', '🧔🏿',
  '👱🏻‍♀️', '👱🏼‍♀️', '👱🏽‍♀️', '👱🏾‍♀️', '👱🏿‍♀️',
  '🙇🏻‍♂️', '🙇🏼‍♂️', '🙇🏽‍♂️', '🙇🏾‍♂️', '🙇🏿‍♂️',
  '🧙🏻', '🧙🏼', '🧙🏽', '🧙🏾', '🧙🏿',
  '🧙🏻‍♂️', '🧙🏼‍♂️', '🧙🏽‍♂️', '🧙🏾‍♂️', '🧙🏿‍♂️',
  '🧑🏻‍🌾', '🧑🏼‍🌾', '🧑🏽‍🌾', '🧑🏾‍🌾', '🧑🏿‍🌾',
  '🧕🏻', '🧕🏼', '🧕🏽', '🧕🏾', '🧕🏿',
  '🤴🏻', '🤴🏼', '🤴🏽', '🤴🏾', '🤴🏿',
  '🧚🏻‍♂️', '🧚🏼‍♂️', '🧚🏽‍♂️', '🧚🏾‍♂️', '🧚🏿‍♂️',
  '🧝🏻‍♀️', '🧝🏼‍♀️', '🧝🏽‍♀️', '🧝🏾‍♀️', '🧝🏿‍♀️',
  '🧝🏻', '🧝🏼', '🧝🏽', '🧝🏾', '🧝🏿',
  '🧛🏻‍♂️', '🧛🏼‍♂️', '🧛🏽‍♂️', '🧛🏾‍♂️', '🧛🏿‍♂️',
  '🧜🏻‍♂️', '🧜🏼‍♂️', '🧜🏽‍♂️', '🧜🏾‍♂️', '🧜🏿‍♂️',
  '🧞', '🧞‍♂️', '🧞‍♀️', '🧌', '👹', '👺', '👻', '🧟', '🧟‍♂️', '🧟‍♀️',
  '🦁', '🐻', '🐭', '🐱', '🐰', '🦊', '🐯', '🐵', '🐻‍❄️', '🐺', '🐸', '🐷', '👽',
]

export const CREATURE_EMOJI: string[] = [
  '🐉', '🐲', '🦄', '🦖', '🦕', '🐙', '🦑', '🦇', '🦉', '🐦‍⬛', '🐈‍⬛', '🐍', '🕷️', '🦂', '🐀',
  '🐗', '🦌', '🫎', '🦡', '🦫', '🦦', '🐿️', '🦔', '🐕', '🦮', '🐕‍🦺', '🐩', '🐈', '🐇', '🐁',
  '🦅', '🐦', '🕊️', '🦆', '🪿', '🦢', '🦚', '🦜', '🐓', '🐔', '🦃',
  '🐴', '🐎', '🫏', '🐫', '🐪', '🦙', '🐘', '🦣', '🦏', '🦛', '🐂', '🐃', '🐄', '🐮', '🐖', '🐏', '🐑', '🐐',
  '🐊', '🐢', '🦈', '🐬', '🐋', '🐳', '🐟', '🐠', '🐡', '🦀', '🦞', '🦐', '🦭', '🪼',
  '🐅', '🐆', '🦍', '🦧', '🐒', '🦓', '🦒', '🦘',
  '🐛', '🦋', '🐌', '🐞', '🐜', '🪲', '🪳', '🦟', '🪰', '🪱', '🐝',
]

/** avatars walk the map too; their signs are their own */
export const AVATAR_EMOJI: string[] = [
  '🗿', '👼', '🧙', '🧝', '🦸', '🦹', '🧞', '👁️', '🔥', '⚡', '🌟', '🌙', '☀️', '🌪️', '🗡️', '🛡️', '🏹', '🪬', '🪄', '🔱', '🪽', '🕯️', '🧿', '🪶',
]

/** the signs already worn in this game */
export function usedEmoji(entities: Entity[]): Set<string> {
  const used = new Set<string>()
  for (const e of entities) if (e.emoji) used.add(e.emoji)
  return used
}
