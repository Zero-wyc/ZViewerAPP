import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { useRoomStore } from '@/store/roomStore'
import { embeddedBilibiliProxy, startEmbeddedProxy, useEmbeddedProxyStatus } from '../../../../platform/bilibiliProxy'
import { BilibiliAccount } from '../../../../mobile/BilibiliAccount'

export function ViewerCliRequiredOverlay() {
  const movieId = useRoomStore(s => s.viewerCliRequiredMovieId)
  const reload = useRoomStore(s => s.triggerViewerSourceReload)
  const movie = useRoomStore(s => s.movies.find(m => m.id === movieId))
  const proxy = useEmbeddedProxyStatus()
  useEffect(() => { if (movieId != null && proxy.ready && proxy.loggedIn) reload() }, [movieId, proxy.ready, proxy.loggedIn, proxy.sessionVersion, reload])
  if (movieId == null) return null
  return <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center backdrop-blur-sm">
    <ShieldCheck className="h-10 w-10" />
    <p>「{movie?.title || '当前影片'}」要求每位成员使用本机 B 站账号播放。</p>
    <p className="text-sm">请登录 B 站并启动内置代理后重试。播放资格取决于本机账号。</p>
    <BilibiliAccount />
    <button type="button" className="flex items-center gap-2 rounded-md border px-4 py-3" onClick={() => { void startEmbeddedProxy().then(() => embeddedBilibiliProxy.refresh()).then(reload) }}><RefreshCw size={18} />启动代理并重试</button>
  </div>
}
