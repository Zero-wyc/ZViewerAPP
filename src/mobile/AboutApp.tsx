import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, Info, RefreshCw, X } from 'lucide-react'
import { registerOverlayBack } from '@/components/ui/overlayBack'
import { getRuntimePlatform } from '../platform/runtime'
import { installedAppVersion, openReleaseLink } from '../platform/appUpdates'
import { checkAppUpdate, RELEASES_URL, type AppUpdate, type UpdatePlatform } from './appUpdates'
import './about-app.css'
let automaticChecked = false

export function AboutApp() {
  const [open, setOpen] = useState(false), [update, setUpdate] = useState<AppUpdate | null>(null)
  const [info, setInfo] = useState<{ version: string; build: string } | null>(null)
  const [checking, setChecking] = useState(false), [message, setMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), operation = useRef<AbortController | null>(null)
  const platform = getRuntimePlatform(), supported = platform === 'android' || platform === 'harmony'
  const check = useCallback(async (automatic: boolean) => {
    operation.current?.abort()
    const controller = new AbortController(); operation.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setChecking(true); setMessage('')
    try {
      const current = await installedAppVersion()
      if (controller.signal.aborted) return
      setInfo(current)
      if (!supported) { setMessage('请在安卓或鸿蒙应用中检查对应安装包更新'); return }
      const latest = await checkAppUpdate(platform as UpdatePlatform, current.version, controller.signal)
      if (controller.signal.aborted) return
      setUpdate(latest); setMessage(latest ? '发现新版本，下载后按系统提示安装。' : '当前已是最新版本')
      if (automatic && latest) setOpen(true)
    } catch (error) {
      if (operation.current === controller && !automatic) setMessage(controller.signal.aborted ? '检查超时，请检查网络后重试' : error instanceof Error ? error.message : '检查失败，请稍后重试')
    } finally {
      clearTimeout(timeout)
      if (automatic && !controller.signal.aborted) automaticChecked = true
      if (operation.current === controller) { operation.current = null; setChecking(false) }
    }
  }, [platform, supported])
  useEffect(() => { if (!automaticChecked) void check(true); else void installedAppVersion().then(setInfo).catch(() => {}); return () => operation.current?.abort() }, [check])
  useEffect(() => {
    if (!open) return
    dialog.current?.showModal()
    const remove = registerOverlayBack(() => setOpen(false))
    return () => { remove(); dialog.current?.close() }
  }, [open])
  const visit = async (url: string) => { try { await openReleaseLink(url) } catch (error) { setMessage(error instanceof Error ? error.message : '无法打开浏览器') } }
  return <>
    <button type="button" className="icon-button about-entry" aria-label="关于应用" title="关于应用" onClick={() => setOpen(true)}><Info size={20} /></button>
    <dialog ref={dialog} className="about-dialog" aria-labelledby="about-title" onCancel={event => { event.preventDefault(); setOpen(false) }} onClick={event => { if (event.target === dialog.current) { const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false) } }}>
      <div className="about-heading"><div><span className="eyebrow">ZVIEWER</span><h2 id="about-title">关于应用</h2></div><button type="button" className="icon-button" aria-label="关闭关于应用" onClick={() => setOpen(false)}><X size={22} /></button></div>
      <div className="about-identity"><div className="brand-mark">Z</div><div><strong>ZViewer</strong><p>和朋友一起看，一起听。</p></div></div>
      <div className="about-version"><span>当前版本</span><strong>{info ? `V${info.version}` : '读取中…'}</strong><small>{platform === 'harmony' ? 'HarmonyOS' : platform === 'android' ? 'Android' : '界面预览'}{info?.build ? ` · 构建 ${info.build}` : ''}</small></div>
      <button type="button" className="primary-button" disabled={checking} onClick={() => void check(false)}><RefreshCw size={18} className={checking ? 'spin' : ''} />{checking ? '正在检查更新…' : '检查更新'}</button>
      <p className="about-status" role="status">{message || '每次启动时自动检查，有新版本会提醒你。'}</p>
      {update && <section className="about-update"><div className="about-release-title"><strong>新版本 V{update.version}</strong><span>{(update.size / 1024 / 1024).toFixed(1)} MB</span></div><pre>{update.notes.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1') || '此版本包含体验改进与问题修复。'}</pre><button type="button" className="primary-button" onClick={() => void visit(update.downloadUrl)}><Download size={18} />下载{platform === 'harmony' ? '鸿蒙' : '安卓'}安装包</button><p>将在系统浏览器下载；安装方式与现有版本一致。</p></section>}
      <button type="button" className="about-release-link" onClick={() => void visit(update?.releaseUrl || RELEASES_URL)}><ExternalLink size={16} />查看发布记录</button>
    </dialog>
  </>
}
