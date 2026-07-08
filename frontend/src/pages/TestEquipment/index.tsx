import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import SearchIcon from '@mui/icons-material/Search'
import ScienceIcon from '@mui/icons-material/Science'
import { toast } from 'react-toastify'

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

const PAGE_SIZE = 25

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
  const user = useAuthStore((state) => state.user)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TestEquipment | null>(null)
  const [form, setForm] = useState<TestEquipmentPayload>(emptyForm)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [removeImage, setRemoveImage] = useState(false)

  const canAdd = hasPermission(user, 'test-equipment', 'add')
  const canEdit = hasPermission(user, 'test-equipment', 'edit')
  const canDelete = hasPermission(user, 'test-equipment', 'delete')

  const { data, isLoading } = useQuery({
    queryKey: ['test-equipment', search, status, page],
    queryFn: () => fetchTestEquipment({
      search: search || undefined,
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
    onSuccess: () => {
      toast.success('Test equipment added')
      queryClient.invalidateQueries({ queryKey: ['test-equipment'] })
      closeDialog()
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Failed to add test equipment'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TestEquipmentPayload }) => updateTestEquipment(id, payload),
    onSuccess: () => {
      toast.success('Test equipment updated')
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
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Test Equipment</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>
            Global catalog of test equipment used during service and inspection work.
          </Typography>
        </Box>
        {canAdd && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
            sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', borderRadius: '14px', px: 3, fontWeight: 900 }}>
            Add Test Equipment
          </Button>
        )}
      </Box>

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: '1px solid #E9D5FF' }}>
        <Box sx={{ p: 2.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E7EB' }}>
          <TextField
            size="small"
            placeholder="Search TEM, serial, asset, model..."
            value={search}
            onChange={(e) => { setPage(0); setSearch(e.target.value) }}
            sx={{ minWidth: 320 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9CA3AF' }} /></InputAdornment> }}
          />
          <TextField size="small" select label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value) }} sx={{ minWidth: 170 }}>
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="maintenance">Maintenance</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
          <Chip label={`${total} records`} sx={{ ml: 'auto', fontWeight: 900, backgroundColor: '#F5F3FF', color: '#6D28D9' }} />
        </Box>

        <TableContainer className="list-scroll-panel">
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Image</TableCell>
                <TableCell>TEM</TableCell>
                <TableCell>MRF / Model</TableCell>
                <TableCell>Serial / Asset</TableCell>
                <TableCell>Technician</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 7 }).map((__, col) => <TableCell key={col}><Skeleton /></TableCell>)}
                </TableRow>
              )) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 7 }}>
                    <ScienceIcon sx={{ fontSize: 52, color: '#D1D5DB', mb: 1 }} />
                    <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>No test equipment found</Typography>
                  </TableCell>
                </TableRow>
              ) : items.map((item) => {
                const colors = statusColor(item.status)
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Avatar
                        variant="rounded"
                        src={resolveUploadUrl(item.image_url)}
                        sx={{ width: 48, height: 48, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '12px' }}
                      >
                        <ScienceIcon />
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{item.tem}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{item.description || 'No description'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800 }}>{item.mrf || '-'}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{item.model || 'No model'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography>{item.serial_number || '-'}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{item.asset || 'No asset'}</Typography>
                    </TableCell>
                    <TableCell>{item.technician_name || '-'}</TableCell>
                    <TableCell>
                      <Chip label={item.status} size="small" sx={{ backgroundColor: colors.bg, color: colors.color, fontWeight: 900, textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <Tooltip title="Edit"><IconButton onClick={() => openEdit(item)} sx={{ color: '#F59E0B' }}><EditIcon /></IconButton></Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Delete">
                          <IconButton
                            onClick={() => {
                              if (window.confirm(`Delete ${item.tem}?`)) deleteMut.mutate(item.id)
                            }}
                            sx={{ color: '#EF4444' }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
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
        />
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '18px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B', borderBottom: '1px solid #E5E7EB' }}>
          {editing ? 'Edit Test Equipment' : 'Add New Test Equipment'}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 360px' }, gap: 3 }}>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
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
                <TextField
                  select
                  label="Technician"
                  value={form.technician_id || ''}
                  onChange={(e) => setForm({ ...form, technician_id: e.target.value ? Number(e.target.value) : null })}
                  sx={{ gridColumn: { xs: 'auto', md: 'span 3' } }}
                >
                  <MenuItem value="">No assigned technician</MenuItem>
                  {technicians.map((tech) => <MenuItem key={tech.id} value={tech.id}>{tech.full_name}</MenuItem>)}
                </TextField>
                <TextField
                  label="Description"
                  multiline
                  rows={4}
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  sx={{ gridColumn: { xs: 'auto', md: 'span 3' } }}
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

            <Box sx={{ height: 280, borderRadius: '16px', border: '1px solid #E2E8F0', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {imageSrc ? (
                <Box component="img" src={imageSrc} alt="Test equipment preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageOutlinedIcon sx={{ color: '#CBD5E1', fontSize: 68 }} />
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'flex-start' }}>
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
