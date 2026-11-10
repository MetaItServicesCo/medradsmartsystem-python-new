/**
 * Keep windows above a phone's on-screen keyboard.
 *
 * When the keyboard opens, a phone shrinks only the part of the page that can
 * be seen; the page itself, and every window on it, keeps its full height, so
 * the bottom of a window, and often the field being typed in, sits behind the
 * keyboard. This measures the part that can be seen and hands it to the styles
 * (--visible-height, --visible-top, and the keyboard-open class on <html>),
 * which on a phone fit each window into it. Nothing changes on a computer.
 *
 * Only the keyboard counts: when someone pinches to zoom, the visible part also
 * shrinks, but windows keep their size so the zoom still works.
 */

/** The keyboard takes at least this much of the screen; less is a toolbar or a bar hiding. */
export const KEYBOARD_MIN_HEIGHT = 150

export interface VisibleArea {
  height: number
  top: number
  keyboardOpen: boolean
}

export function visibleArea(
  layoutHeight: number,
  viewport: { height: number; offsetTop: number; scale: number } | null | undefined,
): VisibleArea {
  const full = { height: layoutHeight, top: 0, keyboardOpen: false }
  if (!viewport || !(layoutHeight > 0)) return full
  const zoomed = Math.abs(viewport.scale - 1) > 0.01
  const keyboardOpen = !zoomed && layoutHeight - viewport.height >= KEYBOARD_MIN_HEIGHT
  if (!keyboardOpen) return full
  return { height: Math.round(viewport.height), top: Math.max(0, Math.round(viewport.offsetTop)), keyboardOpen: true }
}

export function installKeyboardViewport(win: Window = window): () => void {
  const viewport = win.visualViewport
  if (!viewport) return () => {}
  const root = win.document.documentElement
  let frame = 0
  let wasOpen = false
  const apply = () => {
    frame = 0
    const area = visibleArea(win.innerHeight, viewport)
    root.style.setProperty('--visible-height', `${area.height}px`)
    root.style.setProperty('--visible-top', `${area.top}px`)
    root.classList.toggle('keyboard-open', area.keyboardOpen)
    // Once the window has been fitted above the keyboard, bring the field
    // being typed in back into view inside it.
    if (area.keyboardOpen && !wasOpen) {
      const field = win.document.activeElement as HTMLElement | null
      if (field && /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) {
        win.setTimeout(() => field.scrollIntoView?.({ block: 'center' }), 60)
      }
    }
    wasOpen = area.keyboardOpen
  }
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(apply)
  }
  apply()
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  win.addEventListener('resize', schedule)
  return () => {
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
    win.removeEventListener('resize', schedule)
    if (frame) win.cancelAnimationFrame(frame)
  }
}
