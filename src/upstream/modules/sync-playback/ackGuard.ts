/** One outstanding ack per session; timeout releases the lock and rejects late replies. */
export function createAckGuard(identity: () => string, timeoutMs = 5000) {
  let serial = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const cancel = () => {
    serial++
    clearTimeout(timer)
    timer = undefined
  }
  return {
    begin<T>(apply: (reply: T) => void): ((reply: T) => void) | undefined {
      if (disposed || timer !== undefined) return
      const session = identity()
      const request = ++serial
      timer = setTimeout(cancel, timeoutMs)
      return reply => {
        if (disposed || request !== serial) return
        cancel()
        if (session === identity()) apply(reply)
      }
    },
    cancel,
    dispose() { disposed = true; cancel() },
  }
}
