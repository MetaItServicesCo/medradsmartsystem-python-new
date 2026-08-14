import { Box } from '@mui/material'
import { keyframes } from '@emotion/react'

/**
 * A morphing "liquid aurora" backdrop — three large, blurred gradient blobs that
 * continuously reshape and drift. Adapted (technique) from the 21st.dev
 * "LiquidAurora" pattern into this project's emotion/MUI stack. Decorative only:
 * absolutely fills its (position:relative, overflow:hidden) parent and never
 * captures pointer events. Motion runs continuously by design.
 */

const morphA = keyframes`
  0%,100% { border-radius: 46% 54% 63% 37% / 47% 42% 58% 53%; transform: translate(0, 0) rotate(0deg) scale(1); }
  33%     { border-radius: 62% 38% 40% 60% / 56% 62% 38% 44%; transform: translate(26px, -22px) rotate(28deg) scale(1.08); }
  66%     { border-radius: 38% 62% 58% 42% / 60% 38% 62% 40%; transform: translate(-22px, 20px) rotate(-24deg) scale(0.96); }
`
const morphB = keyframes`
  0%,100% { border-radius: 60% 40% 42% 58% / 44% 58% 42% 56%; transform: translate(0, 0) rotate(0deg) scale(1); }
  40%     { border-radius: 40% 60% 62% 38% / 58% 40% 60% 42%; transform: translate(-30px, 24px) rotate(-30deg) scale(1.1); }
  70%     { border-radius: 55% 45% 38% 62% / 42% 60% 40% 58%; transform: translate(22px, -18px) rotate(22deg) scale(0.94); }
`
const morphC = keyframes`
  0%,100% { border-radius: 50% 50% 55% 45% / 55% 45% 55% 45%; transform: translate(0, 0) rotate(0deg) scale(1); }
  50%     { border-radius: 42% 58% 45% 55% / 48% 55% 45% 52%; transform: translate(24px, 26px) rotate(34deg) scale(1.12); }
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
  const shape = { position: 'absolute' as const, filter: `blur(${blur}px)`, willChange: 'transform, border-radius' }
  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity }}>
      <Box sx={{ ...shape, width: '58%', height: '78%', top: '-14%', left: '-10%', background: `radial-gradient(circle at 50% 50%, ${colors[0]}, transparent 70%)`, animation: `${morphA} 19s ease-in-out infinite` }} />
      <Box sx={{ ...shape, width: '62%', height: '82%', bottom: '-20%', right: '-12%', background: `radial-gradient(circle at 50% 50%, ${colors[1]}, transparent 70%)`, animation: `${morphB} 23s ease-in-out infinite` }} />
      <Box sx={{ ...shape, width: '48%', height: '60%', top: '18%', left: '32%', background: `radial-gradient(circle at 50% 50%, ${colors[2]}, transparent 70%)`, animation: `${morphC} 27s ease-in-out infinite` }} />
    </Box>
  )
}

export default AuroraBackground
