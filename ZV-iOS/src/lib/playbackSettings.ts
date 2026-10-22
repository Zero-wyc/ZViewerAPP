import type { Playback, NativePlayerPort } from './mediaAdapter.ts';

// A refreshed movie DTO owns its media fields, while the active host keeps the
// latest control intent and native clock. Coordinator snapshots can be older
// than a pause/rate/seek made since the movie was activated.
export function playbackAfterSettings(media: Playback, intent: Playback | null, player: Pick<NativePlayerPort, 'currentTime' | 'playbackRate' | 'duration'>): Playback {
  return { ...media, isPlaying: intent?.isPlaying ?? media.isPlaying, currentTime: player.currentTime,
    playbackRate: intent?.playbackRate ?? player.playbackRate, duration: player.duration || media.duration };
}
