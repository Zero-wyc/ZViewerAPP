import { useMusicPlayer } from './useMusicPlayer'
import { useSystemLyrics } from './useSystemLyrics'
import { systemArtworkUrl, useSystemMediaSession } from '../../../../mobile/useSystemMediaSession'

/** Native hosts use a real media session and a playback background task. */
export function useMediaSessionSync(): void {
  const { isPlaying, currentSong, canControl, togglePlay, next, prev, seek, requestControl, getAudio } = useMusicPlayer()
  const lyrics = useSystemLyrics(currentSong)
  useSystemMediaSession({
    getSnapshot() {
      if (!currentSong) return null
      const audio = getAudio()
      const duration = audio?.duration
      return {
        mediaId: `${currentSong.biliBvid || currentSong.songId}:${currentSong.biliCid || 0}`,
        kind: 'audio', title: currentSong.name, artist: currentSong.artist || '', album: currentSong.album || '',
        artwork: systemArtworkUrl(currentSong.cover), playing: isPlaying,
        lyric: lyrics.lyric, lyricLine: lyrics.currentLine(audio?.currentTime || 0),
        position: Math.max(0, audio?.currentTime || 0),
        duration: duration && Number.isFinite(duration) ? duration : Math.max(0, currentSong.durationMs / 1000),
        playbackRate: audio?.playbackRate || 1,
        actions: ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto'],
      }
    },
    onAction(action, position) {
      if (action === 'nexttrack' || action === 'previoustrack') {
        if (!canControl) requestControl(action === 'nexttrack' ? 'next' : 'prev')
        else if (action === 'nexttrack') next()
        else prev()
      } else if (action === 'seekto' && position !== undefined && Number.isFinite(position)) {
        if (canControl) seek(Math.max(0, position))
        else requestControl('seek', Math.max(0, position))
      } else if (action === 'play' || action === 'pause' || action === 'stop') {
        const play = action === 'play'
        const audio = getAudio()
        if (!canControl) requestControl(play ? 'play' : 'pause')
        else if (play !== (audio ? !audio.paused : isPlaying)) togglePlay()
      }
    },
  })
}
