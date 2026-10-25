/** 私人漫游的有界恢复；会话有效性由调用方按房间、身份和代次校验。 */
export class FmRecovery {
  private timer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private skipTimes: number[] = []
  private playing = false

  setPlaying(playing: boolean): void {
    this.playing = playing
    if (!playing) this.cancel()
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.failures = 0
  }

  reset(): void {
    this.cancel()
    this.skipTimes = []
    this.playing = false
  }

  retry(valid: () => boolean, advance: () => void, exhausted: () => void): void {
    if (!this.playing || !valid()) return
    const delay = [2000, 5000, 10000][this.failures]
    if (delay === undefined) {
      this.cancel()
      exhausted()
      return
    }
    if (this.timer !== null) clearTimeout(this.timer)
    this.failures++
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.playing && valid()) advance()
    }, delay)
  }

  skip(advance: () => boolean): 'skipped' | 'inactive' | 'exhausted' {
    if (!this.playing) return 'inactive'
    const now = Date.now()
    this.skipTimes = this.skipTimes.filter((time) => now - time < 60_000)
    if (this.skipTimes.length >= 4) {
      this.cancel()
      return 'exhausted'
    }
    if (!advance()) return 'inactive'
    this.skipTimes.push(now)
    return 'skipped'
  }
}
