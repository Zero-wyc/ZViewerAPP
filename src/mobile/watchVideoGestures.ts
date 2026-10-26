export type WatchDrag = 'seek' | 'volume'

/** Capture only the video surface; toolbar buttons and panels keep their own input. */
export function attachWatchVideoGestures(element: HTMLElement, options: {
  touchSurfaces?: HTMLElement[]
  surface(event: Event): boolean
  onSingleTap(): void
  onDoubleTap(zone: -1 | 0 | 1): void
  onDragStart(kind: WatchDrag): void
  onDrag(kind: WatchDrag, fraction: number): void
  onDragEnd(kind: WatchDrag, cancelled: boolean): void
}): (() => void) & { cancel(): void } {
  type Press = {
    id: number; x: number; y: number; time: number; width: number; height: number
    zone: -1 | 0 | 1; right: boolean; moved: boolean; kind?: WatchDrag
  }
  let press: Press | null = null
  let tap: { x: number; y: number; zone: number; time: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let suppressClickUntil = -Infinity
  const view = element.ownerDocument.defaultView!
  // Do not disable native scrolling on the stage: settings and menus also live there.
  const touchSurfaces = (options.touchSurfaces ?? [element]).map(surface => ({ surface, action: surface.style.touchAction }))
  for (const { surface } of touchSurfaces) surface.style.touchAction = 'none'
  const consume = (event: Event) => { event.stopImmediatePropagation(); event.preventDefault() }
  const clearTap = () => { clearTimeout(timer); timer = undefined; tap = null }
  const release = (id: number) => {
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
  }
  const cancel = () => {
    const current = press
    press = null
    clearTap()
    if (current) {
      suppressClickUntil = performance.now() + 700
      release(current.id)
      if (current.kind) options.onDragEnd(current.kind, true)
    }
  }
  const down = (event: PointerEvent) => {
    if (!event.isPrimary) { cancel(); return }
    if (event.button !== 0 || !options.surface(event)) { cancel(); return }
    // A second finger must cancel the first drag without committing a seek.
    if (press) cancel()
    clearTimeout(timer)
    timer = undefined
    // Keep the pending first tap while starting a possible second tap.
    const rect = element.getBoundingClientRect()
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : .5
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(),
      width: rect.width, height: rect.height, zone: ratio < 1 / 3 ? -1 : ratio > 2 / 3 ? 1 : 0,
      right: ratio >= .5, moved: false }
    element.setPointerCapture(event.pointerId)
    consume(event)
  }
  const move = (event: PointerEvent) => {
    const current = press
    if (!current || event.pointerId !== current.id) return
    consume(event)
    const dx = event.clientX - current.x, dy = event.clientY - current.y
    if (!current.kind && Math.hypot(dx, dy) > 12) {
      current.moved = true
      clearTap()
      if (Math.abs(dx) >= Math.abs(dy) * 1.2) current.kind = 'seek'
      else if (current.right && Math.abs(dy) >= Math.abs(dx) * 1.2) current.kind = 'volume'
      if (current.kind) options.onDragStart(current.kind)
    }
    if (current.kind) options.onDrag(current.kind,
      current.kind === 'seek' ? dx / Math.max(1, current.width) : -dy / Math.max(1, current.height))
  }
  const up = (event: PointerEvent) => {
    const current = press
    if (!current || event.pointerId !== current.id) return
    move(event)
    press = null
    release(current.id)
    consume(event)
    const now = performance.now()
    suppressClickUntil = now + 700
    if (current.kind) { options.onDragEnd(current.kind, false); return }
    if (current.moved || now - current.time > 350) { clearTap(); return }
    if (tap && now - tap.time <= 320 && tap.zone === current.zone &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 36) {
      clearTap()
      options.onDoubleTap(current.zone)
    } else {
      clearTap()
      tap = { x: event.clientX, y: event.clientY, zone: current.zone, time: now }
      timer = setTimeout(() => { tap = null; timer = undefined; options.onSingleTap() }, 320)
    }
  }
  const click = (event: MouseEvent) => {
    if (!options.surface(event) && event.target !== element) return
    consume(event)
    // Pointer input is handled on release. Keyboard/assistive clicks have no preceding pointer.
    if (event.type === 'click' && event.detail === 0 && performance.now() > suppressClickUntil) options.onSingleTap()
  }
  const lostCapture = (event: PointerEvent) => { if (press?.id === event.pointerId) cancel() }
  const pointerCancel = (event: PointerEvent) => { if (press?.id === event.pointerId) cancel() }
  const hidden = () => { if (element.ownerDocument.hidden) cancel() }
  const additionalPointer = (event: PointerEvent) => { if (press && event.pointerId !== press.id) cancel() }
  element.addEventListener('pointerdown', down, true)
  element.addEventListener('click', click, true)
  element.addEventListener('dblclick', click, true)
  element.addEventListener('lostpointercapture', lostCapture, true)
  view.addEventListener('pointermove', move, { capture: true, passive: false })
  view.addEventListener('pointerdown', additionalPointer, true)
  view.addEventListener('pointerup', up, true)
  view.addEventListener('pointercancel', pointerCancel, true)
  view.addEventListener('blur', cancel)
  element.ownerDocument.addEventListener('visibilitychange', hidden)
  const dispose = () => {
    cancel()
    for (const { surface, action } of touchSurfaces) surface.style.touchAction = action
    element.removeEventListener('pointerdown', down, true)
    element.removeEventListener('click', click, true)
    element.removeEventListener('dblclick', click, true)
    element.removeEventListener('lostpointercapture', lostCapture, true)
    view.removeEventListener('pointermove', move, true)
    view.removeEventListener('pointerdown', additionalPointer, true)
    view.removeEventListener('pointerup', up, true)
    view.removeEventListener('pointercancel', pointerCancel, true)
    view.removeEventListener('blur', cancel)
    element.ownerDocument.removeEventListener('visibilitychange', hidden)
  }
  return Object.assign(dispose, { cancel })
}
