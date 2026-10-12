let locks = 0
let previousOverflow = ''
let previousPadding = ''

/** Independent panels and pointer drags release only their own scroll lease. */
export function lockBodyScroll(): () => void {
  if (locks++ === 0) {
    previousOverflow = document.body.style.overflow
    previousPadding = document.body.style.paddingRight
    const width = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (width > 0) document.body.style.paddingRight = `${width}px`
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks === 0) {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPadding
    }
  }
}
