import { useLayoutEffect } from 'react'

/**
 * Once-only scroll reveal for top-level content cards. Only cards actually
 * tracked by this hook receive the hidden state, so async content can never
 * disappear. DOM mutations are batched to one scan per frame and observation
 * stops after the initial page has settled to avoid permanent list overhead.
 */
export const useContentReveal = (pathname: string) => {
  useLayoutEffect(() => {
    const root = document.querySelector('.app-main-scroll') as HTMLElement | null
    if (!root) return

    let stagger = 0
    let resetHandle = 0
    let scanFrame = 0
    const pendingRoots = new Set<HTMLElement>()
    const revealSelector = '.MuiCard-root:not([data-no-reveal="true"])'

    const isTopLevelCard = (el: HTMLElement) => {
      const parentCard = el.parentElement?.closest('.MuiCard-root') as HTMLElement | null
      return !parentCard || !root.contains(parentCard)
    }

    const reveal = (el: HTMLElement) => {
      if (el.dataset.revealed) return
      el.dataset.revealed = '1'
      el.style.transitionDelay = `${Math.min(stagger, 5) * 40}ms`
      el.classList.add('reveal-in')
      stagger += 1
      window.clearTimeout(resetHandle)
      resetHandle = window.setTimeout(() => { stagger = 0 }, 200)
    }

    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            reveal(entry.target as HTMLElement)
            observer.unobserve(entry.target)
          })
        }, { root, threshold: 0.04, rootMargin: '40px 0px' })
      : null

    const track = (el: HTMLElement) => {
      if (el.dataset.revealed || !isTopLevelCard(el)) return
      el.classList.add('reveal-pending')
      if (io) io.observe(el)
      else reveal(el)
    }

    const scan = (node: ParentNode) => {
      if (node instanceof HTMLElement && node.matches(revealSelector)) track(node)
      node.querySelectorAll<HTMLElement>(revealSelector).forEach(track)
    }

    scan(root)

    const flushScans = () => {
      scanFrame = 0
      pendingRoots.forEach(scan)
      pendingRoots.clear()
    }

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) pendingRoots.add(node)
      }))
      if (pendingRoots.size && !scanFrame) scanFrame = window.requestAnimationFrame(flushScans)
    })
    mo.observe(root, { childList: true, subtree: true })

    const safety = window.setTimeout(() => {
      root.querySelectorAll<HTMLElement>('.MuiCard-root.reveal-pending:not(.reveal-in)').forEach(reveal)
    }, 900)

    // Async page shells/cards render during the initial load. Once settled,
    // table updates and searches should not keep a global DOM observer alive.
    const settle = window.setTimeout(() => mo.disconnect(), 4000)

    return () => {
      io?.disconnect()
      mo.disconnect()
      if (scanFrame) window.cancelAnimationFrame(scanFrame)
      window.clearTimeout(safety)
      window.clearTimeout(settle)
      window.clearTimeout(resetHandle)
    }
  }, [pathname])
}

export default useContentReveal
