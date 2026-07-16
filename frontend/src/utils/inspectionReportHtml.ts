type GridCellBlock = {
  id: string
  type: 'label' | 'input' | 'radio' | 'checkbox' | 'textarea'
  label?: string
  options?: string[]
}

type GridCellSchema = {
  id: string
  label?: string
  type?: 'text' | 'input' | 'radio' | 'checkbox'
  options?: string[]
  blocks?: GridCellBlock[]
  rowSpan?: number
  colSpan?: number
  width?: number
  height?: number
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  hidden?: boolean
}

type InspectionLike = {
  inspection_number: string
  batch_number?: string | null
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
  compliance_requirement?: string | null
  corrective_actions?: string | null
  form_data?: Record<string, any> | null
  invoice?: { invoice_number?: string | null; total_amount?: number | string | null } | null
}

const CHECK_FIELDS = [
  ['physical_inspection', 'Physical Inspection'],
  ['cleaning', 'Cleaning'],
  ['display', 'Display'],
  ['lubrication', 'Lubrication'],
  ['functional', 'Functional'],
  ['calibration', 'Calibration'],
  ['electrical_safety', 'Electrical Safety'],
  ['battery', 'Battery'],
  ['pm_kit', 'PM Kit'],
]

export const INSPECTION_REPORT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; color: #111827; font-family: Arial, sans-serif; }
  .sheet { width: 8.5in; min-height: 11in; margin: 24px auto; background: #fff; box-shadow: 0 20px 60px rgba(15,23,42,0.16); overflow: hidden; }
  .page-break { page-break-after: always; }
  .hero { display: flex; justify-content: space-between; gap: 24px; padding: 30px 38px; color: #fff; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%); }
  .brand { display: flex; gap: 16px; align-items: center; font-size: 22px; font-weight: 900; }
  .brand img { width: 116px; height: 76px; object-fit: contain; background: #fff; border-radius: 14px; padding: 8px; }
  .hero h1 { margin: 0; text-align: right; font-size: 30px; }
  .hero .sub { margin-top: 8px; color: rgba(255,255,255,0.84); text-align: right; font-weight: 700; }
  .content { padding: 34px 38px 38px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .box { border: 1px solid #E5E7EB; border-radius: 14px; padding: 14px; background: #F8FAFC; }
  .box small { display: block; color: #64748B; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; }
  .box strong { color: #1E1B4B; }
  .section { border: 1px solid #E5E7EB; border-radius: 16px; padding: 18px; margin-top: 16px; page-break-inside: avoid; }
  h2 { margin: 0 0 12px; color: #1E1B4B; font-size: 18px; }
  h3 { margin: 18px 0 8px; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  p { margin: 0; white-space: pre-wrap; line-height: 1.55; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; margin-top: 10px; font-size: 12px; }
  th { text-align: left; background: #F5F3FF; color: #334155; padding: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  td { border-top: 1px solid #EEF2F7; padding: 10px; vertical-align: top; }
  .right { text-align: right; }
  .amount { color: #047857; font-weight: 900; }
  .status { display: inline-block; padding: 5px 9px; border-radius: 999px; background: #EEF2FF; color: #4F46E5; font-weight: 900; text-transform: capitalize; }
  .status.pass, .status.yes, .status.completed { background: #ECFDF5; color: #047857; }
  .status.fail, .status.no { background: #FEF2F2; color: #B91C1C; }
  .status.na, .status.n\\/a { background: #F1F5F9; color: #475569; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .pill { padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #E5E7EB; color: #64748B; font-size: 11px; display: flex; justify-content: space-between; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: 0; box-shadow: none; }
    .hero, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const gridCellBlockValueKey = (cell: GridCellSchema, block: GridCellBlock, optionIndex?: number) =>
  optionIndex === undefined ? `${cell.id}__${block.id}` : `${cell.id}__${block.id}__${optionIndex}`

const displayCustomGridCellValue = (cell: GridCellSchema, value: any) => {
  const label = cell.label?.trim()
  if (cell.type === 'text') return label || '-'
  if (cell.type === 'checkbox') {
    const checkedDisplay = Array.isArray(value)
      ? value.filter(Boolean).join(', ')
      : value ? 'Checked' : 'Unchecked'
    if (label && checkedDisplay) return `${label}: ${checkedDisplay}`
    return checkedDisplay || label || '-'
  }
  const display = value || ''
  if (label && display) return `${label}: ${display}`
  return display || label || '-'
}

const displayCustomGridCellBlocks = (cell: GridCellSchema, values: Record<string, any>) => {
  const displays = (cell.blocks || []).map(block => {
    const label = block.label?.trim()
    if (block.type === 'label') return label
    if (block.type === 'checkbox') {
      const checked = (block.options?.length ? block.options : ['Option'])
        .map((option, optionIndex) => values[gridCellBlockValueKey(cell, block, optionIndex)] ? (option.trim() || `Option ${optionIndex + 1}`) : '')
        .filter(Boolean)
      return label && checked.length ? `${label}: ${checked.join(', ')}` : checked.join(', ')
    }
    if (block.type === 'radio') {
      const value = values[gridCellBlockValueKey(cell, block)]
      return label && value ? `${label}: ${value}` : (value || label)
    }
    const value = values[gridCellBlockValueKey(cell, block)]
    return label && value ? `${label}: ${value}` : (value || label)
  }).filter(Boolean)
  return displays.length ? displays.join('\n') : displayCustomGridCellValue(cell, values[cell.id])
}

const makeDefaultReport = (inspection: InspectionLike) => ({
  identity: {
    asset_number: inspection.asset_tag || inspection.part_number || '',
    description: inspection.equipment_name || inspection.inventory_part_name || inspection.asset_name || '',
    make: inspection.make || '',
    model: inspection.model || '',
    serial_number: inspection.serial_number || '',
  },
  checks: CHECK_FIELDS.reduce((acc, [key]) => ({ ...acc, [key]: 'pass' }), {} as Record<string, string>),
  diagnostics: {
    reported_problem: 'N/A',
    problem_found: 'N/A',
    corrective_action_taken: '',
    summary: '',
  },
  measurements: [
    { name: 'Electrical leakage', set_value: '', read_value: '', unit: 'mA/Ohms', status: 'pass', notes: '' },
    { name: 'Functional test', set_value: '', read_value: '', unit: '', status: 'pass', notes: '' },
  ],
  compliance: {
    certified: 'yes',
    standard: inspection.compliance_requirement || 'Preventive maintenance and safety inspection',
    recommendations: '',
  },
  parts: [{ description: '', part_number: '', price: 0, condition: '' }],
  test_equipment: [
    { description: 'Safety Analyzer', make: '', serial_number: '' },
    { description: 'MultiMeter', make: '', serial_number: '' },
  ],
  billing: { parts: 0, inspection_charges: 0, others: 0 },
  dates: {
    inspected_by: inspection.technician_name || inspection.inspector_name || '',
    inspection_date: new Date().toISOString().slice(0, 10),
  },
})

export const buildInspectionReportSheetHtml = (inspection: InspectionLike, batchNumber?: string): string => {
  const rawInspection = inspection as any
  const data: any = inspection.form_data && Object.keys(inspection.form_data).length ? inspection.form_data : makeDefaultReport(inspection)
  const checks = Object.entries(data.checks || {})
  const measurements = data.measurements || []
  const parts = data.parts || []
  const testEquipment = data.test_equipment || []
  const customGrid = data.custom_grid
  const customGridValues = data.custom_grid_values || {}
  const billingTotal = Number(data.billing?.parts || rawInspection.parts_amount || 0)
    + Number(data.billing?.inspection_charges || rawInspection.inspection_charge || 0)
    + Number(data.billing?.others || rawInspection.other_charges || 0)

  const checkRows = checks.length ? checks.map(([key, value]) => `
    <tr>
      <td>${escapeHtml(key.replace(/_/g, ' '))}</td>
      <td><span class="status ${escapeHtml(String(value))}">${escapeHtml(value)}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="2">No checks recorded.</td></tr>'

  const measurementRows = measurements.length ? measurements.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.set_value || '-')}</td>
      <td>${escapeHtml(item.read_value || '-')}</td>
      <td>${escapeHtml(item.unit || '-')}</td>
      <td><span class="status ${escapeHtml(String(item.status || ''))}">${escapeHtml(item.status || '-')}</span></td>
      <td>${escapeHtml(item.notes || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="6">No measurements recorded.</td></tr>'

  const partRows = parts.filter((part: any) => part.description || part.part_number || Number(part.price || 0)).length
    ? parts.filter((part: any) => part.description || part.part_number || Number(part.price || 0)).map((part: any) => `
      <tr>
        <td>${escapeHtml(part.part_number || '-')}</td>
        <td>${escapeHtml(part.description || '-')}</td>
        <td>${escapeHtml(part.condition || '-')}</td>
        <td class="right amount">${escapeHtml(money(part.price || 0))}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4">No parts recorded.</td></tr>'

  const testEquipmentRows = testEquipment.length ? testEquipment.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.description || '-')}</td>
      <td>${escapeHtml(item.make || '-')}</td>
      <td>${escapeHtml(item.serial_number || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="3">No test equipment recorded.</td></tr>'

  const customGridHtml = customGrid?.cells?.length ? `
    <section class="section">
      <h2>${escapeHtml(customGrid.title || 'Custom Inspection Section')}</h2>
      <table><tbody>
        ${customGrid.cells.map((row: GridCellSchema[]) => `
          <tr>
            ${row.map(cell => {
              if (cell.hidden) return ''
              const value = customGridValues[cell.id]
              const display = cell.blocks?.length
                ? displayCustomGridCellBlocks(cell, customGridValues)
                : displayCustomGridCellValue(cell, value)
              const span = `${cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''}`
              const style = ` style="text-align:${escapeHtml(cell.align || 'center')};vertical-align:${escapeHtml(cell.verticalAlign || 'middle')};width:${Math.max(90, Number(cell.width || 180))}px;height:${Math.max(44, Number(cell.height || 74))}px"`
              return `<td${span}${style}>${escapeHtml(display).replace(/\n/g, '<br>')}</td>`
            }).join('')}
          </tr>
        `).join('')}
      </tbody></table>
    </section>
  ` : ''

  return `
    <main class="sheet">
      <section class="hero">
        <div class="brand">
          <img src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" />
          <div>Mr. BioMed Tech Services<br><span style="font-size:12px;color:rgba(255,255,255,0.82)">Biomedical Equipment Repair &amp; Rental Services</span></div>
        </div>
        <div>
          <h1>Inspection Report</h1>
          <div class="sub">${escapeHtml(inspection.inspection_number)} - ${escapeHtml(inspection.asset_name || inspection.equipment_name || 'Asset')}</div>
          ${batchNumber || inspection.batch_number ? `<div class="sub" style="font-size:12px">Batch: ${escapeHtml(batchNumber || inspection.batch_number)}</div>` : ''}
        </div>
      </section>
      <section class="content">
        <div class="grid">
          <div class="box"><small>Facility</small><strong>${escapeHtml(inspection.facility_name || '-')}</strong></div>
          <div class="box"><small>Asset</small><strong>${escapeHtml(inspection.asset_name || data.identity?.description || '-')}</strong></div>
          <div class="box"><small>Serial #</small><strong>${escapeHtml(inspection.serial_number || data.identity?.serial_number || '-')}</strong></div>
          <div class="box"><small>Result</small><strong>${escapeHtml(inspection.result || '-')}</strong></div>
        </div>
        <div class="grid">
          <div class="box"><small>Asset / Part</small><strong>${escapeHtml(inspection.inventory_part_name || inspection.asset_name || inspection.equipment_name || '-')}</strong></div>
          <div class="box"><small>Tier</small><strong>${escapeHtml(inspection.tier_name || '-')}</strong></div>
          <div class="box"><small>Technician</small><strong>${escapeHtml(inspection.technician_name || inspection.inspector_name || data.dates?.inspected_by || '-')}</strong></div>
          <div class="box"><small>Completed</small><strong>${escapeHtml(formatDate(inspection.completed_at || data.dates?.inspection_date))}</strong></div>
        </div>
        <section class="section">
          <h2>Inspection Checks</h2>
          <table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${checkRows}</tbody></table>
        </section>
        <section class="section">
          <h2>Diagnostics</h2>
          <h3>Reported Problem</h3><p>${escapeHtml(data.diagnostics?.reported_problem || '-')}</p>
          <h3>Problem Found</h3><p>${escapeHtml(data.diagnostics?.problem_found || '-')}</p>
          <h3>Summary</h3><p>${escapeHtml(data.diagnostics?.summary || '-')}</p>
          <h3>Corrective Action</h3><p>${escapeHtml(inspection.corrective_actions || data.diagnostics?.corrective_action_taken || '-')}</p>
        </section>
        ${customGridHtml}
        <section class="section">
          <h2>Measurements</h2>
          <table><thead><tr><th>Name</th><th>Set</th><th>Read</th><th>Unit</th><th>Status</th><th>Notes</th></tr></thead><tbody>${measurementRows}</tbody></table>
        </section>
        <section class="section">
          <h2>Parts Used</h2>
          <table><thead><tr><th>Part #</th><th>Description</th><th>Condition</th><th class="right">Amount</th></tr></thead><tbody>${partRows}</tbody></table>
        </section>
        <section class="section">
          <h2>Test Equipment</h2>
          <table><thead><tr><th>Description</th><th>Make</th><th>Serial #</th></tr></thead><tbody>${testEquipmentRows}</tbody></table>
        </section>
        <section class="section">
          <h2>Compliance &amp; Charges</h2>
          <h3>Certification</h3><p>${escapeHtml(data.compliance?.certified || '-')}</p>
          <h3>Standard</h3><p>${escapeHtml(data.compliance?.standard || '-')}</p>
          <h3>Recommendations</h3><p>${escapeHtml(data.compliance?.recommendations || '-')}</p>
          <div class="summary">
            <span class="pill">Parts: ${escapeHtml(money(data.billing?.parts || rawInspection.parts_amount || 0))}</span>
            <span class="pill">Inspection: ${escapeHtml(money(data.billing?.inspection_charges || rawInspection.inspection_charge || 0))}</span>
            <span class="pill">Other: ${escapeHtml(money(data.billing?.others || rawInspection.other_charges || 0))}</span>
            <span class="pill">Total: ${escapeHtml(money(billingTotal))}</span>
            <span class="pill">Invoice: ${escapeHtml(inspection.invoice?.invoice_number || '-')}</span>
          </div>
        </section>
        <section class="footer">
          <span>Mr. BioMed Tech Services</span>
          <span>Generated from Medrad Admin Panel</span>
        </section>
      </section>
    </main>
  `
}

export const buildInspectionReportDocumentHtml = (inspection: InspectionLike) =>
  `<!doctype html><html><head><title>${escapeHtml(inspection.inspection_number)} Inspection Report</title><style>${INSPECTION_REPORT_CSS}</style></head><body>${buildInspectionReportSheetHtml(inspection)}</body></html>`

export const printInspectionReportSheet = (inspection: InspectionLike) => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(buildInspectionReportDocumentHtml(inspection))
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}
