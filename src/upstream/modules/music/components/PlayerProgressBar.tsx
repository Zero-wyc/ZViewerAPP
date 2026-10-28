import { useEffect, useRef, useState } from 'react'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { formatDuration } from '@/lib/utils'
export function PlayerProgressBar({
  durationSec,
  canControl,
  currentKey,
  seekLock,
  onSeek,
  onRequestSeek,
}: {
  durationSec: number
  canControl: boolean
  currentKey: string | null
  /** seek 等位锁快照（父级持有：进度条拖动与歌词行点击共用） */
  seekLock: { key: string | null; sec: number } | null
  /** 执行 seek 并挂等位锁（父级实现：seek + setSeekLock） */
  onSeek: (sec: number) => void
  /** 观众 seek 申请路径（可选；缺省时进度条观众只读） */
  onRequestSeek?: (sec: number) => void
}) {
  const positionSec = usePlaybackPosition(0.25)
  const [preview, setPreview] = useState<number | null>(null)
  const pointer = useRef<number | null>(null)
  useEffect(() => { pointer.current = null; setPreview(null) }, [currentKey, canControl])
  const position = preview ?? (seekLock?.key === currentKey && Math.abs(positionSec - seekLock.sec) > .75 ? seekLock.sec : positionSec)
  const clamp = (time: number) => Math.min(durationSec, Math.max(0, time))
  const commit = (time: number) => { if (canControl) onSeek(clamp(time)); else onRequestSeek?.(clamp(time)) }
  return <>
    <div className="music-player-progress-times"><span>{formatDuration(position)}</span><span>{formatDuration(durationSec)}</span></div>
    <div className="music-seek-wrap" data-dragging={preview != null}>
      {preview != null && <output className="music-seek-bubble" style={{ left: `${durationSec ? preview / durationSec * 100 : 0}%` }}>{formatDuration(preview)}</output>}
      <input type="range" aria-label={canControl ? '播放进度' : '播放进度（拖动将向房主申请调节）'} min="0" max={durationSec || 1} step="0.1"
        disabled={durationSec <= 0 || (!canControl && !onRequestSeek)} value={clamp(position)}
        style={{ '--seek-percent': `${durationSec ? clamp(position) / durationSec * 100 : 0}%` } as React.CSSProperties}
        onPointerDown={event => { if (event.isPrimary === false) return; pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId) }}
        onChange={event => { const value = Number(event.target.value); if (pointer.current != null) setPreview(value); else commit(value) }}
        onPointerUp={event => { if (pointer.current !== event.pointerId) return; pointer.current = null; commit(Number(event.currentTarget.value)); setPreview(null) }}
        onPointerCancel={() => { pointer.current = null; setPreview(null) }}
        onLostPointerCapture={() => { pointer.current = null; setPreview(null) }} />
    </div>
  </>
}
