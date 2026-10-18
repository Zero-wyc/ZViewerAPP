import { Switch } from '@/components/ui/Switch'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'

/** The server has no room-level autoplay setting; only the active host owns it. */
export function AutoContinueToggle({ isHost }: { isHost: boolean }) {
  const { connected } = useSocket()
  const enabled = useRoomStore(state => state.autoContinueEnabled)
  const setEnabled = useRoomStore(state => state.setAutoContinueEnabled)
  const mode = useRoomStore(state => state.mode)
  if (!isHost || mode !== 'watch-together') return null
  return <Switch
    role="switch"
    label="自动连播"
    aria-label="自动连播"
    title="当前影片结束后播放片单下一部，到末尾停止"
    className="min-h-11 shrink-0"
    checked={enabled}
    disabled={!connected}
    onChange={event => setEnabled(event.target.checked)}
  />
}
