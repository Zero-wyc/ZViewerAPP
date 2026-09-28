(() => {
  // The proxy is installed by ArkWeb before the local page starts its modules.
  if (location.origin !== 'https://zviewer.local') return;
  if (window.zviewerHost?.getPlatform?.() !== 'harmony') return;
  window.zviewerNative = {
    platform: 'harmony',
    minimizeApp: () => window.zviewerHost.minimizeApp(),
  };
})();
