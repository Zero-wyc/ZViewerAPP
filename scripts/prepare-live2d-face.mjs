import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url)
const destination = new URL('../public/live2d/face/wasm/', import.meta.url)
mkdirSync(destination, { recursive: true })
for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  const input = new URL(name, source)
  if (!existsSync(input)) throw new Error(`Live2D runtime missing: ${name}; run npm ci`)
  copyFileSync(input, new URL(name, destination))
}
console.log(`Prepared local Live2D face runtime: ${fileURLToPath(destination)}`)
