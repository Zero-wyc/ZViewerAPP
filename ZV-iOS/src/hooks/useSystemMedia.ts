import { useEffect, useRef, useId } from 'react';
import { AppState } from 'react-native';
import { nativeBridge, type SystemMediaState } from '@/lib/nativeBridge';
import type { VlcPlayer } from '@/lib/vlcPlayer';
export function useSystemMedia(player: VlcPlayer, state: Omit<SystemMediaState, 'sessionId' | 'position' | 'duration' | 'playing' | 'playbackRate' | 'uri'> & { sourceIdentity?: string } | null, command: (action: string, value?: number) => void) {
  const id = useId();
  const enabled = state !== null;
  const latest = useRef({ state, command });
  useEffect(() => { latest.current = { state, command }; }, [state, command]);
  useEffect(() => {
    if (!nativeBridge || !enabled) return;
    const publish = () => {
      const value = latest.current.state; if (!value) return;
      void nativeBridge?.mediaUpdate(JSON.stringify({ ...value, sessionId: id, uri: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.sourceUri : '', playing: (!value.sourceIdentity || value.sourceIdentity === player.sourceIdentity) && player.playing, position: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.currentTime : 0, duration: !value.sourceIdentity || value.sourceIdentity === player.sourceIdentity ? player.duration : 0, playbackRate: player.playbackRate })).catch(() => {});
    };
    publish();
    const listeners = [player.addListener('sourceLoad', publish), player.addListener('playingChange', publish), player.addListener('playbackRateChange', publish)];
    let last = 0; listeners.push(player.addListener('timeUpdate', () => { if (Date.now() - last > 1000) { last = Date.now(); publish(); } }));
    const subscription = nativeBridge.addListener('onMediaCommand', data => { if (data.sessionId === id && latest.current.state?.mediaId === data.mediaId) latest.current.command(data.action, data.value); });
    const app = AppState.addEventListener('change', phase => { if (phase === 'active') { void nativeBridge?.mediaDrain(id).then(values => { for (const data of values) if (latest.current.state?.mediaId === data.mediaId) latest.current.command(data.action, data.value); publish(); }); } });
    return () => { listeners.forEach(item => item.remove()); app.remove(); subscription.remove(); void nativeBridge?.mediaClear(id); };
  // metadata updates must not clear or recreate the owner.
  }, [player, id, enabled]);
  useEffect(() => { if (state) void nativeBridge?.mediaUpdate(JSON.stringify({ ...state, sessionId: id, uri: !state.sourceIdentity || state.sourceIdentity === player.sourceIdentity ? player.sourceUri : '', playing: (!state.sourceIdentity || state.sourceIdentity === player.sourceIdentity) && player.playing, position: !state.sourceIdentity || state.sourceIdentity === player.sourceIdentity ? player.currentTime : 0, duration: !state.sourceIdentity || state.sourceIdentity === player.sourceIdentity ? player.duration : 0, playbackRate: player.playbackRate })).catch(() => {}); }, [state, id, player]);
}
