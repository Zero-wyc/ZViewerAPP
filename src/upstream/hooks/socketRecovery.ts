/** One bounded refresh per recovery cycle; transport retries remain Socket.IO's job. */
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
  return {
    cancel() { generation++; task = null; attempted = false },
    connected() { attempted = false; options.status('') },
    disconnected() { return this.recover() },
    retry() { generation++; task = null; attempted = false; recent = []; return this.recover() },
    recover(): Promise<void> {
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
          const ok = await options.refresh()
          if (!current()) return
          if (ok) options.connect()
          else if (options.expired()) options.reject()
          else options.status('连接恢复失败，请检查网络后重试')
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
