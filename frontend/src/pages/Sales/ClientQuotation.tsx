import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Radio, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PrintIcon from '@mui/icons-material/Print'
import { toast } from 'react-toastify'

import {
  acceptClientSalesQuotation,
  acceptPublicSalesQuotation,
  decideClientSalesQuotation,
  decidePublicSalesQuotation,
  fetchClientSalesQuotation,
  fetchPublicSalesQuotation,
  type SalesQuotationLineItem,
} from '@/api/sales'

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

  useEffect(() => {
    if (!quotation) return
    if (quotation.selection_status === 'accepted' && data?.acceptance) {
      setSelectedIds(
        data.acceptance.selection_snapshot
          .map(item => Number(item.line_item_id || 0))
          .filter(Boolean),
      )
      setSignatureName(data.acceptance.signature_name)
      setTermsAccepted(true)
      return
    }
    if (quotation.quotation_type === 'standard') {
      setSelectedIds(productLines.map(line => line.id))
    } else {
      setSelectedIds(productLines.filter(line => line.is_default).map(line => line.id))
    }
  }, [quotation?.id, quotation?.revision, quotation?.selection_status, data?.acceptance, productLines])

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
      toast.success('Quotation accepted. The invoice is pending billing approval.')
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
    <Box sx={{ minHeight: '100vh', bgcolor: '#F5F3FF', py: { xs: 2, md: 5 }, px: 2 }}>
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
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Quotation</Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{data.company_name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'start', '@media print': { display: 'none' } }}>
            <Chip label={statusLabel} sx={{ textTransform: 'capitalize', fontWeight: 900, bgcolor: '#EDE9FE', color: '#6D28D9' }} />
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
          <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 3 }}>
            Accepted by {data.acceptance.accepted_by_name} on {dateLabel(data.acceptance.accepted_at)}.
            {data.invoice && ` Invoice ${data.invoice.invoice_number} is ${data.invoice.billing_approval_status === 'approved' ? 'available in Billing' : 'pending billing approval'}.`}
          </Alert>
        ) : data.can_accept ? (
          <Box sx={{ borderTop: '1px solid #E5E7EB', pt: 3, '@media print': { display: 'none' } }}>
            <TextField
              fullWidth
              label="Signature / accepted by"
              value={signatureName}
              onChange={event => setSignatureName(event.target.value)}
              sx={{ mb: 1.5 }}
            />
            <FormControlLabel
              control={<Checkbox checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />}
              label="I confirm the selected products, pricing, and quotation terms."
            />
            <Box sx={{ display: 'flex', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" disabled={acceptMut.isPending} onClick={validateAndAccept} sx={{ fontWeight: 900 }}>
                Accept Quotation
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
