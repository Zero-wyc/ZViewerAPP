import {
  AnimeSourceBrowser,
  type AnimeSourceBrowserProps,
} from '@/modules/room/components/AnimeSourceBrowser'
import { getAniSubsEpisodes } from './api'
import {
  getAniSubsSourcesWithAggregate,
  searchAniSubsBySource,
} from './aggregate-search'

export function AniSubsSelector(props: AnimeSourceBrowserProps) {
  return (
    <AnimeSourceBrowser
      {...props}
      kind="anisubs"
      title="ani-subs 番剧源"
      getSources={getAniSubsSourcesWithAggregate}
      search={searchAniSubsBySource}
      getEpisodes={getAniSubsEpisodes}
    />
  )
}
