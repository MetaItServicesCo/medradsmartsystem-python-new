import { useEffect } from 'react'

/**
 * Drives the cursor-following card spotlight. Pointer input is coalesced to one
 * update per animation frame and the active card's bounds are cached, avoiding
 * repeated layout measurements while retaining the existing visual effect.
 */
export const useCardSpotlight = () => {
  useEffect(() => {
    const root = document.querySelector('.app-main-scroll') as HTMLElement | null
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!root || !finePointer.matches) return

    let frame = 0
    let pending: { target: HTMLElement; x: number; y: number } | null = null
    let current: HTMLElement | null = null
    let currentRect: DOMRect | null = null

    const flush = () => {
      frame = 0
      if (!pending) return
      const { target, x, y } = pending
      pending = null
      const card = target.closest?.('.MuiCard-root') as HTMLElement | null
      if (!card) {
        current = null
        currentRect = null
        return
      }
      if (card !== current || !currentRect) {
        current = card
        currentRect = card.getBoundingClientRect()
      }
      card.style.setProperty('--spot-x', `${x - currentRect.left}px`)
      card.style.setProperty('--spot-y', `${y - currentRect.top}px`)
    }

    const handleMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      pending = { target, x: event.clientX, y: event.clientY }
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    const reset = () => {
      pending = null
      current = null
      currentRect = null
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }

    root.addEventListener('pointermove', handleMove, { passive: true })
    root.addEventListener('pointerleave', reset)
    root.addEventListener('scroll', reset, { passive: true })
    return () => {
      root.removeEventListener('pointermove', handleMove)
      root.removeEventListener('pointerleave', reset)
      root.removeEventListener('scroll', reset)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
}

export default useCardSpotlight
