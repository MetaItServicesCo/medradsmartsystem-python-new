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
  form_schema?: Record<string, any> | null
  form_template_schema?: Record<string, any> | null
  attached_form_schema?: Record<string, any> | null
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

const PFN_RE = /^(pass|fail|n\/?a)$/i
const isPassFailNa = (options: any): boolean =>
  Array.isArray(options) && options.length > 0 && options.every((o: any) => PFN_RE.test(String(o).trim()))

// Render a custom-grid inspection form (native app grid builder + migrated
// legacy forms) from its schema + stored answers. Pass/Fail/N/A radios reuse the
// standard check-grid look; everything else renders as a labelled value table.
// Returns '' when the inspection has no custom grid, so callers fall back to the
// fixed default-report template.
const customGridHtml = (inspection: InspectionReportLike): string => {
  // The single-report endpoint sends `form_schema`; the batch endpoint sends the
  // same schema as `attached_form_schema` / `form_template_schema`. Accept any.
  const schema = inspection.form_schema || inspection.attached_form_schema || inspection.form_template_schema
  const grid = schema?.custom_grid
  if (!grid || !Array.isArray(grid.cells)) return ''
  const values = reportData(inspection).custom_grid_values || {}
  if (!Object.keys(values).length) return ''

  const checkItems: Array<{ label: string; value: any }> = []
  const fieldItems: Array<{ label: string; value: any }> = []

  for (const cell of grid.cells.flat().filter(Boolean)) {
    if (cell.hidden || !cell.id) continue
    const blocks = Array.isArray(cell.blocks) && cell.blocks.length ? cell.blocks : null
    if (blocks) {
      blocks.forEach((block: any, blockIndex: number) => {
        if (block?.type === 'label') return
        const key = `${cell.id}__${block?.id || `block_${blockIndex + 1}`}`
        const label = String(block?.label || cell.label || '').trim()
        if (block?.type === 'radio') {
          if (isPassFailNa(block.options)) checkItems.push({ label, value: values[key] })
          else if (hasVal(values[key])) fieldItems.push({ label, value: values[key] })
        } else if (block?.type === 'checkbox') {
          const chosen = (block.options || [])
            .map((opt: any, i: number) => (values[`${key}__${i}`] ? String(opt) : ''))
            .filter(Boolean).join(', ')
          if (hasVal(chosen)) fieldItems.push({ label, value: chosen })
        } else if (hasVal(values[key])) {
          fieldItems.push({ label, value: values[key] })
        }
      })
    } else {
      const label = String(cell.label || '').trim()
      const value = values[cell.id]
      if (cell.type === 'radio') {
        if (isPassFailNa(cell.options)) checkItems.push({ label, value })
        else if (hasVal(value)) fieldItems.push({ label, value })
      } else if (cell.type !== 'text' && hasVal(value)) {
        fieldItems.push({ label, value })
      }
    }
  }

  if (!checkItems.length && !fieldItems.length) return ''

  let checkRows = ''
  for (let i = 0; i < checkItems.length; i += 2) {
    const l = checkItems[i]
    const r = checkItems[i + 1]
    checkRows += `<tr>
      <td class="t">${esc(l.label)}</td>${checkTriplet(l.value)}
      ${r ? `<td class="t">${esc(r.label)}</td>${checkTriplet(r.value)}` : '<td></td><td></td><td></td><td></td>'}
    </tr>`
  }
  const checkTable = checkItems.length ? `
    <table class="grid">
      <thead><tr>
        <th style="text-align:left">Test</th><th>Pass</th><th>Fail</th><th>N/A</th>
        <th style="text-align:left">Test</th><th>Pass</th><th>Fail</th><th>N/A</th>
      </tr></thead>
      <tbody>${checkRows}</tbody>
    </table>` : ''
  const fieldTable = fieldItems.length ? `
    <table class="doc notes" style="margin-top:8px"><tbody>
      ${fieldItems.map(f => `<tr><td class="k">${esc(f.label || '-')}</td><td>${esc(f.value)}</td></tr>`).join('')}
    </tbody></table>` : ''
  return checkTable + fieldTable
}

const gridHtml = (inspection: InspectionReportLike) => {
  const custom = customGridHtml(inspection)
  if (custom) return custom
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

// ─────────────────────────────────────────────
// Blank form sheets
//
// Printing a *form* is not printing a report. A report prints what was
// answered and leaves out what was not; a blank form is the opposite -- every
// field has to appear precisely because none of them are filled in, so it can
// be carried to the equipment and written on.
//
// The fixed top and bottom sections are the same ones a report prints, so a
// sheet filled in by hand and one produced from the app are recognisably the
// same document.
// ─────────────────────────────────────────────

export type InspectionFormLike = {
  id?: number | null
  name: string
  description?: string | null
  modality_name?: string | null
  schema?: Record<string, any> | null
}

// Printable width inside a .page: 8.5in less the 40px side padding.
const PRINT_WIDTH = 736

// Somewhere to write. Every control the screen shows as an input becomes a
// ruled line or box of roughly the size it occupies on screen.
const writeLine = (height = 16) =>
  `<div style="border-bottom:1px solid #94A3B8;height:${height}px"></div>`

const writeBox = (height = 24) =>
  `<div style="border:1px solid #CBD5E1;border-radius:4px;background:#fff;min-height:${height}px"></div>`

const optionMark = (shape: string) =>
  `<span style="display:inline-block;width:11px;height:11px;border:1.5px solid #6B7280;border-radius:${
    shape === 'checkbox' ? '2px' : '50%'
  };vertical-align:middle;flex:none"></span>`

const optionsHtml = (options: string[], shape: string, vertical = false, align = 'left') => {
  const items = (options.length ? options : ['Option'])
    .map(option =>
      `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#334155">${optionMark(shape)}${esc(option)}</span>`)
    .join('')
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  return `<div style="display:flex;flex-wrap:wrap;gap:${vertical ? '3px' : '4px 10px'};flex-direction:${
    vertical ? 'column' : 'row'
  };justify-content:${justify}">${items}</div>`
}

const fieldLabel = (label: unknown, align = 'left') => {
  const text = String(label ?? '').trim()
  return text
    ? `<div style="font-weight:800;color:#334155;font-size:11px;text-align:${align};margin-bottom:3px">${esc(text)}</div>`
    : ''
}

// The identity panel a report fills in from the asset, left blank to be
// written on. Same eight fields in the same order, so the two line up.
const blankIdentityHtml = () => {
  const labels = ['Asset #', 'Description', 'Make', 'Location', 'Model', 'Risk Ranking', 'SN#', 'PM Schedule']
  return `<div class="identity">${labels
    .map(label => `<div class="idbox"><small>${esc(label)}</small>${writeLine(15)}</div>`)
    .join('')}</div>`
}

const blankFacilityHtml = () => `
  <div class="facbox">
    <div class="fac">Facility</div>
    <div style="display:grid;gap:7px;margin-top:6px">
      ${['Facility', 'Department', 'Technician', 'Date'].map(label =>
        `<div><small style="display:block;color:#64748B;font-weight:900;text-transform:uppercase;letter-spacing:.05em;font-size:9px">${esc(label)}</small>${writeLine(14)}</div>`).join('')}
    </div>
  </div>`

// ── the middle section: whatever this form actually defines ──────────────────

const blankGridCellHtml = (cell: any): string => {
  const align = cell.align || 'center'
  const blocks = Array.isArray(cell.blocks) && cell.blocks.length ? cell.blocks : null
  const title = String(cell.label || '').trim()
  const parts: string[] = []

  if (blocks) {
    // The cell title is dropped when a block already carries it, which is the
    // rule the on-screen preview follows.
    const repeated = blocks.some((block: any) =>
      String(block?.label || '').trim().toLowerCase() === title.toLowerCase())
    if (title && !repeated) parts.push(fieldLabel(title, align))
    for (const block of blocks) {
      if (!block) continue
      if (block.type === 'label') {
        parts.push(fieldLabel(block.label, align))
        continue
      }
      parts.push(fieldLabel(block.label, align))
      if (block.type === 'radio' || block.type === 'checkbox') {
        parts.push(optionsHtml(block.options || [], block.type, block.optionLayout === 'vertical'))
      } else if (block.type === 'textarea') {
        parts.push(writeBox(Number(block.height) || 44))
      } else {
        parts.push(writeBox(Number(block.height) || 22))
      }
    }
    return parts.join('')
  }

  if (title) parts.push(fieldLabel(title, align))
  if (cell.type === 'radio' || cell.type === 'checkbox') {
    parts.push(optionsHtml(cell.options || [], cell.type))
  } else if (cell.type === 'input') {
    parts.push(writeBox(22))
  }
  // 'text' cells are printed labels and nothing more.
  return parts.join('')
}

const blankCustomGridHtml = (grid: any): string => {
  if (!grid || !Array.isArray(grid.cells) || !grid.cells.length) return ''
  const rows = grid.cells
    .map((row: any[]) => {
      const cells = (row || [])
        .filter((cell: any) => cell && !cell.hidden)
        .map((cell: any) => {
          const span = [
            cell.colSpan && cell.colSpan > 1 ? ` colspan="${Number(cell.colSpan)}"` : '',
            cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${Number(cell.rowSpan)}"` : '',
          ].join('')
          const valign = cell.verticalAlign === 'top' ? 'top' : cell.verticalAlign === 'bottom' ? 'bottom' : 'middle'
          return `<td${span} style="vertical-align:${valign};text-align:${cell.align || 'center'};padding:7px 8px">${
            blankGridCellHtml(cell)}</td>`
        })
        .join('')
      return cells ? `<tr>${cells}</tr>` : ''
    })
    .join('')
  return rows ? `<table class="grid"><tbody>${rows}</tbody></table>` : ''
}

const blankCanvasTableHtml = (element: any): string => {
  const rows: any[][] = Array.isArray(element.cells) ? element.cells : []
  if (!rows.length) return ''
  // Column widths and row heights are relative weights, so they become
  // percentages here. Printing them as raw numbers would have made a column of
  // weight 2 exactly two pixels wide.
  const asPercents = (weights: any, count: number): number[] => {
    const list: number[] = Array.isArray(weights) && weights.length === count
      ? weights.map((w: any) => (Number(w) > 0 ? Number(w) : 0))
      : Array.from({ length: count }, () => 1)
    const total = list.reduce((sum, w) => sum + w, 0) || count
    return list.map(w => (w / total) * 100)
  }
  const colCount = rows[0]?.length || 1
  const widths = asPercents(element.colWidths, colCount)
  const heights = asPercents(element.rowHeights, rows.length)
  const tableHeight = Math.max(0, Number(element.height) || 0)
  const body = rows
    .map((row, rowIndex) => {
      const header = element.headerRow && rowIndex === 0
      // A proportional row height, in the same pixels the element occupies, so
      // a tall signature row stays tall on paper.
      const rowHeight = tableHeight
        ? ` height="${Math.round((heights[rowIndex] / 100) * tableHeight)}"` : ''
      const cells = (row || [])
        .map((cell: any, colIndex: number) => {
          // A merged-away cell is not printed: the cell that owns the merge
          // carries colspan/rowspan over its place, the way the builder shows it.
          if (cell?.hidden) return ''
          const rowSpan = Math.max(1, Number(cell?.rowSpan) || 1)
          const colSpan = Math.max(1, Number(cell?.colSpan) || 1)
          const spans = [
            colSpan > 1 ? ` colspan="${colSpan}"` : '',
            rowSpan > 1 ? ` rowspan="${rowSpan}"` : '',
          ].join('')
          // A merged cell claims the width of every column it covers.
          const spanned = widths
            .slice(colIndex, colIndex + colSpan)
            .reduce((sum, w) => sum + w, 0)
          const width = spanned > 0 ? ` width="${spanned.toFixed(2)}%"` : ''
          const background = header || cell?.bgColor === 'grey' ? '#F1F5F9' : '#fff'
          const weight = header || cell?.fontWeight === 'bold' ? 800 : 500
          let inner = ''
          if (!cell) inner = ''
          else if (cell.type === 'label' || cell.type === 'heading') inner = esc(cell.label || '')
          else if (cell.type === 'radio' || cell.type === 'checkbox') {
            // No options means one bare control, centred the way the cell was
            // aligned -- a Pass column on a printed sheet is a box to tick and
            // nothing else, because the heading above says what it means.
            inner = (cell.options || []).length
              ? fieldLabel(cell.label, cell.align)
                + optionsHtml(cell.options, cell.type, cell.optionLayout === 'vertical', cell.align)
              : `<div style="display:flex;justify-content:${
                  cell.align === 'center' ? 'center' : cell.align === 'right' ? 'flex-end' : 'flex-start'
                }">${optionMark(cell.type)}</div>`
          } else if (cell.type === 'signature') {
            inner = `<div style="border:1px dashed #9CA3AF;border-radius:4px;height:26px"></div>`
          } else {
            inner = fieldLabel(cell.label, cell.align) + writeBox(cell.type === 'textarea' ? 34 : 20)
          }
          return `<td${width}${spans} style="border:1px solid #CBD5E1;padding:5px 6px;background:${background};font-size:11px;font-weight:${weight};text-align:${
            cell?.align || 'left'};vertical-align:middle">${inner}</td>`
        })
        .join('')
      return `<tr${rowHeight}>${cells}</tr>`
    })
    .join('')
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody>${body}</tbody></table>`
}

const blankCanvasElementHtml = (element: any): string => {
  const align = element.align || 'left'
  const description = element.description
    ? `<div style="font-size:10px;color:#6B7280;font-style:italic;margin-bottom:2px">${esc(element.description)}</div>`
    : ''

  switch (element.type) {
    case 'heading':
    case 'label':
      return `<div style="font-size:${Number(element.fontSize) || (element.type === 'heading' ? 16 : 12)}px;font-weight:${
        element.fontWeight === 'normal' ? 500 : 800};color:${
        element.type === 'heading' ? '#1E1B4B' : '#374151'};text-align:${align};line-height:1.35">${
        esc(element.label || '')}</div>${description}`
    case 'input':
    case 'number':
    case 'date':
      return fieldLabel(element.label, align) + description + writeBox(22)
    case 'textarea':
      return fieldLabel(element.label, align) + description +
        writeBox(Math.max(30, Number(element.height) - 26 || 40))
    case 'radio':
    case 'checkbox':
      return fieldLabel(element.label, align) + description +
        optionsHtml(element.options || [], element.type, element.optionLayout === 'vertical')
    case 'signature':
      return fieldLabel(element.label, align) + description +
        `<div style="border:1px dashed #9CA3AF;border-radius:6px;background:#FAFAFA;height:${
          Math.max(28, Number(element.height) - 24 || 34)}px"></div>`
    case 'table':
      return blankCanvasTableHtml(element)
    default:
      return ''
  }
}

// The canvas builder places elements at absolute pixel positions on a canvas
// wider than a sheet of paper, so the whole thing is scaled down as one piece.
// Scaling the layout keeps it looking like what was designed; reflowing it into
// a column would not.
const blankCanvasHtml = (canvas: any): string => {
  const elements: any[] = Array.isArray(canvas?.elements) ? canvas.elements : []
  if (!elements.length) return ''
  const width = Number(canvas.canvas_width) || 1080
  const contentBottom = elements.reduce(
    (lowest, element) => Math.max(lowest, Number(element.y || 0) + Number(element.height || 0)), 0)
  const height = Math.max(Number(canvas.canvas_height) || 0, contentBottom + 16)
  const scale = Math.min(1, PRINT_WIDTH / width)

  const inner = elements
    .slice()
    .sort((a, b) => (Number(a.zIndex) || 1) - (Number(b.zIndex) || 1))
    .map(element => {
      const grey = element.bgColor === 'grey'
      return `<div style="position:absolute;left:${Number(element.x) || 0}px;top:${
        Number(element.y) || 0}px;width:${Number(element.width) || 100}px;min-height:${
        Number(element.height) || 24}px;box-sizing:border-box;padding:${
        element.type === 'table' ? '0' : '4px'};background:${grey ? '#E5E7EB' : 'transparent'};border-radius:${
        grey ? '6px' : '0'}">${blankCanvasElementHtml(element)}</div>`
    })
    .join('')

  // The scaled block still occupies its unscaled height in the flow, so the
  // leftover is pulled back to stop a page of white space appearing under it.
  const collapse = Math.round(height * (1 - scale))
  return `<div style="width:100%;overflow:hidden">
    <div style="position:relative;width:${width}px;height:${height}px;transform:scale(${
      scale.toFixed(4)});transform-origin:top left;margin-bottom:-${collapse}px">${inner}</div>
  </div>`
}

const blankMiddleHtml = (form: InspectionFormLike): string => {
  const schema: any = form.schema || {}
  const canvas = schema.canvas_form
  if (canvas && Array.isArray(canvas.elements) && canvas.elements.length) {
    const heading = String(schema.title || form.name || '').trim()
    return `<h2 class="sec">${esc(heading || 'Custom Form')}</h2>${blankCanvasHtml(canvas)}`
  }
  const gridSection = blankCustomGridHtml(schema.custom_grid)
  if (gridSection) {
    const heading = String(schema.custom_grid?.title || schema.title || form.name || '').trim()
    return `<h2 class="sec">${esc(heading || 'Custom Form')}</h2>${gridSection}`
  }
  if (schema.formio_form?.components?.length) {
    return `<h2 class="sec">Custom Form</h2>
      <p class="muted">This form is still a Form.io form and has no printable layout. Rebuild it in the form builder to print it.</p>`
  }
  return ''
}

const blankNotesHtml = () => `
  <h2 class="sec">Biomed Notes</h2>
  <table class="doc notes"><tbody>
    ${['Reported Problem', 'Problem Found', 'Corrective action taken', 'Summary']
      .map(label => `<tr><td class="k">${esc(label)}</td><td>${writeLine(20)}</td></tr>`)
      .join('')}
  </tbody></table>`

const blankSignOffHtml = () => `
  <table class="doc" style="margin-top:10px"><tbody>
    <tr>
      <td class="k" style="width:190px;font-weight:900;color:#64748B;background:#F8FAFC">Inspected By</td>
      <td>${writeLine(20)}</td>
      <td class="k" style="width:120px;font-weight:900;color:#64748B;background:#F8FAFC">Date</td>
      <td style="width:150px">${writeLine(20)}</td>
    </tr>
  </tbody></table>`

/** A blank, fillable sheet of one inspection form. */
export const buildInspectionFormHtml = (form: InspectionFormLike): string => {
  const description = String(form.description || '').trim()
  return page(`
    <div class="rtitle">
      <h2 class="sec" style="font-size:20px;color:#1E3A8A">${esc(form.name || 'Inspection Form')}</h2>
      ${form.modality_name ? `<span class="pill">${esc(form.modality_name)}</span>` : ''}
    </div>
    ${description ? `<div class="muted" style="margin:-2px 0 8px">${esc(description)}</div>` : ''}
    <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start">
      ${blankIdentityHtml()}
      ${blankFacilityHtml()}
    </div>
    <h2 class="sec">Inspection Report</h2>
    ${gridHtml({ inspection_number: '', form_data: {} })}
    ${blankMiddleHtml(form)}
    ${blankNotesHtml()}
    ${blankSignOffHtml()}
  `)
}

/** Print a blank copy of one inspection form. */
export const printInspectionFormSheet = (form: InspectionFormLike) => {
  printDocument(`${form.name || 'Inspection'} Form`, buildInspectionFormHtml(form))
}
