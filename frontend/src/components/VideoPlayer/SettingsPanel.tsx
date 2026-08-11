import { useRef, useState } from 'react'
import { ChevronDown, Check, Plus, Upload, ScanSearch, Loader2, FolderOpen, FileText } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { SubtitleTrack } from '@/hooks/useSubtitles'
import {
  DanmakuStylePanel,
  DanmakuAdvancedSettings,
} from '@/modules/room/watch-together/DanmakuStylePanel'
import { AnimatedSidePanel } from './AnimatedSidePanel'
import { SubtitleBrowser } from './SubtitleBrowser'
import type {
  DanmakuStyleState,
  DanmakuTypeFilters,
  DanmakuAdvancedStyle,
} from '@/store/danmakuStore'

/** 主面板宽度（固定，副面板据此定位） */
const MAIN_PANEL_WIDTH = 260
/** 副面板宽度 */
const SIDE_PANEL_WIDTH = 200
/** 字幕浏览面板宽度 */
const BROWSER_PANEL_WIDTH = 220
/** 副面板与主面板间距 */
const PANEL_GAP = 8

interface SettingsPanelProps {
  isHost: boolean
  danmakuStyle?: DanmakuStyleState
  subtitleEnabled?: boolean
  subtitleTracks?: SubtitleTrack[]
  activeTrackIndex?: number
  subtitleFontSize?: number
  subtitleOffset?: number
  browseMovieId?: number
  onToggleSubtitles?: (enabled: boolean) => void
  onSelectSubtitleTrack?: (index: number) => void
  onAddSubtitleUrl?: (url: string, label?: string) => void
  onAddSubtitleFile?: (file: File) => void
  onAddSubtitleContent?: (content: string, filename: string, format: string) => void
  onChangeSubtitleFontSize?: (size: number) => void
  onChangeSubtitleOffset?: (offset: number) => void
  onAutoSearchSubtitles?: () => Promise<number>
  canAutoSearchSubtitles?: boolean
  onLoadEmbeddedSubtitles?: () => Promise<number>
  canLoadEmbeddedSubtitles?: boolean
  onDanmakuStyleChange?: (updates: Partial<DanmakuStyleState>) => void
  onDanmakuFilterChange?: (updates: Partial<DanmakuTypeFilters>) => void
  onDanmakuAdvancedChange?: (updates: Partial<DanmakuAdvancedStyle>) => void
  onResetDanmakuStyle?: () => void
}

/**
 * 设置面板（精简版）：字幕（启用 / 轨道 / 加载 URL·文件 / 字号）与弹幕样式两个 Tab。
 * 仅房主可编辑字幕；观众端展示「字幕由房主控制」。
 * 高级设置展开时向左延伸出独立面板，主面板高度保持不变。
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const {
    isHost,
    danmakuStyle,
    subtitleEnabled,
    subtitleTracks,
    activeTrackIndex,
    subtitleFontSize,
    subtitleOffset,
    browseMovieId,
    onToggleSubtitles,
    onSelectSubtitleTrack,
    onAddSubtitleUrl,
    onAddSubtitleFile,
    onAddSubtitleContent,
    onChangeSubtitleFontSize,
    onChangeSubtitleOffset,
    onAutoSearchSubtitles,
    canAutoSearchSubtitles,
    onLoadEmbeddedSubtitles,
    canLoadEmbeddedSubtitles,
    onDanmakuStyleChange,
    onDanmakuFilterChange,
    onDanmakuAdvancedChange,
    onResetDanmakuStyle,
  } = props

  const [settingsTab, setSettingsTab] = useState<'subtitle' | 'danmaku'>(
    'danmaku'
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showSubtitleLoader, setShowSubtitleLoader] = useState(false)
  const [subtitleUrlInput, setSubtitleUrlInput] = useState('')
  const [autoSearching, setAutoSearching] = useState(false)
  const [autoSearchMsg, setAutoSearchMsg] = useState('')
  const [embeddedLoading, setEmbeddedLoading] = useState(false)
  const [embeddedMsg, setEmbeddedMsg] = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const subtitleFileInputRef = useRef<HTMLInputElement>(null)

  // 当前是否在弹幕视图（房主切到弹幕 Tab，或观众端默认弹幕）
  const isDanmakuView = !!danmakuStyle && (!isHost || settingsTab === 'danmaku')
  const isSubtitleView = isHost && (settingsTab === 'subtitle' || !danmakuStyle)
  const showAdvancedPanel = advancedOpen && isDanmakuView
  const showBrowserPanel = browserOpen && isSubtitleView && browseMovieId != null

  const handleAddSubtitleUrl = () => {
    const url = subtitleUrlInput.trim()
    if (!url) return
    onAddSubtitleUrl?.(url)
    setSubtitleUrlInput('')
  }

  const handleSubtitleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onAddSubtitleFile?.(file)
    e.target.value = ''
  }

  const handleAutoSearch = async () => {
    if (autoSearching || !onAutoSearchSubtitles) return
    setAutoSearching(true)
    setAutoSearchMsg('')
    try {
      const count = await onAutoSearchSubtitles()
      setAutoSearchMsg(count > 0 ? `找到 ${count} 条字幕` : '未找到字幕')
    } catch {
      setAutoSearchMsg('搜索失败')
    } finally {
      setAutoSearching(false)
      setTimeout(() => setAutoSearchMsg(''), 3000)
    }
  }

  const handleLoadEmbedded = async () => {
    if (embeddedLoading || !onLoadEmbeddedSubtitles) return
    setEmbeddedLoading(true)
    setEmbeddedMsg('')
    try {
      const count = await onLoadEmbeddedSubtitles()
      setEmbeddedMsg(count > 0 ? `提取 ${count} 条内嵌字幕` : '未检测到内嵌字幕')
    } catch {
      setEmbeddedMsg('提取失败')
    } finally {
      setEmbeddedLoading(false)
      setTimeout(() => setEmbeddedMsg(''), 3000)
    }
  }

  return (
    <div className="absolute bottom-full right-2 z-[200] mb-1">
      {/* 延伸面板：高级设置（独立动画组件，absolute 定位不影响主面板） */}
      <AnimatedSidePanel
        open={showAdvancedPanel}
        width={SIDE_PANEL_WIDTH}
        gap={PANEL_GAP}
        mainPanelWidth={MAIN_PANEL_WIDTH}
        maxHeight={420}
      >
        <DanmakuAdvancedSettings
          style={danmakuStyle!}
          setStyle={onDanmakuStyleChange ?? (() => {})}
          setFilters={onDanmakuFilterChange ?? (() => {})}
          setAdvancedStyle={onDanmakuAdvancedChange ?? (() => {})}
        />
      </AnimatedSidePanel>

      {/* 延伸面板：字幕目录浏览 */}
      <AnimatedSidePanel
        open={showBrowserPanel}
        width={BROWSER_PANEL_WIDTH}
        gap={PANEL_GAP}
        mainPanelWidth={MAIN_PANEL_WIDTH}
        maxHeight={300}
      >
        {browseMovieId != null && onAddSubtitleContent && (
          <SubtitleBrowser
            movieId={browseMovieId}
            onSelect={(content, filename, format) => {
              onAddSubtitleContent(content, filename, format)
            }}
          />
        )}
      </AnimatedSidePanel>

      {/* 主面板（位置固定，不受副面板展开/收起影响） */}
      <div
        className="glass-strong relative overflow-y-auto rounded-xl border border-[var(--glass-border)] p-2.5 shadow-lg"
        style={{
          width: MAIN_PANEL_WIDTH,
          maxHeight: 420,
          boxShadow:
            '0 8px 24px -8px color-mix(in srgb, var(--md-sys-color-shadow) 40%, transparent)',
        }}
      >
        {/* Tab 切换（仅房主且有弹幕设置时显示） */}
        {danmakuStyle && isHost ? (
          <div
            className="mb-1.5 grid grid-cols-2 gap-1.5 rounded-lg border p-1"
            style={{
              backgroundColor: 'var(--glass-bg)',
              borderColor: 'var(--md-sys-color-outline)',
            }}
          >
            {(['subtitle', 'danmaku'] as const).map((tab) => {
              const active = settingsTab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setSettingsTab(tab)
                    setAdvancedOpen(false)
                    setBrowserOpen(false)
                  }}
                  className={cn(
                    'rounded-md py-1 text-xs font-medium transition-all',
                    active
                      ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-sm'
                      : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] hover:text-[var(--md-sys-color-on-surface)]'
                  )}
                >
                  {tab === 'subtitle' ? '字幕' : '弹幕'}
                </button>
              )
            })}
          </div>
        ) : danmakuStyle && !isHost ? (
          <div
            className="mb-1.5 text-xs font-semibold"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          >
            弹幕
          </div>
        ) : (
          <div
            className="mb-1.5 text-xs font-semibold"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          >
            字幕
          </div>
        )}

        {/* 内容 */}
        {isHost && (settingsTab === 'subtitle' || !danmakuStyle) ? (
          <>
            <div className="flex items-center justify-between py-0.5">
              <span
                className="text-xs"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                启用字幕
              </span>
              <Switch
                checked={!!subtitleEnabled}
                disabled={!isHost}
                onChange={(e) => onToggleSubtitles?.(e.target.checked)}
              />
            </div>
            {subtitleEnabled && subtitleTracks && subtitleTracks.length > 0 && (
              <div className="mt-1">
                <div
                  className="mb-1 text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                >
                  字幕轨道
                </div>
                <div className="flex flex-col gap-0.5">
                  {subtitleTracks.map((track, i) => {
                    const active = i === (activeTrackIndex ?? -1)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSelectSubtitleTrack?.(i)}
                        className={cn(
                          'flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          active
                            ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                            : 'text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]'
                        )}
                      >
                        <span className="truncate">{track.label}</span>
                        {active && <Check className="h-3 w-3 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {isHost && subtitleEnabled && (
              <>
                <div
                  className="mt-1 border-t pt-1"
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubtitleLoader((v) => !v)
                      setBrowserOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-[var(--md-sys-color-surface-container-highest)]"
                    style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                  >
                    <span>加载字幕</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform',
                        showSubtitleLoader && 'rotate-180'
                      )}
                    />
                  </button>
                  {showSubtitleLoader && (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-1">
                        <Input
                          size="sm"
                          value={subtitleUrlInput}
                          onChange={(e) => setSubtitleUrlInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddSubtitleUrl()
                            }
                          }}
                          placeholder="https://.../sub.vtt 或 .srt/.ass"
                          className="flex-1"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          className="h-7 w-7 shrink-0 p-0"
                          disabled={!subtitleUrlInput.trim()}
                          onClick={handleAddSubtitleUrl}
                          icon={<Plus className="h-3.5 w-3.5" />}
                        />
                      </div>
                      <input
                        ref={subtitleFileInputRef}
                        type="file"
                        accept=".vtt,.srt,.ass,.ssa,.smi,.sami,.sub"
                        className="hidden"
                        onChange={handleSubtitleFileChange}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-full justify-center gap-1 text-xs"
                        icon={<Upload className="h-3 w-3" />}
                        onClick={() => subtitleFileInputRef.current?.click()}
                      >
                        上传文件
                      </Button>
                      {canAutoSearchSubtitles && onAutoSearchSubtitles && (
                        <>
                          <div
                            className="border-t pt-1"
                            style={{
                              borderColor:
                                'color-mix(in srgb, var(--md-sys-color-outline) 20%, transparent)',
                            }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 w-full justify-center gap-1 text-xs"
                            disabled={autoSearching}
                            icon={
                              autoSearching ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ScanSearch className="h-3 w-3" />
                              )
                            }
                            onClick={handleAutoSearch}
                          >
                            {autoSearching ? '搜索中...' : '自动识别字幕'}
                          </Button>
                          {autoSearchMsg && (
                            <div
                              className="text-center text-[10px]"
                              style={{
                                color:
                                  autoSearchMsg === '搜索失败'
                                    ? 'var(--md-sys-color-error)'
                                    : 'var(--md-sys-color-on-surface-variant)',
                              }}
                            >
                              {autoSearchMsg}
                            </div>
                          )}
                        </>
                      )}
                      {canLoadEmbeddedSubtitles && onLoadEmbeddedSubtitles && (
                        <>
                          <div
                            className="border-t pt-1"
                            style={{
                              borderColor:
                                'color-mix(in srgb, var(--md-sys-color-outline) 20%, transparent)',
                            }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 w-full justify-center gap-1 text-xs"
                            disabled={embeddedLoading}
                            icon={
                              embeddedLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )
                            }
                            onClick={handleLoadEmbedded}
                          >
                            {embeddedLoading ? '提取中...' : '提取内嵌字幕'}
                          </Button>
                          {embeddedMsg && (
                            <div
                              className="text-center text-[10px]"
                              style={{
                                color:
                                  embeddedMsg === '提取失败'
                                    ? 'var(--md-sys-color-error)'
                                    : 'var(--md-sys-color-on-surface-variant)',
                              }}
                            >
                              {embeddedMsg}
                            </div>
                          )}
                        </>
                      )}
                      {canAutoSearchSubtitles && browseMovieId != null && onAddSubtitleContent && (
                        <Button
                          variant={browserOpen ? 'primary' : 'secondary'}
                          size="sm"
                          className="h-7 w-full justify-center gap-1 text-xs"
                          icon={<FolderOpen className="h-3 w-3" />}
                          onClick={() => setBrowserOpen((v) => !v)}
                        >
                          {browserOpen ? '关闭浏览' : '浏览目录'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div
                  className="mt-1 border-t pt-1"
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent)',
                  }}
                >
                  <Slider
                    label="字号"
                    size="sm"
                    value={subtitleFontSize ?? 20}
                    min={12}
                    max={36}
                    step={1}
                    valueFormatter={(v) => `${v}px`}
                    onChange={(v) => onChangeSubtitleFontSize?.(v)}
                  />
                </div>
                {(activeTrackIndex ?? -1) >= 0 && onChangeSubtitleOffset && (
                  <div
                    className="mt-1 border-t pt-1"
                    style={{
                      borderColor:
                        'color-mix(in srgb, var(--md-sys-color-outline) 30%, transparent)',
                    }}
                  >
                    <Slider
                      label="时间偏移"
                      size="sm"
                      value={subtitleOffset ?? 0}
                      min={-5}
                      max={5}
                      step={0.1}
                      valueFormatter={(v) =>
                        v > 0 ? `+${v.toFixed(1)}s` : `${v.toFixed(1)}s`
                      }
                      onChange={(v) => onChangeSubtitleOffset?.(v)}
                    />
                  </div>
                )}
              </>
            )}
            {!isHost && (
              <div
                className="mt-1 text-[11px]"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                字幕由房主控制
              </div>
            )}
          </>
        ) : (
          <DanmakuStylePanel
            style={danmakuStyle!}
            setStyle={onDanmakuStyleChange ?? (() => {})}
            resetStyle={onResetDanmakuStyle ?? (() => {})}
            advancedOpen={advancedOpen}
            onAdvancedToggle={() => setAdvancedOpen((v) => !v)}
          />
        )}
      </div>
    </div>
  )
}
