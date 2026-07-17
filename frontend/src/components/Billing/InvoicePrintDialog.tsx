import { useEffect, useMemo, useState } from 'react'
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
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { formatUSPhone, formatUSPhoneInput } from '@/utils/formatters'

export type PrintDocumentType = 'invoice' | 'packing_slip' | 'ledger'

export interface PrintableInvoiceLabels {
  billTo?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  reference?: string
  issued?: string
  due?: string
  payment?: string
  status?: string
  itemNumber?: string
  description?: string
  quantity?: string
  unitPrice?: string
  shipping?: string
  setup?: string
  lineTotal?: string
  condition?: string
  laborFees?: string
  travelCharges?: string
  serviceCharges?: string
  partsTotal?: string
  workedHoursFee?: string
  setupFeeExtra?: string
  serviceFeeExtra?: string
  shippingFeeExtra?: string
  applicationFeeExtra?: string
  additionalServiceFees?: string
  subtotal?: string
  tax?: string
  discount?: string
  total?: string
  paid?: string
  balanceDue?: string
  notes?: string
}

export interface PrintableInvoice {
  invoice_number: string
  invoice_type?: string | null
  reference_number?: string | null
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
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
  labels?: PrintableInvoiceLabels | null
  summary_rows?: PrintableInvoiceSummaryRow[] | null
}

export interface PrintableInvoiceCustomCell {
  id: string
  label: string
  value: string
}

export interface PrintableInvoiceSummaryRow {
  id: string
  label: string
  value: number
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
  /** Per-row unit label (e.g. 'Hours', 'Miles', 'Qty'). When set, overrides the column-level quantityLabel for this row. */
  unitLabel?: string
  custom_cells?: PrintableInvoiceCustomCell[]
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

export interface PrintablePaidQuotationLineItem {
  description: string
  quantity?: number
  unit_price?: number
  total?: number
  item_type?: string | null
}

export interface PrintablePaidQuotation {
  id?: number
  quotation_number: string
  description?: string | null
  amount?: number
  paid_amount: number
  paid_at?: string | null
  payment_method?: string | null
  reference_number?: string | null
  line_items?: PrintablePaidQuotationLineItem[]
}

export interface PrintableInvoiceEditPayload {
  customer_name?: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  subtotal?: number
  tax_amount?: number
  discount_amount?: number
  total_amount?: number
  amount_paid?: number
  issue_date?: string | null
  due_date?: string | null
  status?: string
  payment_method?: string | null
  notes?: string | null
  line_items?: PrintableLineItem[]
  labels?: PrintableInvoiceLabels
  summary_rows?: PrintableInvoiceSummaryRow[]
}

interface InvoicePrintDialogProps {
  open: boolean
  onClose: () => void
  invoice: PrintableInvoice | null
  lineItems: PrintableLineItem[]
  ledgerTransactions: PrintableLedgerTransaction[]
  paidQuotations?: PrintablePaidQuotation[]
  moduleLabel: string
  primaryDocumentLabel?: string
  accent?: string
  /** Override the "Qty" column header label (e.g. "Hours" for service invoices). */
  quantityLabel?: string
  /** Optional HTML appended after the invoice sheet (e.g. service report). */
  appendHtml?: string
  mode?: 'print' | 'edit' | 'view'
  onSave?: (payload: PrintableInvoiceEditPayload) => void
  saving?: boolean
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const statusOptions = ['draft', 'sent', 'approved', 'pending', 'partially_paid', 'paid', 'overdue', 'cancelled']
const paymentOptions = ['credit_card', 'ach', 'mbmts_ach', 'cheque', 'bank_transfer', 'cash']

const DEFAULT_INVOICE_LABELS: Required<PrintableInvoiceLabels> = {
  billTo: 'Bill To',
  customerName: 'Customer name',
  customerEmail: 'Customer email',
  customerPhone: 'Customer phone',
  customerAddress: 'Customer address',
  reference: 'Reference',
  issued: 'Issued',
  due: 'Due',
  payment: 'Payment',
  status: 'Status',
  itemNumber: 'Item',
  description: 'Description',
  quantity: 'Qty',
  unitPrice: 'Price',
  shipping: 'Shipping',
  setup: 'Setup',
  lineTotal: 'Total',
  condition: 'Condition / Type',
  laborFees: 'Labor Fees',
  travelCharges: 'Travel Charges',
  serviceCharges: 'Service Charges',
  partsTotal: 'Parts / Rental Total',
  workedHoursFee: 'Working Hours Fee',
  setupFeeExtra: 'Setup Fee',
  serviceFeeExtra: 'Service Fee',
  shippingFeeExtra: 'Shipping / Delivery Fee',
  applicationFeeExtra: 'Application / Training Fee',
  additionalServiceFees: 'Additional Service Fees',
  subtotal: 'Subtotal',
  tax: 'Tax',
  discount: 'Discount',
  total: 'Total',
  paid: 'Paid',
  balanceDue: 'Balance Due',
  notes: 'Invoice notes',
}

const mergeInvoiceLabels = (labels?: PrintableInvoiceLabels | null): Required<PrintableInvoiceLabels> => ({
  ...DEFAULT_INVOICE_LABELS,
  ...(labels || {}),
})

type LineItemValueKey = 'item_number' | 'description' | 'quantity' | 'unit_price' | 'shipping_fee' | 'setup_fee' | 'total_amount' | 'condition'
type SummaryValueKey = 'subtotal' | 'tax_amount' | 'discount_amount' | 'total_amount' | 'amount_paid' | 'balance_due'

const LINE_ITEM_CELLS: Array<{ valueKey: LineItemValueKey; labelKey: keyof PrintableInvoiceLabels; numeric?: boolean }> = [
  { valueKey: 'item_number', labelKey: 'itemNumber' },
  { valueKey: 'description', labelKey: 'description' },
  { valueKey: 'quantity', labelKey: 'quantity', numeric: true },
  { valueKey: 'unit_price', labelKey: 'unitPrice', numeric: true },
  { valueKey: 'shipping_fee', labelKey: 'shipping', numeric: true },
  { valueKey: 'setup_fee', labelKey: 'setup', numeric: true },
  { valueKey: 'total_amount', labelKey: 'lineTotal', numeric: true },
  { valueKey: 'condition', labelKey: 'condition' },
]

const SUMMARY_CELLS: Array<{ valueKey: SummaryValueKey; labelKey: keyof PrintableInvoiceLabels; readOnly?: boolean }> = [
  { valueKey: 'subtotal', labelKey: 'subtotal' },
  { valueKey: 'tax_amount', labelKey: 'tax' },
  { valueKey: 'discount_amount', labelKey: 'discount' },
  { valueKey: 'total_amount', labelKey: 'total' },
  { valueKey: 'amount_paid', labelKey: 'paid' },
  { valueKey: 'balance_due', labelKey: 'balanceDue', readOnly: true },
]

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const dateInputValue = (value: string | null | undefined) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10)
  return parsed.toISOString().slice(0, 10)
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
  .custom-cell-row td { padding-top: 6px; background: #F8FAFC; }
  .custom-cell-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .custom-cell-list span { display: inline-flex; gap: 6px; padding: 6px 9px; border: 1px solid #E2E8F0; border-radius: 8px; background: #fff; color: #475569; }
  .right { text-align: right; }
  .amount { color: #047857; font-weight: 800; }
  .totals { margin-left: auto; margin-top: 22px; width: 310px; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; background: #fff; }
  .totals div { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #EEF2F7; }
  .totals div:last-child { border-bottom: 0; }
  .totals .grand { font-size: 18px; font-weight: 900; color: #fff; background: linear-gradient(135deg, var(--accent) 0%, #0EA5E9 100%); }
  .balance { color: #B91C1C; font-weight: 900; }
  .paid-separate { margin-top: 24px; border: 1px solid #C7D2FE; border-radius: 14px; overflow: hidden; background: #F8FAFC; page-break-inside: avoid; }
  .paid-separate h2 { margin: 0; padding: 14px 16px; background: #EEF2FF; color: #312E81; font-size: 15px; }
  .paid-separate-note { margin: 0; padding: 12px 16px; color: #475569; font-size: 12px; border-top: 1px solid #E0E7FF; }
  .paid-separate table { margin-top: 0; border: 0; border-radius: 0; }
  .note { margin-top: 24px; padding: 16px; border: 1px solid #E5E7EB; border-left: 5px solid var(--accent); border-radius: 12px; color: #4b5563; font-size: 13px; background: #F8FAFC; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 54px; }
  .line { border-top: 1px solid #334155; padding-top: 8px; font-size: 12px; color: #4b5563; }
  .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #64748B; font-size: 11px; display: flex; justify-content: space-between; gap: 14px; }
  .report-hero { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%) !important; }
  .report-section { border: 1px solid #E5E7EB; border-radius: 16px; padding: 18px; margin-top: 16px; }
  .report-session { border: 1px solid #E5E7EB; border-left: 5px solid #7C3AED; border-radius: 14px; padding: 16px; margin-top: 12px; page-break-inside: avoid; }
  .report-session-head { display: flex; justify-content: space-between; color: #1E1B4B; font-size: 16px; }
  .report-session-head span { color: #047857; font-weight: 900; }
  .report-times { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; color: #475569; }
  .report-h4 { margin: 12px 0 5px; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .report-summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .report-pill { padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: 0; overflow: visible; box-shadow: none; }
    .hero, .report-hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  quantityLabel = 'Qty',
  paidQuotations: PrintablePaidQuotation[] = [],
) => {
  const title = documentLabel(type, primaryDocumentLabel)
  const labels = mergeInvoiceLabels(invoice.labels)
  const accentSoft = softAccentFor(accent)
  const hasPerItemUnits = lineItems.some(i => i.unitLabel)
  const qtyHeader = hasPerItemUnits ? 'Unit' : labels.quantity || quantityLabel
  const itemRows = lineItems.length ? lineItems.map(item => {
    const qtyCell = item.unitLabel
      ? `${escapeHtml(item.quantity)} ${escapeHtml(item.unitLabel)}`
      : escapeHtml(item.quantity)
    const customCells = (item.custom_cells || []).filter(cell => cell.label || cell.value)
    const customCellRow = customCells.length
      ? `<tr class="custom-cell-row"><td colspan="${type === 'packing_slip' ? 3 : 7}"><div class="custom-cell-list">${customCells.map(cell => `<span><strong>${escapeHtml(cell.label || 'Additional')}</strong>${escapeHtml(cell.value || '-')}</span>`).join('')}</div></td></tr>`
      : ''
    return `
    <tr>
      <td><span class="item-number">${escapeHtml(item.item_number)}</span><br><span class="item-condition">${escapeHtml(item.condition || '')}</span></td>
      <td>${escapeHtml(item.description)}</td>
      <td class="right">${qtyCell}</td>
      ${type === 'packing_slip' ? '' : `<td class="right">${escapeHtml(money(item.unit_price))}</td><td class="right">${escapeHtml(money(item.shipping_fee))}</td><td class="right">${escapeHtml(money(item.setup_fee))}</td><td class="right amount">${escapeHtml(money(item.total_amount))}</td>`}
    </tr>
    ${customCellRow}
  `}).join('') : '<tr><td colspan="7">No line items available.</td></tr>'

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

  const paidQuotationRows = paidQuotations.length ? paidQuotations.map(quotation => {
    const detail = quotation.line_items?.length
      ? quotation.line_items.map(item => item.description).filter(Boolean).join('; ')
      : quotation.description || 'Service quotation'
    return `
    <tr>
      <td><span class="item-number">${escapeHtml(quotation.quotation_number)}</span></td>
      <td>${escapeHtml(detail)}</td>
      <td class="right amount">${escapeHtml(money(quotation.paid_amount))}</td>
      <td>${escapeHtml(formatDate(quotation.paid_at))}</td>
      <td>${escapeHtml(paymentMethodLabel(quotation.payment_method))}</td>
      <td>${escapeHtml(quotation.reference_number || '-')}</td>
    </tr>
  `
  }).join('') : ''

  const customSummaryRows = (invoice.summary_rows || [])
    .filter(row => row.label || Number(row.value || 0))
    .map(row => `<div><span>${escapeHtml(row.label || 'Additional charge')}</span><strong>${escapeHtml(money(row.value))}</strong></div>`)
    .join('')

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
          <h3>${escapeHtml(labels.billTo)}</h3>
          <strong class="customer">${escapeHtml(invoice.customer_name)}</strong><br>
          ${invoice.customer_email ? `<span class="muted">${escapeHtml(invoice.customer_email)}</span><br>` : ''}
          ${invoice.customer_phone ? `<span class="muted">${escapeHtml(formatUSPhone(invoice.customer_phone))}</span><br>` : ''}
          ${invoice.customer_address ? `<span class="muted">${escapeHtml(invoice.customer_address)}</span><br>` : ''}
          <span class="muted">${escapeHtml(invoice.facility_name || '')}</span>
        </div>
        <div class="box meta">
          <strong>${escapeHtml(primaryDocumentLabel)} #</strong><span>${escapeHtml(invoice.invoice_number)}</span>
          <strong>${escapeHtml(labels.reference)}</strong><span>${escapeHtml(invoice.reference_number || '-')}</span>
          <strong>${escapeHtml(labels.issued)}</strong><span>${escapeHtml(formatDate(invoice.issue_date))}</span>
          <strong>${escapeHtml(labels.due)}</strong><span>${escapeHtml(formatDate(invoice.due_date))}</span>
          <strong>${escapeHtml(labels.payment)}</strong><span>${escapeHtml(paymentMethodLabel(invoice.payment_method))}</span>
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
              <th>${escapeHtml(labels.itemNumber)}</th><th>${escapeHtml(labels.description)}</th><th class="right">${escapeHtml(qtyHeader)}</th>
              ${type === 'packing_slip' ? '' : `<th class="right">${escapeHtml(labels.unitPrice)}</th><th class="right">${escapeHtml(labels.shipping)}</th><th class="right">${escapeHtml(labels.setup)}</th><th class="right">${escapeHtml(labels.lineTotal)}</th>`}
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      `}

      ${type === 'invoice' ? `
        ${paidQuotationRows ? `
          <section class="paid-separate">
            <h2>Paid Service Quotations</h2>
            <table>
              <thead><tr><th>Quotation</th><th>Description</th><th class="right">Paid</th><th>Paid On</th><th>Method</th><th>Reference</th></tr></thead>
              <tbody>${paidQuotationRows}</tbody>
            </table>
            <p class="paid-separate-note">These service quotation charges were paid separately during this service request and are shown for history only. They are not included in this invoice total.</p>
          </section>
        ` : ''}
        <section class="totals">
          ${invoice.labor_fees ? `<div><span>${escapeHtml(labels.laborFees)}</span><strong>${escapeHtml(money(invoice.labor_fees))}</strong></div>` : ''}
          ${invoice.travel_charges ? `<div><span>${escapeHtml(labels.travelCharges)}</span><strong>${escapeHtml(money(invoice.travel_charges))}</strong></div>` : ''}
          ${invoice.service_charges ? `<div><span>${escapeHtml(labels.serviceCharges)}</span><strong>${escapeHtml(money(invoice.service_charges))}</strong></div>` : ''}
          ${invoice.parts_total != null ? `<div><span>${escapeHtml(labels.partsTotal)}</span><strong>${escapeHtml(money(invoice.parts_total))}</strong></div>` : ''}
          ${invoice.worked_hours_fee ? `<div><span>${escapeHtml(labels.workedHoursFee)}</span><strong>${escapeHtml(money(invoice.worked_hours_fee))}</strong></div>` : ''}
          ${invoice.setup_fee_extra ? `<div><span>${escapeHtml(labels.setupFeeExtra)}</span><strong>${escapeHtml(money(invoice.setup_fee_extra))}</strong></div>` : ''}
          ${invoice.service_fee_extra ? `<div><span>${escapeHtml(labels.serviceFeeExtra)}</span><strong>${escapeHtml(money(invoice.service_fee_extra))}</strong></div>` : ''}
          ${invoice.shipping_fee_extra ? `<div><span>${escapeHtml(labels.shippingFeeExtra)}</span><strong>${escapeHtml(money(invoice.shipping_fee_extra))}</strong></div>` : ''}
          ${invoice.application_fee_extra ? `<div><span>${escapeHtml(labels.applicationFeeExtra)}</span><strong>${escapeHtml(money(invoice.application_fee_extra))}</strong></div>` : ''}
          ${invoice.additional_service_fees ? `<div><span>${escapeHtml(labels.additionalServiceFees)}</span><strong>${escapeHtml(money(invoice.additional_service_fees))}</strong></div>` : ''}
          ${customSummaryRows}
          <div><span>${escapeHtml(labels.subtotal)}</span><strong>${escapeHtml(money(invoice.subtotal))}</strong></div>
          <div><span>${escapeHtml(labels.tax)}</span><strong>${escapeHtml(money(invoice.tax_amount))}</strong></div>
          <div><span>${escapeHtml(labels.discount)}</span><strong>${escapeHtml(money(invoice.discount_amount))}</strong></div>
          <div class="grand"><span>${escapeHtml(labels.total)}</span><span>${escapeHtml(money(invoice.total_amount))}</span></div>
          <div><span>${escapeHtml(labels.paid)}</span><strong>${escapeHtml(money(invoice.amount_paid))}</strong></div>
          <div><span>${escapeHtml(labels.balanceDue)}</span><strong class="balance">${escapeHtml(money(invoice.balance_due))}</strong></div>
        </section>
      ` : ''}

      ${invoice.notes ? `<section class="note"><strong>${escapeHtml(labels.notes)}:</strong><br>${escapeHtml(invoice.notes)}</section>` : ''}
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
  quantityLabel = 'Qty',
  appendHtml,
  paidQuotations = [],
  mode = 'print',
  onSave,
  saving = false,
}: InvoicePrintDialogProps) => {
  const [documentType, setDocumentType] = useState<PrintDocumentType>('invoice')
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    subtotal: '',
    tax_amount: '',
    discount_amount: '',
    total_amount: '',
    due_date: '',
    issue_date: '',
    status: '',
    payment_method: '',
    amount_paid: '',
    notes: '',
  })
  const [editRows, setEditRows] = useState<PrintableLineItem[]>([])
  const [editLabels, setEditLabels] = useState<PrintableInvoiceLabels>(DEFAULT_INVOICE_LABELS)
  const [editSummaryRows, setEditSummaryRows] = useState<PrintableInvoiceSummaryRow[]>([])
  const [rowEditor, setRowEditor] = useState<{ index: number; row: PrintableLineItem; labels: PrintableInvoiceLabels } | null>(null)
  const [summaryEditor, setSummaryEditor] = useState<{ valueKey: SummaryValueKey; labelKey: keyof PrintableInvoiceLabels; label: string; value: string; readOnly: boolean } | null>(null)
  const [customSummaryEditor, setCustomSummaryEditor] = useState<{ index: number; row: PrintableInvoiceSummaryRow } | null>(null)
  const previewAccentSoft = softAccentFor(accent)
  const isEditMode = mode === 'edit'
  const isViewMode = mode === 'view'
  const activeDocumentType: PrintDocumentType = (isEditMode || isViewMode) ? 'invoice' : documentType

  useEffect(() => {
    if (!invoice || !open) return
    setDocumentType('invoice')
    setEditForm({
      customer_name: invoice.customer_name || '',
      customer_email: invoice.customer_email || '',
      customer_phone: formatUSPhoneInput(invoice.customer_phone || ''),
      customer_address: invoice.customer_address || '',
      subtotal: String(Number(invoice.subtotal || 0)),
      tax_amount: String(Number(invoice.tax_amount || 0)),
      discount_amount: String(Number(invoice.discount_amount || 0)),
      total_amount: String(Number(invoice.total_amount || 0)),
      due_date: dateInputValue(invoice.due_date),
      issue_date: dateInputValue(invoice.issue_date),
      status: invoice.status || 'pending',
      payment_method: invoice.payment_method || '',
      amount_paid: String(Number(invoice.amount_paid || 0)),
      notes: invoice.notes || '',
    })
    setEditRows(lineItems.map(item => ({ ...item, custom_cells: (item.custom_cells || []).map(cell => ({ ...cell })) })))
    setEditLabels(mergeInvoiceLabels(invoice.labels))
    setEditSummaryRows((invoice.summary_rows || []).map(row => ({ ...row })))
    setRowEditor(null)
    setSummaryEditor(null)
    setCustomSummaryEditor(null)
  }, [invoice, lineItems, open])

  const displayInvoice = useMemo<PrintableInvoice | null>(() => {
    if (!invoice || !isEditMode) return invoice
    const amountPaid = Number(editForm.amount_paid || 0)
    const totalAmount = Number(editForm.total_amount || 0)
    return {
      ...invoice,
      customer_name: editForm.customer_name || invoice.customer_name,
      customer_email: editForm.customer_email || null,
      customer_phone: formatUSPhoneInput(editForm.customer_phone) || null,
      customer_address: editForm.customer_address || null,
      subtotal: Number(editForm.subtotal || 0),
      tax_amount: Number(editForm.tax_amount || 0),
      discount_amount: Number(editForm.discount_amount || 0),
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance_due: Math.max(0, totalAmount - amountPaid),
      issue_date: editForm.issue_date || null,
      due_date: editForm.due_date || null,
      status: editForm.status || invoice.status,
      payment_method: editForm.payment_method || null,
      notes: editForm.notes || null,
      labels: editLabels,
      summary_rows: editSummaryRows,
    }
  }, [editForm, editLabels, editSummaryRows, invoice, isEditMode])

  const displayLabels = mergeInvoiceLabels(displayInvoice?.labels)

  const previewRows = useMemo(() => {
    if (activeDocumentType === 'ledger') {
      return ledgerTransactions.map(item => ({
        first: formatDate(item.created_at),
        second: item.invoice_number || displayInvoice?.invoice_number || '-',
        third: item.transaction_type.replace(/_/g, ' '),
        amount: money(item.amount),
        customCells: [] as PrintableInvoiceCustomCell[],
      }))
    }
    const rows = isEditMode ? editRows : lineItems
    return rows.map(item => ({
      first: item.item_number,
      second: item.description,
      third: item.unitLabel ? `${item.quantity} ${item.unitLabel}` : `${displayLabels.quantity || quantityLabel} ${item.quantity}`,
      amount: activeDocumentType === 'packing_slip' ? item.condition || '-' : money(item.total_amount),
      customCells: item.custom_cells || [],
    }))
  }, [activeDocumentType, displayInvoice?.invoice_number, displayLabels.quantity, editRows, isEditMode, ledgerTransactions, lineItems, quantityLabel])

  const handlePrint = () => {
    if (!displayInvoice) return
    const printableRows = isEditMode ? editRows : lineItems
    const html = buildPrintableHtml(displayInvoice, activeDocumentType, printableRows, ledgerTransactions, moduleLabel, primaryDocumentLabel, accent, quantityLabel, paidQuotations)
    printHtml(`${displayInvoice.invoice_number} ${documentLabel(activeDocumentType, primaryDocumentLabel)}`, html + (appendHtml || ''))
  }

  const handleSave = () => {
    if (!onSave) return
    onSave({
      customer_name: editForm.customer_name,
      customer_email: editForm.customer_email || null,
      customer_phone: formatUSPhoneInput(editForm.customer_phone) || null,
      customer_address: editForm.customer_address || null,
      subtotal: Number(editForm.subtotal || 0),
      tax_amount: Number(editForm.tax_amount || 0),
      discount_amount: Number(editForm.discount_amount || 0),
      total_amount: Number(editForm.total_amount || 0),
      amount_paid: Number(editForm.amount_paid || 0),
      issue_date: editForm.issue_date || null,
      due_date: editForm.due_date || null,
      status: editForm.status || undefined,
      payment_method: editForm.payment_method || null,
      notes: editForm.notes || null,
      labels: editLabels,
      summary_rows: editSummaryRows,
      line_items: editRows.map(row => ({
        ...row,
        quantity: Number(row.quantity || 0),
        unit_price: Number(row.unit_price || 0),
        shipping_fee: Number(row.shipping_fee || 0),
        setup_fee: Number(row.setup_fee || 0),
        total_amount: Number(row.total_amount || 0),
      })),
    })
  }

  const updateEditRow = (index: number, patch: Partial<PrintableLineItem>) => {
    setEditRows(rows => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, ...patch }
      if ('quantity' in patch || 'unit_price' in patch || 'shipping_fee' in patch || 'setup_fee' in patch) {
        const quantity = Number(next.quantity || 0)
        const unitPrice = Number(next.unit_price || 0)
        next.total_amount = Number((quantity * unitPrice + Number(next.shipping_fee || 0) + Number(next.setup_fee || 0)).toFixed(2))
      }
      return next
    }))
  }

  const addEditRow = () => {
    const nextRow: PrintableLineItem = {
        item_number: `ITEM-${editRows.length + 1}`,
        description: 'New item',
        quantity: 1,
        unit_price: 0,
        shipping_fee: 0,
        setup_fee: 0,
        condition: null,
        total_amount: 0,
        custom_cells: [],
    }
    setRowEditor({ index: editRows.length, row: nextRow, labels: { ...editLabels } })
  }

  const updateEditLabel = (key: keyof PrintableInvoiceLabels, value: string) => {
    setEditLabels(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth={isEditMode ? 'lg' : 'md'} fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
        {isEditMode ? 'Edit' : isViewMode ? 'View' : 'Print'} {displayInvoice?.invoice_number || primaryDocumentLabel}
        <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
          {isEditMode
            ? 'Edit the invoice in the same layout that will be printed.'
            : isViewMode
              ? 'Preview the billing document without leaving the billing module.'
              : 'Print one clean document at a time.'}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#F8FAFC' }}>
        {displayInvoice && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              {isEditMode ? (
                <Chip label="Invoice editor" sx={{ bgcolor: `${accent}18`, color: accent, fontWeight: 900 }} />
              ) : isViewMode ? (
                <Chip label={`${primaryDocumentLabel} preview`} sx={{ bgcolor: `${accent}18`, color: accent, fontWeight: 900 }} />
              ) : (
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
              )}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={displayInvoice.status.replace(/_/g, ' ')} sx={{ bgcolor: `${accent}18`, color: accent, fontWeight: 900, textTransform: 'uppercase' }} />
                <Chip label={`Balance ${money(displayInvoice.balance_due)}`} sx={{ bgcolor: '#fff', fontWeight: 900 }} />
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
                  <Typography sx={{ fontWeight: 950, fontSize: 24 }}>{documentLabel(activeDocumentType, primaryDocumentLabel)}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{displayInvoice.invoice_number}</Typography>
                </Box>
              </Box>

              <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pb: 2 }}>
                <Box sx={{ p: 2, borderRadius: '14px', border: '1px solid #E5E7EB', bgcolor: '#F8FAFC' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{displayLabels.billTo}</Typography>
                  {isEditMode ? (
                    <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
                      <TextField size="small" label={displayLabels.customerName} value={editForm.customer_name} onChange={event => setEditForm(prev => ({ ...prev, customer_name: event.target.value }))} sx={{ bgcolor: '#fff' }} />
                      <TextField size="small" label={displayLabels.customerEmail} value={editForm.customer_email} onChange={event => setEditForm(prev => ({ ...prev, customer_email: event.target.value }))} sx={{ bgcolor: '#fff' }} />
                      <TextField size="small" label={displayLabels.customerPhone} value={editForm.customer_phone} onChange={event => setEditForm(prev => ({ ...prev, customer_phone: formatUSPhoneInput(event.target.value) }))} sx={{ bgcolor: '#fff' }} />
                      <TextField size="small" label={displayLabels.customerAddress} value={editForm.customer_address} onChange={event => setEditForm(prev => ({ ...prev, customer_address: event.target.value }))} sx={{ bgcolor: '#fff' }} />
                    </Box>
                  ) : (
                    <>
                      <Typography sx={{ fontWeight: 900 }}>{displayInvoice.customer_name}</Typography>
                      <Typography sx={{ color: '#6B7280' }}>{displayInvoice.customer_email || '-'}</Typography>
                      <Typography sx={{ color: '#6B7280' }}>{displayInvoice.facility_name || '-'}</Typography>
                    </>
                  )}
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 2, borderRadius: '14px', border: '1px solid #E5E7EB', bgcolor: previewAccentSoft }}>
                  <Typography sx={{ fontWeight: 900 }}>{displayLabels.reference}</Typography><Typography>{displayInvoice.reference_number || '-'}</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{displayLabels.issued}</Typography>
                  {isEditMode ? (
                    <TextField size="small" type="date" value={editForm.issue_date} onChange={event => setEditForm(prev => ({ ...prev, issue_date: event.target.value }))} sx={{ bgcolor: '#fff' }} />
                  ) : (
                    <Typography>{formatDate(displayInvoice.issue_date)}</Typography>
                  )}
                  <Typography sx={{ fontWeight: 900 }}>{displayLabels.due}</Typography>
                  {isEditMode ? (
                    <TextField size="small" type="date" value={editForm.due_date} onChange={event => setEditForm(prev => ({ ...prev, due_date: event.target.value }))} sx={{ bgcolor: '#fff' }} />
                  ) : (
                    <Typography>{formatDate(displayInvoice.due_date)}</Typography>
                  )}
                  <Typography sx={{ fontWeight: 900 }}>{displayLabels.payment}</Typography>
                  {isEditMode ? (
                    <TextField select size="small" value={editForm.payment_method} onChange={event => setEditForm(prev => ({ ...prev, payment_method: event.target.value }))} sx={{ bgcolor: '#fff' }}>
                      <MenuItem value="">Not set</MenuItem>
                      {paymentOptions.map(option => <MenuItem key={option} value={option}>{paymentMethodLabel(option)}</MenuItem>)}
                    </TextField>
                  ) : (
                    <Typography>{paymentMethodLabel(displayInvoice.payment_method)}</Typography>
                  )}
                  {isEditMode && (
                    <>
                      <Typography sx={{ fontWeight: 900 }}>{displayLabels.status}</Typography>
                      <TextField select size="small" value={editForm.status} onChange={event => setEditForm(prev => ({ ...prev, status: event.target.value }))} sx={{ bgcolor: '#fff' }}>
                        {statusOptions.map(option => <MenuItem key={option} value={option}>{option.replace(/_/g, ' ')}</MenuItem>)}
                      </TextField>
                    </>
                  )}
                </Box>
              </Box>

              <Divider />
              <Box sx={{ display: 'grid', gap: 1.2, pt: 2 }}>
                {isEditMode ? (
                  <Box sx={{ display: 'grid', gap: 1.2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>Invoice Items</Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          onClick={() => {
                            const subtotal = editRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
                            const tax = Number(editForm.tax_amount || 0)
                            const discount = Number(editForm.discount_amount || 0)
                            setEditForm(prev => ({
                              ...prev,
                              subtotal: subtotal.toFixed(2),
                              total_amount: Math.max(0, subtotal + tax - discount).toFixed(2),
                            }))
                          }}
                          sx={{ borderRadius: '10px', fontWeight: 900, textTransform: 'none' }}
                        >
                          Use Row Totals
                        </Button>
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={addEditRow}
                          sx={{ borderRadius: '10px', fontWeight: 900, textTransform: 'none', bgcolor: `${accent}14`, color: accent }}
                        >
                          Add Item
                        </Button>
                      </Box>
                    </Box>
                    <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1fr 2fr 0.8fr 1fr 1fr 1fr 1fr 76px', gap: 1, px: 1.8, color: '#64748B', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                      <span>{displayLabels.itemNumber}</span>
                      <span>{displayLabels.description}</span>
                      <span>{displayLabels.quantity}</span>
                      <span>{displayLabels.unitPrice}</span>
                      <span>{displayLabels.shipping}</span>
                      <span>{displayLabels.setup}</span>
                      <span>{displayLabels.lineTotal}</span>
                      <span>Actions</span>
                    </Box>
                    {editRows.map((row, index) => (
                      <Box key={`${row.item_number}-${index}`} sx={{ p: 1.4, borderRadius: '14px', bgcolor: '#F9FAFB', border: '1px solid #EEF2F7', borderLeft: `4px solid ${accent}` }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 0.8fr 1fr 1fr 1fr 1fr auto' }, gap: 1, alignItems: 'center' }}>
                          <Typography sx={{ fontWeight: 900, color: accent }}>{row.item_number || '-'}</Typography>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || '-'}</Typography>
                            {row.condition && <Typography sx={{ color: '#64748B', fontSize: 12 }}>{row.condition}</Typography>}
                          </Box>
                          <Typography>{row.quantity} {row.unitLabel || ''}</Typography>
                          <Typography>{money(row.unit_price)}</Typography>
                          <Typography>{money(row.shipping_fee)}</Typography>
                          <Typography>{money(row.setup_fee)}</Typography>
                          <Typography sx={{ fontWeight: 950, color: accent }}>{money(row.total_amount)}</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Edit row and cells">
                              <IconButton
                                size="small"
                                onClick={() => setRowEditor({ index, row: { ...row, custom_cells: (row.custom_cells || []).map(cell => ({ ...cell })) }, labels: { ...editLabels } })}
                                sx={{ color: accent, bgcolor: `${accent}12`, '&:hover': { bgcolor: `${accent}22` } }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove row">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={editRows.length <= 1}
                                  onClick={() => setEditRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))}
                                  sx={{ color: '#DC2626', bgcolor: '#FEF2F2', '&:hover': { bgcolor: '#FEE2E2' } }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </Box>
                        {(row.custom_cells || []).length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 1.2, pt: 1.2, borderTop: '1px solid #E5E7EB' }}>
                            {(row.custom_cells || []).map(cell => (
                              <Chip key={cell.id} size="small" label={`${cell.label || 'Additional'}: ${cell.value || '-'}`} sx={{ bgcolor: '#fff', border: '1px solid #E2E8F0', fontWeight: 750 }} />
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                ) : previewRows.length === 0 ? (
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>No rows available for this document.</Typography>
                ) : previewRows.map((row, index) => (
                  <Box key={`${row.first}-${index}`} sx={{ p: 1.4, borderRadius: '12px', bgcolor: '#F9FAFB', border: '1px solid #EEF2F7', borderLeft: `4px solid ${accent}` }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr' }, gap: 1 }}>
                      <Typography sx={{ fontWeight: 900 }}>{row.first}</Typography>
                      <Typography>{row.second}</Typography>
                      <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>{row.third}</Typography>
                      <Typography sx={{ textAlign: { md: 'right' }, fontWeight: 950, color: accent }}>{row.amount}</Typography>
                    </Box>
                    {row.customCells.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mt: 1 }}>
                        {row.customCells.map(cell => <Chip key={cell.id} size="small" label={`${cell.label || 'Additional'}: ${cell.value || '-'}`} />)}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>

              {activeDocumentType === 'invoice' && paidQuotations.length > 0 && (
                <Box sx={{ mt: 2, p: 2, borderRadius: '14px', border: '1px solid #C7D2FE', bgcolor: '#EEF2FF' }}>
                  <Typography sx={{ fontWeight: 950, color: '#312E81', mb: 1 }}>Paid Service Quotations</Typography>
                  <Typography sx={{ color: '#475569', fontWeight: 700, fontSize: 13, mb: 1.5 }}>
                    Shown for service history only. These paid quotations are not included in this invoice total.
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    {paidQuotations.map(quotation => (
                      <Box key={quotation.id || quotation.quotation_number} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr' }, gap: 1, p: 1.2, borderRadius: '12px', bgcolor: '#fff', border: '1px solid #E0E7FF' }}>
                        <Typography sx={{ fontWeight: 900, color: accent }}>{quotation.quotation_number}</Typography>
                        <Typography sx={{ color: '#334155' }}>{quotation.line_items?.map(item => item.description).filter(Boolean).join('; ') || quotation.description || 'Service quotation'}</Typography>
                        <Typography sx={{ fontWeight: 950, color: '#059669', textAlign: { md: 'right' } }}>{money(quotation.paid_amount)}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {activeDocumentType === 'invoice' && (
                <Box sx={{ display: 'grid', gap: 0.8, maxWidth: 390, ml: 'auto', mt: 2 }}>
                  {SUMMARY_CELLS.map(config => {
                    const value = config.valueKey === 'balance_due'
                      ? displayInvoice.balance_due
                      : Number((editForm as any)[config.valueKey] || 0)
                    return (
                      <Box key={config.valueKey} sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 1, minHeight: 38, px: 1.2, borderRadius: '10px', bgcolor: config.valueKey === 'total_amount' ? `${accent}0F` : 'transparent', fontWeight: config.valueKey === 'total_amount' ? 950 : 800 }}>
                        <span>{displayLabels[config.labelKey]}</span>
                        <span>{money(value)}</span>
                        {isEditMode && (
                          <Tooltip title="Edit row">
                            <IconButton
                              size="small"
                              onClick={() => setSummaryEditor({
                                valueKey: config.valueKey,
                                labelKey: config.labelKey,
                                label: editLabels[config.labelKey] || DEFAULT_INVOICE_LABELS[config.labelKey],
                                value: String(value),
                                readOnly: Boolean(config.readOnly),
                              })}
                              sx={{ color: accent, bgcolor: `${accent}10` }}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    )
                  })}
                  {editSummaryRows.map((row, index) => (
                    <Box key={row.id} sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 1, minHeight: 38, px: 1.2, borderRadius: '10px', bgcolor: '#F8FAFC', fontWeight: 800 }}>
                      <span>{row.label || 'Additional charge'}</span>
                      <span>{money(row.value)}</span>
                      {isEditMode && (
                        <Tooltip title="Edit added row">
                          <IconButton size="small" onClick={() => setCustomSummaryEditor({ index, row: { ...row } })} sx={{ color: accent, bgcolor: `${accent}10` }}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  ))}
                  {isEditMode && (
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setCustomSummaryEditor({ index: -1, row: { id: `summary-${Date.now()}`, label: 'Shipping', value: 0 } })}
                      sx={{ justifySelf: 'start', textTransform: 'none', fontWeight: 900, color: accent }}
                    >
                      Add summary row
                    </Button>
                  )}
                </Box>
              )}

              {isEditMode && (
                <TextField
                  label={displayLabels.notes}
                  placeholder={DEFAULT_INVOICE_LABELS.notes}
                  multiline
                  minRows={3}
                  fullWidth
                  value={editForm.notes}
                  onChange={event => setEditForm(prev => ({ ...prev, notes: event.target.value }))}
                  sx={{ mt: 2, bgcolor: '#fff' }}
                />
              )}
              </Box>
            </Card>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>Close</Button>
        {isEditMode ? (
          <Button disabled={saving} onClick={handleSave} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, bgcolor: accent, '&:hover': { bgcolor: accent } }}>
            {saving ? 'Saving...' : 'Save Invoice'}
          </Button>
        ) : isViewMode ? null : (
          <Button startIcon={<PrintIcon />} onClick={handlePrint} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, bgcolor: accent, '&:hover': { bgcolor: accent } }}>
            Print {documentLabel(activeDocumentType, primaryDocumentLabel)}
          </Button>
        )}
      </DialogActions>

      <Dialog open={Boolean(rowEditor)} onClose={() => setRowEditor(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>
          Edit invoice row
          <Typography sx={{ mt: 0.4, color: '#64748B', fontSize: 13, fontWeight: 700 }}>
            Edit a cell's name and value, or add an optional cell to this row.
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#F8FAFC' }}>
          {rowEditor && (
            <Box sx={{ display: 'grid', gap: 1.2 }}>
              {LINE_ITEM_CELLS.map(config => (
                <Box key={config.valueKey} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '0.9fr 1.4fr' }, gap: 1, p: 1.2, borderRadius: '12px', border: '1px solid #E2E8F0', bgcolor: '#fff' }}>
                  <TextField
                    size="small"
                    label="Cell label"
                    value={rowEditor.labels[config.labelKey] ?? ''}
                    placeholder={DEFAULT_INVOICE_LABELS[config.labelKey]}
                    onChange={event => setRowEditor(current => current ? { ...current, labels: { ...current.labels, [config.labelKey]: event.target.value } } : null)}
                  />
                  <TextField
                    size="small"
                    label="Cell value"
                    type={config.numeric ? 'number' : 'text'}
                    value={(rowEditor.row as any)[config.valueKey] ?? ''}
                    onChange={event => {
                      const value = config.numeric ? Number(event.target.value || 0) : event.target.value
                      setRowEditor(current => current ? { ...current, row: { ...current.row, [config.valueKey]: value } } : null)
                    }}
                    inputProps={config.numeric ? { min: 0, step: 0.01 } : undefined}
                  />
                </Box>
              ))}

              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                  <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>Optional cells</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>These appear only on this invoice row and on the printed invoice.</Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setRowEditor(current => current ? {
                    ...current,
                    row: {
                      ...current.row,
                      custom_cells: [...(current.row.custom_cells || []), { id: `cell-${Date.now()}`, label: 'New cell', value: '' }],
                    },
                  } : null)}
                  sx={{ textTransform: 'none', fontWeight: 900, color: accent }}
                >
                  Add cell
                </Button>
              </Box>
              {(rowEditor.row.custom_cells || []).map((cell, cellIndex) => (
                <Box key={cell.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '0.9fr 1.4fr auto' }, gap: 1, p: 1.2, borderRadius: '12px', border: '1px solid #DDD6FE', bgcolor: '#fff' }}>
                  <TextField
                    size="small"
                    label="Cell label"
                    value={cell.label}
                    onChange={event => setRowEditor(current => current ? {
                      ...current,
                      row: { ...current.row, custom_cells: (current.row.custom_cells || []).map((item, index) => index === cellIndex ? { ...item, label: event.target.value } : item) },
                    } : null)}
                  />
                  <TextField
                    size="small"
                    label="Cell value"
                    value={cell.value}
                    onChange={event => setRowEditor(current => current ? {
                      ...current,
                      row: { ...current.row, custom_cells: (current.row.custom_cells || []).map((item, index) => index === cellIndex ? { ...item, value: event.target.value } : item) },
                    } : null)}
                  />
                  <Tooltip title="Remove cell">
                    <IconButton
                      size="small"
                      onClick={() => setRowEditor(current => current ? { ...current, row: { ...current.row, custom_cells: (current.row.custom_cells || []).filter((_, index) => index !== cellIndex) } } : null)}
                      sx={{ color: '#DC2626', bgcolor: '#FEF2F2' }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRowEditor(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!rowEditor) return
              const quantity = Number(rowEditor.row.quantity || 0)
              const unitPrice = Number(rowEditor.row.unit_price || 0)
              const hasManualTotal = Number(rowEditor.row.total_amount || 0) !== 0
              const nextRow = {
                ...rowEditor.row,
                total_amount: hasManualTotal
                  ? Number(rowEditor.row.total_amount || 0)
                  : Number((quantity * unitPrice + Number(rowEditor.row.shipping_fee || 0) + Number(rowEditor.row.setup_fee || 0)).toFixed(2)),
              }
              setEditRows(rows => rowEditor.index < rows.length
                ? rows.map((row, index) => index === rowEditor.index ? nextRow : row)
                : [...rows, nextRow])
              setEditLabels(rowEditor.labels)
              setRowEditor(null)
            }}
            sx={{ bgcolor: accent, fontWeight: 900, borderRadius: '10px', '&:hover': { bgcolor: accent } }}
          >
            Save row
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(summaryEditor)} onClose={() => setSummaryEditor(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>Edit summary row</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.5, bgcolor: '#F8FAFC' }}>
          {summaryEditor && (
            <>
              <TextField label="Row label" value={summaryEditor.label} onChange={event => setSummaryEditor(current => current ? { ...current, label: event.target.value } : null)} sx={{ bgcolor: '#fff' }} />
              <TextField label="Amount" type="number" value={summaryEditor.value} disabled={summaryEditor.readOnly} onChange={event => setSummaryEditor(current => current ? { ...current, value: event.target.value } : null)} inputProps={{ min: 0, step: 0.01 }} sx={{ bgcolor: '#fff' }} />
              {summaryEditor.readOnly && <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>Balance is calculated from total minus paid. Its label remains editable.</Typography>}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSummaryEditor(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!summaryEditor) return
              updateEditLabel(summaryEditor.labelKey, summaryEditor.label)
              if (!summaryEditor.readOnly) {
                setEditForm(prev => {
                  const next = { ...prev, [summaryEditor.valueKey]: summaryEditor.value }
                  if (['subtotal', 'tax_amount', 'discount_amount'].includes(summaryEditor.valueKey)) {
                    next.total_amount = String(Math.max(0, Number(next.subtotal || 0) + Number(next.tax_amount || 0) - Number(next.discount_amount || 0)).toFixed(2))
                  }
                  return next
                })
              }
              setSummaryEditor(null)
            }}
            sx={{ bgcolor: accent, fontWeight: 900, borderRadius: '10px', '&:hover': { bgcolor: accent } }}
          >
            Save row
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(customSummaryEditor)} onClose={() => setCustomSummaryEditor(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>{customSummaryEditor?.index === -1 ? 'Add summary row' : 'Edit summary row'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.5, bgcolor: '#F8FAFC' }}>
          {customSummaryEditor && (
            <>
              <TextField label="Row label" value={customSummaryEditor.row.label} onChange={event => setCustomSummaryEditor(current => current ? { ...current, row: { ...current.row, label: event.target.value } } : null)} sx={{ bgcolor: '#fff' }} />
              <TextField label="Amount" type="number" value={customSummaryEditor.row.value} onChange={event => setCustomSummaryEditor(current => current ? { ...current, row: { ...current.row, value: Number(event.target.value || 0) } } : null)} inputProps={{ min: 0, step: 0.01 }} sx={{ bgcolor: '#fff' }} />
              <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>This row is printed as entered. Edit the Total row separately when this amount should change the invoice total.</Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          <Box>
            {customSummaryEditor && customSummaryEditor.index >= 0 && (
              <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => { setEditSummaryRows(rows => rows.filter((_, index) => index !== customSummaryEditor.index)); setCustomSummaryEditor(null) }} sx={{ fontWeight: 900 }}>Remove</Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => setCustomSummaryEditor(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!customSummaryEditor) return
                setEditSummaryRows(rows => customSummaryEditor.index < 0
                  ? [...rows, customSummaryEditor.row]
                  : rows.map((row, index) => index === customSummaryEditor.index ? customSummaryEditor.row : row))
                setCustomSummaryEditor(null)
              }}
              sx={{ bgcolor: accent, fontWeight: 900, borderRadius: '10px', '&:hover': { bgcolor: accent } }}
            >
              Save row
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default InvoicePrintDialog
