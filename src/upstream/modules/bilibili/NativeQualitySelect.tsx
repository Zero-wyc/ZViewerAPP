import { Select } from '@/components/ui/Select'
import { message } from '@/components/ui/message'
import { useRoomStore } from '@/store/roomStore'
import { useEmbeddedProxyStatus } from '../../../platform/bilibiliProxy'
import { getActualNativeQuality, selectNativeQuality, useNativeQualityPolicy } from './nativeQualityPolicy'
import { getBilibiliParseOptions } from './parseOptions'

export function NativeQualitySelect({ movieId, isHost, disabled = false }: { movieId: number; isHost: boolean; disabled?: boolean }) {
  const proxy = useEmbeddedProxyStatus()
  const policy = useNativeQualityPolicy(movieId)
  const actual = getActualNativeQuality(movieId)
  const currentMovieId = useRoomStore(s => s.currentMovieId)
  const options = [{ value: 'autoMax', label: `自动最高${actual ? ` · ${actual.qualities.find(q => q.id === actual.qn)?.label ?? actual.qn}` : ''}` }, ...(actual?.qualities ?? []).map(q => ({ value: String(q.id), label: q.label }))]
  if (!proxy.supported || !proxy.loggedIn || !getBilibiliParseOptions(movieId).cliEnabled) return null
  return <Select className="mt-1.5" size="sm" aria-label="本机B站画质" options={options}
    value={policy.mode === 'autoMax' ? 'autoMax' : String(policy.qn)} disabled={disabled}
    onChange={value => {
      selectNativeQuality(movieId, value === 'autoMax' ? undefined : Number(value))
      const store = useRoomStore.getState()
      store.setViewerCliResolvedSource(null)
      if (currentMovieId === movieId) {
        if (isHost) store.triggerReloadBilibili()
        else store.triggerViewerSourceReload()
      }
      message.info(value === 'autoMax' ? '已选择自动最高画质' : '已选择本机画质')
    }} />
}
