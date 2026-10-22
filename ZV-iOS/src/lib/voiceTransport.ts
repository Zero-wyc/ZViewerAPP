import { withDeadline } from './deadline.ts';
type Stats = { forEach(callback: (value: Record<string, unknown>) => void): void };
type Transport = { getConnectionState?(): string; getICEConnectionState?(): string; getStats?(): Promise<Stats> | undefined };
export type VoiceTransportRoom = { engine?: { pcManager?: { publisher?: Transport; subscriber?: Transport; needsPublisher?: boolean; needsSubscriber?: boolean } } };

export async function voiceTransportState(room: VoiceTransportRoom) {
  const manager = room.engine?.pcManager;
  if (!manager) return { state: 'unknown' as const, protocol: '' };
  if (manager.needsPublisher && !manager.publisher || manager.needsSubscriber && !manager.subscriber) return { state: 'unknown' as const, protocol: '' };
  const required = [manager.needsPublisher ? manager.publisher : undefined, manager.needsSubscriber ? manager.subscriber : undefined].filter((value): value is Transport => !!value);
  if (!required.length) return { state: 'unknown' as const, protocol: '' };
  const protocols = new Set<string>();
  let connected = true;
  for (const transport of required) {
    try {
      const connection = transport.getConnectionState?.(); const ice = transport.getICEConnectionState?.();
      if (!connection || !ice) return { state: 'unknown' as const, protocol: '' };
      if (['failed', 'closed', 'disconnected'].includes(connection) || ['failed', 'closed', 'disconnected'].includes(ice)) return { state: 'waiting' as const, protocol: '' };
      if (connection !== 'connected' || !['connected', 'completed'].includes(ice)) connected = false;
      const stats = await withDeadline(async () => await transport.getStats?.(), 1500); if (!stats) return { state: 'unknown' as const, protocol: '' };
      const items = new Map<string, Record<string, unknown>>(); stats.forEach(item => { if (typeof item.id === 'string') items.set(item.id, item); });
      const selectedId = [...items.values()].find(item => item.type === 'transport' && typeof item.selectedCandidatePairId === 'string')?.selectedCandidatePairId;
      const pair = (typeof selectedId === 'string' ? items.get(selectedId) : undefined) || [...items.values()].find(item => item.type === 'candidate-pair' && (item.selected === true || item.nominated === true && item.state === 'succeeded'));
      if (pair && pair.state === 'succeeded') {
        const candidate = items.get(String(pair.localCandidateId));
        const protocol = candidate?.relayProtocol || candidate?.protocol; if (typeof protocol === 'string') protocols.add(protocol.toUpperCase());
      } else connected = false;
    } catch { return { state: 'unknown' as const, protocol: '' }; }
  }
  return { state: connected ? 'connected' as const : 'waiting' as const, protocol: [...protocols].join('/') };
}
