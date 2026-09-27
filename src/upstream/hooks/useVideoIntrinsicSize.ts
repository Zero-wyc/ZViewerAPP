import { useEffect, useState } from 'react'

export interface VideoIntrinsicSize {
  width: number
  height: number
}

/**
 * 实时监听 video 元素固有分辨率（intrinsic size）。
 *
 * HTMLVideoElement.videoWidth / videoHeight 反映的是当前解码视频的真实像素尺寸，
 * 比从 qn / 清晰度标签推断更可靠。当视频切换清晰度或 MSE 轨道变化时，
 * 浏览器会触发 `resize` 事件，本 Hook 据此实时更新。
 *
 * 注意：videoWidth / videoHeight 在元数据就绪前为 0，调用方可结合
 * `readyState` 或传入选项判断是否显示回退值。
 */
export function useVideoIntrinsicSize(
  video: HTMLVideoElement | null
): VideoIntrinsicSize | null {
  const [size, setSize] = useState<VideoIntrinsicSize | null>(() => {
    if (!video) return null
    const w = video.videoWidth
    const h = video.videoHeight
    return w > 0 && h > 0 ? { width: w, height: h } : null
  })

  // React Compiler 严格规则误报：size 是 video  intrinsic size 的同步映射。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!video) {
      setSize(null)
      return
    }

    const update = () => {
      const w = video.videoWidth
      const h = video.videoHeight
      setSize((prev) => {
        if (w > 0 && h > 0) {
          if (prev && prev.width === w && prev.height === h) return prev
          return { width: w, height: h }
        }
        return prev
      })
    }

    // 初始同步一次，防止事件触发前尺寸已就绪
    update()

    // 关键事件：loadedmetadata 初次拿到尺寸；resize 清晰度/轨道切换后更新
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('resize', update)
    // canplay 作为兜底：某些浏览器在 buffer 切换后不触发 resize
    video.addEventListener('canplay', update)

    return () => {
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('resize', update)
      video.removeEventListener('canplay', update)
    }
  }, [video])
  /* eslint-enable react-hooks/set-state-in-effect */

  return size
}
