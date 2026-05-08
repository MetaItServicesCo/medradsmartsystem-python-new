import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Avatar, Box, Card, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Skeleton, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Divider, CircularProgress, IconButton, Collapse,
} from '@mui/material'
import PaymentIcon from '@mui/icons-material/Payment'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import FilterListIcon from '@mui/icons-material/FilterList'
import { toast } from 'react-toastify'

import {
  fetchAllQuotations,
  createQuotationPayment,
  type ServiceRequestQuotationList,
  type QuotationPaymentCreate,
} from '@/api/serviceRequests'
import { useAuthStore } from '@/stores/authStore'

const STATUS_CHIP: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#FEF3C7', color: '#B45309' },
  sent: { bg: '#DBEAFE', color: '#1D4ED8' },
  approved: { bg: '#D1FAE5', color: '#047857' },
  rejected: { bg: '#FEE2E2', color: '#DC2626' },
  paid: { bg: '#E0E7FF', color: '#4338CA' },
}

const Billing = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [payOpen, setPayOpen] = useState<ServiceRequestQuotationList | null>(null)

  // Payment form
  const [payMethod, setPayMethod] = useState<'credit_card' | 'ach'>('credit_card')
  const [achChoice, setAchChoice] = useState<'ach' | 'mbmts_ach'>('ach')
  const [payAmount, setPayAmount] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [ccName, setCcName] = useState('')
  const [ccNumber, setCcNumber] = useState('')
  const [ccExpiry, setCcExpiry] = useState('')
  const [ccCvv, setCcCvv] = useState('')
  const [payBankName, setPayBankName] = useState('')
  const [payAcctLast4, setPayAcctLast4] = useState('')
  const [payRoutingLast4, setPayRoutingLast4] = useState('')

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['billing-quotations'],
    queryFn: fetchAllQuotations,
  })

  const payMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: QuotationPaymentCreate }) =>
      createQuotationPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded successfully')
      queryClient.invalidateQueries({ queryKey: ['billing-quotations'] })
      queryClient.invalidateQueries({ queryKey: ['service-quotations'] })
      closePayDialog()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Payment failed'),
  })

  const resetPayForm = () => {
    setPayMethod('credit_card'); setPayAmount(''); setPayNotes('')
    setCcName(''); setCcNumber(''); setCcExpiry(''); setCcCvv('')
    setPayBankName(''); setPayAcctLast4(''); setPayRoutingLast4('')
    setAchChoice('ach')
  }

  const closePayDialog = () => { setPayOpen(null); resetPayForm() }

  const handlePay = () => {
    if (!payOpen) return
    const actualMethod = payMethod === 'ach' ? achChoice : payMethod
    const data: QuotationPaymentCreate = {
      payment_method: actualMethod as any,
      amount: parseFloat(payAmount),
      notes: payNotes || undefined,
    }
    if (actualMethod === 'credit_card') {
      const digits = ccNumber.replace(/\s/g, '')
      data.account_last_four = digits.slice(-4) || undefined
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
    payMut.mutate({ id: payOpen.id, data })
  }

  const filtered = quotations?.filter(q =>
    statusFilter === 'all' ? true : q.status === statusFilter
  ) ?? []

  const totalOutstanding = filtered.filter(q => q.status !== 'paid').reduce((s, q) => s + Number(q.amount), 0)
  const totalPaid = filtered.filter(q => q.status === 'paid').reduce((s, q) => s + Number(q.amount), 0)

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      {/* Header */}
      <Card sx={{
        mb: 3, p: 3, position: 'relative', overflow: 'hidden',
        borderRadius: '28px',
        border: '1px solid #DDF8ED',
        background: 'linear-gradient(135deg, #F5FFFA 0%, #ECFDF5 100%)',
        boxShadow: '0 18px 45px rgba(49,46,129,0.08)',
      }}>
        <Box sx={{ position: 'absolute', right: -20, top: -20, opacity: 0.08, color: '#10B981' }}>
          <PaymentIcon sx={{ fontSize: '10rem' }} />
        </Box>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6, mb: 2 }}>
            <Avatar sx={{ width: 52, height: 52, bgcolor: '#DDF8ED', color: '#059669', borderRadius: '18px' }}>
              <PaymentIcon />
            </Avatar>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Billing & Payments</Typography>
              <Typography variant="body2" sx={{ color: '#6B7280', fontWeight: 700 }}>
                Manage quotation payments across all service requests.
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B7280', mb: 2, display: 'none' }}>
            Manage quotation payments across all service requests.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '18px', minWidth: 150, border: '1px solid #E8F8F0' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#6B7280', textTransform: 'uppercase' }}>Outstanding</Typography>
              <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: '#1E1B4B' }}>${totalOutstanding.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '18px', minWidth: 150, border: '1px solid #E8F8F0' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#6B7280', textTransform: 'uppercase' }}>Paid</Typography>
              <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: '#059669' }}>${totalPaid.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '18px', minWidth: 150, border: '1px solid #E8F8F0' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#6B7280', textTransform: 'uppercase' }}>Total Quotations</Typography>
              <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: '#1E1B4B' }}>{filtered.length}</Typography>
            </Box>
          </Box>
        </Box>
      </Card>

      {/* Filters */}
      <Card sx={{ mb: 3, p: 2, display: 'flex', alignItems: 'center', gap: 2, borderRadius: '24px', border: '1px solid #EEF0F6', boxShadow: '0 14px 34px rgba(49,46,129,0.07)' }}>
        <FilterListIcon sx={{ color: '#6B7280' }} />
        <Typography sx={{ fontWeight: 600, color: '#374151', fontSize: '0.9rem' }}>Filter:</Typography>
        {['all', 'draft', 'sent', 'approved', 'paid', 'rejected'].map(s => (
          <Chip
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            size="small"
            onClick={() => setStatusFilter(s)}
            sx={{
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
              bgcolor: statusFilter === s ? '#7161D8' : '#F3F4F6',
              color: statusFilter === s ? '#fff' : '#374151',
              '&:hover': { bgcolor: statusFilter === s ? '#5C4BBC' : '#E5E7EB' },
            }}
          />
        ))}
      </Card>

      {/* Table */}
      <Card sx={{ overflow: 'hidden', borderRadius: '24px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 700 }}>Quotation #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Request #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Facility</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ color: '#6B7280', fontWeight: 500 }}>No quotations found.</Typography>
                  </TableCell>
                </TableRow>
              ) : filtered.map(q => {
                const sc = STATUS_CHIP[q.status] || STATUS_CHIP.draft
                const isExpanded = expandedId === q.id
                return (
                  <>
                    <TableRow
                      key={q.id}
                      sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#7161D8', fontFamily: 'monospace' }}>
                          {q.quotation_number || `Q-${q.id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#6757D8', fontFamily: 'monospace' }}>
                          {q.request_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{q.facility_name || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#374151', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {q.description}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#059669', fontSize: '0.95rem' }}>
                          ${Number(q.amount).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={q.status} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.7rem', textTransform: 'capitalize' }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#6B7280' }}>{formatDate(q.created_at)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {isAdmin && q.status !== 'paid' && (
                            <Button
                              size="small" variant="contained"
                              startIcon={<PaymentIcon />}
                              onClick={(e) => { e.stopPropagation(); setPayOpen(q); setPayAmount(String(q.amount)) }}
                              sx={{
                                borderRadius: '10px', textTransform: 'none', fontWeight: 700,
                                background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                                boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
                                '&:hover': { background: 'linear-gradient(135deg, #047857 0%, #059669 100%)' },
                              }}
                            >
                              Pay
                            </Button>
                          )}
                          <Button
                            size="small" variant="outlined"
                            startIcon={<VisibilityOutlinedIcon />}
                            onClick={(e) => { e.stopPropagation(); navigate(`/service-requests/${q.service_request_id}`) }}
                            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600 }}
                          >
                            View
                          </Button>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : q.id) }}>
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                    {/* Expanded row with line items & payments */}
                    <TableRow key={`${q.id}-details`}>
                      <TableCell colSpan={8} sx={{ py: 0, border: isExpanded ? undefined : 'none' }}>
                        <Collapse in={isExpanded}>
                          <Box sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', gap: 4 }}>
                              {/* Line Items */}
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151', mb: 1 }}>Line Items</Typography>
                                {q.line_items?.length > 0 ? (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Description</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Qty</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Unit $</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Total</TableCell>
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
                                ) : (
                                  <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>No line items</Typography>
                                )}
                              </Box>
                              {/* Payments */}
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151', mb: 1 }}>Payment History</Typography>
                                {q.payments?.length > 0 ? (
                                  q.payments.map(p => (
                                    <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, p: 1.5, bgcolor: '#F0FDF4', borderRadius: '10px' }}>
                                      <CheckCircleIcon sx={{ color: '#10B981', fontSize: '1rem' }} />
                                      <Box sx={{ flex: 1 }}>
                                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857' }}>
                                          ${Number(p.amount).toFixed(2)} — {p.payment_method.replace(/_/g, ' ').toUpperCase()}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>
                                          Ref: {p.reference_number} • {formatDate(p.paid_at)}
                                        </Typography>
                                      </Box>
                                    </Box>
                                  ))
                                ) : (
                                  <Typography sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>No payments recorded</Typography>
                                )}
                              </Box>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={payOpen !== null} onClose={closePayDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PaymentIcon sx={{ color: '#10B981' }} />
            Record Payment
          </Box>
          {payOpen && (
            <Typography sx={{ fontSize: '0.8rem', color: '#6B7280', mt: 0.5 }}>
              Quotation: <strong>{payOpen.quotation_number}</strong> • Request: <strong>{payOpen.request_number}</strong>
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <FormControl sx={{ mt: 1, mb: 2 }}>
            <FormLabel sx={{ fontWeight: 600, mb: 1 }}>Payment Method</FormLabel>
            <RadioGroup row value={payMethod} onChange={e => { setPayMethod(e.target.value as any); setAchChoice('ach') }}>
              <FormControlLabel value="credit_card" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CreditCardIcon fontSize="small" /> Credit Card</Box>} />
              <FormControlLabel value="ach" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AccountBalanceIcon fontSize="small" /> ACH</Box>} />
            </RadioGroup>
          </FormControl>

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

          {/* Credit Card */}
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

          {/* ACH */}
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

          {/* MBMTS ACH */}
          {payMethod === 'ach' && achChoice === 'mbmts_ach' && (
            <Box sx={{ p: 2.5, bgcolor: '#FDF4FF', borderRadius: '12px', border: '1px solid rgba(162,28,175,0.15)' }}>
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
          <Button onClick={closePayDialog} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
          <Button
            onClick={handlePay} variant="contained"
            disabled={payMut.isPending || !payAmount}
            sx={{
              borderRadius: '10px', fontWeight: 700,
              background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #047857 0%, #059669 100%)' },
            }}
          >
            {payMut.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Billing
