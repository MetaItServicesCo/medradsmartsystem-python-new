import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Chip, Avatar,
  InputBase, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Skeleton, Menu, MenuItem,
  ListItemIcon, ListItemText, Pagination, Divider, RadioGroup, FormControlLabel, Radio,
  CircularProgress
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import BusinessIcon from '@mui/icons-material/Business'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import InventoryIcon from '@mui/icons-material/Inventory'
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import DomainOutlinedIcon from '@mui/icons-material/DomainOutlined'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined'
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined'
import { toast } from 'react-toastify'

import {
  fetchFacilities,
  deleteFacility,
  exportFacilitiesCsv,
  exportScopedFacility,
  type Facility,
  type FacilityScopedExportFormat,
  type FacilityScopedExportScope,
} from '@/api/facilities'
import { exportEquipmentCsv } from '@/api/equipment'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/config/permissions'
import FacilityFormModal from './FacilityFormModal'
import FacilityTierModal from './FacilityTierModal'
import FacilityViewModal from './FacilityViewModal'
import FacilityInventoryModal from './FacilityInventoryModal'
import ModalitiesModal from './ModalitiesModal'
import DepartmentsModal from './DepartmentsModal'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import { facilityTimezoneLabel, formatUSPhone } from '@/utils/formatters'

const STAT_CARDS = [
  {
    label: 'Total Facilities',
    key: 'total',
    icon: <BusinessIcon />,
    accent: '#A78BFA',
    caption: 'All records in scope',
    bg: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
  },
  {
    label: 'Active',
    key: 'active',
    icon: <CheckCircleOutlineIcon />,
    accent: '#93C5FD',
    caption: 'Available facilities',
    bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
  },
  {
    label: 'Countries',
    key: 'countries',
    icon: <PublicOutlinedIcon />,
    accent: '#6EE7B7',
    caption: 'Visible on this page',
    bg: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
  },
  {
    label: 'With Tiers',
    key: 'tiered',
    icon: <LayersOutlinedIcon />,
    accent: '#F0ABFC',
    caption: 'Visible tiered records',
    bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
  },
]

const FACILITY_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'id', label: 'Facility ID' },
  { value: 'facility', label: 'Facility name' },
  { value: 'location', label: 'Location' },
  { value: 'contact', label: 'Contact' },
  { value: 'timezone', label: 'Timezone / hours' },
  { value: 'manager', label: 'Manager / admin' },
  { value: 'tier', label: 'Tier' },
  { value: 'status', label: 'Status' },
]

type FacilityExportOption = {
  scope: FacilityScopedExportScope
  label: string
  description: string
  availability: 'always' | 'parent' | 'child'
}

const FACILITY_EXPORT_OPTIONS: FacilityExportOption[] = [
  {
    scope: 'facility_info',
    label: 'Facility info only',
    description: 'Download this facility profile, contacts, billing settings, tiers, and parent/child summary.',
    availability: 'always',
  },
  {
    scope: 'facility_inventory',
    label: 'Facility inventory only',
    description: 'Download only this facility inventory/assets.',
    availability: 'always',
  },
  {
    scope: 'facility_with_inventory',
    label: 'Facility info + inventory',
    description: 'Download this facility profile together with its inventory/assets.',
    availability: 'always',
  },
  {
    scope: 'children',
    label: 'Child facilities only',
    description: 'Download child facility profiles under this parent facility.',
    availability: 'parent',
  },
  {
    scope: 'children_with_inventory',
    label: 'Child facilities + inventory',
    description: 'Download child facility profiles and their inventory/assets.',
    availability: 'parent',
  },
  {
    scope: 'family',
    label: 'Parent + child facility group',
    description: 'Download this facility and its child facilities as a group.',
    availability: 'parent',
  },
  {
    scope: 'family_with_inventory',
    label: 'Parent + child group + inventory',
    description: 'Download this facility, child facilities, and all included inventory/assets.',
    availability: 'parent',
  },
  {
    scope: 'parent',
    label: 'Parent facility only',
    description: 'Download the parent facility profile for this child facility.',
    availability: 'child',
  },
  {
    scope: 'parent_with_inventory',
    label: 'Parent facility + inventory',
    description: 'Download the parent facility profile and its inventory/assets.',
    availability: 'child',
  },
  {
    scope: 'family',
    label: 'Parent + child facility group',
    description: 'Download the parent and child facility group when your access allows it.',
    availability: 'child',
  },
  {
    scope: 'family_with_inventory',
    label: 'Parent + child group + inventory',
    description: 'Download the parent and child facility group with inventory when your access allows it.',
    availability: 'child',
  },
]

const FacilityList = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'superadmin'
  const canEditFacilities = hasPermission(user, 'facilities', 'edit')
  const canDeleteFacilities = hasPermission(user, 'facilities', 'delete')
  const canManageUsers = hasPermission(user, 'users', 'index') && hasPermission(user, 'users', 'view')
  const canViewFacilityInventory = hasPermission(user, 'facility-inventory', 'view')
  const canAddFacilityInventory = hasPermission(user, 'facility-inventory', 'add')
  const [searchParams, setSearchParams] = useSearchParams()
  const querySearch = searchParams.get('search') || ''
  const querySearchField = searchParams.get('search_field') || 'all'
  
  const [search, setSearch] = useState(querySearch)
  const [searchInput, setSearchInput] = useState(querySearch)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [editFacility, setEditFacility] = useState<Facility | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null)
  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [tierFacility, setTierFacility] = useState<Facility | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFacility, setExportFacility] = useState<Facility | null>(null)
  const [exportScope, setExportScope] = useState<FacilityScopedExportScope>('facility_info')
  const [exportFormat, setExportFormat] = useState<FacilityScopedExportFormat>('pdf')
  const [exporting, setExporting] = useState(false)

  // Sync state from URL
  useEffect(() => {
    const currentSearch = searchParams.get('search') || ''
    setSearch(currentSearch)
    setSearchInput(currentSearch)
    setPage(1)
  }, [searchParams.get('search')])

  // Sync URL from local input (Debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchInput.trim()
      const currentParam = searchParams.get('search') || ''
      
      if (trimmed !== currentParam) {
        if (trimmed) {
          const next = new URLSearchParams(searchParams)
          next.set('search', trimmed)
          setSearchParams(next, { replace: true })
        } else {
          const next = new URLSearchParams(searchParams)
          next.delete('search')
          setSearchParams(next, { replace: true })
        }
      }
    }, 400)
    return () => clearTimeout(handler)
  }, [searchInput, setSearchParams, searchParams])

  // New Modals State
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [invModalOpen, setInvModalOpen] = useState(false)
  const [invModalMode, setInvModalMode] = useState<'view' | 'add'>('view')
  const [modalitiesModalOpen, setModalitiesModalOpen] = useState(false)
  const [deptsModalOpen, setDeptsModalOpen] = useState(false)

  // Main Dropdown State
  const [mainMenuAnchor, setMainMenuAnchor] = useState<null | HTMLElement>(null)

  // Actions menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [menuFacility, setMenuFacility] = useState<Facility | null>(null)

  const skip = (page - 1) * limit

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['facilities', search, querySearchField, skip, limit],
    queryFn: () => fetchFacilities({
      search,
      search_field: querySearchField === 'all' ? undefined : querySearchField,
      skip,
      limit,
    }),
    placeholderData: previousData => previousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFacility(id),
    onSuccess: () => {
      toast.success('Facility deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Unable to delete facility')
      setDeleteTarget(null)
    },
  })

  const facilities = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // Compute stats
  const countries = new Set(facilities.map((f) => f.country)).size
  const tiered = facilities.filter((f) => f.tier_id || (f.tier_ids && f.tier_ids.length > 0)).length

  const statsValues: Record<string, number | string> = {
    total,
    active: total,
    countries,
    tiered,
  }

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const avatarColors = ['#7C3AED', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444']
  const getAvatarColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]
  const getVisibleChildCount = (facilityId: number) => facilities.filter((f) => f.parent_facility_id === facilityId).length

  const softCellSx = {
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
    borderRadius: '14px',
    px: 1.5,
    py: 1,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
    minWidth: 0,
  }

  const hierarchyChipSx = {
    height: 22,
    borderRadius: '999px',
    fontSize: '0.65rem',
    fontWeight: 800,
    letterSpacing: '0.02em',
    '& .MuiChip-icon': { fontSize: '0.9rem' },
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (searchInput.trim()) {
      next.set('search', searchInput.trim())
    } else {
      next.delete('search')
    }
    setSearchParams(next)
    setSearch(searchInput.trim())
    setPage(1)
  }

  const handleSearchFieldChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('search_field')
    else next.set('search_field', value)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const handleEdit = (f: Facility) => {
    setEditFacility(f)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setEditFacility(null)
  }

  // Actions menu handlers
  const handleActionsOpen = (event: React.MouseEvent<HTMLElement>, facility: Facility) => {
    setAnchorEl(event.currentTarget)
    setMenuFacility(facility)
  }

  const handleActionsClose = () => {
    setAnchorEl(null)
  }

  const handleActionFacilityTier = () => {
    if (menuFacility) {
      setTierFacility(menuFacility)
      setTierModalOpen(true)
    }
    handleActionsClose()
  }

  const handleActionEdit = () => {
    if (menuFacility) {
      handleEdit(menuFacility)
    }
    handleActionsClose()
  }

  const handleActionDelete = () => {
    if (menuFacility) {
      setDeleteTarget(menuFacility)
    }
    handleActionsClose()
  }

  const handleActionView = () => {
    if (menuFacility) setViewModalOpen(true)
    handleActionsClose()
  }

  const openFacilityView = (facility: Facility) => {
    setMenuFacility(facility)
    setViewModalOpen(true)
  }

  const openFacilityUsers = (facility: Facility) => {
    setViewModalOpen(false)
    handleActionsClose()
    navigate(`/users?facility_id=${facility.id}`)
  }

  const editFacilityFromView = (facility: Facility) => {
    setViewModalOpen(false)
    handleEdit(facility)
  }

  const handleActionExport = () => {
    if (menuFacility) {
      setExportFacility(menuFacility)
      setExportScope('facility_info')
      setExportFormat('pdf')
      setExportDialogOpen(true)
    }
    handleActionsClose()
  }

  const handleActionInventory = (mode: 'view' | 'add') => {
    if (menuFacility) {
      setInvModalMode(mode)
      setInvModalOpen(true)
    }
    handleActionsClose()
  }

  const handleActionDuplicate = () => {
    if (menuFacility) {
      setEditFacility({ ...menuFacility, id: 0, name: menuFacility.name + ' (Copy)' })
      setModalOpen(true)
    }
    handleActionsClose()
  }

  const handleDownloadFacilities = async () => {
    try {
      await exportFacilitiesCsv()
      toast.success('Facilities download started')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Unable to download facilities')
    } finally {
      setMainMenuAnchor(null)
    }
  }

  const handleDownloadInventory = async () => {
    try {
      await exportEquipmentCsv()
      toast.success('Inventory download started')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Unable to download inventory')
    } finally {
      setMainMenuAnchor(null)
    }
  }

  const availableExportOptions = (facility: Facility | null) => {
    if (!facility) return []
    const isChild = Boolean(facility.parent_facility_id)
    return FACILITY_EXPORT_OPTIONS.filter(option => (
      option.availability === 'always'
      || (option.availability === 'child' && isChild)
      || (option.availability === 'parent' && !isChild)
    ))
  }

  const handleScopedExport = async () => {
    if (!exportFacility) return
    setExporting(true)
    try {
      await exportScopedFacility(
        exportFacility.id,
        exportScope,
        exportFormat,
        `${exportFacility.name.replace(/\s+/g, '_')}_${exportScope}.${exportFormat}`,
      )
      toast.success('Export download started')
      setExportDialogOpen(false)
      setExportFacility(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Unable to export facility data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Box className="page-enter">
      {/* Stat Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2.25, mb: 3 }}>
        {STAT_CARDS.map((card) => (
          <Card
            key={card.key}
            sx={{
              p: 2.5,
              background: card.bg,
              color: '#fff',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '26px',
              minHeight: 126,
              boxShadow: '0 20px 50px rgba(30,27,75,0.14)',
              border: '1px solid rgba(255,255,255,0.16)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: '0 26px 60px rgba(30,27,75,0.2)',
              },
            }}
          >
            <Box sx={{
              position: 'absolute', right: -28, top: -26, width: 132, height: 132,
              borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
              opacity: 1,
              '& svg': { position: 'absolute', right: 28, top: 28, fontSize: '4.8rem', opacity: 0.24 },
            }}>
              {card.icon}
            </Box>
            <Box sx={{
              width: 36, height: 36, borderRadius: '13px',
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mb: 1.1,
              '& svg': { fontSize: '1.2rem', color: '#fff' },
            }}>
              {card.icon}
            </Box>
            <Typography sx={{ position: 'relative', zIndex: 1, fontSize: '0.8rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.35 }}>
              {card.label}
            </Typography>
            <Typography sx={{ position: 'relative', zIndex: 1, fontSize: '0.72rem', fontWeight: 700, color: card.accent, mb: 0.7 }}>
              {card.caption}
            </Typography>
            <Typography variant="h4" sx={{ position: 'relative', zIndex: 1, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em' }}>
              {isLoading ? '—' : statsValues[card.key]}
            </Typography>
          </Card>
        ))}
      </Box>

      {/* Main table card */}
      <Card sx={{ overflow: 'hidden' }}>
        {/* Toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5, borderBottom: '1px solid rgba(124,58,237,0.08)', flexWrap: 'wrap' }}>
          <SearchFieldSelect
            value={querySearchField}
            options={FACILITY_SEARCH_FIELDS}
            onChange={handleSearchFieldChange}
            ariaLabel="Facility search field"
          />
          <Box component="form" onSubmit={handleSearch} sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            backgroundColor: '#F5F3FF', borderRadius: '12px', px: 2, py: 1,
            flex: 1, maxWidth: 340, border: '1px solid rgba(124,58,237,0.12)',
            '&:focus-within': { border: '1px solid #8B5CF6', backgroundColor: '#fff' },
            transition: 'all 0.2s',
          }}>
            <IconButton type="submit" size="small" sx={{ p: '2px' }}>
              <SearchIcon sx={{ color: '#9CA3AF', fontSize: '1.2rem' }} />
            </IconButton>
            <InputBase
              placeholder={`Search ${FACILITY_SEARCH_FIELDS.find((field) => field.value === querySearchField)?.label.toLowerCase() || 'facilities'}...`}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ fontSize: '0.875rem', color: '#374151', flex: 1 }}
            />
            {searchInput && (
              <IconButton size="small" onClick={() => {
                setSearchInput('')
                const next = new URLSearchParams(searchParams)
                next.delete('search')
                setSearchParams(next, { replace: true })
              }} sx={{ p: '2px' }}>
                <ClearIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
              </IconButton>
            )}
          </Box>

          <Chip
            icon={<BusinessIcon />}
            label={`${facilities.length} shown of ${total}`}
            size="small"
            sx={{
              height: 38,
              borderRadius: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid rgba(148,163,184,0.22)',
              color: '#475569',
              fontWeight: 800,
              '& .MuiChip-icon': { color: '#7C3AED' },
            }}
          />
          {isFetching && !isLoading && (
            <CircularProgress size={18} thickness={5} sx={{ color: '#7C3AED' }} />
          )}

          <Box sx={{ flex: 1 }} />

          <Button
            variant="contained"
            endIcon={<ArrowDropDownIcon />}
            onClick={(e) => setMainMenuAnchor(e.currentTarget)}
            sx={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
              boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
              '&:hover': { 
                background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)', 
                boxShadow: '0 12px 32px rgba(124,58,237,0.35)',
                transform: 'translateY(-1px)'
              },
              px: 4,
              borderRadius: '12px',
              fontWeight: 800,
              textTransform: 'none',
            }}
          >
            Facility Management
          </Button>
          
          <Menu
            anchorEl={mainMenuAnchor}
            open={Boolean(mainMenuAnchor)}
            onClose={() => setMainMenuAnchor(null)}
            PaperProps={{
              sx: {
                mt: 1, minWidth: 220, borderRadius: '14px',
                boxShadow: '0 8px 32px rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.08)'
              }
            }}
          >
            <MenuItem onClick={() => { setMainMenuAnchor(null); setEditFacility(null); setModalOpen(true) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><AddIcon sx={{ color: '#7C3AED' }} /></ListItemIcon>
              <ListItemText primary="Add Facility" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
            <Divider sx={{ mx: 2, my: 0.5 }} />
            <MenuItem onClick={() => { setMainMenuAnchor(null); setModalitiesModalOpen(true) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><CategoryOutlinedIcon sx={{ color: '#10B981' }} /></ListItemIcon>
              <ListItemText primary="Modalities" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
            <MenuItem onClick={() => { setMainMenuAnchor(null); setDeptsModalOpen(true) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><DomainOutlinedIcon sx={{ color: '#F59E0B' }} /></ListItemIcon>
              <ListItemText primary="Departments" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
            {isSuperAdmin && (
              <>
                <Divider sx={{ mx: 2, my: 0.5 }} />
                <MenuItem onClick={handleDownloadFacilities} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
                  <ListItemIcon><DownloadOutlinedIcon sx={{ color: '#2563EB' }} /></ListItemIcon>
                  <ListItemText primary="Download Facilities" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
                </MenuItem>
                <MenuItem onClick={handleDownloadInventory} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
                  <ListItemIcon><DownloadOutlinedIcon sx={{ color: '#059669' }} /></ListItemIcon>
                  <ListItemText primary="Download Inventory" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
                </MenuItem>
              </>
            )}
          </Menu>
        </Box>

        {/* Table */}
        <TableContainer className="list-scroll-panel" sx={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%)' }}>
          <Table stickyHeader sx={{
            minWidth: 1180,
            borderCollapse: 'separate',
            borderSpacing: '0 10px',
            px: 2,
            '& .MuiTableHead-root .MuiTableCell-root': {
              backgroundColor: '#F8FAFC',
              color: '#64748B',
              fontWeight: 900,
              fontSize: '0.74rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              borderBottom: '1px solid rgba(148,163,184,0.18)',
              py: 1.5,
            },
            '& .MuiTableBody-root .MuiTableCell-root': {
              borderBottom: '1px solid rgba(226,232,240,0.72)',
              py: 1.5,
            },
          }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 290 }}>Facility</TableCell>
                <TableCell sx={{ width: 220 }}>Location</TableCell>
                <TableCell sx={{ width: 250 }}>Contact</TableCell>
                <TableCell sx={{ width: 150 }}>Timezone</TableCell>
                <TableCell sx={{ width: 150 }}>Users</TableCell>
                <TableCell sx={{ width: 190 }}>Hours</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
                : facilities.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Box sx={{ textAlign: 'center', opacity: 0.8 }}>
                          <BusinessIcon sx={{ fontSize: '3.5rem', color: '#DDD6FE', mb: 2 }} />
                          <Typography variant="h6" sx={{ fontWeight: 700, color: '#1E1B4B', mb: 0.5 }}>
                            {search ? 'No matches found' : 'No facilities yet'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#6B7280', mb: 3, maxWidth: 300, mx: 'auto' }}>
                            {search 
                              ? `We couldn't find any results for "${search}". Try checking your spelling or use different keywords.` 
                              : "It looks like you haven't added any facilities yet. Get started by creating your first one."
                            }
                          </Typography>
                          {search ? (
                            <Button
                              variant="outlined"
                              onClick={() => { setSearchInput(''); setSearchParams({}, { replace: true }) }}
                              sx={{ px: 4, borderRadius: '10px', borderColor: '#7C3AED', color: '#7C3AED' }}
                            >
                              Clear Search
                            </Button>
                          ) : (
                            <Button
                              variant="contained"
                              onClick={() => { setEditFacility(null); setModalOpen(true) }}
                              sx={{ px: 4, borderRadius: '10px', backgroundColor: '#7C3AED' }}
                            >
                              Add Your First Facility
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : facilities.map((facility) => {
                    const visibleChildCount = getVisibleChildCount(facility.id)
                    const isChild = Boolean(facility.parent_facility_id)
                    return (
                    <TableRow
                      key={facility.id}
                      sx={{
                        '&:hover': {
                          backgroundColor: '#FAFAFF',
                          '& .facility-row-avatar': {
                            transform: 'scale(1.04)',
                            boxShadow: '0 10px 24px rgba(124,58,237,0.22)',
                          },
                          '& .facility-soft-cell': {
                            borderColor: 'rgba(124,58,237,0.24)',
                            boxShadow: '0 10px 28px rgba(124,58,237,0.08)',
                          },
                        },
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            className="facility-row-avatar"
                            sx={{
                              width: 46, height: 46, borderRadius: '16px',
                              background: `linear-gradient(135deg, ${getAvatarColor(facility.name)} 0%, #4C1D95 100%)`,
                              fontSize: '0.86rem', fontWeight: 900,
                              border: '3px solid #fff',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {getInitials(facility.name)}
                          </Avatar>
                          <Box sx={{ minWidth: 0, maxWidth: 230 }}>
                            <ClippedTooltipText value={facility.name} fontWeight={800} onClick={() => openFacilityView(facility)} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.65, flexWrap: 'wrap' }}>
                              <Chip
                                label={`#${facility.id}`}
                                size="small"
                                onClick={() => openFacilityView(facility)}
                                sx={{ ...hierarchyChipSx, backgroundColor: '#F1F5F9', color: '#64748B' }}
                              />
                              {isChild && (
                                <Chip
                                  icon={<AccountTreeOutlinedIcon />}
                                  label="Child"
                                  size="small"
                                  sx={{ ...hierarchyChipSx, backgroundColor: '#EFF6FF', color: '#2563EB' }}
                                />
                              )}
                              {!isChild && visibleChildCount > 0 && (
                                <Chip
                                  icon={<AccountTreeOutlinedIcon />}
                                  label={`${visibleChildCount} child${visibleChildCount > 1 ? 'ren' : ''}`}
                                  size="small"
                                  sx={{ ...hierarchyChipSx, backgroundColor: '#ECFDF5', color: '#059669' }}
                                />
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box className="facility-soft-cell" sx={softCellSx}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <LocationOnOutlinedIcon sx={{ color: '#7C3AED', fontSize: '1rem', flexShrink: 0 }} />
                            <ClippedTooltipText value={`${facility.city}, ${facility.state}`} fontWeight={700} />
                          </Box>
                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {facility.country} · {facility.zip_code}
                        </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box className="facility-soft-cell" sx={softCellSx}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            <PhoneOutlinedIcon sx={{ color: '#10B981', fontSize: '1rem', flexShrink: 0 }} />
                            <ClippedTooltipText value={formatUSPhone(facility.phone)} fontWeight={700} />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, mt: 0.35 }}>
                            <EmailOutlinedIcon sx={{ color: '#94A3B8', fontSize: '0.95rem', flexShrink: 0 }} />
                            <ClippedTooltipText value={facility.email} variant="caption" color="#64748B" fontWeight={600} />
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={facilityTimezoneLabel(facility.timezone)}
                          size="small"
                          sx={{
                            height: 34,
                            borderRadius: '12px',
                            backgroundColor: '#F5F3FF',
                            color: '#7C3AED',
                            fontWeight: 900,
                            fontSize: '0.75rem',
                            border: '1px solid rgba(124,58,237,0.14)',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', ml: 0.5 }}>
                            {facility.assigned_users?.slice(0, 3).map((u, i) => (
                              <Tooltip key={u.id} title={`${u.full_name} (${u.role})`}>
                                <Avatar
                                  src={u.avatar_url || undefined}
                                  sx={{
                                    width: 24, height: 24, fontSize: '0.65rem',
                                    border: '2px solid #fff',
                                    ml: i === 0 ? 0 : -1,
                                    backgroundColor: getAvatarColor(u.full_name),
                                  }}
                                >
                                  {u.full_name[0]}
                                </Avatar>
                              </Tooltip>
                            ))}
                            {facility.assigned_users && facility.assigned_users.length > 3 && (
                              <Avatar
                                sx={{
                                  width: 24, height: 24, fontSize: '0.65rem',
                                  border: '2px solid #fff',
                                  ml: -1,
                                  backgroundColor: '#F3F4F6',
                                  color: '#6B7280',
                                  fontWeight: 600,
                                }}
                              >
                                +{facility.assigned_users.length - 3}
                              </Avatar>
                            )}
                            {(!facility.assigned_users || facility.assigned_users.length === 0) && (
                              <Chip
                                label="No users"
                                size="small"
                                sx={{ height: 26, borderRadius: '9px', backgroundColor: '#F8FAFC', color: '#94A3B8', fontWeight: 800 }}
                              />
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box className="facility-soft-cell" sx={{ ...softCellSx, maxWidth: 180 }}>
                        <Typography variant="body2" sx={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {facility.operating_hours || '—'}
                        </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Actions">
                          <IconButton
                            size="small"
                            onClick={(e) => handleActionsOpen(e, facility)}
                            sx={{
                              color: '#7C3AED',
                              backgroundColor: '#F5F3FF',
                              borderRadius: '10px',
                              width: 36,
                              height: 36,
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                backgroundColor: '#EDE9FE',
                                transform: 'scale(1.05)',
                              },
                            }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )})}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2.5, borderTop: '1px solid rgba(124,58,237,0.08)' }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              shape="rounded"
              sx={{
                '& .MuiPaginationItem-root': { borderRadius: '8px', fontWeight: 600 },
                '& .Mui-selected': { background: 'linear-gradient(135deg, #7C3AED, #EC4899) !important', color: '#fff' },
              }}
            />
          </Box>
        )}
      </Card>

      {/* Actions Dropdown Menu */}
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
            mt: 1,
            minWidth: 200,
            '&::before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 12,
              height: 12,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
              borderLeft: '1px solid rgba(124,58,237,0.08)',
              borderTop: '1px solid rgba(124,58,237,0.08)',
            },
          },
        }}
      >
        <MenuItem onClick={handleActionView} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><VisibilityOutlinedIcon sx={{ color: '#7C3AED', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="View Facility" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <MenuItem onClick={handleActionExport} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><DownloadOutlinedIcon sx={{ color: '#059669', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Export Facility" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        {canEditFacilities && (
          <MenuItem onClick={handleActionEdit} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
            <ListItemIcon><EditOutlinedIcon sx={{ color: '#6D28D9', fontSize: '1.2rem' }} /></ListItemIcon>
            <ListItemText primary="Edit Facility" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
          </MenuItem>
        )}
        
        <MenuItem onClick={handleActionDuplicate} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><ContentCopyOutlinedIcon sx={{ color: '#3B82F6', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Duplicate" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <MenuItem onClick={handleActionFacilityTier} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><WorkspacePremiumIcon sx={{ color: '#F59E0B', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Facility Tier" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        {canManageUsers && (
          <MenuItem onClick={() => menuFacility && openFacilityUsers(menuFacility)} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
            <ListItemIcon><PeopleOutlinedIcon sx={{ color: '#3B82F6', fontSize: '1.2rem' }} /></ListItemIcon>
            <ListItemText primary="Manage Users" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
          </MenuItem>
        )}

        {(canAddFacilityInventory || canViewFacilityInventory) && (
          <Box sx={{ mx: 2, my: 0.5 }}>
            <Box sx={{ borderTop: '1px solid rgba(124,58,237,0.08)' }} />
          </Box>
        )}

        {canAddFacilityInventory && (
          <MenuItem onClick={() => handleActionInventory('add')} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F0FDF4' } }}>
            <ListItemIcon><AddBoxOutlinedIcon sx={{ color: '#10B981', fontSize: '1.2rem' }} /></ListItemIcon>
            <ListItemText primary="Add Facility Inventory" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
          </MenuItem>
        )}

        {canViewFacilityInventory && (
          <MenuItem onClick={() => handleActionInventory('view')} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F0FDF4' } }}>
            <ListItemIcon><InventoryIcon sx={{ color: '#10B981', fontSize: '1.2rem' }} /></ListItemIcon>
            <ListItemText primary="View Facility Inventory" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
          </MenuItem>
        )}

        {canDeleteFacilities && (
          <>
            <Box sx={{ mx: 2, my: 0.5 }}>
              <Box sx={{ borderTop: '1px solid rgba(124,58,237,0.08)' }} />
            </Box>

            <MenuItem
              onClick={handleActionDelete}
              sx={{
                py: 1.5,
                px: 2.5,
                mx: 0.75,
                borderRadius: '10px',
                transition: 'all 0.15s ease',
                '&:hover': {
                  backgroundColor: '#FEF2F2',
                },
              }}
            >
              <ListItemIcon>
                <DeleteOutlineIcon sx={{ color: '#EF4444', fontSize: '1.2rem' }} />
              </ListItemIcon>
              <ListItemText
                primary="Delete Facility"
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#EF4444',
                }}
              />
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Form Modal */}
      <FacilityFormModal
        open={modalOpen}
        onClose={handleModalClose}
        facility={editFacility}
      />

      {/* Tier Modal */}
      <FacilityTierModal
        open={tierModalOpen}
        onClose={() => { setTierModalOpen(false); setTierFacility(null) }}
        facility={tierFacility}
      />

      {/* Core Modals */}
      <FacilityViewModal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        facility={menuFacility}
        onEdit={canEditFacilities ? editFacilityFromView : undefined}
        onManageUsers={canManageUsers ? openFacilityUsers : undefined}
      />
      <FacilityInventoryModal open={invModalOpen} onClose={() => setInvModalOpen(false)} facility={menuFacility} mode={invModalMode} />
      <ModalitiesModal open={modalitiesModalOpen} onClose={() => setModalitiesModalOpen(false)} />
      <DepartmentsModal open={deptsModalOpen} onClose={() => setDeptsModalOpen(false)} />

      {/* Scoped Export Dialog */}
      <Dialog
        open={exportDialogOpen}
        onClose={() => !exporting && setExportDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}
      >
        <DialogTitle sx={{
          fontWeight: 900,
          color: '#fff',
          background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}>
          <DownloadOutlinedIcon />
          Export Facility Data
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.5 }}>
            {exportFacility?.name || 'Facility'}
          </Typography>
          <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 13, mb: 2.5 }}>
            Choose exactly what you want to download. Parent/child exports still respect facility access permissions.
          </Typography>

          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Export scope</Typography>
          <RadioGroup value={exportScope} onChange={event => setExportScope(event.target.value as FacilityScopedExportScope)}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>
              {availableExportOptions(exportFacility).map(option => (
                <Box
                  key={`${option.scope}-${option.availability}`}
                  onClick={() => setExportScope(option.scope)}
                  sx={{
                    p: 1.5,
                    borderRadius: '14px',
                    border: exportScope === option.scope ? '1px solid #7C3AED' : '1px solid #E5E7EB',
                    bgcolor: exportScope === option.scope ? '#F5F3FF' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { borderColor: '#A78BFA', bgcolor: '#FAF5FF' },
                  }}
                >
                  <FormControlLabel
                    value={option.scope}
                    control={<Radio size="small" />}
                    label={<Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{option.label}</Typography>}
                    sx={{ m: 0, alignItems: 'flex-start' }}
                  />
                  <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700, pl: 3.75 }}>
                    {option.description}
                  </Typography>
                </Box>
              ))}
            </Box>
          </RadioGroup>

          <Divider sx={{ my: 2.5 }} />

          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>File format</Typography>
          <RadioGroup row value={exportFormat} onChange={event => setExportFormat(event.target.value as FacilityScopedExportFormat)}>
            <FormControlLabel value="pdf" control={<Radio />} label="PDF" />
            <FormControlLabel value="csv" control={<Radio />} label="CSV" />
          </RadioGroup>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => setExportDialogOpen(false)} disabled={exporting} sx={{ fontWeight: 900 }}>
            Cancel
          </Button>
          <Button
            startIcon={exporting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <DownloadOutlinedIcon />}
            onClick={handleScopedExport}
            disabled={exporting || !exportFacility}
            variant="contained"
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            Download {exportFormat.toUpperCase()}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>Delete Facility?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            If this facility has linked equipment, deletion will be blocked.
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

export default FacilityList
