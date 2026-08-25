import { fetchFacility, type Facility } from '@/api/facilities'
import { buildInspectionReportDocumentHtml, INSPECTION_REPORT_CSS } from '@/utils/inspectionReportHtml'

// Presentation only. The standalone service report reuses the customer rental-agreement
// design (the same INSPECTION_REPORT_CSS chrome the inspection report uses); the invoice
// append keeps the invoice document's own .doc-a styling so both flow together on one print.
const COMPANY = {
  name: 'Mr. BioMed Tech Services',
  phone: '(469) 767-8853',
  email: 'omar@mbmts.com',
  address: '555 N. 5th Street Suite 109, Garland, TX 75040',
  website: 'https://medradsmartsystem.com',
  logo: '/mr-biomed-logo.jpeg',
}

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

const numberValue = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value: unknown) => `$${numberValue(value).toFixed(2)}`

const fmtDate = (value: string | null | undefined) => {
  if (!value) return ''
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtDateTime = (value: string | null | undefined) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const hasVal = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text.length > 0 && text !== '-'
}

// Both shapes are accepted: the Reports ServiceReport (has .sessions) and the raw service
// request used in Billing (sessions live in .history).
const deduplicateSessions = (sessions: any[]) => {
  const rows: any[] = []
  const indexes = new Map<string, number>()
  sessions.forEach((session) => {
    const sessionId = String(session?.session_id || '').trim()
    if (sessionId && indexes.has(sessionId)) {
      const index = indexes.get(sessionId)!
      const existing = { ...rows[index] }
      Object.entries(session || {}).forEach(([key, value]) => {
        if (key === 'parts' || key === 'test_equipment') {
          if (Array.isArray(value) && value.length) existing[key] = value
        } else if (value !== null && value !== undefined) {
          existing[key] = value
        }
      })
      rows[index] = existing
      return
    }
    if (sessionId) indexes.set(sessionId, rows.length)
    rows.push(session)
  })
  return rows
}

const serviceSessions = (sr: any): any[] => {
  if (Array.isArray(sr?.sessions) && sr.sessions.length) return deduplicateSessions(sr.sessions)
  const sessions = (sr?.history || [])
    .filter((entry: any) => entry.action === 'technician_clock_out' || entry.action === 'technician_work_session')
    .map((entry: any) => ({ user: entry.user || sr?.technician_name || 'Technician', timestamp: entry.timestamp, ...(entry.changes || {}) }))
  return deduplicateSessions(sessions)
}

const totalMileage = (sessions: any[]) => sessions.reduce((sum, session) => sum + numberValue(session.total_mileage), 0)

const facilityLines = (facility: Facility | null | undefined, sr: any) => {
  const name = facility?.name || sr?.facility_name || ''
  const cityState = [facility?.city, facility?.state].filter(hasVal).join(', ')
  const line2 = [cityState, facility?.zip_code].filter(hasVal).join(' ')
  return { name, address: facility?.address || '', line2, phone: facility?.phone || '', email: facility?.email || '' }
}

/* ------------------------------------------------------------------ *
 * Standalone service report (Reports module) — shared rental design.  *
 * ------------------------------------------------------------------ */

const headerHtml = () => `
  <div class="rhead">
    <img src="${COMPANY.logo}" alt="${esc(COMPANY.name)}" />
    <div class="co"><b>${esc(COMPANY.name)}</b>Ph# ${esc(COMPANY.phone)}<br>${esc(COMPANY.email)}</div>
  </div>
  <div class="divider"></div>
`

const footerHtml = () => `
  <div class="rfoot">
    <div><b>Serviced By</b>${esc(COMPANY.name)}<br>Ph# ${esc(COMPANY.phone)}<br>${esc(COMPANY.email)}</div>
    <div class="r"><b>${esc(COMPANY.address)}</b>Ph# ${esc(COMPANY.phone)}<br>${esc(COMPANY.website)}</div>
  </div>
`

const page = (inner: string, opts: { break?: boolean } = {}) =>
  `<section class="page${opts.break ? ' page-break' : ''}">${headerHtml()}<div style="flex:1">${inner}</div>${footerHtml()}</section>`

const idBox = (label: string, value: unknown) => (hasVal(value) ? `<div class="idbox"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>` : '')

const statusClass = (value: unknown) => {
  const status = String(value || '').toLowerCase()
  if (status.includes('complete') || status.includes('paid') || status.includes('approved')) return 'pass'
  if (status.includes('cancel') || status.includes('declin') || status.includes('overdue')) return 'fail'
  return 'na'
}

const displayStatus = (value: unknown, fallback = 'Pending') =>
  String(value || fallback).replace(/_/g, ' ')

const detailRowsHtml = (rows: Array<[string, unknown]>, emptyText = 'No details were recorded.') => {
  const visible = rows.filter(([, value]) => hasVal(value))
  if (!visible.length) return `<p class="muted">${esc(emptyText)}</p>`
  return `<table class="doc notes"><tbody>${visible
    .map(([label, value]) => `<tr><td class="k">${esc(label)}</td><td>${esc(value)}</td></tr>`)
    .join('')}</tbody></table>`
}

const sessionEquipmentHtml = (session: any) => {
  const items: any[] = (session.test_equipment || []).filter((item: any) => hasVal(item.tem) || hasVal(item.description) || hasVal(item.serial_number))
  if (!items.length) return ''
  return `
    <h2 class="sec">Test Equipment Used</h2>
    <table class="doc">
      <thead><tr><th>Equipment</th><th>Manufacturer / Model</th><th>Serial / Asset #</th></tr></thead>
      <tbody>${items.map((item: any) => `<tr><td>${esc(item.tem || item.description || '-')}</td><td>${esc([item.mrf, item.model].filter(hasVal).join(' / ') || '-')}</td><td>${esc(item.serial_number || item.asset || '-')}</td></tr>`).join('')}</tbody>
    </table>`
}

const sessionPartsHtml = (session: any) => {
  const items: any[] = (session.parts || []).filter((item: any) => hasVal(item.part_number) || hasVal(item.description))
  if (!items.length) return ''
  return `
    <h2 class="sec">Parts Used</h2>
    <table class="doc">
      <thead><tr><th>Part#</th><th>Description</th><th class="center">Qty Used</th><th class="center">Stock Remaining</th></tr></thead>
      <tbody>${items.map((item: any) => `<tr><td>${esc(item.part_number || '-')}</td><td>${esc(item.description || '-')}</td><td class="center">${esc(numberValue(item.quantity_used))}</td><td class="center">${hasVal(item.balance_after) ? esc(numberValue(item.balance_after)) : '-'}</td></tr>`).join('')}</tbody>
    </table>`
}

const serviceFacilityHtml = (facility: Facility | null | undefined, sr: any) => {
  const fac = facilityLines(facility, sr)
  if (!fac.name) return ''
  const details = [
    fac.address,
    fac.line2,
    fac.phone ? `<b>Phone#</b> ${esc(fac.phone)}` : '',
    fac.email ? `<b>Email</b> ${esc(fac.email)}` : '',
  ].filter(Boolean).join('<br>')
  return `<div class="facbox"><div class="fac">${esc(fac.name)}</div><div>${details}</div></div>`
}

const serviceOverviewPageHtml = (sr: any, facility: Facility | null | undefined, sessions: any[]) => {
  const equipment = [sr.make, sr.model].filter(hasVal).join(' ') || sr.equipment_name
  return page(`
    <div class="rtitle">
      <h2 class="sec" style="font-size:20px;color:#1E3A8A">Service Engineering Report</h2>
      <span class="status ${statusClass(sr.status)}">${esc(displayStatus(sr.status, 'Completed'))}</span>
    </div>
    <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start">
      <div class="identity">
        ${idBox('Request #', sr.request_number)}
        ${idBox('Reference / PO #', sr.reference_number)}
        ${idBox('Equipment', equipment)}
        ${idBox('Asset Tag', sr.asset_tag)}
        ${idBox('Serial #', sr.serial_number)}
        ${idBox('Priority', displayStatus(sr.priority, ''))}
        ${idBox('Requested By', sr.requested_by_name)}
        ${idBox('Technician', sr.technician_name || 'Unassigned')}
      </div>
      ${serviceFacilityHtml(facility, sr)}
    </div>
    <h2 class="sec">Service Details</h2>
    ${detailRowsHtml([
      ['Reported Problem', sr.problem_description],
      ['Service Required', sr.service_required],
      ['Resolution Summary', sr.resolution_description],
    ])}
    <h2 class="sec">Service Timeline</h2>
    ${detailRowsHtml([
      ['Created', fmtDateTime(sr.created_at)],
      ['Assigned', fmtDateTime(sr.assigned_at)],
      ['Started', fmtDateTime(sr.started_at)],
      ['Completed', fmtDateTime(sr.completed_at)],
    ], 'No service timeline was recorded.')}
    <h2 class="sec">Work Summary</h2>
    <table class="doc">
      <thead><tr><th>Work Sessions</th><th class="right">Total Hours</th><th class="right">Total Mileage</th><th class="right">Recorded Service Cost</th></tr></thead>
      <tbody><tr>
        <td>${esc(sessions.length)}</td>
        <td class="right">${esc(numberValue(sr.time_spent_hours).toFixed(2))} hrs</td>
        <td class="right">${esc(totalMileage(sessions).toFixed(2))} mi</td>
        <td class="right amount">${esc(money(sr.total_cost))}</td>
      </tr></tbody>
    </table>
  `, { break: true })
}

const serviceSessionPageHtml = (session: any, index: number) => page(`
  <div class="rtitle">
    <h2 class="sec" style="font-size:20px;color:#1E3A8A">Technician Work Session ${index + 1}</h2>
    <span class="status pass">${session.duration_hours != null ? `${esc(numberValue(session.duration_hours).toFixed(2))} hrs` : 'Hours not recorded'}</span>
  </div>
  <div class="identity" style="grid-template-columns:1fr 1fr;margin-bottom:8px">
    ${idBox('Technician', session.user || 'Technician')}
    ${idBox('Start Time', fmtDateTime(session.start_time || session.clocked_in_at))}
    ${idBox('End Time', fmtDateTime(session.end_time || session.clocked_out_at || session.timestamp))}
    ${session.break_minutes != null ? idBox('Break Time', `${numberValue(session.break_minutes)} min`) : ''}
    ${session.duration_hours != null ? idBox('Work Hours', `${numberValue(session.duration_hours).toFixed(2)} hrs`) : ''}
    ${session.total_mileage != null ? idBox('Mileage', `${numberValue(session.total_mileage).toFixed(2)} mi`) : ''}
  </div>
  <h2 class="sec">Session Work Record</h2>
  ${detailRowsHtml([
    ['Diagnosis', session.diagnosis],
    ['Work Done', session.work_done],
    ['Notes', session.notes],
  ], 'No narrative work details were recorded for this session.')}
  ${sessionEquipmentHtml(session)}
  ${sessionPartsHtml(session)}
`, { break: true })

const serviceBillingPageHtml = (sr: any) => {
  const invoice = sr.invoice
  const amount = invoice ? numberValue(invoice.total_amount) : numberValue(sr.total_cost)
  const paid = invoice?.amount_paid !== undefined
    ? numberValue(invoice.amount_paid)
    : Math.max(amount - numberValue(invoice?.balance_due), 0)
  const summaryRows: Array<[string, unknown]> = invoice ? [
    ['Invoice #', invoice.invoice_number],
    ['Issue Date', fmtDate(invoice.issue_date)],
    ['Due Date', fmtDate(invoice.due_date)],
    ['Status', displayStatus(invoice.status)],
    ['Subtotal', money(invoice.subtotal)],
    ['Tax', money(invoice.tax_amount)],
    ['Discount', money(invoice.discount_amount)],
    ['Amount Paid', money(paid)],
    ['Balance Due', money(invoice.balance_due)],
    ['Payment Method', displayStatus(invoice.payment_method, '')],
  ] : [
    ['Billing Status', displayStatus(sr.billing_status, 'Not invoiced')],
    ['Recorded Service Cost', money(sr.total_cost)],
  ]
  return page(`
    <h2 class="sec" style="text-align:center;font-size:22px;color:#1E3A8A">Billing Page</h2>
    ${sr.facility_name ? `<div class="subtitle" style="margin-bottom:12px">${esc(sr.facility_name)}</div>` : ''}
    <table class="doc">
      <thead><tr><th class="center">S.No.</th><th>Request #</th><th>Equipment description</th><th class="right">Amount $</th></tr></thead>
      <tbody>
        <tr><td class="center">1</td><td>${esc(sr.request_number || '-')}</td><td>${esc(sr.equipment_name || '-')}</td><td class="right amount">${esc(money(amount))}</td></tr>
        <tr class="total"><td></td><td></td><td class="right">Total</td><td class="right amount">${esc(money(amount))}</td></tr>
      </tbody>
    </table>
    <h2 class="sec">${invoice ? 'Invoice Summary' : 'Billing Summary'}</h2>
    ${detailRowsHtml(summaryRows)}
    ${invoice ? '' : '<p class="muted" style="margin-top:10px">No service invoice has been generated for this request.</p>'}
  `)
}

export const buildServiceReportBody = (sr: any, facility: Facility | null | undefined): string => {
  const sessions = serviceSessions(sr)
  return [
    serviceOverviewPageHtml(sr, facility, sessions),
    ...sessions.map((session, index) => serviceSessionPageHtml(session, index)),
    serviceBillingPageHtml(sr),
  ].join('')
}

export const buildServiceReportDocument = (sr: any, facility: Facility | null | undefined): string =>
  buildInspectionReportDocumentHtml(buildServiceReportBody(sr, facility), `${sr.request_number || 'Service'} Service Report`)

const printDocument = (docHtml: string) => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(docHtml)
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

export const printServiceReportSheet = async (sr: any) => {
  let facility: Facility | null = null
  if (sr?.facility_id) { try { facility = await fetchFacility(sr.facility_id) } catch { /* ignore */ } }
  printDocument(buildServiceReportDocument(sr, facility))
}

/* ------------------------------------------------------------------ *
 * Invoice append — matches the invoice's .doc-a rental design so the  *
 * service report flows on the same print as the invoice.              *
 * ------------------------------------------------------------------ */

// Kept for compatibility; the .report-* classes live in InvoicePrintDialog print styles.
export const SERVICE_REPORT_EXTRA_CSS = INSPECTION_REPORT_CSS

const appendSessionHtml = (session: any, index: number) => {
  const equipment: any[] = (session.test_equipment || []).filter((i: any) => hasVal(i.tem) || hasVal(i.description) || hasVal(i.serial_number))
  const parts: any[] = (session.parts || []).filter((i: any) => hasVal(i.part_number) || hasVal(i.description))
  return `
    <div class="report-session">
      <div class="report-session-head">
        <strong>Session ${index + 1} — ${esc(session.user || 'Technician')}</strong>
        <span>${esc(numberValue(session.duration_hours).toFixed(2))} hrs</span>
      </div>
      <div class="report-times">
        <div><b>Start Time</b><br>${esc(fmtDateTime(session.start_time || session.clocked_in_at) || '-')}</div>
        <div><b>End Time</b><br>${esc(fmtDateTime(session.end_time || session.clocked_out_at || session.timestamp) || '-')}</div>
        ${session.break_minutes != null ? `<div><b>Break Time</b><br>${esc(String(session.break_minutes))} min</div>` : ''}
        ${session.total_mileage != null ? `<div><b>Total Mileage</b><br>${esc(numberValue(session.total_mileage).toFixed(2))} mi</div>` : ''}
      </div>
      ${hasVal(session.diagnosis) ? `<div class="report-h4">Diagnosis</div><p>${esc(session.diagnosis)}</p>` : ''}
      ${hasVal(session.work_done) ? `<div class="report-h4">Work Done</div><p>${esc(session.work_done)}</p>` : ''}
      ${hasVal(session.notes) ? `<div class="report-h4">Notes</div><p>${esc(session.notes)}</p>` : ''}
      ${equipment.length ? `<div class="report-h4">Test Equipment Used</div><div class="report-summary" style="margin-top:6px">${equipment.map((i: any) => `<span class="report-pill">${esc(i.tem || i.description || 'Test Equipment')}</span>`).join('')}</div>` : ''}
      ${parts.length ? `<div class="report-h4">Parts Used</div><div class="report-summary" style="margin-top:6px">${parts.map((i: any) => `<span class="report-pill">${esc(i.part_number || 'Part')} · Qty ${esc(numberValue(i.quantity_used))}</span>`).join('')}</div>` : ''}
    </div>`
}

/**
 * Self-contained <main class="sheet doc-a"> block for the service report, appended after
 * an invoice when printing invoice + report together. Uses the invoice document's own
 * .doc-a / .report-* classes (defined in InvoicePrintDialog print styles).
 */
export const buildServiceReportSheet = (sr: any): string => {
  const sessions = serviceSessions(sr)
  const sessionRows = sessions.length ? sessions.map((session, index) => appendSessionHtml(session, index)).join('') : '<p class="muted">No technician sessions recorded.</p>'
  return `
    <main class="sheet doc-a" style="--accent:#2563EB;--accent-soft:#EFF6FF;break-before:page;page-break-before:always;">
      <section class="head">
        <div class="brand">
          <img src="${COMPANY.logo}" alt="${esc(COMPANY.name)}" />
          <div>
            <div class="eyebrow">Service Report</div>
            <h1 class="doc-title">${esc(sr.request_number)}</h1>
            <div class="doc-company">${esc(COMPANY.name)}</div>
            <div class="doc-address">${esc(COMPANY.address)}</div>
          </div>
        </div>
        <div class="head-right"><span class="status-pill">${esc(displayStatus(sr.status || sr.billing_status, 'Completed'))}</span></div>
      </section>
      <div class="accent-bar"></div>
      <section class="content">
        <section class="grid">
          <div class="box"><h3>Facility</h3><strong class="customer">${esc(sr.facility_name || '-')}</strong></div>
          <div class="box meta">
            <strong>Equipment</strong><span>${esc(sr.equipment_name || '-')}</span>
            <strong>Reference / PO #</strong><span>${esc(sr.reference_number || '-')}</span>
            <strong>Requested By</strong><span>${esc(sr.requested_by_name || '-')}</span>
            <strong>Technician</strong><span>${esc(sr.technician_name || 'Unassigned')}</span>
            <strong>Completed</strong><span>${esc(fmtDateTime(sr.completed_at) || '-')}</span>
          </div>
        </section>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E3A8A;font-size:16px;font-weight:900">Service Required</h2>
          <p>${esc(sr.service_required || sr.problem_description || '-')}</p>
        </div>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E3A8A;font-size:16px;font-weight:900">Technician Sessions</h2>
          ${sessionRows}
        </div>
        <div class="report-section">
          <h2 style="margin:0 0 10px;color:#1E3A8A;font-size:16px;font-weight:900">Completion Summary</h2>
          <p>${esc(sr.resolution_description || 'No final resolution summary was added.')}</p>
          <div class="report-summary">
            <span class="report-pill">Total Hours: ${esc(numberValue(sr.time_spent_hours).toFixed(2))}</span>
            <span class="report-pill">Total Mileage: ${esc(totalMileage(sessions).toFixed(2))} mi</span>
            <span class="report-pill">Total Cost: ${esc(money(sr.total_cost))}</span>
            <span class="report-pill">Billing: ${esc((sr.billing_status || 'pending').replace(/_/g, ' '))}</span>
          </div>
        </div>
      </section>
    </main>`
}
