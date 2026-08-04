import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'

import SquareCardCheckout from '@/components/Billing/SquareCardCheckout'
import {
  fetchRentalPortal,
  savePublicRentalCard,
  payPublicRentalInvoice,
  type RentalPortalInvoice,
} from '@/api/rentals'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => (value
  ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—')

const statusStyle = (status: string) => (
  status === 'paid' ? { bg: '#DCFCE7', color: '#15803D' }
    : status === 'overdue' ? { bg: '#FEE2E2', color: '#B91C1C' }
      : { bg: '#DBEAFE', color: '#1D4ED8' }
)

const Centered = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F5F3FF', p: 3 }}>
    {children}
  </Box>
)

const ClientRental = () => {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const [payTarget, setPayTarget] = useState<RentalPortalInvoice | null>(null)
  const [showCardSave, setShowCardSave] = useState(false)

  const portalQ = useQuery({
    queryKey: ['rental-portal', token],
    queryFn: () => fetchRentalPortal(token),
    enabled: Boolean(token),
    retry: false,
  })

  const saveCardMut = useMutation({
    mutationFn: (sourceId: string) => savePublicRentalCard(token, sourceId),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      setShowCardSave(false)
      toast.success('Card saved on file for automatic billing')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not save the card'),
  })

  const payMut = useMutation({
    mutationFn: ({ invoiceId, sourceId, idempotencyKey }: { invoiceId: number; sourceId: string; idempotencyKey: string }) =>
      payPublicRentalInvoice(token, invoiceId, sourceId, idempotencyKey),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      setPayTarget(null)
      toast.success('Payment successful — thank you!')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Payment could not be completed'),
  })

  if (portalQ.isLoading) return <Centered><CircularProgress /></Centered>
  if (portalQ.isError || !portalQ.data) {
    return <Centered><Alert severity="error" sx={{ borderRadius: '14px' }}>This rental link is invalid or has expired.</Alert></Centered>
  }

  const { agreement, invoices, square, company_name } = portalQ.data
  const canPay = square.enabled && Boolean(square.application_id) && Boolean(square.location_id)

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#F5F3FF', py: { xs: 2, md: 5 }, px: 2 }}>
      <Card sx={{ width: 'min(900px, 100%)', mx: 'auto', p: { xs: 2, md: 4 }, borderRadius: '24px', boxShadow: '0 24px 70px rgba(30,58,138,0.14)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box component="img" src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" sx={{ width: 90, height: 58, objectFit: 'contain' }} />
            <Box>
              <Typography sx={{ color: '#2563EB', fontWeight: 900, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' }}>Rental Agreement</Typography>
              <Typography variant="h4" sx={{ fontWeight: 950, color: '#1E3A8A', letterSpacing: '-0.5px' }}>{agreement.rental_number}</Typography>
              <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{company_name}</Typography>
            </Box>
          </Box>
          <Chip label={agreement.status} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: statusStyle(agreement.status).bg, color: statusStyle(agreement.status).color }} />
        </Box>

        <Box sx={{ height: 4, borderRadius: 999, my: 3, background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 60%, #F59E0B 100%)' }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
          <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <Typography sx={{ color: '#2563EB', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Prepared for</Typography>
            <Typography sx={{ color: '#1E3A8A', fontWeight: 900, fontSize: 20, mt: 0.4 }}>{agreement.customer_name}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{agreement.customer_email}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{agreement.customer_address}</Typography>
          </Box>
          <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.8, alignContent: 'start' }}>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Billing</Typography><Typography sx={{ textAlign: 'right', textTransform: 'capitalize' }}>{agreement.billing_frequency}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Period</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(agreement.start_date)} – {dateLabel(agreement.end_date)}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Security Deposit</Typography><Typography sx={{ textAlign: 'right' }}>{money(agreement.security_deposit)}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Auto-charge</Typography><Typography sx={{ textAlign: 'right' }}>{agreement.auto_charge ? 'Enabled' : 'Off'}</Typography>
          </Box>
        </Box>

        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Rented Items</Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', mb: 3 }}>
          <Table size="small" sx={{ minWidth: 620 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 900 }}>Product</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Ship &amp; Pack</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Deliv &amp; Setup</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900 }}>Labor</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agreement.items.map(item => (
                <TableRow key={item.id}>
                  <TableCell><Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.part_number}</Typography><Typography sx={{ fontSize: 12, color: '#6B7280' }}>{item.part_description}</Typography></TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell align="right">{money(item.rental_rate)}</TableCell>
                  <TableCell align="right">{money(item.shipping_fee)}</TableCell>
                  <TableCell align="right">{money(item.setup_fee)}</TableCell>
                  <TableCell align="right">{money(item.labor_fee)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {/* Card on file */}
        {canPay && (
          <Card variant="outlined" sx={{ p: 2, borderRadius: '16px', mb: 3, borderColor: '#BFDBFE', bgcolor: '#F8FBFF' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Card on file</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                  {agreement.has_card_on_file ? 'A card is saved for automatic billing each period.' : 'Save a card to enable automatic billing each period.'}
                </Typography>
              </Box>
              <Chip label={agreement.has_card_on_file ? 'Saved' : 'Not saved'} sx={{ fontWeight: 900, bgcolor: agreement.has_card_on_file ? '#DCFCE7' : '#FEF3C7', color: agreement.has_card_on_file ? '#15803D' : '#B45309' }} />
            </Box>
            {!showCardSave ? (
              <Button startIcon={<CreditCardIcon />} variant="outlined" onClick={() => setShowCardSave(true)} sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 800, textTransform: 'none' }}>
                {agreement.has_card_on_file ? 'Replace card on file' : 'Save a card on file'}
              </Button>
            ) : (
              <Box sx={{ mt: 2 }}>
                <SquareCardCheckout
                  applicationId={square.application_id!}
                  locationId={square.location_id!}
                  sdkUrl={square.sdk_url}
                  amount={0}
                  currency={square.currency}
                  payerName={agreement.customer_name}
                  payerEmail={agreement.customer_email}
                  intent="STORE"
                  submitLabel="Save card on file"
                  processing={saveCardMut.isPending}
                  onPaymentToken={(sourceId) => saveCardMut.mutate(sourceId)}
                />
                <Button onClick={() => setShowCardSave(false)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
              </Box>
            )}
          </Card>
        )}

        {/* Invoices */}
        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Invoices</Typography>
        {invoices.length === 0 ? (
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>No invoices yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {invoices.map(invoice => {
              const style = statusStyle(invoice.status)
              const unpaid = Number(invoice.balance_due || 0) > 0 && invoice.status !== 'paid'
              return (
                <Card key={invoice.id} variant="outlined" sx={{ p: 2, borderRadius: '14px' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>{invoice.invoice_number}</Typography>
                      <Typography sx={{ color: '#6B7280', fontSize: 13 }}>{invoice.notes || 'Rental invoice'} · due {dateLabel(invoice.due_date)}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 950, color: '#1E3A8A', fontSize: 18 }}>{money(invoice.total_amount)}</Typography>
                      <Chip size="small" label={invoice.status.replace('_', ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} />
                    </Box>
                  </Box>
                  {(invoice.line_items || []).length > 0 && (
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #EEF0F6', display: 'grid', gap: 0.3 }}>
                      {invoice.line_items.map((li, index) => (
                        <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                          <span>{li.description}{li.quantity && Number(li.quantity) > 1 ? ` × ${li.quantity}` : ''}</span>
                          <span>{money(li.total_amount)}</span>
                        </Box>
                      ))}
                      {Number(invoice.tax_amount || 0) > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}><span>Tax</span><span>{money(invoice.tax_amount)}</span></Box>
                      )}
                    </Box>
                  )}
                  {unpaid && canPay && (
                    payTarget?.id === invoice.id ? (
                      <Box sx={{ mt: 2 }}>
                        <SquareCardCheckout
                          applicationId={square.application_id!}
                          locationId={square.location_id!}
                          sdkUrl={square.sdk_url}
                          amount={Number(invoice.balance_due || 0)}
                          currency={square.currency}
                          payerName={agreement.customer_name}
                          payerEmail={agreement.customer_email}
                          processing={payMut.isPending}
                          onPaymentToken={(sourceId, idempotencyKey) => payMut.mutate({ invoiceId: invoice.id, sourceId, idempotencyKey })}
                        />
                        <Button onClick={() => setPayTarget(null)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
                      </Box>
                    ) : (
                      <Button variant="contained" startIcon={<CreditCardIcon />} onClick={() => setPayTarget(invoice)} sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
                        Pay {money(invoice.balance_due)}
                      </Button>
                    )
                  )}
                </Card>
              )
            })}
          </Box>
        )}

        {agreement.terms_and_conditions && (
          <Box sx={{ mt: 3, p: 2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
            <Typography sx={{ color: '#7C3AED', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', mb: 0.5 }}>Terms &amp; Conditions</Typography>
            <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 13 }}>{agreement.terms_and_conditions}</Typography>
          </Box>
        )}
      </Card>
    </Box>
  )
}

export default ClientRental
