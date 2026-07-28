import { useDeferredValue, useState, useEffect, useMemo, type MouseEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogActions, Box, Typography, IconButton,
  Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Skeleton, TextField, CircularProgress, MenuItem, Menu, ListItemIcon, ListItemText
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import InventoryIcon from '@mui/icons-material/Inventory'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined'
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined'
import { toast } from 'react-toastify'
import { fetchEquipment, createEquipment, updateEquipment, deleteEquipment, type EquipmentCreate, type EquipmentItem } from '@/api/equipment'
import { fetchInspectionForms } from '@/api/inspections'
import { fetchModalities } from '@/api/modalities'
import { fetchTiers } from '@/api/tiers'
import { type Facility } from '@/api/facilities'
import CreateServiceRequestModal from '@/pages/ServiceRequests/CreateServiceRequestModal'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import SearchableSelect from '@/components/SearchableSelect'
import { formatUSPhoneInput } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/config/permissions'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#F0FDF4', color: '#10B981' },
  inactive: { bg: '#F3F4F6', color: '#6B7280' },
  rented: { bg: '#FFF7ED', color: '#F59E0B' },
  in_maintenance: { bg: '#FEF2F2', color: '#EF4444' },
  retired: { bg: '#F3F4F6', color: '#6B7280' },
}

const INSPECTION_SCHEDULE_MONTHS: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  'Semi-Annual': 6,
  Annual: 12,
}

const getNextInspectionDate = (lastInspectionDate?: string | null, schedule?: string | null) => {
  if (!lastInspectionDate || !schedule) return null
  const months = INSPECTION_SCHEDULE_MONTHS[schedule]
  if (!months) return null

  const [year, month, day] = lastInspectionDate.split('-').map(Number)
  if (!year || !month || !day) return null

  const nextMonthIndex = month - 1 + months
  const nextYear = year + Math.floor(nextMonthIndex / 12)
  const nextMonth = (nextMonthIndex % 12) + 1
  const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  const nextDay = Math.min(day, lastDayOfNextMonth)

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

interface Props {
  open: boolean
  onClose: () => void
  facility: Facility | null
  mode: 'view' | 'add'
}

const FacilityInventoryModal = ({ open, onClose, facility, mode }: Props) => {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const canAddInventory = hasPermission(user, 'facility-inventory', 'add')
  const canEditInventory = hasPermission(user, 'facility-inventory', 'edit')
  const canDeleteInventory = hasPermission(user, 'facility-inventory', 'delete')
  const [showForm, setShowForm] = useState(mode === 'add' && canAddInventory)
  const defaultForm: Partial<EquipmentCreate> = {
    asset_tag: '',
    make: '',
    model: '',
    serial_number: '',
    status: 'active',
    risk_name: 'Non-Critical',
    acquisition_method: 'Purchased',
    capital_equipment: 'Yes',
    pm_scheduling: 'Annual',
  }
  const [form, setForm] = useState<Partial<EquipmentCreate>>(defaultForm)
  
  const [selectedParentMod, setSelectedParentMod] = useState<number | ''>('')
  const [selectedSubMod, setSelectedSubMod] = useState<number | ''>('')
  const [editItemId, setEditItemId] = useState<number | null>(null)
  const [viewItem, setViewItem] = useState<EquipmentItem | null>(null)
  const [serviceRequestItem, setServiceRequestItem] = useState<EquipmentItem | null>(null)
  const [actionAnchor, setActionAnchor] = useState<null | HTMLElement>(null)
  const [actionItem, setActionItem] = useState<EquipmentItem | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())

  useEffect(() => {
    if (open) setShowForm(mode === 'add' && canAddInventory)
  }, [canAddInventory, open, mode])

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', facility?.id, deferredSearch],
    queryFn: () => fetchEquipment(facility?.id, deferredSearch || undefined),
    enabled: open && !!facility,
  })

  // Fetch modalities. Assuming API returns parent_only=true by default.
  const { data: modalitiesData } = useQuery({
    queryKey: ['modalities'],
    queryFn: () => fetchModalities(),
    enabled: open,
  })

  const { data: tiersData } = useQuery({
    queryKey: ['tiers'],
    queryFn: () => fetchTiers({ limit: 500 }),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (d: EquipmentCreate) => createEquipment(d),
    onSuccess: () => {
      toast.success('Facility inventory item added')
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
      setShowForm(false)
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to add item'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number, data: Partial<EquipmentCreate> }) => updateEquipment(id, data),
    onSuccess: () => {
      toast.success('Facility inventory item updated')
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
      setShowForm(false)
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update item'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteEquipment(id),
    onSuccess: () => {
      toast.success('Item removed')
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['equipment', facility?.id] })
    },
  })

  const items = data?.items ?? []
  const modalities = modalitiesData?.items ?? []
  const tiers = tiersData?.items ?? []
  const facilityTierIds = facility?.tier_ids?.length ? facility.tier_ids : (facility?.tier_id ? [facility.tier_id] : [])
  const availableTiers = facilityTierIds.length > 0
    ? tiers.filter((tier) => facilityTierIds.includes(tier.id))
    : tiers

  // Compute children for the selected parent modality
  const subModalities = useMemo(() => {
    if (!selectedParentMod) return []
    const parent = modalities.find(m => m.id === selectedParentMod)
    return parent?.children || []
  }, [selectedParentMod, modalities])

  const selectedAssetModalityId = useMemo(() => {
    if (!selectedParentMod) return undefined
    if (subModalities.length > 0) return selectedSubMod ? Number(selectedSubMod) : undefined
    return Number(selectedParentMod)
  }, [selectedParentMod, selectedSubMod, subModalities.length])

  const { data: inspectionFormsData, isSuccess: inspectionFormsLoaded } = useQuery({
    queryKey: ['inspection-forms', selectedAssetModalityId],
    queryFn: () => fetchInspectionForms(selectedAssetModalityId),
    enabled: open && Boolean(selectedAssetModalityId),
  })

  const inspectionForms = inspectionFormsData?.items ?? []

  const nextInspectionDate = useMemo(
    () => getNextInspectionDate(form.last_pm_date, form.pm_scheduling),
    [form.last_pm_date, form.pm_scheduling],
  )

  useEffect(() => {
    if (!form.inspection_form_id || !selectedAssetModalityId || !inspectionFormsLoaded) return
    if (inspectionForms.some((inspectionForm) => inspectionForm.id === form.inspection_form_id)) return
    setForm((prev) => ({ ...prev, inspection_form_id: null }))
  }, [form.inspection_form_id, inspectionForms, inspectionFormsLoaded, selectedAssetModalityId])

  const resetForm = () => {
    setForm(defaultForm)
    setSelectedParentMod('')
    setSelectedSubMod('')
    setEditItemId(null)
  }

  const handlePicture = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((prev) => ({ ...prev, default_picture_url: String(reader.result || '') }))
    reader.readAsDataURL(file)
  }

  const handleEditClick = (item: EquipmentItem) => {
    if (!canEditInventory) return
    setForm({
      asset_tag: item.asset_tag,
      make: item.make,
      model: item.model,
      serial_number: item.serial_number,
      tier_id: item.tier_id,
      inspection_form_id: item.inspection_form_id,
      default_picture_url: item.default_picture_url || '',
      description: item.description || '',
      risk_priority: item.risk_priority || '',
      risk_name: item.risk_name || 'Non-Critical',
      location: item.location || '',
      inventory_date: item.inventory_date,
      department: item.department || '',
      po_no: item.po_no || '',
      requester_first_name: item.requester_first_name || '',
      requester_last_name: item.requester_last_name || '',
      requester_phone: formatUSPhoneInput(item.requester_phone || ''),
      requester_fax: formatUSPhoneInput(item.requester_fax || ''),
      requester_mailing_address: item.requester_mailing_address || '',
      requester_email: item.requester_email || '',
      owning_department: item.owning_department || '',
      acquisition_method: item.acquisition_method || 'Purchased',
      acquired_company_name: item.acquired_company_name || '',
      acquired_account_number: item.acquired_account_number || '',
      acquired_sales_person: item.acquired_sales_person || '',
      acquired_phone: formatUSPhoneInput(item.acquired_phone || ''),
      acquired_email: item.acquired_email || '',
      acquired_mailing_address: item.acquired_mailing_address || '',
      cost: Number(item.cost || 0),
      acquisition_date: item.acquisition_date,
      capital_equipment: item.capital_equipment || 'Yes',
      warranty_duration: item.warranty_duration || '',
      parts_duration: item.parts_duration || '',
      labor_duration: item.labor_duration || '',
      coverage_start_date: item.coverage_start_date,
      coverage_type: item.coverage_type || '',
      part_warranty_end_date: item.part_warranty_end_date,
      labor_warranty_end_date: item.labor_warranty_end_date,
      pm_scheduling: item.pm_scheduling || 'Annual',
      installation_date: item.installation_date,
      last_pm_date: item.last_pm_date,
      next_generated_pm_date: item.next_generated_pm_date,
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

  const closeActionMenu = () => {
    setActionAnchor(null)
  }

  const handleActionOpen = (event: MouseEvent<HTMLElement>, item: EquipmentItem) => {
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }

  const handleToggleActive = () => {
    if (!actionItem || !canEditInventory) return
    updateMut.mutate({
      id: actionItem.id,
      data: { status: actionItem.status === 'active' ? 'inactive' : 'active' },
    })
    closeActionMenu()
  }

  const handleSubmit = () => {
    if (editItemId ? !canEditInventory : !canAddInventory) {
      toast.error(`You do not have permission to ${editItemId ? 'edit' : 'add'} facility inventory`)
      return
    }
    // Determine the final modality_id. If sub-modalities exist, the user must select one.
    let finalModalityId = selectedParentMod
    if (subModalities.length > 0) {
      if (!selectedSubMod) {
        toast.error('Please select a Sub-Modality')
        return
      }
      finalModalityId = selectedSubMod
    }

    if (!form.asset_tag || !form.make || !form.model || !form.serial_number || !finalModalityId || !form.description || !form.risk_priority || !form.location || !form.risk_name) {
      toast.error('Please fill all required equipment description fields')
      return
    }

    const payload = { 
      ...form, 
      next_generated_pm_date: nextInspectionDate,
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
            {mode === 'add' ? 'Add Facility Inventory' : 'View Facility Inventory'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
            {facility?.name || 'Facility'}
          </Typography>
        </Box>
        {canAddInventory && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowForm(!showForm)}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', border: '1px solid', borderRadius: '10px', fontSize: '0.75rem' }}>
            {showForm ? 'View List' : 'Add Item'}
          </Button>
        )}
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
            <Box sx={{ display: 'grid', gap: 2, mb: 2 }}>
              <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>Equipment Description</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <TextField size="small" label="Asset # *" value={form.asset_tag} onChange={e => setForm({ ...form, asset_tag: e.target.value })} />
              <TextField size="small" label="Make *" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} />
              <TextField size="small" label="Model *" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
              
              <SearchableSelect<number>
                label="Modality"
                value={selectedParentMod}
                required
                options={modalities.map(modality => ({
                  value: modality.id,
                  label: modality.name,
                  keywords: modality.description || '',
                }))}
                onChange={value => {
                  setSelectedParentMod(value)
                  setSelectedSubMod('')
                }}
                noOptionsText="No matching modalities"
              />

              {subModalities.length > 0 ? (
                <SearchableSelect<number>
                  label="Sub-Modality"
                  value={selectedSubMod}
                  required
                  options={subModalities.map((sub: any) => ({
                    value: sub.id,
                    label: sub.name,
                    keywords: sub.description || '',
                  }))}
                  onChange={setSelectedSubMod}
                  noOptionsText="No matching sub-modalities"
                />
              ) : (
                <Box /> // Empty placeholder to keep grid layout intact
              )}

              <SearchableSelect<number>
                label="Tier"
                value={form.tier_id || ''}
                options={availableTiers.map(tier => ({
                  value: tier.id,
                  label: tier.name,
                  secondary: tier.tier_code || undefined,
                  keywords: `${tier.tier_code || ''} ${tier.description || ''}`,
                }))}
                onChange={value => setForm({ ...form, tier_id: value ? Number(value) : null })}
                placeholder="Search assigned tiers..."
                noOptionsText="No matching tiers"
              />

              <Button component="label" variant="outlined" sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 800 }}>
                Default Picture
                <input hidden type="file" accept="image/*" onChange={(e) => handlePicture(e.target.files?.[0])} />
              </Button>

              <TextField size="small" label="Description *" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} sx={{ gridColumn: { md: 'span 2' } }} />
              <TextField size="small" label="Serial *" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} />
              <TextField size="small" label="Risk Priority *" value={form.risk_priority || ''} onChange={e => setForm({ ...form, risk_priority: e.target.value })} />
              <TextField size="small" label="Location *" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
              <TextField size="small" type="date" label="Date" InputLabelProps={{ shrink: true }} value={form.inventory_date || ''} onChange={e => setForm({ ...form, inventory_date: e.target.value || null })} />
              <TextField size="small" label="Risk Name *" select value={form.risk_name || 'Non-Critical'} onChange={e => setForm({ ...form, risk_name: e.target.value })}>
                <MenuItem value="Non-Critical">Non-Critical</MenuItem>
                <MenuItem value="Critical">Critical</MenuItem>
                <MenuItem value="Life Support">Life Support</MenuItem>
                <MenuItem value="High Risk">High Risk</MenuItem>
              </TextField>
              </Box>

              <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mt: 1 }}>Acquisition Authorized By</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <TextField size="small" label="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} />
                <TextField size="small" label="PO No" value={form.po_no || ''} onChange={e => setForm({ ...form, po_no: e.target.value })} />
                <TextField size="small" label="First Name" value={form.requester_first_name || ''} onChange={e => setForm({ ...form, requester_first_name: e.target.value })} />
                <TextField size="small" label="Last Name" value={form.requester_last_name || ''} onChange={e => setForm({ ...form, requester_last_name: e.target.value })} />
                <TextField size="small" label="Phone" value={form.requester_phone || ''} onChange={e => setForm({ ...form, requester_phone: formatUSPhoneInput(e.target.value) })} />
                <TextField size="small" label="Fax Number" value={form.requester_fax || ''} onChange={e => setForm({ ...form, requester_fax: formatUSPhoneInput(e.target.value) })} />
                <TextField size="small" label="Mailing Address" value={form.requester_mailing_address || ''} onChange={e => setForm({ ...form, requester_mailing_address: e.target.value })} />
                <TextField size="small" label="Email" value={form.requester_email || ''} onChange={e => setForm({ ...form, requester_email: e.target.value })} />
                <TextField size="small" label="Owning Department" value={form.owning_department || ''} onChange={e => setForm({ ...form, owning_department: e.target.value })} />
              </Box>

              <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mt: 1 }}>Acquired From</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <TextField size="small" label="Acquisition Method" select value={form.acquisition_method || 'Purchased'} onChange={e => setForm({ ...form, acquisition_method: e.target.value })}>
                  <MenuItem value="Purchased">Purchased</MenuItem>
                  <MenuItem value="Lease">Lease</MenuItem>
                  <MenuItem value="Rental">Rental</MenuItem>
                  <MenuItem value="Donation">Donation</MenuItem>
                  <MenuItem value="Transfer">Transfer</MenuItem>
                </TextField>
                <TextField size="small" label="Company Name" value={form.acquired_company_name || ''} onChange={e => setForm({ ...form, acquired_company_name: e.target.value })} />
                <TextField size="small" label="Account Number" value={form.acquired_account_number || ''} onChange={e => setForm({ ...form, acquired_account_number: e.target.value })} />
                <TextField size="small" label="Sales Person Name" value={form.acquired_sales_person || ''} onChange={e => setForm({ ...form, acquired_sales_person: e.target.value })} />
                <TextField size="small" label="Phone Number" value={form.acquired_phone || ''} onChange={e => setForm({ ...form, acquired_phone: formatUSPhoneInput(e.target.value) })} />
                <TextField size="small" label="Email" value={form.acquired_email || ''} onChange={e => setForm({ ...form, acquired_email: e.target.value })} />
                <TextField size="small" label="Mailing Address" value={form.acquired_mailing_address || ''} onChange={e => setForm({ ...form, acquired_mailing_address: e.target.value })} sx={{ gridColumn: { md: 'span 2' } }} />
              </Box>

              <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mt: 1 }}>Cost & Warranty</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <TextField size="small" type="number" label="Cost" value={form.cost || 0} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
                <TextField size="small" type="date" label="Acquisition date" InputLabelProps={{ shrink: true }} value={form.acquisition_date || ''} onChange={e => setForm({ ...form, acquisition_date: e.target.value || null })} />
                <TextField size="small" label="Capital Equipment" select value={form.capital_equipment || 'Yes'} onChange={e => setForm({ ...form, capital_equipment: e.target.value })}>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </TextField>
                <TextField size="small" label="Warranty Duration" value={form.warranty_duration || ''} onChange={e => setForm({ ...form, warranty_duration: e.target.value })} />
                <TextField size="small" label="Parts Duration" value={form.parts_duration || ''} onChange={e => setForm({ ...form, parts_duration: e.target.value })} />
                <TextField size="small" label="Labor Duration" value={form.labor_duration || ''} onChange={e => setForm({ ...form, labor_duration: e.target.value })} />
                <TextField size="small" type="date" label="Coverage Start Date" InputLabelProps={{ shrink: true }} value={form.coverage_start_date || ''} onChange={e => setForm({ ...form, coverage_start_date: e.target.value || null })} />
                <TextField size="small" label="Coverage Type" value={form.coverage_type || ''} onChange={e => setForm({ ...form, coverage_type: e.target.value })} />
                <TextField size="small" type="date" label="Part Warranty End Date" InputLabelProps={{ shrink: true }} value={form.part_warranty_end_date || ''} onChange={e => setForm({ ...form, part_warranty_end_date: e.target.value || null })} />
                <TextField size="small" type="date" label="Labor Warranty End Date" InputLabelProps={{ shrink: true }} value={form.labor_warranty_end_date || ''} onChange={e => setForm({ ...form, labor_warranty_end_date: e.target.value || null })} />
              </Box>

              <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mt: 1 }}>Service and Maintenance</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <TextField size="small" label="PM Scheduling" select value={form.pm_scheduling || 'Annual'} onChange={e => setForm({ ...form, pm_scheduling: e.target.value })}>
                  <MenuItem value="Monthly">Monthly</MenuItem>
                  <MenuItem value="Quarterly">Quarterly</MenuItem>
                  <MenuItem value="Semi-Annual">Semi-Annual</MenuItem>
                  <MenuItem value="Annual">Annual</MenuItem>
                </TextField>
                <TextField size="small" type="date" label="Installation Date" InputLabelProps={{ shrink: true }} value={form.installation_date || ''} onChange={e => setForm({ ...form, installation_date: e.target.value || null })} />
                <TextField size="small" type="date" label="Last PM Date" InputLabelProps={{ shrink: true }} value={form.last_pm_date || ''} onChange={e => setForm({ ...form, last_pm_date: e.target.value || null })} />
                <TextField size="small" type="date" label="Next Generated PM Date" InputLabelProps={{ shrink: true }} value={nextInspectionDate || ''} InputProps={{ readOnly: true }} helperText="Generated from the last PM date and selected schedule" />
                <SearchableSelect<number>
                  label="Inspection Form"
                  value={form.inspection_form_id || ''}
                  options={inspectionForms.map(inspectionForm => ({
                    value: inspectionForm.id,
                    label: inspectionForm.name,
                    secondary: inspectionForm.modality_name || 'General',
                    keywords: inspectionForm.description || '',
                  }))}
                  onChange={value => setForm({ ...form, inspection_form_id: value ? Number(value) : null })}
                  disabled={!selectedAssetModalityId}
                  helperText={selectedAssetModalityId ? 'Forms tagged to this asset type' : 'Select modality first'}
                  placeholder="Search inspection forms..."
                  noOptionsText="No matching inspection forms"
                />

              <TextField size="small" label="Status" select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
                <MenuItem value="rented">Rented</MenuItem>
                <MenuItem value="in_maintenance">In Maintenance</MenuItem>
                <MenuItem value="retired">Retired</MenuItem>
              </TextField>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => { setShowForm(false); resetForm() }} sx={{ color: '#6B7280' }}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending} sx={{ backgroundColor: '#7C3AED', '&:hover': { backgroundColor: '#6D28D9' } }}>
                {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : (editItemId ? 'Update Item' : 'Add Item')}
              </Button>
            </Box>
          </Box>
        )}

        {/* Table */}
        {!showForm && (
          <TextField
            size="small"
            placeholder="Search assets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
        )}
        <TableContainer className="list-scroll-panel">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Asset Tag</TableCell>
                <TableCell>Make / Model</TableCell>
                <TableCell>Serial #</TableCell>
                <TableCell>Tier</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <InventoryIcon sx={{ fontSize: '2.5rem', color: '#E5E7EB', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body2" color="text.secondary">No inventory items for this facility</Typography>
                  </TableCell>
                </TableRow>
              ) : items.map((item) => {
                const sc = STATUS_COLORS[item.status] || STATUS_COLORS.active
                return (
                  <TableRow key={item.id}>
                    <TableCell><ClippedTooltipText value={item.asset_tag} fontWeight={600} /></TableCell>
                    <TableCell><ClippedTooltipText value={`${item.make} ${item.model}`} /></TableCell>
                    <TableCell><ClippedTooltipText value={item.serial_number} monospace textSx={{ fontSize: '0.8rem' }} /></TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: item.tier_id ? '#7C3AED' : '#9CA3AF', fontWeight: item.tier_id ? 600 : 400 }}>
                        {tiers.find((tier) => tier.id === item.tier_id)?.name || 'No tier'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={item.status.replace('_', ' ')} size="small" sx={{ backgroundColor: sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.7rem', textTransform: 'capitalize' }} />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        endIcon={<MoreVertIcon fontSize="small" />}
                        onClick={(event) => handleActionOpen(event, item)}
                        sx={{ borderRadius: '10px', fontWeight: 800, textTransform: 'none' }}
                      >
                        Action Taken
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <Menu
        anchorEl={actionAnchor}
        open={Boolean(actionAnchor)}
        onClose={closeActionMenu}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => { if (actionItem) setViewItem(actionItem); closeActionMenu() }}>
          <ListItemIcon><VisibilityOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="View" />
        </MenuItem>
        {canEditInventory && (
          <MenuItem onClick={() => { if (actionItem) handleEditClick(actionItem); closeActionMenu() }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Edit" />
          </MenuItem>
        )}
        <MenuItem onClick={() => { if (actionItem) setServiceRequestItem(actionItem); closeActionMenu() }}>
          <ListItemIcon><BuildOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Service Request" />
        </MenuItem>
        {canEditInventory && (
          <MenuItem onClick={handleToggleActive}>
            <ListItemIcon>
              {actionItem?.status === 'active' ? <ToggleOffOutlinedIcon fontSize="small" /> : <ToggleOnOutlinedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={actionItem?.status === 'active' ? 'Mark Inactive' : 'Mark Active'} />
          </MenuItem>
        )}
        {canDeleteInventory && (
          <MenuItem onClick={() => { if (actionItem) deleteMut.mutate(actionItem.id); closeActionMenu() }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ color: '#EF4444' }} /></ListItemIcon>
            <ListItemText primary="Delete" primaryTypographyProps={{ color: '#EF4444' }} />
          </MenuItem>
        )}
      </Menu>

      <Dialog open={Boolean(viewItem)} onClose={() => setViewItem(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B', mb: 2 }}>Inventory Item</Typography>
          {viewItem && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {[
                ['Asset Tag', viewItem.asset_tag],
                ['Make / Model', `${viewItem.make} ${viewItem.model}`],
                ['Serial Number', viewItem.serial_number],
                ['Status', viewItem.status.replace('_', ' ')],
                ['Description', viewItem.description || '-'],
                ['Location', viewItem.location || '-'],
                ['Risk', viewItem.risk_name || '-'],
                ['PM Scheduling', viewItem.pm_scheduling || '-'],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 800 }}>{label}</Typography>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 700, textTransform: label === 'Status' ? 'capitalize' : 'none' }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setViewItem(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <CreateServiceRequestModal
        open={Boolean(serviceRequestItem)}
        onClose={() => setServiceRequestItem(null)}
        initialFacilityId={facility?.id}
        initialEquipmentId={serviceRequestItem?.id}
      />
    </Dialog>
  )
}

export default FacilityInventoryModal
