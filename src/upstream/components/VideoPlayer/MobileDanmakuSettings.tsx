import { useState } from 'react'
import { AlignLeft, ChevronDown, ChevronRight, Palette, PanelTop, RotateCcw, Sparkles } from 'lucide-react'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_DANMAKU_STYLE, type DanmakuAdvancedStyle, type DanmakuStyleState, type DanmakuTypeFilters } from '@/store/danmakuStore'

interface MobileDanmakuSettingsProps {
  style: DanmakuStyleState
  onStyleChange?: (updates: Partial<DanmakuStyleState>) => void
  onFilterChange?: (updates: Partial<DanmakuTypeFilters>) => void
  onAdvancedChange?: (updates: Partial<DanmakuAdvancedStyle>) => void
  onReset?: () => void
  onChooseFont: () => void
}

const types = [
  { key: 'fixed', label: '固定', icon: PanelTop },
  { key: 'scroll', label: '滚动', icon: AlignLeft },
  { key: 'color', label: '彩色', icon: Palette },
  { key: 'advanced', label: '高级', icon: Sparkles },
] as const

export function MobileDanmakuSettings({ style, onStyleChange, onFilterChange, onAdvancedChange, onReset, onChooseFont }: MobileDanmakuSettingsProps) {
  const [expanded, setExpanded] = useState(false)
  const fontName = style.advanced.fontFamily === DEFAULT_DANMAKU_STYLE.advanced.fontFamily
    ? '默认' : style.advanced.fontFamily.replace(/["']/g, '').split(',')[0] || '默认'

  return (
    <div className="mobile-danmaku-settings">
      <div className="mobile-settings-section-heading">
        <h3>弹幕设置</h3>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起更多' : '查看更多'}
          <ChevronDown size={16} className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>
      <div className="mobile-settings-group">
        <Slider className="mobile-setting-slider" label="显示区域" aria-label="弹幕显示区域" value={style.displayArea} min={0.25} max={1} step={0.05}
          valueFormatter={value => `${Math.round(value * 100)}%`} onChange={value => onStyleChange?.({ displayArea: value })} />
        <Slider className="mobile-setting-slider" label="不透明度" aria-label="弹幕不透明度" value={style.opacity} min={0.1} max={1} step={0.05}
          valueFormatter={value => `${Math.round(value * 100)}%`} onChange={value => onStyleChange?.({ opacity: value })} />
        {expanded && <>
          <Slider className="mobile-setting-slider" label="字号" aria-label="弹幕字号" value={style.fontSize} min={12} max={36} step={1}
            valueFormatter={value => `${value}px`} onChange={value => onStyleChange?.({ fontSize: value })} />
          <Slider className="mobile-setting-slider" label="速度" aria-label="弹幕速度" value={style.speed} min={0.5} max={2} step={0.1}
            valueFormatter={value => `${value.toFixed(1)}x`} onChange={value => onStyleChange?.({ speed: value })} />
          <div className="mobile-setting-row"><span>随屏幕缩放</span><Switch aria-label="随屏幕缩放" checked={style.scaleWithScreen}
            onChange={event => onStyleChange?.({ scaleWithScreen: event.target.checked })} /></div>
          <button type="button" className="mobile-setting-row mobile-setting-font" onClick={onChooseFont}>
            <span>字体</span><span>{fontName}</span><ChevronRight size={18} />
          </button>
          <Slider className="mobile-setting-slider" label="描边" aria-label="弹幕描边" value={style.advanced.strokeWidth} min={0} max={3} step={0.5}
            valueFormatter={value => `${value}px`} onChange={value => onAdvancedChange?.({ strokeWidth: value })} />
          <Slider className="mobile-setting-slider" label="阴影" aria-label="弹幕阴影" value={style.advanced.shadowBlur} min={0} max={8} step={0.5}
            valueFormatter={value => `${value}px`} onChange={value => onAdvancedChange?.({ shadowBlur: value })} />
        </>}
      </div>
      <div className="mobile-settings-section-heading"><h3>弹幕类型</h3><span>点按切换显示</span></div>
      <div className="mobile-settings-group mobile-danmaku-types">
        {types.map(({ key, label, icon: Icon }) => (
          <button type="button" key={key} aria-label={`显示${label}弹幕`} aria-pressed={style.filters[key]}
            onClick={() => onFilterChange?.({ [key]: !style.filters[key] })}>
            <span className="mobile-danmaku-type-icon"><Icon size={24} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="mobile-settings-reset" onClick={onReset}><RotateCcw size={16} />恢复默认设置</button>
    </div>
  )
}
