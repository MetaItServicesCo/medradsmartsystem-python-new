/*
  The one look every module page shares (the system first used on Inspections
  and Leads): a header card, counted tiles that filter, a card to find things
  and a card holding the list. These are the shared measures; the components
  beside this file are built from them.
*/
import { keyframes } from '@emotion/react'

/*
  The dark frame: the public landing page's materials (its deep indigo ground,
  glass, violet and pink glow), used for everything around the work: the
  surround, the sidebar, the top bar, page headers and count tiles. The working
  surfaces (tables, forms, dialogs) stay white for readability.
*/
export const frame = {
  ground: '#0b0a1f',
  surface: '#121030',
  ink: '#f5f3ff',
  text: 'rgba(245, 243, 255, 0.78)',
  muted: '#a8a2cc',
  line: 'rgba(196, 188, 255, 0.14)',
  lineStrong: 'rgba(196, 188, 255, 0.26)',
  violetLight: '#c4bbff',
  /** A glass panel: the landing page's stacking cards. */
  glass: 'linear-gradient(180deg, #17143a 0%, #0e0c26 100%)',
  /** The surround: the circuit film's still, dimmed, under the violet and pink glow. */
  surround: [
    'radial-gradient(55% 45% at 88% 0%, rgba(113, 97, 216, 0.38), transparent 70%)',
    'radial-gradient(45% 40% at 0% 100%, rgba(240, 93, 146, 0.18), transparent 70%)',
    'linear-gradient(rgba(11, 10, 31, 0.86), rgba(11, 10, 31, 0.86))',
    'url("/landing-kit/media/circuit-glow-poster.jpg") center / cover no-repeat',
    '#0b0a1f',
  ].join(', '),
} as const

/** Below this width a list shows cards instead of a table. */
export const COMPACT_LIST_QUERY = '(max-width:899.95px)'

export const cardSx = { borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none' } as const

const riseIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`
/** A page's blocks rise in once (8px, 320ms); still under reduced motion. */
export const enterSx = {
  animation: `${riseIn} 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const

/** A table that fits its card: fixed layout, long text clipped with the whole of it on hover. */
export const listTableSx = { width: '100%', tableLayout: 'fixed' as const, '& .MuiTableCell-root': { px: 1.5 } }
export const listHeadCellSx = { fontWeight: 900, color: '#475467', fontSize: 12.5, letterSpacing: '0.02em', py: 1.25 } as const

/** A column shown only from this breakpoint up (secondary columns drop away as space runs out). */
export const hideBelow = (breakpoint: 'sm' | 'md' | 'lg' | 'xl') => ({ display: { xs: 'none', [breakpoint]: 'table-cell' } })

export const rowIconButtonSx = { bgcolor: '#F4F1FF', color: '#7C3AED', '&:hover': { bgcolor: '#EDE9FE' } } as const
export const primaryActionSx = { minHeight: 44, borderRadius: '14px', fontWeight: 900, textTransform: 'none', whiteSpace: 'nowrap', px: 2.5 } as const
