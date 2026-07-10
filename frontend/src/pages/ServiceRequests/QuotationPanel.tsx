import { useState } from 'react'
import { NumericField } from '../../components/NumericField'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Card, Typography, Button, TextField, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
  FormControl, InputLabel, Select, MenuItem, CircularProgress,
  Collapse, Table, TableBody, TableCell, TableHead, TableRow,
  Radio, RadioGroup, FormControlLabel, FormLabel, Autocomplete,
} from '@mui/material'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PaymentIcon from '@mui/icons-material/Payment'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast } from 'react-toastify'

import {
  createServiceRequestQuotation,
  updateServiceRequestQuotation,
  deleteServiceRequestQuotation,
  createQuotationPayment,
  type ServiceRequestQuotation,
  type LineItemCreate,
  type QuotationPaymentCreate,
} from '@/api/serviceRequests'
import { fetchInventoryParts, type InventoryPart } from '@/api/inventory'

interface Props {
  serviceRequestId: number
  quotations: ServiceRequestQuotation[]
  isCompleted: boolean
  isCancelled: boolean
  canEdit: boolean
  queryKey: any[]
}

const EMPTY_LINE_ITEM: LineItemCreate = {
  item_type: 'part', description: '', quantity: 1, unit_price: 0, total: 0,
}

const PART_OPTION_PAGE_SIZE = 50
type LineItemForm = LineItemCreate & { inventory_part_id?: number | null }

const STATUS_CHIP: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#FEF3C7', color: '#B45309' },
  sent: { bg: '#DBEAFE', color: '#1D4ED8' },
  approved: { bg: '#D1FAE5', color: '#047857' },
  rejected: { bg: '#FEE2E2', color: '#DC2626' },
  paid: { bg: '#E0E7FF', color: '#4338CA' },
}

const QuotationPanel = ({ serviceRequestId, quotations, isCompleted, isCancelled, canEdit, queryKey }: Props) => {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editQuotationId, setEditQuotationId] = useState<number | null>(null)
  const [payOpen, setPayOpen] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Create/Edit form state
  const [description, setDescription] = useState('')
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...EMPTY_LINE_ITEM }])
  const [partSearch, setPartSearch] = useState('')
  const [selectedPartsByLine, setSelectedPartsByLine] = useState<Record<number, InventoryPart | null>>({})

  // Payment form state
  const [payMethod, setPayMethod] = useState<'credit_card' | 'ach' | 'mbmts_ach'>('credit_card')
  const [payAmount, setPayAmount] = useState('')

  const [payNotes, setPayNotes] = useState('')
  const [payBankName, setPayBankName] = useState('')
  const [payAcctLast4, setPayAcctLast4] = useState('')
  const [payRoutingLast4, setPayRoutingLast4] = useState('')
  // Credit Card
  const [ccName, setCcName] = useState('')
  const [ccNumber, setCcNumber] = useState('')
  const [ccExpiry, setCcExpiry] = useState('')
  const [ccCvv, setCcCvv] = useState('')

  // ACH sub-choice
  const [achChoice, setAchChoice] = useState<'ach' | 'mbmts_ach'>('ach')

  const {
    data: inventoryPartsData,
    fetchNextPage: fetchNextPartPage,
    hasNextPage: hasNextPartPage,
    isFetchingNextPage: isFetchingNextPartPage,
    isLoading: inventoryPartsLoading,
  } = useInfiniteQuery({
    queryKey: ['inventory-parts', 'service-quotation-options', partSearch],
    queryFn: ({ pageParam }) => fetchInventoryParts({
      search: partSearch || undefined,
      skip: Number(pageParam || 0),
      limit: PART_OPTION_PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: createOpen,
  })

  const inventoryPartOptions = inventoryPartsData?.pages.flatMap((page) => page.items) || []

  const createMut = useMutation({
    mutationFn: (data: { description: string; line_items: LineItemCreate[] }) =>
      createServiceRequestQuotation(serviceRequestId, data),
    onSuccess: () => { toast.success('Quotation created'); queryClient.invalidateQueries({ queryKey }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateServiceRequestQuotation(id, data),
    onSuccess: () => { toast.success('Quotation updated'); queryClient.invalidateQueries({ queryKey }); resetForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteServiceRequestQuotation(id),
    onSuccess: () => { toast.success('Quotation deleted'); queryClient.invalidateQueries({ queryKey }) },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const payMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: QuotationPaymentCreate }) => createQuotationPayment(id, data),
    onSuccess: () => { toast.success('Payment recorded'); queryClient.invalidateQueries({ queryKey }); setPayOpen(null); resetPayForm() },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed'),
  })

  const resetForm = () => {
    setCreateOpen(false); setEditQuotationId(null)
    setDescription(''); setLineItems([{ ...EMPTY_LINE_ITEM }])
    setSelectedPartsByLine({})
    setPartSearch('')
  }

  const resetPayForm = () => {
    setPayMethod('credit_card'); setPayAmount(''); setPayNotes('')
    setPayBankName(''); setPayAcctLast4(''); setPayRoutingLast4('')
    setCcName(''); setCcNumber(''); setCcExpiry(''); setCcCvv('')
    setAchChoice('ach')
  }

  const openEdit = (q: ServiceRequestQuotation) => {
    setEditQuotationId(q.id)
    setDescription(q.description)
    setLineItems(q.line_items?.length ? q.line_items.map(li => ({
      item_type: li.item_type, description: li.description,
      quantity: Number(li.quantity), unit_price: Number(li.unit_price), total: Number(li.total),
    })) : [{ ...EMPTY_LINE_ITEM }])
    setSelectedPartsByLine({})
    setPartSearch('')
    setCreateOpen(true)
  }

  const updateLineItem = (idx: number, field: keyof LineItemForm, value: any) => {
    const items = [...lineItems]
    ;(items[idx] as any)[field] = value
    if (field === 'item_type' && value !== 'part') {
      items[idx].inventory_part_id = null
      setSelectedPartsByLine(prev => ({ ...prev, [idx]: null }))
    }
    if (field === 'quantity' || field === 'unit_price') {
      items[idx].total = Number(items[idx].quantity) * Number(items[idx].unit_price)
    }
    setLineItems(items)
  }

  const handleSelectInventoryPart = (idx: number, part: InventoryPart | null) => {
    setSelectedPartsByLine(prev => ({ ...prev, [idx]: part }))
    if (!part) {
      updateLineItem(idx, 'inventory_part_id', null)
      return
    }
    const quantity = Number(lineItems[idx]?.quantity || 1)
    const unitPrice = Number(part.unit_price || 0)
    const descriptionParts = [
      part.part_number,
      part.description || part.part_type,
      [part.make, part.model].filter(Boolean).join(' '),
      part.serial_number ? `SN: ${part.serial_number}` : '',
    ].filter(Boolean)
    const items = [...lineItems]
    items[idx] = {
      ...items[idx],
      item_type: 'part',
      inventory_part_id: part.id,
      description: descriptionParts.join(' - '),
      unit_price: unitPrice,
      total: quantity * unitPrice,
    }
    setLineItems(items)
  }

  const handleSubmit = () => {
    if (!description.trim()) { toast.warning('Add a description'); return }
    const validItems: LineItemCreate[] = lineItems
      .filter(li => li.description.trim() && li.total > 0)
      .map(({ item_type, description, quantity, unit_price, total }) => ({ item_type, description, quantity, unit_price, total }))
    if (editQuotationId) {
      updateMut.mutate({ id: editQuotationId, data: { description, line_items: validItems } })
    } else {
      createMut.mutate({ description, line_items: validItems })
    }
  }

  const handlePay = (quotationId: number) => {
    const actualMethod = payMethod === 'ach' ? achChoice : payMethod
    const data: QuotationPaymentCreate = {
      payment_method: actualMethod as any,
      amount: parseFloat(payAmount),
      notes: payNotes || undefined,
    }
    if (actualMethod === 'credit_card') {
      const cardDigits = ccNumber.replace(/\s/g, '')
      data.account_last_four = cardDigits.slice(-4) || undefined
      data.bank_name = ccName || undefined
    }
    if (actualMethod === 'ach') {
      data.bank_name = payBankName || undefined
      data.account_last_four = payAcctLast4 || undefined
      data.routing_number_last_four = payRoutingLast4 || undefined
    }
    if (actualMethod === 'mbmts_ach') {
      data.mbmts_account_name = 'Mr. Biomed Tech Services'
      data.mbmts_routing_number = '111000614'
      data.mbmts_account_number = '818388071'
      data.mbmts_bank_name = 'Chase Business Banking'
      data.mbmts_bank_address = '555 N. 5th Street Suite 109B, Garland, TX 75040'
    }
    payMut.mutate({ id: quotationId, data })
  }

  const canCreate = canEdit && !isCompleted
  const canModify = canEdit && !isCompleted

  const cardSx = { p: 3, border: '1px solid rgba(124,58,237,0.15)' }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RequestQuoteIcon sx={{ color: '#7C3AED' }} />
          <Typography sx={{ fontWeight: 700, color: '#1E1B4B', fontSize: '1.1rem' }}>
            Quotations ({quotations.length})
          </Typography>
        </Box>
        {canCreate && (
          <Button size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => { resetForm(); setCreateOpen(true) }}
            sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)', borderRadius: '10px', fontWeight: 700, textTransform: 'none' }}>
            New Quotation
          </Button>
        )}
      </Box>

      {/* Quotation Cards */}
      {quotations.length === 0 ? (
        <Card sx={{ ...cardSx, textAlign: 'center', py: 4 }}>
          <Typography sx={{ color: '#9CA3AF', fontWeight: 500 }}>No quotations yet</Typography>
        </Card>
      ) : quotations.map(q => {
        const sc = STATUS_CHIP[q.status] || STATUS_CHIP.draft
        const isExpanded = expandedId === q.id
        return (
          <Card key={q.id} sx={cardSx}>
            {/* Quotation header row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontFamily: 'monospace', color: '#4F46E5', fontSize: '0.85rem' }}>
                  {q.quotation_number || `Q-${q.id}`}
                </Typography>
                <Chip label={q.status} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.7rem' }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {canModify && (
                  <>
                    <IconButton size="small" onClick={() => openEdit(q)} sx={{ color: '#7C3AED' }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { if (window.confirm('Delete this quotation?')) deleteMut.mutate(q.id) }} sx={{ color: '#EF4444' }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </>
                )}
                <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : q.id)}>
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>
            </Box>

            <Typography sx={{ color: '#374151', fontSize: '0.85rem', mb: 1 }}>{q.description}</Typography>
            <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '1.15rem' }}>
              ${Number(q.amount).toFixed(2)}
            </Typography>

            {/* Payments summary */}
            {q.payments?.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {q.payments.map(p => (
                  <Chip key={p.id} size="small" icon={<CheckCircleIcon sx={{ fontSize: '0.85rem' }} />}
                    label={`${p.payment_method.replace('_', ' ').toUpperCase()} - $${Number(p.amount).toFixed(2)}`}
                    sx={{ bgcolor: '#D1FAE5', color: '#047857', fontWeight: 600, fontSize: '0.7rem' }} />
                ))}
              </Box>
            )}

            {/* Expanded line items */}
            <Collapse in={isExpanded}>
              {q.line_items?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Divider sx={{ mb: 1.5 }} />
                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', mb: 1 }}>Line Items</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Qty</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Unit Price</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {q.line_items.map((li, i) => (
                        <TableRow key={li.id || i}>
                          <TableCell><Chip label={li.item_type} size="small" sx={{ fontSize: '0.7rem', fontWeight: 600 }} /></TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{li.description}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(li.quantity)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>${Number(li.unit_price).toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700 }}>${Number(li.total).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
              
              {q.revision_history && q.revision_history.length > 0 && (
                <Box sx={{ mt: 2, p: 2, bgcolor: '#F9FAFB', borderRadius: '8px' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', mb: 1 }}>Revision History</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {q.revision_history.map((rev, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', pb: 1, borderBottom: i < q.revision_history!.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
                        <Box>
                          <Typography sx={{ fontWeight: 600, color: '#374151', fontSize: '0.75rem' }}>{new Date(rev.timestamp).toLocaleString()}</Typography>
                          <Typography sx={{ color: '#6B7280', fontSize: '0.75rem' }}>by {rev.user}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography sx={{ color: '#9CA3AF', textDecoration: 'line-through', fontSize: '0.75rem' }}>${Number(rev.old_amount).toFixed(2)}</Typography>
                          <Typography sx={{ fontWeight: 700, color: rev.difference > 0 ? '#10B981' : '#EF4444' }}>
                            ${Number(rev.new_amount).toFixed(2)} ({rev.difference > 0 ? '+' : ''}${Number(rev.difference).toFixed(2)})
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Collapse>
          </Card>
        )
      })}

      {/* ── Create/Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onClose={resetForm} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>
          {editQuotationId ? 'Edit Quotation' : 'Create Quotation'}
        </DialogTitle>
        <DialogContent>
          <TextField label="Description" multiline rows={2} fullWidth value={description} onChange={e => setDescription(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1 }}>Line Items</Typography>
          {lineItems.map((li, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Type</InputLabel>
                <Select value={li.item_type} label="Type" onChange={e => updateLineItem(idx, 'item_type', e.target.value)}>
                  <MenuItem value="part">Part</MenuItem>
                  <MenuItem value="labor">Labor</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
              {li.item_type === 'part' && (
                <Autocomplete
                  size="small"
                  options={inventoryPartOptions}
                  value={selectedPartsByLine[idx] || null}
                  inputValue={partSearch}
                  onInputChange={(_, value, reason) => {
                    if (reason !== 'reset') setPartSearch(value)
                  }}
                  onChange={(_, value) => handleSelectInventoryPart(idx, value)}
                  filterOptions={(options) => options}
                  loading={inventoryPartsLoading || isFetchingNextPartPage}
                  getOptionLabel={(option) => `${option.part_number}${option.description ? ` - ${option.description}` : ''}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  ListboxProps={{
                    style: { maxHeight: 320, overflow: 'auto' },
                    onScroll: (event) => {
                      const listbox = event.currentTarget
                      const nearBottom = listbox.scrollTop + listbox.clientHeight >= listbox.scrollHeight - 40
                      if (nearBottom && hasNextPartPage && !isFetchingNextPartPage) {
                        fetchNextPartPage()
                      }
                    },
                  }}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{option.part_number}</Typography>
                        <Typography variant="caption" sx={{ color: '#6B7280' }}>
                          {[option.description, option.make, option.model, option.serial_number].filter(Boolean).join(' / ') || 'No details'}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: '#7C3AED', fontWeight: 700 }}>
                          ${Number(option.unit_price || 0).toFixed(2)}
                          {option.facility_name ? ` · ${option.facility_name}` : ''}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Inventory Part" placeholder="Search parts list..." />
                  )}
                  sx={{ flex: '1 1 260px', minWidth: 240 }}
                />
              )}
              <TextField size="small" label="Description" value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} sx={{ flex: 2 }} />
              <NumericField size="small" label="Qty" value={li.quantity} onChange={val => updateLineItem(idx, 'quantity', val)} sx={{ width: 80 }} inputProps={{ min: 0, step: 0.5 }} />
              <NumericField size="small" label="Unit $" value={li.unit_price} onChange={val => updateLineItem(idx, 'unit_price', val)} sx={{ width: 100 }} inputProps={{ min: 0, step: 0.01 }} />
              <Typography sx={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>${li.total.toFixed(2)}</Typography>
              <IconButton size="small" color="error" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} disabled={lineItems.length === 1}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setLineItems([...lineItems, { ...EMPTY_LINE_ITEM }])} sx={{ mt: 0.5, textTransform: 'none', color: '#7C3AED' }}>
            Add Line Item
          </Button>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontWeight: 800, textAlign: 'right', fontSize: '1.1rem' }}>
            Total: ${lineItems.reduce((s, li) => s + li.total, 0).toFixed(2)}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={resetForm} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={createMut.isPending || updateMut.isPending}
            sx={{ borderRadius: '10px', background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)', fontWeight: 700 }}>
            {(createMut.isPending || updateMut.isPending) ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : editQuotationId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Payment Dialog ───────────────────────────────────────────── */}
      <Dialog open={payOpen !== null} onClose={() => { setPayOpen(null); resetPayForm() }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>Record Payment</DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 1, mb: 2 }}>
            <FormLabel sx={{ fontWeight: 600, mb: 1 }}>Payment Method</FormLabel>
            <RadioGroup row value={payMethod} onChange={e => { setPayMethod(e.target.value as any); setAchChoice('ach') }}>
              <FormControlLabel value="credit_card" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CreditCardIcon fontSize="small" /> Credit Card</Box>} />
              <FormControlLabel value="ach" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AccountBalanceIcon fontSize="small" /> ACH</Box>} />
            </RadioGroup>
          </FormControl>

          {/* ACH sub-options */}
          {payMethod === 'ach' && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#F5F3FF', borderRadius: '12px' }}>
              <FormLabel sx={{ fontWeight: 600, fontSize: '0.85rem' }}>ACH Option</FormLabel>
              <RadioGroup value={achChoice} onChange={e => setAchChoice(e.target.value as any)}>
                <FormControlLabel value="ach" control={<Radio size="small" />} label="Pay through ACH" />
                <FormControlLabel value="mbmts_ach" control={<Radio size="small" />} label="Pay through MBMTS ACH" />
              </RadioGroup>
            </Box>
          )}

          <TextField label="Amount ($)" type="number" fullWidth value={payAmount} onChange={e => setPayAmount(e.target.value)} sx={{ mb: 2 }} inputProps={{ min: 0, step: 0.01 }} />
          <TextField label="Notes" multiline rows={2} fullWidth value={payNotes} onChange={e => setPayNotes(e.target.value)} sx={{ mb: 2 }} />

          {/* Credit Card fields */}
          {payMethod === 'credit_card' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, bgcolor: '#EFF6FF', borderRadius: '12px', border: '1px solid rgba(29,78,216,0.12)' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1D4ED8' }}>Credit Card Details</Typography>
              <TextField size="small" label="Cardholder Name" value={ccName} onChange={e => setCcName(e.target.value)} fullWidth />
              <TextField size="small" label="Card Number" value={ccNumber} onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 16)
                setCcNumber(v.replace(/(\d{4})(?=\d)/g, '$1 ').trim())
              }} fullWidth inputProps={{ maxLength: 19 }} placeholder="0000 0000 0000 0000" />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" label="Expiry (MM/YY)" value={ccExpiry} onChange={e => {
                  let v = e.target.value.replace(/\D/g, '').slice(0, 4)
                  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2)
                  setCcExpiry(v)
                }} sx={{ flex: 1 }} inputProps={{ maxLength: 5 }} placeholder="MM/YY" />
                <TextField size="small" label="CVV" value={ccCvv} onChange={e => setCcCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} sx={{ flex: 1 }} inputProps={{ maxLength: 4 }} placeholder="123" />
              </Box>
            </Box>
          )}

          {/* ACH fields */}
          {payMethod === 'ach' && achChoice === 'ach' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, bgcolor: '#F0FDF4', borderRadius: '12px' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#047857' }}>ACH Details</Typography>
              <TextField size="small" label="Bank Name" value={payBankName} onChange={e => setPayBankName(e.target.value)} />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" label="Account Last 4" value={payAcctLast4} onChange={e => setPayAcctLast4(e.target.value)} inputProps={{ maxLength: 4 }} sx={{ flex: 1 }} />
                <TextField size="small" label="Routing Last 4" value={payRoutingLast4} onChange={e => setPayRoutingLast4(e.target.value)} inputProps={{ maxLength: 4 }} sx={{ flex: 1 }} />
              </Box>
            </Box>
          )}

          {/* MBMTS ACH — Read-only company banking details */}
          {payMethod === 'ach' && achChoice === 'mbmts_ach' && (
            <Box sx={{
              p: 2.5, bgcolor: '#FDF4FF', borderRadius: '12px',
              border: '1px solid rgba(162,28,175,0.15)',
            }}>
              <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#A21CAF', mb: 0.5, textAlign: 'center' }}>
                ACH Authorization Form
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', mb: 2, textAlign: 'center' }}>
                Please use the listed below information for ACH payment.
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                { label: 'Business Name', value: 'Mr. Biomed Tech Services' },
                { label: 'Owner Name', value: 'Omar Ahmad' },
                { label: 'Address', value: '555 N. 5th Street Suite 109B' },
                { label: 'City, State, Zip', value: 'Garland, TX 75040' },
                { label: 'Name of Bank', value: 'Chase Business Banking' },
                { label: 'Account #', value: '818388071' },
                { label: '9-Digit Routing #', value: '111000614' },
                { label: 'Type of Account', value: 'Checking' },
              ].map((row) => (
                <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.8, borderBottom: '1px solid #F3E8FF' }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#6B7280' }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E1B4B' }}>{row.value}</Typography>
                </Box>
              ))}
              <Divider sx={{ mt: 2, mb: 1.5 }} />
              <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' }}>
                Only authorized authority can use the listed above information.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => { setPayOpen(null); resetPayForm() }} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
          <Button onClick={() => payOpen && handlePay(payOpen)} variant="contained" disabled={payMut.isPending || !payAmount}
            sx={{ borderRadius: '10px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', fontWeight: 700 }}>
            {payMut.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default QuotationPanel
