import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment,
  MenuItem, Skeleton, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import InventoryIcon from '@mui/icons-material/Inventory'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import LowPriorityIcon from '@mui/icons-material/LowPriority'
import MoveUpIcon from '@mui/icons-material/MoveUp'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import SearchIcon from '@mui/icons-material/Search'
import DeleteIcon from '@mui/icons-material/Delete'
import { toast } from 'react-toastify'
import { fetchFacilities } from '@/api/facilities'
import { fetchTiers } from '@/api/tiers'
import { fetchEquipment, type EquipmentItem } from '@/api/equipment'
import {
  createInventoryPart, createInventoryTransaction, deleteInventoryPart,
  fetchInventoryParts, fetchInventoryTransactions, updateInventoryPart,
  type InventoryPart, type InventoryPartPayload, type InventoryTransactionType,
} from '@/api/inventory'

const emptyPart: InventoryPartPayload = {
  facility_id: null,
  tier_id: null,
  part_number: '',
  part_type: '',
  description: '',
  make: '',
  model: '',
  unit_price: 0,
  condition: 'new',
  supplier_name: '',
  supplier_contact: '',
  supplier_email: '',
  supplier_phone: '',
  supplier_address: '',
  vendor_name: '',
  purchase_location: '',
  shipping_method: '',
  warehouse_arrival_date: null,
  default_picture_url: '',
  technical_specs: null,
  batch_number: '',
  expiry_date: null,
  serial_number: '',
  is_critical: false,
  quantity_on_hand: 0,
  reorder_level: 0,
  location: '',
  status: 'active',
}

const transactionLabels: Record<InventoryTransactionType, string> = {
  receiving: 'Receiving',
  issuance: 'Issuance',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
}

const Inventory = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [tierId, setTierId] = useState<number | ''>('')
  const [lowStock, setLowStock] = useState(false)
  const [partDialogOpen, setPartDialogOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<InventoryPart | null>(null)
  const [partForm, setPartForm] = useState<InventoryPartPayload>(emptyPart)
  const [transactionPart, setTransactionPart] = useState<InventoryPart | null>(null)
  const [historyPart, setHistoryPart] = useState<InventoryPart | null>(null)
  const [transactionForm, setTransactionForm] = useState({
    transaction_type: 'receiving' as InventoryTransactionType,
    quantity: 1,
    unit_cost: 0,
    to_facility_id: '',
    authorization_reference: '',
    authorization_details: '',
    notes: '',
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities', 'inventory-filter'],
    queryFn: () => fetchFacilities({ limit: 500 }),
  })
  const { data: tiersData } = useQuery({ queryKey: ['tiers'], queryFn: fetchTiers })
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-parts', search, facilityId, tierId, lowStock],
    queryFn: () => fetchInventoryParts({
      search: search || undefined,
      facility_id: facilityId || undefined,
      tier_id: tierId || undefined,
      low_stock: lowStock || undefined,
      limit: 500,
    }),
  })
  const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
    queryKey: ['equipment', 'inventory-module', facilityId],
    queryFn: () => fetchEquipment(facilityId || undefined),
  })

  const facilities = facilitiesData?.items ?? []
  const tiers = tiersData?.items ?? []
  const parts = data?.items ?? []
  const equipmentItems = useMemo(() => {
    const all = equipmentData?.items ?? []
    return all.filter((item: EquipmentItem) => {
      if (tierId && item.tier_id !== tierId) return false
      if (!search) return true
      const needle = search.toLowerCase()
      return [
        item.asset_tag,
        item.make,
        item.model,
        item.serial_number,
        facilities.find((f) => f.id === item.facility_id)?.name || '',
        tiers.find((t) => t.id === item.tier_id)?.name || '',
      ].some((value) => value.toLowerCase().includes(needle))
    })
  }, [equipmentData?.items, facilities, search, tierId, tiers])

  const stats = useMemo(() => {
    const totalUnits = parts.reduce((sum, p) => sum + p.quantity_on_hand, 0)
    const low = parts.filter((p) => p.quantity_on_hand <= p.reorder_level).length
    const critical = parts.filter((p) => p.is_critical).length
    const value = parts.reduce((sum, p) => sum + Number(p.unit_price) * p.quantity_on_hand, 0)
    return { totalUnits, low, critical, value }
  }, [parts])

  const resetPartForm = () => {
    setEditingPart(null)
    setPartForm({ ...emptyPart })
  }

  const createMut = useMutation({
    mutationFn: createInventoryPart,
    onSuccess: () => {
      toast.success('Part registered')
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      setPartDialogOpen(false)
      resetPartForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to register part'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<InventoryPartPayload> }) => updateInventoryPart(id, payload),
    onSuccess: () => {
      toast.success('Part updated')
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      setPartDialogOpen(false)
      resetPartForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to update part'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteInventoryPart,
    onSuccess: () => {
      toast.success('Part deleted')
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete part'),
  })

  const txnMut = useMutation({
    mutationFn: ({ partId, payload }: { partId: number; payload: any }) => createInventoryTransaction(partId, payload),
    onSuccess: () => {
      toast.success('Stock transaction recorded')
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      setTransactionPart(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to record transaction'),
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['inventory-transactions', historyPart?.id],
    queryFn: () => fetchInventoryTransactions(historyPart!.id),
    enabled: !!historyPart,
  })

  const handleOpenNew = () => {
    resetPartForm()
    setPartDialogOpen(true)
  }

  const handleOpenEdit = (part: InventoryPart) => {
    setEditingPart(part)
    setPartForm({
      facility_id: part.facility_id,
      tier_id: part.tier_id,
      part_number: part.part_number,
      part_type: part.part_type,
      description: part.description,
      make: part.make || '',
      model: part.model || '',
      unit_price: Number(part.unit_price),
      condition: part.condition,
      supplier_name: part.supplier_name || '',
      supplier_contact: part.supplier_contact || '',
      supplier_email: part.supplier_email || '',
      supplier_phone: part.supplier_phone || '',
      supplier_address: part.supplier_address || '',
      vendor_name: part.vendor_name || '',
      purchase_location: part.purchase_location || '',
      shipping_method: part.shipping_method || '',
      warehouse_arrival_date: part.warehouse_arrival_date,
      default_picture_url: part.default_picture_url || '',
      technical_specs: part.technical_specs,
      batch_number: part.batch_number || '',
      expiry_date: part.expiry_date,
      serial_number: part.serial_number || '',
      is_critical: part.is_critical,
      quantity_on_hand: part.quantity_on_hand,
      reorder_level: part.reorder_level,
      location: part.location || '',
      status: part.status,
    })
    setPartDialogOpen(true)
  }

  const handleSavePart = () => {
    if (!partForm.part_number || !partForm.part_type || !partForm.description || !partForm.condition) {
      toast.error('Part number, type, description, and condition are required')
      return
    }
    const payload = {
      ...partForm,
      facility_id: null,
      tier_id: partForm.tier_id || null,
      supplier_email: partForm.supplier_email || undefined,
      acquired_company_name: partForm.vendor_name || undefined,
      acquisition_date: partForm.acquisition_date || null,
      technical_specs: typeof partForm.technical_specs === 'string' ? null : partForm.technical_specs,
    }
    if (editingPart) updateMut.mutate({ id: editingPart.id, payload })
    else createMut.mutate(payload)
  }

  const handlePartImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPartForm((prev) => ({ ...prev, default_picture_url: String(reader.result || '') }))
    reader.readAsDataURL(file)
  }

  const handleSaveTransaction = () => {
    if (!transactionPart) return
    if (transactionForm.transaction_type === 'transfer' && !transactionForm.to_facility_id) {
      toast.error('Transfer requires a destination facility')
      return
    }
    txnMut.mutate({
      partId: transactionPart.id,
      payload: {
        transaction_type: transactionForm.transaction_type,
        quantity: Number(transactionForm.quantity),
        unit_cost: transactionForm.unit_cost ? Number(transactionForm.unit_cost) : undefined,
        to_facility_id: transactionForm.to_facility_id ? Number(transactionForm.to_facility_id) : null,
        authorization_reference: transactionForm.authorization_reference,
        authorization_details: transactionForm.authorization_details,
        notes: transactionForm.notes,
      },
    })
  }

  return (
    <Box className="page-enter">
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
            Register parts, track batches and serials, and record stock movement with full transaction history.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNew}
          sx={{ backgroundColor: '#7C3AED', borderRadius: '12px', px: 3, fontWeight: 800 }}>
          Register Part
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2, mb: 3 }}>
        {[
          ['Equipment', equipmentItems.length, <InventoryIcon />],
          ['Parts', parts.length, <InventoryIcon />],
          ['Units On Hand', stats.totalUnits, <ReceiptLongIcon />],
          ['Low Stock', stats.low, <LowPriorityIcon />],
          ['Stock Value', `$${stats.value.toFixed(2)}`, <MoveUpIcon />],
        ].map(([label, value, icon]) => (
          <Card key={label as string} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {icon}
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 800, textTransform: 'uppercase' }}>{label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#1E1B4B' }}>{value}</Typography>
            </Box>
          </Card>
        ))}
      </Box>

      <Card sx={{ overflow: 'hidden', mb: 3 }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B' }}>
            Facility Equipment Inventory
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Equipment added from each facility inventory modal appears here with its assigned tier.
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Asset Tag</TableCell>
                <TableCell>Assignment</TableCell>
                <TableCell>Make / Model</TableCell>
                <TableCell>Serial #</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {equipmentLoading ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
              )) : equipmentItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <InventoryIcon sx={{ fontSize: 40, color: '#D1D5DB', mb: 1 }} />
                    <Typography color="text.secondary">No facility equipment inventory found</Typography>
                  </TableCell>
                </TableRow>
              ) : equipmentItems.map((item) => {
                const facility = facilities.find((f) => f.id === item.facility_id)
                const tier = tiers.find((t) => t.id === item.tier_id)
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.asset_tag}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{facility?.name || `Facility #${item.facility_id}`}</Typography>
                      <Typography variant="caption" sx={{ color: tier ? '#7C3AED' : '#9CA3AF', fontWeight: tier ? 700 : 400 }}>
                        {tier?.name || 'No tier'}
                      </Typography>
                    </TableCell>
                    <TableCell>{item.make} {item.model}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{item.serial_number}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={item.status.replace('_', ' ')} size="small" sx={{ textTransform: 'capitalize', fontWeight: 700 }} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B' }}>
            Parts And Consumables
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Spare parts, consumables, stock operations, and transaction history.
          </Typography>
        </Box>
        <Box sx={{ p: 2.5, display: 'flex', gap: 2, borderBottom: '1px solid #E5E7EB', alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Search parts, serials, batches..." value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 300 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9CA3AF' }} /></InputAdornment> }}
          />
          <TextField size="small" select label="Facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value ? Number(e.target.value) : '')} sx={{ minWidth: 180 }}>
            <MenuItem value="">All Facilities</MenuItem>
            {facilities.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Tier" value={tierId} onChange={(e) => setTierId(e.target.value ? Number(e.target.value) : '')} sx={{ minWidth: 160 }}>
            <MenuItem value="">All Tiers</MenuItem>
            {tiers.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />} label="Low stock" />
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Part</TableCell>
                <TableCell>Assignment</TableCell>
                <TableCell>Batch / Serial</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>Expiry</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
              )) : parts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <InventoryIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
                    <Typography color="text.secondary">No registered parts found</Typography>
                  </TableCell>
                </TableRow>
              ) : parts.map((part) => {
                const low = part.quantity_on_hand <= part.reorder_level
                return (
                  <TableRow key={part.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{part.part_number}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{part.part_type} - {part.description}</Typography>
                      {part.is_critical && <Chip label="Critical" size="small" sx={{ ml: 1, backgroundColor: '#FEF2F2', color: '#DC2626', fontWeight: 700 }} />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{part.facility_name || 'Independent part'}</Typography>
                      <Typography variant="caption" sx={{ color: part.tier_name ? '#7C3AED' : '#9CA3AF' }}>{part.tier_name || 'No tier'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{part.batch_number || 'No batch'}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{part.serial_number || 'No serial'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{part.supplier_name || 'Unspecified'}</Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280' }}>{part.supplier_phone || part.supplier_email || ''}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={`${part.quantity_on_hand} on hand`} size="small" sx={{ backgroundColor: low ? '#FEF2F2' : '#ECFDF5', color: low ? '#DC2626' : '#059669', fontWeight: 800 }} />
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#6B7280' }}>Reorder: {part.reorder_level}</Typography>
                    </TableCell>
                    <TableCell>{part.expiry_date || '-'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Stock Operation"><IconButton onClick={() => setTransactionPart(part)} sx={{ color: '#10B981' }}><MoveUpIcon /></IconButton></Tooltip>
                      <Tooltip title="History"><IconButton onClick={() => setHistoryPart(part)} sx={{ color: '#3B82F6' }}><ReceiptLongIcon /></IconButton></Tooltip>
                      <Tooltip title="Edit"><IconButton onClick={() => handleOpenEdit(part)} sx={{ color: '#F59E0B' }}><EditIcon /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton onClick={() => deleteMut.mutate(part.id)} sx={{ color: '#EF4444' }}><DeleteIcon /></IconButton></Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={partDialogOpen} onClose={() => setPartDialogOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '14px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 800, borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editingPart ? 'Edit Part' : 'Add New Part'}
          <Button onClick={() => setPartDialogOpen(false)} variant="contained" sx={{ minWidth: 42, width: 42, height: 42, borderRadius: '8px', backgroundColor: '#4338CA' }}>
            <ArrowBackIcon />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 256px' }, gap: 3 }}>
            <Box sx={{ display: 'grid', gap: 2.25 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <TextField label="Part Number *" placeholder="Part number" value={partForm.part_number} onChange={(e) => setPartForm({ ...partForm, part_number: e.target.value })} />
                <TextField select label="Part Type *" value={partForm.part_type} onChange={(e) => setPartForm({ ...partForm, part_type: e.target.value })}>
                  <MenuItem value="">Select part type(s)</MenuItem>
                  <MenuItem value="spare_part">Spare Part</MenuItem>
                  <MenuItem value="consumable">Consumable</MenuItem>
                  <MenuItem value="critical_component">Critical Component</MenuItem>
                  <MenuItem value="accessory">Accessory</MenuItem>
                </TextField>
                <TextField label="Part Description *" placeholder="Part description" value={partForm.description} onChange={(e) => setPartForm({ ...partForm, description: e.target.value })} />
                <TextField label="Make" placeholder="Make" value={partForm.make} onChange={(e) => setPartForm({ ...partForm, make: e.target.value })} />
                <TextField label="Model" placeholder="Model" value={partForm.model} onChange={(e) => setPartForm({ ...partForm, model: e.target.value })} />
                <TextField type="number" label="Amount" placeholder="Amount" value={partForm.unit_price} onChange={(e) => setPartForm({ ...partForm, unit_price: Number(e.target.value) })} />
                <TextField label="Company" placeholder="Company Name" value={partForm.supplier_name} onChange={(e) => setPartForm({ ...partForm, supplier_name: e.target.value })} />
                <TextField label="Phone" placeholder="Phone number" value={partForm.supplier_phone} onChange={(e) => setPartForm({ ...partForm, supplier_phone: e.target.value })} />
                <TextField label="Sales Person Name" placeholder="Contact Name" value={partForm.supplier_contact} onChange={(e) => setPartForm({ ...partForm, supplier_contact: e.target.value })} />
                <TextField label="Address" placeholder="Address" value={partForm.supplier_address || ''} onChange={(e) => setPartForm({ ...partForm, supplier_address: e.target.value })} />
                <TextField label="Email" placeholder="Email" value={partForm.supplier_email} onChange={(e) => setPartForm({ ...partForm, supplier_email: e.target.value })} />
                <TextField select label="Part Condition *" value={partForm.condition} onChange={(e) => setPartForm({ ...partForm, condition: e.target.value })}>
                  <MenuItem value="">Select Condition</MenuItem>
                  <MenuItem value="new">New</MenuItem>
                  <MenuItem value="refurbished">Refurbished</MenuItem>
                  <MenuItem value="used">Used</MenuItem>
                  <MenuItem value="damaged">Damaged</MenuItem>
                </TextField>
              </Box>

              <Box>
                <Typography sx={{ color: '#1E293B', fontSize: '0.85rem', mb: 0.75 }}>Image</Typography>
                <Button component="label" variant="outlined" sx={{ borderRadius: '8px', textTransform: 'none', color: '#475569', borderColor: '#CBD5E1' }}>
                  Choose File
                  <input hidden type="file" accept="image/*" onChange={(e) => handlePartImage(e.target.files?.[0])} />
                </Button>
              </Box>

              <Typography sx={{ fontWeight: 900, color: '#1E293B', mt: 1 }}>Acquired From (Optional)</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <TextField label="Vendor Name" placeholder="Vendor Name" value={partForm.vendor_name || ''} onChange={(e) => setPartForm({ ...partForm, vendor_name: e.target.value })} />
                <TextField label="Purchase Location" placeholder="Purchase Location" value={partForm.purchase_location || ''} onChange={(e) => setPartForm({ ...partForm, purchase_location: e.target.value })} />
                <TextField label="Shipping Method" placeholder="Shipping Method" value={partForm.shipping_method || ''} onChange={(e) => setPartForm({ ...partForm, shipping_method: e.target.value })} />
                <TextField type="date" label="Purchase Date" InputLabelProps={{ shrink: true }} value={partForm.acquisition_date || ''} onChange={(e) => setPartForm({ ...partForm, acquisition_date: e.target.value || null })} />
                <TextField type="date" label="Warehouse Arrival Date" InputLabelProps={{ shrink: true }} value={partForm.warehouse_arrival_date || ''} onChange={(e) => setPartForm({ ...partForm, warehouse_arrival_date: e.target.value || null })} />
              </Box>
            </Box>

            <Box sx={{ height: 256, borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {partForm.default_picture_url ? (
                <Box component="img" src={partForm.default_picture_url} alt="Part preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageOutlinedIcon sx={{ color: '#CBD5E1', fontSize: 56 }} />
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'flex-start' }}>
          <Button variant="contained" onClick={handleSavePart} disabled={createMut.isPending || updateMut.isPending} sx={{ backgroundColor: '#4338CA', borderRadius: '8px', px: 3, fontWeight: 900 }}>
            {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : (editingPart ? 'Update Part' : 'Add Part')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!transactionPart} onClose={() => setTransactionPart(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Stock Operation</DialogTitle>
        <DialogContent sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, pt: 2 }}>
          <Alert severity="info" sx={{ gridColumn: 'span 2' }}>
            {transactionPart?.part_number}: current balance {transactionPart?.quantity_on_hand}
          </Alert>
          <TextField size="small" select label="Operation" value={transactionForm.transaction_type} onChange={(e) => setTransactionForm({ ...transactionForm, transaction_type: e.target.value as InventoryTransactionType })}>
            {Object.entries(transactionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={transactionForm.transaction_type === 'adjustment' ? 'New Balance' : 'Quantity'} value={transactionForm.quantity} onChange={(e) => setTransactionForm({ ...transactionForm, quantity: Number(e.target.value) })} />
          {transactionForm.transaction_type === 'transfer' && (
            <TextField size="small" select label="Destination Facility" value={transactionForm.to_facility_id} onChange={(e) => setTransactionForm({ ...transactionForm, to_facility_id: e.target.value })} sx={{ gridColumn: 'span 2' }}>
              {facilities.filter((f) => f.id !== transactionPart?.facility_id).map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </TextField>
          )}
          <TextField size="small" type="number" label="Unit Cost" value={transactionForm.unit_cost} onChange={(e) => setTransactionForm({ ...transactionForm, unit_cost: Number(e.target.value) })} />
          <TextField size="small" label="Authorization Ref" value={transactionForm.authorization_reference} onChange={(e) => setTransactionForm({ ...transactionForm, authorization_reference: e.target.value })} />
          <TextField size="small" label="Authorization Details" value={transactionForm.authorization_details} onChange={(e) => setTransactionForm({ ...transactionForm, authorization_details: e.target.value })} sx={{ gridColumn: 'span 2' }} />
          <TextField size="small" label="Notes" multiline rows={3} value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} sx={{ gridColumn: 'span 2' }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTransactionPart(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTransaction} disabled={txnMut.isPending}>
            {txnMut.isPending ? <CircularProgress size={18} /> : 'Record Operation'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!historyPart} onClose={() => setHistoryPart(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Transaction History</DialogTitle>
        <DialogContent>
          {historyLoading ? <Skeleton height={120} /> : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Balance</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Auth</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(historyData?.items ?? []).map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>{transactionLabels[txn.transaction_type]}</TableCell>
                    <TableCell>{txn.quantity}</TableCell>
                    <TableCell>{txn.balance_after}</TableCell>
                    <TableCell>{txn.created_by_name || `User #${txn.created_by_id}`}</TableCell>
                    <TableCell>{txn.authorization_reference || '-'}</TableCell>
                    <TableCell>{new Date(txn.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(historyData?.items ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center">No transactions yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}

export default Inventory
