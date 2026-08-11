/**
 * 浏览器控制台日志上报模块。
 *
 * 拦截页面内 console.log / info / warn / error / debug，并捕获未处理异常与 Promise 拒绝，
 * 批量发送到后端 /api/client-logs，统一写入 log/frontend-console.log。
 *
 * 设计原则：
 * - 日志系统自身故障不影响业务代码（所有发送/序列化操作 try-catch）。
 * - 批量上报 + 防抖，避免高频日志导致网络拥塞。
 * - 保留原始 console 输出，确保浏览器开发者工具仍能看到日志。
 * - 可配置最低级别，生产环境默认收集 warn / error，开发环境收集全部。
 */

import { getApiUrl } from './api'

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface ClientLogEntry {
  level: LogLevel
  messages: unknown[]
  timestamp: string
  url?: string
  userAgent?: string
  roomId?: string
}

interface ClientLoggerOptions {
  /** 最低收集级别，低于此级别的日志不上报 */
  minLevel?: LogLevel
  /** 批量发送间隔（毫秒） */
  flushIntervalMs?: number
  /** 单条日志消息最大长度，超出截断 */
  maxMessageLength?: number
  /** 单次批量最大条数 */
  maxBatchSize?: number
  /** 是否同时保留原始 console 输出 */
  preserveConsole?: boolean
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  log: 1,
  info: 2,
  warn: 3,
  error: 4,
}

const DEFAULT_OPTIONS: Required<ClientLoggerOptions> = {
  minLevel: 'warn',
  flushIntervalMs: 1000,
  maxMessageLength: 4000,
  maxBatchSize: 50,
  preserveConsole: true,
}

class ClientLogger {
  private options: Required<ClientLoggerOptions>
  private buffer: ClientLogEntry[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private originalConsole: Record<
    LogLevel,
    (...args: unknown[]) => void
  > | null = null
  private isSending = false

  constructor(options: ClientLoggerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /** 初始化：拦截 console 与全局异常。 */
  init(): void {
    if (this.originalConsole) return // 防止重复初始化
    this.hijackConsole()
    this.hijackGlobalErrors()
    this.startPeriodicFlush()
  }

  /** 手动设置当前房间 ID，后续日志会附加该字段。 */
  setRoomId(roomId: string | null | undefined): void {
    this.roomId = roomId || undefined
  }

  private roomId: string | undefined

  /** 立即强制刷新缓冲区。 */
  flush(): void {
    if (this.buffer.length === 0 || this.isSending) return
    const batch = this.buffer.splice(0, this.options.maxBatchSize)
    this.send(batch)
  }

  private hijackConsole(): void {
    const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
    this.originalConsole = {} as Record<LogLevel, (...args: unknown[]) => void>

    for (const level of levels) {
      const original = console[level] as (...args: unknown[]) => void
      ;(this.originalConsole as Record<LogLevel, (...args: unknown[]) => void>)[
        level
      ] = original

      console[level] = (...args: unknown[]) => {
        // 始终保留原始控制台输出
        try {
          original(...args)
        } catch {
          // 忽略原始输出异常
        }

        if (this.shouldCollect(level)) {
          this.push(level, args)
        }
      }
    }
  }

  private hijackGlobalErrors(): void {
    const onError = (event: ErrorEvent) => {
      this.push('error', [
        '[未捕获异常]',
        event.message,
        event.filename,
        event.lineno,
        event.colno,
        event.error,
      ])
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      this.push('error', ['[未处理 Promise 拒绝]', event.reason])
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
  }

  private shouldCollect(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.options.minLevel]
  }

  private push(level: LogLevel, args: unknown[]): void {
    try {
      const entry: ClientLogEntry = {
        level,
        messages: this.serializeMessages(args),
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        roomId: this.roomId,
      }
      this.buffer.push(entry)
      this.scheduleFlush()
    } catch {
      // 序列化失败时静默丢弃，避免业务代码抛错
    }
  }

  private serializeMessages(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (typeof arg === 'string') {
        return arg.length > this.options.maxMessageLength
          ? arg.slice(0, this.options.maxMessageLength) + '...[truncated]'
          : arg
      }
      if (
        arg === undefined ||
        arg === null ||
        typeof arg === 'number' ||
        typeof arg === 'boolean'
      ) {
        return arg
      }
      if (arg instanceof Error) {
        return {
          __type: 'Error',
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        }
      }
      try {
        const str = JSON.stringify(arg)
        if (str.length > this.options.maxMessageLength) {
          return str.slice(0, this.options.maxMessageLength) + '...[truncated]'
        }
        return arg
      } catch {
        return '[不可序列化对象]'
      }
    })
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, this.options.flushIntervalMs)
  }

  private startPeriodicFlush(): void {
    // 页面可见性变化或卸载前尽量把剩余日志发出去
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush()
      }
    })
    window.addEventListener('beforeunload', () => {
      this.flush()
    })
  }

  private async send(entries: ClientLogEntry[]): Promise<void> {
    if (entries.length === 0) return
    this.isSending = true
    try {
      // 使用 getApiUrl() 避免开发模式下相对路径请求发到 Vite dev server（5174）
      // 而非后端（3333），导致 /api/client-logs 404 或被 Vite proxy 中断。
      await fetch(`${getApiUrl()}/api/client-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entries }),
        // 日志上报使用 keepalive，确保页面关闭时仍能发送
        keepalive: true,
      })
    } catch {
      // 网络失败时不重试，避免无限循环
    } finally {
      this.isSending = false
      // 如果缓冲区还有剩余（可能期间又产生了日志），继续调度
      if (this.buffer.length > 0) {
        this.scheduleFlush()
      }
    }
  }
}

/** 单例 */
let loggerInstance: ClientLogger | null = null

export function initClientLogger(options?: ClientLoggerOptions): ClientLogger {
  if (!loggerInstance) {
    loggerInstance = new ClientLogger(options)
    loggerInstance.init()
  }
  return loggerInstance
}

export function setClientLoggerRoomId(roomId: string | null | undefined): void {
  loggerInstance?.setRoomId(roomId)
}

export function getClientLogger(): ClientLogger | null {
  return loggerInstance
}
