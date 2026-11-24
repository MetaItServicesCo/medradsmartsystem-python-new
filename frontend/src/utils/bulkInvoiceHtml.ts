/**
 * A bulk invoice as it prints, is shown in Billing and on the customer's link:
 * a front page with every invoice, by facility, and the totals; then each
 * invoice in full, each on its own page, exactly as it prints on its own.
 *
 * Every value is escaped. Each invoice's page comes from that invoice's own
 * builder: the service invoice document, the inspection invoice sheet, and for
 * sales and rental invoices the same sheet Billing prints, mapped the way
 * Billing maps them (pages/Sales/Billing.tsx, its printable invoice and line items).
 */
import type { BulkInvoiceDocument, BulkInvoicePage } from '@/api/bulkInvoices'
import {
  buildPrintableHtml,
  type PrintableInvoice,
  type PrintableLineItem,
} from '@/components/Billing/InvoicePrintDialog'
import { printStyles } from '@/utils/invoiceDocumentStyles'
import { inspectionInvoiceSheet, type InspectionInvoiceDocument } from '@/utils/inspectionInvoiceDocument'
import { buildServiceInvoiceHtml, COMPANY } from '@/utils/serviceInvoiceHtml'
import type { ServiceInvoiceDocument } from '@/api/serviceRequests'

const ACCENT = '#7C3AED'
const ACCENT_SOFT = '#F5F3FF'
// As Billing colours each kind of invoice.
const KIND_ACCENT: Record<string, string> = { sales: '#059669', rental: '#D97706' }
const KIND_LABEL: Record<string, string> = { sales: 'Sales', rental: 'Rental' }

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const parseDate = (value?: string | null) => {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const longDate = (value?: string | null) => {
  const parsed = parseDate(value)
  return parsed ? parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-'
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Due',
  sent: 'Due',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

// Only what the shared design has no class for.
const BULK_STYLES = `
<style>
  .doc-a .bk-section { margin-top: 24px; }
  .doc-a .bk-section h2 { margin: 0 0 8px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900; }
  /* Every column has its share of the width: the table fits any page or window, never scrolls. */
  .doc-a .bk-section table { margin-top: 0; table-layout: fixed; width: 100%; }
  .doc-a .bk-section th, .doc-a .bk-section td { padding-left: 8px; padding-right: 8px; word-break: normal; overflow-wrap: break-word; }
  .doc-a .bk-section td.right, .doc-a .bk-section th.right { text-align: right; }
  .doc-a tr.bk-group td { background: #F8FAFC; color: #1E1B4B; font-weight: 900; border-bottom: 1px solid #E5E7EB; }
  .doc-a tr.bk-subtotal td { font-weight: 800; color: #334155; background: #FCFCFF; }
  .doc-a tr.bk-cancelled td { color: #94A3B8; text-decoration: line-through; }
  .doc-a .bk-pre { white-space: pre-wrap; }
  .doc-a .bk-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 24px; page-break-inside: avoid; }
  .doc-a .bk-bottom .totals { margin-top: 0; margin-left: auto; }
  .doc-a .bk-note { max-width: 320px; color: #475569; font-size: 13px; line-height: 1.5; }
  .doc-a .bk-note strong { display: block; color: var(--accent); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .doc-a .box.meta .bk-number { white-space: nowrap; }
  /* Each invoice after the front page starts a page of its own. */
  .bk-page { break-before: page; page-break-before: always; }
  @media (max-width: 720px) {
    .sheet { width: 100%; margin: 0; box-shadow: none; min-height: 0; }
    .doc-a .head { padding: 18px 16px 10px; flex-wrap: wrap; }
    .doc-a .content { padding: 16px; }
    .doc-a .grid { grid-template-columns: 1fr; }
    .doc-a .bk-bottom { flex-direction: column; }
    .doc-a .bk-bottom .totals { width: 100%; }
    .doc-a .bk-section table { font-size: 11.5px; }
    .doc-a .bk-section th { font-size: 9.5px; letter-spacing: 0.03em; }
    .doc-a .bk-section th, .doc-a .bk-section td { padding-left: 5px; padding-right: 5px; }
  }
</style>`

/** The front page: who it is for, every invoice by facility, and what is owed. */
export const bulkFrontPageHtml = (doc: BulkInvoiceDocument): string => {
  const rows = doc.groups.map(group => {
    const lines = group.invoices.map(line => `
      <tr${line.status === 'cancelled' ? ' class="bk-cancelled"' : ''}>
        <td>${esc(line.invoice_number)}</td>
        <td>${esc(line.type_label)}</td>
        <td>${esc(line.related_number || '-')}</td>
        <td>${esc(longDate(line.issue_date))}</td>
        <td>${esc(longDate(line.due_date))}</td>
        <td class="right">${esc(money(line.amount))}</td>
      </tr>`).join('')
    return `
      <tr class="bk-group"><td colspan="6">${esc(group.facility_name)}</td></tr>
      ${lines}
      ${doc.groups.length > 1 ? `<tr class="bk-subtotal"><td colspan="5" class="right">${esc(group.facility_name)} subtotal</td><td class="right">${esc(money(group.subtotal))}</td></tr>` : ''}`
  }).join('')
  const paid = Number(doc.amount_paid || 0)
  const cardFee = Number(doc.card_fee_amount || 0)
  const addressLines = (doc.bill_to.address || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const payments = doc.payments.length ? `
      <div class="bk-section">
        <h2>Payments Received</h2>
        <table>
          <colgroup><col style="width:24%"><col style="width:30%"><col style="width:26%"><col style="width:20%"></colgroup>
          <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="right">Amount</th></tr></thead>
          <tbody>${doc.payments.map(payment => `
            <tr><td>${esc(longDate(payment.paid_at))}</td><td>${esc(payment.method_label)}${payment.card_last4 ? ` ····${esc(payment.card_last4)}` : ''}</td><td>${esc(payment.reference_number || '-')}</td><td class="right">${esc(money(Number(payment.amount || 0) + Number(payment.card_fee_amount || 0)))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''
  return `
  <main class="sheet doc-a" style="--accent:${ACCENT}; --accent-soft:${ACCENT_SOFT}">
    <section class="head">
      <div class="brand">
        <img src="${COMPANY.logo}" alt="${esc(COMPANY.name)}" />
        <div>
          <div class="eyebrow">Bulk Invoice</div>
          <h1 class="doc-title">Invoice</h1>
          <div class="doc-company">${esc(COMPANY.name)}</div>
          <div class="doc-address">${esc(COMPANY.address)}<br/>${esc(COMPANY.contact)}<br/>${esc(COMPANY.website)}</div>
        </div>
      </div>
      <div class="head-right">
        <span class="status-pill">${esc(STATUS_LABEL[doc.status] || doc.status)}</span>
      </div>
    </section>
    <div class="accent-bar"></div>

    <section class="content">
      <section class="grid">
        <div class="box prepared">
          <h3>Bill To</h3>
          <strong class="customer">${esc(doc.bill_to.name)}</strong><br>
          ${doc.bill_to.email ? `<span class="muted">${esc(doc.bill_to.email)}</span><br>` : ''}
          ${addressLines.map(line => `<span class="muted">${esc(line)}</span>`).join('<br>')}
        </div>
        <div class="box meta">
          <strong>Invoice #</strong><span class="bk-number">${esc(doc.bulk_number)}</span>
          <strong>Issued</strong><span>${esc(longDate(doc.issue_date))}</span>
          <strong>Due Date</strong><span>${esc(longDate(doc.due_date))}</span>
          <strong>Invoices</strong><span>${esc(doc.invoice_count)}</span>
          <strong>Facilities</strong><span>${esc(doc.facility_count)}</span>
        </div>
      </section>

      <div class="bk-section">
        <h2>Invoices Included</h2>
        <table>
          <colgroup><col style="width:22%"><col style="width:12%"><col style="width:18%"><col style="width:15%"><col style="width:15%"><col style="width:18%"></colgroup>
          <thead><tr><th>Invoice #</th><th>Type</th><th>For</th><th>Issued</th><th>Due</th><th class="right">Amount</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">No invoices</td></tr>'}</tbody>
        </table>
      </div>
      ${payments}

      <div class="bk-bottom">
        ${doc.note ? `<div class="bk-note"><strong>Note</strong><span class="bk-pre">${esc(doc.note)}</span></div>` : '<div></div>'}
        <section class="totals">
          <div><span>Total</span><strong>${esc(money(doc.total_amount))}</strong></div>
          ${cardFee ? `<div><span>Card processing fee</span><strong>${esc(money(cardFee))}</strong></div>` : ''}
          ${paid ? `<div><span>Paid</span><strong>${esc(money(paid + cardFee))}</strong></div>` : ''}
          <div class="grand"><span>Balance Due</span><span>${esc(money(doc.balance_due))}</span></div>
        </section>
      </div>

      <div class="foot-divider"></div>
      <section class="footer">
        <strong>Thank you for your business.</strong>
        <span>Each invoice follows on its own page.</span>
      </section>
    </section>
  </main>`
}

// ---------------------------------------------------------------- sales and rental invoices, as Billing prints them

const customLineItems = (rows: any[] | null | undefined, fallbackNumber: string): PrintableLineItem[] => (
  (rows || []).map((line, index) => ({
    item_number: line.item_number || line.part_number || fallbackNumber || `ITEM-${index + 1}`,
    description: line.description || line.part_description || 'Invoice item',
    quantity: Number(line.quantity || 0),
    unit_price: Number(line.unit_price || 0),
    shipping_fee: Number(line.shipping_fee || 0),
    setup_fee: Number(line.setup_fee || 0),
    condition: line.condition || line.item_type || null,
    total_amount: Number(line.total_amount ?? line.total ?? 0),
    unitLabel: line.unitLabel,
    custom_cells: Array.isArray(line.custom_cells) ? line.custom_cells : [],
  }))
)

/** A sales or rental invoice, mapped as Billing maps it for printing. */
export const genericPrintableInvoice = (kind: string, invoice: any): PrintableInvoice => {
  const amount = Number(invoice.total_amount || 0)
  return {
    invoice_number: invoice.invoice_number,
    invoice_type: kind,
    reference_number: invoice.related_number || '-',
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email,
    customer_phone: invoice.customer_phone || null,
    customer_address: invoice.customer_address || null,
    facility_name: invoice.facility_name || '-',
    subtotal: Number(invoice.subtotal ?? amount ?? 0),
    tax_amount: Number(invoice.tax_amount || 0),
    discount_amount: Number(invoice.discount_amount || 0),
    total_amount: amount,
    amount_paid: Number(invoice.amount_paid || 0),
    balance_due: Number(invoice.balance_due || 0),
    status: String(invoice.status || ''),
    issue_date: invoice.issue_date || invoice.created_at,
    due_date: invoice.due_date,
    payment_method: invoice.payment_method,
    notes: kind === 'rental' ? 'Rental invoice' : 'Sales invoice',
    labels: invoice.labels || null,
    summary_rows: invoice.summary_rows || [],
    card_fee_amount: Number(invoice.card_fee_amount || 0),
    card_fee_label: 'Card processing fee',
  }
}

export const genericPrintableLineItems = (kind: string, invoice: any): PrintableLineItem[] => {
  const custom = customLineItems(invoice.line_items, invoice.invoice_number)
  if (custom.length) return custom
  const amount = Number(invoice.total_amount || 0)
  return [{
    item_number: invoice.related_number || invoice.invoice_number,
    description: kind === 'rental' ? 'Rental invoice' : 'Sales invoice',
    quantity: 1,
    unit_price: amount,
    shipping_fee: 0,
    setup_fee: 0,
    condition: null,
    total_amount: amount,
  }]
}

/** One invoice's own page. */
export const bulkInvoicePageHtml = async (page: BulkInvoicePage): Promise<string> => {
  if (!page.document) return ''
  if (page.kind === 'service') return buildServiceInvoiceHtml(page.document as ServiceInvoiceDocument)
  if (page.kind === 'inspection') return inspectionInvoiceSheet(page.document as InspectionInvoiceDocument)
  const kind = page.kind === 'rental' ? 'rental' : 'sales'
  return buildPrintableHtml(
    genericPrintableInvoice(kind, page.document),
    'invoice',
    genericPrintableLineItems(kind, page.document),
    [],
    KIND_LABEL[kind],
    'Invoice',
    KIND_ACCENT[kind],
    'Qty',
  )
}

/** The whole bulk invoice: the front page, then each invoice on its own page. */
export const buildBulkInvoiceHtml = async (doc: BulkInvoiceDocument): Promise<string> => {
  const pages = await Promise.all(doc.invoices.map(page => bulkInvoicePageHtml(page)))
  return `${printStyles}${BULK_STYLES}${bulkFrontPageHtml(doc)}${pages.filter(Boolean).map(html => `<div class="bk-page">${html}</div>`).join('')}`
}
