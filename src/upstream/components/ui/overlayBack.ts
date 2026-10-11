/** One stack for Escape and native Back; only the most recently opened panel consumes it. */
const panels: { id: symbol; back: () => void }[] = []
export function registerOverlayBack(back: () => void) {
  const panel = { id: Symbol(), back }
  panels.push(panel)
  return () => { const index = panels.indexOf(panel); if (index >= 0) panels.splice(index, 1) }
}
export function consumeOverlayBack() {
  const panel = panels[panels.length - 1]
  if (!panel) return false
  panel.back()
  return true
}
