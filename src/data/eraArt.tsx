import type { Era } from './actions'

/**
 * One drawing per Era, gold line on the void, drawn stroke by stroke when the Era opens.
 * Every path carries pathLength=1 so a single CSS rule can animate stroke-dashoffset from 1 to 0.
 * 1: the land takes shape (ridges, a volcano, the first sun).
 * 2: life breathes (a tree, a stag, birds, a fish under the wave, a serpent).
 * 3: civilizations rise (a ziggurat, towers, a road, people, a sail).
 */
export function EraArt({ era, className }: { era: Era; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 480 240',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (era === 1) {
    return (
      <svg {...common}>
        {/* the sun, first light over the rim of the world */}
        <circle cx="392" cy="64" r="26" pathLength={1} />
        <path d="M392 22v-10M422 34l7-7M362 34l-7-7M430 64h10M354 64h-10" pathLength={1} />
        {/* far ridges */}
        <path d="M0 176 40 140l32 22 38-46 36 36 30-30 44 48" pathLength={1} />
        <path d="M290 176l30-34 26 26 32-40 40 44 30-22 32 26" pathLength={1} />
        {/* the volcano */}
        <path d="M120 200 190 92h32l72 108" pathLength={1} />
        <path d="M190 92c8 6 16 6 24 0" pathLength={1} />
        <path d="M202 96v40l-8 20 10 22-6 22" pathLength={1} />
        <path d="M216 96l10 30-4 26 12 24" pathLength={1} />
        {/* smoke rising and drifting */}
        <path d="M204 84c-14-18 4-30-6-46 16 8 8 24 22 30" pathLength={1} />
        <path d="M218 76c-8-22 12-28 2-48 18 10 10 30 26 36" pathLength={1} />
        {/* the ground and its cracks */}
        <path d="M0 200h480" pathLength={1} />
        <path d="M60 200l14 12 10-6 12 14M300 200l-10 12 12 8M410 200l16 10-8 10" pathLength={1} />
        <path d="M0 222c40-6 80 8 120 0s80-8 120 0 80 8 120 0 80-8 120 0" pathLength={1} />
      </svg>
    )
  }
  if (era === 2) {
    return (
      <svg {...common}>
        {/* the tree */}
        <path d="M96 200v-70c0-20-10-30-22-40M96 130c0-22 12-34 28-44M96 150c-14-6-24-18-30-32M96 144c14-2 26-14 34-28" pathLength={1} />
        <path d="M40 90c10-30 40-40 60-30 24-14 56 0 62 26 22 6 26 34 8 48-6 20-40 24-54 8-24 10-54 0-58-24-20-4-26-20-18-28z" pathLength={1} />
        {/* the stag */}
        <path d="M250 200v-40c0-14 10-22 26-22h48c12 0 20 8 20 20v42" pathLength={1} />
        <path d="M344 158c10-4 16-14 16-26 0-10-6-16-14-16h-16M330 116l-8-12M330 116l10-14" pathLength={1} />
        <path d="M262 200v-30M312 200v-32M352 174v26" pathLength={1} />
        <path d="M300 118c-8-10-10-22-4-32 10 4 16 12 14 22M318 116c0-14 6-24 18-30-2 12 0 20 4 26" pathLength={1} />
        {/* birds */}
        <path d="M380 54c8-8 16-8 22 0 6-8 14-8 22 0M410 82c6-6 12-6 16 0 4-6 10-6 16 0M340 40c6-6 12-6 16 0 4-6 10-6 16 0" pathLength={1} />
        {/* the serpent */}
        <path d="M150 196c10-12 24-12 34 0s24 12 34 0 20-10 30 0" pathLength={1} />
        <circle cx="152" cy="192" r="1.5" fill="currentColor" pathLength={1} />
        {/* the wave and the fish beneath */}
        <path d="M0 214c30-12 60-12 90 0s60 12 90 0 60-12 90 0 60 12 90 0 60-12 90 0 30 12 40 8" pathLength={1} />
        <path d="M180 232c14-10 34-10 48 0-14 8-34 8-48 0zM228 232l14-8v16z" pathLength={1} />
        <path d="M0 200h480" pathLength={1} />
      </svg>
    )
  }
  return (
    <svg {...common}>
      {/* the ziggurat */}
      <path d="M150 200v-30h180v30M170 170v-30h140v30M190 140v-28h100v28M212 112V90h56v22" pathLength={1} />
      <path d="M240 90V70l14 8-14 8" pathLength={1} />
      <path d="M232 200v-24h16v24" pathLength={1} />
      {/* towers with battlements */}
      <path d="M40 200v-90h8v-10h10v10h8v-10h10v10h8v90" pathLength={1} />
      <path d="M58 200v-24h14v24M60 140h10M60 160h10" pathLength={1} />
      <path d="M396 200v-70h6v-8h8v8h6v-8h8v8h6v70" pathLength={1} />
      <path d="M410 200v-20h12v20M408 150h16" pathLength={1} />
      {/* walls between */}
      <path d="M84 200v-40h66M330 160h66v40" pathLength={1} />
      <path d="M92 160v-8h8v8M108 160v-8h8v8M124 160v-8h8v8M340 160v-8h8v8M356 160v-8h8v8M372 160v-8h8v8" pathLength={1} />
      {/* people on the road */}
      <path d="M0 220c80-8 160-8 240 0s160 8 240 0" pathLength={1} />
      <circle cx="118" cy="182" r="5" pathLength={1} />
      <path d="M118 187v14M118 194l-7 8M118 194l7 8M118 190l-8 4M118 190l8 4" pathLength={1} />
      <circle cx="140" cy="186" r="4" pathLength={1} />
      <path d="M140 190v11M140 196l-5 6M140 196l5 6M140 192l-6 3M140 192l6 3" pathLength={1} />
      <circle cx="360" cy="184" r="5" pathLength={1} />
      <path d="M360 189v12M360 196l-6 7M360 196l6 7M360 192l-8 2M360 192l8-6" pathLength={1} />
      <path d="M368 186l-6-18M362 168l10 4-8 4" pathLength={1} />
      {/* a sail on the horizon and the stars above */}
      <path d="M440 96v34M440 100l26 20h-26M428 130h30l-4 6h-22z" pathLength={1} />
      <path d="M60 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM300 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM180 56l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" pathLength={1} />
      <path d="M0 200h480" pathLength={1} />
    </svg>
  )
}
