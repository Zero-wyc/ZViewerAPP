import { useSyncExternalStore } from 'react'

type EpisodeViewMode = 'list' | 'grid'

/** Size columns from the available picker width, including expanded panels. */
export function episodeGridColumns(mode: EpisodeViewMode): string {
  return mode === 'grid' ? 'repeat(auto-fill,minmax(min(100%,120px),1fr))' : 'minmax(0,1fr)'
}
const storageKey = 'zviewer-episode-view-mode'
const listeners = new Set<() => void>()
let preference: EpisodeViewMode | undefined

function readPreference(): EpisodeViewMode {
  try { return localStorage.getItem(storageKey) === 'grid' ? 'grid' : 'list' } catch { return 'list' }
}

function getSnapshot() { return preference ??= readPreference() }

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) { preference = readPreference(); listener() }
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

function setEpisodeViewMode(value: EpisodeViewMode) {
  preference = value
  try { localStorage.setItem(storageKey, value) } catch { /* Keep the in-memory preference. */ }
  listeners.forEach(listener => listener())
}

export function useEpisodeViewMode() {
  const episodeViewMode = useSyncExternalStore(subscribe, getSnapshot, () => 'list' as const)
  return { episodeViewMode, setEpisodeViewMode }
}
