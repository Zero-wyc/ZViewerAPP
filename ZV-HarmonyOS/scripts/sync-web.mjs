import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const hostRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const clientRoot = resolve(hostRoot, '..')
const distRoot = join(clientRoot, 'dist')
const webRoot = join(hostRoot, 'entry', 'src', 'main', 'resources', 'rawfile', 'web')
if (!webRoot.startsWith(hostRoot + sep)) throw new Error('Invalid web output path')

const html = await readFile(join(distRoot, 'index.html'), 'utf8')
const bootstrap = await readFile(join(hostRoot, 'scripts', 'bridge-bootstrap.js'), 'utf8')
if (!html.includes('</head>')) throw new Error('Vite output has no </head>')

// Vite --base=./ covers generated modules, CSS and dynamic imports. Public
// assets referenced by the HTML still need local relative URLs.
const localHtml = html
  .replaceAll('="/favicon.jpg"', '="./favicon.jpg"')
  .replace('</head>', `<script>${bootstrap}</script></head>`)

await rm(webRoot, { recursive: true, force: true })
await mkdir(webRoot, { recursive: true })
await cp(distRoot, webRoot, { recursive: true })
await writeFile(join(webRoot, 'index.html'), localHtml)
// Some checked-in license files are read-only. Restool re-creates its copy of
// rawfile resources on each build and cannot remove a read-only previous copy.
async function makeWritable(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) await makeWritable(path)
    else if (item.isFile()) await chmod(path, 0o666)
  }
}
await makeWritable(webRoot)
console.log(`Synced ${distRoot} to ${webRoot}`)
