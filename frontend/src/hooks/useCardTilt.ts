import { useEffect } from 'react'

/**
 * Subtle, app-wide 3D tilt on stat/KPI-sized cards. Small cards (the stat cards
 * every module uses) lean toward the cursor with a gentle perspective; large
 * panels, tables and hero cards are left flat so dense data never tilts.
 *
 * Technique adapted from the 21st.dev "Tilt" motion-primitive, applied globally
 * from a single passive pointer listener — no per-module wiring and no React
 * re-renders, so no business logic is touched. Purely presentational.
 */
const MAX_DEG = 5

// Only lean cards that are stat/KPI-sized; leave big panels, tables and heroes flat.
const isTiltable = (el: HTMLElement) => el.offsetHeight <= 230 && el.offsetWidth <= 560

export const useCardTilt = () => {
  useEffect(() => {
    let current: HTMLElement | null = null

    const rest = (el: HTMLElement) => {
      el.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
      el.style.transform = ''
    }

    const handleMove = (event: MouseEvent) => {
      const card = (event.target as HTMLElement)?.closest?.('.app-main-scroll .MuiCard-root') as HTMLElement | null
      if (current && current !== card) {
        rest(current)
        current = null
      }
      if (!card || !isTiltable(card)) return
      const rect = card.getBoundingClientRect()
      const px = (event.clientX - rect.left) / rect.width - 0.5
      const py = (event.clientY - rect.top) / rect.height - 0.5
      card.style.transition = 'transform 0.08s ease-out'
      card.style.transform = `perspective(820px) rotateX(${(-py * MAX_DEG).toFixed(2)}deg) rotateY(${(px * MAX_DEG).toFixed(2)}deg) translateY(-2px)`
      current = card
    }

    const handleLeave = () => {
      if (current) {
        rest(current)
        current = null
      }
    }

    document.addEventListener('mousemove', handleMove, { passive: true })
    document.addEventListener('mouseleave', handleLeave)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseleave', handleLeave)
      if (current) rest(current)
    }
  }, [])
}

export default useCardTilt
