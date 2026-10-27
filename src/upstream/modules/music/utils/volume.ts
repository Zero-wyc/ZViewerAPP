/** 保存过的本地音量优先；无效值使用服务器默认百分比（缺省 50%）。 */
export function initialMusicVolume(
  saved: string | null,
  defaultPercent = 50
): number {
  const fallback =
    Number.isFinite(defaultPercent) &&
    defaultPercent >= 0 &&
    defaultPercent <= 100
      ? defaultPercent / 100
      : 0.5
  if (saved == null || saved.trim() === '') return fallback
  const value = Number(saved)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/** The user preference stays independent from the temporary loudness gain. */
export function applyMusicOutputVolume(userVolume: number, gain: number, elements: (HTMLAudioElement | null)[]): number {
  const base = Number.isFinite(userVolume) ? Math.min(1, Math.max(0, userVolume)) : 0
  const attenuation = Number.isFinite(gain) ? Math.min(1, Math.max(0, gain)) : 1
  const effective = base * attenuation
  for (const element of elements) {
    if (!element) continue
    element.muted = base === 0
    element.volume = effective
  }
  return effective
}
