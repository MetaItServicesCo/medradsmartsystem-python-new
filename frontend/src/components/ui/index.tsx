/*
  Shared page pieces, so every module looks and behaves the same:

    <PageHeader>   title, one line on what the page is for, the main action
    <StatTiles>    counted tiles that filter the list (a tablist)
    <FilterCard>   the card that holds search and filters
    <ListCard>     the card that holds the list: a title with its count, the
                   table or cards, and <ListPagination> at its foot
    <RecordCard>   one record as a card, on narrow screens
    <StatusChip>   a status: a dot and a label, never colour alone
    <EmptyState>   what an empty or failed list says, and what to do next
*/
import type { ReactNode } from 'react'
import { Box, Button, Card, Chip, CircularProgress, Pagination, Skeleton, Typography } from '@mui/material'
import { useListContext } from '@/contexts/ListContext'
import { cardSx, enterSx } from './listStyles'

export * from './listStyles'

// ─── Page header ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}

export const PageHeader = ({ title, subtitle, icon, actions }: PageHeaderProps) => (
  <Card component="header" sx={{ ...cardSx, p: { xs: 2, md: 3 }, mb: 2, background: 'linear-gradient(135deg, #F8FAFF 0%, #F5F3FF 100%)', ...enterSx }}>
    <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minWidth: 0 }}>
        {icon && (
          <Box aria-hidden="true" sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: '#EFE7FF', color: '#7C3AED', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: { xs: 22, md: 26 } }}>{title}</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 14 }}>{subtitle}</Typography>
        </Box>
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'stretch', sm: 'flex-end' }, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  </Card>
)

// ─── Counted tiles that filter ───────────────────────────────────────────────

export interface StatTile {
  value: string
  label: string
  count: number
  /** A coloured dot, or an icon in that colour. */
  color: string
  icon?: ReactNode
}

interface StatTilesProps {
  ariaLabel: string
  tiles: StatTile[]
  selected: string
  onSelect: (value: string) => void
  loading?: boolean
}

export const StatTiles = ({ ariaLabel, tiles, selected, onSelect, loading = false }: StatTilesProps) => (
  <Box
    role="tablist"
    aria-label={ariaLabel}
    sx={{
      display: 'grid', gap: 1, mb: 2, ...enterSx,
      gridTemplateColumns: {
        xs: 'repeat(2, minmax(0, 1fr))',
        md: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))`,
        lg: `repeat(${tiles.length}, minmax(0, 1fr))`,
      },
    }}
  >
    {tiles.map(tile => {
      const isSelected = selected === tile.value
      return (
        <Button
          key={tile.value || 'all'}
          role="tab"
          aria-selected={isSelected}
          onClick={() => onSelect(tile.value)}
          sx={{
            justifyContent: 'space-between', gap: 1, minHeight: 52, px: 1.75, borderRadius: '14px', textTransform: 'none', minWidth: 0,
            border: '1px solid', borderColor: isSelected ? tile.color : '#EEF0F6', bgcolor: isSelected ? '#FBFAFF' : '#fff',
            boxShadow: isSelected ? `inset 0 0 0 1px ${tile.color}` : 'none', color: '#1E1B4B',
            transition: 'border-color 180ms cubic-bezier(0.4, 0, 0.2, 1), background-color 180ms cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': { bgcolor: '#F8F7FD', borderColor: tile.color },
            '&:focus-visible': { outline: '3px solid #C4B5FD', outlineOffset: 1 },
          }}
        >
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {tile.icon ? (
              <Box component="span" aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', color: tile.color, flexShrink: 0, '& svg': { fontSize: 18 } }}>{tile.icon}</Box>
            ) : (
              <Box component="span" aria-hidden="true" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: tile.color, flexShrink: 0 }} />
            )}
            <Box component="span" sx={{ fontWeight: 800, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tile.label}</Box>
          </Box>
          <Box component="span" sx={{ fontWeight: 900, fontSize: 16, color: isSelected ? '#5B21B6' : '#344054' }}>
            {loading ? '…' : tile.count.toLocaleString()}
          </Box>
        </Button>
      )
    })}
  </Box>
)

// ─── The find card ───────────────────────────────────────────────────────────

export const FilterCard = ({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) => (
  <Card component="section" aria-label={ariaLabel} sx={{ ...cardSx, p: { xs: 1.5, md: 2 }, mb: 2, overflow: 'visible', ...enterSx }}>
    {children}
  </Card>
)

// ─── The list card ───────────────────────────────────────────────────────────

interface ListCardProps {
  ariaLabel: string
  title: string
  count: number
  loading?: boolean
  /** Fetching a new page or filter while the old one still shows. */
  busy?: boolean
  /** Anything beside the title: a view switch, a note. */
  aside?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export const ListCard = ({ ariaLabel, title, count, loading = false, busy = false, aside, children, footer }: ListCardProps) => (
  <Card component="section" aria-label={ariaLabel} sx={{ ...cardSx, overflow: 'hidden', minWidth: 0, ...enterSx }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: { xs: 1.5, md: 2 }, pt: 1.5, pb: 1.25, borderBottom: '1px solid #EEF0F6' }}>
      <Typography component="h2" sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: 14.5, display: 'flex', alignItems: 'center' }}>
        {title}
        <Box component="span" sx={{ ml: 1, px: 0.9, py: 0.1, borderRadius: '8px', fontSize: 12, fontWeight: 900, bgcolor: '#EDE9FE', color: '#5B21B6' }}>
          {loading ? '…' : count.toLocaleString()}
        </Box>
      </Typography>
      {busy && !loading && <CircularProgress size={14} aria-label="Updating" sx={{ ml: 0.5 }} />}
      {aside && <Box sx={{ ml: { md: 'auto' }, minWidth: 0 }}>{aside}</Box>}
    </Box>
    {children}
    {footer}
  </Card>
)

export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <Box sx={{ p: 2 }} aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={48} />)}</Box>
)

// ─── Paging: a count and numbered pages ──────────────────────────────────────

interface ListPaginationProps {
  /** 1-based. */
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export const ListPagination = ({ page, pageSize, total, onChange }: ListPaginationProps) => {
  if (total <= 0) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', px: { xs: 1.5, md: 2 }, py: 1.5, borderTop: '1px solid #EEF0F6' }}>
      <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#475467' }}>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </Typography>
      {pages > 1 && (
        <Pagination
          count={pages}
          page={current}
          onChange={(_, next) => onChange(next)}
          shape="rounded"
          siblingCount={1}
          boundaryCount={1}
          sx={{
            '& .MuiPaginationItem-root': { borderRadius: '10px', fontWeight: 800, minWidth: 34, height: 34 },
            '& .Mui-selected': { bgcolor: '#7C3AED !important', color: '#fff' },
          }}
        />
      )}
    </Box>
  )
}

// ─── A record as a card ──────────────────────────────────────────────────────

interface RecordCardProps {
  recordKey: string
  label: string
  title: ReactNode
  lines: ReactNode[]
  actions?: ReactNode
  onOpen?: () => void
}

export const RecordCard = ({ recordKey, label, title, lines, actions, onOpen }: RecordCardProps) => {
  const { isFocused } = useListContext()
  const focused = isFocused(recordKey)
  return (
    <Box
      component="li"
      data-list-row-key={recordKey}
      data-list-row-focused={focused ? 'true' : undefined}
      aria-current={focused ? 'true' : undefined}
      aria-label={label}
      onClick={onOpen}
      sx={{
        listStyle: 'none', p: 1.75, borderRadius: '16px', border: '1px solid', minWidth: 0,
        borderColor: focused ? '#A78BFA' : '#EEF0F6', bgcolor: focused ? '#F7F4FF' : '#fff',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'start',
        cursor: onOpen ? 'pointer' : undefined,
      }}
    >
      <Box sx={{ minWidth: 0, display: 'grid', gap: 0.4 }}>
        {title}
        {lines}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }} onClick={event => event.stopPropagation()}>{actions}</Box>}
    </Box>
  )
}

export const RecordCardList = ({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) => (
  <Box component="ul" aria-label={ariaLabel} sx={{ m: 0, p: 1.5, display: 'grid', gap: 1.25 }}>{children}</Box>
)

// ─── Status ──────────────────────────────────────────────────────────────────

export const StatusChip = ({ label, dot, bg, ink }: { label: string; dot: string; bg: string; ink: string }) => (
  <Chip
    size="small"
    label={label}
    title={label}
    icon={<Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, ml: '8px !important', flexShrink: 0 }} />}
    sx={{ bgcolor: bg, color: ink, fontWeight: 800, maxWidth: '100%' }}
  />
)

// ─── Empty and failed lists ──────────────────────────────────────────────────

interface EmptyStateProps {
  title: string
  detail?: ReactNode
  action?: ReactNode
  /** A list that failed to load is an alert; an empty one is a status. */
  failed?: boolean
}

export const EmptyState = ({ title, detail, action, failed = false }: EmptyStateProps) => (
  <Box role={failed ? 'alert' : 'status'} sx={{ py: 7, px: 2, textAlign: 'center' }}>
    <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: detail ? 0.5 : 1 }}>{title}</Typography>
    {detail && <Typography component="div" sx={{ color: '#6B7280', fontWeight: 700, mb: 1.5 }}>{detail}</Typography>}
    {action}
  </Box>
)

export const EmptyStateButton = ({ children, onClick, icon, primary = false }: { children: ReactNode; onClick: () => void; icon?: ReactNode; primary?: boolean }) => (
  <Button startIcon={icon} variant={primary ? 'contained' : 'text'} onClick={onClick} sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px' }}>
    {children}
  </Button>
)
