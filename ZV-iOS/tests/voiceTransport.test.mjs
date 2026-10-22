import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceTransportState } from '../src/lib/voiceTransport.ts';

const transport = (protocol = 'udp', state = 'succeeded') => ({
  getConnectionState: () => 'connected', getICEConnectionState: () => 'completed',
  getStats: async () => new Map([
    ['transport', { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }],
    ['pair', { id: 'pair', type: 'candidate-pair', state, localCandidateId: 'local' }],
    ['local', { id: 'local', type: 'local-candidate', protocol }],
  ]),
});
const room = manager => ({ engine: { pcManager: manager } });

test('voice status follows only the actually required subscriber and publisher transports', async () => {
  const failed = { getConnectionState: () => 'failed', getICEConnectionState: () => 'failed' };
  assert.deepEqual(await voiceTransportState(room({ needsSubscriber: true, subscriber: transport(), publisher: failed })), { state: 'connected', protocol: 'UDP' });
  assert.deepEqual(await voiceTransportState(room({ needsSubscriber: true, needsPublisher: true, subscriber: transport(), publisher: transport('tcp') })), { state: 'connected', protocol: 'TCP/UDP' });
  assert.equal((await voiceTransportState(room({ needsSubscriber: true, needsPublisher: true, subscriber: transport(), publisher: failed }))).state, 'waiting');
});

test('missing or throwing native diagnostics remain unknown instead of reporting success or rejecting', async () => {
  for (const manager of [undefined, {}, { needsSubscriber: true }, { needsSubscriber: true, subscriber: {} }, { needsSubscriber: true, subscriber: { getConnectionState() { throw new Error('retired PC'); } } }]) {
    assert.equal((await voiceTransportState(room(manager))).state, 'unknown');
  }
  const unsupportedStats = { ...transport(), getStats: async () => { throw new Error('stats unsupported'); } };
  assert.equal((await voiceTransportState(room({ needsSubscriber: true, subscriber: unsupportedStats }))).state, 'unknown');
});

test('a selected failed pair cannot be labeled connected despite connected SDK state', async () => {
  assert.equal((await voiceTransportState(room({ needsSubscriber: true, subscriber: transport('udp', 'failed') }))).state, 'waiting');
});
