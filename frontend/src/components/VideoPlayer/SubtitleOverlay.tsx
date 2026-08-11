/**
 * 自定义字幕渲染层
 *
 * 替代浏览器原生 <track> + ::cue 渲染方式，
 * 直接用 HTML/CSS 渲染 ParsedCue[]，完整保留各字幕格式的位置/对齐/样式信息。
 *
 * 设计要点：
 * - 监听 video 的 timeupdate / seeked 事件，根据当前时间查找激活的 cue
 * - 根据 cue.line / cue.position / cue.align 精确定位字幕
 * - 支持 HTML 格式文本（<b>/<i>/<u>/<s>/<br>/<span style="color:...">）
 * - pointer-events: none，不阻挡视频交互
 * - 仅当激活 cue 集合变化时更新 state，避免不必要重渲染
 */

import { useEffect, useRef, useState } from 'react'
import type { ParsedCue } from '@/lib/subtitleParser'

interface SubtitleOverlayProps {
  video: HTMLVideoElement | null
  cues: ParsedCue[]
  enabled: boolean
  fontSize: number
  offset: number // 秒，正值延迟显示
}

/** 计算字幕元素的 CSS transform */
function getTransform(line: number, align: 'left' | 'center' | 'right'): string {
  const translateX = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0%'
  const translateY = line > 50 ? '-100%' : '0%'
  return `translate(${translateX}, ${translateY})`
}

export function SubtitleOverlay({
  video,
  cues,
  enabled,
  fontSize,
  offset,
}: SubtitleOverlayProps) {
  const [activeCues, setActiveCues] = useState<ParsedCue[]>([])
  // 缓存上次激活的 cue 索引字符串，避免不必要的状态更新
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (!video || !enabled || cues.length === 0) {
      setActiveCues([])
      lastKeyRef.current = ''
      return
    }

    const update = () => {
      const time = video.currentTime - offset
      const active: ParsedCue[] = []
      for (let i = 0; i < cues.length; i++) {
        if (time >= cues[i].start && time < cues[i].end) {
          active.push(cues[i])
        }
      }
      // 仅当激活 cue 集合变化时更新 state
      const key = active.map((c) => `${c.start}:${c.end}`).join('|')
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key
        setActiveCues(active)
      }
    }

    video.addEventListener('timeupdate', update)
    video.addEventListener('seeked', update)
    video.addEventListener('play', update)
    update()

    return () => {
      video.removeEventListener('timeupdate', update)
      video.removeEventListener('seeked', update)
      video.removeEventListener('play', update)
    }
  }, [video, cues, enabled, offset])

  if (!enabled || activeCues.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      style={{ overflow: 'hidden' }}
    >
      {activeCues.map((cue, i) => {
        const line = cue.line ?? 100
        const position = cue.position ?? 50
        const align = cue.align ?? 'center'

        return (
          <div
            key={`${cue.start}:${cue.end}:${i}`}
            dangerouslySetInnerHTML={{ __html: cue.text }}
            style={{
              position: 'absolute',
              left: `${position}%`,
              top: `${line}%`,
              transform: getTransform(line, align),
              maxWidth: '90%',
              fontSize: `${fontSize}px`,
              lineHeight: '1.4',
              color: '#ffffff',
              backgroundColor: 'transparent',
              textShadow:
                '0 0 4px rgba(0, 0, 0, 0.9), 0 1px 3px rgba(0, 0, 0, 0.9)',
              textAlign: align,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              padding: '0 8px',
            }}
          />
        )
      })}
    </div>
  )
}
