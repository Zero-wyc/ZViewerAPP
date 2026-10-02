import { useEffect, useMemo, useState } from 'react'
import type { MusicQueueItem } from '../types'
import { requestBiliLyrics, requestNcmLyrics } from '../utils/lyricRequest'
import { mergeLyrics, type LyricLine } from '../utils/lrc'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'

export function useSystemLyrics(song: MusicQueueItem | null | undefined) {
  const key = song ? song.biliBvid ? `bili:${song.biliBvid}:${song.biliCid ?? 0}` : `ncm:${song.songId}` : ''
  const [result, setResult] = useState<{ key: string; lines: LyricLine[] }>({ key: '', lines: [] })
  const id = song?.songId, bvid = song?.biliBvid, cid = song?.biliCid, duration = song?.durationMs
  useEffect(() => {
    if (!key || !isGlobalAppearanceRuntime()) return
    let cancelled = false
    void (async () => {
      let lines: LyricLine[] = []
      try {
        if (bvid && cid) {
          const data = await requestBiliLyrics(bvid, cid, duration)
          lines = (data?.lines ?? []).filter(line => line.content.trim() && Number.isFinite(line.from))
            .map(line => ({ time: line.from, text: line.content })).sort((a, b) => a.time - b.time)
        } else if (id && id > 0) {
          const data = await requestNcmLyrics(id)
          const raw = data?.lrc?.lyric || ''
          if (!raw.includes('纯音乐')) lines = mergeLyrics(raw, data?.tlyric?.lyric || '', data?.romalrc?.lyric ?? data?.rlyric?.lyric)
        }
      } catch { /* Missing lyrics must clear the preceding song's system lyrics. */ }
      if (!cancelled) setResult({ key, lines })
    })()
    return () => { cancelled = true }
  }, [key, id, bvid, cid, duration])
  const lines = result.key === key ? result.lines : []
  const lyric = useMemo(() => {
    let output = ''
    for (const line of lines) {
      if (!Number.isFinite(line.time)) continue
      const millis = Math.max(0, Math.round(line.time * 1000))
      const time = `${String(Math.floor(millis / 60000)).padStart(2, '0')}:${String(Math.floor(millis / 1000) % 60).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`
      const row = `[${time}]${line.text.replace(/[\r\n]/g, ' ')}\n`
      if (output.length + row.length > 65536) break
      output += row
    }
    return output
  }, [lines])
  return { lyric, currentLine(position: number) {
    let text = ''
    for (const line of lines) { if (line.time > position) break; text = line.text }
    return text
  } }
}
