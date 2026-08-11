import { useState, useEffect, useRef } from 'react'
import { getSavedCookie, validateCookie, clearCookie, initQr, pollQr } from '@/lib/zviewer-plugin'

/**
 * B站 账号管理页（Android 原生插件）。
 * 未登录时自动生成二维码让用户扫码登录，已登录显示用户信息。
 */
export default function BilibiliAccountPage() {
  const [userName, setUserName] = useState('')
  const [valid, setValid] = useState<boolean | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [qrStatus, setQrStatus] = useState('')
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 加载已保存的 cookie
  useEffect(() => {
    loadSavedCookie()
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  const loadSavedCookie = async () => {
    try {
      const saved = await getSavedCookie()
      if (saved.cookie) {
        setUserName(saved.userName)
        const result = await validateCookie(saved.cookie)
        setValid(result.valid)
        if (result.valid && result.userName) setUserName(result.userName)
        if (!result.valid) startQrLogin()
      } else {
        setValid(false)
        startQrLogin()
      }
    } catch {
      setValid(false)
      startQrLogin()
    }
  }

  // 自动生成二维码并开始轮询
  const startQrLogin = async () => {
    try {
      const qr = await initQr()
      setQrUrl(qr.qrUrl)
      setQrStatus('请使用手机 B站 扫码登录')

      pollIntervalRef.current = setInterval(async () => {
        try {
          const result = await pollQr(qr.qrcodeKey)
          if (result.cookieValid) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            setQrStatus('扫码成功!')
            setQrUrl('')
            // 重新加载 cookie 信息
            const saved = await getSavedCookie()
            if (saved.userName) setUserName(saved.userName)
            setValid(true)
          } else if (result.status === 3) {
            // 二维码过期，重新生成
            clearInterval(pollIntervalRef.current!)
            setQrUrl('')
            setQrStatus('二维码已过期，重新生成...')
            startQrLogin()
          } else {
            setQrStatus(result.message || '等待扫码...')
          }
        } catch {
          // 轮询失败重试
        }
      }, 2000)
    } catch (e) {
      setQrStatus('生成二维码失败: ' + (e as Error).message)
    }
  }

  const handleClear = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    await clearCookie()
    setUserName('')
    setValid(false)
    setQrUrl('')
    startQrLogin()
  }

  return (
    <div style={{ padding: '24px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>B站 账号</h1>
      <p style={{ fontSize: 14, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 24 }}>
        手机端独立登录，Cookie 持久化保存在本地
      </p>

      {/* 已登录 */}
      {valid === true && (
        <>
          <div style={{
            padding: 16, borderRadius: 12, marginBottom: 16,
            background: 'var(--md-sys-color-primary-container)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>✅ 已登录</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>用户名: {userName}</div>
          </div>
          <button onClick={handleClear}
            style={{
              width: '100%', padding: 14, borderRadius: 8,
              border: '1px solid var(--md-sys-color-outline)',
              background: 'transparent', color: 'var(--md-sys-color-on-surface)',
              fontSize: 14, cursor: 'pointer',
            }}>
            清除登录
          </button>
        </>
      )}

      {/* 未登录：直接显示二维码 */}
      {valid === false && qrUrl && (
        <div style={{
          padding: 24, borderRadius: 16,
          background: 'var(--md-sys-color-surface-container)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, marginBottom: 16, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {qrStatus}
          </div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}`}
            alt="B站 扫码登录"
            style={{ width: 240, height: 240, borderRadius: 12 }}
          />
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
            打开手机 B站 APP → 扫一扫
          </div>
        </div>
      )}

      {/* 未登录 + 二维码加载中 */}
      {valid === false && !qrUrl && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
          正在生成二维码...
        </div>
      )}
    </div>
  )
}