import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Chip, Avatar,
  InputBase, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Skeleton, Menu, MenuItem,
  ListItemIcon, ListItemText, Pagination, Divider
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
import { toast } from 'react-toastify'

import { fetchFacilities, deleteFacility, type Facility } from '@/api/facilities'
import FacilityFormModal from './FacilityFormModal'
import FacilityTierModal from './FacilityTierModal'
import FacilityViewModal from './FacilityViewModal'
import FacilityInventoryModal from './FacilityInventoryModal'
import FacilityUsersModal from './FacilityUsersModal'
import ModalitiesModal from './ModalitiesModal'
import DepartmentsModal from './DepartmentsModal'

const STAT_CARDS = [
  {
    label: 'Total Facilities',
    key: 'total',
    icon: <BusinessIcon />,
    bg: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
  },
  {
    label: 'Active',
    key: 'active',
    icon: <LocationOnOutlinedIcon />,
    bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
  },
  {
    label: 'Countries',
    key: 'countries',
    icon: <PhoneOutlinedIcon />,
    bg: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
  },
  {
    label: 'With Tiers',
    key: 'tiered',
    icon: <EmailOutlinedIcon />,
    bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
  },
]

const FacilityList = () => {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const querySearch = searchParams.get('search') || ''
  
  const [search, setSearch] = useState(querySearch)
  const [searchInput, setSearchInput] = useState(querySearch)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [modalOpen, setModalOpen] = useState(false)
  const [editFacility, setEditFacility] = useState<Facility | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null)
  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [tierFacility, setTierFacility] = useState<Facility | null>(null)

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
          setSearchParams({ search: trimmed }, { replace: true })
        } else {
          setSearchParams({}, { replace: true })
        }
      }
    }, 400)
    return () => clearTimeout(handler)
  }, [searchInput, setSearchParams, searchParams])

  // New Modals State
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [invModalOpen, setInvModalOpen] = useState(false)
  const [invModalMode, setInvModalMode] = useState<'view' | 'add'>('view')
  const [usersModalOpen, setUsersModalOpen] = useState(false)
  const [modalitiesModalOpen, setModalitiesModalOpen] = useState(false)
  const [deptsModalOpen, setDeptsModalOpen] = useState(false)

  // Main Dropdown State
  const [mainMenuAnchor, setMainMenuAnchor] = useState<null | HTMLElement>(null)

  // Actions menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [menuFacility, setMenuFacility] = useState<Facility | null>(null)

  const skip = (page - 1) * limit

  const { data, isLoading } = useQuery({
    queryKey: ['facilities', search, skip, limit],
    queryFn: () => fetchFacilities({ search, skip, limit }),
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
  const tiered = facilities.filter((f) => f.tier_id).length

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      setSearchParams({ search: searchInput.trim() })
    } else {
      setSearchParams({})
    }
    setSearch(searchInput.trim())
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

  return (
    <Box className="page-enter">
      {/* Stat Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
        {STAT_CARDS.map((card) => (
          <Card
            key={card.key}
            sx={{
              p: 2,
              background: card.bg,
              color: '#fff',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box sx={{
              position: 'absolute', right: -10, top: -10, opacity: 0.15,
              '& svg': { fontSize: '5rem' },
            }}>
              {card.icon}
            </Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
              {card.label}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#fff' }}>
              {isLoading ? '—' : statsValues[card.key]}
            </Typography>
          </Card>
        ))}
      </Box>

      {/* Main table card */}
      <Card sx={{ overflow: 'hidden' }}>
        {/* Toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5, borderBottom: '1px solid rgba(124,58,237,0.08)' }}>
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
              placeholder="Search facilities..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ fontSize: '0.875rem', color: '#374151', flex: 1 }}
            />
            {searchInput && (
              <IconButton size="small" onClick={() => { setSearchInput(''); setSearchParams({}, { replace: true }) }} sx={{ p: '2px' }}>
                <ClearIcon sx={{ color: '#9CA3AF', fontSize: '1.1rem' }} />
              </IconButton>
            )}
          </Box>

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
            <MenuItem onClick={() => { setMainMenuAnchor(null); setUsersModalOpen(true); setMenuFacility(null) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><PeopleOutlinedIcon sx={{ color: '#3B82F6' }} /></ListItemIcon>
              <ListItemText primary="Global User Manager" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
            <MenuItem onClick={() => { setMainMenuAnchor(null); setModalitiesModalOpen(true) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><CategoryOutlinedIcon sx={{ color: '#10B981' }} /></ListItemIcon>
              <ListItemText primary="Modalities" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
            <MenuItem onClick={() => { setMainMenuAnchor(null); setDeptsModalOpen(true) }} sx={{ py: 1.5, mx: 1, borderRadius: '8px' }}>
              <ListItemIcon><DomainOutlinedIcon sx={{ color: '#F59E0B' }} /></ListItemIcon>
              <ListItemText primary="Departments" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }} />
            </MenuItem>
          </Menu>
        </Box>

        {/* Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Facility</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Timezone</TableCell>
                <TableCell>Users</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
                : facilities.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
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
                  : facilities.map((facility) => (
                    <TableRow key={facility.id} sx={{ '&:hover': { backgroundColor: '#FAFAFF' } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            sx={{
                              width: 38, height: 38, borderRadius: '10px',
                              background: getAvatarColor(facility.name),
                              fontSize: '0.8rem', fontWeight: 700,
                            }}
                          >
                            {getInitials(facility.name)}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>
                              {facility.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                              ID: #{facility.id}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {facility.city}, {facility.state}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {facility.country} · {facility.zip_code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{facility.phone}</Typography>
                        <Typography variant="caption" color="text.secondary">{facility.email}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={facility.timezone}
                          size="small"
                          sx={{
                            backgroundColor: '#F5F3FF',
                            color: '#7C3AED',
                            fontWeight: 600,
                            fontSize: '0.7rem',
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
                              <Typography variant="caption" sx={{ color: '#D1D5DB' }}>No users</Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                          {facility.operating_hours || '—'}
                        </Typography>
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
                  ))}
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

        <MenuItem onClick={handleActionEdit} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><EditOutlinedIcon sx={{ color: '#6D28D9', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Edit Facility" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>
        
        <MenuItem onClick={handleActionDuplicate} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><ContentCopyOutlinedIcon sx={{ color: '#3B82F6', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Duplicate" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <MenuItem onClick={handleActionFacilityTier} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><WorkspacePremiumIcon sx={{ color: '#F59E0B', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Facility Tier" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <MenuItem onClick={() => { setUsersModalOpen(true); handleActionsClose() }} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F5F3FF' } }}>
          <ListItemIcon><PeopleOutlinedIcon sx={{ color: '#3B82F6', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Manage Users" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <Box sx={{ mx: 2, my: 0.5 }}>
          <Box sx={{ borderTop: '1px solid rgba(124,58,237,0.08)' }} />
        </Box>

        <MenuItem onClick={() => handleActionInventory('add')} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F0FDF4' } }}>
          <ListItemIcon><AddBoxOutlinedIcon sx={{ color: '#10B981', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="Add Inventory" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

        <MenuItem onClick={() => handleActionInventory('view')} sx={{ py: 1.2, px: 2, mx: 0.75, borderRadius: '10px', '&:hover': { backgroundColor: '#F0FDF4' } }}>
          <ListItemIcon><InventoryIcon sx={{ color: '#10B981', fontSize: '1.2rem' }} /></ListItemIcon>
          <ListItemText primary="View Inventory" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600, color: '#1E1B4B' }} />
        </MenuItem>

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
      <FacilityViewModal open={viewModalOpen} onClose={() => setViewModalOpen(false)} facility={menuFacility} />
      <FacilityInventoryModal open={invModalOpen} onClose={() => setInvModalOpen(false)} facility={menuFacility} mode={invModalMode} />
      <FacilityUsersModal open={usersModalOpen} onClose={() => setUsersModalOpen(false)} facility={menuFacility} />
      <ModalitiesModal open={modalitiesModalOpen} onClose={() => setModalitiesModalOpen(false)} />
      <DepartmentsModal open={deptsModalOpen} onClose={() => setDeptsModalOpen(false)} />

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
