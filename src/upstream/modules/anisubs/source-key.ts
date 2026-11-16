import type { AniSubsSearchResult } from './types'

/** Site-local result IDs can collide, so browser paths include their source. */
export function getAniSubsSearchResultKey(
  result: Pick<AniSubsSearchResult, 'id' | 'source'>,
  selectedSource: string
): string {
  return JSON.stringify([result.source || selectedSource, result.id])
}
