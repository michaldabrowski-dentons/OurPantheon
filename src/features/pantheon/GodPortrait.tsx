import type { CSSProperties } from 'react'
import type { DomainKey } from '@/lib/types'
import { domainArt } from '@/data/pantheon'
import { FrescoFrame } from '@/components/ui/Primitives'

/** A god's portrait: the painting of its domain in a gold frame (a formless god before a domain is chosen). */
export function GodPortrait({
  domain,
  size = 56,
  round = true,
  aura,
  alt = '',
  className,
  style,
}: {
  domain: DomainKey | null | undefined
  size?: number | string
  round?: boolean
  aura?: boolean
  alt?: string
  className?: string
  style?: CSSProperties
}) {
  const px = typeof size === 'number' ? size : 999
  return <FrescoFrame src={domainArt(domain, px > 192 ? 'full' : 'thumb')} alt={alt} size={size} round={round} aura={aura} className={className} style={style} />
}

/** the bare image, for tiny pins and lists where a frame would be too much */
export function godPortraitSrc(domain: DomainKey | null | undefined): string {
  return domainArt(domain, 'thumb')
}
