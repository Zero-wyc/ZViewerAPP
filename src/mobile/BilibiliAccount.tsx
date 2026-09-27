import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { message } from '@/components/ui/message'
import { embeddedBilibiliProxy, isEmbeddedAndroid, startEmbeddedProxy, useEmbeddedProxyStatus } from '../platform/bilibiliProxy'
import type { BilibiliQrSession } from '../platform/contracts'

export function BilibiliAccount() {
  const proxy = useEmbeddedProxyStatus()
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<BilibiliQrSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const generation = useRef(0)
  useEffect(() => { void startEmbeddedProxy() }, [])
  useEffect(() => {
    if (!open || !qr) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const result = await embeddedBilibiliProxy.pollQr(qr.qrcodeKey)
        if (cancelled) return
        if (result.loggedIn) { setQr(null); message.success('已登录，默认自动最高画质'); return }
        if (result.status === 3) { setError('二维码已过期，请重新获取'); return }
        setStatus(result.status === 1 ? '已扫码，请在 B 站确认登录' : '等待扫码')
        timer = setTimeout(poll, 2500)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '登录检查失败，请重试')
      }
    }
    void poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [open, qr])
  const close = () => {
    generation.current++
    setOpen(false); setQr(null); setBusy(false)
    void embeddedBilibiliProxy.cancelQr().catch(() => {})
  }
  const login = async () => {
    const seq = ++generation.current
    setBusy(true); setError(''); setQr(null)
    try {
      await startEmbeddedProxy()
      const result = await embeddedBilibiliProxy.createQr()
      if (seq === generation.current) setQr(result)
    } catch (err) { if (seq === generation.current) setError(err instanceof Error ? err.message : '获取二维码失败') }
    finally { if (seq === generation.current) setBusy(false) }
  }
  if (!isEmbeddedAndroid()) return null
  return <>
    <button className="mobile-text-button" type="button" onClick={() => setOpen(true)}>B 站账号{proxy.loggedIn ? ' · 已登录' : ''}</button>
    <Modal open={open} title="B 站账号" onClose={close} footer={null}>
      {proxy.loggedIn ? <div className="bili-account-panel">
        <p>{proxy.user?.name || 'B 站用户'} · {proxy.user?.vipStatus ? '大会员' : '普通账号'}</p>
        <p>默认自动选择本机可播放的最高普通画质；高画质不可用时优先 720p。自动模式排除 HDR 和杜比视界。</p>
        <button className="mobile-text-button" onClick={() => void embeddedBilibiliProxy.logout().catch(err => setError(String(err)))}>退出 B 站登录</button>
      </div> : <div className="bili-account-panel">
        <p>登录后默认自动最高画质。登录凭据加密保存在本机，不发送给 ZViewer 服务器。</p>
        <button className="mobile-text-button" disabled={busy} onClick={() => void login()}>{busy ? '正在获取二维码' : qr ? '重新获取二维码' : '获取登录二维码'}</button>
        {qr && <>
          <img src={qr.qrDataUrl} alt="B站登录二维码" style={{ width: 220, maxWidth: '100%', display: 'block', margin: '16px auto' }} />
          <p>{status}</p>
          <button className="mobile-text-button" onClick={() => void embeddedBilibiliProxy.saveQr().then(() => message.success('二维码已保存或已打开分享入口')).catch(err => setError(String(err)))}>保存二维码</button>
          <p>同一手机可保存二维码后，在 B 站“扫一扫”中从相册识别；也可使用另一设备扫码。</p>
        </>}
      </div>}
      {(error || proxy.error) && <p role="alert">{error || proxy.error}</p>}
    </Modal>
  </>
}
