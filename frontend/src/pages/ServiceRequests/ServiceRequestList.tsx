import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { rememberServiceRequestList } from './listReturn'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton,
  Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Menu, MenuItem,
  ListItemIcon, ListItemText, SelectChangeEvent, TextField, InputAdornment, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import BuildIcon from '@mui/icons-material/Build'
import AssignmentIcon from '@mui/icons-material/Assignment'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined'
import { toast } from 'react-toastify'

import {
  fetchServiceRequests,
  deleteServiceRequest,
  type ServiceRequest,
  type ServiceRequestStatus as SRStatus,
} from '@/api/serviceRequests'
import CreateServiceRequestModal from './CreateServiceRequestModal'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import ContextTableRow from '@/components/ContextTableRow'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/config/permissions'
import { isInternalServiceAdmin } from '@/utils/serviceRolePolicy'
import {
  COMPACT_LIST_QUERY, EmptyState, EmptyStateButton, FilterCard, ListCard, ListPagination, ListSkeleton, PageHeader,
  RecordCard, RecordCardList, StatTiles, StatusChip, hideBelow, listHeadCellSx, listTableSx, primaryActionSx, rowIconButtonSx,
} from '@/components/ui'

// A status or priority as a chip: a dot and a label, never colour alone.
const PRIORITY_STYLE: Record<string, { label: string; dot: string; bg: string; ink: string }> = {
  low:      { label: 'Low', dot: '#0EA5E9', bg: '#E0F2FE', ink: '#0369A1' },
  medium:   { label: 'Medium', dot: '#F59E0B', bg: '#FEF3C7', ink: '#B45309' },
  high:     { label: 'High', dot: '#F43F5E', bg: '#FFE4E6', ink: '#BE123C' },
  critical: { label: 'Critical', dot: '#DC2626', bg: '#FEE2E2', ink: '#B91C1C' },
}

const STATUS_STYLE: Record<string, { dot: string; bg: string; ink: string }> = {
  new:         { dot: '#6366F1', bg: '#E0E7FF', ink: '#4338CA' },
  assigned:    { dot: '#3B82F6', bg: '#DBEAFE', ink: '#1D4ED8' },
  in_progress: { dot: '#F59E0B', bg: '#FEF3C7', ink: '#B45309' },
  waiting_on_parts: { dot: '#F43F5E', bg: '#FFE4E6', ink: '#BE123C' },
  waiting_for_approval: { dot: '#0EA5E9', bg: '#E0F2FE', ink: '#0369A1' },
  waiting_for_depot_repair: { dot: '#A855F7', bg: '#F3E8FF', ink: '#7E22CE' },
  waiting_for_vendor_repair: { dot: '#F97316', bg: '#FFEDD5', ink: '#C2410C' },
  completed:   { dot: '#10B981', bg: '#D1FAE5', ink: '#047857' },
  cancelled:   { dot: '#9CA3AF', bg: '#F3F4F6', ink: '#4B5563' },
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'Service In Progress',
  waiting_on_parts: 'Waiting on Parts',
  waiting_for_approval: 'Waiting for Approval',
  waiting_for_depot_repair: 'Waiting for Depot Repair',
  waiting_for_vendor_repair: 'Waiting for Vendor Repair',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const PriorityChip = ({ priority }: { priority: string }) => {
  const style = PRIORITY_STYLE[priority] || { ...PRIORITY_STYLE.low, label: priority }
  return <StatusChip label={style.label} dot={style.dot} bg={style.bg} ink={style.ink} />
}

const RequestStatusChip = ({ status }: { status: string }) => {
  const style = STATUS_STYLE[status] || STATUS_STYLE.new
  return <StatusChip label={STATUS_LABELS[status] || status} dot={style.dot} bg={style.bg} ink={style.ink} />
}

const WORKFLOW_OPEN_STATUSES = [
  'in_progress',
  'waiting_on_parts',
  'waiting_for_approval',
  'waiting_for_depot_repair',
  'waiting_for_vendor_repair',
]

const SERVICE_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'request_number', label: 'Request #' },
  { value: 'facility', label: 'Facility' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'technician', label: 'Technician' },
  { value: 'requester', label: 'Created By' },
  { value: 'created', label: 'Created' },
]

// The four counts at the top; each filters the list by its group.
const STAT_TILES = [
  { value: 'total', label: 'Total requests', icon: <BuildIcon />, color: '#6757D8' },
  { value: 'new', label: 'New / open', icon: <AssignmentIcon />, color: '#3B82F6' },
  { value: 'in_progress', label: 'Active workflow', icon: <PendingActionsIcon />, color: '#E39B23' },
  { value: 'completed', label: 'Completed', icon: <CheckCircleOutlineIcon />, color: '#13A77B' },
]

const ServiceRequestList = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore(state => state.user)
  const canCreateServiceRequests = hasPermission(user, 'service-requests', 'add')
  const canDeleteServiceRequests = isInternalServiceAdmin(user)
  const compact = useMediaQuery(COMPACT_LIST_QUERY)
    && hasPermission(user, 'service-requests', 'delete')

  const querySearch = searchParams.get('search') || ''
  const querySearchField = searchParams.get('search_field') || 'all'
  const queryStatus = searchParams.get('status') || ''
  const queryPriority = searchParams.get('priority') || ''
  const queryStatusGroup = searchParams.get('status_group') || ''
  const queryDateFrom = searchParams.get('date_from') || ''
  const queryDateTo = searchParams.get('date_to') || ''
  const invalidDateRange = Boolean(queryDateFrom && queryDateTo && queryDateFrom > queryDateTo)

  const [searchInput, setSearchInput] = useState(querySearch)
  // The page lives in the address with the filters (?page=78), so leaving for a
  // request's details and coming back - by its Back button or the browser's -
  // returns to the same page. Changing a filter or the search starts at page 1.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    setSearchParams(next, { replace: true })
  }
  const location = useLocation()
  useEffect(() => { rememberServiceRequestList(location.search) }, [location.search])
  const [limit] = useState(10)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ServiceRequest | null>(null)

  // Actions menu
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [menuItem, setMenuItem] = useState<ServiceRequest | null>(null)

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchInput.trim()
      const current = searchParams.get('search') || ''
      if (trimmed !== current) {
        const next = new URLSearchParams(searchParams)
        if (trimmed) next.set('search', trimmed)
        else next.delete('search')
        next.delete('page')
        setSearchParams(next, { replace: true })
      }
    }, 400)
    return () => clearTimeout(handler)
  }, [searchInput])

  const skip = (page - 1) * limit

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['service-requests', querySearch, querySearchField, queryStatus, queryStatusGroup, queryPriority, queryDateFrom, queryDateTo, skip, limit],
    queryFn: () =>
      fetchServiceRequests({
        search: querySearch || undefined,
        search_field: querySearchField === 'all' ? undefined : querySearchField,
        status: queryStatus || undefined,
        status_group: (queryStatusGroup || undefined) as 'new_open' | 'active' | 'completed' | undefined,
        priority: queryPriority || undefined,
        date_from: queryDateFrom || undefined,
        date_to: queryDateTo || undefined,
        skip,
        limit,
      }),
    enabled: !invalidDateRange,
    placeholderData: previousData => previousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteServiceRequest(id),
    onSuccess: () => {
      toast.success('Service request deleted')
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete')
      setDeleteTarget(null)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)
  // A page that no longer exists (the last request on it was deleted, or an
  // old link) shows the last page there is.
  useEffect(() => {
    if (isFetching || !data) return
    const lastPage = Math.max(1, totalPages)
    if (page > lastPage) setPage(lastPage)
  }, [isFetching, data, totalPages, page])

  const statsValues: Record<string, number> = {
    total: data?.stats?.total ?? total,
    new: data?.stats?.new ?? items.filter((request) => ['new', 'assigned'].includes(request.status)).length,
    in_progress: data?.stats?.in_progress ?? items.filter((request) => WORKFLOW_OPEN_STATUSES.includes(request.status)).length,
    completed: data?.stats?.completed ?? items.filter((request) => request.status === 'completed').length,
  }

  const activeCardKey = queryStatus
    ? null
    : queryStatusGroup === 'new_open'
      ? 'new'
      : queryStatusGroup === 'active'
        ? 'in_progress'
        : queryStatusGroup === 'completed'
          ? 'completed'
          : 'total'

  const handleFilterChange = (key: string) => (e: SelectChangeEvent<string> | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = new URLSearchParams(searchParams)
    if (e.target.value) next.set(key, e.target.value)
    else next.delete(key)
    if (key === 'status') next.delete('status_group')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const handleCardClick = (cardKey: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    if (cardKey === 'new') next.set('status_group', 'new_open')
    else if (cardKey === 'in_progress') next.set('status_group', 'active')
    else if (cardKey === 'completed') next.set('status_group', 'completed')
    else next.delete('status_group')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  const handleClearSearch = () => {
    setSearchInput('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const handleSearchFieldChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('search_field')
    else next.set('search_field', value)
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const handleActionsOpen = (e: React.MouseEvent<HTMLElement>, sr: ServiceRequest) => {
    setAnchorEl(e.currentTarget)
    setMenuItem(sr)
  }

  const handleActionsClose = () => {
    setAnchorEl(null)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const filtersActive = Boolean(querySearch || querySearchField !== 'all' || queryStatus || queryStatusGroup || queryPriority || queryDateFrom || queryDateTo)
  const listTitle = queryStatus
    ? (STATUS_LABELS[queryStatus] || queryStatus)
    : (STAT_TILES.find(tile => tile.value === activeCardKey && tile.value !== 'total')?.label || 'All requests')
  const openRequest = (sr: ServiceRequest) => navigate(`/service-requests/${sr.id}`)
  const actionsButton = (sr: ServiceRequest) => (
    <IconButton
      size="small"
      aria-label={`Actions for ${sr.request_number}`}
      onClick={(event) => { event.stopPropagation(); handleActionsOpen(event, sr) }}
      sx={rowIconButtonSx}
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  )
  const assetLine = (sr: ServiceRequest) => [sr.equipment_asset_tag, sr.equipment_serial_number].filter(Boolean).join(' · ') || '—'
  const headCell = listHeadCellSx

  const renderList = () => {
    if (isLoading) return <ListSkeleton />
    if (!items.length) {
      return (
        <EmptyState
          title={filtersActive ? 'No requests match.' : 'No service requests yet.'}
          detail={filtersActive ? 'Try other words, or clear the filters.' : 'Create the first request to start the list.'}
          action={filtersActive
            ? <EmptyStateButton icon={<FilterAltOffOutlinedIcon />} onClick={clearFilters}>Clear filters</EmptyStateButton>
            : canCreateServiceRequests ? <EmptyStateButton primary icon={<AddIcon />} onClick={() => setCreateOpen(true)}>New request</EmptyStateButton> : null}
        />
      )
    }
    if (compact) {
      return (
        <RecordCardList ariaLabel="Service requests">
          {items.map(sr => (
            <RecordCard
              key={sr.id}
              recordKey={`service-request-${sr.id}`}
              label={sr.request_number}
              onOpen={() => openRequest(sr)}
              title={(
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <ClippedTooltipText value={sr.request_number} monospace color="#5B21B6" fontWeight={900} />
                  <RequestStatusChip status={sr.status} />
                </Box>
              )}
              lines={[
                <ClippedTooltipText key="equipment" value={sr.equipment_name} fallback="—" fontWeight={800} color="#1E1B4B" />,
                <ClippedTooltipText key="asset" value={assetLine(sr)} variant="caption" color="#6B7280" fontWeight={600} monospace />,
                <ClippedTooltipText key="facility" value={sr.facility_name} fallback="—" variant="caption" color="#475467" fontWeight={700} />,
                <Box key="meta" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
                  <PriorityChip priority={sr.priority} />
                  <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 700, color: sr.technician_name ? '#475467' : '#9CA3AF', minWidth: 0 }}>
                    {sr.technician_name || 'Unassigned'}
                  </Typography>
                </Box>,
                <Typography key="created" sx={{ fontSize: 12, fontWeight: 700, color: '#8B95A7' }}>Created {formatDate(sr.created_at)}</Typography>,
              ]}
              actions={actionsButton(sr)}
            />
          ))}
        </RecordCardList>
      )
    }
    return (
      <TableContainer className="list-scroll-panel" sx={{ overflowX: 'hidden' }}>
        <Table stickyHeader aria-label="Service requests" sx={listTableSx}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headCell, width: 136 }}>Request #</TableCell>
              <TableCell sx={{ ...headCell, width: '14%' }}>Facility</TableCell>
              <TableCell sx={headCell}>Equipment</TableCell>
              <TableCell sx={{ ...headCell, width: '13%', ...hideBelow('xl') }}>Description</TableCell>
              <TableCell sx={{ ...headCell, width: 112 }}>Priority</TableCell>
              <TableCell sx={{ ...headCell, width: '14%' }}>Status</TableCell>
              <TableCell sx={{ ...headCell, width: '11%', ...hideBelow('lg') }}>Technician</TableCell>
              <TableCell sx={{ ...headCell, width: '10%', ...hideBelow('lg') }}>Created</TableCell>
              <TableCell align="right" sx={{ ...headCell, width: 72 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(sr => (
              <ContextTableRow
                key={sr.id}
                recordKey={`service-request-${sr.id}`}
                recordLabel={sr.request_number}
                hover
                onClick={() => openRequest(sr)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell><ClippedTooltipText value={sr.request_number} monospace color="#5B21B6" fontWeight={900} /></TableCell>
                <TableCell><ClippedTooltipText value={sr.facility_name} fallback="—" fontWeight={700} /></TableCell>
                <TableCell>
                  <ClippedTooltipText value={sr.equipment_name} fallback="—" fontWeight={800} color="#1E1B4B" />
                  <ClippedTooltipText value={assetLine(sr)} variant="caption" color="#6B7280" fontWeight={600} monospace />
                </TableCell>
                <TableCell sx={hideBelow('xl')}><ClippedTooltipText value={sr.equipment_description} fallback="—" fontWeight={500} color="#475569" /></TableCell>
                <TableCell sx={{ overflow: 'hidden' }}><PriorityChip priority={sr.priority} /></TableCell>
                <TableCell sx={{ overflow: 'hidden' }}><RequestStatusChip status={sr.status} /></TableCell>
                <TableCell sx={hideBelow('lg')}>
                  <ClippedTooltipText value={sr.technician_name || 'Unassigned'} fontWeight={700} color={sr.technician_name ? '#1E1B4B' : '#9CA3AF'} />
                </TableCell>
                <TableCell sx={hideBelow('lg')}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#344054', whiteSpace: 'nowrap' }}>{formatDate(sr.created_at)}</Typography>
                  {sr.requester_name && <ClippedTooltipText value={`by ${sr.requester_name}`} variant="caption" color="#8B95A7" fontWeight={600} />}
                </TableCell>
                <TableCell align="right">{actionsButton(sr)}</TableCell>
              </ContextTableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
      <PageHeader
        title="Service requests"
        subtitle="Requests for service on facility equipment, from new to completed."
        icon={<BuildIcon />}
        actions={canCreateServiceRequests
          ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} sx={primaryActionSx}>New request</Button>
          : undefined}
      />

      <StatTiles
        ariaLabel="Request status"
        tiles={STAT_TILES.map(tile => ({ ...tile, count: statsValues[tile.value] ?? 0 }))}
        selected={activeCardKey || ''}
        onSelect={handleCardClick}
        loading={isLoading}
      />

      <FilterCard ariaLabel="Find service requests">
        <Box sx={{
          display: 'grid', gap: 1.5, alignItems: 'start',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '170px minmax(0, 1fr)',
            md: '170px minmax(0, 1fr) 200px 150px',
            xl: '170px minmax(0, 1fr) 200px 140px auto',
          },
        }}>
          <SearchFieldSelect
            value={querySearchField}
            options={SERVICE_SEARCH_FIELDS}
            onChange={handleSearchFieldChange}
            ariaLabel="Service request search field"
            sx={{ minWidth: 0 }}
          />
          <TextField
            label="Search service requests"
            size="small"
            fullWidth
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${SERVICE_SEARCH_FIELDS.find((field) => field.value === querySearchField)?.label.toLowerCase() || 'service requests'}...`}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.15rem' }} /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear the search" onClick={handleClearSearch} edge="end"><ClearIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
          <TextField select size="small" fullWidth label="Status" value={queryStatus} onChange={handleFilterChange('status') as any}
            InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">All statuses</MenuItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField select size="small" fullWidth label="Priority" value={queryPriority} onChange={handleFilterChange('priority') as any}
            InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">All priorities</MenuItem>
            {Object.entries(PRIORITY_STYLE).map(([value, style]) => <MenuItem key={value} value={value}>{style.label}</MenuItem>)}
          </TextField>
          <Box sx={{
            display: 'grid', gap: 1.5, alignItems: 'start',
            gridColumn: { sm: '1 / -1', xl: 'auto' },
            gridTemplateColumns: { xs: '1fr 1fr', sm: '170px 170px auto', xl: '160px 160px auto' },
          }}>
          <TextField
            size="small"
            fullWidth
            label="From"
            type="date"
            value={queryDateFrom}
            onChange={handleFilterChange('date_from')}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: queryDateTo || undefined }}
            error={invalidDateRange}
          />
          <TextField
            size="small"
            fullWidth
            label="To"
            type="date"
            value={queryDateTo}
            onChange={handleFilterChange('date_to')}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: queryDateFrom || undefined }}
            error={invalidDateRange}
            helperText={invalidDateRange ? 'To must be on or after From' : undefined}
          />
          <Button startIcon={<FilterAltOffOutlinedIcon />} onClick={clearFilters} disabled={!filtersActive}
            sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px', minHeight: 40, justifySelf: { xs: 'start', sm: 'end' }, whiteSpace: 'nowrap', gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
            Clear filters
          </Button>
          </Box>
        </Box>
      </FilterCard>

      <ListCard
        ariaLabel="Service request list"
        title={listTitle}
        count={total}
        loading={isLoading}
        busy={isFetching}
        footer={<ListPagination page={page} pageSize={limit} total={total} onChange={setPage} />}
      >
        {renderList()}
      </ListCard>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleActionsClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          elevation: 0,
          sx: {
            borderRadius: '14px',
            overflow: 'visible',
            filter: 'drop-shadow(0 4px 24px rgba(124,58,237,0.15))',
            border: '1px solid rgba(124,58,237,0.08)',
            mt: 1, minWidth: 180,
            '&::before': {
              content: '""', display: 'block', position: 'absolute',
              top: 0, right: 14, width: 12, height: 12,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)', zIndex: 0,
              borderLeft: '1px solid rgba(124,58,237,0.08)',
              borderTop: '1px solid rgba(124,58,237,0.08)',
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            if (menuItem) navigate(`/service-requests/${menuItem.id}`)
            handleActionsClose()
          }}
          sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}
        >
          <ListItemIcon><VisibilityOutlinedIcon sx={{ color: '#7C3AED', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="View Details" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        {canDeleteServiceRequests && (
          <>
            <Box sx={{ mx: 2, my: 0.5 }}>
              <Box sx={{ borderTop: '1px solid rgba(124,58,237,0.08)' }} />
            </Box>

            <MenuItem
              onClick={() => {
                if (menuItem) setDeleteTarget(menuItem)
                handleActionsClose()
              }}
              sx={{
                py: 1.2, px: 2, mx: 0.75, borderRadius: '10px',
                '&:hover': { backgroundColor: '#FEF2F2' },
              }}
            >
              <ListItemIcon><DeleteOutlineIcon sx={{ color: '#EF4444', fontSize: '1.2rem' }} /></ListItemIcon>
              <ListItemText primary="Delete" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#EF4444' }} />
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Create Modal */}
      <CreateServiceRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Delete this service request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.request_number}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending} sx={{ fontWeight: 800, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            sx={{ fontWeight: 900, textTransform: 'none', borderRadius: '12px' }}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ServiceRequestList
