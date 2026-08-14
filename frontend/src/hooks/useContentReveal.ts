import { useEffect } from 'react'

/**
 * App-wide "Scroll Reveal (Subtle)" — the motion preset recommended by the
 * UI/UX Pro Max design system and mirrored by the 21st.dev Scroll Reveal
 * pattern: content fades and rises a little as it enters view, cards above the
 * fold stagger on load, once-only (never re-triggers).
 *
 * Applied globally to every card in the main content area so all 16 modules get
 * a consistent entrance without per-page wiring. Targets a stable class
 * (.MuiCard-root), catches async-rendered cards via a MutationObserver, and —
 * per the design system's explicit "don't leave content invisible by default"
 * rule — a safety timeout reveals everything regardless. The visual transition
 * lives in global.css (`.app-main-scroll .MuiCard-root`).
 */
export const useContentReveal = (pathname: string) => {
  useEffect(() => {
    const root = document.querySelector('.app-main-scroll') as HTMLElement | null
    if (!root) return

    let stagger = 0
    let resetHandle = 0
    const reveal = (el: HTMLElement) => {
      if (el.dataset.revealed) return
      el.dataset.revealed = '1'
      // Small per-item delay (~0.05s), capped so long lists never feel sluggish.
      el.style.transitionDelay = `${Math.min(stagger, 6) * 50}ms`
      el.classList.add('reveal-in')
      stagger += 1
      window.clearTimeout(resetHandle)
      resetHandle = window.setTimeout(() => { stagger = 0 }, 240)
    }

    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              reveal(entry.target as HTMLElement)
              obs.unobserve(entry.target)
            }
          })
        }, { root, threshold: 0.05 })
      : null

    const track = (el: HTMLElement) => {
      if (el.dataset.revealed) return
      if (io) io.observe(el)
      else reveal(el)
    }
    const revealSelector = '.MuiCard-root:not([data-no-reveal="true"])'
    const scan = (node: ParentNode) => node.querySelectorAll<HTMLElement>(revealSelector).forEach(track)

    scan(root)

    const mo = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        if (node.classList.contains('MuiCard-root') && node.dataset.noReveal !== 'true') track(node)
        scan(node)
      }))
    })
    mo.observe(root, { childList: true, subtree: true })

    // Safety net (design-system fallback): reveal everything regardless so
    // content can never be left hidden if an observer misses it.
    const safety = window.setTimeout(() => {
      root.querySelectorAll<HTMLElement>(revealSelector).forEach(reveal)
    }, 1100)

    return () => {
      io?.disconnect()
      mo.disconnect()
      window.clearTimeout(safety)
      window.clearTimeout(resetHandle)
    }
  }, [pathname])
}

export default useContentReveal
