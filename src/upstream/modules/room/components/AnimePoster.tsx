import { useEffect, useState } from 'react'
import { apiFetch, getApiUrl } from '@/lib/api'

/** Direct images first; blocked hosts fall back to the selected server's authenticated proxy. */
export function AnimePoster({ cover, title, kind, referer }: {
  cover?: string
  title: string
  kind: 'kazumi' | 'anisubs' | 'cms'
  referer: string
}) {
  const server = getApiUrl()
  const identity = JSON.stringify([server, kind, cover, referer])
  const [failed, setFailed] = useState<string | null>(null)
  const [proxy, setProxy] = useState<{ identity: string; url: string } | null>(null)
  const [proxyFailed, setProxyFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!cover || failed !== identity) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    const params = new URLSearchParams({ url: cover, referer })
    void apiFetch(`${server}/api/stream/${kind}/proxy?${params}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) return
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setProxy({ identity, url: objectUrl })
      }).catch(() => { /* The browser remains usable with its placeholder. */ })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [cover, failed, identity, kind, referer, server])
  const proxied = proxy?.identity === identity ? proxy.url : undefined
  if (!cover || (failed === identity && !proxied) || proxyFailed === identity) return null
  return <img key={identity} src={proxied || cover} alt={title} loading="lazy" referrerPolicy="no-referrer"
    className="relative h-full w-full object-cover"
    onError={() => { if (proxied) setProxyFailed(identity); else setFailed(identity) }} />
}
