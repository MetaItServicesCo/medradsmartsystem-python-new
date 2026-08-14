import { useEffect } from 'react'

/**
 * Drives a cursor-following spotlight on every MUI Card, app-wide, from a single
 * passive pointer listener. On each move we write the pointer position (relative
 * to the hovered card) into `--spot-x` / `--spot-y` CSS variables on that card;
 * the visual glow itself is pure CSS (see `.MuiCard-root::after` in global.css),
 * so there are no React re-renders. Technique adapted from the 21st.dev
 * "Spotlight" motion-primitive, generalised to cover the whole app at once.
 */
export const useCardSpotlight = () => {
  useEffect(() => {
    let frame = 0
    let pending: { card: HTMLElement; x: number; y: number } | null = null

    const flush = () => {
      frame = 0
      if (!pending) return
      pending.card.style.setProperty('--spot-x', `${pending.x}px`)
      pending.card.style.setProperty('--spot-y', `${pending.y}px`)
      pending = null
    }

    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const card = target?.closest?.('.MuiCard-root') as HTMLElement | null
      if (!card) return
      const rect = card.getBoundingClientRect()
      pending = { card, x: event.clientX - rect.left, y: event.clientY - rect.top }
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    document.addEventListener('mousemove', handleMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', handleMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
}

export default useCardSpotlight
