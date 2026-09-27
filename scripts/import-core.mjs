import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

// Import the dependency closure, not the original website's routes or app shell.
const root = path.resolve(import.meta.dirname, '..')
const source = path.resolve(root, '../ZViewer-4.1.7-source code/frontend')
const target = path.join(root, 'src/upstream')
const entries = [
  'modules/screen-sharing/components/WebrtcWatchPage.tsx',
  'modules/screen-sharing/components/StreamPushViewer.tsx',
  'modules/screen-sharing/hooks/useStreamStatus.ts',
  'modules/screen-sharing/hooks/useShareMethod.ts',
  'modules/room/watch-together/WatchTogetherPanel.tsx',
  'modules/room/watch-together/usePlayerRemountKey.ts',
  'modules/room/components/RoomInfoPanel.tsx',
  'modules/room/components/MovieListPanel.tsx',
  'modules/room/components/MoviePushPanel.tsx',
  'modules/room/components/useRoomModeSwitch.ts',
  'modules/music/components/MusicAppShell.tsx',
  'modules/music/MusicPlayerContext.tsx',
  'components/CommentPanel.tsx',
  'store/danmakuStore.ts',
  'index.css',
]
const visited = new Set()
function resolveModule(base) {
  return [base, ...['.ts', '.tsx', '.js', '.css', '/index.ts', '/index.tsx'].map(s => base + s)]
    .find(file => fs.existsSync(file) && fs.statSync(file).isFile())
}
function copy(file) {
  if (visited.has(file)) return
  visited.add(file)
  const relative = path.relative(path.join(source, 'src'), file)
  const dest = path.join(target, relative)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest)
  if (!/\.[jt]sx?$/.test(file)) return
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const imports = new Set()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) imports.add(node.source.value)
    if (node.type === 'CallExpression' && node.callee.type === 'Import' && node.arguments[0]?.type === 'StringLiteral') imports.add(node.arguments[0].value)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(ast)
  for (const fileName of imports) {
    const base = fileName.startsWith('@/') ? path.join(source, 'src', fileName.slice(2))
      : fileName.startsWith('.') ? path.resolve(path.dirname(file), fileName) : null
    if (!base) continue
    const dependency = resolveModule(base)
    if (!dependency) throw new Error(`Missing ${fileName} in ${relative}`)
    copy(dependency)
  }
}
entries.forEach(entry => copy(path.join(source, 'src', entry)))
for (const entry of ['fonts', 'player-empty.jpg', 'root-avatar.jpg', 'favicon.jpg', 'Nacho3.jpg', 'icons.svg', 'voice-processor.js']) {
  fs.cpSync(path.join(source, 'public', entry), path.join(root, 'public', entry), { recursive: true, force: false })
}
fs.cpSync(path.join(source, 'vendor/mediabunny'), path.join(root, 'vendor/mediabunny'), { recursive: true, force: false })
fs.copyFileSync(path.join(source, '../LICENSE'), path.join(root, 'UPSTREAM-LICENSE'))
console.log(`Imported ${visited.size} source files from local ZViewer 4.1.7. Existing adaptations preserved.`)
