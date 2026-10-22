import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

test('actual native connection registry maps only one origin and capability, preserves logical URLs and rejects stale-owner teardown', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'zv-server-transport-'));
  try {
    const main = join(root, 'main.swift'), binary = join(root, 'connection');
    await writeFile(main, `import Foundation
@main enum Cases { static func main() throws {
 let registry = ZVServerConnectionTransport()
 let server = "https://nas.invalid:8443/base"
 let capability = String(repeating:"a", count:48), next = String(repeating:"b", count:48)
 let local = "http://127.0.0.1:31234/" + capability + "/base"
 let media = URL(string: server + "/api/stream?a=1%2F2")!
 precondition(registry.forward(media) == media, "default must be strict")
 try registry.install(server:server, transport:local, allow:true, owner:"old")
 let mapped = registry.forward(media)
 precondition(mapped.absoluteString == "http://127.0.0.1:31234/" + capability + "/base/api/stream?a=1%2F2")
 precondition(registry.logical(mapped) == media)
 let socket = URL(string:"wss://nas.invalid:8443/socket.io/?transport=websocket")!
 precondition(registry.forward(socket).absoluteString == "ws://127.0.0.1:31234/" + capability + "/socket.io/?transport=websocket")
 precondition(registry.logical(registry.forward(socket)) == socket)
 for raw in ["https://nas.invalid:8444/base/api", "http://nas.invalid:8443/base/api", "wss://voice.invalid:8443/rtc", "https://api.bilibili.com/api", "https://music.126.net/a", "https://user:pass@nas.invalid:8443/base/api"] {
  let url = URL(string:raw)!; precondition(registry.forward(url) == url, "foreign origin/port/scheme/credentials must remain strict")
 }
 for raw in ["http://127.0.0.1:31235/" + capability + "/base/api", "http://127.0.0.1:31234/" + capability + "suffix/base/api"] {
  let url = URL(string:raw)!; precondition(registry.logical(url) == url, "unowned local capability must not become NAS identity")
 }
 try registry.install(server:server, transport:"http://127.0.0.1:31236/" + next + "/base", allow:true, owner:"new")
 precondition(registry.remove(owner:"old") == nil, "old module cannot revoke new channel")
 precondition(registry.forward(media).port == 31236)
 precondition(registry.remove(owner:"new") == server)
 precondition(registry.forward(media) == media)
 try registry.install(server:server, transport:server, allow:false, owner:"strict")
 precondition(registry.forward(media) == media)
 _ = registry.remove()
 for bad in ["https://127.0.0.1:31234/" + capability + "/base", "http://0.0.0.0:31234/" + capability + "/base", "http://127.0.0.1:31234/short/base", local + "?secret=bad"] {
  do { try registry.install(server:server, transport:bad, allow:true, owner:"bad"); preconditionFailure("invalid transport accepted") } catch { }
 }
 let https = URL(string:"https://nas.invalid/api")!
 try registry.install(server:"https://NAS.invalid:443", transport:"http://127.0.0.1:31234/" + capability, allow:true, owner:"default-port")
 precondition(registry.forward(https).port == 31234, "default HTTPS port must compare canonically")
 let plain = "http://nas.invalid:3333/base"
 let plainLocal = "http://127.0.0.1:31234/" + capability + "/base"
 try registry.install(server:plain, transport:plainLocal, allow:false, owner:"http")
 let plainMedia = URL(string:plain + "/api/stream")!
 precondition(registry.forward(plainMedia).absoluteString == plainLocal + "/api/stream")
 precondition(registry.logical(registry.forward(plainMedia)) == plainMedia)
 let plainSocket = URL(string:"ws://nas.invalid:3333/socket.io/")!
 precondition(registry.forward(plainSocket).absoluteString == "ws://127.0.0.1:31234/" + capability + "/socket.io/")
 precondition(registry.logical(registry.forward(plainSocket)) == plainSocket)
 do { try registry.install(server:server, transport:local, allow:false, owner:"strict"); preconditionFailure("HTTPS requires explicit opt-in") } catch { }
 print("native selected-origin transport passed")
} }
`);
    await run('xcrun', ['swiftc', '-parse-as-library', new URL('../modules/zviewer-native/ios/ZVServerConnectionTransport.swift', import.meta.url).pathname, main, '-o', binary]);
    const { stdout } = await run(binary); assert.match(stdout, /native selected-origin transport passed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
