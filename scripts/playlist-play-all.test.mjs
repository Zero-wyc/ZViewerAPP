import assert from 'node:assert/strict'
import test from 'node:test'
import { enqueuePlaylistAndPlay } from '../src/upstream/modules/music/playlistPlayback.ts'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('play all waits for the first ACK, starts once, and enqueues every song in order without a duplicate', async () => {
  const ack = deferred(), events = []
  const task = enqueuePlaylistAndPlay([1, 2, 3], {
    enqueue: async song => { events.push(`enqueue:${song}`); if (song === 1) await ack.promise },
    play: song => events.push(`play:${song}`), isCurrent: () => true,
    onAdded: count => events.push(`added:${count}`),
  })
  assert.deepEqual(events, ['enqueue:1'])
  ack.resolve()
  await task
  assert.deepEqual(events, ['enqueue:1', 'added:1', 'play:1', 'enqueue:2', 'added:2', 'enqueue:3', 'added:3'])
})

for (const failAt of [1, 2]) {
  test(`queue failure at song ${failAt} stops the batch and cannot start an unconfirmed song`, async () => {
    const played = [], added = []
    await assert.rejects(enqueuePlaylistAndPlay([1, 2, 3], {
      enqueue: async song => { if (song === failAt) throw Error('denied') },
      play: song => played.push(song), isCurrent: () => true, onAdded: count => added.push(count),
    }), /denied/)
    assert.deepEqual(played, failAt === 1 ? [] : [1])
    assert.deepEqual(added, failAt === 1 ? [] : [1])
  })
}

for (const cancelAt of [0, 1, 2]) {
  test(`leaving or changing the playlist at ACK ${cancelAt} stops later queue writes and playback`, async () => {
    const ack = deferred(), played = [], enqueued = []
    let current = cancelAt !== 0
    const task = enqueuePlaylistAndPlay([1, 2, 3], {
      enqueue: async song => { enqueued.push(song); if (song === cancelAt) await ack.promise },
      play: song => played.push(song), isCurrent: () => current, onAdded: () => {},
    })
    if (cancelAt === 2) await Promise.resolve()
    current = false
    ack.resolve()
    await task
    assert.deepEqual(enqueued, cancelAt === 0 ? [] : cancelAt === 1 ? [1] : [1, 2])
    assert.deepEqual(played, cancelAt === 2 ? [1] : [])
  })
}

test('an empty playlist never enqueues or starts playback', async () => {
  await enqueuePlaylistAndPlay([], {
    enqueue: () => assert.fail('empty enqueue'), play: () => assert.fail('empty play'),
    isCurrent: () => true, onAdded: () => assert.fail('empty count'),
  })
})
