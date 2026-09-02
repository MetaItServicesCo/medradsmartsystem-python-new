import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import {
  fetchPublicSalesPaymentAuthorization,
  submitPublicSalesPaymentAuthorization,
} from '@/api/sales'
import { formatUSPhone } from '@/utils/formatters'

const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  : '-'

const PublicSalesPayment = () => {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const paymentQ = useQuery({
    queryKey: ['public-sales-payment', token],
    queryFn: () => fetchPublicSalesPaymentAuthorization(token),
    enabled: Boolean(token),
    retry: false,
  })
  const data = paymentQ.data
  const [form, setForm] = useState({
    submitted_by_name: '',
    submitted_by_email: '',
    cardholder_name: '',
    card_brand: '',
    card_last_four: '',
    card_expiration: '',
    notes: '',
    terms_accepted: false,
  })

  useEffect(() => {
    if (!data) return
    setForm(previous => ({
      ...previous,
      submitted_by_name: previous.submitted_by_name || data.invoice.customer_name || '',
      submitted_by_email: previous.submitted_by_email || data.invoice.customer_email || '',
    }))
  }, [data])

  const submitMut = useMutation({
    mutationFn: () => submitPublicSalesPaymentAuthorization(token, form),
    onSuccess: result => {
      queryClient.setQueryData(['public-sales-payment', token], result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })

  if (paymentQ.isLoading) {
    return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: '#F5F3FF' }}><CircularProgress /></Box>
  }
  if (paymentQ.isError || !data) {
    return (
      <Box sx={{ minHeight: '100dvh', p: { xs: 2, sm: 3 }, display: 'grid', placeItems: 'center', bgcolor: '#F5F3FF' }}>
        <Alert severity="error">{(paymentQ.error as any)?.response?.data?.detail || 'This payment authorization link is unavailable.'}</Alert>
      </Box>
    )
  }

  const { invoice, quotation, acceptance, authorization } = data
  const submitted = authorization.status !== 'requested'

  return (
    <Box sx={{ minHeight: '100dvh', height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', bgcolor: '#F5F3FF', py: { xs: 2, md: 5 }, px: { xs: 1.5, md: 3 } }}>
      <Card sx={{ maxWidth: 1080, mx: 'auto', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 28px 80px rgba(76,29,149,0.14)' }}>
        <Box sx={{ p: { xs: 2.5, md: 4 }, color: '#fff', background: 'linear-gradient(135deg, #7C3AED 0%, #0EA5E9 70%, #EC4899 130%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: '14px', p: 1 }}>
              <Box component="img" src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" sx={{ width: 112, height: 72, display: 'block', objectFit: 'contain' }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: { xs: 19, md: 24 }, fontWeight: 950 }}>Mr. BioMed Tech Services</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 700 }}>Secure sales payment authorization</Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
            <Typography sx={{ fontWeight: 950, fontSize: 22 }}>{invoice.invoice_number}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.82)' }}>{quotation.quotation_number}</Typography>
          </Box>
        </Box>

        <Box sx={{ p: { xs: 2, md: 4 }, display: 'grid', gap: 3 }}>
          {submitted && (
            <Alert severity={authorization.status === 'processed' ? 'success' : 'info'} icon={<CheckCircleOutlineIcon />}>
              Authorization {authorization.authorization_reference || ''} is {authorization.status.replace(/_/g, ' ')}.
              {authorization.status !== 'processed' && ' The invoice will be marked paid only after the payment is processed and recorded.'}
            </Alert>
          )}
          {submitMut.isError && <Alert severity="error">{(submitMut.error as any)?.response?.data?.detail || 'Could not submit authorization.'}</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid #E5E7EB', bgcolor: '#F8FAFC' }}>
              <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Bill To</Typography>
              <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>{invoice.customer_name}</Typography>
              <Typography sx={{ color: '#64748B' }}>{invoice.customer_email || '-'}</Typography>
              <Typography sx={{ color: '#64748B' }}>{formatUSPhone(invoice.customer_phone) || '-'}</Typography>
              <Typography sx={{ color: '#64748B' }}>{invoice.customer_address || '-'}</Typography>
              <Typography sx={{ color: '#64748B' }}>{invoice.facility_name || ''}</Typography>
            </Box>
            <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid #DDD6FE', bgcolor: '#FAF8FF', display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.8 }}>
              <Typography sx={{ fontWeight: 800 }}>Issued</Typography><Typography>{dateLabel(invoice.issue_date)}</Typography>
              <Typography sx={{ fontWeight: 800 }}>Due</Typography><Typography>{dateLabel(invoice.due_date)}</Typography>
              <Typography sx={{ fontWeight: 800 }}>Invoice total</Typography><Typography>{money(invoice.total_amount)}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#DC2626' }}>Outstanding balance</Typography><Typography sx={{ fontWeight: 950, color: '#DC2626' }}>{money(invoice.balance_due)}</Typography>
            </Box>
          </Box>

          <Box sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px' }}>
            <Box sx={{ minWidth: 720 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 110px 110px', gap: 1, p: 1.5, bgcolor: '#F8FAFC', color: '#64748B', fontSize: 12, fontWeight: 900 }}>
                <span>ITEM</span><span>DESCRIPTION</span><span>QTY</span><span>PRICE</span><span>TOTAL</span>
              </Box>
              {invoice.line_items.map((item, index) => (
                <Box key={String(item.id || index)} sx={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 110px 110px', gap: 1, p: 1.5, borderTop: '1px solid #E5E7EB', alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 900 }}>{String(item.item_number || '-')}</Typography>
                  <Typography>{String(item.description || '-')}</Typography>
                  <Typography>{Number(item.quantity || 0)}</Typography>
                  <Typography>{money(item.unit_price)}</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{money(item.total ?? item.total_amount)}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {acceptance && (
            <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid #DDD6FE', bgcolor: '#FAF8FF' }}>
              <Typography sx={{ fontWeight: 950, color: '#312E81' }}>Quotation acceptance</Typography>
              <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                Signed by {acceptance.accepted_by_name} on {dateLabel(acceptance.accepted_at)} · Revision {acceptance.quotation_revision}
              </Typography>
              <Typography sx={{ mt: 1, pb: 0.5, borderBottom: '1px solid #94A3B8', fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 30, fontStyle: 'italic', color: '#1E1B4B' }}>
                {acceptance.signature_name}
              </Typography>
            </Box>
          )}

          {!submitted && (
            <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: '18px', border: '1px solid #C7D2FE', bgcolor: '#EEF2FF' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LockOutlinedIcon sx={{ color: '#7C3AED' }} />
                <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>Authorize the approved invoice balance</Typography>
              </Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                For PCI safety, enter only the card brand, expiration and last four digits. Never enter a full card number or security code here.
              </Alert>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <TextField label="Authorized by" value={form.submitted_by_name} onChange={event => setForm(previous => ({ ...previous, submitted_by_name: event.target.value }))} />
                <TextField label="Email" type="email" value={form.submitted_by_email} onChange={event => setForm(previous => ({ ...previous, submitted_by_email: event.target.value }))} />
                <TextField label="Cardholder name" value={form.cardholder_name} onChange={event => setForm(previous => ({ ...previous, cardholder_name: event.target.value }))} />
                <TextField select label="Card brand" value={form.card_brand} onChange={event => setForm(previous => ({ ...previous, card_brand: event.target.value }))}>
                  <MenuItem value="visa">Visa</MenuItem>
                  <MenuItem value="mastercard">Mastercard</MenuItem>
                  <MenuItem value="amex">American Express</MenuItem>
                  <MenuItem value="discover">Discover</MenuItem>
                </TextField>
                <TextField label="Last 4 digits" value={form.card_last_four} onChange={event => setForm(previous => ({ ...previous, card_last_four: event.target.value.replace(/\D/g, '').slice(0, 4) }))} inputProps={{ inputMode: 'numeric', maxLength: 4 }} />
                <TextField label="Expiration (MM/YY)" value={form.card_expiration} onChange={event => setForm(previous => ({ ...previous, card_expiration: event.target.value.slice(0, 7) }))} />
                <TextField label="Optional notes" multiline minRows={2} value={form.notes} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} sx={{ gridColumn: { md: '1 / -1' } }} />
              </Box>
              <FormControlLabel
                sx={{ mt: 1.5, alignItems: 'flex-start' }}
                control={<Checkbox checked={form.terms_accepted} onChange={event => setForm(previous => ({ ...previous, terms_accepted: event.target.checked }))} />}
                label={`I authorize payment processing for the exact outstanding balance of ${money(invoice.balance_due)} on ${invoice.invoice_number}.`}
              />
              <Button
                variant="contained"
                startIcon={submitMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <LockOutlinedIcon />}
                disabled={
                  submitMut.isPending
                  || !form.terms_accepted
                  || !form.submitted_by_name.trim()
                  || !form.cardholder_name.trim()
                  || !form.card_brand
                  || form.card_last_four.length !== 4
                  || !form.card_expiration.trim()
                }
                onClick={() => submitMut.mutate()}
                sx={{ mt: 2, px: 3, fontWeight: 950, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
              >
                Authorize {money(invoice.balance_due)}
              </Button>
            </Box>
          )}

          <Typography sx={{ color: '#64748B', fontSize: 12, textAlign: 'center' }}>
            {data.payment_note}<br />Mr. BioMed Tech Services · 555 N. 5th Street Suite 109, Garland, TX 75040
          </Typography>
        </Box>
      </Card>
    </Box>
  )
}

export default PublicSalesPayment
