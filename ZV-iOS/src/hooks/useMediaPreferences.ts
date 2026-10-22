import { useEffect, useSyncExternalStore } from 'react';
import { readPreference, writePreference } from '@/lib/preferences';

let preferences = { fullNames: true, episodeMode: 'list' as 'list' | 'grid' };
let loading: Promise<void> | undefined;
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => preferences;
function update(patch: Partial<typeof preferences>) { preferences = { ...preferences, ...patch }; listeners.forEach(listener => listener()); }
export function useMediaPreferences() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    const version = revision;
    loading ??= Promise.all([readPreference('zviewer-show-full-media-names', { value: true }), readPreference('zviewer-episode-view-mode', { value: 'list' })]).then(([names, mode]) => {
      if (revision === version) update({ fullNames: names.value !== false, episodeMode: mode.value === 'grid' ? 'grid' : 'list' });
    }).catch(() => {});
  }, []);
  return { ...value,
    setFullNames: (enabled: boolean) => { revision++; update({ fullNames: enabled }); void writePreference('zviewer-show-full-media-names', { value: enabled }).catch(() => {}); },
    setEpisodeMode: (mode: 'list' | 'grid') => { revision++; update({ episodeMode: mode }); void writePreference('zviewer-episode-view-mode', { value: mode }).catch(() => {}); },
  };
}
