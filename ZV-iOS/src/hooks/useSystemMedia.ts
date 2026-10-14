import { useEffect, useRef, useId, useCallback } from 'react';
import { AppState } from 'react-native';
import { nativeBridge, type SystemMediaState } from '@/lib/nativeBridge';
import type { VlcPlayer } from '@/lib/vlcPlayer';
type SystemMetadata = Omit<SystemMediaState, 'sessionId' | 'position' | 'duration' | 'playing' | 'playbackRate' | 'uri'> & { sourceIdentity?: string } | null;
export function useSystemMedia(player: VlcPlayer, state: SystemMetadata, command: (action: string, value?: number) => void) {
  const id = useId();
  const enabled = state !== null;
  const latest = useRef({ state, command });
  useEffect(() => { latest.current = { state, command }; }, [state, command]);
  const publish = useCallback(() => {
      const value = latest.current.state; if (!value) return;
      void nativeBridge?.mediaUpdate(JSON.stringify({ ...value, sessionId: id, uri: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.sourceUri : '', playing: (!value.sourceIdentity || value.sourceIdentity === player.sourceIdentity) && player.playing, position: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.currentTime : 0, duration: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.duration : 0, playbackRate: player.playbackRate })).catch(() => {});
  }, [id, player]);
  const setMetadata = useCallback((next: SystemMetadata) => { latest.current.state = next; if (next) publish(); else void nativeBridge?.mediaClear(id).catch(() => {}); }, [id, publish]);
  useEffect(() => {
    if (!nativeBridge || !enabled) return;
    publish();
    const listeners = [player.addListener('statusChange', publish), player.addListener('sourceLoad', publish), player.addListener('playingChange', publish), player.addListener('playbackRateChange', publish)];
    let last = 0; listeners.push(player.addListener('timeUpdate', () => { if (Date.now() - last > 1000) { last = Date.now(); publish(); } }));
    const subscription = nativeBridge.addListener('onMediaCommand', data => { if (data.sessionId === id && latest.current.state?.mediaId === data.mediaId) latest.current.command(data.action, data.value); });
    const app = AppState.addEventListener('change', phase => { if (phase === 'active') { void nativeBridge?.mediaDrain(id).then(values => { for (const data of values) if (latest.current.state?.mediaId === data.mediaId) latest.current.command(data.action, data.value); publish(); }); } });
    return () => { listeners.forEach(item => item.remove()); app.remove(); subscription.remove(); void nativeBridge?.mediaClear(id); };
  // metadata updates must not clear or recreate the owner.
  }, [player, id, enabled, publish]);
  useEffect(() => { setMetadata(state); }, [state, setMetadata]);
  return setMetadata;
}
