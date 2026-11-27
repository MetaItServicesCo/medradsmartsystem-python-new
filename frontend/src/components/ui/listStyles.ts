/*
  The one look every module page shares (the system first used on Inspections
  and Leads): a header card, counted tiles that filter, a card to find things
  and a card holding the list. These are the shared measures; the components
  beside this file are built from them.
*/
import { keyframes } from '@emotion/react'

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
