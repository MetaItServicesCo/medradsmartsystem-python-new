import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogActions, Box, Typography, IconButton,
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Skeleton, TextField, CircularProgress, MenuItem
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import InventoryIcon from '@mui/icons-material/Inventory'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { toast } from 'react-toastify'
import { fetchEquipment, createEquipment, updateEquipment, deleteEquipment, type EquipmentCreate, type EquipmentItem } from '@/api/equipment'
import { fetchModalities } from '@/api/modalities'
import { type Facility } from '@/api/facilities'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#F0FDF4', color: '#10B981' },
  rented: { bg: '#FFF7ED', color: '#F59E0B' },
  in_maintenance: { bg: '#FEF2F2', color: '#EF4444' },
  retired: { bg: '#F3F4F6', color: '#6B7280' },
}

interface Props {
  open: boolean
  onClose: () => void
  facility: Facility | null
  mode: 'view' | 'add'
}

const FacilityInventoryModal = ({ open, onClose, facility, mode }: Props) => {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(mode === 'add')
  const [form, setForm] = useState<Partial<EquipmentCreate>>({
    asset_tag: '', make: '', model: '', serial_number: '', status: 'active',
  })
  
  const [selectedParentMod, setSelectedParentMod] = useState<number | ''>('')
  const [selectedSubMod, setSelectedSubMod] = useState<number | ''>('')
  const [editItemId, setEditItemId] = useState<number | null>(null)

  useEffect(() => {
    if (open) setShowForm(mode === 'add')
  }, [open, mode])

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', facility?.id],
    queryFn: () => fetchEquipment(facility?.id),
    enabled: open && !!facility,
  })

  // Fetch modalities. Assuming API returns parent_only=true by default.
  const { data: modalitiesData } = useQuery({
    queryKey: ['modalities'],
    queryFn: () => fetchModalities(),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (d: EquipmentCreate) => createEquipment(d),
    onSuccess: () => {
      toast.success('Inventory item added!')
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
      setShowForm(false)
      setForm({ asset_tag: '', make: '', model: '', serial_number: '', status: 'active' })
      setSelectedParentMod('')
      setSelectedSubMod('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to add item'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number, data: EquipmentCreate }) => updateEquipment(id, data),
    onSuccess: () => {
      toast.success('Inventory item updated!')
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
      setShowForm(false)
      setEditItemId(null)
      setForm({ asset_tag: '', make: '', model: '', serial_number: '', status: 'active' })
      setSelectedParentMod('')
      setSelectedSubMod('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update item'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteEquipment(id),
    onSuccess: () => {
      toast.success('Item removed')
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
    },
  })

  const items = data?.items ?? []
  const modalities = modalitiesData?.items ?? []

  // Compute children for the selected parent modality
  const subModalities = useMemo(() => {
    if (!selectedParentMod) return []
    const parent = modalities.find(m => m.id === selectedParentMod)
    return parent?.children || []
  }, [selectedParentMod, modalities])

  const handleEditClick = (item: EquipmentItem) => {
    setForm({
      asset_tag: item.asset_tag,
      make: item.make,
      model: item.model,
      serial_number: item.serial_number,
      status: item.status,
    })
    
    const isParent = modalities.find(m => m.id === item.modality_id)
    if (isParent) {
      setSelectedParentMod(isParent.id)
      setSelectedSubMod('')
    } else {
      const parent = modalities.find(m => m.children?.some((c: any) => c.id === item.modality_id))
      if (parent) {
        setSelectedParentMod(parent.id)
        setSelectedSubMod(item.modality_id)
      } else {
        setSelectedParentMod('')
        setSelectedSubMod('')
      }
    }
    setEditItemId(item.id)
    setShowForm(true)
  }

  const handleSubmit = () => {
    // Determine the final modality_id. If sub-modalities exist, the user must select one.
    let finalModalityId = selectedParentMod
    if (subModalities.length > 0) {
      if (!selectedSubMod) {
        toast.error('Please select a Sub-Modality')
        return
      }
      finalModalityId = selectedSubMod
    }

    if (!form.asset_tag || !form.make || !form.model || !form.serial_number || !finalModalityId) {
      toast.error('Please fill all required fields (including Modality constraints)')
      return
    }

    const payload = { 
      ...form, 
      facility_id: facility!.id, 
      modality_id: Number(finalModalityId) 
    } as EquipmentCreate

    if (editItemId) {
      updateMut.mutate({ id: editItemId, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden' } }}>
      <Box sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)', px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <InventoryIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
            {mode === 'add' ? 'Add Inventory' : 'View Inventory'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            {facility?.name || 'Facility'}
          </Typography>
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setShowForm(!showForm)}
          sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', border: '1px solid', borderRadius: '10px', fontSize: '0.75rem' }}>
          {showForm ? 'View List' : 'Add Item'}
        </Button>
        <IconButton onClick={onClose} sx={{ color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5 }}>
        {showForm && (
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F5F3FF', border: '1px solid rgba(124,58,237,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, mb: 1.5, display: 'block' }}>
              {editItemId ? 'Edit Inventory Item' : 'New Inventory Item'}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
              <TextField size="small" label="Asset Tag *" value={form.asset_tag} onChange={e => setForm({ ...form, asset_tag: e.target.value })} />
              <TextField size="small" label="Serial Number *" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
              <TextField size="small" label="Make *" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} />
              <TextField size="small" label="Model *" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              
              <TextField size="small" label="Modality *" select value={selectedParentMod} onChange={e => { setSelectedParentMod(Number(e.target.value)); setSelectedSubMod(''); }}>
                {modalities.map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </TextField>

              {subModalities.length > 0 ? (
                <TextField size="small" label="Sub-Modality *" select value={selectedSubMod} onChange={e => setSelectedSubMod(Number(e.target.value))}>
                  {subModalities.map((sub: any) => (
                    <MenuItem key={sub.id} value={sub.id}>{sub.name}</MenuItem>
                  ))}
                </TextField>
              ) : (
                <Box /> // Empty placeholder to keep grid layout intact
              )}

              <TextField size="small" label="Status" select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })} sx={{ gridColumn: 'span 2' }}>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="rented">Rented</MenuItem>
                <MenuItem value="in_maintenance">In Maintenance</MenuItem>
                <MenuItem value="retired">Retired</MenuItem>
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => { setShowForm(false); setEditItemId(null); setForm({ asset_tag: '', make: '', model: '', serial_number: '', status: 'active' }); setSelectedParentMod(''); setSelectedSubMod(''); }} sx={{ color: '#6B7280' }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} sx={{ backgroundColor: '#7C3AED', '&:hover': { backgroundColor: '#6D28D9' } }}>
                {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : (editItemId ? 'Update Item' : 'Add Item')}
              </Button>
            </Box>
          </Box>
        )}

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Asset Tag</TableCell>
                <TableCell>Make / Model</TableCell>
                <TableCell>Serial #</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <InventoryIcon sx={{ fontSize: '2.5rem', color: '#E5E7EB', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body2" color="text.secondary">No inventory items for this facility</Typography>
                  </TableCell>
                </TableRow>
              ) : items.map((item) => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.active
                return (
                  <TableRow key={item.id}>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{item.asset_tag}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{item.make} {item.model}</Typography></TableCell>
                    <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.serial_number}</Typography></TableCell>
                    <TableCell>
                      <Chip label={item.status.replace('_', ' ')} size="small" sx={{ backgroundColor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEditClick(item)} sx={{ mr: 1, color: '#F59E0B', backgroundColor: '#FEF3C7', borderRadius: '8px', '&:hover': { backgroundColor: '#FDE68A' } }}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => deleteMut.mutate(item.id)} sx={{ color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: '8px', '&:hover': { backgroundColor: '#FEE2E2' } }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
    </Dialog>
  )
}

export default FacilityInventoryModal
