import { useEffect, useMemo, useState } from 'react';
import { PersonalFm, emptyFm } from '@/lib/personalFm';
import { ncmSong, type NcmRequest, type NcmSong, type Song } from '@/lib/musicCollection';
export function usePersonalFm({ ncm, requestText, play, scope, accountRevision, visible, host }: { ncm: NcmRequest; requestText: (path: string, init?: RequestInit) => Promise<string>; play: (song: Song, signal: AbortSignal) => Promise<void>; scope: string; accountRevision: number; visible: boolean; host: boolean }) {
  const [state, setState] = useState(emptyFm); const [loggedIn, setLoggedIn] = useState(false); const [checking, setChecking] = useState(false);
  const fm = useMemo(() => createFm(ncm, play, setState), [ncm, play]);
  useEffect(() => { fm.reset(); return () => fm.dispose(); }, [fm, scope, accountRevision]);
  useEffect(() => { if (!host) fm.stop(); }, [fm, host]);
  useEffect(() => {
    if (!visible) return;
    let active = true; const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (!active) return; setChecking(true);
      try {
        const status = JSON.parse(await requestText('/api/music/login/status', { signal: controller.signal }));
        if (!active) return; setLoggedIn(status.loggedIn === true);
        if (status.loggedIn === true) await fm.refill();
      } catch { if (active) setLoggedIn(false); }
      finally { if (active) setChecking(false); }
    });
    return () => { active = false; controller.abort(); };
  }, [fm, visible, requestText, scope, accountRevision]);
  return { fm, state: state === fm.state ? state : fm.state, loggedIn, checking };
}

function createFm(ncm: NcmRequest, play: (song: Song, signal: AbortSignal) => Promise<void>, change: (state: ReturnType<typeof emptyFm>) => void) {
  return new PersonalFm({ change, play, fetch: async (mode, scene, signal) => {
    const params = new URLSearchParams({ mode, limit: '6', timestamp: String(Date.now()) });
    if (mode === 'SCENE_RCMD') params.set('submode', scene);
    const data = await ncm<{ data?: NcmSong[] }>(mode === 'DEFAULT' ? `/personal_fm?timestamp=${Date.now()}` : `/personal/fm/mode?${params}`, signal);
    return Array.isArray(data.data) ? data.data.map(ncmSong) : [];
  } });
}
