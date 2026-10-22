import { Select } from '@/components/ui/Select'
import { useState } from 'react'
import { message } from '@/components/ui/message'
import { useRoomStore } from '@/store/roomStore'
import { useEmbeddedProxyStatus } from '../../../platform/bilibiliProxy'
import { getActualNativeQuality, getNativeQualityPolicy, getQualitySelectionRevision, restoreNativeQuality, selectNativeQuality, useNativeQualityPolicy } from './nativeQualityPolicy'
import { getBilibiliParseOptions } from './parseOptions'
import { resolveBilibiliOnline } from '../room/watch-together/movie-source-resolver'
import { getEmbeddedProxyStatus } from '../../../platform/bilibiliProxy'

export function NativeQualitySelect({ movieId, isHost, disabled = false }: { movieId: number; isHost: boolean; disabled?: boolean }) {
  const proxy = useEmbeddedProxyStatus()
  const policy = useNativeQualityPolicy(movieId)
  const actual = getActualNativeQuality(movieId)
  const [busy, setBusy] = useState(false)
  const options = [{ value: 'autoMax', label: `自动最高${actual ? ` · ${actual.qualities.find(q => q.id === actual.qn)?.label ?? actual.qn}` : ''}` }, ...(actual?.qualities ?? []).map(q => ({ value: String(q.id), label: q.label }))]
  if (!proxy.supported || !proxy.loggedIn || !getBilibiliParseOptions(movieId).cliEnabled) return null
  return <Select className="mt-1.5" size="sm" aria-label="本机B站画质" options={options}
    value={policy.mode === 'autoMax' ? 'autoMax' : String(policy.qn)} disabled={disabled || busy}
    onChange={async value => {
      if (busy) return
      const storeBefore = useRoomStore.getState()
      const movie = storeBefore.movies.find(item => item.id === movieId)
      if (!movie) return
      const previous = { ...getNativeQualityPolicy(movieId) }
      const sessionVersion = getEmbeddedProxyStatus().sessionVersion
      selectNativeQuality(movieId, value === 'autoMax' ? undefined : Number(value))
      const revision = getQualitySelectionRevision(movieId)
      const current = () => useRoomStore.getState().roomSessionRevision === storeBefore.roomSessionRevision &&
        getEmbeddedProxyStatus().sessionVersion === sessionVersion && getQualitySelectionRevision(movieId) === revision &&
        useRoomStore.getState().movies.some(item => item.id === movieId && item.cid === movie.cid)
      setBusy(true)
      try {
        // Populate the normal resolver cache before touching the current source.
        // Unsupported/expired choices restore the selection and leave playback intact.
        await resolveBilibiliOnline(movie, undefined, { forceRefresh: true })
        if (!current()) return
        const store = useRoomStore.getState()
        store.setViewerCliResolvedSource(null)
        if (store.currentMovieId === movieId) {
          if (isHost) store.triggerReloadBilibili()
          else store.triggerViewerSourceReload()
        }
        message.info(value === 'autoMax' ? '已选择自动最高画质' : '已选择本机画质')
      } catch (error) {
        if (!current()) return
        restoreNativeQuality(movieId, previous)
        message.error(error instanceof Error ? error.message : '无法应用该画质，已保持原播放设置')
      } finally { setBusy(false) }
    }} />
}
