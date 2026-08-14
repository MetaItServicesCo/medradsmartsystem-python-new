import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useReducedMotion, type Variants } from 'framer-motion'

/**
 * Shared motion primitives for the whole app.
 *
 * All of these degrade gracefully: when the OS/browser requests reduced motion
 * (`prefers-reduced-motion`), every helper renders its content immediately with
 * no animation. Purely presentational — no business logic lives here.
 */

// A soft, expressive ease-out (fast start, gentle settle). Used everywhere so
// the whole system shares one motion signature.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

type MotionProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Per-route entrance. Give it a `routeKey` (usually the pathname) and it replays
 * a gentle fade + rise whenever that key changes.
 */
export const PageTransition = ({ children, routeKey, className, style }: MotionProps & { routeKey?: string }) => {
  const reduce = useReducedMotion()
  return (
    <motion.div
      key={routeKey}
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/** Reveal a single block on mount, optionally after a delay / from a direction. */
export const Reveal = ({ children, className, style, delay = 0, y = 16 }: MotionProps & { delay?: number; y?: number }) => {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  )
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
}

/**
 * Orchestrates a staggered entrance for any `StaggerItem` descendants. framer
 * propagates the `hidden` -> `show` transition down to child motion elements
 * even through non-motion wrappers (e.g. MUI Grid items), so the surrounding
 * layout never has to change.
 */
export const Stagger = ({ children, className, style }: MotionProps) => {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      style={style}
      variants={reduce ? undefined : staggerContainer}
      initial={reduce ? false : 'hidden'}
      animate="show"
    >
      {children}
    </motion.div>
  )
}

export const StaggerItem = ({ children, className, style }: MotionProps) => {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} style={style} variants={reduce ? undefined : staggerItem}>
      {children}
    </motion.div>
  )
}

/**
 * Counts a number up to `value` on mount and whenever it changes. Renders the
 * live value as text, so it can drop straight into a Typography.
 */
export const AnimatedNumber = ({
  value,
  decimals = 0,
  duration = 0.9,
  prefix = '',
  suffix = '',
}: {
  value: number
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
}) => {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    const from = previous.current
    previous.current = value
    if (reduce || from === value) {
      setDisplay(value)
      return
    }
    const controls = animate(from, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(latest),
    })
    return () => controls.stop()
  }, [value, duration, reduce])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString()

  return <>{prefix}{formatted}{suffix}</>
}
