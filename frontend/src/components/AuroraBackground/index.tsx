import { Box } from '@mui/material'
import { keyframes } from '@emotion/react'

/**
 * A morphing "liquid aurora" backdrop — three large, blurred gradient blobs that
 * drift through soft radial gradients. Transform-only animation keeps the same
 * visual depth without repainting blur and border geometry on every frame.
 * Adapted (technique) from the 21st.dev
 * "LiquidAurora" pattern into this project's emotion/MUI stack. Decorative only:
 * absolutely fills its (position:relative, overflow:hidden) parent and never
 * captures pointer events. Motion runs continuously by design.
 */

const morphA = keyframes`
  0%,100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  33%     { transform: translate3d(26px, -22px, 0) rotate(28deg) scale(1.08); }
  66%     { transform: translate3d(-22px, 20px, 0) rotate(-24deg) scale(0.96); }
`
const morphB = keyframes`
  0%,100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  40%     { transform: translate3d(-30px, 24px, 0) rotate(-30deg) scale(1.1); }
  70%     { transform: translate3d(22px, -18px, 0) rotate(22deg) scale(0.94); }
`
const morphC = keyframes`
  0%,100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
  50%     { transform: translate3d(24px, 26px, 0) rotate(34deg) scale(1.12); }
`

type AuroraBackgroundProps = {
  colors?: [string, string, string]
  blur?: number
  opacity?: number
}

const AuroraBackground = ({
  colors = ['rgba(124,93,216,0.55)', 'rgba(240,82,138,0.5)', 'rgba(59,130,246,0.45)'],
  blur = 60,
  opacity = 1,
}: AuroraBackgroundProps) => {
  const softness = Math.max(58, Math.min(78, 70 + blur / 10))
  const shape = { position: 'absolute' as const, borderRadius: '50%', willChange: 'transform' }
  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity }}>
      <Box sx={{ ...shape, width: '58%', height: '78%', top: '-14%', left: '-10%', background: `radial-gradient(circle at 50% 50%, ${colors[0]}, transparent ${softness}%)`, animation: `${morphA} 19s ease-in-out infinite` }} />
      <Box sx={{ ...shape, width: '62%', height: '82%', bottom: '-20%', right: '-12%', background: `radial-gradient(circle at 50% 50%, ${colors[1]}, transparent ${softness}%)`, animation: `${morphB} 23s ease-in-out infinite` }} />
      <Box sx={{ ...shape, width: '48%', height: '60%', top: '18%', left: '32%', background: `radial-gradient(circle at 50% 50%, ${colors[2]}, transparent ${softness}%)`, animation: `${morphC} 27s ease-in-out infinite` }} />
    </Box>
  )
}

export default AuroraBackground
