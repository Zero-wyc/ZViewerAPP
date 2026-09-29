import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, ImagePlus, Palette, RotateCcw, X } from 'lucide-react'
import { radiusPresetToPx, RADIUS_PRESETS, useThemeStore } from '@/store/themeStore'

const DEFAULT_WALLPAPER = `${import.meta.env.BASE_URL}Nacho3.jpg`
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function Range({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string
  disabled?: boolean; onChange: (value: number) => void
}) {
  return <label className="appearance-range">
    <span><span>{label}</span><strong>{value}{unit}</strong></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={event => onChange(Number(event.target.value))} />
  </label>
}

export function MobileAppearance({ children }: { children: ReactNode }) {
  const theme = useThemeStore()
  const [open, setOpen] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [url, setUrl] = useState(theme.backgroundImage?.startsWith('data:') ? '' : theme.backgroundImage ?? '')
  const [imageError, setImageError] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('mobile-appearance-close', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mobile-appearance-close', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  const isDark = theme.mode === 'auto' ? systemDark : theme.isDark
  const appearance = {
    '--appearance-radius': `${radiusPresetToPx(theme.radius)}px`,
    '--appearance-glass': isDark
      ? `rgba(19, 27, 37, ${Math.max(.2, theme.glassStrength)})`
      : `rgba(247, 249, 255, ${Math.max(.2, theme.glassStrength)})`,
    '--appearance-blur': `${theme.reducedMotion ? 0 : theme.glassBlur}px`,
  } as CSSProperties

  const setImageUrl = () => {
    const next = url.trim()
    if (next && !/^https?:\/\//i.test(next)) {
      setImageError('请输入 http 或 https 图片链接')
      return
    }
    theme.setBackgroundImage(next || null)
    setImageError('')
  }

  const uploadImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError('请选择图片文件'); return }
    if (file.size > MAX_IMAGE_BYTES) { setImageError('图片不能超过 2 MB'); return }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') { setImageError('读取图片失败'); return }
      try {
        theme.setBackgroundImage(reader.result)
        setUrl('')
        setImageError('')
      } catch { setImageError('保存图片失败，请选择更小的图片') }
    }
    reader.onerror = () => setImageError('读取图片失败')
    reader.readAsDataURL(file)
  }

  return <main className="app-shell" data-appearance={isDark ? 'dark' : 'light'}
    data-reduced-motion={theme.reducedMotion} style={appearance}>
    <div className="appearance-wallpaper" aria-hidden="true" style={{
      backgroundImage: `url(${theme.backgroundImage || DEFAULT_WALLPAPER})`,
      filter: `blur(${theme.reducedMotion ? 0 : theme.backgroundBlur}px)`,
      opacity: theme.backgroundImage ? theme.backgroundOpacity : Math.min(theme.backgroundOpacity, .85),
      transform: `translate(${theme.backgroundPositionX / 2}%, ${theme.backgroundPositionY / 2}%) scale(${theme.backgroundScale}) rotate(${theme.backgroundRotate}deg)`,
    }} />
    {theme.backgroundWhiteOverlay > 0 && <div className="appearance-overlay" aria-hidden="true"
      style={{ background: `rgba(255,255,255,${theme.backgroundWhiteOverlay})` }} />}
    {theme.backgroundBlackOverlay > 0 && <div className="appearance-overlay" aria-hidden="true"
      style={{ background: `rgba(0,0,0,${theme.backgroundBlackOverlay})` }} />}
    <button type="button" className="appearance-trigger" aria-label="外观设置" title="外观设置"
      onClick={() => setOpen(true)}><Palette size={19} /></button>
    {children}
    {open && <div className="appearance-backdrop" onClick={() => setOpen(false)}>
      <section className="appearance-sheet" role="dialog" aria-modal="true" aria-label="外观设置" data-mobile-appearance
        onClick={event => event.stopPropagation()}>
        <header><div><span className="appearance-kicker">ZVIEWER · APPEARANCE</span><h2>外观设置</h2></div>
          <button type="button" className="appearance-close" aria-label="关闭外观设置" onClick={() => setOpen(false)}><X size={20} /></button>
        </header>
        <div className="appearance-scroll">
          <div className="appearance-group"><h3>显示</h3>
            <div className="appearance-segments" role="group" aria-label="深浅模式">
              {(['light', 'dark', 'auto'] as const).map(mode => <button key={mode} type="button"
                className={theme.mode === mode ? 'active' : ''} onClick={() => theme.setMode(mode)}>
                {mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统'}
              </button>)}
            </div>
            <div className="appearance-segments" role="group" aria-label="圆角">
              {RADIUS_PRESETS.map(preset => <button key={preset.value} type="button"
                className={theme.radius === preset.value ? 'active' : ''} onClick={() => theme.setRadius(preset.value)}>{preset.label}</button>)}
            </div>
            <Range label="玻璃透明度" value={Math.round(theme.glassStrength * 100)} min={20} max={100} unit="%"
              disabled={theme.reducedMotion} onChange={value => theme.setGlassStrength(value / 100)} />
            <Range label="卡片模糊度" value={theme.glassBlur} min={0} max={40} unit="px"
              disabled={theme.reducedMotion} onChange={theme.setGlassBlur} />
            <label className="appearance-toggle"><span>精简动画<small>关闭背景和卡片模糊</small></span>
              <input type="checkbox" checked={theme.reducedMotion} onChange={event => theme.setReducedMotion(event.target.checked)} /></label>
          </div>
          <div className="appearance-group"><h3>自定义背景</h3>
            <div className="appearance-preview" style={{ backgroundImage: `url(${theme.backgroundImage || DEFAULT_WALLPAPER})` }} />
            <div className="appearance-url"><input type="url" aria-label="背景图片链接" placeholder="https://example.com/background.jpg"
              value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setImageUrl() }} />
              <button type="button" aria-label="应用背景图片链接" onClick={setImageUrl}><Check size={18} /></button></div>
            <input ref={uploadRef} className="appearance-file" type="file" accept="image/*"
              onChange={event => { uploadImage(event.target.files?.[0]); event.target.value = '' }} />
            <div className="appearance-actions"><button type="button" onClick={() => uploadRef.current?.click()}><ImagePlus size={17} />选择图片</button>
              <button type="button" onClick={() => { theme.setBackgroundImage(null); setUrl(''); setImageError('') }}><RotateCcw size={16} />默认背景</button></div>
            {imageError && <p className="appearance-error" role="alert">{imageError}</p>}
            <Range label="背景模糊" value={theme.backgroundBlur} min={0} max={20} unit="px"
              disabled={theme.reducedMotion} onChange={theme.setBackgroundBlur} />
            <Range label="白色遮罩" value={Math.round(theme.backgroundWhiteOverlay * 100)} min={0} max={100} unit="%"
              onChange={value => theme.setBackgroundWhiteOverlay(value / 100)} />
            <Range label="黑色遮罩" value={Math.round(theme.backgroundBlackOverlay * 100)} min={0} max={100} unit="%"
              onChange={value => theme.setBackgroundBlackOverlay(value / 100)} />
            <Range label="水平位置" value={theme.backgroundPositionX} min={-100} max={100} unit="%" onChange={theme.setBackgroundPositionX} />
            <Range label="垂直位置" value={theme.backgroundPositionY} min={-100} max={100} unit="%" onChange={theme.setBackgroundPositionY} />
            <Range label="缩放" value={Math.round(theme.backgroundScale * 100)} min={50} max={200} unit="%"
              onChange={value => theme.setBackgroundScale(value / 100)} />
            <Range label="旋转" value={theme.backgroundRotate} min={0} max={360} unit="°" onChange={theme.setBackgroundRotate} />
          </div>
        </div>
      </section>
    </div>}
  </main>
}
