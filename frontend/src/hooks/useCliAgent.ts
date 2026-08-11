import { useEffect, useRef, useCallback } from 'react'
import { useSocket } from './useSocket'
import { useCliAgentStore } from '@/store/cliAgentStore'

/** 本地 CLI 默认端口 */
export const CLI_DEFAULT_PORT = 9333
/** 本地 CLI 健康检查地址 */
export const CLI_HEALTH_URL = `http://127.0.0.1:${CLI_DEFAULT_PORT}/health`
/** 健康检查轮询间隔（毫秒） */
const HEALTH_POLL_INTERVAL_MS = 5000

interface CliAgentAvailablePayload {
  socketId: string
  proxyUrl: string
  agent?: string
  version?: string
}

interface CliAgentsPayload {
  roomId: string
  agents: CliAgentAvailablePayload[]
}

/**
 * 检测本地 CLI 代理是否可用，并订阅房间内 CLI 代理注册事件。
 *
 * 设计原则：
 * - 仅通过 roomId 信任：只要本地 CLI 已连接同一房间，即可使用其代理。
 * - 手动开关：本 hook 只负责「检测并返回可用代理」，不决定是否启用。
 * - 健康检查：轮询 127.0.0.1:9333/health，同时监听 socket 事件获取后端广播的代理列表。
 *
 * @param roomId 当前房间 ID
 * @returns 当前可用的 CLI 代理信息
 */
export function useCliAgent(roomId: string | undefined) {
  const { socket, connected } = useSocket()
  const {
    localOnline,
    agents,
    localError,
    isLoadingAgents,
    setLocalOnline,
    setAgents,
    addAgent,
    removeAgent,
    setIsLoadingAgents,
    reset,
  } = useCliAgentStore()

  const healthAbortRef = useRef<AbortController | null>(null)
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** 执行一次本地健康检查 */
  const checkHealth = useCallback(async () => {
    if (healthAbortRef.current) {
      healthAbortRef.current.abort()
    }
    const controller = new AbortController()
    healthAbortRef.current = controller

    try {
      const res = await fetch(CLI_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = (await res.json()) as { ok?: boolean; agent?: string }
      if (data.ok) {
        setLocalOnline(true, null)
      } else {
        setLocalOnline(false, '本地 CLI 响应异常')
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? '健康检查已取消'
            : err.message
          : '本地 CLI 连接失败'
      setLocalOnline(false, message)
    }
  }, [setLocalOnline])

  /** 向后端请求当前房间的 CLI 代理列表 */
  const listAgents = useCallback(() => {
    if (!socket || !connected || !roomId) return
    setIsLoadingAgents(true)
    socket.emit('cli-list-agents', roomId)
  }, [socket, connected, roomId, setIsLoadingAgents])

  // 1. 本地健康检查轮询
  useEffect(() => {
    if (!roomId) {
      reset()
      return
    }

    // 立即检查一次，再启动轮询
    void checkHealth()
    healthTimerRef.current = setInterval(() => {
      void checkHealth()
    }, HEALTH_POLL_INTERVAL_MS)

    return () => {
      if (healthTimerRef.current) {
        clearInterval(healthTimerRef.current)
        healthTimerRef.current = null
      }
      if (healthAbortRef.current) {
        healthAbortRef.current.abort()
        healthAbortRef.current = null
      }
    }
  }, [roomId, checkHealth, reset])

  // 1b. 定期向后端刷新代理列表，避免 CLI 重连或前端挂载时机导致 agents 为空。
  // 同时用户启用 CLI 后也能更快感知到代理上线。
  const agentsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!socket || !connected || !roomId) return

    // 立即拉取一次，再启动 3 秒轮询
    listAgents()
    agentsTimerRef.current = setInterval(() => {
      listAgents()
    }, 3000)

    return () => {
      if (agentsTimerRef.current) {
        clearInterval(agentsTimerRef.current)
        agentsTimerRef.current = null
      }
    }
  }, [socket, connected, roomId, listAgents])

  // 2. socket 事件监听：代理上线/下线/列表
  useEffect(() => {
    if (!socket || !roomId) return

    const handleAvailable = (payload: CliAgentAvailablePayload) => {
      addAgent(payload)
    }

    const handleUnavailable = (payload: { socketId: string }) => {
      removeAgent(payload.socketId)
    }

    const handleAgents = (payload: CliAgentsPayload) => {
      if (payload.roomId !== roomId) return
      // Android 原生代理（native-android-proxy）由 BilibiliParseSettings 手动注入 store，
      // 未通过 socket 注册到后端，因此后端返回的 agents 列表不包含它。
      // 若直接 setAgents(payload.agents) 会覆盖掉原生代理，导致 getActiveCliProxyUrl() 返回 null，
      // 切换分辨率时误报"CLI 代理未连接"。
      // 这里保留原生代理，只合并后端返回的 socket 注册代理。
      const currentAgents = useCliAgentStore.getState().agents
      const nativeAgents = currentAgents.filter(
        (a) => a.socketId === 'native-android-proxy'
      )
      setAgents([...nativeAgents, ...payload.agents])
      setIsLoadingAgents(false)
    }

    socket.on('cli-agent-available', handleAvailable)
    socket.on('cli-agent-unavailable', handleUnavailable)
    socket.on('cli-agents', handleAgents)

    // 连接成功后立即拉取一次代理列表
    if (connected) {
      listAgents()
    }

    return () => {
      socket.off('cli-agent-available', handleAvailable)
      socket.off('cli-agent-unavailable', handleUnavailable)
      socket.off('cli-agents', handleAgents)
    }
  }, [
    socket,
    roomId,
    connected,
    addAgent,
    removeAgent,
    setAgents,
    setIsLoadingAgents,
    listAgents,
  ])

  // 3. socket 重连后重新拉取代理列表
  useEffect(() => {
    if (connected && roomId) {
      listAgents()
    }
  }, [connected, roomId, listAgents])

  // 房间内有已注册的 CLI 代理即视为可用。
  // 不再强制要求 localOnline：健康检查可能因 CORS/浏览器策略暂时失败，
  // 但 CLI HTTP 服务实际可用。实际不可用时 fetch 会自然报错。
  const selectedAgent = agents[0] ?? null
  const available = agents.length > 0

  return {
    /** 本地 CLI 是否在线 */
    localOnline,
    /** 房间内是否有已注册的 CLI 代理 */
    hasAgent: agents.length > 0,
    /** 房间内有代理即可投入使用（不再强制要求本地健康检查通过） */
    available,
    /** 推荐使用的代理 URL（取第一个可用代理） */
    proxyUrl: selectedAgent?.proxyUrl ?? null,
    /** 代理元信息 */
    agentInfo: selectedAgent,
    /** 最近一次本地健康检查错误 */
    localError,
    /** 是否正在从后端拉取代理列表 */
    isLoadingAgents,
    /** 手动刷新代理列表 */
    refreshAgents: listAgents,
  }
}
