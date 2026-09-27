// Placeholder fresco set. Drop real art into public/frescoes/<key>.svg|png and update `file`.

export interface Fresco {
  key: string
  name: string
  file: string
}

export const FRESCOES: Fresco[] = [
  { key: 'fresco-01', name: 'Słońce', file: '/frescoes/fresco-01.svg' },
  { key: 'fresco-02', name: 'Księżyc', file: '/frescoes/fresco-02.svg' },
  { key: 'fresco-03', name: 'Wąż', file: '/frescoes/fresco-03.svg' },
  { key: 'fresco-04', name: 'Byk', file: '/frescoes/fresco-04.svg' },
  { key: 'fresco-05', name: 'Drzewo', file: '/frescoes/fresco-05.svg' },
  { key: 'fresco-06', name: 'Fala', file: '/frescoes/fresco-06.svg' },
  { key: 'fresco-07', name: 'Góra', file: '/frescoes/fresco-07.svg' },
  { key: 'fresco-08', name: 'Oko', file: '/frescoes/fresco-08.svg' },
  { key: 'fresco-09', name: 'Płomień', file: '/frescoes/fresco-09.svg' },
  { key: 'fresco-10', name: 'Gwiazda', file: '/frescoes/fresco-10.svg' },
  { key: 'fresco-11', name: 'Sowa', file: '/frescoes/fresco-11.svg' },
  { key: 'fresco-12', name: 'Dłoń', file: '/frescoes/fresco-12.svg' },
]

export const FRESCO_BY_KEY: Record<string, Fresco> = Object.fromEntries(FRESCOES.map((f) => [f.key, f]))

export function frescoSrc(key: string | null | undefined): string {
  return (key && FRESCO_BY_KEY[key]?.file) || FRESCOES[0].file
}

/** Entity portraits reuse the same set for the MVP. */
export const ENTITY_FRESCOES = FRESCOES
