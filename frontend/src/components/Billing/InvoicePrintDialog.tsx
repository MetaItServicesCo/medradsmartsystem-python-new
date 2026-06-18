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
  // Optional fee breakdown (shown before subtotal in print)
  parts_total?: number | null
  worked_hours_fee?: number | null
  setup_fee_extra?: number | null
  service_fee_extra?: number | null
  shipping_fee_extra?: number | null
  application_fee_extra?: number | null
  additional_service_fees?: number | null
  // Service / Inspection invoice fee breakdown
  labor_fees?: number | null
  travel_charges?: number | null
  service_charges?: number | null
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

const softAccentFor = (accent: string) => {
  const normalized = accent.toLowerCase()
  const accents: Record<string, string> = {
    '#7c3aed': '#F5F3FF',
    '#2563eb': '#EFF6FF',
    '#059669': '#ECFDF5',
    '#d97706': '#FFF7ED',
    '#dc2626': '#FEF2F2',
    '#0891b2': '#ECFEFF',
  }
  return accents[normalized] || '#F8FAFC'
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
  body { margin: 0; background: #eef2f7; color: #111827; font-family: Arial, sans-serif; }
  .sheet {
    --accent: #7C3AED;
    --accent-soft: #F5F3FF;
    width: 8.5in;
    min-height: 11in;
    margin: 24px auto;
    padding: 0;
    background: #fff;
    box-shadow: 0 20px 60px rgba(15,23,42,0.16);
    overflow: hidden;
  }
  .hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    padding: 30px 38px 26px;
    color: #fff;
    background: linear-gradient(135deg, var(--accent) 0%, #0EA5E9 58%, #F59E0B 130%);
    position: relative;
  }
  .hero:after {
    content: "";
    position: absolute;
    right: -76px;
    top: -90px;
    width: 230px;
    height: 230px;
    border-radius: 999px;
    background: rgba(255,255,255,0.14);
  }
  .brand { display: flex; gap: 16px; align-items: center; font-size: 22px; font-weight: 800; letter-spacing: 0.02em; position: relative; z-index: 1; }
  .brand img { width: 116px; height: 76px; object-fit: contain; background: #fff; border-radius: 14px; padding: 8px; box-shadow: 0 10px 26px rgba(15,23,42,0.18); }
  .brand small { display: block; font-size: 11px; color: rgba(255,255,255,0.82); margin-top: 5px; letter-spacing: 0.12em; }
  .company-address { margin: 12px 0 0 132px; color: rgba(255,255,255,0.86); line-height: 1.45; font-size: 12px; position: relative; z-index: 1; }
  .title { text-align: right; position: relative; z-index: 1; }
  .title h1 { margin: 0; font-size: 32px; letter-spacing: 0.02em; }
  .title .module { color: rgba(255,255,255,0.82); font-size: 12px; font-weight: 700; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
  .pill { display: inline-block; padding: 7px 13px; border-radius: 999px; background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.28); font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 12px; }
  .content { padding: 34px 38px 38px; }
  .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 18px; }
  .box { border: 1px solid #E5E7EB; border-radius: 14px; padding: 16px; background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%); }
  .box h3 { margin: 0 0 10px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; }
  .box strong.customer { color: #111827; font-size: 17px; }
  .muted { color: #64748B; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; font-size: 13px; }
  .meta strong { color: #475569; }
  .meta span { text-align: right; font-weight: 700; color: #111827; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 24px; font-size: 13px; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; }
  th { text-align: left; background: var(--accent-soft); color: #334155; padding: 12px 11px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #DDD6FE; }
  td { border-bottom: 1px solid #EEF2F7; padding: 12px 11px; vertical-align: top; }
  tr:nth-child(even) td { background: #FAFBFF; }
  tr:last-child td { border-bottom: 0; }
  .item-number { color: var(--accent); font-weight: 800; }
  .item-condition { display: inline-block; margin-top: 5px; color: #64748B; font-size: 11px; }
  .right { text-align: right; }
  .amount { color: #047857; font-weight: 800; }
  .totals { margin-left: auto; margin-top: 22px; width: 310px; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; background: #fff; }
  .totals div { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #EEF2F7; }
  .totals div:last-child { border-bottom: 0; }
  .totals .grand { font-size: 18px; font-weight: 900; color: #fff; background: linear-gradient(135deg, var(--accent) 0%, #0EA5E9 100%); }
  .balance { color: #B91C1C; font-weight: 900; }
  .note { margin-top: 24px; padding: 16px; border: 1px solid #E5E7EB; border-left: 5px solid var(--accent); border-radius: 12px; color: #4b5563; font-size: 13px; background: #F8FAFC; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 54px; }
  .line { border-top: 1px solid #334155; padding-top: 8px; font-size: 12px; color: #4b5563; }
  .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #64748B; font-size: 11px; display: flex; justify-content: space-between; gap: 14px; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: auto; box-shadow: none; page-break-after: always; }
    .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th, .totals .grand { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  accent: string,
) => {
  const title = documentLabel(type, primaryDocumentLabel)
  const accentSoft = softAccentFor(accent)
  const itemRows = lineItems.length ? lineItems.map(item => `
    <tr>
      <td><span class="item-number">${escapeHtml(item.item_number)}</span><br><span class="item-condition">${escapeHtml(item.condition || '')}</span></td>
      <td>${escapeHtml(item.description)}</td>
      <td class="right">${escapeHtml(item.quantity)}</td>
      ${type === 'packing_slip' ? '' : `<td class="right">${escapeHtml(money(item.unit_price))}</td><td class="right">${escapeHtml(money(item.shipping_fee))}</td><td class="right">${escapeHtml(money(item.setup_fee))}</td><td class="right amount">${escapeHtml(money(item.total_amount))}</td>`}
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
      <td class="right amount">${escapeHtml(money(item.amount))}</td>
    </tr>
  `).join('') : '<tr><td colspan="7">No account transactions available.</td></tr>'

  return `
    <main class="sheet" style="--accent:${escapeHtml(accent)}; --accent-soft:${escapeHtml(accentSoft)}">
      <section class="hero">
        <div>
          <div class="brand">
            <img src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" />
            <div>Mr. BioMed Tech Services<small>Biomedical Equipment Repair & Rental Services</small></div>
          </div>
          <p class="company-address">555 N. 5th Street Suite 109<br>Garland, TX 75040</p>
        </div>
        <div class="title">
          <h1>${escapeHtml(title)}</h1>
          <div class="module">${escapeHtml(moduleLabel)} ${escapeHtml(invoice.invoice_type || '')}</div>
          <span class="pill">${escapeHtml(invoice.status)}</span>
        </div>
      </section>

      <section class="content">
      <section class="grid">
        <div class="box">
          <h3>Bill To</h3>
          <strong class="customer">${escapeHtml(invoice.customer_name)}</strong><br>
          <span class="muted">${escapeHtml(invoice.customer_email || '')}</span><br>
          <span class="muted">${escapeHtml(invoice.facility_name || '')}</span>
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
          ${invoice.labor_fees ? `<div><span>Labor Fees</span><strong>${escapeHtml(money(invoice.labor_fees))}</strong></div>` : ''}
          ${invoice.travel_charges ? `<div><span>Travel Charges</span><strong>${escapeHtml(money(invoice.travel_charges))}</strong></div>` : ''}
          ${invoice.service_charges ? `<div><span>Service Charges</span><strong>${escapeHtml(money(invoice.service_charges))}</strong></div>` : ''}
          ${invoice.parts_total != null ? `<div><span>Parts / Rental Total</span><strong>${escapeHtml(money(invoice.parts_total))}</strong></div>` : ''}
          ${invoice.worked_hours_fee ? `<div><span>Working Hours Fee</span><strong>${escapeHtml(money(invoice.worked_hours_fee))}</strong></div>` : ''}
          ${invoice.setup_fee_extra ? `<div><span>Setup Fee</span><strong>${escapeHtml(money(invoice.setup_fee_extra))}</strong></div>` : ''}
          ${invoice.service_fee_extra ? `<div><span>Service Fee</span><strong>${escapeHtml(money(invoice.service_fee_extra))}</strong></div>` : ''}
          ${invoice.shipping_fee_extra ? `<div><span>Shipping / Delivery Fee</span><strong>${escapeHtml(money(invoice.shipping_fee_extra))}</strong></div>` : ''}
          ${invoice.application_fee_extra ? `<div><span>Application / Training Fee</span><strong>${escapeHtml(money(invoice.application_fee_extra))}</strong></div>` : ''}
          ${invoice.additional_service_fees ? `<div><span>Additional Service Fees</span><strong>${escapeHtml(money(invoice.additional_service_fees))}</strong></div>` : ''}
          <div><span>Subtotal</span><strong>${escapeHtml(money(invoice.subtotal))}</strong></div>
          <div><span>Tax</span><strong>${escapeHtml(money(invoice.tax_amount))}</strong></div>
          <div><span>Discount</span><strong>${escapeHtml(money(invoice.discount_amount))}</strong></div>
          <div class="grand"><span>Total</span><span>${escapeHtml(money(invoice.total_amount))}</span></div>
          <div><span>Paid</span><strong>${escapeHtml(money(invoice.amount_paid))}</strong></div>
          <div><span>Balance Due</span><strong class="balance">${escapeHtml(money(invoice.balance_due))}</strong></div>
        </section>
      ` : ''}

      ${invoice.notes ? `<section class="note"><strong>Notes:</strong><br>${escapeHtml(invoice.notes)}</section>` : ''}
      ${type === 'packing_slip' ? '<section class="signature"><div class="line">Packed By</div><div class="line">Received By</div></section>' : ''}
      <section class="footer">
        <span>Mr. BioMed Tech Services</span>
        <span>Generated from Medrad Admin Panel</span>
      </section>
      </section>
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
  const previewAccentSoft = softAccentFor(accent)

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
    const html = buildPrintableHtml(invoice, documentType, lineItems, ledgerTransactions, moduleLabel, primaryDocumentLabel, accent)
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

            <Card sx={{ borderRadius: '18px', border: '1px solid #E5E7EB', bgcolor: '#fff', overflow: 'hidden', boxShadow: '0 18px 45px rgba(15,23,42,0.08)' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                  flexWrap: 'wrap',
                  p: 3,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${accent} 0%, #0EA5E9 65%, #F59E0B 130%)`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ bgcolor: '#fff', borderRadius: '14px', p: 1, boxShadow: '0 10px 24px rgba(15,23,42,0.18)' }}>
                    <Box component="img" src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" sx={{ width: 108, height: 70, objectFit: 'contain', display: 'block' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 950, fontSize: 22 }}>Mr. BioMed Tech Services</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>Biomedical Equipment Repair & Rental Services</Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 950, fontSize: 24 }}>{documentLabel(documentType, primaryDocumentLabel)}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{invoice.invoice_number}</Typography>
                </Box>
              </Box>

              <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pb: 2 }}>
                <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid #E5E7EB', bgcolor: '#F8FAFC' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Customer</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{invoice.customer_name}</Typography>
                  <Typography sx={{ color: '#6B7280' }}>{invoice.customer_email || '-'}</Typography>
                  <Typography sx={{ color: '#6B7280' }}>{invoice.facility_name || '-'}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 2, borderRadius: '14px', border: '1px solid #E5E7EB', bgcolor: previewAccentSoft }}>
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
                  <Box key={`${row.first}-${index}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr' }, gap: 1, p: 1.4, borderRadius: '12px', bgcolor: '#F9FAFB', border: '1px solid #EEF2F7', borderLeft: `4px solid ${accent}` }}>
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
              </Box>
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
