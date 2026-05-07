import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, Box, Typography, IconButton,
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Skeleton, Tooltip, TextField, CircularProgress, MenuItem
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DomainIcon from '@mui/icons-material/Domain'
import AddIcon from '@mui/icons-material/Add'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { toast } from 'react-toastify'
import {
  fetchDepartments, createDepartment, updateDepartment, deleteDepartment,
  type Department, type DepartmentCreate, type DepartmentUpdate
} from '@/api/departments'
import { fetchFacilities } from '@/api/facilities'

interface Props {
  open: boolean
  onClose: () => void
}

const DepartmentsModal = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [viewDept, setViewDept] = useState<Department | null>(null)
  const [form, setForm] = useState<Partial<DepartmentCreate>>({ name: '', description: '', facility_id: 0 })

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: open,
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities-dropdown'],
    queryFn: () => fetchFacilities({ limit: 500 }),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (d: DepartmentCreate) => createDepartment(d),
    onSuccess: () => { toast.success('Department created!'); queryClient.invalidateQueries({ queryKey: ['departments'] }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: DepartmentUpdate }) => updateDepartment(id, d),
    onSuccess: () => { toast.success('Department updated!'); queryClient.invalidateQueries({ queryKey: ['departments'] }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteDepartment(id),
    onSuccess: () => { toast.success('Department deleted'); queryClient.invalidateQueries({ queryKey: ['departments'] }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const departments = data?.items ?? []
  const facilities = facilitiesData?.items ?? []

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm({ name: '', description: '', facility_id: 0 }) }

  const handleSubmit = () => {
    if (!form.name || !form.facility_id) { toast.error('Name and facility are required'); return }
    if (editingId) {
      updateMut.mutate({ id: editingId, d: form as DepartmentUpdate })
    } else {
      createMut.mutate(form as DepartmentCreate)
    }
  }

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id)
    setForm({ name: dept.name, description: dept.description || '', facility_id: dept.facility_id })
    setShowForm(true)
  }

  const getFacilityName = (fid: number) => facilities.find(f => f.id === fid)?.name || `#${fid}`

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <Box sx={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
        px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DomainIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>Departments</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>Manage facility departments</Typography>
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => { resetForm(); setShowForm(true) }}
          sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', border: '1px solid', borderRadius: '10px', fontSize: '0.75rem' }}>
          Add Department
        </Button>
        <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5 }}>
        {/* Form */}
        {showForm && (
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F5F3FF', border: '1px solid rgba(124,58,237,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, mb: 1.5, display: 'block' }}>
              {editingId ? 'Edit Department' : 'New Department'}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
              <TextField size="small" label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <TextField size="small" label="Facility *" select value={form.facility_id || ''} onChange={e => setForm({ ...form, facility_id: Number(e.target.value) })}>
                {facilities.map(f => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Description" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                fullWidth sx={{ gridColumn: 'span 2' }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={resetForm} sx={{ color: '#6B7280' }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                sx={{ backgroundColor: '#7C3AED', '&:hover': { backgroundColor: '#6D28D9' } }}>
                {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : editingId ? 'Save' : 'Create'}
              </Button>
            </Box>
          </Box>
        )}

        {/* View detail */}
        {viewDept && (
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F0FDF4', border: '1px solid rgba(16,185,129,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#10B981', fontWeight: 700, mb: 1, display: 'block' }}>Department Details</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{viewDept.name}</Typography>
            <Typography variant="caption" sx={{ color: '#6B7280' }}>Facility: {getFacilityName(viewDept.facility_id)}</Typography>
            {viewDept.description && <Typography variant="body2" sx={{ mt: 1, color: '#374151' }}>{viewDept.description}</Typography>}
            <Button size="small" onClick={() => setViewDept(null)} sx={{ mt: 1, color: '#6B7280' }}>Close</Button>
          </Box>
        )}

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Department</TableCell>
                <TableCell>Facility</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                    <DomainIcon sx={{ fontSize: '2.5rem', color: '#E5E7EB', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body2" color="text.secondary">No departments found</Typography>
                  </TableCell>
                </TableRow>
              ) : departments.map((dept) => (
                <TableRow key={dept.id} sx={{ '&:hover': { backgroundColor: '#FAFAFF' } }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>{dept.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={getFacilityName(dept.facility_id)} size="small"
                      sx={{ backgroundColor: '#F5F3FF', color: '#7C3AED', fontWeight: 600, fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                      {dept.description || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title="View">
                        <IconButton size="small" onClick={() => setViewDept(dept)}
                          sx={{ color: '#3B82F6', backgroundColor: '#EFF6FF', borderRadius: '8px', '&:hover': { backgroundColor: '#DBEAFE' } }}>
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleEdit(dept)}
                          sx={{ color: '#7C3AED', backgroundColor: '#F5F3FF', borderRadius: '8px', '&:hover': { backgroundColor: '#EDE9FE' } }}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => delMut.mutate(dept.id)}
                          sx={{ color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: '8px', '&:hover': { backgroundColor: '#FEE2E2' } }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
    </Dialog>
  )
}

export default DepartmentsModal
