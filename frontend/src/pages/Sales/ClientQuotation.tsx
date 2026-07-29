import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Radio, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PaymentIcon from '@mui/icons-material/Payment'
import PrintIcon from '@mui/icons-material/Print'
import { toast } from 'react-toastify'

import {
  acceptClientSalesQuotation,
  acceptPublicSalesQuotation,
  decideClientSalesQuotation,
  decidePublicSalesQuotation,
  fetchClientSalesQuotation,
  fetchPublicSalesQuotation,
  payClientSalesQuotationInTestMode,
  payClientSalesQuotationWithSquare,
  payPublicSalesQuotationInTestMode,
  payPublicSalesQuotationWithSquare,
  type SalesQuotationLineItem,
} from '@/api/sales'
import SquareCardCheckout from '@/components/Billing/SquareCardCheckout'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—'

const ClientQuotation = () => {
  const { token, quotationId } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const accountMode = location.pathname.includes('/quotation/account/')
  const id = Number(quotationId || 0)
  const queryKey = accountMode ? ['client-sales-quotation', id] : ['public-sales-quotation', token]
  const quoteQ = useQuery({
    queryKey,
    queryFn: () => accountMode
      ? fetchClientSalesQuotation(id)
      : fetchPublicSalesQuotation(String(token)),
    enabled: accountMode ? id > 0 : Boolean(token),
    retry: false,
    refetchInterval: 15_000,
  })
  const data = quoteQ.data
  const quotation = data?.quotation
  const productLines = useMemo(
    () => (quotation?.line_items || []).filter(line => line.item_kind === 'product'),
    [quotation?.line_items],
  )
  const creditLines = useMemo(
    () => (quotation?.line_items || []).filter(line => line.item_kind !== 'product'),
    [quotation?.line_items],
  )
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [signatureName, setSignatureName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [decision, setDecision] = useState<'decline' | 'request_changes' | null>(null)
  const [comments, setComments] = useState('')
  const [testPayOpen, setTestPayOpen] = useState(false)
  const [squarePayOpen, setSquarePayOpen] = useState(false)
  const [testPayerName, setTestPayerName] = useState('')
  const [testPaymentNotes, setTestPaymentNotes] = useState('')
  const [testPaymentConfirmed, setTestPaymentConfirmed] = useState(false)
  const responseRef = useRef<HTMLDivElement | null>(null)
  const paymentConfirmationRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!quotation) return
    if (quotation.selection_status === 'accepted' && data?.acceptance) {
      setSelectedIds(
        data.acceptance.selection_snapshot
          .map(item => Number(item.line_item_id || 0))
          .filter(Boolean),
      )
      setSignatureName(data.acceptance.signature_name)
      setTestPayerName(previous => previous || data.acceptance!.accepted_by_name)
      setTermsAccepted(true)
      return
    }
    if (quotation.quotation_type === 'standard') {
      setSelectedIds(productLines.map(line => line.id))
    } else {
      setSelectedIds(productLines.filter(line => line.is_default).map(line => line.id))
    }
  }, [quotation?.id, quotation?.revision, quotation?.selection_status, data?.acceptance, productLines])

  useEffect(() => {
    if (data?.invoice?.status !== 'paid') return
    const timeout = window.setTimeout(() => {
      paymentConfirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [data?.invoice?.status])

  const selectedProductLines = productLines.filter(line =>
    quotation?.quotation_type === 'standard' || selectedIds.includes(line.id),
  )
  const selectedLines = [...selectedProductLines, ...creditLines]
  const subtotal = selectedLines.reduce((sum, line) => sum + Number(line.total || 0), 0)
  const grandTotal = subtotal + Number(quotation?.tax_amount || 0) - Number(quotation?.discount_amount || 0)

  const acceptMut = useMutation({
    mutationFn: () => {
      const payload = {
        selected_line_item_ids: selectedIds,
        signature_name: signatureName,
        terms_accepted: termsAccepted,
      }
      return accountMode
        ? acceptClientSalesQuotation(id, payload)
        : acceptPublicSalesQuotation(String(token), payload)
    },
    onSuccess: response => {
      queryClient.setQueryData(queryKey, response)
      toast.success('Quotation accepted. The sales invoice is ready for payment.')
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Could not accept quotation'),
  })

  const decisionMut = useMutation({
    mutationFn: () => accountMode
      ? decideClientSalesQuotation(id, decision!, comments)
      : decidePublicSalesQuotation(String(token), decision!, comments),
    onSuccess: response => {
      queryClient.setQueryData(queryKey, response)
      setDecision(null)
      setComments('')
      toast.success(response.quotation.status === 'declined' ? 'Quotation declined' : 'Change request sent')
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Could not submit response'),
  })

  const testPaymentMut = useMutation({
    mutationFn: () => {
      const payload = {
        payer_name: testPayerName.trim(),
        confirmation: testPaymentConfirmed,
        notes: testPaymentNotes.trim() || undefined,
      }
      return accountMode
        ? payClientSalesQuotationInTestMode(id, payload)
        : payPublicSalesQuotationInTestMode(String(token), payload)
    },
    onSuccess: response => {
      queryClient.setQueryData(queryKey, response)
      setTestPayOpen(false)
      setTestPaymentConfirmed(false)
      setTestPaymentNotes('')
      toast.success('Test payment completed. No funds were charged.')
    },
    onError: (error: any) => toast.error(error.response?.data?.detail || 'Could not complete the test payment'),
  })

  const squarePaymentMut = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) => {
      const payload = {
        source_id: sourceId,
        idempotency_key: idempotencyKey,
        payer_name: data?.acceptance?.accepted_by_name || data?.recipient.name || 'Customer',
      }
      return accountMode
        ? payClientSalesQuotationWithSquare(id, payload)
        : payPublicSalesQuotationWithSquare(String(token), payload)
    },
    onSuccess: response => {
      queryClient.setQueryData(queryKey, response)
      setSquarePayOpen(false)
      toast.success('Payment completed securely. The invoice and ledger are now updated.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || error.message || 'Square could not complete the payment')
    },
  })

  const toggleProduct = (line: SalesQuotationLineItem) => {
    if (!quotation || quotation.quotation_type === 'standard' || !data?.can_accept) return
    setSelectedIds(previous => quotation.quotation_type === 'choice_single'
      ? [line.id]
      : previous.includes(line.id)
        ? previous.filter(item => item !== line.id)
        : [...previous, line.id])
  }

  const validateAndAccept = () => {
    if (quotation?.quotation_type === 'choice_single' && selectedIds.length !== 1) {
      return toast.error('Choose one sales option')
    }
    if (quotation?.quotation_type === 'choice_multiple' && selectedIds.length === 0) {
      return toast.error('Choose at least one sales option')
    }
    if (!signatureName.trim()) return toast.error('Enter the signer name')
    if (!termsAccepted) return toast.error('Accept the quotation terms')
    acceptMut.mutate()
  }

  if (quoteQ.isLoading) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F5F3FF' }}><CircularProgress /></Box>
  }
  if (quoteQ.isError || !data || !quotation) {
    return (
      <Box sx={{ minHeight: '100vh', p: 4, bgcolor: '#F5F3FF' }}>
        <Alert severity="error" sx={{ maxWidth: 760, mx: 'auto' }}>
          {(quoteQ.error as any)?.response?.data?.detail || 'This quotation is unavailable or its link has expired.'}
        </Alert>
      </Box>
    )
  }

  const responseLocked = !data.can_accept
  const statusLabel = quotation.status.replace(/_/g, ' ')

  return (
    <Box
      sx={{
        height: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollBehavior: 'smooth',
        scrollbarGutter: 'stable',
        WebkitOverflowScrolling: 'touch',
        bgcolor: '#F5F3FF',
        py: { xs: 2, md: 5 },
        px: 2,
        '&::-webkit-scrollbar': { width: 10 },
        '&::-webkit-scrollbar-track': { bgcolor: '#EEEAFE' },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: '#B9A8F5',
          borderRadius: 999,
          border: '2px solid #EEEAFE',
        },
        '&::-webkit-scrollbar-thumb:hover': { bgcolor: '#8B6FE8' },
        '@media print': {
          height: 'auto',
          overflow: 'visible',
          py: 0,
          px: 0,
        },
      }}
    >
      <Card
        sx={{
          width: 'min(1120px, 100%)',
          mx: 'auto',
          p: { xs: 2, md: 5 },
          borderRadius: '24px',
          boxShadow: '0 24px 70px rgba(49,46,129,0.14)',
          '@media print': { boxShadow: 'none', borderRadius: 0, p: 1 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              component="img"
              src="/mr-biomed-logo.jpeg"
              alt="Mr. BioMed Tech Services"
              sx={{ width: 94, height: 62, display: 'block', objectFit: 'contain' }}
            />
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Quotation</Typography>
              <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{data.company_name}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'start', '@media print': { display: 'none' } }}>
            <Chip label={statusLabel} sx={{ textTransform: 'capitalize', fontWeight: 900, bgcolor: '#EDE9FE', color: '#6D28D9' }} />
            {data.can_accept && (
              <Button
                variant="contained"
                onClick={() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}
              >
                Sign & Approve
              </Button>
            )}
            <Button startIcon={<PrintIcon />} variant="outlined" onClick={() => window.print()}>Print</Button>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 4 }}>
          <Box>
            <Typography sx={{ color: '#6B7280', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>Prepared for</Typography>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 20 }}>{data.recipient.name}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{data.recipient.email}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{quotation.facility_name || quotation.customer_name}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{quotation.customer_address || ''}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.8, justifySelf: { md: 'end' } }}>
            <Typography sx={{ fontWeight: 900 }}>Quote</Typography><Typography>{quotation.quotation_number}</Typography>
            <Typography sx={{ fontWeight: 900 }}>Revision</Typography><Typography>{quotation.revision}</Typography>
            <Typography sx={{ fontWeight: 900 }}>Issued</Typography><Typography>{dateLabel(quotation.sent_at)}</Typography>
            <Typography sx={{ fontWeight: 900 }}>Expires</Typography><Typography>{dateLabel(quotation.expires_at)}</Typography>
          </Box>
        </Box>

        {quotation.quotation_type !== 'standard' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {quotation.quotation_type === 'choice_single'
              ? 'Choose one of the following sales options.'
              : 'Choose one or more of the following sales options.'}
          </Alert>
        )}

        <Table sx={{ mb: 3 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              {quotation.quotation_type !== 'standard' && <TableCell sx={{ width: 60 }}>Select</TableCell>}
              <TableCell sx={{ fontWeight: 900 }}>Item</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Quantity</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Price</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...productLines, ...creditLines].map(line => {
              const isCredit = line.item_kind !== 'product'
              const selected = isCredit || quotation.quotation_type === 'standard' || selectedIds.includes(line.id)
              return (
                <TableRow
                  key={line.id}
                  hover={!isCredit && !responseLocked}
                  onClick={() => !isCredit && toggleProduct(line)}
                  sx={{ cursor: !isCredit && !responseLocked && quotation.quotation_type !== 'standard' ? 'pointer' : 'default', opacity: selected ? 1 : 0.55 }}
                >
                  {quotation.quotation_type !== 'standard' && (
                    <TableCell>
                      {isCredit ? <CheckCircleOutlineIcon color="success" /> : quotation.quotation_type === 'choice_single'
                        ? <Radio checked={selected} disabled={responseLocked} />
                        : <Checkbox checked={selected} disabled={responseLocked} />}
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 900 }}>{line.item_kind === 'refund' ? 'Refund' : line.item_kind === 'trade_in' ? 'Trade-In' : line.part_number || 'Product'}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">{line.quantity}</TableCell>
                  <TableCell align="right">{money(line.unit_price)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, color: isCredit ? '#DC2626' : '#1E1B4B' }}>{money(line.total)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <Box sx={{ ml: 'auto', width: { xs: '100%', sm: 360 }, display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, mb: 4 }}>
          <Typography sx={{ fontWeight: 700 }}>Subtotal</Typography><Typography sx={{ textAlign: 'right' }}>{money(subtotal)}</Typography>
          <Typography sx={{ fontWeight: 700 }}>Tax</Typography><Typography sx={{ textAlign: 'right' }}>{money(quotation.tax_amount)}</Typography>
          <Typography sx={{ fontWeight: 700 }}>Discount</Typography><Typography sx={{ textAlign: 'right' }}>-{money(quotation.discount_amount)}</Typography>
          <Typography sx={{ fontWeight: 900, fontSize: 20 }}>Total</Typography><Typography sx={{ fontWeight: 900, fontSize: 20, textAlign: 'right' }}>{money(grandTotal)}</Typography>
        </Box>

        {quotation.notes && <Alert icon={false} sx={{ mb: 3 }}>{quotation.notes}</Alert>}

        {data.acceptance ? (
          <Box sx={{ mb: 3 }}>
            {data.invoice?.status === 'paid' ? (
              <Box
                ref={paymentConfirmationRef}
                sx={{
                  p: { xs: 2.5, md: 3.5 },
                  borderRadius: '20px',
                  color: '#064E3B',
                  border: '1px solid #A7F3D0',
                  background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 55%, #FFFFFF 100%)',
                  boxShadow: '0 16px 38px rgba(5,150,105,0.10)',
                  scrollMarginTop: 24,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box
                    sx={{
                      width: 52,
                      height: 52,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '16px',
                      bgcolor: '#10B981',
                      color: '#FFFFFF',
                      boxShadow: '0 8px 20px rgba(16,185,129,0.25)',
                    }}
                  >
                    <CheckCircleOutlineIcon sx={{ fontSize: 32 }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" sx={{ fontWeight: 950, color: '#064E3B' }}>
                      Thank you for your payment
                    </Typography>
                    <Typography sx={{ mt: 0.7, color: '#047857', lineHeight: 1.6 }}>
                      Your payment has been received successfully. Invoice {data.invoice.invoice_number} is fully paid,
                      and no further payment is due.
                    </Typography>
                  </Box>
                </Box>
                <Box
                  sx={{
                    mt: 2.5,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                    gap: 1.2,
                  }}
                >
                  {[
                    ['Invoice', data.invoice.invoice_number],
                    ['Amount received', money(data.invoice.amount_paid)],
                    ['Payment status', 'Paid'],
                  ].map(([label, value]) => (
                    <Box
                      key={label}
                      sx={{
                        px: 1.8,
                        py: 1.4,
                        borderRadius: '13px',
                        bgcolor: 'rgba(255,255,255,0.78)',
                        border: '1px solid rgba(167,243,208,0.85)',
                      }}
                    >
                      <Typography sx={{ color: '#6B7280', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                        {label}
                      </Typography>
                      <Typography sx={{ mt: 0.35, color: '#064E3B', fontWeight: 950, overflowWrap: 'anywhere' }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Alert severity="info" icon={<CheckCircleOutlineIcon />}>
                Accepted by {data.acceptance.accepted_by_name} on {dateLabel(data.acceptance.accepted_at)}.
                {data.invoice ? ` Invoice ${data.invoice.invoice_number} is ready for payment.` : ''}
              </Alert>
            )}
            <Box sx={{ mt: 1.5, p: 2, borderRadius: '14px', border: '1px solid #DDD6FE', bgcolor: '#FAF8FF' }}>
              <Typography sx={{ color: '#64748B', fontWeight: 800, fontSize: 12 }}>SIGNED ACCEPTANCE · REVISION {data.acceptance.quotation_revision}</Typography>
              <Typography sx={{ mt: 1, pb: 0.5, borderBottom: '1px solid #94A3B8', color: '#1E1B4B', fontFamily: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive', fontSize: { xs: 28, md: 36 }, fontStyle: 'italic' }}>
                {data.acceptance.signature_name}
              </Typography>
            </Box>
            {data.square_payment.enabled && data.invoice && data.invoice.status !== 'paid' && (
              <Box
                sx={{
                  mt: 2,
                  p: 2.4,
                  borderRadius: '16px',
                  border: '1px solid #C4B5FD',
                  bgcolor: '#F8F7FF',
                  display: { sm: 'flex' },
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 950 }}>Secure card payment</Typography>
                    {data.square_payment.environment === 'sandbox' && (
                      <Chip
                        size="small"
                        label="Square Sandbox"
                        sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 900 }}
                      />
                    )}
                  </Box>
                  <Typography sx={{ color: '#64748B', fontSize: 13, mt: 0.4 }}>
                    Pay the outstanding balance of {money(data.invoice.balance_due)}. Card details are handled securely by Square.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<PaymentIcon />}
                  disabled={!data.can_square_pay}
                  onClick={() => setSquarePayOpen(true)}
                  sx={{ fontWeight: 950, minWidth: 180, whiteSpace: 'nowrap' }}
                >
                  Pay {money(data.invoice.balance_due)}
                </Button>
              </Box>
            )}
            {data.test_payment_enabled && !data.square_payment.enabled && data.invoice && data.invoice.status !== 'paid' && (
              <Box sx={{ mt: 2, p: 2.2, borderRadius: '16px', border: '1px dashed #F59E0B', bgcolor: '#FFFBEB' }}>
                <Typography sx={{ color: '#92400E', fontWeight: 950 }}>Simulated workflow fallback</Typography>
                <Typography sx={{ color: '#92400E', fontSize: 13, mb: 1.5 }}>
                  Pay the balance of {money(data.invoice.balance_due)} here for workflow testing.
                  No card, bank account, or real funds will be used.
                </Typography>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<PaymentIcon />}
                  disabled={!data.can_test_pay}
                  onClick={() => setTestPayOpen(true)}
                  sx={{ fontWeight: 950 }}
                >
                  Pay {money(data.invoice.balance_due)} (Test)
                </Button>
              </Box>
            )}
          </Box>
        ) : data.can_accept ? (
          <Box
            ref={responseRef}
            sx={{
              border: '1px solid #DDD6FE',
              borderRadius: '18px',
              bgcolor: '#FAF8FF',
              p: { xs: 2, md: 3 },
              scrollMarginTop: 24,
              '@media print': { display: 'none' },
            }}
          >
            <Typography variant="h6" sx={{ color: '#1E1B4B', fontWeight: 900, mb: 0.5 }}>
              Sign and approve this quotation
            </Typography>
            <Typography sx={{ color: '#6B7280', mb: 2 }}>
              Confirm your selected option, enter the signer’s name, and accept the terms.
            </Typography>
            <TextField
              fullWidth
              label="Type your full legal name"
              value={signatureName}
              onChange={event => setSignatureName(event.target.value)}
              autoComplete="name"
              helperText="Your typed name will be rendered as your electronic signature."
              sx={{ mb: 2 }}
            />
            <Box
              role="img"
              aria-label={signatureName.trim() ? `Electronic signature: ${signatureName.trim()}` : 'Electronic signature preview'}
              sx={{
                minHeight: 112,
                mb: 2,
                px: { xs: 2, md: 3 },
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                borderRadius: '14px',
                bgcolor: '#FFFFFF',
                border: '1px solid #E5E7EB',
              }}
            >
              <Typography sx={{ color: '#8B95A7', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Electronic signature preview
              </Typography>
              <Typography
                sx={{
                  minHeight: 54,
                  display: 'flex',
                  alignItems: 'center',
                  color: signatureName.trim() ? '#1E1B4B' : '#A1A1AA',
                  fontFamily: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive',
                  fontSize: { xs: 30, md: 40 },
                  fontWeight: 500,
                  fontStyle: 'italic',
                  lineHeight: 1.25,
                  overflowWrap: 'anywhere',
                }}
              >
                {signatureName.trim() || 'Your signature will appear here'}
              </Typography>
              <Box sx={{ borderBottom: '1px solid #9CA3AF' }} />
            </Box>
            <FormControlLabel
              control={<Checkbox checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />}
              label="I confirm the selected products, pricing, and quotation terms."
            />
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={acceptMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <CheckCircleOutlineIcon />}
                disabled={acceptMut.isPending}
                onClick={validateAndAccept}
                sx={{ fontWeight: 900 }}
              >
                Sign & Approve
              </Button>
              <Button variant="outlined" onClick={() => setDecision('request_changes')}>Request Changes</Button>
              <Button color="error" variant="outlined" onClick={() => setDecision('decline')}>Decline</Button>
            </Box>
          </Box>
        ) : (
          <Alert severity={quotation.status === 'declined' ? 'warning' : 'info'}>
            This quotation is {statusLabel}. No further response is available.
          </Alert>
        )}
      </Card>

      <Dialog
        open={squarePayOpen}
        onClose={() => !squarePaymentMut.isPending && setSquarePayOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ color: '#1E1B4B', fontWeight: 950 }}>
          Pay Invoice Securely
        </DialogTitle>
        <DialogContent dividers>
          {data.square_payment.environment === 'sandbox' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Square Sandbox is active. Use a Square sandbox test card; no real funds will be charged.
            </Alert>
          )}
          <Typography sx={{ mb: 2, color: '#475569', fontWeight: 800 }}>
            Invoice {data.invoice?.invoice_number} · {money(data.invoice?.balance_due)}
          </Typography>
          {data.square_payment.application_id && data.square_payment.location_id && data.invoice && (
            <SquareCardCheckout
              applicationId={data.square_payment.application_id}
              locationId={data.square_payment.location_id}
              sdkUrl={data.square_payment.sdk_url}
              amount={Number(data.invoice.balance_due)}
              currency={data.square_payment.currency}
              payerName={data.acceptance?.accepted_by_name || data.recipient.name}
              payerEmail={data.recipient.email}
              processing={squarePaymentMut.isPending}
              onPaymentToken={(sourceId, idempotencyKey) => {
                squarePaymentMut.mutate({ sourceId, idempotencyKey })
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setSquarePayOpen(false)}
            disabled={squarePaymentMut.isPending}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={testPayOpen} onClose={() => !testPaymentMut.isPending && setTestPayOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ color: '#92400E', fontWeight: 950 }}>Complete Test Payment</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Testing only: this marks the invoice paid and updates the ledger, but no money is charged.
          </Alert>
          <Typography sx={{ mb: 2, fontWeight: 900 }}>
            Invoice {data.invoice?.invoice_number} · {money(data.invoice?.balance_due)}
          </Typography>
          <TextField
            fullWidth
            label="Payer name"
            value={testPayerName}
            onChange={event => setTestPayerName(event.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Optional test notes"
            value={testPaymentNotes}
            onChange={event => setTestPaymentNotes(event.target.value)}
          />
          <FormControlLabel
            sx={{ mt: 1.5, alignItems: 'flex-start' }}
            control={<Checkbox checked={testPaymentConfirmed} onChange={event => setTestPaymentConfirmed(event.target.checked)} />}
            label="I understand this is a simulated payment and no funds will be charged."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setTestPayOpen(false)} disabled={testPaymentMut.isPending}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={testPaymentMut.isPending ? <CircularProgress size={18} /> : <PaymentIcon />}
            disabled={testPaymentMut.isPending || !testPaymentConfirmed || !testPayerName.trim()}
            onClick={() => testPaymentMut.mutate()}
            sx={{ fontWeight: 950 }}
          >
            Mark Paid in Test Mode
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decision)} onClose={() => setDecision(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>{decision === 'decline' ? 'Decline Quotation' : 'Request Changes'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            label="Comments"
            value={comments}
            onChange={event => setComments(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>Cancel</Button>
          <Button color={decision === 'decline' ? 'error' : 'primary'} variant="contained" disabled={decisionMut.isPending} onClick={() => decisionMut.mutate()}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ClientQuotation
