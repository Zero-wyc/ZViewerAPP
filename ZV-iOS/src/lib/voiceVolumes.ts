import type { Room } from 'livekit-client';

const gain = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
// LiveKit stores remote volume for future subscriptions; the native local audio
// source exposes gain through react-native-webrtc's MediaStreamTrack extension.
export function applyVoiceVolumes(room: Pick<Room, 'remoteParticipants' | 'localParticipant'>, output: number, microphone: number, deafened: boolean, members: Readonly<Record<string, number>> = {}) {
  for (const [identity, participant] of room.remoteParticipants) participant.setVolume(deafened ? 0 : gain(output) * gain(members[identity] ?? 1));
  for (const publication of room.localParticipant.audioTrackPublications.values()) {
    const track = publication.track?.mediaStreamTrack as (MediaStreamTrack & { _setVolume?: (value: number) => void }) | undefined;
    track?._setVolume?.(gain(microphone));
  }
}
