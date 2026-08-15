import { useEffect } from 'react'

/**
 * Subtle, app-wide 3D tilt on stat/KPI-sized cards. Pointer input is
 * coalesced to one compositor update per animation frame and measurements are
 * cached for the active card, so the effect does not compete with scrolling.
 */
const MAX_DEG = 5

const isTiltable = (rect: DOMRect) => rect.height <= 230 && rect.width <= 560

export const useCardTilt = () => {
  useEffect(() => {
    const root = document.querySelector('.app-main-scroll') as HTMLElement | null
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!root || !finePointer.matches) return

    let current: HTMLElement | null = null
    let currentRect: DOMRect | null = null
    let frame = 0
    let pending: { target: HTMLElement; x: number; y: number } | null = null
    let scrollTimer = 0
    let scrolling = false

    const rest = (el: HTMLElement) => {
      el.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
      el.style.transform = ''
      el.style.willChange = ''
      currentRect = null
    }

    const flush = () => {
      frame = 0
      if (!pending || scrolling) return
      const { target, x, y } = pending
      pending = null
      const card = target.closest?.('.MuiCard-root') as HTMLElement | null

      if (current && current !== card) {
        rest(current)
        current = null
      }
      if (!card) return

      if (card !== current || !currentRect) {
        const rect = card.getBoundingClientRect()
        if (!isTiltable(rect)) return
        current = card
        currentRect = rect
        card.style.willChange = 'transform'
        card.style.transition = 'transform 0.08s ease-out'
      }

      const rect = currentRect
      const px = (x - rect.left) / rect.width - 0.5
      const py = (y - rect.top) / rect.height - 0.5
      card.style.transform = `perspective(820px) rotateX(${(-py * MAX_DEG).toFixed(2)}deg) rotateY(${(px * MAX_DEG).toFixed(2)}deg) translateY(-2px)`
    }

    const handleMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      pending = { target, x: event.clientX, y: event.clientY }
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    const handleLeave = () => {
      pending = null
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
      if (current) {
        rest(current)
        current = null
      }
    }

    const handleScroll = () => {
      scrolling = true
      handleLeave()
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => { scrolling = false }, 120)
    }

    root.addEventListener('pointermove', handleMove, { passive: true })
    root.addEventListener('pointerleave', handleLeave)
    root.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      root.removeEventListener('pointermove', handleMove)
      root.removeEventListener('pointerleave', handleLeave)
      root.removeEventListener('scroll', handleScroll)
      window.clearTimeout(scrollTimer)
      if (frame) window.cancelAnimationFrame(frame)
      if (current) rest(current)
    }
  }, [])
}

export default useCardTilt
