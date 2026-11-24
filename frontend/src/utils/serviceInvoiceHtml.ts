/**
 * The service invoice document, in the same design as sales and rental invoices:
 * the service report and the charges together.
 *
 * Every value is escaped; the same HTML is shown in Billing, printed, and shown
 * on the customer's payment page. Parts carry no amounts: they are billed only
 * through a quotation. Test equipment appears only if some was used.
 */
import type { ServiceInvoiceDocument } from '@/api/serviceRequests'
import { printStyles } from '@/utils/invoiceDocumentStyles'
import { facilityAddressLines } from '@/utils/facilityAddress'

/** The company, as every invoice heads it. */
export const COMPANY = {
  name: 'Mr. BioMed Tech Services',
  address: '555 N. 5th Street Suite 109 · Garland, TX 75040',
  contact: 'omar@mbmts.com · (469) 767-8853 · Fax 972-276-0757',
  website: 'https://medradsmartsystem.com',
  logo: '/mr-biomed-logo.jpeg',
}
const ACCENT = '#7C3AED'
const ACCENT_SOFT = '#F5F3FF'

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

const clock = (value?: string | null) => {
  const parsed = parseDate(value)
  return parsed ? parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

/**
 * Escaped text whose everyday words stay whole. Only a run of 25 or more
 * characters with no space (a long serial, a pasted code) gets places it may
 * break, so one value cannot push a table off the page.
 */
const LONG_RUN = 25
const fit = (value: unknown) => String(value ?? '').split(/(\s+)/).map(part => (
  part.length >= LONG_RUN ? (part.match(/.{1,12}/g) || []).map(esc).join('<wbr>') : esc(part)
)).join('')

/** Check-in and check-out in one column: "9:00 AM – 1:00 PM", or whichever was recorded. */
const visitTime = (checkIn?: string | null, checkOut?: string | null) => {
  const from = clock(checkIn)
  const to = clock(checkOut)
  return from && to ? `${from} – ${to}` : from || to
}

/** 4 -> "4.00", 6.666 -> "6.67": hours as everywhere else on the invoice. */
const hoursText = (value: unknown) => Number(value || 0).toFixed(2)

const statusLabel = (status: string) => (status === 'pending' || status === 'overdue' ? 'Due' : status.replace(/_/g, ' '))

// Only what the shared design has no class for, and its narrow-screen layout.
const EXTRA_STYLES = `
<style>
  .doc-a .si-section { margin-top: 24px; }
  .doc-a .si-section h2 { margin: 0 0 8px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900; }
  .doc-a .si-section table { margin-top: 0; }
  .doc-a .pre { white-space: pre-wrap; }
  .doc-a .si-empty { color: #94A3B8; }
  /* System numbers (INV-SERVICE-000008) are never broken at their hyphens. */
  .doc-a .box.meta .si-number { white-space: nowrap; }
  /* Every table fits the width it is given -- a printed page, the Billing
     window, a phone -- and never scrolls: each column has a set share of the
     width. The shares let headings, codes, dates, times, makes and models sit
     on one line on a printed page; long text wraps between words, and a word
     is split only when it is wider than its whole column. */
  .doc-a .si-section table { table-layout: fixed; width: 100%; }
  .doc-a .si-section th, .doc-a .si-section td { padding-left: 8px; padding-right: 8px; }
  .doc-a .si-section th, .doc-a .si-section td { word-break: normal; overflow-wrap: break-word; }
  .doc-a .si-section td.right, .doc-a .si-section th.right { text-align: right; }
  .doc-a tr.si-total td { font-weight: 900; color: #1E1B4B; background: #F8FAFC; }
  .doc-a .si-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 24px; page-break-inside: avoid; }
  .doc-a .si-bottom .totals { margin-top: 0; margin-left: auto; }
  .doc-a .totals div { gap: 12px; }
  .doc-a .totals strong { white-space: nowrap; }
  .doc-a .totals .si-breakdown { color: #94A3B8; font-size: 12px; font-weight: 600; white-space: nowrap; }
  @media (max-width: 720px) {
    .sheet { width: 100%; margin: 0; box-shadow: none; min-height: 0; }
    .doc-a .head { padding: 18px 16px 10px; flex-wrap: wrap; }
    .doc-a .head .brand { flex-wrap: wrap; }
    .doc-a .doc-title { font-size: 26px; }
    .doc-a .accent-bar { margin: 4px 16px 0; }
    .doc-a .content { padding: 16px; }
    .doc-a .grid { grid-template-columns: 1fr; }
    .doc-a .si-bottom { flex-direction: column; }
    .doc-a .si-section table { font-size: 11.5px; }
    .doc-a .si-section th { font-size: 9.5px; letter-spacing: 0.03em; }
    .doc-a .si-section th, .doc-a .si-section td { padding-left: 5px; padding-right: 5px; }
    .doc-a .si-bottom .totals { width: 100%; }
  }
</style>`

/** A heading, or [heading, class] for one that lines up like its cells ("right"). */
type Head = string | [string, string]
/** Each column's share of the width, in percent; they add up to 100. */
const columnShares = (widths: number[]) => `<colgroup>${widths.map(width => `<col style="width:${width}%">`).join('')}</colgroup>`
const table = (head: Head[], rows: string[], widths: number[]) => `
  <table>${columnShares(widths)}
    <thead><tr>${head.map(cell => (Array.isArray(cell) ? `<th class="${cell[1]}">${esc(cell[0])}</th>` : `<th>${esc(cell)}</th>`)).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td class="si-empty" colspan="${widths.length}">No items to display</td></tr>`}</tbody>
  </table>`

export const buildServiceInvoiceHtml = async (doc: ServiceInvoiceDocument): Promise<string> => {
  const { equipment, facility } = doc
  // The street, then city, state, zip and country -- never printed twice, as on the reports.
  const twoLines = facility.address_fields ? facilityAddressLines(facility.address_fields) : null
  const addressLines = (twoLines ? [twoLines.street, twoLines.line2] : [facility.address]).filter(Boolean)

  // The Time column only when a visit has a time; without it Action Taken has the room.
  const hasTime = doc.work_entries.some(entry => entry.check_in || entry.check_out)
  const workShares = hasTime ? [14, 13, 26, 15, 21, 11] : [14, 18, 42, 15, 11]
  const workRows = doc.work_entries.map(entry => `
    <tr>
      <td>${esc(entry.date ? longDate(entry.date) : '')}</td>
      <td class="pre">${fit(entry.diagnosis)}</td>
      <td class="pre">${fit(entry.work_done)}</td>
      <td>${fit(entry.technician)}</td>
      ${hasTime ? `<td>${esc(visitTime(entry.check_in, entry.check_out))}</td>` : ''}
      <td class="right">${entry.hours != null ? esc(hoursText(entry.hours)) : ''}</td>
    </tr>`)
  const partRows = doc.parts.map((part, index) => `
    <tr><td>${index + 1}</td><td class="item-number">${fit(part.part_number)}</td><td>${fit(part.description)}</td><td class="right">${esc(part.quantity)}</td><td>${esc(part.condition)}</td></tr>`)
  const equipmentRows = doc.test_equipment.map((item, index) => `
    <tr><td>${index + 1}</td><td>${fit(item.description)}</td><td>${fit(item.make)}</td><td>${fit(item.model)}</td><td>${fit(item.serial_number)}</td></tr>`)

  const charge = (label: string, value: unknown, breakdown?: string | null) => `<div><span>${esc(label)}${breakdown ? ` <span class="si-breakdown">(${esc(breakdown)})</span>` : ''}</span><strong>${esc(money(value))}</strong></div>`
  const tax = Number(doc.tax_amount || 0)
  const discount = Number(doc.discount_amount || 0)
  const cardFee = Number(doc.card_fee_amount || 0)
  const paid = Number(doc.amount_paid || 0)

  return `${printStyles}${EXTRA_STYLES}
  <main class="sheet doc-a" style="--accent:${ACCENT}; --accent-soft:${ACCENT_SOFT}">
    <section class="head">
      <div class="brand">
        <img src="${COMPANY.logo}" alt="${esc(COMPANY.name)}" />
        <div>
          <div class="eyebrow">Service Invoice</div>
          <h1 class="doc-title">Invoice</h1>
          <div class="doc-company">${esc(COMPANY.name)}</div>
          <div class="doc-address">${esc(COMPANY.address)}<br/>${esc(COMPANY.contact)}<br/>${esc(COMPANY.website)}</div>
        </div>
      </div>
      <div class="head-right">
        <span class="status-pill">${esc(statusLabel(doc.status))}</span>
      </div>
    </section>
    <div class="accent-bar"></div>

    <section class="content">
      <section class="grid">
        <div class="box prepared">
          <h3>Bill To</h3>
          <strong class="customer">${esc(facility.name)}</strong><br>
          ${facility.contact_name ? `<span class="muted">${esc(facility.contact_name)}</span><br>` : ''}
          ${facility.email ? `<span class="muted">${esc(facility.email)}</span><br>` : ''}
          ${facility.phone ? `<span class="muted">${esc(facility.phone)}</span><br>` : ''}
          ${addressLines.map(line => `<span class="muted">${esc(line)}</span>`).join('<br>')}
        </div>
        <div class="box meta">
          <strong>Invoice #</strong><span class="si-number">${esc(doc.invoice_number)}</span>
          <strong>Request #</strong><span class="si-number">${esc(doc.request_number || '-')}</span>
          <strong>PO</strong><span>${esc(doc.po || '-')}</span>
          <strong>Issued</strong><span>${esc(longDate(doc.issue_date))}</span>
          <strong>Due Date</strong><span>${esc(longDate(doc.due_date))}</span>
          <strong>Installment Plan</strong><span>${esc(doc.installment_plan)}</span>
          <strong>Preferred Date</strong><span>${esc(longDate(doc.preferred_date))}</span>
          <strong>Actual Date</strong><span>${esc(longDate(doc.actual_date))}</span>
        </div>
      </section>

      <div class="si-section">
        <h2>Service Report</h2>
        ${table(['#', 'Service Required', 'Asset Description', 'Serial#', 'Asset #', 'Make', 'Model'], [`
          <tr><td>1</td><td class="pre">${fit(equipment.service_required)}</td><td>${fit(equipment.description)}</td><td>${fit(equipment.serial_number)}</td><td>${fit(equipment.asset_tag)}</td><td>${fit(equipment.make)}</td><td>${fit(equipment.model)}</td></tr>`], [4, 22, 23, 14, 12, 10, 15])}
      </div>

      <div class="si-section">
        <table>${columnShares(workShares)}
          <thead><tr><th>Date</th><th>Diagnose</th><th>Action Taken</th><th>Technician</th>${hasTime ? '<th>Time</th>' : ''}<th class="right">Hours</th></tr></thead>
          <tbody>
            ${workRows.length ? workRows.join('') : `<tr><td class="si-empty" colspan="${workShares.length}">No items to display</td></tr>`}
            <tr class="si-total"><td class="right" colspan="${workShares.length - 1}">Total Hours:</td><td class="right">${esc(hoursText(doc.total_hours))}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="si-section">
        <h2>Parts Used</h2>
        ${table(['#', 'Part Number', 'Description', ['Quantity', 'right'], 'Condition'], partRows, [5, 22, 43, 13, 17])}
      </div>

      ${equipmentRows.length ? `
      <div class="si-section">
        <h2>Test Equipment</h2>
        ${table(['#', 'Description', 'Make', 'Model', 'Serial#'], equipmentRows, [5, 33, 22, 20, 20])}
      </div>` : ''}

      <div class="si-section">
        ${table(['Technician Name', 'Attachment'], [`<tr><td>${esc(doc.technician)}</td><td></td></tr>`], [50, 50])}
      </div>

      ${doc.paid_quotations?.length ? `
      <section class="paid-separate">
        <h2>Paid Service Quotations</h2>
        <table>
          <thead><tr><th>Quotation</th><th>Description</th><th class="right">Paid</th><th>Paid On</th></tr></thead>
          <tbody>${doc.paid_quotations.map(quotation => `
            <tr><td>${esc(quotation.quotation_number)}</td><td>${esc(quotation.description)}</td><td class="right amount">${esc(money(quotation.paid_amount))}</td><td>${esc(longDate(quotation.paid_at))}</td></tr>`).join('')}</tbody>
        </table>
        <p class="paid-separate-note">These service quotation charges were paid separately during this service request and are shown for history only. They are not included in this invoice total.</p>
      </section>` : ''}

      <div class="si-bottom">
        <section class="totals">
          ${doc.charges.map(row => charge(row.label, row.amount, row.breakdown)).join('')}
          ${charge('Total', doc.subtotal)}
          ${tax ? charge('Tax', tax) : ''}
          ${discount ? charge('Discount', -discount) : ''}
          ${cardFee ? charge(doc.card_fee_label || 'Card processing fee', cardFee) : ''}
          <div class="grand"><span>Grand Total</span><span>${esc(money(doc.total_amount))}</span></div>
          ${paid ? charge('Paid', paid) : ''}
          <div><span>Balance</span><strong class="balance">${esc(money(doc.balance_due))}</strong></div>
        </section>
      </div>

      <div class="foot-divider"></div>
      <section class="footer">
        <strong>Thank you for your business.</strong>
        <span>${esc(COMPANY.name)} &middot; Generated from Medrad Admin Panel</span>
      </section>
    </section>
  </main>`
}
