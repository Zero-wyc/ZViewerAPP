export class VideoTap {
  private previous: { x: number; y: number; time: number } | null = null;
  cancel() { this.previous = null; }
  tap(x: number, y: number, time: number, width: number, fullscreen: boolean) {
    const previous = this.previous; this.previous = { x, y, time };
    if (!previous || time - previous.time > 320 || Math.hypot(x - previous.x, y - previous.y) > 40) return null;
    this.previous = null;
    if (x >= width / 3 && x <= width * 2 / 3) return 'toggle' as const;
    return fullscreen ? x < width / 3 ? 'back' as const : 'forward' as const : null;
  }
}
export function seekTarget(time: number, delta: number, duration: number) { return duration > 0 && Number.isFinite(duration) ? Math.min(duration, Math.max(0, time + delta)) : null; }
