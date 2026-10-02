/**
 * 添加视频弹窗：响应式布局与移动端主题共用，内容在安全区内滚动。
 *
 * 标题 + B站账号/二维码 + BV号输入 + 视频信息/分P + 搜索/删除。
 * 挂载到 body，避免完整播放器的动画与 overflow 裁切弹窗。
 *
 * 与 Hydrogen 的差异（Web 架构约束）：
 * - 登录复用 ZViewer 的 B站扫码链路（/api/stream/bilibili/*），二维码内嵌
 *   在账号区轮询（Hydrogen 为 Electron 窗口 API + session cookie）
 * - 无本地视频下载缓存与「视频插入点」时间段概念：搜索到视频后即写入
 *   本地关联（musicVideoStore，按 songId 保存），供完整播放器视频背景消费；
 *   删除按钮语义为解除当前歌曲的视频关联
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  getBilibiliLoginStatus,
  getBilibiliUserInfo,
  getBilibiliQrCode,
  pollBilibiliQrCode,
  logoutBilibili,
  getBilibiliVideoView,
  type BilibiliVideoViewInfo,
} from '@/modules/bilibili/bilibiliApi'
import type { BilibiliUserInfo, BilibiliQrData } from '@/modules/bilibili/types'
import {
  buildBilibiliImageProxyUrl,
  isBilibiliImageUrl,
} from '@/modules/room/watch-together/resolveSource'
import { message } from '@/components/ui/message'
import {
  getMusicVideo,
  removeMusicVideo,
  setMusicVideo,
} from '../musicVideoStore'

/** 二维码轮询间隔（ms，Hydrogen 3s，ZViewer MoviePushPanel 为 2s） */
const QR_POLL_INTERVAL_MS = 2000

/** B站 图片展示兜底：hdslb 直链在应用内被 Referer 防盗链拦截（403），
 *  统一走 /api/stream/proxy-image 代理（与队列/收藏/评论/一起看侧同一
 *  范式；账号头像与视频封面均为后端透传的原始直链） */
function toDisplayableBiliImage(url: string): string {
  return isBilibiliImageUrl(url) ? buildBilibiliImageProxyUrl(url) : url
}

interface MusicVideoModalProps {
  /** 当前歌曲 songId（视频关联按歌曲保存） */
  songId: number
  /** 当前歌曲名（标题 ADD VIDEO FOR 后的粉色文字） */
  songName: string
  onClose: () => void
}

/** 从输入提取 BV 号：支持完整链接（含 /video/BVxxx）或裸 BV 号 */
function extractBvid(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const urlMatch = text.match(/video\/(BV[0-9A-Za-z]{10})/)
  if (urlMatch) return urlMatch[1]
  const bare = text.match(/^BV[0-9A-Za-z]{10}$/)
  if (bare) return bare[0]
  const embedded = text.match(/(BV[0-9A-Za-z]{10})/)
  return embedded ? embedded[1] : null
}

export function MusicVideoModal({
  songId,
  songName,
  onClose,
}: MusicVideoModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); closeRef.current() }
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input')
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const closeOnBack = (event: Event) => { event.stopImmediatePropagation(); closeRef.current() }
    window.addEventListener('keydown', closeOnKey, true)
    window.addEventListener('mobile-room-back', closeOnBack, true)
    return () => {
      window.removeEventListener('keydown', closeOnKey, true)
      window.removeEventListener('mobile-room-back', closeOnBack, true)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  const [biliUser, setBiliUser] = useState<BilibiliUserInfo | null>(null)
  const [loginStatusLoaded, setLoginStatusLoaded] = useState(false)
  // 扫码登录态：null=非登录流程；显示二维码 + 轮询状态文字
  const [qrLogin, setQrLogin] = useState<BilibiliQrData | null>(null)
  const [qrStatusText, setQrStatusText] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<BilibiliVideoViewInfo | null>(null)
  const [selectedCid, setSelectedCid] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  /** 当前已加载视频信息的 BV 号（分 P 切换写关联用） */
  const [loadedBvid, setLoadedBvid] = useState('')
  // 打开时按已保存的关联回填（BV号 + 视频信息 + 分P）
  const prefillSongIdRef = useRef<number | null>(null)

  // 打开时加载账号状态（Hydrogen 打开弹窗时校验已存 cookie 同语义）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loggedIn = await getBilibiliLoginStatus()
      if (cancelled) return
      if (loggedIn) {
        const info = await getBilibiliUserInfo()
        if (!cancelled) setBiliUser(info)
      }
      if (!cancelled) setLoginStatusLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 二维码轮询：2s 一次；status 2=登录成功（后端已存 cookie）、3=过期重新生成
  useEffect(() => {
    if (!qrLogin) return
    let cancelled = false
    const poll = async () => {
      try {
        const result = await pollBilibiliQrCode(qrLogin.qrcodeKey)
        if (cancelled) return
        if (result.status === 2) {
          setQrLogin(null)
          setQrStatusText('')
          message.success('B站 登录成功')
          const info = await getBilibiliUserInfo()
          if (!cancelled) setBiliUser(info)
          return
        }
        if (result.status === 3) {
          setQrStatusText('二维码已过期，正在重新生成...')
          const fresh = await getBilibiliQrCode()
          if (!cancelled) setQrLogin(fresh)
          return
        }
        setQrStatusText(
          result.status === 1 ? '已扫码，请在手机上确认' : '请使用 B站 App 扫码'
        )
      } catch (err) {
        if (!cancelled)
          setQrStatusText(
            err instanceof Error ? err.message : '二维码状态获取失败'
          )
      }
    }
    void poll()
    const timer = setInterval(poll, QR_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrLogin])

  // 打开时回填已保存的视频关联（每首歌曲只回填一次，避免覆盖用户编辑）
  useEffect(() => {
    if (prefillSongIdRef.current === songId) return
    prefillSongIdRef.current = songId
    void (async () => {
      const saved = getMusicVideo(songId)
      if (!saved) return
      setVideoUrl(saved.bvid)
      setLoadedBvid(saved.bvid)
      try {
        const info = await getBilibiliVideoView(saved.bvid)
        setVideoInfo(info)
        setSelectedCid(saved.cid)
      } catch {
        // 回填信息失败不影响已有关联（背景照常播放）
      }
    })()
  }, [songId])

  /** 登录 / 退出（Hydrogen loginOrLogout 同语义） */
  const handleLoginOrLogout = useCallback(async () => {
    if (biliUser) {
      try {
        await logoutBilibili()
        setBiliUser(null)
        message.success('已退出登录')
      } catch (err) {
        message.error(err instanceof Error ? err.message : '退出失败')
      }
      return
    }
    if (qrLogin) return
    try {
      const qr = await getBilibiliQrCode()
      setQrLogin(qr)
      setQrStatusText('请使用 B站 App 扫码')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取二维码失败')
    }
  }, [biliUser, qrLogin])

  /** 搜索（Hydrogen search/checkUrl 同语义：取 BV → x/web-interface/view）；
      搜索成功即写入歌曲的视频关联（选定默认分 P），供视频背景消费 */
  const handleSearch = useCallback(async () => {
    const bvid = extractBvid(videoUrl)
    if (!bvid) {
      message.info('请输入视频链接或BV号')
      return
    }
    setSearching(true)
    try {
      const info = await getBilibiliVideoView(bvid)
      setVideoInfo(info)
      setLoadedBvid(bvid)
      const cid = info.pages.length > 0 ? info.pages[0].cid : info.cid
      setSelectedCid(cid)
      setMusicVideo(songId, {
        bvid,
        cid,
        title: info.title,
        cover: info.pic,
        upName: info.upName,
      })
      message.success('已设置为该歌曲的视频背景')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取视频信息失败')
    } finally {
      setSearching(false)
    }
  }, [videoUrl, songId])

  /** 切换分 P：更新关联的 cid（视频背景下次解析生效） */
  const handleSelectPage = useCallback(
    (cid: number) => {
      setSelectedCid(cid)
      if (!videoInfo || !loadedBvid) return
      setMusicVideo(songId, {
        bvid: loadedBvid,
        cid,
        title: videoInfo.title,
        cover: videoInfo.pic,
        upName: videoInfo.upName,
      })
    },
    [videoInfo, loadedBvid, songId]
  )

  /** 删除（解除当前歌曲的视频关联，视频背景回退封面模糊） */
  const handleDelete = useCallback(() => {
    removeMusicVideo(songId)
    setVideoInfo(null)
    setSelectedCid(null)
    setVideoUrl('')
    setLoadedBvid('')
    message.info('已解除该歌曲的视频关联')
  }, [songId])


  return createPortal(
    <div className="music-video-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="music-video-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="music-video-modal-header">
          <div className="min-w-0">
            <h2 id={titleId}>添加视频</h2>
            <p>ADD VIDEO FOR <span title={songName}>{songName || 'Music'}</span></p>
          </div>
          <button type="button" aria-label="关闭添加视频" onClick={onClose}><X aria-hidden="true" size={24} /></button>
        </header>
        <div className="music-video-modal-body">
          <div className="music-video-account-row">
            <div className="music-video-account">
              <small>BILIBILI ACCOUNT</small>
              {qrLogin ? (
                <div className="music-video-account-details">
                  <img src={qrLogin.qrDataUrl} alt="登录二维码" className="music-video-qr" />
                  <span className="min-w-0">{qrStatusText}</span>
                </div>
              ) : loginStatusLoaded && biliUser ? (
                <div className="music-video-account-details">
                  <img src={toDisplayableBiliImage(biliUser.avatar)} alt="B站头像" className="music-video-avatar"
                    onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
                  <div className="min-w-0">
                    <p className="truncate" title={biliUser.name}>{biliUser.name}</p>
                    <p>大会员：{biliUser.vipStatus ? '已激活' : '未激活'}</p>
                  </div>
                </div>
              ) : <p className="music-video-empty-account">{loginStatusLoaded ? '未登录' : '加载中…'}</p>}
            </div>
            <button type="button" className="music-video-action" onClick={() => void handleLoginOrLogout()}>
              {biliUser ? '退出' : '登录'}
            </button>
          </div>
          <input className="music-video-url" type="text" aria-label="视频链接或BV号" spellCheck={false}
            value={videoUrl} placeholder="请输入视频链接或BV号" onChange={event => setVideoUrl(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleSearch() }} />
          <div className="music-video-info-row">
            <div className="music-video-info">
              <h3>视频信息</h3><small>VIDEO INFO</small>
              {videoInfo ? (
                <>
                  <div className="music-video-preview">
                    <img src={toDisplayableBiliImage(videoInfo.pic)} alt="视频封面"
                      onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
                    <div className="min-w-0">
                      <p className="line-clamp-2" title={videoInfo.title}>{videoInfo.title}</p>
                      <small className="block truncate" title={videoInfo.upName}>UP：{videoInfo.upName}</small>
                    </div>
                  </div>
                  {videoInfo.pages.length > 1 && (
                    <div className="music-video-pages" aria-label="视频分P">
                      {videoInfo.pages.map(page => (
                        <button type="button" key={page.cid} aria-pressed={selectedCid === page.cid}
                          onClick={() => handleSelectPage(page.cid)} title={page.part}>
                          {page.part || `P${page.page}`}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : <p className="music-video-empty">{searching ? '搜索中…' : '暂无视频'}</p>}
            </div>
            <div className="music-video-actions">
              <button type="button" className="music-video-action" disabled={searching} onClick={() => void handleSearch()}>
                {searching ? '搜索中…' : '搜索'}
              </button>
              <button type="button" className="music-video-action" onClick={handleDelete}>删除</button>
            </div>
          </div>
        </div>
      </section>
    </div>, document.body
  )
}
