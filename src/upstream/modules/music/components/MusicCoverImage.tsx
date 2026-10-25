import { useState, type ReactNode } from 'react'

/** 调用方按 src 设置 key，切曲后允许重新加载；失败时不显示破图或 alt 文本。 */
export function MusicCoverImage({ src, alt, className, fallback }: {
  src?: string
  alt: string
  className: string
  fallback: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{fallback}</>
  const referrerPolicy = /^https:\/\/(?:[a-z0-9-]+\.)*music\.126\.net(?=[:/])/i.test(src) ? 'no-referrer' : undefined
  return <img src={src} alt={alt} className={className} referrerPolicy={referrerPolicy} onError={() => setFailed(true)} />
}
