/**
 * SourceBuffer 缓冲管理服务（v2 重写）。
 *
 * 核心设计：每个 SourceBuffer 绑定一条串行操作队列（WeakMap 持有），
 * append / remove 全部入队执行，从根本上消除 updating 状态竞争——
 * 不再需要在每次操作前手工 waitForSourceBufferReady，也不会出现
 * 「remove 时恰好有 append 在进行」导致的 InvalidStateError。
 *
 * 注意：队列项内部如需追加操作，必须调用 removeInQueue / appendInQueue
 * （假定已处于串行上下文），绝不能再 enqueue，否则会自我等待造成死锁。
 *
 * 对外行为与 v1 一致：
 * - appendBuffer：串行 append；遇 QuotaExceededError 自动强制清理后重试一次
 * - pruneSourceBuffer：常规清理，保留 currentTime 前 5 分钟
 * - forcePruneSourceBuffer：溢出恢复，保留 currentTime 前 60 秒
 * - clearSourceBuffer：清空全部缓冲（seek 前调用）
 * - getBufferedEnd / getBufferedAhead：缓冲前瞻查询（纯读，不入队）
 */

/** 单次 append/remove 超时（毫秒），防止 SourceBuffer 卡在 updating 状态。 */
const UPDATE_TIMEOUT_MS = 30000

/**
 * 常规清理保留窗口（秒）。
 *
 * 30s：1080P 5Mbps 下 30s ≈ 18.75MB/轨，双轨 ≈ 37.5MB。
 * 旧值 300s 在 1080P 下单轨即达 187MB，远超 Chrome 150MB 总上限，
 * 导致 prune 形同虚设（currentTime 小时无可清理空间）。
 * 30s 足以覆盖回退 seek 场景，同时保持内存窗口合理。
 */
const PRUNE_KEEP_BEHIND_SEC = 30
/**
 * 溢出强制清理保留窗口（秒）。
 *
 * 10s：QuotaExceededError 发生时的最后手段，仅保留 10s 已播放数据。
 * 旧值 60s 在播放初期（currentTime < 60s）时 safeStart < 0，
 * 无空间可清理导致恢复失败、append 重试再次溢出形成死循环。
 */
const FORCE_PRUNE_KEEP_BEHIND_SEC = 10
/** 常规清理的最小收益（秒）：不足以腾出该时长时不执行 remove */
const PRUNE_MIN_GAIN_SEC = 5

// ── 串行操作队列 ───────────────────────────────────────

const queues = new WeakMap<SourceBuffer, Promise<unknown>>()

/**
 * 将操作排入 SourceBuffer 的串行队列。
 * 前驱操作无论成败，后继都会执行；返回本次操作的 Promise。
 */
function enqueue<T>(sb: SourceBuffer, op: () => Promise<T>): Promise<T> {
  const prev = queues.get(sb) ?? Promise.resolve()
  const next = prev.then(op, op)
  // 队列中只保存「消化为 void」的尾 promise，避免未处理 rejection 告警
  queues.set(
    sb,
    next.then(
      () => undefined,
      () => undefined
    )
  )
  return next
}

/**
 * 等待 SourceBuffer 完成一次 append/remove（updateend）或失败（error）。
 * 调用前必须确保 sb 当前不处于 updating 状态（由队列保证）。
 */
function waitUpdateEnd(sb: SourceBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      sb.removeEventListener('updateend', onEnd)
      sb.removeEventListener('error', onErr)
      clearTimeout(timer)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onErr = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('SourceBuffer 更新失败'))
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('SourceBuffer 更新超时'))
    }, UPDATE_TIMEOUT_MS)
    sb.addEventListener('updateend', onEnd)
    sb.addEventListener('error', onErr)
  })
}

/** 队列内 append（假定已处于串行上下文，sb 非 updating）。 */
async function appendInQueue(
  sb: SourceBuffer,
  data: BufferSource
): Promise<void> {
  sb.appendBuffer(data)
  await waitUpdateEnd(sb)
}

/** 队列内 remove（假定已处于串行上下文）。remove 失败不中断播放。 */
async function removeInQueue(
  sb: SourceBuffer,
  start: number,
  end: number
): Promise<void> {
  if (sb.updating) {
    // 队列保证串行，理论上不会走到这里；防御性等待一次
    await waitUpdateEnd(sb).catch(() => {})
  }
  if (sb.buffered.length === 0) return
  try {
    sb.remove(start, end)
    await waitUpdateEnd(sb)
  } catch {
    // remove 失败（如 MediaSource 已关闭）不中断播放
  }
}

/** 对外 remove：入队执行。 */
function removeRange(
  sb: SourceBuffer,
  start: number,
  end: number
): Promise<void> {
  return enqueue(sb, () => removeInQueue(sb, start, end))
}

// ── 公共 API ─────────────────────────────────────────

/**
 * 等待 SourceBuffer 脱离 updating 状态（严格版，超时 reject）。
 *
 * 保留给需要与队列外操作同步的场景；新代码应优先使用 appendBuffer
 * 等已串行化的 API，无需手工等待。
 */
export function waitForSourceBufferReady(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve()
  return waitUpdateEnd(sb)
}

/**
 * 等待 SourceBuffer 脱离 updating 状态（宽松版，永不 reject）。
 *
 * 用于 remove 操作前的防御性等待：当 append 因 abort 失败时
 * updateend 事件可能不触发，5 秒超时兜底确保不会永久挂起。
 */
export function waitForSourceBufferIdle(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      sb.removeEventListener('updateend', done)
      sb.removeEventListener('error', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, 5000)
    sb.addEventListener('updateend', done)
    sb.addEventListener('error', done)
  })
}

/**
 * 向 SourceBuffer 追加数据（串行化）。
 *
 * 遇 QuotaExceededError（Chrome SourceBuffer 约 150MB 上限）时，
 * 循环清理直到有足够空间重试 append 成功：
 * 1. 先清理 currentTime 之前的数据（保留 keepBehind 秒）
 * 2. 若仍不足，清理 currentTime + aheadKeep 之后的前瞻数据
 * 3. 逐步降低保留窗口（10s→5s→2s→0s 后向，30s→15s→5s→2s 前向）
 * 4. 每轮清理后重试 append，成功即返回
 *
 * 旧实现仅清理一次后重试，清理后仍然满时错误 throw 出去导致
 * `[MsePlayer] 后台下载失败: QuotaExceededError`，attach 路径的 stream 终止。
 *
 * @param currentTime 可选，溢出清理时用于确定保留窗口（默认保留全部）
 */
export function appendBuffer(
  sb: SourceBuffer,
  data: BufferSource,
  currentTime?: number
): Promise<void> {
  return enqueue(sb, async () => {
    try {
      await appendInQueue(sb, data)
    } catch (err) {
      if (!isQuotaExceededError(err)) throw err
      // 溢出恢复：循环清理直到有足够空间
      const ct = currentTime ?? 0
      // 清理阈值逐步降低：保留窗口从宽到严
      const keepBehindSteps = [FORCE_PRUNE_KEEP_BEHIND_SEC, 5, 2, 0]
      const aheadKeepSteps = [30, 15, 5, 2]

      for (let i = 0; i < keepBehindSteps.length; i++) {
        if (sb.buffered.length === 0) break
        // 步骤 1：清理 currentTime 之前的旧数据
        const start = sb.buffered.start(0)
        const safeStart = Math.max(start, ct - keepBehindSteps[i])
        if (safeStart > start) {
          await removeInQueue(sb, start, safeStart)
        }
        // 步骤 2：清理 currentTime + aheadKeep 之后的前瞻数据
        if (sb.buffered.length > 0) {
          const end = sb.buffered.end(sb.buffered.length - 1)
          const aheadCut = ct + aheadKeepSteps[i]
          if (end > aheadCut) {
            await removeInQueue(sb, aheadCut, end)
          }
        }
        // 尝试重试 append
        try {
          await appendInQueue(sb, data)
          return // 成功
        } catch (retryErr) {
          if (!isQuotaExceededError(retryErr)) throw retryErr
          // 继续下一轮清理（更激进的阈值）
        }
      }
      // 所有清理尝试都失败，抛出明确错误让上层处理
      throw new Error(
        `SourceBuffer 清理后仍然满（保留窗口已降至 0s），无法 append ${data.byteLength} 字节`,
        { cause: err }
      )
    }
  })
}

/**
 * 判断错误是否为 SourceBuffer 配额溢出。
 * Chrome 在 SourceBuffer 内存达上限（约 150MB）时抛出此错误。
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.message.includes('SourceBuffer is full')
  )
}

/** 获取 SourceBuffer 末尾时间（已缓冲数据的最后时间戳）。 */
export function getBufferedEnd(sb: SourceBuffer): number {
  if (!sb.buffered.length) return 0
  return sb.buffered.end(sb.buffered.length - 1)
}

/** 获取已缓冲数据中位于 currentTime 之后的时长（秒）。 */
export function getBufferedAhead(
  sb: SourceBuffer,
  currentTime: number
): number {
  if (!sb.buffered.length) return 0
  return Math.max(0, getBufferedEnd(sb) - currentTime)
}

/**
 * 强制清理 SourceBuffer：移除 currentTime 前 60 秒之外的所有数据。
 * 仅在 QuotaExceededError 发生时调用，作为最后手段释放空间。
 */
export async function forcePruneSourceBuffer(
  sb: SourceBuffer,
  currentTime: number
): Promise<void> {
  if (!sb.buffered.length) return
  const start = sb.buffered.start(0)
  const safeStart = Math.max(start, currentTime - FORCE_PRUNE_KEEP_BEHIND_SEC)
  if (safeStart > start) {
    await removeRange(sb, start, safeStart)
  }
}

/**
 * 清空 SourceBuffer 中的所有数据。
 *
 * 用于 MSE seek 前：init segment 与媒体分片全部移除，避免新旧数据不一致。
 */
export async function clearSourceBuffer(sb: SourceBuffer): Promise<void> {
  if (sb.buffered.length === 0) return
  const start = sb.buffered.start(0)
  const end = sb.buffered.end(sb.buffered.length - 1)
  await removeRange(sb, start, end)
}

/**
 * 窗口化清理（MSE seek 专用）：仅移除完全位于 time 之前的缓冲区间，
 * 保留跨越或位于 time 之后的区间。
 *
 * 相比 clearSourceBuffer 全量清空：
 * - remove 的数据量大幅减少，降低主线程阻塞（seek 卡顿的主要来源）；
 * - 目标点之后已缓冲的数据可直接复用，回退 seek 时只需填补缺口，
 *   显著减少重复下载（见 track.seekStream 的 stopAtByte）。
 */
export async function clearSourceBufferBefore(
  sb: SourceBuffer,
  time: number
): Promise<void> {
  // 在串行队列内逐区间移除，避免与 append 竞争
  return enqueue(sb, async () => {
    for (let i = 0; i < sb.buffered.length; i++) {
      const end = sb.buffered.end(i)
      if (end <= time) {
        await removeInQueue(sb, sb.buffered.start(i), end)
        // remove 后 buffered 索引可能变化，重新扫描
        i = -1
      }
    }
  })
}

/**
 * 获取 time 之后首个缓冲区间的起点（秒）；无则返回 null。
 * 纯读操作，不入队。用于 seek 时计算缺口终点（下载停止时间）。
 */
export function getFirstBufferedStartAfter(
  sb: SourceBuffer,
  time: number
): number | null {
  for (let i = 0; i < sb.buffered.length; i++) {
    const start = sb.buffered.start(i)
    const end = sb.buffered.end(i)
    // 区间在 time 之后，或跨越 time（target 在区间内则由调用方先行排除）
    if (end > time) return Math.max(start, time)
  }
  return null
}

/**
 * 常规清理：移除 currentTime 前 5 分钟之外的数据，保持内存窗口合理。
 * 防止长时间播放后 SourceBuffer 内存溢出导致 QuotaExceededError。
 * 收益不足（可清理时长 < 5s）时跳过，减少不必要的 remove 操作。
 */
export async function pruneSourceBuffer(
  sb: SourceBuffer,
  currentTime: number
): Promise<void> {
  if (!sb.buffered.length) return
  const start = sb.buffered.start(0)
  const safeStart = currentTime - PRUNE_KEEP_BEHIND_SEC
  if (safeStart > start + PRUNE_MIN_GAIN_SEC) {
    await removeRange(sb, start, Math.min(safeStart, sb.buffered.end(0)))
  }
}
