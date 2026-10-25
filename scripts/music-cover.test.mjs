import test from 'node:test'
import assert from 'node:assert/strict'
import { musicCoverUrl } from '../src/upstream/modules/music/utils/neteaseImage.ts'

const source = 'http://p4.music.126.net/vwNxbxKBS7K6JAxaQqbsGg==/109951168088742524.jpg'
test('daily recommendation artwork uses HTTPS in the queue and in both player sizes', () => {
  const queued = musicCoverUrl(source, 300)
  assert.equal(new URL(queued).protocol, 'https:')
  assert.equal(new URL(musicCoverUrl(queued)).searchParams.get('param'), '600y600')
  assert.equal(new URL(musicCoverUrl(queued, 120)).searchParams.get('param'), '120y120')
})
test('existing crop queries are replaced while other query fields remain intact', () => {
  const result = new URL(musicCoverUrl(`${source}?quality=80&param=80y80&param=100y100`, 600))
  assert.deepEqual(result.searchParams.getAll('param'), ['600y600'])
  assert.equal(result.searchParams.get('quality'), '80')
})
test('protocol relative Netease artwork is normalized without changing its image identity', () => {
  assert.equal(musicCoverUrl(source.replace('http:', ''), 300), source.replace('http:', 'https:') + '?param=300y300')
})
test('Bilibili proxies and their authorization queries remain unchanged', () => {
  for (const url of ['/api/stream/proxy-image?url=encoded&token=opaque', 'http://127.0.0.1:9280/private/api/stream/proxy-image?url=x&token=y', 'https://i0.hdslb.com/bfs/archive/image.jpg']) assert.equal(musicCoverUrl(url), url)
})
test('non Netease and local artwork are preserved and empty artwork stays empty', () => {
  for (const url of ['/cover.jpg', 'blob:https://zviewer.local/cover', 'https://other.example.com/cover.jpg?signature=opaque']) assert.equal(musicCoverUrl(url), url)
  assert.equal(musicCoverUrl(null), '')
  assert.equal(musicCoverUrl(undefined), '')
})
