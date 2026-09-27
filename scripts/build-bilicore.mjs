import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const cwd=fileURLToPath(new URL('../native/bilicore/',import.meta.url))
const output=fileURLToPath(new URL('../ZV-Android/app/libs/',import.meta.url))
const revision='v0.0.0-20260908204917-8b95e45f8d3e'
mkdirSync(output,{recursive:true})
function run(args) {
  const result=spawnSync('go',args,{cwd,stdio:'inherit',env:process.env})
  if(result.error) throw result.error
  if(result.status!==0) process.exit(result.status??1)
}
// Pin generator and runtime to the same revision; no generated AAR is committed.
run(['install',`golang.org/x/mobile/cmd/gobind@${revision}`])
run(['run','golang.org/x/mobile/cmd/gomobile','init'])
run(['run','golang.org/x/mobile/cmd/gomobile','bind','-target=android/arm64,android/amd64','-androidapi','24','-o',output+'bilicore.aar','./mobile'])
