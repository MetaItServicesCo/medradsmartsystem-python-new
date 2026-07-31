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
import { calculateSalesPricing } from '@/utils/salesPricing'
import SalesPricingBreakdown from './SalesPricingBreakdown'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—'

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  accepted: { bg: '#DCFCE7', color: '#15803D' },
  completed: { bg: '#DCFCE7', color: '#15803D' },
  paid: { bg: '#DCFCE7', color: '#15803D' },
  sent: { bg: '#EDE9FE', color: '#6D28D9' },
  viewed: { bg: '#DBEAFE', color: '#1D4ED8' },
  changes_requested: { bg: '#FEF3C7', color: '#B45309' },
  declined: { bg: '#FEE2E2', color: '#B91C1C' },
  cancelled: { bg: '#FEE2E2', color: '#B91C1C' },
  pending: { bg: '#F1F5F9', color: '#475569' },
}

export interface SalesQuotationDocumentData {
  quotation_number: string
  work_order?: string | null
  quotation_type: string
  status: string
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
  const isInvoice = Boolean(invoiceNumber)
  const documentLabel = isInvoice ? 'Invoice' : 'Quotation'
  const statusKey = invoicePaid ? 'paid' : quotation.status
  const statusLabel = statusKey.replace(/_/g, ' ')
  const statusStyle = STATUS_STYLES[statusKey] ?? STATUS_STYLES.pending

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.2 }}>
          <Box
            component="img"
            src="/mr-biomed-logo.jpeg"
            alt="Mr. BioMed Tech Services"
            sx={{ width: 92, height: 60, display: 'block', objectFit: 'contain' }}
          />
          <Box>
            <Typography sx={{ color: '#8B5CF6', fontWeight: 900, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' }}>
              {isInvoice ? 'Sales Invoice' : 'Sales Quotation'}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, color: '#1E1B4B', lineHeight: 1.05, letterSpacing: '-0.5px' }}>
              {documentLabel}
            </Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{companyName}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            label={statusLabel}
            sx={{ textTransform: 'capitalize', fontWeight: 900, bgcolor: statusStyle.bg, color: statusStyle.color }}
          />
          {showRevision && Number(quotation.revision || 1) > 1 && (
            <Chip
              label={`Rev ${quotation.revision}`}
              sx={{ fontWeight: 900, bgcolor: '#EDE9FE', color: '#6D28D9' }}
            />
          )}
          <Box sx={{ display: 'flex', gap: 1, '@media print': { display: 'none' } }}>
            {onSignAndApprove && (
              <Button variant="contained" onClick={onSignAndApprove} sx={{ fontWeight: 900, whiteSpace: 'nowrap', borderRadius: '12px' }}>
                Sign & Approve
              </Button>
            )}
            {onPrint && <Button startIcon={<PrintIcon />} variant="outlined" onClick={onPrint} sx={{ borderRadius: '12px' }}>Print</Button>}
          </Box>
        </Box>
      </Box>

      <Box sx={{ height: 4, borderRadius: 999, mb: 3.5, background: 'linear-gradient(90deg, #7C3AED 0%, #EC4899 58%, #F59E0B 100%)' }} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 4 }}>
        <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
          <Typography sx={{ color: '#8B5CF6', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Prepared for</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 20, mt: 0.4 }}>{recipientName || quotation.customer_name}</Typography>
          {(recipientEmail || quotation.customer_email) && <Typography sx={{ color: '#4B5563' }}>{recipientEmail || quotation.customer_email}</Typography>}
          <Typography sx={{ color: '#4B5563' }}>{quotation.facility_name || quotation.customer_name}</Typography>
          {quotation.customer_address && <Typography sx={{ color: '#4B5563' }}>{quotation.customer_address}</Typography>}
        </Box>
        <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.8, alignContent: 'start' }}>
          <Typography sx={{ fontWeight: 900, color: '#64748B' }}>{isInvoice ? 'Invoice #' : 'Quote #'}</Typography>
          <Typography sx={{ fontWeight: 900, textAlign: 'right', color: '#1E1B4B' }}>{isInvoice ? invoiceNumber : quotation.quotation_number}</Typography>
          {isInvoice && <><Typography sx={{ fontWeight: 900, color: '#64748B' }}>Quote #</Typography><Typography sx={{ textAlign: 'right' }}>{quotation.quotation_number}</Typography></>}
          {quotation.work_order && <><Typography sx={{ fontWeight: 900, color: '#64748B' }}>Work Order</Typography><Typography sx={{ textAlign: 'right' }}>{quotation.work_order}</Typography></>}
          <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Issued</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(quotation.sent_at || quotation.created_at)}</Typography>
          {quotation.expires_at ? (
            <><Typography sx={{ fontWeight: 900, color: '#64748B' }}>{isInvoice ? 'Due' : 'Expires'}</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(quotation.expires_at)}</Typography></>
          ) : quotation.requested_date ? (
            <><Typography sx={{ fontWeight: 900, color: '#64748B' }}>Requested</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(quotation.requested_date)}</Typography></>
          ) : null}
        </Box>
      </Box>

      {hasSelection && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {quotation.quotation_type === 'choice_single'
            ? 'Choose one of the following sales options.'
            : 'Choose one or more of the following sales options.'}
        </Alert>
      )}

      <TableContainer sx={{ mb: 3, overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px' }}>
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
        <SalesPricingBreakdown pricing={pricing} />
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
