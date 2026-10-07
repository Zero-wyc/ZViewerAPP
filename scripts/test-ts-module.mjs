import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

// Node 24 strips TS without depending on the removed TypeScript 7 compiler JS API.
export function loadTs(file, modules = {}, globals = {}) {
  const stripped = stripTypeScriptTypes(readFileSync(file, 'utf8'))
  const names = [...stripped.matchAll(/export (?:const|(?:async )?function|class) (\w+)/g)].map(m => m[1])
  const code = stripped.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/g, (_, fields, path) => `const {${fields}} = require(${JSON.stringify(path)});`).replace(/export (?=const|(?:async )?function|class)/g, '')
  const exports = {}
  const require = name => {
    if (!(name in modules)) throw new Error(`Unexpected module: ${name}`)
    return modules[name]
  }
  const reexports = [...code.matchAll(/export \{([^}]+)\}/g)].flatMap(m => m[1].split(',').map(n => n.trim()))
  runInNewContext(code.replace(/export \{[^}]+\};?/g, '') + '\n' + [...names, ...reexports].map(n => `exports.${n} = ${n};`).join('\n'), { exports, require, console, Uint8Array, TextEncoder, DOMException, AbortController, AbortSignal, ...globals })
  return exports
}
