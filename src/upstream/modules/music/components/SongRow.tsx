import { getApiUrl } from '@/lib/api'
/** 歌曲行：单击播放，移动端歌名/歌手两行；行尾更多菜单显式提供入队、收藏和专辑操作。 */
import { useState, type ReactNode } from 'react'
import { MusicSheet } from './MusicSheet'
import { MoreVertical, Play } from 'lucide-react'
import { useIsTouch } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { musicCoverUrl } from '../utils/neteaseImage'

/** EQ 频谱动画（4 根 3px 竖条交错跳动，primary 色由父级 currentColor 决定） */
export function EqBars({ paused }: { paused?: boolean }) {
  return (
    <span
      className={cn(
        'flex h-[14px] items-end justify-between gap-[2px]',
        paused && 'zen-eq-paused'
      )}
      aria-hidden="true"
    >
      <span className="zen-eq-bar" />
      <span className="zen-eq-bar" />
      <span className="zen-eq-bar" />
      <span className="zen-eq-bar" />
    </span>
  )
}

export interface SongRowProps {
  /** 序号（1 起始，显示在序号列） */
  index: number
  /** 歌曲名（左区，14px 单行截断） */
  name: string
  /** 歌手（右区左 70%，单行截断） */
  artist: string
  /** 封面缩略图 URL（可选；40px 圆角方形显示在歌名前，网易云 CDN 自动 80x80 裁剪） */
  cover?: string
  /** 时长文本（右区右 30%，右对齐，如 "3:45"） */
  duration: string
  /** 是否 VIP 歌曲（歌名后描边小标签） */
  vip?: boolean
  /** 是否为当前播放行（浅高亮 + 歌名 primary + EQ 动画） */
  active?: boolean
  /** 是否正在播放（EQ 竖条跳动；false 时静止） */
  playing?: boolean
  /** 禁用态（整体 opacity-70 灰化，如 VIP 未登录不可播） */
  disabled?: boolean
  /** 序号列 hover 按钮点击回调（立即播放；不传则 hover 时仍显示序号） */
  onPlayNow?: () => void
  /** 行点击回调（队列模式房主切歌） */
  onRowClick?: () => void
  /** 行双击回调（双击添加到队列） */
  onRowDoubleClick?: () => void
  /** 行点击提示（title） */
  rowTitle?: string
  /** 行尾管理操作组（canManage 时传入，行 hover 淡入） */
  actions?: ReactNode
  menu?: ReactNode
}

/** 序号列三态切换的过渡时长（对齐 Hydrogen opacity 0.12s ease） */
const STATE_TRANSITION = 'transition-opacity duration-100 ease-in-out'

/** 网易云 CDN 封面缩略地址：https 化 + 80x80 裁剪参数（40px 显示 @2x） */
function coverThumb(url: string): string {
  return musicCoverUrl(url, 80, getApiUrl())
}

export function SongRow({
  index,
  name,
  artist,
  cover,
  duration,
  vip,
  active,
  playing,
  disabled,
  onPlayNow,
  onRowClick,
  onRowDoubleClick,
  rowTitle,
  actions, menu,
}: SongRowProps) {
  // 行 hover 状态（对齐 Hydrogen hoverRowKey：驱动序号列三态切换）
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  // 触屏无 hover：「立即播放」按钮常显（序号列让位），否则手机上无法播放
  const isTouch = useIsTouch()
  const touchPlay = isTouch && onPlayNow != null

  // 序号列三态互斥显示：触屏/hover → 播放按钮；非 hover 时当前行 → EQ；
  // 其余 → 序号（触屏下当前行仍显示 EQ，暂停走底栏/播放器）
  const showIndex = !hovered && !active && !touchPlay
  const showPlayBtn = (hovered || (touchPlay && !active)) && onPlayNow != null
  const showEq = !hovered && active

  return (
    <div
      className={cn(
        'music-song-row group flex shrink-0 items-center justify-between px-2 transition-colors duration-200',
        cover ? 'h-[56px]' : 'h-[42px]',
        'hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_5%,transparent)]',
        active &&
          'bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_5%,transparent)]',
        disabled && 'opacity-70',
        onRowClick && 'cursor-pointer'
      )}
      role={onRowClick || onPlayNow ? 'button' : undefined}
      tabIndex={onRowClick || onPlayNow ? 0 : undefined}
      onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); (onRowClick ?? onPlayNow)?.() } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onRowClick ?? onPlayNow}
      title="点击播放"
      data-active={active}
    >
      {/* ===== 左区（55%）：序号列 + 歌名 ===== */}
      <div className="music-song-main flex w-[55%] min-w-0 flex-none items-center">
        {/* 序号列 26px：三态绝对叠放（opacity 过渡切换） */}
        <div className="relative h-[22px] w-[26px] shrink-0">
          {/* 态一：默认序号（非当前行且非 hover 时可见） */}
          <span
            className={cn(
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base tabular-nums text-[var(--md-sys-color-on-surface-variant)]',
              STATE_TRANSITION,
              showIndex ? 'opacity-100' : 'opacity-0'
            )}
          >
            {index}
          </span>
          {/* 态二：行 hover 显示「立即播放」按钮（18px 图标；未配置回调时不渲染） */}
          {onPlayNow != null && (
            <button
              type="button"
              className={cn(
                'absolute left-1/2 top-1/2 flex h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-opacity duration-150 hover:opacity-70 active:scale-90',
                showPlayBtn
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onPlayNow()
              }}
              // 双击按钮时不要冒泡触发行的双击加队列
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label="立即播放"
              title="立即播放"
            >
              <Play className="h-[18px] w-[18px]" />
            </button>
          )}
          {/* 态三：当前播放行显示 EQ 频谱动画（primary 色，暂停时静止） */}
          {active && (
            <span
              className={cn(
                'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--md-sys-color-primary)]',
                STATE_TRANSITION,
                showEq ? 'opacity-100' : 'opacity-0'
              )}
            >
              <EqBars paused={!playing} />
            </span>
          )}
        </div>
        {/* 封面缩略图（可选）：40px 圆角方形，加载中浅底占位 */}
        {cover ? (
          <img
            src={coverThumb(cover)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            draggable={false}
            className="ml-[14px] h-10 w-10 shrink-0 rounded bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)] object-cover"
          />
        ) : null}
        {/* 歌名 + VIP 描边小标签 */}
        <span
          className={cn(
            'music-song-name flex min-w-0 flex-1 items-center gap-1',
            cover ? 'ml-3' : 'ml-[14px]'
          )}
        >
          <span
            className={cn(
              'min-w-0 truncate text-base font-medium text-[var(--md-sys-color-on-surface)]',
              active && 'text-[var(--md-sys-color-primary)]'
            )}
          >
            {name}
          </span>
          <span className="music-song-mobile-artist">{artist}</span>
          {vip && (
            <span
              className="shrink-0 border-[0.5px] px-[2px] text-[8px] leading-none"
              style={{
                borderColor: 'currentColor',
                color: 'var(--md-sys-color-tertiary)',
              }}
            >
              VIP
            </span>
          )}
        </span>
      </div>

      {/* ===== 右区（flex-1）：歌手 + 时长 ===== */}
      <div className="music-song-secondary flex min-w-0 flex-1 items-center">
        <span className="min-w-0 flex-1 truncate text-base text-[var(--md-sys-color-on-surface-variant)]">
          {artist}
        </span>
        <span className="ml-2 w-[30%] shrink-0 text-right text-base tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {duration}
        </span>
      </div>

      {(menu || actions || onRowDoubleClick) && <button className="music-song-more" aria-label={`更多操作 ${name}`} onClick={event => { event.stopPropagation(); setMenuOpen(true) }}><MoreVertical size={21} /></button>}
      {menuOpen && <MusicSheet title={name} onClose={() => setMenuOpen(false)}><div className="music-sheet-actions" onClick={event => event.stopPropagation()}>
        {onPlayNow && <button onClick={() => { onPlayNow(); setMenuOpen(false) }}>立即播放</button>}
        {menu ?? (onRowDoubleClick && <button onClick={() => { onRowDoubleClick(); setMenuOpen(false) }}>加入队列</button>)}
        {actions}
      </div></MusicSheet>}
    </div>
  )
}
