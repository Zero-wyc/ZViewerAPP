/** Bounded refresh cycles; ordinary transport retries remain Socket.IO's job. */
export function createSocketRecovery(options: {
  refresh: () => Promise<boolean>
  current: () => boolean
  expired: () => boolean
  connect: () => void
  reject: () => void
  status: (error: string) => void
}) {
  let generation = 0
  let task: Promise<void> | null = null
  let attempted = false
  let recent: number[] = []
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let finishWait: ((ready: boolean) => void) | null = null
  const cancel = () => {
    generation++
    task = null
    attempted = false
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
    finishWait?.(false)
    finishWait = null
  }
  const wait = (delay: number) => new Promise<boolean>(resolve => {
    finishWait = resolve
    retryTimer = setTimeout(() => {
      retryTimer = null
      finishWait = null
      resolve(true)
    }, delay)
  })
  return {
    cancel,
    connected() { cancel(); options.status('') },
    disconnected() { return this.recover(3) },
    retry() { cancel(); recent = []; return this.recover(3) },
    recover(maxAttempts = 1): Promise<void> {
      if (task) return task
      if (attempted || !options.current()) return Promise.resolve()
      attempted = true
      recent = recent.filter(time => Date.now() - time < 30000)
      if (recent.length >= 3) {
        options.status('服务器连续断开连接，请稍后重试')
        return Promise.resolve()
      }
      recent.push(Date.now())
      const version = generation
      const current = () => version === generation && options.current()
      options.status('')
      task = (async () => {
        // Defer refresh so task owns the entire attempt, even for sync failures.
        await Promise.resolve()
        try {
          for (let attempt = 0; attempt < maxAttempts && current(); attempt++) {
            let ok = false
            try { ok = await options.refresh() } catch { /* transient network failure */ }
            if (!current()) return
            if (ok) { options.connect(); return }
            if (options.expired()) { options.reject(); return }
            if (attempt < maxAttempts - 1 && !(await wait(attempt === 0 ? 1000 : 3000))) return
          }
          if (current()) options.status('连接恢复失败，请检查网络后重试')
        } catch {
          if (current()) options.status('连接恢复失败，请检查网络后重试')
        } finally {
          if (version === generation) task = null
        }
      })()
      return task
    },
  }
}
