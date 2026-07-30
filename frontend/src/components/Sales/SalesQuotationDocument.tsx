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
import { calculateSalesPricing, SALES_TAX_RATE } from '@/utils/salesPricing'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—'

export interface SalesQuotationDocumentData {
  quotation_number: string
  work_order?: string | null
  quotation_type: string
  status: string
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
  const statusLabel = quotation.status.replace(/_/g, ' ')
  const hasSelection = quotation.quotation_type !== 'standard'

  const summaryRows: Array<{
    label: string
    value: number
    negative?: boolean
  }> = [
    { label: 'Parts', value: pricing.merchandise },
    { label: 'Shipping & Packing', value: pricing.shippingPacking },
    { label: 'Delivery & Setup', value: pricing.deliverySetup },
    { label: 'Labor (non-taxable)', value: pricing.labor },
    ...(pricing.tradeInCredit > 0
      ? [{ label: 'Trade-In Credit', value: pricing.tradeInCredit, negative: true }]
      : []),
    ...(pricing.refundCredit > 0
      ? [{ label: 'Refund Payment', value: pricing.refundCredit, negative: true }]
      : []),
    { label: 'Subtotal', value: pricing.subtotal },
    { label: 'Taxable Amount', value: pricing.taxableBase },
    { label: `Sales Tax (${SALES_TAX_RATE}%)`, value: pricing.taxAmount },
    ...(pricing.discountAmount > 0
      ? [{ label: 'Discount', value: pricing.discountAmount, negative: true }]
      : []),
  ]

  return (
    <Box>
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
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{companyName}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'start', '@media print': { display: 'none' } }}>
          <Chip label={statusLabel} sx={{ textTransform: 'capitalize', fontWeight: 900, bgcolor: '#EDE9FE', color: '#6D28D9' }} />
          {onSignAndApprove && (
            <Button variant="contained" onClick={onSignAndApprove} sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}>
              Sign & Approve
            </Button>
          )}
          {onPrint && <Button startIcon={<PrintIcon />} variant="outlined" onClick={onPrint}>Print</Button>}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 4 }}>
        <Box>
          <Typography sx={{ color: '#6B7280', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>Prepared for</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 20 }}>{recipientName || quotation.customer_name}</Typography>
          {(recipientEmail || quotation.customer_email) && <Typography sx={{ color: '#4B5563' }}>{recipientEmail || quotation.customer_email}</Typography>}
          <Typography sx={{ color: '#4B5563' }}>{quotation.facility_name || quotation.customer_name}</Typography>
          {quotation.customer_address && <Typography sx={{ color: '#4B5563' }}>{quotation.customer_address}</Typography>}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.8, justifySelf: { md: 'end' } }}>
          <Typography sx={{ fontWeight: 900 }}>Quote</Typography><Typography>{quotation.quotation_number}</Typography>
          {quotation.work_order && <><Typography sx={{ fontWeight: 900 }}>Work Order</Typography><Typography>{quotation.work_order}</Typography></>}
          <Typography sx={{ fontWeight: 900 }}>Issued</Typography><Typography>{dateLabel(quotation.sent_at || quotation.created_at)}</Typography>
          {quotation.expires_at ? (
            <><Typography sx={{ fontWeight: 900 }}>Expires</Typography><Typography>{dateLabel(quotation.expires_at)}</Typography></>
          ) : quotation.requested_date ? (
            <><Typography sx={{ fontWeight: 900 }}>Requested</Typography><Typography>{dateLabel(quotation.requested_date)}</Typography></>
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
        <Table sx={{ minWidth: 1050 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#F8FAFC' }}>
              {hasSelection && <TableCell sx={{ width: 60, fontWeight: 900 }}>Select</TableCell>}
              <TableCell sx={{ fontWeight: 900 }}>Item</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Quantity</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Part Amount</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Shipping & Packing</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Delivery & Setup</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Labor</TableCell>
              <TableCell sx={{ fontWeight: 900 }} align="right">Line Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...productLines, ...creditLines].map(line => {
              const isCredit = line.item_kind !== 'product'
              const selected = isCredit || quotation.quotation_type === 'standard' || effectiveSelectedIds.includes(line.id)
              return (
                <TableRow
                  key={line.id}
                  hover={!isCredit && canSelect}
                  onClick={() => !isCredit && canSelect && onToggleProduct?.(line)}
                  sx={{
                    cursor: !isCredit && canSelect && hasSelection ? 'pointer' : 'default',
                    opacity: selected ? 1 : 0.5,
                    bgcolor: selected ? '#FFFFFF' : '#F8FAFC',
                  }}
                >
                  {hasSelection && (
                    <TableCell>
                      {isCredit ? <CheckCircleOutlineIcon color="success" /> : quotation.quotation_type === 'choice_single'
                        ? <Radio checked={selected} disabled={!canSelect} />
                        : <Checkbox checked={selected} disabled={!canSelect} />}
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 900 }}>
                    {line.item_kind === 'refund'
                      ? 'Refund'
                      : line.item_kind === 'trade_in'
                        ? line.trade_in_part?.part_number || 'Trade-In'
                        : line.part_number || 'Product'}
                  </TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">{line.quantity}</TableCell>
                  <TableCell align="right">{money(Number(line.quantity || 0) * Number(line.unit_price || 0))}</TableCell>
                  <TableCell align="right">{money(line.shipping_fee)}</TableCell>
                  <TableCell align="right">{money(line.setup_fee)}</TableCell>
                  <TableCell align="right">
                    <Box>
                      <Typography component="span" sx={{ fontWeight: 800 }}>{money(line.labor_fee)}</Typography>
                      {Number(line.labor_fee || 0) > 0 && <Typography sx={{ fontSize: 10, color: '#64748B' }}>Non-taxable</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, color: isCredit ? '#DC2626' : '#1E1B4B' }}>{money(line.total)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ ml: 'auto', width: { xs: '100%', sm: 430 }, mb: 4 }}>
        {summaryRows.map(({ label, value, negative }, index) => (
          <Box
            key={label}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 2,
              py: index >= summaryRows.length - 3 ? 0.7 : 0.45,
              borderTop: label === 'Subtotal' ? '1px solid #E5E7EB' : undefined,
              mt: label === 'Subtotal' ? 0.7 : 0,
            }}
          >
            <Typography sx={{ color: '#475569', fontWeight: label === 'Subtotal' ? 900 : 700 }}>{label}</Typography>
            <Typography sx={{ textAlign: 'right', color: negative ? '#DC2626' : '#1E1B4B', fontWeight: label === 'Subtotal' ? 900 : 700 }}>
              {negative ? '-' : ''}{money(value)}
            </Typography>
          </Box>
        ))}
        <Box sx={{ mt: 1, pt: 1.3, borderTop: '2px solid #312E81', display: 'grid', gridTemplateColumns: '1fr auto', gap: 2 }}>
          <Typography sx={{ fontWeight: 950, fontSize: 21, color: '#1E1B4B' }}>Total</Typography>
          <Typography sx={{ fontWeight: 950, fontSize: 21, color: '#059669' }}>{money(pricing.total)}</Typography>
        </Box>
      </Box>

      {quotation.notes && <Alert icon={false} sx={{ mb: 3 }}>{quotation.notes}</Alert>}
    </Box>
  )
}

export default SalesQuotationDocument
