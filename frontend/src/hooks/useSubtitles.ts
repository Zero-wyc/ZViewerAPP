import { useCallback, useEffect, useState } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { apiFetch } from '@/lib/api'
import {
  detectFormat,
  parseSubtitle,
  getSubtitleLabel,
  type SubtitleFormat,
  type ParsedCue,
} from '@/lib/subtitleParser'
import {
  extractEmbeddedSubtitle,
  resolveServerFile,
} from '@/modules/server-files/serverFilesApi'

export interface SubtitleTrack {
  cues: ParsedCue[]
  label: string
  lang?: string
}

export interface SubtitleState {
  subtitleEnabled: boolean
  subtitleTracks: SubtitleTrack[]
  activeTrackIndex: number
  subtitleFontSize: number
  /** 字幕时间偏移（秒），正值延迟显示，负值提前显示 */
  subtitleOffset: number
}

interface SubtitleBroadcastPayload {
  enabled: boolean
  tracks: SubtitleTrack[]
  activeIndex: number
  fontSize: number
  offset: number
}

export interface UseSubtitlesOptions {
  roomId: string
  isHost: boolean
}

const DEFAULT_SUBTITLE_STATE: SubtitleState = {
  subtitleEnabled: false,
  subtitleTracks: [],
  activeTrackIndex: -1,
  subtitleFontSize: 20,
  subtitleOffset: 0,
}

/**
 * 字幕状态管理 + socket 同步。
 *
 * - 房主：调用 set* 方法变更状态并广播 `subtitle-update`
 * - 观众：监听 `subtitle-update` 自动应用相同配置
 *
 * 所有格式（SRT/ASS/SSA/VTT/SMI/SUB）解析为 ParsedCue[]，
 * 保留各格式的位置/对齐/样式信息，由自定义渲染层直接显示。
 * ParsedCue[] 是纯数据，可通过 socket 直接 JSON 序列化同步给观众。
 */
export function useSubtitles({ roomId, isHost }: UseSubtitlesOptions) {
  const { socket } = useSocket()
  const [state, setState] = useState<SubtitleState>(DEFAULT_SUBTITLE_STATE)

  const broadcast = useCallback(
    (next: SubtitleState) => {
      if (!socket || !isHost) return
      const payload: SubtitleBroadcastPayload = {
        enabled: next.subtitleEnabled,
        tracks: next.subtitleTracks,
        activeIndex: next.activeTrackIndex,
        fontSize: next.subtitleFontSize,
        offset: next.subtitleOffset,
      }
      socket.emit('subtitle-update', { roomId, ...payload })
    },
    [socket, roomId, isHost]
  )

  const setEnabled = useCallback(
    (enabled: boolean) => {
      setState((prev) => {
        const next: SubtitleState = {
          ...prev,
          subtitleEnabled: enabled,
          activeTrackIndex:
            enabled &&
            prev.activeTrackIndex < 0 &&
            prev.subtitleTracks.length > 0
              ? 0
              : prev.activeTrackIndex,
        }
        broadcast(next)
        return next
      })
    },
    [broadcast]
  )

  const setActiveTrack = useCallback(
    (index: number) => {
      setState((prev) => {
        const next: SubtitleState = { ...prev, activeTrackIndex: index }
        broadcast(next)
        return next
      })
    },
    [broadcast]
  )

  /**
   * 解析字幕内容并添加为轨道。
   *
   * 内部使用：将原始文本按格式解析为 ParsedCue[]，直接存入轨道。
   */
  const addParsedTrack = useCallback(
    (
      content: string,
      filename: string,
      format: SubtitleFormat,
      customLabel?: string,
      lang?: string
    ) => {
      const cues = parseSubtitle(content, format)
      const label = customLabel?.trim() || getSubtitleLabel(filename)

      setState((prev) => {
        const track: SubtitleTrack = {
          cues,
          label: label || `字幕 ${prev.subtitleTracks.length + 1}`,
          lang: lang?.trim() || undefined,
        }
        const next: SubtitleState = {
          ...prev,
          subtitleTracks: [...prev.subtitleTracks, track],
          subtitleEnabled: true,
          activeTrackIndex: prev.subtitleTracks.length,
        }
        broadcast(next)
        return next
      })
    },
    [broadcast]
  )

  const addTrackFromUrl = useCallback(
    async (url: string, label?: string, lang?: string) => {
      const trimmedUrl = url.trim()
      if (!trimmedUrl) return

      // fetch 内容后综合文件名+内容检测格式
      try {
        const res = await fetch(trimmedUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const content = await res.text()
        const detected = detectFormat(trimmedUrl, content)
        const filename =
          trimmedUrl.split('/').pop()?.split('?')[0] || 'subtitle'
        addParsedTrack(content, filename, detected, label, lang)
      } catch (err) {
        console.error('[useSubtitles] fetch subtitle URL failed:', err)
        // fetch 失败时添加空轨道
        setState((prev) => {
          const track: SubtitleTrack = {
            cues: [],
            label: label?.trim() || `字幕 ${prev.subtitleTracks.length + 1}`,
            lang: lang?.trim() || undefined,
          }
          const next: SubtitleState = {
            ...prev,
            subtitleTracks: [...prev.subtitleTracks, track],
            subtitleEnabled: true,
            activeTrackIndex: prev.subtitleTracks.length,
          }
          broadcast(next)
          return next
        })
      }
    },
    [broadcast, addParsedTrack]
  )

  const addTrackFromFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result
        if (typeof content !== 'string') return
        const format = detectFormat(file.name, content)
        addParsedTrack(content, file.name, format)
      }
      reader.onerror = () => {
        console.error('[useSubtitles] read file error:', reader.error)
      }
      reader.readAsText(file)
    },
    [addParsedTrack]
  )

  /**
   * 从字幕内容直接添加轨道（供目录浏览器使用）。
   */
  const addTrackFromContent = useCallback(
    (content: string, filename: string, format: string) => {
      const fmt = format.toLowerCase() as SubtitleFormat
      addParsedTrack(content, filename, fmt)
    },
    [addParsedTrack]
  )

  const clearTracks = useCallback(() => {
    setState((prev) => {
      const next: SubtitleState = {
        ...prev,
        subtitleTracks: [],
        subtitleEnabled: false,
        activeTrackIndex: -1,
        subtitleOffset: 0,
      }
      broadcast(next)
      return next
    })
  }, [broadcast])

  /**
   * 自动搜索影片同目录下的字幕文件并加载。
   */
  const searchAutoSubtitles = useCallback(
    async (movieId: number): Promise<number> => {
      if (!isHost) return 0
      try {
        const res = await apiFetch(
          `/api/subtitles/search?movieId=${movieId}`
        )
        const data = (await res.json()) as {
          success: boolean
          subtitles?: { filename: string; format: string; content: string }[]
          message?: string
        }
        if (!res.ok || !data.success || !data.subtitles) {
          return 0
        }

        const found = data.subtitles
        if (found.length === 0) return 0

        // 解析所有字幕并构建轨道列表
        const newTracks: SubtitleTrack[] = found.map((sub) => {
          const format = sub.format as SubtitleFormat
          const cues = parseSubtitle(sub.content, format)
          const label = getSubtitleLabel(sub.filename) || sub.filename
          return { cues, label, lang: undefined }
        })

        // 一次性更新状态（清空旧轨道 + 加载新轨道）
        setState((prev) => {
          const next: SubtitleState = {
            ...prev,
            subtitleTracks: newTracks,
            subtitleEnabled: true,
            activeTrackIndex: 0,
          }
          broadcast(next)
          return next
        })
        return found.length
      } catch (err) {
        console.error('[useSubtitles] auto search failed:', err)
        return 0
      }
    },
    [isHost, broadcast]
  )

  /**
   * 加载视频文件中的内嵌字幕轨道。
   */
  const loadEmbeddedSubtitles = useCallback(
    async (filePath: string): Promise<number> => {
      if (!isHost) return 0

      let tracks: { index: number; language: string | null; title: string | null }[]
      try {
        const resolved = await resolveServerFile(filePath)
        tracks = resolved.subtitleTracks ?? []
      } catch (err) {
        console.error('[useSubtitles] resolve server file for embedded subtitles failed:', err)
        return 0
      }
      if (tracks.length === 0) return 0

      const loaded: SubtitleTrack[] = []
      for (const track of tracks) {
        try {
          const result = await extractEmbeddedSubtitle(filePath, track.index)
          const cues = parseSubtitle(result.content, 'srt')
          const label = track.title || track.language || `轨道 ${track.index}`
          loaded.push({ cues, label, lang: track.language || undefined })
        } catch (err) {
          console.error('[useSubtitles] extract embedded subtitle failed:', track.index, err)
        }
      }

      if (loaded.length === 0) return 0

      setState((prev) => {
        const next: SubtitleState = {
          ...prev,
          subtitleTracks: [...prev.subtitleTracks, ...loaded],
          subtitleEnabled: prev.subtitleEnabled || prev.subtitleTracks.length === 0,
          activeTrackIndex: prev.subtitleTracks.length === 0 ? 0 : prev.activeTrackIndex,
        }
        broadcast(next)
        return next
      })
      return loaded.length
    },
    [isHost, broadcast]
  )

  const setFontSize = useCallback(
    (size: number) => {
      setState((prev) => {
        const next: SubtitleState = { ...prev, subtitleFontSize: size }
        broadcast(next)
        return next
      })
    },
    [broadcast]
  )

  const setOffset = useCallback(
    (offset: number) => {
      setState((prev) => {
        const next: SubtitleState = { ...prev, subtitleOffset: offset }
        broadcast(next)
        return next
      })
    },
    [broadcast]
  )

  // 观众：接收房主的字幕广播
  useEffect(() => {
    if (!socket || isHost) return
    const handler = (
      payload: Partial<SubtitleBroadcastPayload> | undefined
    ) => {
      if (!payload) return
      setState((prev) => ({
        subtitleEnabled: payload.enabled ?? prev.subtitleEnabled,
        subtitleTracks: payload.tracks ?? prev.subtitleTracks,
        activeTrackIndex: payload.activeIndex ?? prev.activeTrackIndex,
        subtitleFontSize: payload.fontSize ?? prev.subtitleFontSize,
        subtitleOffset: payload.offset ?? prev.subtitleOffset,
      }))
    }
    socket.on('subtitle-update', handler)
    return () => {
      socket.off('subtitle-update', handler)
    }
  }, [socket, isHost])

  return {
    ...state,
    setEnabled,
    setActiveTrack,
    addTrackFromUrl,
    addTrackFromFile,
    addTrackFromContent,
    clearTracks,
    searchAutoSubtitles,
    loadEmbeddedSubtitles,
    setFontSize,
    setOffset,
  }
}
