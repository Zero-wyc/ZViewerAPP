import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { message } from '@/components/ui/message'
import { useMusicStore } from '../store'
import {
  DEFAULT_MUSIC_SETTINGS,
  MUSIC_LEVEL_OPTIONS,
  normalizeDefaultSourcePage,
  normalizeNumberSetting,
  normalizeMusicLevel,
  useMusicSettingsStore,
} from '../store-settings'

/** 开启确认提示（Hydrogen PERFORMANCE / GAPLESS_CONFIRM_MESSAGE 原文） */
const PERFORMANCE_CONFIRM_MESSAGE =
  '开启后此功能会消耗一定性能且可能造成卡顿，确定开启吗？'
const GAPLESS_CONFIRM_MESSAGE =
  '开启后会提前预缓冲下一首音频，可能增加网络流量和内存占用，确定开启吗？'

function SettingOption({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) {
  return (
    <div className="mobile-setting-row music-setting-option">
      <div className="min-w-0 font-medium">
        {name}
      </div>
      <div className="music-setting-control">{children}</div>
    </div>
  )
}

function SettingNumberInput({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    setDraft(String(value))
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number.parseInt(draft, 10)
        const next = Number.isFinite(n)
          ? normalizeNumberSetting(n, value)
          : value
        onCommit(next)
        setDraft(String(next))
      }}
      inputMode="numeric"
      aria-label={label}
      className="music-setting-number"
    />
  )
}

export function MusicSettingsPage() {
  const setPage = useMusicStore((s) => s.setPage)
  const settings = useMusicSettingsStore()
  const setSettings = settings.set
  /** 待确认的开启操作（Hydrogen dialogOpen） */
  const [pendingConfirm, setPendingConfirm] = useState<{
    text: string
    apply: () => void
  } | null>(null)

  /** toggle 通用切换（Hydrogen setConfirmedPlayerFlag：已开启直接关；
   * 关闭 → 性能/流量类需确认后才开启） */
  const toggleWithConfirm = (key: keyof typeof settings, text: string) => {
    if (settings[key] === true) {
      setSettings({ [key]: false } as never)
      return
    }
    setPendingConfirm({
      text,
      apply: () => setSettings({ [key]: true } as never),
    })
  }

  return (
    <div className="music-settings-page">
      <header className="music-settings-header">
        <button type="button" onClick={() => setPage('home')} aria-label="返回">
          <ChevronLeft size={22} />
        </button>
        <h1>设置</h1>
      </header>
      <div className="music-settings-content zen-scroll">
        <h2>音乐</h2>
        <div className="mobile-settings-group">
          {/* 音质选择（Selector 9 档） */}
          <SettingOption name="音质选择">
            <Select
              size="sm"
              aria-label="音质选择"
              value={normalizeMusicLevel(settings.level)}
              options={[...MUSIC_LEVEL_OPTIONS]}
              onChange={(v) => setSettings({ level: v })}
            />
          </SettingOption>
          {/* 音源直连（直链模式，默认关闭） */}
          <SettingOption name="音源直连">
            <Switch
              aria-label="音源直连"
              checked={settings.directSource}
              onChange={() =>
                setSettings({ directSource: !settings.directSource })
              }
            />
          </SettingOption>
          {/* 背景封面模糊（性能类：开启需确认） */}
          <SettingOption name="开启背景封面模糊">
            <Switch
              aria-label="开启背景封面模糊"
              checked={settings.coverBlur}
              onChange={() =>
                toggleWithConfirm('coverBlur', PERFORMANCE_CONFIRM_MESSAGE)
              }
            />
          </SettingOption>
          {/* 歌词模糊（性能类） */}
          <SettingOption name="开启歌词模糊">
            <Switch
              aria-label="开启歌词模糊"
              checked={settings.lyricBlur}
              onChange={() =>
                toggleWithConfirm('lyricBlur', PERFORMANCE_CONFIRM_MESSAGE)
              }
            />
          </SettingOption>
          {/* 当前歌词行遮罩透明度 / 模糊度（滑块） */}
          <SettingOption name="歌词遮罩透明度">
            <Slider
              size="sm"
              aria-label="歌词遮罩透明度"
              value={settings.lyricMaskOpacity}
              min={0}
              max={100}
              valueFormatter={(v) => `${v}%`}
              onChange={(v) => setSettings({ lyricMaskOpacity: v })}
            />
          </SettingOption>
          <SettingOption name="歌词遮罩模糊度">
            <Slider
              size="sm"
              aria-label="歌词遮罩模糊度"
              value={settings.lyricMaskBlur}
              min={0}
              max={20}
              valueFormatter={(v) => `${v}px`}
              onChange={(v) => setSettings({ lyricMaskBlur: v })}
            />
          </SettingOption>
          {/* 显示歌曲翻译（直接切换） */}
          <SettingOption name="显示歌曲翻译">
            <Switch
              aria-label="显示歌曲翻译"
              checked={settings.showSongTranslation}
              onChange={() =>
                setSettings({
                  showSongTranslation: !settings.showSongTranslation,
                })
              }
            />
          </SettingOption>
          {/* 歌曲无缝衔接（流量类：开启需确认） */}
          <SettingOption name="歌曲无缝衔接">
            <Switch
              aria-label="歌曲无缝衔接"
              checked={settings.gaplessPlayback}
              onChange={() =>
                toggleWithConfirm('gaplessPlayback', GAPLESS_CONFIRM_MESSAGE)
              }
            />
          </SettingOption>
          <SettingOption name="音量均衡">
            <Switch
              aria-label="音量均衡"
              checked={settings.volumeNormalize}
              onChange={() => setSettings({ volumeNormalize: !settings.volumeNormalize })}
            />
          </SettingOption>
          <p className="music-setting-note">
            降低偏响歌曲的音量，减少切歌时的音量差异。仅对本机生效，不改变保存的音量；设备不支持时保持正常播放。
          </p>
          {/* 音频可视化（性能类） */}
          <SettingOption name="音频可视化">
            <Switch
              aria-label="音频可视化"
              checked={settings.audioVisualizer}
              onChange={() =>
                toggleWithConfirm(
                  'audioVisualizer',
                  PERFORMANCE_CONFIRM_MESSAGE
                )
              }
            />
          </SettingOption>
          {/* 视频背景 CLI 高画质（默认关闭 = 720P 直链） */}
          <SettingOption name="视频背景 CLI 高画质">
            <Switch
              aria-label="视频背景 CLI 高画质"
              checked={settings.musicVideoCli}
              onChange={() =>
                setSettings({ musicVideoCli: !settings.musicVideoCli })
              }
            />
          </SettingOption>
          {/* B站 视频自动连播（默认开启：顺序播放模式下 B站 队列播完
              到末尾自动拉相关推荐续播） */}
          <SettingOption name="B站视频自动连播">
            <Switch
              aria-label="B站视频自动连播"
              checked={settings.biliAutoContinue}
              onChange={() =>
                setSettings({ biliAutoContinue: !settings.biliAutoContinue })
              }
            />
          </SettingOption>
          {/* 进入一起听默认页（创建/切换/离开房间重置后落到哪一页；
              应用刷新后的页面恢复优先于本设置） */}
          <SettingOption name="进入一起听默认页">
            <Select
              size="sm"
              aria-label="进入一起听默认页"
              value={normalizeDefaultSourcePage(settings.defaultSourcePage)}
              options={[
                { label: '网易云音乐', value: 'netease' },
                { label: '哔哩哔哩', value: 'bilibili' },
              ]}
              onChange={(v) =>
                setSettings({
                  defaultSourcePage: v === 'bilibili' ? 'bilibili' : 'netease',
                })
              }
            />
          </SettingOption>
          {/* 数字输入组 */}
          <SettingOption name="搜索下拉条目数量">
            <SettingNumberInput
              label="搜索下拉条目数量"
              value={settings.searchAssistLimit}
              onCommit={(v) =>
                setSettings({
                  searchAssistLimit: normalizeNumberSetting(
                    v,
                    DEFAULT_MUSIC_SETTINGS.searchAssistLimit
                  ),
                })
              }
            />
          </SettingOption>
          <SettingOption name="歌词字体大小">
            <SettingNumberInput
              label="歌词字体大小"
              value={settings.lyricSize}
              onCommit={(v) =>
                setSettings({
                  lyricSize: normalizeNumberSetting(
                    v,
                    DEFAULT_MUSIC_SETTINGS.lyricSize
                  ),
                })
              }
            />
          </SettingOption>
          <SettingOption name="歌词翻译字体大小">
            <SettingNumberInput
              label="歌词翻译字体大小"
              value={settings.tlyricSize}
              onCommit={(v) =>
                setSettings({
                  tlyricSize: normalizeNumberSetting(
                    v,
                    DEFAULT_MUSIC_SETTINGS.tlyricSize
                  ),
                })
              }
            />
          </SettingOption>
          <SettingOption name="罗马歌词字体大小">
            <SettingNumberInput
              label="罗马歌词字体大小"
              value={settings.rlyricSize}
              onCommit={(v) =>
                setSettings({
                  rlyricSize: normalizeNumberSetting(
                    v,
                    DEFAULT_MUSIC_SETTINGS.rlyricSize
                  ),
                })
              }
            />
          </SettingOption>
          <SettingOption name="歌词间奏等待时间(单位：秒)">
            <SettingNumberInput
              label="歌词间奏等待时间(单位：秒)"
              value={settings.lyricInterlude}
              onCommit={(v) =>
                setSettings({
                  lyricInterlude: normalizeNumberSetting(
                    v,
                    DEFAULT_MUSIC_SETTINGS.lyricInterlude
                  ),
                })
              }
            />
          </SettingOption>
        </div>

        <h2>其他</h2>
        <div className="mobile-settings-group">
          <SettingOption name="恢复默认设置">
            <Button
              size="sm"
              onClick={() => {
                settings.reset()
                message.success('已恢复默认设置')
              }}
            >
              恢复默认
            </Button>
          </SettingOption>
        </div>

      </div>
      {pendingConfirm && (
        <Modal
          open
          title="确定开启"
          onClose={() => setPendingConfirm(null)}
          footer={<>
            <Button onClick={() => setPendingConfirm(null)}>取消</Button>
            <Button variant="primary" onClick={() => {
              pendingConfirm.apply()
              setPendingConfirm(null)
            }}>确定</Button>
          </>}
        >
          <p>{pendingConfirm.text}</p>
        </Modal>
      )}
    </div>
  )
}
