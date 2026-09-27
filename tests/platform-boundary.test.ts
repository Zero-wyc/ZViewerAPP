import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const root = process.cwd()
const sourceRoot = join(root, 'src')
const platformRoot = join(sourceRoot, 'platform')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

test('native SDK access stays inside the platform boundary', () => {
  const violations = sourceFiles(sourceRoot)
    .filter(path => !path.startsWith(platformRoot))
    .filter(path => /(?:from\s+['"]@capacitor|registerPlugin\s*\()/.test(readFileSync(path, 'utf8')))
    .map(path => relative(root, path))

  assert.deepEqual(violations, [])
})

test('portable platform contracts and native back hook are present', () => {
  for (const path of [
    'src/platform/contracts.ts',
    'src/platform/playerDisplay.ts',
    'src/platform/audioRouting.ts',
    'src/platform/lifecycle.ts',
    'src/platform/permissions.ts',
    'src/mobile/useNativeBack.ts',
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`)
  }
  assert.equal(existsSync(join(root, 'src/mobile/useAndroidBack.ts')), false)
})
