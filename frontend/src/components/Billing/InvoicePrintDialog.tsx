import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'

export type PrintDocumentType = 'invoice' | 'packing_slip' | 'ledger'

export interface PrintableInvoice {
  invoice_number: string
  invoice_type?: string | null
  reference_number?: string | null
  customer_name: string
  customer_email?: string | null
  facility_name?: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  issue_date?: string | null
  due_date?: string | null
  payment_method?: string | null
  notes?: string | null
}

export interface PrintableLineItem {
  item_number: string
  description: string
  quantity: number
  unit_price: number
  shipping_fee?: number
  setup_fee?: number
  condition?: string | null
  total_amount: number
}

export interface PrintableLedgerTransaction {
  id: number
  invoice_number?: string | null
  transaction_type: string
  amount: number
  payment_method?: string | null
  reference_number?: string | null
  description?: string | null
  created_by_name?: string | null
  created_at: string
}

interface InvoicePrintDialogProps {
  open: boolean
  onClose: () => void
  invoice: PrintableInvoice | null
  lineItems: PrintableLineItem[]
  ledgerTransactions: PrintableLedgerTransaction[]
  moduleLabel: string
  primaryDocumentLabel?: string
  accent?: string
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const paymentMethodLabel = (method?: string | null) => {
  if (!method) return '-'
  const labels: Record<string, string> = {
    credit_card: 'Credit Card',
    cheque: 'Cheque',
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    ach: 'ACH',
  }
  return labels[method] || method.replace(/_/g, ' ')
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const printHtml = (title: string, body: string) => {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>${printStyles}</head><body>${body}</body></html>`)
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

const printStyles = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }
  .sheet { width: 8.5in; min-height: 11in; margin: 24px auto; padding: 42px; background: #fff; box-shadow: 0 18px 50px rgba(15,23,42,0.16); }
  .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 18px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.02em; }
  .brand small { display: block; font-size: 11px; color: #6b7280; margin-top: 4px; letter-spacing: 0.12em; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 30px; }
  .pill { display: inline-block; padding: 5px 12px; border-radius: 999px; background: #dcfce7; color: #047857; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
  .box h3 { margin: 0 0 8px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  th { text-align: left; background: #f9fafb; border-bottom: 1px solid #d1d5db; color: #374151; padding: 10px; font-size: 11px; text-transform: uppercase; }
  td { border-bottom: 1px solid #e5e7eb; padding: 10px; vertical-align: top; }
  .right { text-align: right; }
  .totals { margin-left: auto; margin-top: 18px; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e5e7eb; }
  .totals .grand { font-size: 17px; font-weight: 800; border-bottom: 2px solid #111827; }
  .note { margin-top: 24px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px; color: #4b5563; font-size: 13px; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 54px; }
  .line { border-top: 1px solid #111827; padding-top: 8px; font-size: 12px; color: #4b5563; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: auto; box-shadow: none; page-break-after: always; }
  }
</style>
`

const documentLabel = (type: PrintDocumentType, primaryLabel = 'Invoice') => {
  if (type === 'packing_slip') return 'Packing Slip'
  if (type === 'ledger') return 'Account Ledger'
  return primaryLabel
}

const buildPrintableHtml = (
  invoice: PrintableInvoice,
  type: PrintDocumentType,
  lineItems: PrintableLineItem[],
  ledgerTransactions: PrintableLedgerTransaction[],
  moduleLabel: string,
  primaryDocumentLabel: string,
) => {
  const title = documentLabel(type, primaryDocumentLabel)
  const itemRows = lineItems.length ? lineItems.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.item_number)}</strong><br>${escapeHtml(item.condition || '')}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="right">${escapeHtml(item.quantity)}</td>
      ${type === 'packing_slip' ? '' : `<td class="right">${escapeHtml(money(item.unit_price))}</td><td class="right">${escapeHtml(money(item.shipping_fee))}</td><td class="right">${escapeHtml(money(item.setup_fee))}</td><td class="right"><strong>${escapeHtml(money(item.total_amount))}</strong></td>`}
    </tr>
  `).join('') : '<tr><td colspan="7">No line items available.</td></tr>'

  const ledgerRows = ledgerTransactions.length ? ledgerTransactions.map(item => `
    <tr>
      <td>${escapeHtml(formatDate(item.created_at))}</td>
      <td>${escapeHtml(item.invoice_number || invoice.invoice_number)}</td>
      <td>${escapeHtml(item.transaction_type.replace(/_/g, ' '))}</td>
      <td>${escapeHtml(paymentMethodLabel(item.payment_method))}</td>
      <td>${escapeHtml(item.reference_number || '-')}</td>
      <td>${escapeHtml(item.description || '-')}</td>
      <td class="right"><strong>${escapeHtml(money(item.amount))}</strong></td>
    </tr>
  `).join('') : '<tr><td colspan="7">No account transactions available.</td></tr>'

  return `
    <main class="sheet">
      <section class="top">
        <div>
          <div class="brand">Mr. BioMed Tech Services<small>Biomedical Equipment Repair & Rental Services</small></div>
          <p>555 N. 5th Street Suite 109<br>Garland, TX 75040</p>
        </div>
        <div class="title">
          <h1>${escapeHtml(title)}</h1>
          <div>${escapeHtml(moduleLabel)} ${escapeHtml(invoice.invoice_type || '')}</div>
          <span class="pill">${escapeHtml(invoice.status)}</span>
        </div>
      </section>

      <section class="grid">
        <div class="box">
          <h3>Bill To</h3>
          <strong>${escapeHtml(invoice.customer_name)}</strong><br>
          ${escapeHtml(invoice.customer_email || '')}<br>
          ${escapeHtml(invoice.facility_name || '')}
        </div>
        <div class="box meta">
          <strong>${escapeHtml(primaryDocumentLabel)} #</strong><span>${escapeHtml(invoice.invoice_number)}</span>
          <strong>Reference</strong><span>${escapeHtml(invoice.reference_number || '-')}</span>
          <strong>Issued</strong><span>${escapeHtml(formatDate(invoice.issue_date))}</span>
          <strong>Due</strong><span>${escapeHtml(formatDate(invoice.due_date))}</span>
          <strong>Payment</strong><span>${escapeHtml(paymentMethodLabel(invoice.payment_method))}</span>
        </div>
      </section>

      ${type === 'ledger' ? `
        <table>
          <thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th>Method</th><th>Reference</th><th>Description</th><th class="right">Amount</th></tr></thead>
          <tbody>${ledgerRows}</tbody>
        </table>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Item</th><th>Description</th><th class="right">Qty</th>
              ${type === 'packing_slip' ? '' : '<th class="right">Price</th><th class="right">Shipping</th><th class="right">Setup</th><th class="right">Total</th>'}
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      `}

      ${type === 'invoice' ? `
        <section class="totals">
          <div><span>Subtotal</span><strong>${escapeHtml(money(invoice.subtotal))}</strong></div>
          <div><span>Tax</span><strong>${escapeHtml(money(invoice.tax_amount))}</strong></div>
          <div><span>Discount</span><strong>${escapeHtml(money(invoice.discount_amount))}</strong></div>
          <div class="grand"><span>Total</span><span>${escapeHtml(money(invoice.total_amount))}</span></div>
          <div><span>Paid</span><strong>${escapeHtml(money(invoice.amount_paid))}</strong></div>
          <div><span>Balance Due</span><strong>${escapeHtml(money(invoice.balance_due))}</strong></div>
        </section>
      ` : ''}

      ${invoice.notes ? `<section class="note"><strong>Notes:</strong><br>${escapeHtml(invoice.notes)}</section>` : ''}
      ${type === 'packing_slip' ? '<section class="signature"><div class="line">Packed By</div><div class="line">Received By</div></section>' : ''}
    </main>
  `
}

const InvoicePrintDialog = ({
  open,
  onClose,
  invoice,
  lineItems,
  ledgerTransactions,
  moduleLabel,
  primaryDocumentLabel = 'Invoice',
  accent = '#7C3AED',
}: InvoicePrintDialogProps) => {
  const [documentType, setDocumentType] = useState<PrintDocumentType>('invoice')

  const previewRows = useMemo(() => {
    if (documentType === 'ledger') {
      return ledgerTransactions.map(item => ({
        first: formatDate(item.created_at),
        second: item.invoice_number || invoice?.invoice_number || '-',
        third: item.transaction_type.replace(/_/g, ' '),
        amount: money(item.amount),
      }))
    }
    return lineItems.map(item => ({
      first: item.item_number,
      second: item.description,
      third: `Qty ${item.quantity}`,
      amount: documentType === 'packing_slip' ? item.condition || '-' : money(item.total_amount),
    }))
  }, [documentType, invoice?.invoice_number, ledgerTransactions, lineItems])

  const handlePrint = () => {
    if (!invoice) return
    const html = buildPrintableHtml(invoice, documentType, lineItems, ledgerTransactions, moduleLabel, primaryDocumentLabel)
    printHtml(`${invoice.invoice_number} ${documentLabel(documentType, primaryDocumentLabel)}`, html)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
        Print {invoice?.invoice_number || primaryDocumentLabel}
        <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
          Print one clean document at a time.
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#F8FAFC' }}>
        {invoice && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <TextField
                select
                size="small"
                label="Document"
                value={documentType}
                onChange={event => setDocumentType(event.target.value as PrintDocumentType)}
                sx={{ minWidth: 220, bgcolor: '#fff' }}
              >
                <MenuItem value="invoice">{primaryDocumentLabel}</MenuItem>
                <MenuItem value="packing_slip">Packing Slip</MenuItem>
                <MenuItem value="ledger">Account Ledger</MenuItem>
              </TextField>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={invoice.status.replace(/_/g, ' ')} sx={{ bgcolor: `${accent}18`, color: accent, fontWeight: 900, textTransform: 'uppercase' }} />
                <Chip label={`Balance ${money(invoice.balance_due)}`} sx={{ bgcolor: '#fff', fontWeight: 900 }} />
              </Box>
            </Box>

            <Card sx={{ p: 3, borderRadius: '16px', border: '1px solid #E5E7EB', bgcolor: '#fff' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', pb: 2, borderBottom: '2px solid #111827' }}>
                <Box>
                  <Typography sx={{ fontWeight: 950, fontSize: 22 }}>Mr. BioMed Tech Services</Typography>
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>Biomedical Equipment Repair & Rental Services</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 950, fontSize: 24 }}>{documentLabel(documentType, primaryDocumentLabel)}</Typography>
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>{invoice.invoice_number}</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, py: 2 }}>
                <Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Customer</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{invoice.customer_name}</Typography>
                  <Typography sx={{ color: '#6B7280' }}>{invoice.customer_email || '-'}</Typography>
                  <Typography sx={{ color: '#6B7280' }}>{invoice.facility_name || '-'}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Typography sx={{ fontWeight: 900 }}>Reference</Typography><Typography>{invoice.reference_number || '-'}</Typography>
                  <Typography sx={{ fontWeight: 900 }}>Issued</Typography><Typography>{formatDate(invoice.issue_date)}</Typography>
                  <Typography sx={{ fontWeight: 900 }}>Due</Typography><Typography>{formatDate(invoice.due_date)}</Typography>
                  <Typography sx={{ fontWeight: 900 }}>Payment</Typography><Typography>{paymentMethodLabel(invoice.payment_method)}</Typography>
                </Box>
              </Box>

              <Divider />
              <Box sx={{ display: 'grid', gap: 1.2, pt: 2 }}>
                {previewRows.length === 0 ? (
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>No rows available for this document.</Typography>
                ) : previewRows.map((row, index) => (
                  <Box key={`${row.first}-${index}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr' }, gap: 1, p: 1.4, borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                    <Typography sx={{ fontWeight: 900 }}>{row.first}</Typography>
                    <Typography>{row.second}</Typography>
                    <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>{row.third}</Typography>
                    <Typography sx={{ textAlign: { md: 'right' }, fontWeight: 950, color: accent }}>{row.amount}</Typography>
                  </Box>
                ))}
              </Box>

              {documentType === 'invoice' && (
                <Box sx={{ display: 'grid', gap: 0.8, maxWidth: 320, ml: 'auto', mt: 2 }}>
                  {[
                    ['Subtotal', money(invoice.subtotal)],
                    ['Tax', money(invoice.tax_amount)],
                    ['Discount', money(invoice.discount_amount)],
                    ['Total', money(invoice.total_amount)],
                    ['Paid', money(invoice.amount_paid)],
                    ['Balance Due', money(invoice.balance_due)],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: label === 'Total' ? 950 : 800 }}>
                      <span>{label}</span><span>{value}</span>
                    </Box>
                  ))}
                </Box>
              )}
            </Card>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>Close</Button>
        <Button startIcon={<PrintIcon />} onClick={handlePrint} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, bgcolor: accent, '&:hover': { bgcolor: accent } }}>
          Print {documentLabel(documentType, primaryDocumentLabel)}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default InvoicePrintDialog
