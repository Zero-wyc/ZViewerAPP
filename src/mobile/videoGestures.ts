/** Shared native player input: single taps reveal controls, double taps use thirds. */
export function attachVideoGestures(element: HTMLElement, {
  surface, onSingleTap, onDoubleTap,
}: {
  surface(event: Event): boolean
  onSingleTap(): void
  onDoubleTap(zone: -1 | 0 | 1): void
}): () => void {
  let lastTap: { time: number; x: number; y: number; zone: number } | null = null
  let lastTouchDouble = -Infinity
  let press: { time: number; x: number; y: number } | null = null
  const zone = (x: number): -1 | 0 | 1 => {
    const rect = element.getBoundingClientRect()
    const ratio = rect.width ? (x - rect.left) / rect.width : .5
    return ratio < 1 / 3 ? -1 : ratio > 2 / 3 ? 1 : 0
  }
  const click = (event: Event) => {
    if (!surface(event)) return
    event.stopImmediatePropagation()
    event.preventDefault()
    onSingleTap()
  }
  const double = (event: MouseEvent) => {
    if (!surface(event)) return
    event.stopImmediatePropagation()
    event.preventDefault()
    if (performance.now() - lastTouchDouble > 700) onDoubleTap(zone(event.clientX))
  }
  const pointer = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || !surface(event)) return
    const time = performance.now(), region = zone(event.clientX), start = press
    press = null
    if (!start || time - start.time > 350 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) { lastTap = null; return }
    if (lastTap && time - lastTap.time <= 320 && lastTap.zone === region &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 36) {
      lastTap = null
      lastTouchDouble = time
      onDoubleTap(region)
    } else lastTap = { time, x: event.clientX, y: event.clientY, zone: region }
  }
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && event.isPrimary && surface(event)) press = { time: performance.now(), x: event.clientX, y: event.clientY }
    else { press = null; lastTap = null }
  }
  const cancel = () => { press = null; lastTap = null }
  element.addEventListener('click', click, true)
  element.addEventListener('dblclick', double, true)
  element.addEventListener('pointerup', pointer, true)
  element.addEventListener('pointerdown', down, true)
  element.addEventListener('pointercancel', cancel, true)
  return () => {
    element.removeEventListener('click', click, true)
    element.removeEventListener('dblclick', double, true)
    element.removeEventListener('pointerup', pointer, true)
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('pointercancel', cancel, true)
  }
}
