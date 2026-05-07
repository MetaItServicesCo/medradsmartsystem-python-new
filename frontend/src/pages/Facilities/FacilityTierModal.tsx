import React, { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogActions,
  Button, Box, Typography, IconButton,
  CircularProgress, Chip, Skeleton, Alert,
  TextField, MenuItem, Collapse, Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'

import { fetchTiers, createTier, updateTier, deleteTier, duplicateTier, type Tier, type TierCreate, type TierUpdate } from '@/api/tiers'
import { updateFacility, type Facility } from '@/api/facilities'

interface Props {
  open: boolean
  onClose: () => void
  facility: Facility | null
}

const FacilityTierModal = ({ open, onClose, facility }: Props) => {
  const queryClient = useQueryClient()
  const [selectedTierId, setSelectedTierId] = useState<number | null>(null)
  
  // Form State
  const [showForm, setShowForm] = useState(false)
  const initialFormState: Partial<TierCreate> = {
    tier_code: '', name: '', status: 'active',
    labor_rate_per_hour: 0, service_call_fee: 0, 
    preventive_maintenance_fee: 0, mileage_rate: 0,
    response_time_hours: 24, description: ''
  }
  const [form, setForm] = useState<Partial<TierCreate>>(initialFormState)
  const [viewTierId, setViewTierId] = useState<number | null>(null)
  const [editTierId, setEditTierId] = useState<number | null>(null)

  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['tiers'],
    queryFn: fetchTiers,
    enabled: open,
  })

  const tiers = tiersData?.items ?? []

  useEffect(() => {
    if (facility) {
      setSelectedTierId(facility.tier_id)
    }
  }, [facility, open])

  // Mutations
  const assignMutation = useMutation({
    mutationFn: (tierId: number | null) =>
      updateFacility(facility!.id, { tier_id: tierId }),
    onSuccess: () => {
      toast.success('Facility tier updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update tier')
    },
  })

  const createMut = useMutation({
    mutationFn: (data: TierCreate) => createTier(data),
    onSuccess: () => {
      toast.success('Tier created!')
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
      setShowForm(false)
      setForm(initialFormState)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create tier'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number, data: TierUpdate }) => updateTier(id, data),
    onSuccess: () => {
      toast.success('Tier updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
      setEditTierId(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update tier'),
  })

  const duplicateMut = useMutation({
    mutationFn: (id: number) => duplicateTier(id),
    onSuccess: () => {
      toast.success('Tier duplicated successfully!')
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to duplicate tier'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTier(id),
    onSuccess: () => {
      toast.success('Tier deleted')
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
      if (selectedTierId === deleteMut.variables) setSelectedTierId(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete tier'),
  })

  const handleSave = () => {
    if (facility && facility.id !== 0) {
      assignMutation.mutate(selectedTierId)
    } else {
      onClose()
    }
  }

  const handleCreateSubmit = () => {
    if (!form.tier_code || !form.name) {
      toast.error('Tier Code and Name are required')
      return
    }
    createMut.mutate(form as TierCreate)
  }

  const handleUpdateSubmit = (id: number, currentForm: Partial<TierCreate>) => {
    if (!currentForm.tier_code || !currentForm.name) {
      toast.error('Tier Code and Name are required')
      return
    }
    updateMut.mutate({ id, data: currentForm as TierUpdate })
  }

  const handleEditClick = (tier: Tier) => {
    if (editTierId === tier.id) {
      setEditTierId(null)
    } else {
      setViewTierId(null)
      setShowForm(false)
      setEditTierId(tier.id)
      setForm({
        ...tier,
        description: tier.description ?? undefined,
        response_time_hours: tier.response_time_hours ?? undefined,
      })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: '24px', overflow: 'hidden', boxShadow: '0 24px 80px rgba(124,58,237,0.18)' } }}
    >
      <Box sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 50%, #5B21B6 100%)', px: 3.5, py: 3, display: 'flex', alignItems: 'center', gap: 2, position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WorkspacePremiumIcon sx={{ color: '#fff', fontSize: '1.5rem' }} />
        </Box>
        <Box sx={{ flex: 1, zIndex: 1 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}>Facility Tier</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>
            {facility?.name ? `Assign tier for ${facility.name}` : 'Manage service tiers'}
          </Typography>
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => { setShowForm(!showForm); setEditTierId(null); setForm(initialFormState); }}
          sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', border: '1px solid', borderRadius: '10px', fontSize: '0.75rem' }}>
          {showForm ? 'Hide Form' : 'New Tier'}
        </Button>
        <IconButton onClick={onClose} sx={{ color: '#fff', zIndex: 1, '&:hover': { background: 'rgba(255,255,255,0.12)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: 3.5, pt: 3 }}>
        <Collapse in={showForm}>
          <Box sx={{ mb: 3, p: 2.5, borderRadius: '16px', backgroundColor: '#F5F3FF', border: '1px solid rgba(124,58,237,0.12)' }}>
            <Typography variant="overline" sx={{ color: '#7C3AED', fontWeight: 700, mb: 1.5, display: 'block' }}>Create New Tier</Typography>
            <TierFormFields form={form} setForm={setForm} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button size="small" onClick={() => setShowForm(false)} sx={{ color: '#6B7280' }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleCreateSubmit} disabled={createMut.isPending}
                 sx={{ backgroundColor: '#7C3AED' }}>
                {createMut.isPending ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Create Tier'}
              </Button>
            </Box>
          </Box>
        </Collapse>

        {facility && facility.id !== 0 && facility.tier_id && (
          <Alert severity="info" icon={<CheckCircleIcon />} sx={{ mb: 2.5, borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#5B21B6', border: '1px solid rgba(124,58,237,0.12)', '& .MuiAlert-icon': { color: '#7C3AED' } }}>
            Currently assigned: <strong>{tiers.find((t) => t.id === facility.tier_id)?.name || `Tier #${facility.tier_id}`}</strong>
          </Alert>
        )}

        <Typography variant="overline" sx={{ color: '#1E1B4B', fontWeight: 700, mb: 1.5, display: 'block' }}>Available Tiers</Typography>

        {tiersLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={60} sx={{ borderRadius: '16px' }} />)}
          </Box>
        ) : tiers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, color: '#9CA3AF' }}>
            <WorkspacePremiumIcon sx={{ fontSize: '3rem', mb: 1, opacity: 0.4 }} />
            <Typography variant="body2">No tiers configured yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(124,58,237,0.1)', color: '#7C3AED' }}>
                  <th style={{ padding: '12px 8px' }}>Code / Name</th>
                  <th style={{ padding: '12px 8px' }}>Labor Fee</th>
                  <th style={{ padding: '12px 8px' }}>Service Fee</th>
                  <th style={{ padding: '12px 8px' }}>PM Cost</th>
                  <th style={{ padding: '12px 8px' }}>Mileage</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => {
                  const selected = selectedTierId === tier.id
                  const isViewing = viewTierId === tier.id
                  const isEditing = editTierId === tier.id
                  return (
                    <React.Fragment key={tier.id}>
                      <tr style={{ borderBottom: (isViewing || isEditing) ? 'none' : '1px solid #E5E7EB', backgroundColor: selected ? '#F5F3FF' : (isViewing || isEditing) ? '#FAFAFA' : 'transparent', transition: 'background-color 0.2s' }}>
                        <td style={{ padding: '12px 8px' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1E1B4B' }}>{tier.name}</Typography>
                          <Typography variant="caption" sx={{ color: '#6B7280' }}>ID: {tier.tier_code}</Typography>
                        </td>
                        <td style={{ padding: '12px 8px' }}>${tier.labor_rate_per_hour}/hr</td>
                        <td style={{ padding: '12px 8px' }}>${tier.service_call_fee}</td>
                        <td style={{ padding: '12px 8px' }}>${tier.preventive_maintenance_fee}</td>
                        <td style={{ padding: '12px 8px' }}>${tier.mileage_rate}/mi</td>
                        <td style={{ padding: '12px 8px' }}>
                          <Chip label={tier.status} size="small" sx={{ backgroundColor: tier.status === 'active' ? '#D1FAE5' : '#FEE2E2', color: tier.status === 'active' ? '#065F46' : '#991B1B', fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }} />
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Tooltip title="View Details">
                            <IconButton size="small" onClick={() => { setViewTierId(isViewing ? null : tier.id); setEditTierId(null); }} sx={{ mr: 1, color: '#3B82F6', backgroundColor: '#EFF6FF', borderRadius: '8px' }}>
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit Tier">
                            <IconButton size="small" onClick={() => handleEditClick(tier)} sx={{ mr: 1, color: '#F59E0B', backgroundColor: '#FEF3C7', borderRadius: '8px' }}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplicate Tier">
                            <IconButton size="small" onClick={() => { if(window.confirm('Duplicate this tier?')) duplicateMut.mutate(tier.id) }} sx={{ mr: 1, color: '#10B981', backgroundColor: '#D1FAE5', borderRadius: '8px' }}>
                              <ContentCopyOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Tier">
                            <IconButton size="small" onClick={() => { if(window.confirm('Delete this tier?')) deleteMut.mutate(tier.id) }} sx={{ mr: 2, color: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: '8px' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {facility && facility.id !== 0 && (
                            <Button size="small" variant={selected ? 'contained' : 'outlined'} onClick={() => setSelectedTierId(tier.id)}
                              sx={{ minWidth: '80px', borderColor: '#7C3AED', color: selected ? '#fff' : '#7C3AED', backgroundColor: selected ? '#7C3AED' : 'transparent', borderRadius: '8px', textTransform: 'none', '&:hover': { backgroundColor: selected ? '#6D28D9' : 'rgba(124,58,237,0.08)' } }}>
                              {selected ? 'Assigned' : 'Assign'}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isViewing && !isEditing && (
                        <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E5E7EB' }}>
                          <td colSpan={7} style={{ padding: '0 8px 16px 8px' }}>
                            <Box sx={{ p: 2, border: '1px solid rgba(124,58,237,0.1)', borderRadius: '12px', backgroundColor: '#fff' }}>
                               <Typography variant="subtitle2" sx={{ color: '#7C3AED', mb: 1, fontWeight: 700 }}>Tier Details</Typography>
                               <Typography variant="body2" sx={{ color: '#374151' }}><strong>Description:</strong> {tier.description || 'No description provided.'}</Typography>
                               <Typography variant="body2" sx={{ mt: 0.5, color: '#374151' }}><strong>Response SLA:</strong> {tier.response_time_hours} hours</Typography>
                               <Typography variant="body2" sx={{ mt: 0.5, color: '#374151' }}><strong>Created:</strong> {new Date(tier.created_at).toLocaleDateString()}</Typography>
                            </Box>
                          </td>
                        </tr>
                      )}
                      {isEditing && (
                        <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E5E7EB' }}>
                          <td colSpan={7} style={{ padding: '0 8px 16px 8px' }}>
                            <Box sx={{ p: 2.5, borderRadius: '16px', backgroundColor: '#FFFBEB', border: '1px solid rgba(245,158,11,0.2)' }}>
                              <Typography variant="overline" sx={{ color: '#D97706', fontWeight: 700, mb: 1.5, display: 'block' }}>Edit Tier: {tier.name}</Typography>
                              <TierFormFields form={form} setForm={setForm} />
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                <Button size="small" onClick={() => setEditTierId(null)} sx={{ color: '#6B7280' }}>Cancel</Button>
                                <Button size="small" variant="contained" onClick={() => handleUpdateSubmit(tier.id, form)} disabled={updateMut.isPending}
                                  sx={{ backgroundColor: '#F59E0B', '&:hover': { backgroundColor: '#D97706' } }}>
                                  {updateMut.isPending ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Save Changes'}
                                </Button>
                              </Box>
                            </Box>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>

            {facility && facility.id !== 0 && (
              <Box onClick={() => setSelectedTierId(null)} sx={{ mt: 3, p: 2, borderRadius: '12px', border: selectedTierId === null ? '1px solid #EF4444' : '1px solid #E5E7EB', backgroundColor: selectedTierId === null ? '#FEF2F2' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: selectedTierId === null ? '#EF4444' : '#6B7280' }}>
                  {selectedTierId === null ? '✓ No Tier Assigned' : 'Remove Tier Assignment'}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3.5, pb: 3, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#E5E7EB', color: '#6B7280', flex: 1, borderRadius: '12px', py: 1.2 }}>Close</Button>
        {facility && facility.id !== 0 && (
          <Button onClick={handleSave} variant="contained" disabled={assignMutation.isPending || tiersLoading}
            sx={{ flex: 2, backgroundColor: '#7C3AED', borderRadius: '12px', py: 1.2, boxShadow: '0 4px 16px rgba(124,58,237,0.3)', '&:hover': { backgroundColor: '#6D28D9' } }}>
            {assignMutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Save Facility Tier'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

const TierFormFields = ({ form, setForm }: { form: Partial<TierCreate>, setForm: any }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 2 }}>
    <TextField size="small" label="Tier Code (ID) *" value={form.tier_code} onChange={e => setForm({ ...form, tier_code: e.target.value })} />
    <TextField size="small" label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
    <TextField size="small" label="Status" select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
      <MenuItem value="active">Active</MenuItem>
      <MenuItem value="inactive">Inactive</MenuItem>
    </TextField>
    
    <TextField size="small" label="Labor Fee (/hr)" type="number" value={form.labor_rate_per_hour} onChange={e => setForm({ ...form, labor_rate_per_hour: Number(e.target.value) })} />
    <TextField size="small" label="Service Call Fee" type="number" value={form.service_call_fee} onChange={e => setForm({ ...form, service_call_fee: Number(e.target.value) })} />
    <TextField size="small" label="PM Cost" type="number" value={form.preventive_maintenance_fee} onChange={e => setForm({ ...form, preventive_maintenance_fee: Number(e.target.value) })} />
    
    <TextField size="small" label="Mileage Cost (/mi)" type="number" value={form.mileage_rate} onChange={e => setForm({ ...form, mileage_rate: Number(e.target.value) })} />
    <TextField size="small" label="Response Time (hrs)" type="number" value={form.response_time_hours} onChange={e => setForm({ ...form, response_time_hours: Number(e.target.value) })} />
    <TextField size="small" label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
  </Box>
)

export default FacilityTierModal
