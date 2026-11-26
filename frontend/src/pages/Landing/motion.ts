/**
 * Motion for the public landing page. Three layers move and nothing else
 * (taste-skill, motion.md): the hero's entrance once on load, the two dealt
 * moments in their own sections, and the hover and press layer in CSS. Card
 * loops pause on request; everything rests under reduced motion and on phones.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const media = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
export const prefersReducedMotion = () => media('(prefers-reduced-motion: reduce)')
const isPhone = () => media('(max-width: 639px)') || media('(pointer: coarse) and (max-height: 499px) and (max-width: 959px)')
/** Moments and loops hold their finished picture under reduced motion and on a phone. */
export const holdStill = () => prefersReducedMotion() || isPhone()

/**
 * The page's head while the landing page is open: its title, description,
 * share tags, kind metas and fonts. Everything is put back on the way out,
 * so the signed-in app keeps its own head.
 */
export function useLandingHead({ title, description, themeColor }: { title: string; description: string; themeColor: string }) {
  useEffect(() => {
    const html = document.documentElement
    const previous = { title: document.title, type: html.getAttribute('data-type'), bodyBackground: document.body.style.backgroundColor }
    const added: Element[] = []
    const meta = (attribute: 'name' | 'property', key: string, content: string) => {
      const element = document.createElement('meta')
      element.setAttribute(attribute, key)
      element.setAttribute('content', content)
      element.setAttribute('data-landing-head', '')
      document.head.appendChild(element)
      added.push(element)
    }
    document.title = title
    html.setAttribute('data-type', 'software')
    document.body.style.backgroundColor = themeColor
    meta('name', 'description', description)
    meta('name', 'page-type', 'software')
    meta('name', 'site-kind', 'software')
    meta('name', 'theme-color', themeColor)
    meta('property', 'og:title', title)
    meta('property', 'og:description', description)
    meta('property', 'og:type', 'website')
    meta('name', 'twitter:card', 'summary_large_image')
    meta('property', 'og:image', new URL('/landing-kit/share.jpg', window.location.origin).href)
    if (!document.querySelector('link[data-landing-fonts]')) {
      const fonts = document.createElement('link')
      fonts.rel = 'stylesheet'
      fonts.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400..500&display=swap'
      fonts.setAttribute('data-landing-fonts', '')
      document.head.appendChild(fonts)
    }
    return () => {
      added.forEach(element => element.remove())
      document.title = previous.title
      if (previous.type === null) html.removeAttribute('data-type')
      else html.setAttribute('data-type', previous.type)
      document.body.style.backgroundColor = previous.bodyBackground
    }
  }, [title, description, themeColor])
}

/**
 * The hero arrives once: the h1 rises line by line out of word masks, then
 * the lead, buttons and facts fade up, and the picture settles from 0.98.
 * About 1.1 s, transform and opacity only. Without script or under reduced
 * motion the hero simply stands as written.
 */
export function useHeroEntrance(heroRef: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    // The kit's mark that the page's hero enters on load; the words stand as written without it.
    const html = document.documentElement
    html.classList.add('m-enter')
    const doneMark = window.setTimeout(() => html.classList.add('m-enter-done'), 700)
    return () => { window.clearTimeout(doneMark); html.classList.remove('m-enter', 'm-enter-done') }
  }, [])
  useLayoutEffect(() => {
    const hero = heroRef.current
    if (!hero || prefersReducedMotion()) return
    // The h1's words are rendered in masks (MaskedHeading); group them into lines here.
    const masks = Array.from(hero.querySelectorAll<HTMLElement>('h1 .lp-mask'))
    if (!masks.length) return
    const lineTops = Array.from(new Set(masks.map(mask => mask.offsetTop))).sort((a, b) => a - b)
    const lineGap = Math.min(80, 240 / Math.max(1, lineTops.length - 1))
    masks.forEach(mask => mask.style.setProperty('--lp-delay', `${Math.round(lineTops.indexOf(mask.offsetTop) * lineGap)}ms`))
    // The rest of the column follows as the last line is half way up.
    const followStart = Math.round((lineTops.length - 1) * lineGap + 350)
    const followers = Array.from(hero.querySelectorAll<HTMLElement>('[data-enter-follow]'))
    followers.forEach((element, index) => element.style.setProperty('--lp-delay', `${followStart + index * 60}ms`))
    hero.classList.add('is-entering')
    const done = window.setTimeout(() => {
      hero.classList.remove('is-entering')
      masks.forEach(mask => mask.style.removeProperty('--lp-delay'))
      followers.forEach(element => element.style.removeProperty('--lp-delay'))
    }, followStart + 700)
    return () => {
      window.clearTimeout(done)
      hero.classList.remove('is-entering')
    }
  }, [heroRef])
}

/**
 * A loop that a visitor can pause (motion.md, Pause). Starts on load, never
 * on scroll; holds its finished picture under reduced motion and on a phone.
 */
export function usePausableLoop() {
  const [still] = useState(holdStill)
  const [paused, setPaused] = useState(false)
  return { running: !still && !paused, still, paused, toggle: () => setPaused(value => !value) }
}

/**
 * The hero frame's one effect, the dealt gradient mesh: the kit's effects
 * runtime, loaded as plain files from /landing-kit. A phone and reduced
 * motion keep the CSS ground the frame already paints.
 */
export function useGradientMesh(hostRef: RefObject<HTMLElement>, paused: boolean) {
  const controller = useRef<{ pause(): void; resume(): void; destroy(): void } | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host || holdStill()) return
    let cancelled = false
    // A plain file served from /public: built into a full URL at run time so the bundler never touches it.
    const runtime = new URL('/landing-kit/effects/fx.js', window.location.origin).href
    import(/* @vite-ignore */ runtime)
      .then(async fx => {
        if (cancelled) return
        const mounted = await fx.mount(host, 'gradient-mesh', {
          palette: { bg: '#ffffff', surface: '#f4f4f4', ink: '#111111', muted: '#6b6b6b', accent: '#1a4be0', accentInk: '#ffffff' },
          params: { speed: 0.06, softness: 0.6, tint: 0.55, calm: 0.45, calmX: 0.3, calmY: 0.75 },
          seed: 2184,
        })
        if (cancelled) mounted.destroy()
        else controller.current = mounted
      })
      .catch(() => { /* the CSS ground stays: the frame is never empty */ })
    return () => {
      cancelled = true
      controller.current?.destroy()
      controller.current = null
    }
  }, [hostRef])
  useEffect(() => {
    if (paused) controller.current?.pause()
    else controller.current?.resume()
  }, [paused])
}

/**
 * The two dealt moments (letters-assemble, liquid-type), mounted by the kit's
 * own loader from /landing-kit/moments exactly as the kit ships them. Each
 * [data-moment] under the page mounts once and is destroyed when the page
 * leaves; reduced motion and phones keep the statements as written.
 */
export function useKitMoments(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // The loader would otherwise mount the whole document once; this page mounts its own sections.
    ;(window as unknown as { __momentsManual?: boolean }).__momentsManual = true
    let cancelled = false
    let loader: { mount(el: Element): Promise<unknown>; unmountAll(root: Element): void } | null = null
    const url = new URL('/landing-kit/moments/moments.js', window.location.origin).href
    import(/* @vite-ignore */ url)
      .then(module => {
        if (cancelled) return
        loader = module
        root.querySelectorAll('[data-moment]').forEach(element => { module.mount(element).catch(() => undefined) })
      })
      .catch(() => { /* the statements stand as written */ })
    return () => {
      cancelled = true
      loader?.unmountAll(root)
    }
  }, [rootRef])
}

/** The mega panel opens after 150 ms of hover intent and closes at once on leave. */
export function useHoverIntent(delay = 150) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Escape closes a panel opened by hover too, wherever the focus is.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { window.clearTimeout(timer.current); setOpen(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return {
    open,
    setOpen,
    enter: () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), delay) },
    leave: () => { window.clearTimeout(timer.current); setOpen(false) },
  }
}
