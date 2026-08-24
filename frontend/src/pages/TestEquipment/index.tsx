import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import ScienceIcon from '@mui/icons-material/Science'
import { toast } from 'react-toastify'
import { useSearchParams } from 'react-router-dom'

import {
  createTestEquipment,
  deleteTestEquipment,
  fetchTestEquipment,
  updateTestEquipment,
  type TestEquipment,
  type TestEquipmentPayload,
} from '@/api/testEquipment'
import { fetchUsers, resolveUploadUrl } from '@/api/users'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import ContextTableRow from '@/components/ContextTableRow'
import SearchableSelect from '@/components/SearchableSelect'
import { useListContext } from '@/contexts/ListContext'

const PAGE_SIZE = 25
const ACTION_MENU_PAPER = {
  sx: {
    borderRadius: '16px',
    minWidth: 170,
    boxShadow: '0 18px 45px rgba(30,27,75,0.16)',
    border: '1px solid #EEF0F6',
  },
}
const ACTION_MENU_ITEM = {
  py: 1.15,
  px: 1.5,
  mx: 0.75,
  borderRadius: '10px',
  fontWeight: 800,
}

const TEST_EQUIPMENT_TABLE_SX = {
  width: '100%',
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    px: { xs: 1.25, lg: 1.5 },
    py: 1.15,
    minWidth: 0,
    boxSizing: 'border-box',
    whiteSpace: 'normal',
    verticalAlign: 'middle',
  },
  '& .MuiTableCell-head': { py: 1.1 },
}

const TEST_EQUIPMENT_PAGINATION_SX = {
  borderTop: '1px solid #EEF0F6',
  '& .MuiTablePagination-toolbar': { minHeight: 48, px: { xs: 0.5, sm: 1 } },
  '& .MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
  '& .MuiTablePagination-displayedRows': { m: 0, fontSize: 13, fontWeight: 750, color: '#64748B' },
}

const TEST_EQUIPMENT_ACTION_BUTTON_SX = {
  width: 34,
  height: 34,
  borderRadius: '10px',
  bgcolor: '#F1F5F9',
  color: '#7C3AED',
  '&:hover': { bgcolor: '#EDE9FE' },
}

const emptyForm: TestEquipmentPayload = {
  tem: '',
  mrf: '',
  model: '',
  serial_number: '',
  description: '',
  asset: '',
  technician_id: null,
  status: 'active',
  image: null,
}

const statusColor = (status: string) => {
  if (status === 'active') return { bg: '#ECFDF5', color: '#047857' }
  if (status === 'maintenance') return { bg: '#FEF3C7', color: '#B45309' }
  return { bg: '#F3F4F6', color: '#4B5563' }
}

const TestEquipmentPage = () => {
  const queryClient = useQueryClient()
  const { focusRecord } = useListContext()
  const [searchParams] = useSearchParams()
  const activitySearch = searchParams.get('search') || ''
  const user = useAuthStore((state) => state.user)
  const [search, setSearch] = useState(activitySearch)
  const [debouncedSearch, setDebouncedSearch] = useState(activitySearch)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TestEquipment | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<TestEquipment | null>(null)
  const [form, setForm] = useState<TestEquipmentPayload>(emptyForm)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [removeImage, setRemoveImage] = useState(false)

  const canAdd = hasPermission(user, 'test-equipment', 'add')
  const canEdit = hasPermission(user, 'test-equipment', 'edit')
  const canDelete = hasPermission(user, 'test-equipment', 'delete')

  useEffect(() => {
    setSearch(activitySearch)
    setDebouncedSearch(activitySearch)
    setPage(0)
  }, [activitySearch])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 350)
    return () => window.clearTimeout(handle)
  }, [search])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['test-equipment', debouncedSearch, status, page],
    queryFn: () => fetchTestEquipment({
      search: debouncedSearch || undefined,
      status: status || undefined,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  })

  const { data: technicianData } = useQuery({
    queryKey: ['users', 'technicians', 'test-equipment'],
    queryFn: () => fetchUsers({ role: 'technician', is_active: true, limit: 500 }),
    enabled: dialogOpen,
  })

  const items = data?.items || []
  const total = data?.total || 0
  const technicians = technicianData?.items || []

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const imageSrc = useMemo(() => {
    if (previewUrl) return previewUrl
    if (removeImage) return undefined
    return resolveUploadUrl(editing?.image_url)
  }, [previewUrl, editing?.image_url, removeImage])

  const createMut = useMutation({
    mutationFn: createTestEquipment,
    onSuccess: (item) => {
      toast.success('Test equipment added')
      focusRecord(`test-equipment-${item.id}`, item.tem, {
        message: 'Test equipment added',
        pathname: '/test-equipment',
        query: { search: item.tem },
      })
      queryClient.invalidateQueries({ queryKey: ['test-equipment'] })
      closeDialog()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to add test equipment'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TestEquipmentPayload }) => updateTestEquipment(id, payload),
    onSuccess: (item) => {
      toast.success('Test equipment updated')
      focusRecord(`test-equipment-${item.id}`, item.tem, {
        message: 'Test equipment updated',
        pathname: '/test-equipment',
        query: { search: item.tem },
      })
      queryClient.invalidateQueries({ queryKey: ['test-equipment'] })
      closeDialog()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to update test equipment'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTestEquipment,
    onSuccess: () => {
      toast.success('Test equipment deleted')
      queryClient.invalidateQueries({ queryKey: ['test-equipment'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to delete test equipment'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setPreviewUrl(undefined)
    setRemoveImage(false)
    setDialogOpen(true)
  }

  const openEdit = (item: TestEquipment) => {
    setEditing(item)
    setForm({
      tem: item.tem,
      mrf: item.mrf || '',
      model: item.model || '',
      serial_number: item.serial_number || '',
      description: item.description || '',
      asset: item.asset || '',
      technician_id: item.technician_id,
      status: item.status || 'active',
      image: null,
    })
    setPreviewUrl(undefined)
    setRemoveImage(false)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setPreviewUrl(undefined)
    setRemoveImage(false)
  }

  const openActions = (event: React.MouseEvent<HTMLElement>, item: TestEquipment) => {
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionItem(null)
  }

  const handleImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    setForm((prev) => ({ ...prev, image: file }))
    setPreviewUrl(URL.createObjectURL(file))
    setRemoveImage(false)
  }

  const handleSave = () => {
    if (!form.tem.trim()) {
      toast.error('TEM is required')
      return
    }
    const payload = {
      ...form,
      tem: form.tem.trim(),
      remove_image: removeImage,
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const pending = createMut.isPending || updateMut.isPending

  return (
    <Box className="page-enter" sx={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Test Equipment</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>
            Global catalog of test equipment used during service and inspection work.
          </Typography>
        </Box>
        {canAdd && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
            sx={{ minHeight: 40, alignSelf: { xs: 'flex-start', sm: 'center' }, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}>
            Add Test Equipment
          </Button>
        )}
      </Box>

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: '1px solid #E9D5FF', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(240px, 1fr) 170px auto auto' }, gap: 1, alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
          <TextField
            size="small"
            placeholder="Search TEM, serial, asset, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth sx={{ minWidth: 0 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9CA3AF' }} /></InputAdornment> }}
          />
          <TextField size="small" select label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value) }} fullWidth sx={{ minWidth: 0 }}>
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="maintenance">Maintenance</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
          {isFetching && !isLoading ? <CircularProgress size={18} thickness={5} sx={{ color: '#7C3AED', justifySelf: 'center' }} /> : <Box />}
          <Chip label={`${total} records`} title={`${total} records`} sx={{ height: 30, maxWidth: 130, justifySelf: { xs: 'start', sm: 'end' }, borderRadius: '9px', fontSize: 12, fontWeight: 900, backgroundColor: '#F5F3FF', color: '#6D28D9', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
        </Box>

        <TableContainer className="list-scroll-panel">
          <Table stickyHeader sx={{ ...TEST_EQUIPMENT_TABLE_SX, minWidth: { xs: 720, md: 900 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 300 }}>Test Equipment</TableCell>
                <TableCell sx={{ width: 180 }}>MRF / Model</TableCell>
                <TableCell sx={{ width: 190 }}>Serial / Asset</TableCell>
                <TableCell sx={{ width: 180 }}>Technician</TableCell>
                <TableCell sx={{ width: 125 }}>Status</TableCell>
                <TableCell align="right" sx={{ width: 62 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 6 }).map((__, col) => <TableCell key={col}><Skeleton /></TableCell>)}
                </TableRow>
              )) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 7 }}>
                    <ScienceIcon sx={{ fontSize: 52, color: '#D1D5DB', mb: 1 }} />
                    <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>No test equipment found</Typography>
                  </TableCell>
                </TableRow>
              ) : items.map((item) => {
                const colors = statusColor(item.status)
                return (
                  <ContextTableRow
                    key={item.id}
                    recordKey={`test-equipment-${item.id}`}
                    recordLabel={item.tem}
                    hover
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
                        <Avatar
                          variant="rounded"
                          src={resolveUploadUrl(item.image_url)}
                          sx={{ width: 42, height: 42, flexShrink: 0, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '11px' }}
                        >
                          <ScienceIcon fontSize="small" />
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <ClippedTooltipText value={item.tem} fontWeight={900} />
                          <ClippedTooltipText value={item.description || 'No description'} variant="caption" color="#6B7280" fontWeight={550} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <ClippedTooltipText value={item.mrf || '-'} fontWeight={800} />
                      <ClippedTooltipText value={item.model || 'No model'} variant="caption" color="#6B7280" fontWeight={500} />
                    </TableCell>
                    <TableCell>
                      <ClippedTooltipText value={item.serial_number || '-'} />
                      <ClippedTooltipText value={item.asset || 'No asset'} variant="caption" color="#6B7280" fontWeight={500} />
                    </TableCell>
                    <TableCell><ClippedTooltipText value={item.technician_name || '-'} /></TableCell>
                    <TableCell>
                      <Chip label={item.status} title={item.status} size="small" sx={{ height: 26, maxWidth: 115, borderRadius: '8px', backgroundColor: colors.bg, color: colors.color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', '& .MuiChip-label': { px: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                    </TableCell>
                    <TableCell align="right">
                      {(canEdit || canDelete) && (
                        <Tooltip title="Actions" arrow>
                          <IconButton
                            size="small"
                            aria-label={`Actions for ${item.tem}`}
                            onClick={(event) => openActions(event, item)}
                            sx={TEST_EQUIPMENT_ACTION_BUTTON_SX}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </ContextTableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          sx={TEST_EQUIPMENT_PAGINATION_SX}
        />
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
        {canEdit && actionItem && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { openEdit(actionItem); closeActions() }}>
            <ListItemIcon><EditIcon fontSize="small" sx={{ color: '#F59E0B' }} /></ListItemIcon>
            Edit
          </MenuItem>
        )}
        {canDelete && actionItem && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => {
            if (window.confirm(`Delete ${actionItem.tem}?`)) deleteMut.mutate(actionItem.id)
            closeActions()
          }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: '#EF4444' }} /></ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xl" fullWidth PaperProps={{ sx: { borderRadius: '18px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B', borderBottom: '1px solid #E5E7EB' }}>
          {editing ? 'Edit Test Equipment' : 'Add New Test Equipment'}
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 260px' }, gap: 2, '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { minHeight: 40 }, '& .MuiOutlinedInput-input:not(textarea)': { py: 1.1 } }}>
            <Box sx={{ display: 'grid', gap: 1.75, minWidth: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                <TextField label="TEM *" value={form.tem} onChange={(e) => setForm({ ...form, tem: e.target.value })} />
                <TextField label="MRF" value={form.mrf || ''} onChange={(e) => setForm({ ...form, mrf: e.target.value })} />
                <TextField label="Model" value={form.model || ''} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                <TextField label="Serial Number" value={form.serial_number || ''} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
                <TextField label="Asset" value={form.asset || ''} onChange={(e) => setForm({ ...form, asset: e.target.value })} />
                <TextField select label="Status" value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </TextField>
                <SearchableSelect<number>
                  label="Technician"
                  value={form.technician_id || ''}
                  options={technicians.map(technician => ({
                    value: technician.id,
                    label: technician.full_name,
                    secondary: technician.email,
                    keywords: `${technician.username} ${technician.role}`,
                  }))}
                  onChange={value => setForm({ ...form, technician_id: value ? Number(value) : null })}
                  placeholder="Search technician name or email"
                  noOptionsText="No matching technicians"
                  helperText="Leave empty for no assigned technician"
                  sx={{ gridColumn: { xs: 'auto', sm: 'span 2', xl: 'span 3' } }}
                />
                <TextField
                  label="Description"
                  multiline
                  rows={4}
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  sx={{ gridColumn: { xs: 'auto', sm: 'span 2', xl: 'span 3' } }}
                />
              </Box>

              <Box>
                <Typography sx={{ color: '#1E293B', fontSize: '0.85rem', mb: 0.75, fontWeight: 800 }}>Image</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button component="label" variant="outlined" sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 800 }}>
                    Choose File
                    <input hidden type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} />
                  </Button>
                  {imageSrc && (
                    <Button variant="text" color="error" onClick={() => { setPreviewUrl(undefined); setForm({ ...form, image: null }); setRemoveImage(true) }}>
                      Remove image
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>

            <Box sx={{ height: 240, borderRadius: '14px', border: '1px solid #E2E8F0', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {imageSrc ? (
                <Box component="img" src={imageSrc} alt="Test equipment preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageOutlinedIcon sx={{ color: '#CBD5E1', fontSize: 68 }} />
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, md: 3 }, pb: 2.5, justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={closeDialog} variant="outlined" sx={{ borderRadius: '10px', fontWeight: 800 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={pending}
            sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', borderRadius: '10px', px: 3, fontWeight: 900 }}
          >
            {pending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : (editing ? 'Update Test Equipment' : 'Add Test Equipment')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default TestEquipmentPage
