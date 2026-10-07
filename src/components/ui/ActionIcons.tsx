// Line-art sigils for the sixteen actions, drawn as if carved into the marble tile.
// Real shapes (circle, ellipse, path), no zero-length arc tricks: those render as dots or gaps.
import type { ReactNode } from 'react'
import type { ActionKey } from '@/data/actions'

const SHAPES: Record<ActionKey, ReactNode> = {
  // ---------- Terraformacja ----------
  // two peaks under a small sun
  shape_land: (
    <>
      <path d="M2 19 8 9l4 6 3-4 7 8H2z" />
      <circle cx="17.5" cy="5.5" r="1.8" />
    </>
  ),
  // a bolt striking down
  catastrophe: (
    <>
      <path d="M13 2 6 13h5l-1.5 9L18 10h-5l1-8z" />
      <path d="M3 21l2.5-2.5M21 21l-2.5-2.5" />
    </>
  ),
  // the sun with all its rays
  great_miracle: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),

  // ---------- Tworzenie Życia ----------
  // a paw print: the pad and four toes
  create_creature: (
    <>
      <path d="M12 20.5c-3.2 0-5.6-1.7-5.6-3.9 0-1.6 1.3-2.5 2.5-3.6 1.1-1 1.9-2.3 3.1-2.3s2 1.3 3.1 2.3c1.2 1.1 2.5 2 2.5 3.6 0 2.2-2.4 3.9-5.6 3.9z" />
      <ellipse cx="5.6" cy="9.8" rx="1.6" ry="2.2" transform="rotate(-22 5.6 9.8)" />
      <ellipse cx="18.4" cy="9.8" rx="1.6" ry="2.2" transform="rotate(22 18.4 9.8)" />
      <ellipse cx="9.4" cy="5.2" rx="1.6" ry="2.2" transform="rotate(-8 9.4 5.2)" />
      <ellipse cx="14.6" cy="5.2" rx="1.6" ry="2.2" transform="rotate(8 14.6 5.2)" />
    </>
  ),
  // a head lit from within
  create_sapient: (
    <>
      <path d="M12 3a6.5 6.5 0 0 1 6.5 6.5c0 2.2-1.1 3.5-2.5 4.8V18H8v-3.7C6.6 13 5.5 11.7 5.5 9.5A6.5 6.5 0 0 1 12 3z" />
      <path d="M9.5 21h5" />
      <path d="M12 7.2l2.3 2.6-2.3 2.6-2.3-2.6z" />
    </>
  ),
  // a double helix
  change_creature: (
    <>
      <path d="M8 3c5 3.5 5 14.5 0 18" />
      <path d="M16 3c-5 3.5-5 14.5 0 18" />
      <path d="M8.7 7h6.6M7.3 12h9.4M8.7 17h6.6" />
    </>
  ),

  // ---------- Śmiertelnicy ----------
  // three houses on a street
  create_civilization: (
    <>
      <path d="M3 21V11l3-2 3 2v10M9 21V6l4-3 4 3v15M17 21v-8l4 2v6M2 21h20" />
      <path d="M13 9h2M13 13h2M13 17h2" />
    </>
  ),
  // a city growing: a pyramid of dots
  develop_civilization: (
    <>
      <circle cx="12" cy="6" r="1.7" />
      <circle cx="8.5" cy="12" r="1.7" />
      <circle cx="15.5" cy="12" r="1.7" />
      <circle cx="5" cy="18" r="1.7" />
      <circle cx="12" cy="18" r="1.7" />
      <circle cx="19" cy="18" r="1.7" />
    </>
  ),
  // footprints leading away
  exodus: (
    <>
      <path d="M4 20l5-4M13 14l5-4" />
      <ellipse cx="6" cy="11" rx="1.8" ry="2.6" transform="rotate(-20 6 11)" />
      <ellipse cx="11" cy="7" rx="1.8" ry="2.6" transform="rotate(-20 11 7)" />
      <ellipse cx="16" cy="19" rx="1.8" ry="2.6" transform="rotate(-20 16 19)" />
      <path d="M17 4l3 3-3 3" />
    </>
  ),
  // a hand turning a head
  convert: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M6 21c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <path d="M17.5 4.5a5 5 0 0 1 2.5 4.5M20 9l-1.6-1.2M20 9l1.2-1.6" />
    </>
  ),
  // crossed swords
  holy_war: (
    <>
      <path d="M4 4l13 13M17 4 4 17" />
      <path d="M14 17l3 3M7 17l-3 3M17 14l3 3M4 7l3-3" />
    </>
  ),
  // a species spreading: two paths from one point
  migrate: (
    <>
      <circle cx="6" cy="12" r="2" />
      <path d="M8 12h4l4-5M12 12l4 5" />
      <path d="M14 7h3v3M14 17h3v-3" />
    </>
  ),

  // ---------- Działania Awatara ----------
  // a figure under a halo
  create_avatar: (
    <>
      <circle cx="12" cy="9.5" r="3" />
      <path d="M6 22c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5" />
      <ellipse cx="12" cy="3.6" rx="4.2" ry="1.4" />
    </>
  ),
  // a command sent up
  command_avatar: (
    <>
      <path d="M12 21V9M7 13l5-5 5 5M5 21h14" />
      <circle cx="12" cy="4" r="1.6" />
    </>
  ),
  // two blades crossed over a halo
  avatar_duel: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M5 21 15 9M19 21 9 9" />
      <path d="M4 17l4 4M20 17l-4 4" />
    </>
  ),
  // an eye over a flame: what is to come
  prophecy: (
    <>
      <path d="M3 10s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z" />
      <circle cx="12" cy="10" r="2.2" />
      <path d="M12 16c-2 2-2 4 0 5 2-1 2-3 0-5z" />
    </>
  ),
  // an ankh
  resurrect_avatar: (
    <>
      <circle cx="12" cy="6.5" r="3.5" />
      <path d="M12 10v12M6.5 15h11" />
      <path d="M4 8l2 1M20 8l-2 1" />
    </>
  ),
}

export function ActionIcon({ k, size = 28, className }: { k: ActionKey; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {SHAPES[k]}
    </svg>
  )
}
