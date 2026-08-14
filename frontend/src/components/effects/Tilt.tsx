import { useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform, type SpringOptions } from 'framer-motion'

/**
 * 3D perspective tilt that follows the cursor. Adapted from the 21st.dev
 * "Tilt" motion-primitive (ibelick) into this project's stack — it was already
 * framer-motion based, so only the wrapper/typing changed. Wrap any block to
 * give it dynamic depth on hover; it eases back to flat on mouse-leave.
 */

type TiltProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Max rotation in degrees at the edges. */
  rotationFactor?: number
  springOptions?: SpringOptions
}

const DEFAULT_SPRING: SpringOptions = { stiffness: 320, damping: 22, mass: 0.4 }

export const Tilt = ({ children, className, style, rotationFactor = 9, springOptions = DEFAULT_SPRING }: TiltProps) => {
  const ref = useRef<HTMLDivElement>(null)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const xSpring = useSpring(x, springOptions)
  const ySpring = useSpring(y, springOptions)

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [rotationFactor, -rotationFactor])
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-rotationFactor, rotationFactor])
  const transform = useMotionTemplate`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    x.set((event.clientX - rect.left) / rect.width - 0.5)
    y.set((event.clientY - rect.top) / rect.height - 0.5)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ transformStyle: 'preserve-3d', ...style, transform }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  )
}

export default Tilt
