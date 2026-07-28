import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Chip, Avatar,
  InputBase, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Skeleton, Menu, MenuItem,
  ListItemIcon, ListItemText, Pagination, Select, FormControl,
  InputLabel, SelectChangeEvent, TextField, CircularProgress,
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
import FilterListIcon from '@mui/icons-material/FilterList'
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

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low:      { bg: '#E0F2FE', color: '#0369A1' },
  medium:   { bg: '#FEF3C7', color: '#B45309' },
  high:     { bg: '#FFE4E6', color: '#BE123C' },
  critical: { bg: '#FEE2E2', color: '#DC2626' },
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#E0E7FF', color: '#4338CA' },
  assigned:    { bg: '#DBEAFE', color: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', color: '#B45309' },
  waiting_on_parts: { bg: '#FFE4E6', color: '#BE123C' },
  waiting_for_approval: { bg: '#E0F2FE', color: '#0369A1' },
  waiting_for_depot_repair: { bg: '#F3E8FF', color: '#7E22CE' },
  waiting_for_vendor_repair: { bg: '#FFEDD5', color: '#C2410C' },
  completed:   { bg: '#D1FAE5', color: '#047857' },
  cancelled:   { bg: '#F3F4F6', color: '#6B7280' },
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
  { value: 'requester', label: 'Requester' },
  { value: 'created', label: 'Created' },
]

const STAT_CARDS = [
  {
    label: 'Total Requests',
    key: 'total',
    icon: <BuildIcon />,
    color: '#6757D8',
    soft: '#F0EDFF',
  },
  {
    label: 'New / Open',
    key: 'new',
    icon: <AssignmentIcon />,
    color: '#3B82F6',
    soft: '#EFF6FF',
  },
  {
    label: 'Active Workflow',
    key: 'in_progress',
    icon: <PendingActionsIcon />,
    color: '#E39B23',
    soft: '#FFF6E7',
  },
  {
    label: 'Completed',
    key: 'completed',
    icon: <CheckCircleOutlineIcon />,
    color: '#13A77B',
    soft: '#EAFBF5',
  },
]

const ServiceRequestList = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore(state => state.user)
  const canCreateServiceRequests = hasPermission(user, 'service-requests', 'add')
  const canDeleteServiceRequests = isInternalServiceAdmin(user)
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
  const [page, setPage] = useState(1)
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
        setSearchParams(next, { replace: true })
        setPage(1)
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
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const handleCardClick = (cardKey: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    if (cardKey === 'new') next.set('status_group', 'new_open')
    else if (cardKey === 'in_progress') next.set('status_group', 'active')
    else if (cardKey === 'completed') next.set('status_group', 'completed')
    else next.delete('status_group')
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearchParams(new URLSearchParams(), { replace: true })
    setPage(1)
  }

  const handleClearSearch = () => {
    setSearchInput('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    setSearchParams(next, { replace: true })
  }

  const handleSearchFieldChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('search_field')
    else next.set('search_field', value)
    setSearchParams(next, { replace: true })
    setPage(1)
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

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      {/* Stat Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2.5, mb: 3 }}>
        {STAT_CARDS.map((card) => (
          <Card
            key={card.key}
            role="button"
            tabIndex={0}
            aria-pressed={activeCardKey === card.key}
            onClick={() => handleCardClick(card.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleCardClick(card.key)
              }
            }}
            sx={{
              p: 2.3,
              minHeight: 150,
              borderRadius: '22px',
              border: activeCardKey === card.key ? `2px solid ${card.color}` : '1px solid #EEF0F6',
              boxShadow: activeCardKey === card.key ? `0 18px 42px ${card.color}24` : '0 18px 40px rgba(49,46,129,0.08)',
              cursor: 'pointer',
              transform: activeCardKey === card.key ? 'translateY(-2px)' : 'none',
              transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
              '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 20px 44px ${card.color}20` },
              '&:focus-visible': { outline: `3px solid ${card.color}35`, outlineOffset: 2 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Avatar sx={{ width: 46, height: 46, bgcolor: card.soft, color: card.color, borderRadius: '16px' }}>
                {card.icon}
              </Avatar>
              <Typography sx={{ color: card.color, fontSize: 12, fontWeight: 900 }}>Live</Typography>
            </Box>
            <Typography
              sx={{
                fontSize: '0.78rem', fontWeight: 900, color: '#6B7280',
                textTransform: 'uppercase', mb: 1,
              }}
            >
              {card.label}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>
              {isLoading ? '—' : statsValues[card.key]}
            </Typography>
          </Card>
        ))}
      </Box>

      {/* Main Card */}
      <Card sx={{ overflow: 'hidden', borderRadius: '24px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 2, p: 2.5,
            borderBottom: '1px solid #E8ECF4', flexWrap: 'wrap',
            backgroundColor: '#fff',
          }}
        >
          <SearchFieldSelect
            value={querySearchField}
            options={SERVICE_SEARCH_FIELDS}
            onChange={handleSearchFieldChange}
            ariaLabel="Service request search field"
          />

          {/* Search */}
          <Box
            component="form"
            onSubmit={(e: React.FormEvent) => e.preventDefault()}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              backgroundColor: '#F8FAFC', borderRadius: '16px', px: 2, py: 1,
              flex: 1, minWidth: 220, maxWidth: 340,
              border: '1px solid #E8ECF4',
              '&:focus-within': { border: '1px solid #7161D8', backgroundColor: '#fff', boxShadow: '0 10px 24px rgba(113,97,216,0.1)' },
              transition: 'all 0.2s',
            }}
          >
            <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
            <InputBase
              placeholder={`Search ${SERVICE_SEARCH_FIELDS.find((field) => field.value === querySearchField)?.label.toLowerCase() || 'service requests'}...`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ fontSize: '0.875rem', color: '#374151', flex: 1 }}
            />
            {searchInput && (
              <IconButton size="small" onClick={handleClearSearch} sx={{ p: '2px' }}>
                <ClearIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
              </IconButton>
            )}
          </Box>

          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ fontSize: '0.85rem' }}>Status</InputLabel>
            <Select
              value={queryStatus}
              label="Status"
              onChange={handleFilterChange('status')}
              sx={{ borderRadius: '16px', fontSize: '0.85rem', bgcolor: '#fff' }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="assigned">Assigned</MenuItem>
              <MenuItem value="in_progress">Service In Progress</MenuItem>
              <MenuItem value="waiting_on_parts">Waiting on Parts</MenuItem>
              <MenuItem value="waiting_for_approval">Waiting for Approval</MenuItem>
              <MenuItem value="waiting_for_depot_repair">Waiting for Depot Repair</MenuItem>
              <MenuItem value="waiting_for_vendor_repair">Waiting for Vendor Repair</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="From"
            type="date"
            value={queryDateFrom}
            onChange={handleFilterChange('date_from')}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: queryDateTo || undefined }}
            error={invalidDateRange}
            sx={{ width: 155, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
          />
          <TextField
            size="small"
            label="To"
            type="date"
            value={queryDateTo}
            onChange={handleFilterChange('date_to')}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: queryDateFrom || undefined }}
            error={invalidDateRange}
            helperText={invalidDateRange ? 'Invalid range' : undefined}
            sx={{ width: 155, '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
          />

          {(querySearch || queryStatus || queryStatusGroup || queryPriority || queryDateFrom || queryDateTo) && (
            <Button onClick={clearFilters} startIcon={<ClearIcon />} sx={{ borderRadius: '14px', fontWeight: 800, textTransform: 'none' }}>
              Clear Filters
            </Button>
          )}

          {/* Priority Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ fontSize: '0.85rem' }}>Priority</InputLabel>
            <Select
              value={queryPriority}
              label="Priority"
              onChange={handleFilterChange('priority')}
              sx={{ borderRadius: '16px', fontSize: '0.85rem', bgcolor: '#fff' }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />
          {isFetching && !isLoading && (
            <CircularProgress size={18} thickness={5} sx={{ color: '#7161D8' }} />
          )}

          {canCreateServiceRequests && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
              sx={{
                background: 'linear-gradient(135deg, #7161D8 0%, #F05D92 100%)',
                boxShadow: '0 12px 28px rgba(113,97,216,0.22)',
                px: 3,
                borderRadius: '16px',
                fontWeight: 800,
                textTransform: 'none',
              }}
            >
              New Request
            </Button>
          )}
        </Box>

        {/* Table */}
        <TableContainer className="list-scroll-panel">
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Request #</TableCell>
                <TableCell>Facility</TableCell>
                <TableCell>Equipment</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Requester</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton variant="text" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                        <Box sx={{ textAlign: 'center', opacity: 0.8 }}>
                          <BuildIcon sx={{ fontSize: '3.5rem', color: '#DDD6FE', mb: 2 }} />
                          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E1B4B', mb: 0.5 }}>
                            {querySearch ? 'No matches found' : 'No service requests yet'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#6B7280', mb: 3, maxWidth: 300, mx: 'auto' }}>
                            {querySearch
                              ? `No results for "${querySearch}". Try different keywords.`
                              : 'Get started by creating your first service request.'}
                          </Typography>
                          {!querySearch && canCreateServiceRequests && (
                            <Button
                              variant="contained"
                              onClick={() => setCreateOpen(true)}
                              sx={{ px: 4, borderRadius: '14px', backgroundColor: '#7161D8' }}
                            >
                              Create First Request
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : items.map((sr) => {
                      const pColor = PRIORITY_COLORS[sr.priority] || PRIORITY_COLORS.low
                      const sColor = STATUS_COLORS[sr.status] || STATUS_COLORS.new
                      return (
                        <ContextTableRow
                          key={sr.id}
                          recordKey={`service-request-${sr.id}`}
                          recordLabel={sr.request_number}
                          sx={{
                            '&:hover': { backgroundColor: '#F8FAFC' },
                            cursor: 'pointer',
                          }}
                          onClick={() => navigate(`/service-requests/${sr.id}`)}
                        >
                          <TableCell>
                            <ClippedTooltipText value={sr.request_number} monospace color="#6757D8" fontWeight={800} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {sr.facility_name || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {sr.equipment_name || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={sr.priority.charAt(0).toUpperCase() + sr.priority.slice(1)}
                              size="small"
                              sx={{
                                backgroundColor: pColor.bg,
                                color: pColor.color,
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={STATUS_LABELS[sr.status] || sr.status}
                              size="small"
                              sx={{
                                backgroundColor: sColor.bg,
                                color: sColor.color,
                                fontWeight: 700,
                                fontSize: '0.7rem',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                sx={{
                                  width: 26, height: 26, fontSize: '0.7rem', fontWeight: 700,
                                  background: 'linear-gradient(135deg, #7161D8, #F05D92)',
                                }}
                              >
                                {sr.requester_name?.[0] || '?'}
                              </Avatar>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {sr.requester_name || '—'}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                              {formatDate(sr.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Actions">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleActionsOpen(e, sr)
                                }}
                                sx={{
                                  color: '#7161D8',
                                  backgroundColor: '#F0EDFF',
                                  borderRadius: '14px',
                                  width: 36, height: 36,
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    backgroundColor: '#E8E2FF',
                                    transform: 'scale(1.05)',
                                  },
                                }}
                              >
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </ContextTableRow>
                      )
                    })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box
            sx={{
              display: 'flex', justifyContent: 'center', p: 2.5,
              borderTop: '1px solid rgba(124,58,237,0.08)',
            }}
          >
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              shape="rounded"
              sx={{
                '& .MuiPaginationItem-root': { borderRadius: '8px', fontWeight: 600 },
                '& .Mui-selected': {
                  background: 'linear-gradient(135deg, #7C3AED, #EC4899) !important',
                  color: '#fff',
                },
              }}
            />
          </Box>
        )}
      </Card>

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
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>Delete Service Request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.request_number}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            variant="outlined"
            sx={{ borderColor: '#E5E7EB', color: '#6B7280' }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            sx={{ boxShadow: '0 4px 12px rgba(239,68,68,0.25)' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ServiceRequestList
