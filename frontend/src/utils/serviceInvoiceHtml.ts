/**
 * The service invoice document: the service report and the charges on one page,
 * with a QR code and link to pay once a link has been issued.
 *
 * Every value is escaped; the same HTML is shown in Billing, printed, and shown
 * on the customer's payment page. Parts carry no amounts: they are billed only
 * through a quotation. Test equipment appears only if some was used.
 */
import type { ServiceInvoiceDocument } from '@/api/serviceRequests'

const COMPANY = {
  name: 'Service',
  address: '555 N. 5th Street Suite 109, Garland, TX 75040',
  email: 'omar@mbmts.com',
  phone: '(469) 767-8853',
  fax: '972-276-0757',
  website: 'https://medradsmartsystem.com',
  logo: '/mr-biomed-logo.jpeg',
}

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
  return parsed ? parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : ''
}

const clock = (value?: string | null) => {
  const parsed = parseDate(value)
  return parsed ? parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

const statusLabel = (status: string) => {
  const label = status.replace(/_/g, ' ')
  return status === 'pending' || status === 'overdue' ? 'Due' : label.replace(/\b\w/g, char => char.toUpperCase())
}

const STYLES = `
<style>
  .si-doc, .si-doc * { box-sizing: border-box; }
  .si-doc { font-family: 'Open Sans', Arial, sans-serif; font-size: 11px; color: #3F4A5A; background: #fff; padding: 24px; max-width: 900px; margin: 0 auto; }
  .si-doc h3 { margin: 0 0 8px; font-size: 13px; color: #3F4A5A; }
  .si-doc b, .si-doc strong { color: #3F4A5A; }
  .si-row { display: flex; justify-content: space-between; gap: 24px; }
  .si-head { align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid #D9DEE7; margin-bottom: 16px; }
  .si-logo { height: 76px; width: auto; }
  .si-meta { text-align: left; font-size: 13px; font-weight: 700; line-height: 1.75; }
  .si-badge { display: inline-block; padding: 0 6px; border: 1px solid #7B8494; border-radius: 4px; font-size: 10px; }
  .si-block { line-height: 1.75; }
  .si-doc table { width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: auto; }
  .si-doc th, .si-doc td { border: 1px solid #D9DEE7; padding: 7px 8px; text-align: left; vertical-align: top; word-break: break-word; }
  .si-doc th { font-weight: 600; background: #fff; }
  .si-doc td.pre { white-space: pre-wrap; }
  .si-doc .si-total-row td { text-align: right; font-weight: 700; }
  .si-doc .si-empty { background: #FBFCFE; }
  .si-section { margin-top: 22px; }
  .si-section table { margin-top: 0; }
  .si-foot { margin-top: 30px; align-items: flex-start; page-break-inside: avoid; }
  .si-who { display: grid; grid-template-columns: 110px 1fr 110px 1fr; gap: 16px 12px; flex: 1; }
  .si-charges { min-width: 200px; line-height: 2; }
  .si-charges div { display: flex; justify-content: space-between; gap: 28px; }
  .si-charges .si-rule { border-top: 1px solid #7B8494; margin: 6px 0; height: 0; }
  .si-pay { margin-top: 14px; page-break-inside: avoid; }
  .si-pay h3 { margin-bottom: 4px; }
  .si-qr { width: 96px; height: 96px; display: block; }
  .si-link { text-align: center; margin-top: 10px; }
  .si-link a { color: #1D4ED8; word-break: break-all; }
</style>`

const table = (head: string[], rows: string[], columns: number) => `
  <table>
    <thead><tr>${head.map(cell => `<th>${esc(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td class="si-empty" colspan="${columns}">No items to display</td></tr>`}</tbody>
  </table>`

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
  const equipment = doc.equipment
  const facility = doc.facility

  const workRows = doc.work_entries.map(entry => `
    <tr>
      <td>${esc(entry.date)}</td>
      <td class="pre">${esc(entry.diagnosis)}</td>
      <td class="pre">${esc(entry.work_done)}</td>
      <td>${esc(entry.technician)}</td>
      <td>${esc(clock(entry.check_in))}</td>
      <td>${esc(clock(entry.check_out))}</td>
      <td>${entry.hours != null ? esc(Number(entry.hours)) : ''}</td>
    </tr>`)
  const partRows = doc.parts.map((part, index) => `
    <tr><td>${index + 1}</td><td>${esc(part.part_number)}</td><td>${esc(part.description)}</td><td>${esc(part.quantity)}</td><td>${esc(part.condition)}</td></tr>`)
  const equipmentRows = doc.test_equipment.map((item, index) => `
    <tr><td>${index + 1}</td><td>${esc(item.description)}</td><td>${esc(item.make)}</td><td>${esc(item.model)}</td><td>${esc(item.serial_number)}</td></tr>`)

  const charge = (label: string, value: unknown) => `<div><span>${esc(label)}</span><span>${esc(money(value))}</span></div>`
  const tax = Number(doc.tax_amount || 0)
  const discount = Number(doc.discount_amount || 0)
  const paid = Number(doc.amount_paid || 0)

  return `${STYLES}
  <div class="si-doc">
    <div class="si-row si-head">
      <img class="si-logo" src="${COMPANY.logo}" alt="Mr. BioMed Tech Services" />
      <div class="si-meta">
        <div>Invoice #${esc(doc.invoice_number)}</div>
        <div>Due Date: ${esc(longDate(doc.due_date))}</div>
        <div>Installment Plan: ${esc(doc.installment_plan)}</div>
        <div>Status: <span class="si-badge">${esc(statusLabel(doc.status))}</span></div>
      </div>
    </div>

    <div class="si-row">
      <div class="si-block">
        <h3>${esc(COMPANY.name)}</h3>
        <div>${esc(COMPANY.address)}</div>
        <div><b>E-mail:</b> ${esc(COMPANY.email)}</div>
        <div><b>Phone:</b>${esc(COMPANY.phone)}</div>
        <div><b>Fax:</b>${esc(COMPANY.fax)}</div>
        <div><b>Website:</b> ${esc(COMPANY.website)}</div>
      </div>
      <div class="si-block">
        <h3>Service Report</h3>
        <div><b>PO :</b> ${esc(doc.po)}</div>
        <div><b>Facility Name:</b> ${esc(facility.name)}</div>
        <div><b>Address:</b> ${esc(facility.address)}</div>
        <div><b>Contact Name:</b> ${esc(facility.contact_name)}</div>
        <div><b>Phone:</b>${esc(facility.phone)}</div>
        <div><b>E-mail:</b>${esc(facility.email)}</div>
      </div>
    </div>

    ${table(['#', 'Service Required', 'Serial#', 'Asset #', 'Make', 'Model'], [`
      <tr><td>1</td><td class="pre">${esc(equipment.service_required)}</td><td>${esc(equipment.serial_number)}</td><td>${esc(equipment.asset_tag)}</td><td>${esc(equipment.make)}</td><td>${esc(equipment.model)}</td></tr>`], 6)}

    <table>
      <thead><tr><th>Date</th><th>Diagnose</th><th>Action Taken</th><th>Technician</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr></thead>
      <tbody>
        ${workRows.length ? workRows.join('') : '<tr><td class="si-empty" colspan="7">No items to display</td></tr>'}
        <tr class="si-total-row"><td colspan="6">Total Hours:</td><td>${esc(Number(doc.total_hours || 0))}</td></tr>
      </tbody>
    </table>

    <div class="si-section">
      <h3>Parts Used</h3>
      ${table(['#', 'Part Number', 'Description', 'Quantity', 'Condition'], partRows, 5)}
    </div>

    ${equipmentRows.length ? `
    <div class="si-section">
      <h3>Test Equipment</h3>
      ${table(['#', 'Description', 'Make', 'Model', 'Serial#'], equipmentRows, 5)}
    </div>` : ''}

    <div class="si-section">
      <table>
        <thead><tr><th>Technician Name</th><th>Attachment</th></tr></thead>
        <tbody><tr><td>${esc(doc.technician)}</td><td></td></tr></tbody>
      </table>
    </div>

    ${doc.paid_quotations?.length ? `
    <div class="si-section">
      <h3>Paid Service Quotations</h3>
      ${table(['Quotation', 'Description', 'Paid', 'Paid On'], doc.paid_quotations.map(quotation => `
        <tr><td>${esc(quotation.quotation_number)}</td><td>${esc(quotation.description)}</td><td>${esc(money(quotation.paid_amount))}</td><td>${esc(longDate(quotation.paid_at))}</td></tr>`), 4)}
      <div style="margin-top:6px">Paid separately and shown for history only. These are not included in this invoice total.</div>
    </div>` : ''}

    <div class="si-row si-foot">
      <div class="si-who">
        <div>Technician</div><div>${esc(doc.technician)}</div>
        <div>Preferred Date</div><div>${esc(longDate(doc.preferred_date))}</div>
        <div>Client</div><div>${esc(doc.client)}</div>
        <div>Actual Date</div><div>${esc(longDate(doc.actual_date))}</div>
      </div>
      <div class="si-charges">
        ${doc.charges.map(row => charge(row.label, row.amount)).join('')}
        ${charge('Total', doc.subtotal)}
        ${tax ? charge('Tax', tax) : ''}
        ${discount ? charge('Discount', -discount) : ''}
        <div class="si-rule"></div>
        ${charge('Grand Total', doc.total_amount)}
        ${paid ? charge('Paid', paid) : ''}
        ${charge('Balance', doc.balance_due)}
      </div>
    </div>

    ${doc.payment_link ? `
    <div class="si-pay">
      ${qr ? `<h3>Scan QR code<br/>to pay invoice</h3><img class="si-qr" src="${qr}" alt="QR code to pay this invoice" />` : ''}
      <div class="si-link">
        <h3>Payment Link:</h3>
        <a href="${esc(doc.payment_link)}">${esc(doc.payment_link)}</a>
      </div>
    </div>` : ''}
  </div>`
}
