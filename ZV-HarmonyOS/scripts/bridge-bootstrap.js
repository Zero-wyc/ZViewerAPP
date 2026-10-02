(() => {
  // The proxy is installed by ArkWeb before the local page starts its modules.
  if (location.origin !== 'https://zviewer.local') return;
  if (window.zviewerHost?.getPlatform?.() !== 'harmony') return;
  let nextId = 1;
  const pending = new Map();
  window.__zvHarmonyResponse = (id, error, result) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (error) entry.reject(new Error(error));
    else entry.resolve(result == null ? undefined : JSON.parse(result));
  };
  const request = (action, value) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Harmony ${action} timed out`));
    }, action.startsWith('bilibili') ? 30000 : 10000);
    pending.set(id, { resolve, reject, timer });
    try {
      window.zviewerHost.request(id, action, JSON.stringify(value));
    } catch (error) {
      window.__zvHarmonyResponse(id, String(error));
    }
  });
  window.addEventListener('pagehide', () => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Harmony page closed'));
      pending.delete(id);
    }
  });
  window.zviewerNative = {
    platform: 'harmony',
    updateMediaSession: (state) => request('updateMediaSession', state),
    clearMediaSession: (sessionId) => request('clearMediaSession', sessionId),
    minimizeApp: () => window.zviewerHost.minimizeApp(),
    toggleOrientation: (isLandscape) => request('toggleOrientation', isLandscape),
    unlockOrientation: () => request('unlockOrientation', null),
    setImmersive: (enabled) => request('setImmersive', enabled),
    setSystemBarStyle: (dark) => request('setSystemBarStyle', dark),
    requestMicrophonePermission: () => request('requestMicrophonePermission', null).then(() => true, () => false),
    bilibiliStart: () => request('bilibiliStart', null),
    bilibiliStatus: () => request('bilibiliStatus', null),
    bilibiliCreateQr: () => request('bilibiliCreateQr', null),
    bilibiliPollQr: (key) => request('bilibiliPollQr', { key }),
    bilibiliCancelQr: () => request('bilibiliCancelQr', null),
    bilibiliLogout: () => request('bilibiliLogout', null),
  };
})();
