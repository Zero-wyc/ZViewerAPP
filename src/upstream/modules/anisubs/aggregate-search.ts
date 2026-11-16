import type { AniSubsSearchResult, AniSubsSource } from './types'
import {
  getAniSubsSources,
  searchAllAniSubs,
  searchAniSubs,
} from './api'

export const AGGREGATE_ANI_SUBS_SOURCE_ID = '__all__'

export async function getAniSubsSourcesWithAggregate(): Promise<AniSubsSource[]> {
  const sources = await getAniSubsSources()
  return [
    {
      id: AGGREGATE_ANI_SUBS_SOURCE_ID,
      name: '全部站点（聚合搜索）',
    },
    ...sources,
  ]
}

export function searchAniSubsBySource(
  source: string,
  keyword: string
): Promise<AniSubsSearchResult[]> {
  if (source === AGGREGATE_ANI_SUBS_SOURCE_ID) {
    return searchAllAniSubs(keyword)
  }
  return searchAniSubs(source, keyword)
}
