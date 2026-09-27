import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const root = new URL('../tests/fixtures/bilibili/', import.meta.url)
mkdirSync(root, { recursive: true })
for (const [name, width, height] of [['1080',1920,1080], ['720',1280,720], ['480',854,480]]) {
  const result = spawnSync('ffmpeg', ['-y','-f','lavfi','-i',`color=c=0x226699:s=${width}x${height}:r=30`,'-t','8','-an','-c:v','libx264','-profile:v','high','-level:v','4.0','-pix_fmt','yuv420p','-g','30','-movflags','+dash+global_sidx','-f','mp4',new URL(`video-${name}.mp4`,root).pathname.replace(/^\/([A-Za-z]:)/,'$1')], { stdio:'inherit' })
  if (result.status) process.exit(result.status)
}
const audio = spawnSync('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-vn','-c:a','aac','-b:a','128k','-movflags','+dash+global_sidx','-f','mp4',new URL('audio.mp4',root).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{stdio:'inherit'})
if (audio.status) process.exit(audio.status)
