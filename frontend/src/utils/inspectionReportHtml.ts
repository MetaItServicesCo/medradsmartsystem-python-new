import { fetchFacility, type Facility } from '@/api/facilities'
import { fetchInspectionBatch } from '@/api/inspections'

// Presentation only. The report copies the customer rental-agreement look
// (CustomerDocumentUI palette + gradient divider + rounded cards + status chips)
// and the section layout of the PM's Report PDF (cover, TOC, per-asset Clinical
// Engineering Report, failed sheet, billing). No business logic is derived here.
const COMPANY = {
  name: 'Mr. BioMed Tech Services',
  tagline: 'Biomedical Equipment Repair & Rental Services',
  phone: '(469) 767-8853',
  email: 'omar@mbmts.com',
  address: '555 N. 5th Street Suite 109, Garland, TX 75040',
  website: 'https://medradsmartsystem.com',
  logo: '/mr-biomed-logo.jpeg',
}

export type InspectionReportLike = {
  inspection_number: string
  batch_number?: string | null
  facility_id?: number | null
  facility_name?: string | null
  asset_name?: string | null
  equipment_name?: string | null
  inventory_part_name?: string | null
  asset_tag?: string | null
  part_number?: string | null
  serial_number?: string | null
  make?: string | null
  model?: string | null
  tier_name?: string | null
  technician_name?: string | null
  inspector_name?: string | null
  result?: string | null
  completed_at?: string | null
  scheduled_date?: string | null
  inspection_frequency?: string | null
  compliance_requirement?: string | null
  corrective_actions?: string | null
  id?: number | null
  batch_id?: number | null
  form_data?: Record<string, any> | null
  invoice?: ReportInvoiceLike | null
  parts_amount?: number | string | null
  inspection_charge?: number | string | null
  other_charges?: number | string | null
}

type ReportInvoiceLike = {
  invoice_number?: string | null
  total_amount?: number | string | null
  batch_items?: Array<{ inspection_id: number; total_amount: number | string | null }>
} | null | undefined

export type ReportBatchLike = {
  batch_number: string
  facility_id?: number | null
  facility_name?: string | null
  scheduled_date?: string | null
  completed_at?: string | null
  assets?: InspectionReportLike[]
  batch_invoice?: ReportInvoiceLike
}

const LEFT_CHECKS: Array<[string, string]> = [
  ['physical_inspection', 'Physical Insp.'],
  ['display', 'Display'],
  ['functional', 'Functional'],
  ['electrical_safety', 'Electrical Safety'],
  ['battery', 'Battery'],
  ['pm_kit', 'PM Kit'],
]
const RIGHT_CHECKS: Array<[string, string]> = [
  ['cleaning', 'Cleaning'],
  ['lubrication', 'Lubrication'],
  ['calibration', 'Calibration'],
]

export const INSPECTION_REPORT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #F5F3FF; color: #1E1B4B; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .page { position: relative; width: 8.5in; min-height: 11in; margin: 20px auto; background: #fff; box-shadow: 0 20px 60px rgba(30,58,138,0.14); padding: 34px 40px 28px; display: flex; flex-direction: column; }
  .page-break { page-break-after: always; }
  .rhead { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .rhead img { width: 116px; height: 62px; object-fit: contain; }
  .rhead .co { text-align: right; font-size: 11px; color: #475569; line-height: 1.55; }
  .rhead .co b { color: #1E3A8A; display: block; }
  .divider { height: 4px; border-radius: 999px; margin: 12px 0 16px; background: linear-gradient(90deg, #2563EB 0%, #7C3AED 60%, #EC4899 100%); }
  .rfoot { margin-top: auto; padding-top: 14px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; gap: 16px; font-size: 10px; color: #64748B; line-height: 1.55; }
  .rfoot b { color: #1E3A8A; display: block; }
  .rfoot .r { text-align: right; }
  .title { color: #1E3A8A; font-weight: 900; font-size: 26px; text-align: center; margin: 8px 0 2px; }
  .subtitle { color: #64748B; font-weight: 800; text-align: center; }
  h2.sec { color: #1E1B4B; font-size: 15px; font-weight: 900; margin: 15px 0 8px; }
  h3.sub-h { color: #64748B; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 5px; }
  .muted { color: #64748B; }
  .cover-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 6px; }
  .cover-logo { width: 190px; height: 120px; object-fit: contain; }
  .cover-card { margin-top: 18px; padding: 20px 26px; border: 1px solid #E2E8F0; border-radius: 18px; background: #F8FAFC; min-width: 360px; }
  .cover-card .fac { color: #1E3A8A; font-weight: 900; font-size: 18px; text-decoration: underline; margin-bottom: 8px; }
  .cover-card div { color: #475569; line-height: 1.7; }
  .cover-card b { color: #1E1B4B; }
  .identity { border: 1px solid #E2E8F0; border-radius: 14px; background: #F8FAFC; padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; align-content: start; }
  .idbox { min-width: 0; }
  .idbox small { display: block; color: #64748B; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; font-size: 9px; }
  .idbox strong { color: #1E1B4B; font-size: 13px; }
  .card { border: 1px solid #E2E8F0; border-left: 4px solid #7C3AED; border-radius: 12px; padding: 12px 14px; background: #fff; }
  .card p { margin: 0; line-height: 1.5; color: #334155; }
  .facbox { border: 1px solid #BFDBFE; border-radius: 14px; padding: 12px 16px; background: #EFF6FF; }
  .facbox .fac { color: #1E3A8A; font-weight: 900; text-decoration: underline; margin-bottom: 4px; }
  .facbox div { color: #475569; line-height: 1.55; font-size: 11px; }
  table.doc { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; margin-top: 8px; }
  table.doc th { text-align: left; background: #F8FAFC; color: #334155; padding: 9px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; font-weight: 900; }
  table.doc td { border-top: 1px solid #EEF2F7; padding: 9px 12px; vertical-align: middle; color: #1E1B4B; }
  table.doc td.right, table.doc th.right { text-align: right; }
  table.doc td.center, table.doc th.center { text-align: center; }
  table.doc tr.total td { background: #F8FAFC; font-weight: 900; }
  .amount { color: #047857; font-weight: 900; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 900; font-size: 11px; text-transform: capitalize; background: #F1F5F9; color: #475569; }
  .status.pass, .status.completed { background: #DCFCE7; color: #15803D; }
  .status.fail { background: #FEE2E2; color: #B91C1C; }
  .status.na { background: #F1F5F9; color: #475569; }
  table.grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; margin-top: 8px; }
  table.grid th { background: #F8FAFC; color: #334155; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; font-weight: 900; text-align: center; }
  table.grid td { border-top: 1px solid #EEF2F7; padding: 9px 10px; font-size: 12px; }
  table.grid td.t { font-weight: 700; color: #334155; }
  table.grid td.c { text-align: center; }
  table.grid td.io { color: #475569; }
  table.grid td.io b { color: #1E1B4B; }
  .dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid #94A3B8; vertical-align: middle; }
  .dot.on { border-color: #2563EB; background: #2563EB; box-shadow: inset 0 0 0 2px #fff; }
  .notes td.k { width: 190px; font-weight: 900; color: #64748B; background: #F8FAFC; }
  .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; font-size: 11px; }
  .rtitle { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 4px 0 8px; }
  .rtitle h2 { margin: 0; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
    .rhead, .divider, table.doc th, table.grid th, .status, .dot.on, .facbox, .identity, .card, .cover-card, .pill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const fmtDate = (date: string | null | undefined) => {
  if (!date) return ''
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// A value counts as present only when it is meaningfully filled.
const hasVal = (value: unknown) => {
  const text = String(value ?? '').trim()
  return text.length > 0 && text !== '-'
}

const statusClass = (result?: string | null) => {
  const value = String(result || '').toLowerCase()
  if (value.includes('pass') || value.includes('complete')) return 'pass'
  if (value.includes('fail')) return 'fail'
  return 'na'
}

const reportData = (inspection: InspectionReportLike): any => {
  const data = inspection.form_data && Object.keys(inspection.form_data).length ? inspection.form_data : {}
  return data
}

const assetLabel = (inspection: InspectionReportLike) =>
  inspection.asset_name || inspection.equipment_name || inspection.inventory_part_name || reportData(inspection).identity?.description || '-'

const assetTag = (inspection: InspectionReportLike) =>
  inspection.asset_tag || inspection.part_number || reportData(inspection).identity?.asset_number || '-'

// The billable amount for one asset. A batch invoice carries a per-asset line item
// (batch_items); a single invoice carries the total. Fall back to the report's stored
// billing figures, then to any raw charge fields.
const amountFromInvoice = (invoice: ReportInvoiceLike, inspectionId?: number | null): number => {
  if (!invoice) return 0
  if (invoice.batch_items?.length && inspectionId != null) {
    const item = invoice.batch_items.find(entry => entry.inspection_id === inspectionId)
    if (item) return Number(item.total_amount || 0)
    return 0
  }
  return Number(invoice.total_amount || 0)
}

const assetAmount = (inspection: InspectionReportLike, contextInvoice?: ReportInvoiceLike): number => {
  const id = inspection.id
  const fromContext = amountFromInvoice(contextInvoice, id)
  if (fromContext > 0) return fromContext
  const fromOwn = amountFromInvoice(inspection.invoice, id)
  if (fromOwn > 0) return fromOwn
  const data = reportData(inspection)
  const billed = Number(data.billing?.parts || 0) + Number(data.billing?.inspection_charges || 0) + Number(data.billing?.others || 0)
  if (billed > 0) return billed
  return Number(inspection.parts_amount || 0) + Number(inspection.inspection_charge || 0) + Number(inspection.other_charges || 0)
}

const facilityLines = (facility: Facility | null | undefined, inspection?: InspectionReportLike) => {
  const name = facility?.name || inspection?.facility_name || ''
  const cityState = [facility?.city, facility?.state].filter(hasVal).join(', ')
  const line2 = [cityState, facility?.zip_code].filter(hasVal).join(' ')
  return { name, address: facility?.address || '', line2, phone: facility?.phone || '', email: facility?.email || '' }
}

const dot = (on: boolean) => `<span class="dot${on ? ' on' : ''}"></span>`

const checkTriplet = (value: string) => {
  const v = String(value || '').toLowerCase()
  return `<td class="c">${dot(v === 'pass')}</td><td class="c">${dot(v === 'fail')}</td><td class="c">${dot(v === 'na' || v === 'n/a')}</td>`
}

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

const coverDateRange = (batch: ReportBatchLike | null, first?: InspectionReportLike) => {
  const data = first ? reportData(first) : {}
  const from = fmtDate(data.dates?.inspection_date || first?.completed_at || batch?.scheduled_date || batch?.completed_at)
  const to = fmtDate(data.dates?.next_inspection_due_date || data.dates?.inspection_due_date)
  if (from && to) return `From ${from} to ${to}`
  if (from) return `As of ${from}`
  return ''
}

const coverPageHtml = (facility: Facility | null | undefined, first: InspectionReportLike | undefined, subtitle: string, dateRange: string) => {
  const fac = facilityLines(facility, first)
  const rows = [
    fac.address && `Address: ${esc(fac.address)}`,
    fac.line2 && `${esc(fac.line2)}`,
    fac.phone && `<b>Phone#</b> ${esc(fac.phone)}`,
    fac.email && `<b>Email</b> ${esc(fac.email)}`,
  ].filter(Boolean).join('<br>')
  return page(`
    <div class="cover-wrap">
      <img class="cover-logo" src="${COMPANY.logo}" alt="${esc(COMPANY.name)}" />
      ${fac.name ? `<div class="title">${esc(fac.name)}</div>` : ''}
      <div class="cover-card">
        ${fac.name ? `<div class="fac">${esc(fac.name)}</div>` : ''}
        <div>${rows}</div>
      </div>
      <div class="title" style="margin-top:26px">${esc(subtitle)}</div>
      ${dateRange ? `<div class="subtitle" style="font-size:16px">${esc(dateRange)}</div>` : ''}
    </div>
  `, { break: true })
}

const listTableHtml = (assets: InspectionReportLike[], heading: string, facilityName: string, emptyText: string) => {
  const rows = assets.length
    ? assets.map((asset, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${esc(assetTag(asset))}</td>
        <td>${esc(assetLabel(asset))}</td>
        <td class="center"><span class="status ${statusClass(asset.result)}">${esc(asset.result || '-')}</span></td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="center muted">${esc(emptyText)}</td></tr>`
  return page(`
    <h2 class="sec" style="text-align:center;font-size:22px;color:#1E3A8A">${esc(heading)}</h2>
    ${facilityName ? `<div class="subtitle" style="margin-bottom:12px">${esc(facilityName)}</div>` : ''}
    <table class="doc">
      <thead><tr><th class="center">S.No.</th><th>Asset #</th><th>Equipment description</th><th class="center">Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `, { break: true })
}

const identityHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const id = data.identity || {}
  const fields: Array<[string, unknown]> = [
    ['Asset #', assetTag(inspection)],
    ['Description', assetLabel(inspection)],
    ['Make', inspection.make || id.make],
    ['Location', id.location],
    ['Model', inspection.model || id.model],
    ['Risk Ranking', id.risk_ranking],
    ['SN#', inspection.serial_number || id.serial_number],
    ['PM Schedule', id.pm_schedule || inspection.inspection_frequency],
  ]
  const boxes = fields
    .filter(([, value]) => hasVal(value))
    .map(([label, value]) => `<div class="idbox"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`)
    .join('')
  return `<div class="identity">${boxes}</div>`
}

const gridHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const checks = data.checks || {}
  const measurements: any[] = data.measurements || []
  const elec = measurements.find(m => /elec|leak|safety/i.test(String(m?.name || '')))
  const read = elec ? [elec.read_value, elec.unit].filter(hasVal).join(' ') : ''
  const set = elec ? elec.set_value : ''
  const battery = data.battery || {}
  const pmKit = data.pm_kit || {}

  const rightRow = (index: number) => {
    if (index < RIGHT_CHECKS.length) {
      const [key, label] = RIGHT_CHECKS[index]
      return `<td class="t">${esc(label)}</td>${checkTriplet(checks[key])}`
    }
    if (index === 3) return `<td class="io">Set: <b>${esc(set || '')}</b></td><td class="io" colspan="3">Read: <b>${esc(read || '')}</b></td>`
    const source = index === 4 ? battery : pmKit
    return `<td class="io" colspan="2">Replaced on <b>${esc(source.replaced_on || '')}</b></td><td class="io" colspan="2">Due <b>${esc(source.due || '')}</b></td>`
  }

  const rows = LEFT_CHECKS.map(([key, label], index) => `
    <tr>
      <td class="t">${esc(label)}</td>${checkTriplet(checks[key])}
      ${rightRow(index)}
    </tr>`).join('')

  return `
    <table class="grid">
      <thead><tr>
        <th style="text-align:left">Test</th><th>Pass</th><th>Fail</th><th>N/A</th>
        <th style="text-align:left">Test</th><th>Pass</th><th>Fail</th><th>N/A</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

const biomedNotesHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const d = data.diagnostics || {}
  const rows: Array<[string, unknown]> = [
    ['Reported Problem', d.reported_problem],
    ['Problem Found', d.problem_found],
    ['Corrective action taken', inspection.corrective_actions || d.corrective_action_taken],
    ['Summary', d.summary],
  ]
  const visible = rows.filter(([, value]) => hasVal(value))
  if (!visible.length) return ''
  return `
    <h2 class="sec">Biomed Notes</h2>
    <table class="doc notes"><tbody>
      ${visible.map(([label, value]) => `<tr><td class="k">${esc(label)}</td><td>${esc(value)}</td></tr>`).join('')}
    </tbody></table>`
}

const partsHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const parts: any[] = (data.parts || []).filter((p: any) => hasVal(p.description) || hasVal(p.part_number) || Number(p.price || 0) > 0)
  if (!parts.length) return ''
  return `
    <h2 class="sec">Part Description</h2>
    <table class="doc">
      <thead><tr><th>Part Description</th><th>Part#</th><th class="right">Price $</th><th>Condition</th></tr></thead>
      <tbody>${parts.map((p: any) => `<tr><td>${esc(p.description || '-')}</td><td>${esc(p.part_number || '-')}</td><td class="right amount">${esc(money(p.price || 0))}</td><td>${esc(p.condition || '-')}</td></tr>`).join('')}</tbody>
    </table>`
}

const testEquipmentHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const items: any[] = (data.test_equipment || []).filter((t: any) => hasVal(t.description) || hasVal(t.make) || hasVal(t.serial_number))
  if (!items.length) return ''
  return `
    <h2 class="sec">Test Equipment</h2>
    <table class="doc">
      <thead><tr><th>Make</th><th>SN#</th><th>Description</th></tr></thead>
      <tbody>${items.map((t: any) => `<tr><td>${esc(t.make || '-')}</td><td>${esc(t.serial_number || '-')}</td><td>${esc(t.description || '-')}</td></tr>`).join('')}</tbody>
    </table>`
}

const inspectedByHtml = (inspection: InspectionReportLike) => {
  const data = reportData(inspection)
  const dates = data.dates || {}
  const by = dates.inspected_by || inspection.technician_name || inspection.inspector_name
  const on = fmtDate(dates.inspection_date || inspection.completed_at)
  const due = fmtDate(dates.next_inspection_due_date || dates.inspection_due_date)
  if (!hasVal(by) && !hasVal(on) && !hasVal(due)) return ''
  return `
    <table class="doc" style="margin-top:16px">
      <thead><tr><th>Inspected By</th><th>Inspection Date</th><th>Inspection Due Date</th></tr></thead>
      <tbody><tr><td>${esc(by || '-')}</td><td>${esc(on || '-')}</td><td>${esc(due || '-')}</td></tr></tbody>
    </table>`
}

const cePageHtml = (inspection: InspectionReportLike, facility: Facility | null | undefined, opts: { break?: boolean } = {}) => {
  const fac = facilityLines(facility, inspection)
  const facInfo = [
    fac.address && `${esc(fac.address)}`,
    fac.line2 && `${esc(fac.line2)}`,
    fac.phone && `<b>Phone#</b> ${esc(fac.phone)}`,
    fac.email && `<b>Email</b> ${esc(fac.email)}`,
  ].filter(Boolean).join('<br>')
  return page(`
    <div class="rtitle">
      <h2 class="sec" style="font-size:20px;color:#1E3A8A">Clinical Engineering Report</h2>
      <span class="status ${statusClass(inspection.result)}">${esc(inspection.result || 'Pending')}</span>
    </div>
    <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start">
      ${identityHtml(inspection)}
      ${fac.name ? `<div class="facbox"><div class="fac">${esc(fac.name)}</div><div>${facInfo}</div></div>` : ''}
    </div>
    ${gridHtml(inspection)}
    <h2 class="sec">Functional Test</h2>
    ${biomedNotesHtml(inspection)}
    ${partsHtml(inspection)}
    ${testEquipmentHtml(inspection)}
    ${inspectedByHtml(inspection)}
  `, opts)
}

const billingPageHtml = (assets: InspectionReportLike[], facilityName: string, invoice?: ReportInvoiceLike) => {
  const lineTotal = assets.reduce((sum, asset) => sum + assetAmount(asset, invoice), 0)
  // Prefer the invoice's own total (it already includes tax/discount); else sum the lines.
  const invoiceTotal = Number(invoice?.total_amount || 0)
  const total = invoiceTotal > 0 ? invoiceTotal : lineTotal
  const rows = assets.map((asset, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${esc(assetTag(asset))}</td>
      <td>${esc(assetLabel(asset))}</td>
      <td class="right amount">${esc(money(assetAmount(asset, invoice)))}</td>
    </tr>`).join('')
  return page(`
    <h2 class="sec" style="text-align:center;font-size:22px;color:#1E3A8A">Billing Page</h2>
    ${facilityName ? `<div class="subtitle" style="margin-bottom:12px">${esc(facilityName)}</div>` : ''}
    <table class="doc">
      <thead><tr><th class="center">S.No.</th><th>Asset #</th><th>Equipment description</th><th class="right">Amount $</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total"><td></td><td></td><td class="right">Total</td><td class="right amount">${esc(money(total))}</td></tr>
      </tbody>
    </table>
  `)
}

export const buildInspectionBatchReportHtml = (batch: ReportBatchLike, facility: Facility | null | undefined): string => {
  const assets = batch.assets || []
  const facilityName = facility?.name || batch.facility_name || ''
  const failed = assets.filter(asset => statusClass(asset.result) === 'fail')
  return [
    coverPageHtml(facility, assets[0], "PM's Report", coverDateRange(batch, assets[0])),
    listTableHtml(assets, 'Table of Contents', facilityName, 'No assets in this batch.'),
    ...assets.map(asset => cePageHtml(asset, facility, { break: true })),
    listTableHtml(failed, 'Inspection Failed Equipment Sheet', facilityName, 'No failed equipment in this batch.'),
    billingPageHtml(assets, facilityName, batch.batch_invoice),
  ].join('')
}

// A single asset: just its Clinical Engineering Report page followed by its own billing.
// contextInvoice lets callers supply the batch invoice for a batch-invoiced asset, whose
// per-asset charge lives in that invoice's line items rather than a per-inspection invoice.
export const buildInspectionSingleReportHtml = (
  inspection: InspectionReportLike,
  facility: Facility | null | undefined,
  contextInvoice?: ReportInvoiceLike,
): string => {
  const facilityName = facility?.name || inspection.facility_name || ''
  return [
    cePageHtml(inspection, facility, { break: true }),
    billingPageHtml([inspection], facilityName, contextInvoice ?? inspection.invoice),
  ].join('')
}

// Resolve the invoice that carries this asset's charge: its own, else its batch's.
export const resolveReportInvoice = async (inspection: InspectionReportLike): Promise<ReportInvoiceLike> => {
  if (inspection.invoice) return inspection.invoice
  if (inspection.batch_id) {
    try { return (await fetchInspectionBatch(inspection.batch_id)).batch_invoice as ReportInvoiceLike } catch { /* ignore */ }
  }
  return inspection.invoice
}

export const buildInspectionReportDocumentHtml = (bodyHtml: string, title = 'Inspection Report'): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${INSPECTION_REPORT_CSS}</style></head><body>${bodyHtml}</body></html>`

const printDocument = (title: string, bodyHtml: string) => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(buildInspectionReportDocumentHtml(bodyHtml, title))
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

const facilityFor = async (facilityId?: number | null): Promise<Facility | null> => {
  if (!facilityId) return null
  try { return await fetchFacility(facilityId) } catch { return null }
}

// Backwards-compatible single-inspection print (used by the Reports page).
export const printInspectionReportSheet = async (inspection: InspectionReportLike) => {
  const [facility, invoice] = await Promise.all([facilityFor(inspection.facility_id), resolveReportInvoice(inspection)])
  printDocument(`${inspection.inspection_number} Inspection Report`, buildInspectionSingleReportHtml(inspection, facility, invoice))
}

// Reports module: a completed inspection belongs to a batch, so its "report" is the whole
// batch document; a standalone/instant inspection prints just its own single report.
export const printInspectionRecord = async (inspection: InspectionReportLike) => {
  if (inspection.batch_id) {
    try {
      const batch = await fetchInspectionBatch(inspection.batch_id)
      return await printInspectionBatchReport(batch)
    } catch { /* fall back to the single report below */ }
  }
  return printInspectionReportSheet(inspection)
}

export const printInspectionBatchReport = async (batch: ReportBatchLike) => {
  const facility = await facilityFor(batch.facility_id)
  printDocument(`${batch.batch_number} Batch Inspection Report`, buildInspectionBatchReportHtml(batch, facility))
}
