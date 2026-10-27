import { windowBrightness } from '../platform/playerDisplay'

interface BrightnessPort {
  get(): Promise<{ brightness: number; override: number }>
  set(value: number): Promise<void>
}

/** Serialize native writes across overlapping players and restore the original override. */
export function createBrightnessManager(port: BrightnessPort) {
  const owners = new Map<object, { value?: number; order: number }>()
  let baseline: { brightness: number; override: number } | null = null
  let order = 0
  let queue = Promise.resolve()
  const run = <T,>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation)
    queue = next.then(() => {}, () => {})
    return next
  }
  const initialize = async () => {
    if (!baseline) baseline = await port.get()
    return baseline
  }
  const current = () => [...owners.values()].filter(owner => owner.value !== undefined).sort((a, b) => b.order - a.order)[0]
  return {
    acquire() {
      const id = {}, state = { order: 0 } as { value?: number; order: number }
      owners.set(id, state)
      return {
        get: () => run(async () => {
          const original = await initialize()
          return current()?.value ?? original.brightness
        }),
        set(value: number) {
          if (!owners.has(id) || !Number.isFinite(value)) return Promise.resolve()
          state.value = Math.max(0.05, Math.min(1, value))
          state.order = ++order
          const revision = state.order
          return run(async () => {
            await initialize()
            if (!owners.has(id) || state.order !== revision || current() !== state) return
            await port.set(state.value!)
          })
        },
        release() {
          if (!owners.delete(id)) return Promise.resolve()
          return run(async () => {
            if (!baseline) return
            const active = current()
            await port.set(active?.value ?? baseline.override)
            if (!owners.size) baseline = null
          })
        },
      }
    },
  }
}

const manager = createBrightnessManager(windowBrightness)

/** Keep a delayed native read from changing brightness after a cancelled gesture. */
export function createBrightnessGesture(notice: (text: string) => void) {
  const lease = manager.acquire()
  let current: { base: number | null; delta: number | null; ended: boolean } | null = null
  let disposed = false
  const apply = (gesture: NonNullable<typeof current>) => {
    if (disposed || gesture !== current || gesture.base === null || gesture.delta === null) return
    const value = Math.max(0.05, Math.min(1, gesture.base + gesture.delta))
    void lease.set(value).then(() => {
      if (!disposed && gesture === current && !gesture.ended) notice(`亮度 ${Math.round(value * 100)}%`)
    }).catch(() => { if (!disposed && gesture === current) notice('无法调节亮度，请重试') })
  }
  return {
    begin() {
      const gesture = { base: null as number | null, delta: null as number | null, ended: false }
      current = gesture
      void lease.get().then(value => { gesture.base = value; apply(gesture) })
        .catch(() => { if (!disposed && gesture === current) notice('无法读取亮度，请重试') })
    },
    move(fraction: number) { if (current) { current.delta = fraction; apply(current) } },
    end(cancelled: boolean) { if (cancelled) current = null; else if (current) current.ended = true },
    dispose() { disposed = true; current = null; void lease.release().catch(() => {}) },
  }
}
