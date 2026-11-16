import { readFile, readdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'

// zlib streams match HarmonyOS Zip.uncompress; original URLs remain unchanged.
export async function packWeb(root) {
  const entries = []
  async function visit(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name)
      const name = prefix + item.name
      if (item.isDirectory()) { await visit(path, name + '/'); continue }
      if (!item.isFile()) throw new Error(`Unsupported web resource: ${name}`)
      if (/live2d|cubism|mediapipe/i.test(name)) throw new Error(`Unsupported client resource: ${name}`)
      const data = await readFile(path)
      const compressed = deflateSync(data, { level: 9 })
      const compress = data.length >= 1024 && compressed.length + 64 < data.length && data.length <= 32 * 1024 * 1024
      if (compress) {
        if (!inflateSync(compressed).equals(data)) throw new Error(`Compression mismatch: ${name}`)
        await writeFile(path + '.zlib', compressed)
        await unlink(path)
      }
      entries.push({ path: name, size: data.length, compressed: compress })
    }
  }
  await visit(root)
  await writeFile(join(root, 'resources.json'), JSON.stringify(entries))
  return entries
}
