/**
 * The service invoice document, in the same design as sales and rental invoices:
 * the service report and the charges together, with a QR code and link to pay
 * once a link has been issued.
 *
 * Every value is escaped; the same HTML is shown in Billing, printed, and shown
 * on the customer's payment page. Parts carry no amounts: they are billed only
 * through a quotation. Test equipment appears only if some was used.
 */
import type { ServiceInvoiceDocument } from '@/api/serviceRequests'
import { printStyles } from '@/utils/invoiceDocumentStyles'

const COMPANY = {
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

const statusLabel = (status: string) => (status === 'pending' || status === 'overdue' ? 'Due' : status.replace(/_/g, ' '))

// Only what the shared design has no class for, and its narrow-screen layout.
const EXTRA_STYLES = `
<style>
  .doc-a .si-section { margin-top: 24px; }
  .doc-a .si-section h2 { margin: 0 0 8px; font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 900; }
  .doc-a .si-section table { margin-top: 0; }
  .doc-a .pre { white-space: pre-wrap; }
  .doc-a .si-empty { color: #94A3B8; }
  .doc-a tr.si-total td { font-weight: 900; color: #1E1B4B; background: #F8FAFC; }
  .doc-a .si-bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-top: 24px; page-break-inside: avoid; }
  .doc-a .si-bottom .totals { margin-top: 0; margin-left: auto; }
  .doc-a .si-pay { display: flex; gap: 14px; align-items: center; max-width: 360px; }
  .doc-a .si-pay img { width: 104px; height: 104px; flex: none; }
  .doc-a .si-pay strong { color: #1E1B4B; display: block; margin-bottom: 4px; }
  .doc-a .si-pay a { color: var(--accent); font-size: 11px; word-break: break-all; }
  @media (max-width: 720px) {
    .sheet { width: 100%; margin: 0; box-shadow: none; min-height: 0; }
    .doc-a .head { padding: 18px 16px 10px; flex-wrap: wrap; }
    .doc-a .head .brand { flex-wrap: wrap; }
    .doc-a .doc-title { font-size: 26px; }
    .doc-a .accent-bar { margin: 4px 16px 0; }
    .doc-a .content { padding: 16px; }
    .doc-a .grid { grid-template-columns: 1fr; }
    .doc-a .si-scroll { overflow-x: auto; }
    .doc-a .si-scroll table { min-width: 560px; }
    .doc-a .si-bottom { flex-direction: column; }
    .doc-a .si-pay { max-width: 100%; }
    .doc-a .si-pay div { min-width: 0; }
    .doc-a .si-bottom .totals { width: 100%; }
  }
</style>`

const table = (head: string[], rows: string[], columns: number) => `
  <div class="si-scroll"><table>
    <thead><tr>${head.map(cell => `<th>${esc(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td class="si-empty" colspan="${columns}">No items to display</td></tr>`}</tbody>
  </table></div>`

const qrCode = async (link: string) => {
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(link, { margin: 1, width: 240 })
  } catch {
    return null // The link below still works without the picture.
  }
}

export const buildServiceInvoiceHtml = async (doc: ServiceInvoiceDocument): Promise<string> => {
  const qr = doc.payment_link ? await qrCode(doc.payment_link) : null
  const { equipment, facility } = doc

  const workRows = doc.work_entries.map(entry => `
    <tr>
      <td>${esc(entry.date)}</td>
      <td class="pre">${esc(entry.diagnosis)}</td>
      <td class="pre">${esc(entry.work_done)}</td>
      <td>${esc(entry.technician)}</td>
      <td>${esc(clock(entry.check_in))}</td>
      <td>${esc(clock(entry.check_out))}</td>
      <td class="right">${entry.hours != null ? esc(Number(entry.hours)) : ''}</td>
    </tr>`)
  const partRows = doc.parts.map((part, index) => `
    <tr><td>${index + 1}</td><td class="item-number">${esc(part.part_number)}</td><td>${esc(part.description)}</td><td class="right">${esc(part.quantity)}</td><td>${esc(part.condition)}</td></tr>`)
  const equipmentRows = doc.test_equipment.map((item, index) => `
    <tr><td>${index + 1}</td><td>${esc(item.description)}</td><td>${esc(item.make)}</td><td>${esc(item.model)}</td><td>${esc(item.serial_number)}</td></tr>`)

  const charge = (label: string, value: unknown) => `<div><span>${esc(label)}</span><strong>${esc(money(value))}</strong></div>`
  const tax = Number(doc.tax_amount || 0)
  const discount = Number(doc.discount_amount || 0)
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
          ${facility.address ? `<span class="muted">${esc(facility.address)}</span>` : ''}
        </div>
        <div class="box meta">
          <strong>Invoice #</strong><span>${esc(doc.invoice_number)}</span>
          <strong>Request #</strong><span>${esc(doc.request_number || '-')}</span>
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
        ${table(['#', 'Service Required', 'Serial#', 'Asset #', 'Make', 'Model'], [`
          <tr><td>1</td><td class="pre">${esc(equipment.service_required)}</td><td>${esc(equipment.serial_number)}</td><td>${esc(equipment.asset_tag)}</td><td>${esc(equipment.make)}</td><td>${esc(equipment.model)}</td></tr>`], 6)}
      </div>

      <div class="si-section si-scroll">
        <table>
          <thead><tr><th>Date</th><th>Diagnose</th><th>Action Taken</th><th>Technician</th><th>Check In</th><th>Check Out</th><th class="right">Hours</th></tr></thead>
          <tbody>
            ${workRows.length ? workRows.join('') : '<tr><td class="si-empty" colspan="7">No items to display</td></tr>'}
            <tr class="si-total"><td class="right" colspan="6">Total Hours:</td><td class="right">${esc(Number(doc.total_hours || 0))}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="si-section">
        <h2>Parts Used</h2>
        ${table(['#', 'Part Number', 'Description', 'Quantity', 'Condition'], partRows, 5)}
      </div>

      ${equipmentRows.length ? `
      <div class="si-section">
        <h2>Test Equipment</h2>
        ${table(['#', 'Description', 'Make', 'Model', 'Serial#'], equipmentRows, 5)}
      </div>` : ''}

      <div class="si-section">
        ${table(['Technician Name', 'Attachment'], [`<tr><td>${esc(doc.technician)}</td><td></td></tr>`], 2)}
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
        ${doc.payment_link ? `
        <div class="si-pay">
          ${qr ? `<img src="${qr}" alt="QR code to pay this invoice" />` : ''}
          <div>
            <strong>${qr ? 'Scan QR code to pay invoice' : 'Pay this invoice'}</strong>
            <a href="${esc(doc.payment_link)}">${esc(doc.payment_link)}</a>
          </div>
        </div>` : ''}
        <section class="totals">
          ${doc.charges.map(row => charge(row.label, row.amount)).join('')}
          ${charge('Total', doc.subtotal)}
          ${tax ? charge('Tax', tax) : ''}
          ${discount ? charge('Discount', -discount) : ''}
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
