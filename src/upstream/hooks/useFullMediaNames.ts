import { useSyncExternalStore } from 'react'

const storageKey = 'zviewer-show-full-media-names'
const listeners = new Set<() => void>()
let preference: boolean | undefined

function readPreference(): boolean {
  try { return localStorage.getItem(storageKey) !== 'false' } catch { return true }
}

function getSnapshot(): boolean {
  return preference ??= readPreference()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      preference = readPreference()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

function setShowFullNames(value: boolean) {
  preference = value
  try { localStorage.setItem(storageKey, String(value)) } catch { /* Keep the in-memory preference. */ }
  listeners.forEach(listener => listener())
}

/** A device-local display preference, shared by browsers and episode selectors. */
export function useFullMediaNames() {
  const showFullNames = useSyncExternalStore(subscribe, getSnapshot, () => true)
  return { showFullNames, setShowFullNames }
}

export function mediaNameClass(showFullNames: boolean, compact: 'line' | 'card' = 'line'): string {
  return showFullNames ? 'whitespace-normal [overflow-wrap:anywhere]' : compact === 'card' ? 'line-clamp-2 break-words' : 'truncate'
}
