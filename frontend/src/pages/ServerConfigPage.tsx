import { useState } from 'react'
import { getCustomApiUrl, setCustomApiUrl } from '@/lib/api'

/**
 * Android 专用：服务器地址配置页。
 *
 * 客户端-服务端分离架构下，用户需填写自己的 ZViewer 服务器地址才能使用。
 * 首次启动显示此页，配置后保存到 localStorage，并刷新进入正常应用。
 */
export default function ServerConfigPage() {
  const [url, setUrl] = useState(getCustomApiUrl())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('请输入服务器地址')
      return
    }
    // 简单校验：必须含协议
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('地址需以 http:// 或 https:// 开头')
      return
    }
    setSaving(true)
    // 保存地址并刷新，让 App 用新地址重新初始化
    setCustomApiUrl(trimmed)
    window.location.reload()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--md-sys-color-surface)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '32px 24px',
          borderRadius: '16px',
          background: 'var(--md-sys-color-surface-container)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 8,
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          ZViewer
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--md-sys-color-on-surface-variant)',
            marginBottom: 24,
          }}
        >
          请输入您的 ZViewer 服务器地址以继续。服务器由您或您的团队提供。
        </p>

        <label
          style={{
            display: 'block',
            fontSize: 13,
            color: 'var(--md-sys-color-on-surface-variant)',
            marginBottom: 8,
          }}
        >
          服务器地址
        </label>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError('')
          }}
          placeholder="https://your-server.com"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid var(--md-sys-color-outline)',
            background: 'var(--md-sys-color-surface)',
            color: 'var(--md-sys-color-on-surface)',
            fontSize: 15,
            outline: 'none',
          }}
        />

        {error && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--md-sys-color-error)',
              marginTop: 8,
            }}
          >
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 24,
            width: '100%',
            padding: '14px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--md-sys-color-primary)',
            color: 'var(--md-sys-color-on-primary)',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          连接
        </button>
      </div>
    </div>
  )
}