import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, type Variants } from 'framer-motion'

/**
 * Shared motion primitives for the whole app.
 *
 * Motion is a first-class product requirement here, so these always animate
 * (they are not gated on the OS `prefers-reduced-motion` flag — an in-app calm
 * mode is the intended accessibility control instead). Purely presentational.
 */

// A soft, expressive ease-out (fast start, gentle settle). One motion signature
// across the whole system.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

type MotionProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Per-route entrance. Give it a `routeKey` (usually the pathname) and it replays
 * a fade + rise + subtle scale whenever that key changes.
 */
export const PageTransition = ({ children, routeKey, className, style }: MotionProps & { routeKey?: string }) => (
  <motion.div
    key={routeKey}
    className={className}
    style={style}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.18, ease: EASE_OUT }}
  >
    {children}
  </motion.div>
)

/**
 * Scroll-reveal wrapper — the 21st.dev "Scroll Reveal" pattern (framer
 * `whileInView`, once-only): fades + rises its children a little as they enter
 * the viewport. Use it for bespoke sections that aren't plain cards.
 */
export const ScrollReveal = ({ children, className, style, delay = 0, y = 14 }: MotionProps & { delay?: number; y?: number }) => (
  <motion.div
    className={className}
    style={style}
    initial={{ opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 0.45, ease: EASE_OUT, delay }}
  >
    {children}
  </motion.div>
)

/** Reveal a single block on mount, optionally after a delay / from a direction. */
export const Reveal = ({ children, className, style, delay = 0, y = 18 }: MotionProps & { delay?: number; y?: number }) => (
  <motion.div
    className={className}
    style={style}
    initial={{ opacity: 0, y }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.55, ease: EASE_OUT, delay }}
  >
    {children}
  </motion.div>
)

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
}

/**
 * Orchestrates a staggered entrance for any `StaggerItem` descendants. framer
 * propagates `hidden` -> `show` down to child motion elements even through
 * non-motion wrappers (e.g. MUI Grid items), so the layout never has to change.
 */
export const Stagger = ({ children, className, style }: MotionProps) => (
  <motion.div className={className} style={style} variants={staggerContainer} initial="hidden" animate="show">
    {children}
  </motion.div>
)

export const StaggerItem = ({ children, className, style }: MotionProps) => (
  <motion.div className={className} style={style} variants={staggerItem}>
    {children}
  </motion.div>
)

/**
 * Counts a number up to `value` on mount and whenever it changes. Renders the
 * live value as text, so it drops straight into a Typography.
 */
export const AnimatedNumber = ({
  value,
  decimals = 0,
  duration = 1,
  prefix = '',
  suffix = '',
}: {
  value: number
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
}) => {
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    const from = previous.current
    previous.current = value
    if (from === value) {
      setDisplay(value)
      return
    }
    const controls = animate(from, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(latest),
    })
    return () => controls.stop()
  }, [value, duration])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString()

  return <>{prefix}{formatted}{suffix}</>
}
