import { type ReactNode } from 'react'
import { Box } from '@mui/material'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * A subtle, module-relevant background watermark that sits behind page content.
 *
 * Everything here is presentation only: a soft brand-tinted wash plus a large
 * line-art motif that reflects the current module. Rendered as inline SVG (no
 * image files, no network cost), tinted with the module accent at very low
 * opacity so it adds identity without ever competing with data or tables.
 * `pointer-events: none` keeps it purely decorative.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Compact line-art motifs, drawn on a 120x120 canvas.
const MOTIFS: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="16" y="18" width="40" height="34" rx="6" {...stroke} />
      <rect x="64" y="18" width="40" height="22" rx="6" {...stroke} />
      <rect x="16" y="62" width="40" height="40" rx="6" {...stroke} />
      <rect x="64" y="50" width="40" height="52" rx="6" {...stroke} />
      <polyline points="72,86 80,76 88,82 96,66" {...stroke} />
    </>
  ),
  facilities: (
    <>
      <path d="M24 100V44l24-16 24 16v56" {...stroke} />
      <path d="M72 100V58h24v42" {...stroke} />
      <line x1="16" y1="100" x2="104" y2="100" {...stroke} />
      <line x1="48" y1="50" x2="48" y2="58" {...stroke} />
      <line x1="44" y1="54" x2="52" y2="54" {...stroke} />
      <rect x="38" y="70" width="20" height="30" rx="3" {...stroke} />
      <line x1="82" y1="70" x2="86" y2="70" {...stroke} />
      <line x1="82" y1="82" x2="86" y2="82" {...stroke} />
    </>
  ),
  users: (
    <>
      <circle cx="46" cy="46" r="16" {...stroke} />
      <path d="M22 94a24 24 0 0 1 48 0" {...stroke} />
      <circle cx="82" cy="40" r="12" {...stroke} />
      <path d="M74 92a18 18 0 0 1 30-13" {...stroke} />
    </>
  ),
  'service-requests': (
    <>
      <circle cx="46" cy="46" r="18" {...stroke} />
      <circle cx="46" cy="46" r="6" {...stroke} />
      <path d="M46 20v-6M46 78v-6M20 46h-6M78 46h-6M28 28l-4-4M68 68l-4-4M64 28l4-4M24 68l4-4" {...stroke} />
      <path d="M74 74l22 22" {...stroke} />
      <path d="M70 78l8-8 8 8-8 8z" {...stroke} />
    </>
  ),
  inspections: (
    <>
      <rect x="28" y="22" width="64" height="80" rx="8" {...stroke} />
      <rect x="46" y="16" width="28" height="14" rx="4" {...stroke} />
      <polyline points="40,52 48,60 64,42" {...stroke} />
      <line x1="40" y1="76" x2="80" y2="76" {...stroke} />
      <line x1="40" y1="88" x2="70" y2="88" {...stroke} />
    </>
  ),
  sales: (
    <>
      <path d="M24 24h20l6 14 40 6-8 30H50l-6-36" {...stroke} />
      <circle cx="52" cy="90" r="7" {...stroke} />
      <circle cx="84" cy="90" r="7" {...stroke} />
    </>
  ),
  rentals: (
    <>
      <rect x="16" y="44" width="52" height="34" rx="5" {...stroke} />
      <path d="M68 54h18l14 16v8H68z" {...stroke} />
      <circle cx="38" cy="86" r="8" {...stroke} />
      <circle cx="86" cy="86" r="8" {...stroke} />
      <line x1="46" y1="86" x2="78" y2="86" {...stroke} />
    </>
  ),
  inventory: (
    <>
      <path d="M40 30l24-10 24 10v22l-24 10-24-10z" {...stroke} />
      <path d="M40 30l24 10 24-10M64 40v22" {...stroke} />
      <path d="M20 66l18-8 18 8v16l-18 8-18-8z" {...stroke} />
      <path d="M20 66l18 8 18-8M38 74v16" {...stroke} />
      <line x1="76" y1="72" x2="76" y2="96" {...stroke} />
      <line x1="84" y1="72" x2="84" y2="96" {...stroke} />
      <line x1="92" y1="72" x2="92" y2="96" {...stroke} />
      <line x1="100" y1="72" x2="100" y2="96" {...stroke} />
    </>
  ),
  'test-equipment': (
    <>
      <path d="M20 78a38 38 0 0 1 76 0" {...stroke} />
      <line x1="58" y1="78" x2="80" y2="52" {...stroke} />
      <circle cx="58" cy="78" r="5" {...stroke} />
      <polyline points="24,96 40,96 48,80 58,104 68,88 96,88" {...stroke} />
    </>
  ),
  hr: (
    <>
      <circle cx="60" cy="34" r="13" {...stroke} />
      <path d="M38 84a22 22 0 0 1 44 0" {...stroke} />
      <circle cx="28" cy="52" r="10" {...stroke} />
      <path d="M12 92a16 16 0 0 1 26-12" {...stroke} />
      <circle cx="92" cy="52" r="10" {...stroke} />
      <path d="M82 80a16 16 0 0 1 26 12" {...stroke} />
    </>
  ),
  reports: (
    <>
      <line x1="24" y1="20" x2="24" y2="98" {...stroke} />
      <line x1="24" y1="98" x2="102" y2="98" {...stroke} />
      <rect x="36" y="66" width="12" height="26" rx="3" {...stroke} />
      <rect x="58" y="50" width="12" height="42" rx="3" {...stroke} />
      <rect x="80" y="34" width="12" height="58" rx="3" {...stroke} />
      <polyline points="36,60 60,44 82,28" {...stroke} />
    </>
  ),
  billing: (
    <>
      <rect x="18" y="34" width="84" height="52" rx="8" {...stroke} />
      <line x1="18" y1="50" x2="102" y2="50" {...stroke} />
      <line x1="30" y1="68" x2="52" y2="68" {...stroke} />
      <rect x="78" y="64" width="16" height="12" rx="3" {...stroke} />
    </>
  ),
  attendance: (
    <>
      <path d="M40 40a24 24 0 0 1 40 8" {...stroke} />
      <path d="M46 46a17 17 0 0 1 28 14" {...stroke} />
      <path d="M52 54a10 10 0 0 1 15 12" {...stroke} />
      <path d="M40 40c-6 14-4 30 2 44M60 62v26M74 66c2 12 0 20-4 30" {...stroke} />
    </>
  ),
  'my-timesheets': (
    <>
      <circle cx="60" cy="64" r="34" {...stroke} />
      <line x1="52" y1="18" x2="68" y2="18" {...stroke} />
      <line x1="60" y1="18" x2="60" y2="26" {...stroke} />
      <line x1="60" y1="64" x2="60" y2="44" {...stroke} />
      <line x1="60" y1="64" x2="76" y2="70" {...stroke} />
    </>
  ),
  'my-leave': (
    <>
      <circle cx="46" cy="44" r="14" {...stroke} />
      <path d="M46 20v-6M46 74v-6M22 44h-6M76 44h-6M28 26l-4-4M68 62l-4-4M64 26l4-4M24 62l4-4" {...stroke} />
      <path d="M16 98c8-6 16-6 24 0s16 6 24 0 16-6 24 0" {...stroke} />
      <path d="M84 60c0-12 8-18 8-18s8 6 8 18" {...stroke} />
    </>
  ),
  chat: (
    <>
      <path d="M20 34h50a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H40l-14 12V72h-6a8 8 0 0 1-8-8V42a8 8 0 0 1 8-8z" {...stroke} />
      <path d="M86 52h6a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-4v12l-12-12H62" {...stroke} />
    </>
  ),
  calendar: (
    <>
      <rect x="20" y="26" width="80" height="76" rx="8" {...stroke} />
      <line x1="20" y1="46" x2="100" y2="46" {...stroke} />
      <line x1="40" y1="18" x2="40" y2="34" {...stroke} />
      <line x1="80" y1="18" x2="80" y2="34" {...stroke} />
      <circle cx="40" cy="64" r="3.4" {...stroke} />
      <circle cx="60" cy="64" r="3.4" {...stroke} />
      <circle cx="80" cy="64" r="3.4" {...stroke} />
      <circle cx="40" cy="84" r="3.4" {...stroke} />
      <circle cx="60" cy="84" r="3.4" {...stroke} />
    </>
  ),
  profile: (
    <>
      <circle cx="60" cy="60" r="42" {...stroke} />
      <circle cx="60" cy="50" r="14" {...stroke} />
      <path d="M36 92a24 24 0 0 1 48 0" {...stroke} />
    </>
  ),
}

type ModuleTheme = { key: string; accent: string; soft: string }

// Route prefix -> module accent + motif. Accents stay within the brand family
// (indigo / violet / rose / blue / teal). Order matters: longer, more specific
// prefixes are matched first.
const MODULE_TABLE: Array<{ prefix: string; theme: ModuleTheme }> = [
  { prefix: '/dashboard', theme: { key: 'dashboard', accent: '#6757D8', soft: '#F0528A' } },
  { prefix: '/facilities', theme: { key: 'facilities', accent: '#2563EB', soft: '#7C3AED' } },
  { prefix: '/users', theme: { key: 'users', accent: '#7C3AED', soft: '#EC4899' } },
  { prefix: '/service-requests', theme: { key: 'service-requests', accent: '#F0528A', soft: '#7161D8' } },
  { prefix: '/inspections', theme: { key: 'inspections', accent: '#3B82F6', soft: '#7C3AED' } },
  { prefix: '/sales', theme: { key: 'sales', accent: '#7C3AED', soft: '#F0528A' } },
  { prefix: '/rentals', theme: { key: 'rentals', accent: '#0EA5E9', soft: '#7161D8' } },
  { prefix: '/inventory', theme: { key: 'inventory', accent: '#13A77B', soft: '#3B82F6' } },
  { prefix: '/test-equipment', theme: { key: 'test-equipment', accent: '#F59E0B', soft: '#F0528A' } },
  { prefix: '/hr', theme: { key: 'hr', accent: '#6366F1', soft: '#EC4899' } },
  { prefix: '/my-timesheets', theme: { key: 'my-timesheets', accent: '#7161D8', soft: '#0EA5E9' } },
  { prefix: '/my-leave', theme: { key: 'my-leave', accent: '#F59E0B', soft: '#0EA5E9' } },
  { prefix: '/reports', theme: { key: 'reports', accent: '#8B5CF6', soft: '#EC4899' } },
  { prefix: '/billing', theme: { key: 'billing', accent: '#EC4899', soft: '#7C3AED' } },
  { prefix: '/attendance', theme: { key: 'attendance', accent: '#06B6D4', soft: '#7161D8' } },
  { prefix: '/chat', theme: { key: 'chat', accent: '#7C3AED', soft: '#0EA5E9' } },
  { prefix: '/calendar', theme: { key: 'calendar', accent: '#3B82F6', soft: '#7C3AED' } },
  { prefix: '/profile', theme: { key: 'profile', accent: '#6757D8', soft: '#F0528A' } },
]

const DEFAULT_THEME: ModuleTheme = { key: 'dashboard', accent: '#6757D8', soft: '#F0528A' }

const themeForPath = (pathname: string): ModuleTheme =>
  MODULE_TABLE.find((entry) => pathname === entry.prefix || pathname.startsWith(entry.prefix + '/'))?.theme
  ?? MODULE_TABLE.find((entry) => pathname.startsWith(entry.prefix))?.theme
  ?? DEFAULT_THEME

const ModuleBackground = ({ pathname }: { pathname: string }) => {
  const reduce = useReducedMotion()
  const theme = themeForPath(pathname)
  const motif = MOTIFS[theme.key] ?? MOTIFS.dashboard

  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <motion.div
        key={theme.key}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {/* Soft brand-tinted washes for depth */}
        <Box sx={{ position: 'absolute', top: -180, right: -140, width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, ${theme.accent}1F 0%, ${theme.accent}00 68%)` }} />
        <Box sx={{ position: 'absolute', bottom: -220, left: -160, width: 560, height: 560, borderRadius: '50%', background: `radial-gradient(circle, ${theme.soft}14 0%, ${theme.soft}00 66%)` }} />

        {/* Large module motif, low opacity, anchored bottom-right */}
        <Box
          sx={{ position: 'absolute', bottom: -36, right: -28, color: theme.accent, opacity: 0.05, lineHeight: 0 }}
        >
          <svg width={480} height={480} viewBox="0 0 120 120">{motif}</svg>
        </Box>

        {/* A smaller echo of the motif, top-left, for balance */}
        <Box sx={{ position: 'absolute', top: 8, left: -26, color: theme.soft, opacity: 0.035, lineHeight: 0, transform: 'rotate(-8deg)' }}>
          <svg width={230} height={230} viewBox="0 0 120 120">{motif}</svg>
        </Box>
      </motion.div>
    </Box>
  )
}

export default ModuleBackground
