export function screenShareViewportHeight(width: number, maximumHeight: number, videoWidth = 0, videoHeight = 0) {
  const ratio = Number.isFinite(videoWidth) && Number.isFinite(videoHeight) && videoWidth > 0 && videoHeight > 0
    ? videoHeight / videoWidth : 9 / 16;
  const limit = Number.isFinite(maximumHeight) && maximumHeight > 0 ? Math.max(160, maximumHeight) : 240;
  return Math.max(160, Math.min(limit, width > 0 && Number.isFinite(width) ? width * ratio : 240));
}
