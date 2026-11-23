import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  Users,
  Settings,
  Share2,
  Copy,
  MessageSquare,
  Pencil,
  Check,
  X,
  UserX,
  VolumeX,
  Volume2,
  Crown,
  Shield,
  Lock,
  UserCheck,
  Clapperboard,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Space } from '@/components/ui/Space'
import { Text, Paragraph } from '@/components/ui/Typography'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { Switch } from '@/components/ui/Switch'
import { message } from '@/components/ui/message'
import { useRoomDisplayName } from '@/modules/room/hooks/useRoomDisplayName'
import { isValidDisplayName } from '@/modules/room/lib/displayName'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import {
  memberCanRequestMovie,
  updateMoviePermission,
} from '@/store/moviePermission'
import { useAuthStore } from '@/store/authStore'
import {
  useSystemSettingsStore,
  canRoomViewerPerform,
} from '@/store/systemSettingsStore'
import { getApiUrl, getLogicalApiUrl } from '@/lib/api'
import { getAddressScope } from '@/lib/netAddress'
import { buildRoomShareUrl } from '../roomShareLink'
import { canReorderPlaylist } from './playlistOrder'

interface RoomInfoPanelProps {
  roomId: string
  isHost: boolean
}

type SettingsTab = 'info' | 'viewers' | 'permissions'

// 后端 socket.data.role 取值
type UserRole = 'root' | 'admin' | 'user' | 'guest'

const ROLE_LABELS: Record<UserRole, string> = {
  root: '超级管理员',
  admin: '管理员',
  user: '普通用户',
  guest: '游客',
}

const ROLE_COLORS: Record<UserRole, string> = {
  root: 'var(--md-sys-color-error)',
  admin: 'var(--md-sys-color-primary)',
  user: 'var(--md-sys-color-tertiary)',
  guest: 'var(--md-sys-color-outline)',
}

function RoleBadge({ role }: { role?: string }) {
  if (!role || !(role in ROLE_LABELS)) return null
  const label = ROLE_LABELS[role as UserRole]
  const color = ROLE_COLORS[role as UserRole]
  return (
    <span
      className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: 'color-mix(in srgb, ' + color + ' 15%, transparent)',
        color,
      }}
    >
      {label}
    </span>
  )
}

export function RoomInfoPanel({
  roomId,
  isHost: isHostProp,
}: RoomInfoPanelProps) {
  const { connected, socket } = useSocket()
  const viewers = useRoomStore((state) => state.viewers)
  const roomName = useRoomStore((state) => state.roomName)
  const roomSettings = useRoomStore((state) => state.roomSettings)
  const setRoomSettings = useRoomStore((state) => state.setRoomSettings)
  const moderators = useRoomStore((state) => state.moderators)
  const guestModerators = useRoomStore((state) => state.guestModerators)
  const autoApproveRequests = useRoomStore((state) => state.autoApproveRequests)
  const toggleAutoApproveRequests = useRoomStore(
    (state) => state.toggleAutoApproveRequests
  )
  const currentUserId = useAuthStore((state) => state.user?.id)
  const role = useAuthStore((state) => state.user?.role)
  const ownerUserId = useRoomStore(state => state.roomOwnerUserId)
  const canRename = canReorderPlaylist(role, currentUserId, ownerUserId)
  const matrix = useSystemSettingsStore((state) => state.roomPermissionMatrix)
  const moviePermission = useRoomStore((state) => state.moviePermission)
  const setMoviePermission = useRoomStore((state) => state.setMoviePermission)
  const [moviePermissionBusy, setMoviePermissionBusy] = useState(false)
  // 逐人开关按目标记忙碌态（u:<id> / g:<guestId>），避免连点同一行
  const [moviePermissionBusyKey, setMoviePermissionBusyKey] = useState<
    string | null
  >(null)

  const [showUsers, setShowUsers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('info')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingNameValue, setEditingNameValue] = useState(roomName)
  const [savingName, setSavingName] = useState(false)
  const [pendingShareLink, setPendingShareLink] = useState<string | null>(null)

  // 我的房间昵称（房间内显示名，随时可改）
  const { name: roomDisplayName, rename: renameDisplayName } =
    useRoomDisplayName(roomId)
  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameError, setNicknameError] = useState('')

  // 房间设置表单
  const [passwordValue, setPasswordValue] = useState('')
  const [maxViewersValue, setMaxViewersValue] = useState(10)
  const [savingSettings, setSavingSettings] = useState(false)

  // 房主转交确认
  const [transferTarget, setTransferTarget] = useState<{
    socketId: string
    username?: string
  } | null>(null)
  const [transferring, setTransferring] = useState(false)

  // 内部维护 isHost 状态：监听 host-transferred 事件后即时切换
  // 转交房主后，原房主按钮立即隐藏；新房主按钮立即显示
  const [isHost, setIsHost] = useState(isHostProp)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步 isHostProp 到内部状态
    setIsHost(isHostProp)
  }, [isHostProp])

  // 当前用户是否为房管（房主身份由 sessionStorage 标记判定，
  // 房管身份由服务器同步的 moderators / guestModerators 列表判定）
  const isModerator =
    (currentUserId != null && moderators.includes(Number(currentUserId))) ||
    (!!socket?.id && guestModerators.includes(socket.id))

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步 roomName 到编辑框
    setEditingNameValue(roomName)
  }, [roomName])

  // 打开设置 Modal 时同步当前房间设置到表单
  useEffect(() => {
    if (showSettings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开设置时同步房间设置到表单
      setPasswordValue(roomSettings.password ?? '')
      setMaxViewersValue(roomSettings.maxViewers)
    }
  }, [showSettings, roomSettings])

  const shareUrl = buildRoomShareUrl(getApiUrl(), roomId)

  // 监听权限相关事件
  useEffect(() => {
    if (!socket) return

    const handleHostTransferred = (payload: {
      newHostSocketId: string
      oldHostSocketId: string
      newOwnerUserId: number | null
    }) => {
      if (!payload) return
      // 判断当前 socket 是否为新房主：通过比较 socket.id
      // socket.id 在 useSocket 内部维护，这里通过 socket?.id 获取
      const mySocketId = socket?.id
      if (payload.newHostSocketId === mySocketId) {
        setIsHost(true)
        message.success('您已成为新房主')
      } else if (payload.oldHostSocketId === mySocketId) {
        setIsHost(false)
        message.info('房主已转交，您已成为观众')
      } else {
        message.info('房主已变更')
      }
    }

    const handleRoomSettingsUpdated = (payload: {
      password: string | null
      maxViewers: number
      requireApproval: boolean
    }) => {
      if (!payload) return
      setRoomSettings({
        password: payload.password,
        maxViewers: payload.maxViewers,
        requireApproval: payload.requireApproval,
      })
    }

    const handleViewerKicked = (payload: { reason?: string }) => {
      message.error(payload?.reason || '您已被房主移出房间')
      // 退出房间由全局导航处理
    }

    socket.on('host-transferred', handleHostTransferred)
    socket.on('room-settings-updated', handleRoomSettingsUpdated)
    socket.on('viewer-kicked', handleViewerKicked)

    return () => {
      socket.off('host-transferred', handleHostTransferred)
      socket.off('room-settings-updated', handleRoomSettingsUpdated)
      socket.off('viewer-kicked', handleViewerKicked)
    }
  }, [
    socket,
    setRoomSettings,
    currentUserId,
  ])

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
      message.success('房间 ID 已复制')
    } catch {
      message.error('复制失败')
    }
  }

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      message.success('分享链接已复制')
    } catch {
      message.error('复制失败')
    }
  }

  const handleCopyLink = () => {
    if (getAddressScope(new URL(shareUrl).hostname) !== 'public') {
      setPendingShareLink(shareUrl)
      return
    }
    void copyShareLink(shareUrl)
  }

  const handleSaveName = async () => {
    if (!canRename) return
    const trimmed = editingNameValue.trim()
    if (!trimmed) {
      message.warning('房间名称不能为空')
      return
    }
    if (trimmed === roomName) {
      setIsEditingName(false)
      return
    }
    if (!socket) {
      message.error('未连接到房间')
      return
    }
    setSavingName(true)
    socket.emit(
      'update-room-name',
      { roomId, name: trimmed },
      (response: { success: boolean; message?: string }) => {
        setSavingName(false)
        if (response.success) {
          message.success('房间名称已更新')
          setIsEditingName(false)
        } else {
          message.error(response.message || '更新失败')
        }
      }
    )
  }

  const handleCancelEditName = () => {
    setEditingNameValue(roomName)
    setIsEditingName(false)
  }

  // --- 房主管理操作 ---
  const handleKick = (viewerSocketId: string) => {
    if (!socket) return
    socket.emit(
      'kick-viewer',
      { roomId, viewerSocketId },
      (response: { success: boolean; message?: string }) => {
        if (response.success) {
          message.success('已将该观众移出房间')
        } else {
          message.error(response.message || '踢人失败')
        }
      }
    )
  }

  const handleToggleMute = (userId?: number, muted?: boolean) => {
    if (!socket || userId == null) return
    const event = muted ? 'unmute-viewer' : 'mute-viewer'
    socket.emit(
      event,
      { roomId, userId },
      (response: { success: boolean; message?: string }) => {
        if (response.success) {
          message.success(muted ? '已解除禁言' : '已禁言该观众')
        } else {
          message.error(response.message || '操作失败')
        }
      }
    )
  }

  const handleTransferHost = () => {
    if (!socket || !transferTarget) return
    setTransferring(true)
    socket.emit(
      'transfer-host',
      { roomId, viewerSocketId: transferTarget.socketId },
      (response: { success: boolean; message?: string }) => {
        setTransferring(false)
        if (response.success) {
          message.success(`已将房主转交给 ${transferTarget.username || '观众'}`)
          setTransferTarget(null)
        } else {
          message.error(response.message || '转交失败')
        }
      }
    )
  }

  // 房主任命/撤销房管（仅房主可操作）。游客 userId 恒为 0，改按 socketId 任命。
  const handleToggleModerator = (
    userId: number,
    username?: string,
    targetSocketId?: string
  ) => {
    if (!socket?.connected) {
      message.error('未连接到房间')
      return
    }
    const socketId = socket.id
    const isModerator = (userId > 0 && moderators.includes(userId)) ||
      (!!targetSocketId && guestModerators.includes(targetSocketId))
    const event = isModerator ? 'dismiss-moderator' : 'appoint-moderator'
    socket.timeout(5000).emit(
      event,
      { roomId, userId, socketId: targetSocketId ?? '' },
      (error: Error | null, response?: { success: boolean; message?: string }) => {
        if (socket.id !== socketId || useRoomStore.getState().roomId !== roomId) return
        if (error || !response) {
          message.error('操作失败，请重试')
          return
        }
        if (response.success) {
          message.success(
            isModerator
              ? `已撤销 ${username || '该用户'} 的房管权限`
              : `已任命 ${username || '该用户'} 为房管`
          )
        } else {
          message.error(response.message || '操作失败')
        }
      }
    )
  }

  const handleSaveNickname = () => {
    const name = nicknameDraft.trim()
    if (!isValidDisplayName(name) || !renameDisplayName(name)) {
      setNicknameError('昵称需为 1~20 个字符')
      return
    }
    setNicknameOpen(false)
    message.success('昵称已更新')
  }

  const handleSaveSettings = () => {
    if (!socket) return
    const trimmedPwd = passwordValue.trim()
    if (maxViewersValue < 1 || maxViewersValue > 100) {
      message.warning('观众上限必须在 1-100 之间')
      return
    }
    setSavingSettings(true)
    socket.emit(
      'update-room-settings',
      {
        roomId,
        password: trimmedPwd,
        maxViewers: maxViewersValue,
      },
      (response: { success: boolean; message?: string }) => {
        setSavingSettings(false)
        if (response.success) {
          message.success('房间设置已保存')
        } else {
          message.error(response.message || '保存失败')
        }
      }
    )
  }

  const captureMoviePermissionSession = (reqRoomId: string) => {
    const reqRevision = useRoomStore.getState().roomSessionRevision
    const reqServer = getLogicalApiUrl()
    return () => {
      const state = useRoomStore.getState()
      return state.roomId === reqRoomId && state.roomSessionRevision === reqRevision && getLogicalApiUrl() === reqServer
    }
  }

  /**
   * 添加影片权限（房间级点片开关）总开关。
   *
   * 只影响「成员能不能往影片列表里加片」，不影响已加入影片的切换播放；
   * 房主/root 与权限矩阵放行的人不受它约束。写库走 PUT movie-permission，
   * 成功后后端广播 movie:permission-changed，观众端据此显示/隐藏「添加影片」。
   */
  const handleToggleMoviePermission = async () => {
    if (!roomId || moviePermissionBusy || moviePermissionBusyKey !== null) return
    const next = !moviePermission.allowMembers
    setMoviePermissionBusy(true)
    const isCurrent = captureMoviePermissionSession(roomId)
    try {
      const updated = await updateMoviePermission(roomId, {
        allowMembers: next,
      })
      if (!isCurrent()) return
      setMoviePermission(updated)
      message.info(next ? '已允许成员添加影片' : '已关闭成员添加影片')
    } catch (err) {
      if (!isCurrent()) return
      console.error('[RoomInfoPanel] 更新添加影片权限失败:', err)
      message.error(err instanceof Error ? err.message : '更新点片权限失败')
    } finally {
      setMoviePermissionBusy(false)
    }
  }

  /**
   * 逐人点片权限：白名单（总开关关闭时单独放开）/ 黑名单（总开关开启时单独禁止）。
   *
   * 登录用户按 userId 记账；游客没有 userId，改按 guestId（浏览器侧稳定标识）
   * 记账，两种身份各有独立的名单，互不影响。
   */
  const handleToggleMemberMoviePermission = async (
    target: { userId?: number; guestId?: string },
    allowed: boolean
  ) => {
    const key =
      target.userId && target.userId > 0
        ? `u:${target.userId}`
        : `g:${target.guestId ?? ''}`
    if (!roomId || moviePermissionBusy || moviePermissionBusyKey !== null) return
    setMoviePermissionBusyKey(key)
    const isCurrent = captureMoviePermissionSession(roomId)
    try {
      const updated = await updateMoviePermission(roomId, {
        ...(target.userId && target.userId > 0
          ? { userId: target.userId }
          : { guestId: target.guestId }),
        allowed,
      })
      if (!isCurrent()) return
      setMoviePermission(updated)
    } catch (err) {
      if (!isCurrent()) return
      console.error('[RoomInfoPanel] 更新成员点片权限失败:', err)
      message.error(err instanceof Error ? err.message : '更新点片权限失败')
    } finally {
      setMoviePermissionBusyKey(null)
    }
  }

  const handleToggleRequireApproval = () => {
    if (!socket || !isHost) return
    const next = !roomSettings.requireApproval
    socket.emit(
      'update-room-settings',
      { roomId, requireApproval: next },
      (response: { success: boolean; message?: string }) => {
        if (response.success) {
          message.success(next ? '已开启房主审批' : '已关闭房主审批')
        } else {
          message.error(response.message || '操作失败')
        }
      }
    )
  }

  const renderHostViewerActions = (viewer: (typeof viewers)[number], compact = false) => {
    const userId = Number(viewer.userId) || 0
    if (!isHost || viewer.socketId === socket?.id || (userId > 0 && userId === Number(currentUserId))) return null
    const movieTarget = userId > 0 ? { userId } : viewer.guestId ? { guestId: viewer.guestId } : null
    const movieAllowed = memberCanRequestMovie(moviePermission, userId, viewer.guestId)
    const viewerIsModerator = (userId > 0 && moderators.includes(userId)) || guestModerators.includes(viewer.socketId)
    const movieLabel = movieAllowed ? '禁止该成员添加影片' : '允许该成员添加影片'
    const moderatorLabel = viewerIsModerator ? '撤销房管' : '任命房管'
    const buttonClass = cn(
      'flex shrink-0 items-center justify-center rounded-[var(--zv-r-chip,8px)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-40',
      compact ? 'h-6 w-6' : 'h-8 w-8'
    )
    const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
    return (
      <>
        {movieTarget && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void handleToggleMemberMoviePermission(movieTarget, !movieAllowed)
            }}
            disabled={moviePermissionBusyKey !== null || moviePermissionBusy}
            className={buttonClass}
            title={movieLabel}
            aria-label={movieLabel}
          >
            <Clapperboard className={cn(iconClass, 'text-[var(--md-sys-color-primary)]', movieAllowed ? 'opacity-100' : 'opacity-35')} />
          </button>
        )}
        {viewer.role !== 'root' && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleToggleModerator(userId, viewer.username, viewer.socketId)
            }}
            className={buttonClass}
            title={moderatorLabel}
            aria-label={moderatorLabel}
          >
            <Shield className={cn(iconClass, 'text-[var(--md-sys-color-tertiary)]', viewerIsModerator ? 'opacity-100' : 'opacity-40')} />
          </button>
        )}
      </>
    )
  }

  const renderViewerItem = (
    viewer: (typeof viewers)[number],
    withActions: boolean
  ) => {
    const isMuted = !!viewer.muted
    const viewerUserId = Number(viewer.userId) || 0
    const isSelf = viewer.socketId === socket?.id || (viewerUserId > 0 && viewerUserId === Number(currentUserId))
    const viewerIsModerator = (viewerUserId > 0 && moderators.includes(viewerUserId)) || guestModerators.includes(viewer.socketId)
    // 管理权限（禁言/踢出/房管任命）：房主，或权限矩阵允许的观众
    const canManage =
      withActions &&
      !isSelf && // 不能操作自己
      viewer.role !== 'root' && // 不能对 root 操作
      (isHost ||
        canRoomViewerPerform(matrix, 'muteViewer', {
          isHost,
          isModerator,
          role,
        }) ||
        canRoomViewerPerform(matrix, 'kickViewer', {
          isHost,
          isModerator,
          role,
        }))
    // 禁言 / 踢出分别按矩阵判定（与后端 canViewerPerform 同语义）
    const canMuteTarget =
      (isHost ||
        canRoomViewerPerform(matrix, 'muteViewer', {
          isHost,
          isModerator,
          role,
        })) &&
      viewer.userId != null &&
      viewer.userId > 0
    const canKickTarget =
      isHost ||
      canRoomViewerPerform(matrix, 'kickViewer', {
        isHost,
        isModerator,
        role,
      })
    // 房管额外限制：不可操作房主或其他房管（与后端校验一致）
    const canActOnTarget = isHost || !viewerIsModerator
    return (
      <div
        key={viewer.socketId}
        className="glass flex w-full max-w-full items-center gap-2 rounded-lg px-3 py-2"
      >
        <MessageSquare
          className="h-4 w-4 shrink-0"
          style={{ color: 'var(--md-sys-color-primary)' }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Text className="truncate text-sm">
              {viewer.username || viewer.socketId.slice(0, 8)}
            </Text>
            <RoleBadge role={viewer.role} />
            {viewerIsModerator && (
              <span
                className="shrink-0 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--md-sys-color-tertiary) 15%, transparent)',
                  color: 'var(--md-sys-color-tertiary)',
                }}
              >
                <Shield className="h-2.5 w-2.5" />
                房管
              </span>
            )}
            {isMuted && (
              <span
                className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--md-sys-color-error) 15%, transparent)',
                  color: 'var(--md-sys-color-error)',
                }}
              >
                已禁言
              </span>
            )}
          </div>
          {viewer.userId != null && (
            <Text type="secondary" className="text-[10px]">
              ID: {viewer.userId}
            </Text>
          )}
        </div>
        {withActions && (isHost || canManage) && (
          <div className="flex shrink-0 items-center gap-1">
            {renderHostViewerActions(viewer)}
            {/* 禁言按 userId 存储，游客共享 userId=0 会误伤全体游客，
                游客行不显示禁言按钮（引导使用踢出） */}
            {canManage && canMuteTarget && (
              <button
                type="button"
                onClick={() => handleToggleMute(viewer.userId, isMuted)}
                disabled={!canActOnTarget}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--zv-r-chip,8px)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                title={isMuted ? '解除禁言' : '禁言'}
                aria-label={isMuted ? '解除禁言' : '禁言'}
              >
                {isMuted ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>
            )}
            {/* 转交房主：仅房主可见 */}
            {canManage && isHost && (
              <button
                type="button"
                onClick={() =>
                  setTransferTarget({
                    socketId: viewer.socketId,
                    username: viewer.username,
                  })
                }
                className="flex h-8 w-8 items-center justify-center rounded-[var(--zv-r-chip,8px)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
                style={{ color: 'var(--md-sys-color-tertiary)' }}
                title="转交房主"
                aria-label="转交房主"
              >
                <Crown className="h-4 w-4" />
              </button>
            )}
            {canKickTarget && canManage && (
              <button
                type="button"
                onClick={() => handleKick(viewer.socketId)}
                disabled={!canActOnTarget}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--zv-r-chip,8px)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ color: 'var(--md-sys-color-error)' }}
                title="移出房间"
                aria-label="移出房间"
              >
                <UserX className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="glass-card zen-card flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--md-sys-shape-corner)]">
        {/* 卡片头部：图标 + 标题 + 连接状态 */}
        <div className="flex items-center gap-2.5 border-b border-[var(--glass-border)] px-4 py-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
            }}
          >
            <Settings
              className="h-4 w-4"
              style={{ color: 'var(--md-sys-color-on-primary-container)' }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <Text className="text-sm font-semibold leading-tight">
              房间状态
            </Text>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: connected
                    ? 'var(--md-sys-color-tertiary)'
                    : 'var(--md-sys-color-error)',
                  boxShadow: connected
                    ? '0 0 6px var(--md-sys-color-tertiary)'
                    : 'none',
                }}
              />
              <Text
                type="secondary"
                className="text-[10px] uppercase tracking-wide"
              >
                {connected ? '已连接' : '未连接'}
              </Text>
            </div>
          </div>
          {isHost && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background:
                  'linear-gradient(135deg, var(--md-sys-color-primary), color-mix(in srgb, var(--md-sys-color-primary) 70%, var(--md-sys-color-tertiary)))',
                color: 'var(--md-sys-color-on-primary)',
              }}
            >
              <Crown className="h-2.5 w-2.5" />
              房主
            </span>
          )}
          {!isHost && isModerator && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--md-sys-color-tertiary) 15%, transparent)',
                color: 'var(--md-sys-color-tertiary)',
              }}
            >
              <Shield className="h-2.5 w-2.5" />
              房管
            </span>
          )}
        </div>

        {/* 卡片内容 */}
        <div className="zen-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <div className="flex w-full flex-col gap-3">
            {/* 房间名称 */}
            <div className="flex flex-col gap-1">
              <Text
                type="secondary"
                className="text-[10px] uppercase tracking-wide"
              >
                房间名称
              </Text>
              {isEditingName ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    size="sm"
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSaveName()
                      } else if (e.key === 'Escape') {
                        handleCancelEditName()
                      }
                    }}
                    disabled={savingName}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    loading={savingName}
                    disabled={savingName}
                    onClick={() => void handleSaveName()}
                    icon={<Check className="h-3.5 w-3.5" />}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    disabled={savingName}
                    onClick={handleCancelEditName}
                    icon={<X className="h-3.5 w-3.5" />}
                  />
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className="truncate text-sm font-medium"
                    style={{ color: 'var(--md-sys-color-on-surface)' }}
                    title={roomName || roomId}
                  >
                    {roomName || '未命名房间'}
                  </span>
                  {canRename && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--md-sys-color-surface-container-high)]"
                      style={{ color: 'var(--md-sys-color-primary)' }}
                      title="修改房间名称"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 房间 ID */}
            <div className="flex flex-col gap-1">
              <Text
                type="secondary"
                className="text-[10px] uppercase tracking-wide"
              >
                房间 ID
              </Text>
              <button
                onClick={handleCopyRoomId}
                className="flex items-center gap-1.5 self-start rounded-[var(--md-sys-shape-corner)] px-2 py-1 text-xs font-medium transition-all hover:translate-y-[-1px]"
                style={{
                  color: 'var(--md-sys-color-primary)',
                  backgroundColor:
                    'color-mix(in srgb, var(--md-sys-color-primary) 10%, transparent)',
                }}
                title="点击复制"
              >
                {roomId}
                <Copy className="h-3 w-3" />
              </button>
            </div>

            {/* 我的昵称（房间内显示名，随时可改） */}
            <div className="flex flex-col gap-1">
              <Text
                type="secondary"
                className="text-[10px] uppercase tracking-wide"
              >
                我的昵称
              </Text>
              <div className="room-nickname-row flex items-center gap-1.5">
                <Text className="truncate text-xs font-medium">
                  {roomDisplayName || '未设置'}
                </Text>
                <button
                  type="button"
                  onClick={() => {
                    setNicknameDraft(roomDisplayName)
                    setNicknameError('')
                    setNicknameOpen(true)
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--zv-r-chip,8px)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)]"
                  title="修改昵称"
                  aria-label="修改昵称"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 操作按钮组 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                icon={<Share2 className="h-3.5 w-3.5" />}
                onClick={handleCopyLink}
              >
                分享
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Users className="h-3.5 w-3.5" />}
                onClick={() => setShowUsers(true)}
              >
                在线 ({viewers.length})
              </Button>
              {isHost && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Settings className="h-3.5 w-3.5" />}
                  onClick={() => setShowSettings(true)}
                >
                  设置
                </Button>
              )}
            </div>
            {isHost && (
              <div className="zv-toggle-rows">
                <Switch
                  role="switch"
                  className="zv-toggle-row"
                  label="自动通过申请"
                  title="开启后，seek / 暂停 / 继续播放 申请将自动通过"
                  checked={autoApproveRequests}
                  onChange={() => {
                    toggleAutoApproveRequests()
                    message.info(
                      autoApproveRequests
                        ? '已关闭自动通过申请'
                        : '已开启自动通过申请'
                    )
                  }}
                />
                <Switch
                  role="switch"
                  className="zv-toggle-row"
                  label="入房需要审批"
                  title="开启后，观众加入需房主审批"
                  checked={roomSettings.requireApproval}
                  onChange={handleToggleRequireApproval}
                />
                <Switch
                  role="switch"
                  className="zv-toggle-row"
                  label="允许成员添加影片"
                  title="开启后，房间成员可以把影片添加到影片列表；房主与权限矩阵放行的人始终可以添加"
                  checked={moviePermission.allowMembers}
                  disabled={moviePermissionBusy || moviePermissionBusyKey !== null}
                  onChange={() => void handleToggleMoviePermission()}
                />
              </div>
            )}
          </div>

          {/* 房主端在线观众列表 */}
          {isHost && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Users
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--md-sys-color-primary)' }}
                />
                <Text
                  type="secondary"
                  className="text-[10px] uppercase tracking-wide"
                >
                  在线观众（{viewers.length}）
                </Text>
              </div>
              {viewers.length === 0 ? (
                <div
                  className="flex min-h-8 flex-1 items-center justify-center rounded-[var(--md-sys-radius-small)]"
                  style={{
                    backgroundColor: 'var(--glass-bg)',
                  }}
                >
                  <Text type="secondary" className="text-xs">
                    暂无在线观众
                  </Text>
                </div>
              ) : (
                <div className="flex min-h-8 flex-1 flex-row flex-wrap content-start gap-1.5 overflow-y-auto">
                  {viewers.map((viewer) => (
                    <div
                      key={viewer.socketId}
                      className="flex max-w-full items-center gap-1 rounded-[var(--md-sys-shape-corner)] px-2 py-1 transition-colors hover:bg-[var(--md-sys-color-surface-container-highest)]"
                      style={{
                        backgroundColor: 'var(--glass-bg)',
                      }}
                      title={viewer.username || viewer.socketId.slice(0, 8)}
                    >
                      <MessageSquare
                        className="h-3 w-3 shrink-0"
                        style={{ color: 'var(--md-sys-color-primary)' }}
                      />
                      <Text className="truncate text-xs">
                        {viewer.username || viewer.socketId.slice(0, 8)}
                      </Text>
                      <RoleBadge role={viewer.role} />
                      {renderHostViewerActions(viewer, true)}
                      {viewer.muted && (
                        <VolumeX
                          className="h-3 w-3 shrink-0"
                          style={{ color: 'var(--md-sys-color-error)' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showUsers}
        onClose={() => setShowUsers(false)}
        title="在线用户"
      >
        <Space direction="vertical" align="start" className="w-full" size="sm">
          {isHost && (
            <Text type="secondary" className="text-[11px]">
              {moviePermission.allowMembers
                ? '当前已允许成员添加影片，点灭图标可单独禁止某人'
                : '当前未允许成员添加影片，点亮图标可单独允许某人'}
            </Text>
          )}
          {viewers.length === 0 ? (
            <Paragraph type="secondary" className="text-sm">
              暂无其他在线用户
            </Paragraph>
          ) : (
            viewers.map((viewer) => renderViewerItem(viewer, true))
          )}
        </Space>
      </Modal>

      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="房间设置"
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          {/* Tab 切换 */}
          <SegmentedToggle
            options={[
              { value: 'info', label: '房间信息' },
              { value: 'viewers', label: '观众管理' },
              { value: 'permissions', label: '权限说明' },
            ]}
            value={settingsTab}
            onChange={(v) => setSettingsTab(v as SettingsTab)}
          />

          {/* 房间信息 Tab */}
          {settingsTab === 'info' && (
            <div className="flex flex-col gap-3">
              {/* 房间密码 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    <Lock className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">房间密码</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      PASSWORD
                    </Text>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-col gap-1">
                  <Input
                    size="sm"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    placeholder="留空表示无密码"
                    disabled={!isHost || savingSettings}
                  />
                  <Text type="secondary" className="text-[10px]">
                    设置后，观众加入需输入密码。root 账户无需密码。
                  </Text>
                </div>
              </div>

              {/* 观众上限 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-tertiary-container)',
                      color: 'var(--md-sys-color-on-tertiary-container)',
                    }}
                  >
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">观众上限</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      MAX VIEWERS
                    </Text>
                  </div>
                </div>
                <div className="mt-2.5">
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    max={100}
                    value={maxViewersValue}
                    onChange={(e) =>
                      setMaxViewersValue(parseInt(e.target.value, 10) || 1)
                    }
                    disabled={!isHost || savingSettings}
                  />
                </div>
              </div>

              {/* 保存按钮 */}
              {isHost && (
                <Button
                  variant="primary"
                  block
                  loading={savingSettings}
                  disabled={savingSettings}
                  onClick={handleSaveSettings}
                >
                  保存设置
                </Button>
              )}
            </div>
          )}

          {/* 观众管理 Tab */}
          {settingsTab === 'viewers' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Text
                  type="secondary"
                  className="text-[10px] uppercase tracking-wide"
                >
                  在线观众（{viewers.length}）
                </Text>
                <Text type="secondary" className="text-[10px]">
                  {isHost ? '可踢出 / 禁言 / 转交房主' : '仅查看'}
                </Text>
              </div>
              {viewers.length === 0 ? (
                <div
                  className="flex h-32 items-center justify-center rounded-[var(--md-sys-shape-corner)] border"
                  style={{
                    backgroundColor: 'var(--glass-bg)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <Text type="secondary" className="text-xs">
                    暂无在线观众
                  </Text>
                </div>
              ) : (
                <div className="flex flex-row flex-wrap content-start gap-2 overflow-y-auto">
                  {viewers.map((viewer) => renderViewerItem(viewer, true))}
                </div>
              )}
            </div>
          )}

          {/* 权限说明 Tab */}
          {settingsTab === 'permissions' && (
            <div className="flex flex-col gap-3">
              {/* 房主 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    <Crown className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">房主（分享端）</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      HOST
                    </Text>
                  </div>
                </div>
                <Text
                  type="secondary"
                  className="mt-2 text-[11px] leading-relaxed"
                >
                  创建房间或被转交房主身份的用户。可踢出 /
                  禁言观众、任命房管、转交房主、修改房间设置与名称、控制播放。
                </Text>
              </div>

              {/* 房管 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-tertiary-container)',
                      color: 'var(--md-sys-color-on-tertiary-container)',
                    }}
                  >
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">房管（协管员）</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      MODERATOR
                    </Text>
                  </div>
                </div>
                <Text
                  type="secondary"
                  className="mt-2 text-[11px] leading-relaxed"
                >
                  由房主任命的登录用户（上限 10 名）。可协助管理影片（切换 /
                  删除）、踢出与禁言观众、管理语音（语音禁言 /
                  移出语音）；不可操作房主、其他房管与管理员，不可转交房主或修改房间设置。
                </Text>
              </div>

              {/* 观众 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-tertiary-container)',
                      color: 'var(--md-sys-color-on-tertiary-container)',
                    }}
                  >
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">观众</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      VIEWER
                    </Text>
                  </div>
                </div>
                <Text
                  type="secondary"
                  className="mt-2 text-[11px] leading-relaxed"
                >
                  加入房间的用户。可观看影片、发送评论与弹幕（未被禁言时）。无法管理房间或其他观众。
                </Text>
              </div>

              {/* 角色权限层级 */}
              <div className="glass rounded-[var(--md-sys-shape-corner)] p-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      backgroundColor: 'var(--md-sys-color-error-container)',
                      color: 'var(--md-sys-color-on-error-container)',
                    }}
                  >
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <Text className="text-sm font-medium">角色权限层级</Text>
                    <Text
                      type="secondary"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      ROLE HIERARCHY
                    </Text>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <RoleBadge role="root" />
                    <Text type="secondary">
                      拥有最高权限，可创建房间、接管任意房间
                    </Text>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <RoleBadge role="admin" />
                    <Text type="secondary">可创建房间、管理自己创建的房间</Text>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <RoleBadge role="user" />
                    <Text type="secondary">普通注册用户，可加入房间观看</Text>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <RoleBadge role="guest" />
                    <Text type="secondary">
                      游客，仅可观看，不能被转交为房主
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={pendingShareLink !== null} onClose={() => setPendingShareLink(null)}
        title="当前链接使用本机或内网地址"
        footer={<>
          <Button variant="secondary" onClick={() => setPendingShareLink(null)}>取消</Button>
          <Button variant="primary" onClick={() => {
            const url = pendingShareLink
            setPendingShareLink(null)
            if (url) void copyShareLink(url)
          }}>仍然复制</Button>
        </>}>
        <Paragraph className="text-sm break-words">
          {pendingShareLink && getAddressScope(new URL(pendingShareLink).hostname) === 'loopback'
            ? '该链接使用本机回环地址，其他设备无法打开。'
            : '该链接使用内网地址，通常只有同一网络中的设备能打开。'}
          跨网络分享时，请改用可访问的公网地址或已配置的内网穿透入口。
        </Paragraph>
      </Modal>

      {/* 修改房间昵称 Modal */}
      <Modal
        open={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        title="修改昵称"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNicknameOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveNickname}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Paragraph className="text-sm">
            昵称会显示在成员列表、评论区与语音中，仅对当前房间生效。
          </Paragraph>
          <Input
            value={nicknameDraft}
            autoFocus
            placeholder="请输入昵称"
            error={nicknameError}
            onChange={(event) => {
              setNicknameDraft(event.target.value)
              if (nicknameError) setNicknameError('')
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              handleSaveNickname()
            }}
          />
        </div>
      </Modal>

      {/* 房主转交确认 Modal */}
      <Modal
        open={!!transferTarget}
        onClose={() => {
          if (!transferring) setTransferTarget(null)
        }}
        title="转交房主确认"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={transferring}
              onClick={() => setTransferTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={transferring}
              disabled={transferring}
              onClick={handleTransferHost}
            >
              确认转交
            </Button>
          </>
        }
      >
        <Paragraph className="text-sm">
          确定要将房主转交给{' '}
          <span
            className="font-medium"
            style={{ color: 'var(--md-sys-color-primary)' }}
          >
            {transferTarget?.username || '该观众'}
          </span>{' '}
          吗？转交后您将变为观众身份，无法再管理房间。
        </Paragraph>
      </Modal>
    </>
  )
}
