import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { message } from '@/components/ui/message'
import { useNcmLogin } from '../hooks/useNcmLogin'

/** Credentials live only in this mounted dialog; explicit user action reads/copies them. */
export function MusicCookieModal({ onClose }: { onClose: () => void }) {
  const { cookieLogin, readCookie } = useNcmLogin()
  const [cookie, setCookie] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const close = () => { alive.current = false; setCookie(''); onClose() }
  useEffect(() => {
    alive.current = true
    const back = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') back(e) }
    window.addEventListener('zviewer:native-back', back, true)
    window.addEventListener('keydown', key, true)
    textarea.current?.focus()
    return () => { alive.current = false; window.removeEventListener('zviewer:native-back', back, true); window.removeEventListener('keydown', key, true) }
  }, [onClose])

  const submit = async () => {
    if (busy || !cookie.trim()) return
    setBusy(true)
    try {
      await cookieLogin(cookie)
      if (!alive.current) return
      setCookie('')
      message.success('网易云 Cookie 登录成功')
      close()
    } catch (err) { if (alive.current) message.error(err instanceof Error ? err.message : '登录失败') }
    finally { if (alive.current) setBusy(false) }
  }
  const copy = async () => {
    if (busy) return
    setBusy(true)
    try {
      const value = await readCookie()
      if (!alive.current) return
      if (!value) { message.info('尚未保存网易云 Cookie'); return }
      try {
        await navigator.clipboard.writeText(value)
        if (alive.current) { setCookie(''); message.success('Cookie 已复制') }
      } catch {
        if (!alive.current) return
        setCookie(value)
        setManualCopy(true)
        message.info('请长按文本手动复制，关闭弹窗后清空')
      }
    } catch (err) { if (alive.current) message.error(err instanceof Error ? err.message : '读取失败') }
    finally { if (alive.current) setBusy(false) }
  }
  return createPortal(
    <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.35)' }} onClick={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="ncm-cookie-title" className="glass-strong flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-auto rounded-[var(--md-sys-shape-corner)] p-5 text-[var(--md-sys-color-on-surface)]" onClick={e => e.stopPropagation()}>
        <h2 id="ncm-cookie-title" className="font-semibold">网易云 Cookie 登录</h2>
        <p className="text-sm">粘贴包含 MUSIC_U 的 Cookie 字符串或 Set-Cookie JSON 数组。</p>
        <textarea ref={textarea} aria-label="网易云 Cookie" className="min-h-32 w-full rounded border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface)] p-3 text-sm" value={cookie} readOnly={manualCopy} autoComplete="off" spellCheck={false} onChange={e => setCookie(e.target.value)} onFocus={e => { if (manualCopy) e.target.select() }} />
        {manualCopy && <Button className="min-h-11" onClick={() => { setCookie(''); setManualCopy(false) }}>清空并输入新 Cookie</Button>}
        <Button className="min-h-11" loading={busy} disabled={busy || !cookie.trim() || manualCopy} onClick={() => void submit()}>登录</Button>
        <Button className="min-h-11" disabled={busy} onClick={() => void copy()}>复制已保存 Cookie</Button>
        <Button className="min-h-11" onClick={close}>关闭</Button>
      </section>
    </div>, document.body,
  )
}
