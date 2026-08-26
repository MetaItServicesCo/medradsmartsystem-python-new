import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment,
  ListItemIcon, Menu, MenuItem, Skeleton, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import InventoryIcon from '@mui/icons-material/Inventory'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import LowPriorityIcon from '@mui/icons-material/LowPriority'
import MoveUpIcon from '@mui/icons-material/MoveUp'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import SearchIcon from '@mui/icons-material/Search'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import { toast } from 'react-toastify'
import { useSearchParams } from 'react-router-dom'
import { fetchFacilities } from '@/api/facilities'

import {
  createInventoryPart, createInventoryTransaction, deleteInventoryPart,
  exportInventoryPartsCsv, fetchInventoryParts, fetchInventorySummary, fetchInventoryTransactions, updateInventoryPart,
  type InventoryPart, type InventoryPartPayload, type InventoryTransactionType,
} from '@/api/inventory'
import { resolveUploadUrl } from '@/api/users'
import { useAuthStore } from '@/stores/authStore'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import ContextTableRow from '@/components/ContextTableRow'
import FacilitySearchAutocomplete from '@/components/FacilitySearchAutocomplete'
import { useListContext } from '@/contexts/ListContext'
import { formatUSPhone, formatUSPhoneInput } from '@/utils/formatters'

const PAGE_SIZE = 25
const INVENTORY_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'part_number', label: 'Part #' },
  { value: 'asset_tag', label: 'Asset tag' },
  { value: 'description', label: 'Description' },
  { value: 'make_model', label: 'Make / model' },
  { value: 'serial', label: 'Batch / serial' },
  { value: 'type', label: 'Part type' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'location', label: 'Location' },
  { value: 'condition', label: 'Condition' },
  { value: 'stock', label: 'Stock' },
  { value: 'price', label: 'Price' },
  { value: 'expiry', label: 'Expiry / inventory date' },
  { value: 'modality', label: 'Modality' },
  { value: 'status', label: 'Status' },
]

type InventoryStockView = 'all' | 'in_stock' | 'low_stock' | 'stock_value'

const INVENTORY_STOCK_VIEWS: InventoryStockView[] = ['all', 'in_stock', 'low_stock', 'stock_value']
const ACTION_MENU_PAPER = {
  sx: {
    borderRadius: '16px',
    minWidth: 190,
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

const INVENTORY_TABLE_SX = {
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

const INVENTORY_PAGINATION_SX = {
  borderTop: '1px solid #EEF0F6',
  '& .MuiTablePagination-toolbar': { minHeight: 48, px: { xs: 0.5, sm: 1 } },
  '& .MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
  '& .MuiTablePagination-displayedRows': { m: 0, fontSize: 13, fontWeight: 750, color: '#64748B' },
}

const INVENTORY_ACTION_BUTTON_SX = {
  width: 34,
  height: 34,
  borderRadius: '10px',
  bgcolor: '#F1F5F9',
  color: '#7C3AED',
  '&:hover': { bgcolor: '#EDE9FE' },
}

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
  const { focusRecord } = useListContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const isSuperAdmin = user?.role === 'superadmin'
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '')
  const requestedSearchField = searchParams.get('search_field') || 'all'
  const searchField = INVENTORY_SEARCH_FIELDS.some((field) => field.value === requestedSearchField)
    ? requestedSearchField
    : 'all'
  const requestedStockView = searchParams.get('stock_view') as InventoryStockView | null
  const stockView: InventoryStockView = requestedStockView && INVENTORY_STOCK_VIEWS.includes(requestedStockView)
    ? requestedStockView
    : 'all'
  const [page, setPage] = useState(0)
  const [partDialogOpen, setPartDialogOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<InventoryPart | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionPart, setActionPart] = useState<InventoryPart | null>(null)
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

  useEffect(() => {
    setSearch(searchParams.get('search') || '')
    setDebouncedSearch(searchParams.get('search') || '')
  }, [searchParams.get('search')])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 350)

    return () => window.clearTimeout(handle)
  }, [search])

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities', 'inventory-filter'],
    queryFn: () => fetchFacilities({ limit: 500 }),
  })
  const inventoryFilters = {
    search: debouncedSearch || undefined,
    search_field: searchField === 'all' ? undefined : searchField,
  }
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inventory-parts', debouncedSearch, searchField, stockView, page],
    queryFn: () => fetchInventoryParts({
      ...inventoryFilters,
      stock_view: stockView === 'all' ? undefined : stockView,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    placeholderData: previousData => previousData,
  })
  const { data: summaryData } = useQuery({
    queryKey: ['inventory-summary', debouncedSearch, searchField],
    queryFn: () => fetchInventorySummary(inventoryFilters),
    placeholderData: previousData => previousData,
  })
  const facilities = facilitiesData?.items ?? []
  const parts = data?.items ?? []
  const totalParts = summaryData ? Number(summaryData.total_parts) : data?.total ?? 0
  const filteredPartsTotal = data?.total ?? 0

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, searchField, stockView])

  const handleSearchFieldChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('search_field')
    else next.set('search_field', value)
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  const handleStockViewChange = (value: InventoryStockView) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('stock_view')
    else next.set('stock_view', value)
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  const stats = {
    totalUnits: summaryData ? Number(summaryData.total_units) : parts.reduce((sum, p) => sum + p.quantity_on_hand, 0),
    low: summaryData ? Number(summaryData.low_stock) : parts.filter((p) => p.quantity_on_hand <= p.reorder_level).length,
    critical: summaryData ? Number(summaryData.critical) : parts.filter((p) => p.is_critical).length,
    value: summaryData ? Number(summaryData.stock_value) : parts.reduce((sum, p) => sum + Number(p.unit_price) * p.quantity_on_hand, 0),
  }

  const resetPartForm = () => {
    setEditingPart(null)
    setPartForm({ ...emptyPart })
  }

  const createMut = useMutation({
    mutationFn: createInventoryPart,
    onSuccess: (part) => {
      toast.success('Part registered')
      focusRecord(`inventory-part-${part.id}`, part.part_number, {
        message: 'Part registered',
        pathname: '/inventory',
        query: { search: part.part_number },
      })
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
      setPartDialogOpen(false)
      resetPartForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to register part'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<InventoryPartPayload> }) => updateInventoryPart(id, payload),
    onSuccess: (part) => {
      toast.success('Part updated')
      focusRecord(`inventory-part-${part.id}`, part.part_number, {
        message: 'Part updated',
        pathname: '/inventory',
        query: { search: part.part_number },
      })
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
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
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete part'),
  })

  const txnMut = useMutation({
    mutationFn: ({ partId, payload }: { partId: number; payload: any }) => createInventoryTransaction(partId, payload),
    onSuccess: () => {
      toast.success('Stock transaction recorded')
      if (transactionPart) {
        focusRecord(`inventory-part-${transactionPart.id}`, transactionPart.part_number, {
          message: 'Stock transaction recorded',
          pathname: '/inventory',
          query: { search: transactionPart.part_number },
        })
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-parts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
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
      supplier_phone: formatUSPhoneInput(part.supplier_phone || ''),
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

  const openActions = (event: React.MouseEvent<HTMLElement>, part: InventoryPart) => {
    setActionAnchor(event.currentTarget)
    setActionPart(part)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionPart(null)
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

  const handleDownloadInventory = async () => {
    try {
      await exportInventoryPartsCsv()
      toast.success('Parts inventory download started')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to download inventory')
    }
  }

  return (
    <Box className="page-enter" sx={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, mb: 2.5, gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
            Register parts, track batches and serials, and record stock movement with full transaction history.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {isSuperAdmin && (
            <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={handleDownloadInventory}
              sx={{ minHeight: 40, borderRadius: '10px', px: 2, fontWeight: 850, whiteSpace: 'nowrap' }}>
              Download Inventory
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNew}
            sx={{ minHeight: 40, backgroundColor: '#7C3AED', borderRadius: '10px', px: 2.25, fontWeight: 850, whiteSpace: 'nowrap' }}>
            Register Part
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, md: 1.75 }, mb: 2.5 }}>
        {[
          { key: 'all' as const, label: 'Parts', value: totalParts, icon: <InventoryIcon /> },
          { key: 'in_stock' as const, label: 'Units On Hand', value: stats.totalUnits, icon: <ReceiptLongIcon /> },
          { key: 'low_stock' as const, label: 'Low Stock', value: stats.low, icon: <LowPriorityIcon /> },
          { key: 'stock_value' as const, label: 'Stock Value', value: `$${stats.value.toFixed(2)}`, icon: <MoveUpIcon /> },
        ].map((card) => (
          <Card
            key={card.key}
            role="button"
            tabIndex={0}
            aria-pressed={stockView === card.key}
            onClick={() => handleStockViewChange(card.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleStockViewChange(card.key)
              }
            }}
            sx={{
              p: { xs: 1.35, sm: 1.6, lg: 1.8 },
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.1,
              borderRadius: '16px',
              border: stockView === card.key ? '2px solid #7C3AED' : '1px solid #EEF0F6',
              boxShadow: stockView === card.key ? '0 14px 34px rgba(124,58,237,0.16)' : 'none',
              cursor: 'pointer',
              transform: stockView === card.key ? 'translateY(-2px)' : 'none',
              transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
              '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 16px 38px rgba(124,58,237,0.14)' },
              '&:focus-visible': { outline: '3px solid rgba(124,58,237,0.24)', outlineOffset: 2 },
            }}
          >
            <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '12px', backgroundColor: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {card.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap title={card.label} sx={{ color: '#6B7280', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>{card.label}</Typography>
              <Typography noWrap title={String(card.value)} sx={{ fontSize: { xs: 20, lg: 22 }, lineHeight: 1.2, fontWeight: 900, color: '#1E1B4B' }}>{card.value}</Typography>
            </Box>
          </Card>
        ))}
      </Box>

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Box sx={{ p: { xs: 2, md: 2.5 }, borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E1B4B' }}>
            Parts And Consumables
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            Spare parts, consumables, stock operations, and transaction history.
          </Typography>
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(220px, 1fr)', lg: '180px minmax(320px, 1fr) auto' }, gap: 1, borderBottom: '1px solid #E5E7EB', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0 }}><SearchFieldSelect
              value={searchField}
              options={INVENTORY_SEARCH_FIELDS}
              onChange={handleSearchFieldChange}
              ariaLabel="Inventory search field"
            /></Box>
          <TextField size="small" placeholder={`Search ${INVENTORY_SEARCH_FIELDS.find((field) => field.value === searchField)?.label.toLowerCase() || 'inventory'}...`} value={search} onChange={(e) => setSearch(e.target.value)}
            fullWidth sx={{ minWidth: 0 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9CA3AF' }} /></InputAdornment> }}
          />
          {isFetching && !isLoading && (
            <CircularProgress size={18} thickness={5} sx={{ color: '#7C3AED' }} />
          )}
        </Box>

        <TableContainer className="list-scroll-panel">
          <Table stickyHeader sx={{ ...INVENTORY_TABLE_SX, minWidth: { xs: 820, lg: 1040 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 300 }}>Part</TableCell>
                <TableCell sx={{ width: 170 }}>Part Details</TableCell>
                <TableCell sx={{ width: 175 }}>Batch / Serial</TableCell>
                <TableCell sx={{ width: 190 }}>Supplier</TableCell>
                <TableCell sx={{ width: 135 }}>Stock</TableCell>
                <TableCell sx={{ width: 115 }}>Expiry</TableCell>
                <TableCell align="right" sx={{ width: 62 }}>Actions</TableCell>
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
                  <ContextTableRow
                    key={part.id}
                    recordKey={`inventory-part-${part.id}`}
                    recordLabel={part.part_number}
                    hover
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
                        <Avatar
                          src={resolveUploadUrl(part.default_picture_url)}
                          variant="rounded"
                          sx={{ width: 42, height: 42, flexShrink: 0, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '11px' }}
                        >
                          <InventoryIcon fontSize="small" />
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
                            <ClippedTooltipText value={part.part_number} fontWeight={850} />
                            {part.is_critical && <Chip label="Critical" size="small" sx={{ height: 22, flexShrink: 0, borderRadius: '7px', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: 10, fontWeight: 850, '& .MuiChip-label': { px: 0.8 } }} />}
                          </Box>
                          <ClippedTooltipText value={`${part.part_type} - ${part.description}`} variant="caption" color="#6B7280" fontWeight={550} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <ClippedTooltipText value={[part.make, part.model].filter(Boolean).join(' ') || part.condition || 'Unspecified'} />
                      <ClippedTooltipText value={part.location || part.modality_name || 'No location'} variant="caption" color="#6B7280" fontWeight={500} />
                    </TableCell>
                    <TableCell>
                      <ClippedTooltipText value={part.batch_number || 'No batch'} />
                      <ClippedTooltipText value={part.serial_number || 'No serial'} variant="caption" color="#6B7280" fontWeight={500} />
                    </TableCell>
                    <TableCell>
                      <ClippedTooltipText value={part.supplier_name || 'Unspecified'} />
                      <ClippedTooltipText value={part.supplier_phone ? formatUSPhone(part.supplier_phone) : part.supplier_email || ''} variant="caption" color="#6B7280" fontWeight={500} />
                    </TableCell>
                    <TableCell>
                      <Chip label={`${part.quantity_on_hand} on hand`} size="small" title={`${part.quantity_on_hand} on hand`} sx={{ height: 26, maxWidth: 120, borderRadius: '8px', backgroundColor: low ? '#FEF2F2' : '#ECFDF5', color: low ? '#DC2626' : '#059669', fontSize: 11, fontWeight: 900, '& .MuiChip-label': { px: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#6B7280' }}>Reorder: {part.reorder_level}</Typography>
                    </TableCell>
                    <TableCell>{part.expiry_date || '-'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Actions" arrow>
                        <IconButton
                          size="small"
                          aria-label={`Actions for ${part.part_number}`}
                          onClick={(event) => openActions(event, part)}
                          sx={INVENTORY_ACTION_BUTTON_SX}
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
        <TablePagination
          component="div"
          count={filteredPartsTotal}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
          sx={INVENTORY_PAGINATION_SX}
        />
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
        {actionPart && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { setTransactionPart(actionPart); closeActions() }}>
            <ListItemIcon><MoveUpIcon fontSize="small" sx={{ color: '#10B981' }} /></ListItemIcon>
            Stock Operation
          </MenuItem>
        )}
        {actionPart && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { setHistoryPart(actionPart); closeActions() }}>
            <ListItemIcon><ReceiptLongIcon fontSize="small" sx={{ color: '#3B82F6' }} /></ListItemIcon>
            History
          </MenuItem>
        )}
        {actionPart && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { handleOpenEdit(actionPart); closeActions() }}>
            <ListItemIcon><EditIcon fontSize="small" sx={{ color: '#F59E0B' }} /></ListItemIcon>
            Edit
          </MenuItem>
        )}
        {actionPart && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { deleteMut.mutate(actionPart.id); closeActions() }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: '#EF4444' }} /></ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>

      <Dialog
        open={partDialogOpen}
        onClose={() => setPartDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: '22px' },
            overflow: 'hidden',
            maxHeight: { xs: '100dvh', sm: 'calc(100dvh - 48px)' },
            backgroundColor: '#F8FAFC',
            boxShadow: '0 28px 80px rgba(30, 27, 75, 0.22)',
          },
        }}
      >
        <DialogTitle sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: '1px solid #E5E7EB', bgcolor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, color: '#1E1B4B', fontSize: { xs: 20, sm: 24 }, lineHeight: 1.2 }}>
              {editingPart ? 'Edit Part' : 'Add New Part'}
            </Typography>
            <Typography sx={{ mt: 0.4, color: '#64748B', fontSize: 13, fontWeight: 600 }}>
              Product details, supplier information, acquisition history, and imagery.
            </Typography>
          </Box>
          <IconButton aria-label="Close add part dialog" onClick={() => setPartDialogOpen(false)} sx={{ flexShrink: 0, width: 42, height: 42, color: '#4F46E5', bgcolor: '#EEF2FF', '&:hover': { bgcolor: '#E0E7FF' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1.5, sm: 2.5 }, bgcolor: '#F8FAFC' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 260px' }, gap: 2, alignItems: 'start', '& .MuiInputBase-root:not(.MuiInputBase-multiline)': { minHeight: 44 }, '& .MuiOutlinedInput-input:not(textarea)': { py: 1.25 } }}>
            <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
                  <Avatar sx={{ width: 34, height: 34, bgcolor: '#EEF2FF', color: '#4F46E5' }}><InventoryIcon fontSize="small" /></Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Part Information</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: 12 }}>Core product identity, classification, condition, and pricing.</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                <TextField label="Part Number *" placeholder="Part number" value={partForm.part_number} onChange={(e) => setPartForm({ ...partForm, part_number: e.target.value })} />
                <TextField select label="Part Type *" value={partForm.part_type} onChange={(e) => setPartForm({ ...partForm, part_type: e.target.value })}>
                  <MenuItem value="">Select part type</MenuItem>
                  <MenuItem value="sales">Sales</MenuItem>
                  <MenuItem value="rental">Rental</MenuItem>
                </TextField>
                <TextField label="Part Description *" placeholder="Part description" value={partForm.description} onChange={(e) => setPartForm({ ...partForm, description: e.target.value })} sx={{ gridColumn: { sm: '1 / -1', md: 'auto' } }} />
                <TextField label="Make" placeholder="Make" value={partForm.make} onChange={(e) => setPartForm({ ...partForm, make: e.target.value })} />
                <TextField label="Model" placeholder="Model" value={partForm.model} onChange={(e) => setPartForm({ ...partForm, model: e.target.value })} />
                <TextField type="number" label="Amount" placeholder="Amount" value={partForm.unit_price} onChange={(e) => setPartForm({ ...partForm, unit_price: Number(e.target.value) })} />
                <TextField select label="Part Condition *" value={partForm.condition} onChange={(e) => setPartForm({ ...partForm, condition: e.target.value })}>
                  <MenuItem value="">Select Condition</MenuItem>
                  <MenuItem value="new">New</MenuItem>
                  <MenuItem value="refurbished">Refurbished</MenuItem>
                  <MenuItem value="used">Used</MenuItem>
                  <MenuItem value="damaged">Damaged</MenuItem>
                </TextField>
                </Box>
              </Box>

              <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.35 }}>Supplier &amp; Contact</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.75 }}>Company and primary sales contact for this part.</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                <TextField label="Company" placeholder="Company Name" value={partForm.supplier_name} onChange={(e) => setPartForm({ ...partForm, supplier_name: e.target.value })} />
                <TextField label="Sales Person Name" placeholder="Contact Name" value={partForm.supplier_contact} onChange={(e) => setPartForm({ ...partForm, supplier_contact: e.target.value })} />
                <TextField label="Phone" placeholder="Phone number" value={partForm.supplier_phone} onChange={(e) => setPartForm({ ...partForm, supplier_phone: formatUSPhoneInput(e.target.value) })} />
                <TextField label="Email" placeholder="Email" value={partForm.supplier_email} onChange={(e) => setPartForm({ ...partForm, supplier_email: e.target.value })} />
                <TextField label="Address" placeholder="Address" value={partForm.supplier_address || ''} onChange={(e) => setPartForm({ ...partForm, supplier_address: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
                </Box>
              </Box>

              <Box sx={{ p: { xs: 1.5, sm: 2 }, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF' }}>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.35 }}>Acquired From <Box component="span" sx={{ color: '#94A3B8', fontWeight: 700 }}>(Optional)</Box></Typography>
                <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.75 }}>Purchase source, shipment method, and receiving dates.</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
                <TextField label="Vendor Name" placeholder="Vendor Name" value={partForm.vendor_name || ''} onChange={(e) => setPartForm({ ...partForm, vendor_name: e.target.value })} />
                <TextField label="Purchase Location" placeholder="Purchase Location" value={partForm.purchase_location || ''} onChange={(e) => setPartForm({ ...partForm, purchase_location: e.target.value })} />
                <TextField label="Shipping Method" placeholder="Shipping Method" value={partForm.shipping_method || ''} onChange={(e) => setPartForm({ ...partForm, shipping_method: e.target.value })} />
                <TextField type="date" label="Purchase Date" InputLabelProps={{ shrink: true }} value={partForm.acquisition_date || ''} onChange={(e) => setPartForm({ ...partForm, acquisition_date: e.target.value || null })} />
                <TextField type="date" label="Warehouse Arrival Date" InputLabelProps={{ shrink: true }} value={partForm.warehouse_arrival_date || ''} onChange={(e) => setPartForm({ ...partForm, warehouse_arrival_date: e.target.value || null })} />
                </Box>
              </Box>
            </Box>

            <Box sx={{ p: 1.5, border: '1px solid #E5E7EB', borderRadius: '16px', bgcolor: '#FFFFFF', position: { lg: 'sticky' }, top: { lg: 0 } }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Part Image</Typography>
              <Box sx={{ height: { xs: 220, lg: 250 }, borderRadius: '12px', border: '1px dashed #C7D2FE', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {partForm.default_picture_url ? (
                  <Box component="img" src={partForm.default_picture_url} alt="Part preview" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Box sx={{ textAlign: 'center', color: '#94A3B8' }}>
                    <ImageOutlinedIcon sx={{ fontSize: 54 }} />
                    <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 700 }}>No image selected</Typography>
                  </Box>
                )}
              </Box>
              <Button fullWidth component="label" variant="outlined" startIcon={<ImageOutlinedIcon />} sx={{ mt: 1.25, minHeight: 42, borderRadius: '10px', textTransform: 'none', fontWeight: 800, color: '#4F46E5', borderColor: '#C7D2FE' }}>
                {partForm.default_picture_url ? 'Replace Image' : 'Choose Image'}
                <input hidden type="file" accept="image/*" onChange={(e) => handlePartImage(e.target.files?.[0])} />
              </Button>
              <Typography sx={{ mt: 1, color: '#94A3B8', fontSize: 11, textAlign: 'center' }}>Use a clear product photo for Sales and Rental lists.</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, md: 3 }, py: 1.75, justifyContent: 'flex-end', gap: 1, borderTop: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
          <Button onClick={() => setPartDialogOpen(false)} sx={{ color: '#64748B', fontWeight: 800, borderRadius: '10px' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePart} disabled={createMut.isPending || updateMut.isPending} sx={{ minHeight: 42, background: 'linear-gradient(135deg, #4F46E5 0%, #9333EA 100%)', borderRadius: '10px', px: 3, fontWeight: 900 }}>
            {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : (editingPart ? 'Update Part' : 'Add Part')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!transactionPart} onClose={() => setTransactionPart(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Stock Operation</DialogTitle>
        <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, pt: 2 }}>
          <Alert severity="info" sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }}>
            {transactionPart?.part_number}: current balance {transactionPart?.quantity_on_hand}
          </Alert>
          <TextField size="small" select label="Operation" value={transactionForm.transaction_type} onChange={(e) => setTransactionForm({ ...transactionForm, transaction_type: e.target.value as InventoryTransactionType })}>
            {Object.entries(transactionLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={transactionForm.transaction_type === 'adjustment' ? 'New Balance' : 'Quantity'} value={transactionForm.quantity} onChange={(e) => setTransactionForm({ ...transactionForm, quantity: Number(e.target.value) })} />
          {transactionForm.transaction_type === 'transfer' && (
            <FacilitySearchAutocomplete
              label="Destination Facility"
              value={transactionForm.to_facility_id ? Number(transactionForm.to_facility_id) : ''}
              enabled={Boolean(transactionPart)}
              excludeIds={transactionPart?.facility_id ? [transactionPart.facility_id] : []}
              selectedFacility={facilities.find(facility => facility.id === Number(transactionForm.to_facility_id))}
              onChange={facilityId => setTransactionForm({ ...transactionForm, to_facility_id: String(facilityId || '') })}
              required
              sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }}
            />
          )}
          <TextField size="small" type="number" label="Unit Cost" value={transactionForm.unit_cost} onChange={(e) => setTransactionForm({ ...transactionForm, unit_cost: Number(e.target.value) })} />
          <TextField size="small" label="Authorization Ref" value={transactionForm.authorization_reference} onChange={(e) => setTransactionForm({ ...transactionForm, authorization_reference: e.target.value })} />
          <TextField size="small" label="Authorization Details" value={transactionForm.authorization_details} onChange={(e) => setTransactionForm({ ...transactionForm, authorization_details: e.target.value })} sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }} />
          <TextField size="small" label="Notes" multiline rows={3} value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }} />
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
            <Table size="small" sx={{ ...INVENTORY_TABLE_SX, minWidth: 720 }}>
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
                  <ContextTableRow
                    key={txn.id}
                    recordKey={`inventory-transaction-${txn.id}`}
                    recordLabel={`${txn.transaction_type} · ${txn.quantity}`}
                  >
                    <TableCell>{transactionLabels[txn.transaction_type]}</TableCell>
                    <TableCell>{txn.quantity}</TableCell>
                    <TableCell>{txn.balance_after}</TableCell>
                    <TableCell>{txn.created_by_name || `User #${txn.created_by_id}`}</TableCell>
                    <TableCell>{txn.authorization_reference || '-'}</TableCell>
                    <TableCell>{new Date(txn.created_at).toLocaleString()}</TableCell>
                  </ContextTableRow>
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
