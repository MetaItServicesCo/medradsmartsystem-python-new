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
    // The app locks the document's scroll (it scrolls inside its own panels); the landing page scrolls the window.
    html.classList.add('lp-page')
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
      fonts.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400..500&family=Instrument+Serif:ital@1&display=swap'
      fonts.setAttribute('data-landing-fonts', '')
      document.head.appendChild(fonts)
    }
    return () => {
      added.forEach(element => element.remove())
      document.title = previous.title
      if (previous.type === null) html.removeAttribute('data-type')
      else html.setAttribute('data-type', previous.type)
      document.body.style.backgroundColor = previous.bodyBackground
      html.classList.remove('lp-page')
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

/**
 * Scroll motion across the page (asked for by the client, beyond the kit's one
 * dealt moment). Two kinds, one passive scroll listener, transform and opacity
 * only, the page scrolling natively:
 *   [data-reveal]   rises in once as it enters (staggered by --i);
 *   [data-scrub]    follows the scrollbar: --p runs 0 to 1 as its top travels from
 *                   the screen's foot to 35% down; the hero's --x runs 0 to 1 as
 *                   the hero leaves.
 * Content is only ever hidden under html.lp-motion, which this hook sets, so the
 * page reads in full without script and under reduced motion.
 */
export function useScrollMotion(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion()) return
    const html = document.documentElement
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    const scrubs = Array.from(root.querySelectorAll<HTMLElement>('[data-scrub]'))
    const hero = root.querySelector<HTMLElement>('.lp-hero')
    // Anything already scrolled past (a jump to an anchor, a reload half way down) shows at once.
    reveals.forEach(element => { if (element.getBoundingClientRect().bottom < 0) element.classList.add('is-in') })
    html.classList.add('lp-motion')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-in')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 })
    reveals.forEach(element => { if (!element.classList.contains('is-in')) observer.observe(element) })

    let frame = 0
    const draw = () => {
      frame = 0
      const height = window.innerHeight
      scrubs.forEach(element => {
        const rect = element.getBoundingClientRect()
        if (rect.top > height * 1.2 || rect.bottom < -height * 0.2) return
        const progress = Math.min(1, Math.max(0, (height - rect.top) / (height * 0.65)))
        element.style.setProperty('--p', progress.toFixed(4))
      })
      if (hero) {
        const leaving = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)))
        hero.style.setProperty('--x', leaving.toFixed(4))
      }
    }
    const request = () => { if (!frame) frame = window.requestAnimationFrame(draw) }
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    draw()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      if (frame) window.cancelAnimationFrame(frame)
      html.classList.remove('lp-motion')
    }
  }, [rootRef])
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (from: number, to: number, value: number) => {
  const x = clamp01((value - from) / (to - from))
  return x * x * (3 - 2 * x)
}

/**
 * The pinned product stage (MotionSites: sticky cinematic stage with CSS-variable
 * choreography). The section is a long runway; its stage sticks for the length of
 * it. Scroll is smoothed (lerp .14) and written as --enter (the window rising into
 * place) and --progress (the timeline), and the story's step is returned so the
 * window can show what the job has reached. Reduced motion keeps the mapping, with
 * no smoothing.
 */
export function useStoryStage(sectionRef: RefObject<HTMLElement>, steps: number) {
  const [step, setStep] = useState(() => (prefersReducedMotion() ? steps - 1 : 0))
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const reduce = prefersReducedMotion()
    let target = 0
    let smooth = 0
    let ready = false
    let frame = 0
    let lastStep = -1
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const height = window.innerHeight
      const run = Math.max(1, section.offsetHeight - height)
      target = Math.min(run, Math.max(0, -rect.top))
      smooth = !ready || reduce ? target : smooth + (target - smooth) * 0.14
      ready = true
      if (Math.abs(smooth - target) < 0.08) smooth = target
      const enter = reduce ? 1 : smoothstep(0, height * 0.9, height - rect.top)
      const progress = clamp01(smooth / run)
      const storyProgress = clamp01((progress - 0.06) / 0.86)
      const next = Math.min(steps - 1, Math.floor(storyProgress * steps))
      section.style.setProperty('--enter', enter.toFixed(4))
      section.style.setProperty('--progress', storyProgress.toFixed(4))
      if (next !== lastStep) { lastStep = next; setStep(next) }
      if (smooth !== target) frame = window.requestAnimationFrame(update)
    }
    const request = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    update()
    return () => {
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [sectionRef, steps])
  return step
}

/**
 * Sticky stacking cards that scale down (MotionSites scroll recipe 5): each card
 * pins under the one before; the deck underneath shrinks a step as the next one
 * slides over it. Reduced motion keeps the deck, without the scaling.
 */
export function useStackCards(sectionRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const section = sectionRef.current
    if (!section || prefersReducedMotion()) return
    const cards = Array.from(section.querySelectorAll<HTMLElement>('.lp-stack__card'))
    const count = cards.length
    let frame = 0
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const progress = clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight))
      cards.forEach((card, index) => {
        const targetScale = 1 - (count - 1 - index) * 0.035
        const t = clamp01((progress - index / count) / (1 - index / count))
        card.style.setProperty('--deal', (1 + (targetScale - 1) * t).toFixed(4))
        card.style.setProperty('--dim', ((1 - targetScale) * Math.max(0, t - 0.35) / 0.65 * 3.2).toFixed(4))
      })
    }
    const request = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    update()
    return () => {
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [sectionRef])
}

/** A soft light follows the pointer across the cards it hovers (fine pointers only). */
export function useCursorLight(rootRef: RefObject<HTMLElement>, selector: string) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !media('(hover: hover) and (pointer: fine)')) return
    const move = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(selector)
      if (!card) return
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
      card.style.setProperty('--my', `${event.clientY - rect.top}px`)
    }
    root.addEventListener('pointermove', move, { passive: true })
    return () => root.removeEventListener('pointermove', move)
  }, [rootRef, selector])
}

/**
 * The hero's background film: plays muted and looping; reduced motion keeps its
 * still poster. A visitor can pause it (anything moving past five seconds).
 */
export function useHeroVideo(videoRef: RefObject<HTMLVideoElement>) {
  const [still] = useState(prefersReducedMotion)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (still || paused) { video.pause(); return }
    video.muted = true
    const playing = video.play()
    if (playing && typeof playing.catch === 'function') playing.catch(() => setPaused(true))
  }, [videoRef, still, paused])
  return { still, paused, toggle: () => setPaused(value => !value) }
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
