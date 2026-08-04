import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PrintIcon from '@mui/icons-material/Print'

import type { SalesQuotationLineItem } from '@/api/sales'
import {
  CustomerDetailsCard,
  CustomerDocumentHeader,
  CustomerDocumentProgress,
  CustomerRecipientCard,
} from '@/components/Documents/CustomerDocumentUI'
import { calculateSalesPricing, SALES_TAX_RATE } from '@/utils/salesPricing'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—'

export interface SalesQuotationDocumentData {
  quotation_number: string
  document_kind?: 'quotation' | 'direct_invoice'
  work_order?: string | null
  quotation_type: string
  status: string
  selection_status?: string | null
  revision?: number | null
  facility_name?: string | null
  customer_name: string
  customer_email?: string | null
  customer_address?: string | null
  sent_at?: string | null
  created_at?: string | null
  expires_at?: string | null
  requested_date?: string | null
  notes?: string | null
  discount_amount?: number | string | null
  line_items: SalesQuotationLineItem[]
}

interface SalesQuotationDocumentProps {
  quotation: SalesQuotationDocumentData
  companyName: string
  recipientName?: string | null
  recipientEmail?: string | null
  selectedLineItemIds?: number[]
  canSelect?: boolean
  onToggleProduct?: (line: SalesQuotationLineItem) => void
  onSignAndApprove?: () => void
  onPrint?: () => void
  // Once the quotation is accepted an invoice is raised; passing it flips the
  // document header from "Quotation" to "Invoice".
  invoiceNumber?: string | null
  invoicePaid?: boolean
  invoiceAmountPaid?: number | string | null
  invoiceBalanceDue?: number | string | null
  // Internal surfaces (the admin View dialog) set this to surface the revision
  // number; the customer-facing document leaves it off so revisions stay internal.
  showRevision?: boolean
}

const SalesQuotationDocument = ({
  quotation,
  companyName,
  recipientName,
  recipientEmail,
  selectedLineItemIds = [],
  canSelect = false,
  onToggleProduct,
  onSignAndApprove,
  onPrint,
  invoiceNumber,
  invoicePaid = false,
  invoiceAmountPaid,
  invoiceBalanceDue,
  showRevision = false,
}: SalesQuotationDocumentProps) => {
  const productLines = quotation.line_items.filter(line => line.item_kind === 'product')
  const creditLines = quotation.line_items.filter(line => line.item_kind !== 'product')
  const effectiveSelectedIds = quotation.quotation_type === 'standard'
    ? productLines.map(line => line.id)
    : selectedLineItemIds
  const selectedLines = [
    ...productLines.filter(line => quotation.quotation_type === 'standard' || effectiveSelectedIds.includes(line.id)),
    ...creditLines,
  ]
  const pricing = calculateSalesPricing(selectedLines, Number(quotation.discount_amount || 0))
  const hasSelection = quotation.quotation_type !== 'standard'
  const isDirectInvoice = quotation.document_kind === 'direct_invoice'
  const isInvoice = isDirectInvoice || Boolean(invoiceNumber)
  const documentLabel = isInvoice ? 'Invoice' : 'Quotation'
  const statusKey = invoicePaid ? 'paid' : quotation.status
  const isAccepted = quotation.selection_status === 'accepted' || quotation.status === 'accepted'

  const headCellSx = {
    fontWeight: 800,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#64748B',
    py: 1.4,
    whiteSpace: 'nowrap' as const,
  }
  const numSx = { fontVariantNumeric: 'tabular-nums' as const, color: '#334155' }

  return (
    <Box>
      <CustomerDocumentHeader
        label={isInvoice ? 'Sales Invoice' : 'Sales Quotation'}
        number={isInvoice ? invoiceNumber || quotation.quotation_number : quotation.quotation_number}
        companyName={companyName}
        meta={isInvoice && !isDirectInvoice ? `Quotation ${quotation.quotation_number}` : undefined}
        status={statusKey}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, '@media print': { display: 'none' } }}>
          {showRevision && Number(quotation.revision || 1) > 1 && (
            <Chip
              label={`Rev ${quotation.revision}`}
              sx={{ fontWeight: 900, bgcolor: '#EDE9FE', color: '#6D28D9' }}
            />
          )}
          {onSignAndApprove && (
            <Button variant="contained" onClick={onSignAndApprove} sx={{ fontWeight: 900, whiteSpace: 'nowrap', borderRadius: '12px' }}>
              Sign &amp; Approve
            </Button>
          )}
          {onPrint && <Button startIcon={<PrintIcon />} variant="outlined" onClick={onPrint} sx={{ borderRadius: '12px' }}>Print / Save PDF</Button>}
          </Box>
        )}
      />

      <CustomerDocumentProgress steps={[
        { label: `Review ${isInvoice ? 'invoice' : 'quotation'}`, complete: true },
        { label: isAccepted ? `${isInvoice ? 'Invoice' : 'Quotation'} signed` : `Sign ${isInvoice ? 'invoice' : 'quotation'}`, complete: isAccepted },
        { label: invoicePaid ? 'Payment complete' : 'Pay invoice', complete: invoicePaid },
      ]} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 4 }}>
        <CustomerRecipientCard
          name={recipientName || quotation.customer_name}
          email={recipientEmail || quotation.customer_email}
          organization={quotation.facility_name || quotation.customer_name}
          address={quotation.customer_address}
        />
        <CustomerDetailsCard rows={[
          { label: isInvoice ? 'Invoice #' : 'Quote #', value: isInvoice ? invoiceNumber || quotation.quotation_number : quotation.quotation_number },
          ...(isInvoice && !isDirectInvoice ? [{ label: 'Quote #', value: quotation.quotation_number }] : []),
          ...(quotation.work_order ? [{ label: 'Work Order', value: quotation.work_order }] : []),
          { label: 'Issued', value: dateLabel(quotation.sent_at || quotation.created_at) },
          ...(quotation.expires_at
            ? [{ label: isInvoice ? 'Due' : 'Expires', value: dateLabel(quotation.expires_at) }]
            : quotation.requested_date
              ? [{ label: 'Requested', value: dateLabel(quotation.requested_date) }]
              : []),
        ]} />
      </Box>

      {hasSelection && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {quotation.quotation_type === 'choice_single'
            ? 'Choose one of the following sales options.'
            : 'Choose one or more of the following sales options.'}
        </Alert>
      )}

      <TableContainer sx={{ mb: 3, overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', '@media print': { overflow: 'visible' } }}>
        <Table sx={{ minWidth: 1050, '& td, & th': { borderColor: '#EEF0F6' } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              {hasSelection && <TableCell sx={{ ...headCellSx, width: 60 }}>Select</TableCell>}
              <TableCell sx={headCellSx}>Item</TableCell>
              <TableCell sx={headCellSx}>Description</TableCell>
              <TableCell sx={headCellSx} align="right">Qty</TableCell>
              <TableCell sx={headCellSx} align="right">Part Amount</TableCell>
              <TableCell sx={headCellSx} align="right">Shipping &amp; Packing</TableCell>
              <TableCell sx={headCellSx} align="right">Delivery &amp; Setup</TableCell>
              <TableCell sx={headCellSx} align="right">Labor</TableCell>
              <TableCell sx={headCellSx} align="right">Line Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...productLines, ...creditLines].map((line, rowIndex) => {
              const isCredit = line.item_kind !== 'product'
              const selected = isCredit || quotation.quotation_type === 'standard' || effectiveSelectedIds.includes(line.id)
              const itemName = line.item_kind === 'refund'
                ? 'Refund'
                : line.item_kind === 'trade_in'
                  ? line.trade_in_part?.part_number || 'Trade-In'
                  : line.part_number || 'Product'
              const typeChip = line.item_kind === 'refund'
                ? { label: 'Refund', color: 'error' as const }
                : line.item_kind === 'trade_in'
                  ? { label: 'Trade-In', color: 'warning' as const }
                  : null
              return (
                <TableRow
                  key={line.id}
                  hover={!isCredit && canSelect}
                  onClick={() => !isCredit && canSelect && onToggleProduct?.(line)}
                  sx={{
                    cursor: !isCredit && canSelect && hasSelection ? 'pointer' : 'default',
                    opacity: selected ? 1 : 0.45,
                    bgcolor: selected ? (rowIndex % 2 ? '#FCFCFF' : '#FFFFFF') : '#F8FAFC',
                    '& td': { py: 1.35 },
                  }}
                >
                  {hasSelection && (
                    <TableCell>
                      {isCredit ? <CheckCircleOutlineIcon color="success" /> : quotation.quotation_type === 'choice_single'
                        ? <Radio checked={selected} disabled={!canSelect} />
                        : <Checkbox checked={selected} disabled={!canSelect} />}
                    </TableCell>
                  )}
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                      <Typography component="span" sx={{ fontWeight: 900, color: '#1E1B4B' }}>{itemName}</Typography>
                      {typeChip && <Chip size="small" label={typeChip.label} color={typeChip.color} sx={{ height: 20, fontWeight: 800 }} />}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#475569' }}>{line.description}</TableCell>
                  <TableCell align="right" sx={numSx}>{line.quantity}</TableCell>
                  <TableCell align="right" sx={numSx}>{money(Number(line.quantity || 0) * Number(line.unit_price || 0))}</TableCell>
                  <TableCell align="right" sx={numSx}>{money(line.shipping_fee)}</TableCell>
                  <TableCell align="right" sx={numSx}>{money(line.setup_fee)}</TableCell>
                  <TableCell align="right" sx={numSx}>
                    <Box>
                      <Typography component="span" sx={{ fontWeight: 800 }}>{money(line.labor_fee)}</Typography>
                      {Number(line.labor_fee || 0) > 0 && <Typography sx={{ fontSize: 10, color: '#94A3B8' }}>Non-taxable</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ ...numSx, fontWeight: 900, color: isCredit ? '#DC2626' : '#1E1B4B' }}>{money(line.total)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mb: 4 }}>
        <Typography sx={{ mb: 1, color: '#1E1B4B', fontWeight: 900 }}>
          {isInvoice ? 'Invoice Summary' : 'Quotation Summary'}
        </Typography>
        <TableContainer
          sx={{
            width: '100%',
            maxWidth: 620,
            ml: 'auto',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: '#FFFFFF',
          }}
        >
          <Table size="small" aria-label={`${documentLabel} summary`}>
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>Subtotal</TableCell>
                <TableCell align="right" sx={numSx}>{money(pricing.subtotal)}</TableCell>
              </TableRow>
              {pricing.discountAmount > 0 && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, color: '#DC2626' }}>Discount</TableCell>
                  <TableCell align="right" sx={{ ...numSx, color: '#DC2626' }}>-{money(pricing.discountAmount)}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>Tax ({SALES_TAX_RATE}%)</TableCell>
                <TableCell align="right" sx={numSx}>{money(pricing.taxAmount)}</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 950 }}>{documentLabel} Total</TableCell>
                <TableCell align="right" sx={{ ...numSx, fontWeight: 950, color: '#1E1B4B' }}>{money(pricing.total)}</TableCell>
              </TableRow>
              {isInvoice && invoiceAmountPaid !== undefined && invoiceAmountPaid !== null && Number(invoiceAmountPaid) > 0 && (
                <TableRow>
                  <TableCell sx={{ fontWeight: 800, color: '#059669' }}>Paid</TableCell>
                  <TableCell align="right" sx={{ ...numSx, color: '#059669', fontWeight: 800 }}>{money(invoiceAmountPaid)}</TableCell>
                </TableRow>
              )}
              {isInvoice && invoiceBalanceDue !== undefined && invoiceBalanceDue !== null && (
                <TableRow sx={{ bgcolor: '#EEF2FF' }}>
                  <TableCell sx={{ fontWeight: 950 }}>Balance Due</TableCell>
                  <TableCell align="right" sx={{ ...numSx, fontWeight: 950 }}>{money(invoiceBalanceDue)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {quotation.notes && (
        <Box sx={{ mb: 3, p: 2.2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
          <Typography sx={{ color: '#8B5CF6', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', mb: 0.6 }}>
            Notes
          </Typography>
          <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{quotation.notes}</Typography>
        </Box>
      )}

      <Box sx={{ height: 3, borderRadius: 999, mt: 4, mb: 2.5, background: 'linear-gradient(90deg, #7C3AED 0%, #EC4899 58%, #F59E0B 100%)' }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 15 }}>Thank you for your business.</Typography>
          <Typography sx={{ color: '#6B7280', fontSize: 13, mt: 0.3 }}>{companyName}</Typography>
        </Box>
        <Typography sx={{ color: '#94A3B8', fontSize: 12, maxWidth: 380, textAlign: { xs: 'left', sm: 'right' }, lineHeight: 1.55 }}>
          {isInvoice
            ? `Payment is due by the date shown above. Please reference ${invoiceNumber} on all correspondence.`
            : 'This quotation is valid until the date shown above. Pricing and availability are subject to change thereafter.'}
        </Typography>
      </Box>
    </Box>
  )
}

export default SalesQuotationDocument
