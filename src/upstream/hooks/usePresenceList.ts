import { useLayoutEffect, useRef, useState } from 'react'

// 保留刚被移除的列表项一小段时间，用于播放退出动画。
export type PresenceState = 'present' | 'exiting'

type Key = string | number
type PresenceEntry<T> = { item: T; key: Key; state: PresenceState; previousKey?: Key | null }

export function usePresenceList<T>(
  items: readonly T[],
  getKey: (item: T) => string | number,
  exitMs = 260,
): Array<{ item: T; key: string | number; state: PresenceState }> {
  const committedEntries = useRef<PresenceEntry<T>[]>([])
  const deadlines = useRef(new Map<Key, number>())
  const timer = useRef<number | undefined>(undefined)
  const [, setRevision] = useState(0)

  const entries: PresenceEntry<T>[] = items.map((item) => ({ item, key: getKey(item), state: 'present' }))
  const keys = new Set(entries.map(({ key }) => key))
  const previous = committedEntries.current
  const surviving = previous.filter(({ key, state }) => state === 'present' && keys.has(key))
  const survivingKeys = new Set(surviving.map(({ key }) => key))
  const reordered = entries.filter(({ key }) => survivingKeys.has(key))
    .some(({ key }, index) => key !== surviving[index].key)

  previous.forEach((entry, index) => {
    if (keys.has(entry.key)) return
    const anchor = entry.state === 'exiting' ? entry.previousKey : index === 0 ? null : previous[index - 1].key
    // 首项未重排时留在原位；重排后没有前邻居则放到末尾。
    const previousKey = anchor === null && reordered ? undefined : anchor
    const neighbor = entries.findIndex(({ key }) => key === previousKey)
    const position = previousKey === null ? 0 : neighbor < 0 ? entries.length : neighbor + 1
    entries.splice(position, 0, { ...entry, state: 'exiting', previousKey })
  })

  useLayoutEffect(() => {
    committedEntries.current = entries
    const now = Date.now()
    for (const { key, state } of entries) {
      if (state === 'present') deadlines.current.delete(key)
      else if (!deadlines.current.has(key)) deadlines.current.set(key, now + exitMs)
    }
    if (timer.current !== undefined || deadlines.current.size === 0) return
    // 同一批退出的项共用一次定时器和一次重渲染，清空长片单时不会逐项刷新。
    const sweep = () => {
      timer.current = undefined
      const at = Date.now()
      const expired = new Set([...deadlines.current].filter(([, end]) => end <= at).map(([key]) => key))
      expired.forEach((key) => deadlines.current.delete(key))
      if (expired.size) {
        committedEntries.current = committedEntries.current.filter((entry) => !expired.has(entry.key))
        setRevision((revision) => revision + 1)
      }
      if (deadlines.current.size) timer.current = window.setTimeout(sweep, Math.max(0, Math.min(...deadlines.current.values()) - at))
    }
    timer.current = window.setTimeout(sweep, Math.max(0, Math.min(...deadlines.current.values()) - now))
  })

  useLayoutEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
  }, [])

  return entries
}
