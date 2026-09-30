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
  // wind over the land
  change_biome: (
    <>
      <path d="M3 9h9.5a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 14h13a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M4 19h6" />
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
  // scales
  change_civilization: (
    <>
      <path d="M12 3v18M8 21h8M5 7h14" />
      <path d="M5 7l-3 6.5a3.2 3.2 0 0 0 6 0zM19 7l-3 6.5a3.2 3.2 0 0 0 6 0z" />
    </>
  ),
  // a banner on its pole
  create_faction: (
    <>
      <path d="M6 3v18M4 21h4" />
      <path d="M6 4h12l-3 4.5 3 4.5H6" />
    </>
  ),
  // a temple front
  create_orthodoxy: (
    <>
      <path d="M2 8 12 3l10 5H2z" />
      <path d="M4 8v9M9 8v9M15 8v9M20 8v9M2 20h20M3 17h18" />
    </>
  ),
  // two arrows chasing each other
  change_faction: (
    <>
      <path d="M4 10a8 8 0 0 1 13.7-3.3L20 9M20 4v5h-5" />
      <path d="M20 14a8 8 0 0 1-13.7 3.3L4 15M4 20v-5h5" />
    </>
  ),
  // an eye that sees from above
  command_followers: (
    <>
      <path d="M2 13s4-6 10-6 10 6 10 6-4 6-10 6S2 13 2 13z" />
      <circle cx="12" cy="13" r="2.5" />
      <path d="M12 2v2.2M6.3 3.6l1.1 1.9M17.7 3.6l-1.1 1.9" />
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
