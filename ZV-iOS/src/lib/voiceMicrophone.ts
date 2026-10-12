// Permission/room state may change while WebRTC creates and publishes a track.
export async function changeVoiceMicrophone(enabled: boolean, allowed: () => boolean, publish: (enabled: boolean) => Promise<unknown>): Promise<boolean> {
  if (enabled && !allowed()) return false;
  await publish(enabled);
  if (enabled && !allowed()) { await publish(false); return false; }
  return enabled;
}
