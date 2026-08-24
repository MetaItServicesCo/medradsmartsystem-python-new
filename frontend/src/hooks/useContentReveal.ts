import { useLayoutEffect } from 'react'

/**
 * Lightweight route entrance for the top-level cards already visible at first
 * paint. Async/list content is deliberately left alone: observing every DOM
 * mutation and every card made large operational screens compete with scrolling
 * and clicks. The route transition still supplies a consistent app-wide entry.
 */
export const useContentReveal = (pathname: string) => {
  useLayoutEffect(() => {
    const root = document.querySelector('.app-main-scroll') as HTMLElement | null
    if (!root) return

    const revealSelector = '.MuiCard-root:not([data-no-reveal="true"])'

    const isTopLevelCard = (el: HTMLElement) => {
      const parentCard = el.parentElement?.closest('.MuiCard-root') as HTMLElement | null
      return !parentCard || !root.contains(parentCard)
    }

    const viewportBottom = root.getBoundingClientRect().bottom + 80
    const cards = Array.from(root.querySelectorAll<HTMLElement>(revealSelector))
      .filter(isTopLevelCard)
      .filter((card) => card.getBoundingClientRect().top <= viewportBottom)
      .slice(0, 8)

    cards.forEach((card, index) => {
      card.classList.add('reveal-pending')
      card.style.transitionDelay = `${index * 24}ms`
    })

    const frame = window.requestAnimationFrame(() => {
      cards.forEach((card) => {
        card.dataset.revealed = '1'
        card.classList.add('reveal-in')
      })
    })

    // Transition delays are only needed for entry and must not linger on cards
    // that later change state or become interactive.
    const cleanupDelay = window.setTimeout(() => {
      cards.forEach((card) => { card.style.transitionDelay = '' })
    }, 500)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(cleanupDelay)
    }
  }, [pathname])
}

export default useContentReveal
