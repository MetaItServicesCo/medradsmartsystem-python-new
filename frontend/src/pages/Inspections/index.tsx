import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { NumericField } from '../../components/NumericField'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  Autocomplete,
  Avatar, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, FormControlLabel, IconButton, InputLabel, Menu, MenuItem, Radio, RadioGroup,
  Select, Skeleton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import BoltIcon from '@mui/icons-material/Bolt'
import BuildIcon from '@mui/icons-material/Build'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteIcon from '@mui/icons-material/Delete'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PersonIcon from '@mui/icons-material/Person'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RemoveIcon from '@mui/icons-material/Remove'
import SaveIcon from '@mui/icons-material/Save'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PrintIcon from '@mui/icons-material/Print'
import { toast } from 'react-toastify'

import {
  addInspectionBatchAsset,
  addInspectionBatchExistingAssets,
  createInspectionForm,
  createInstantInspection,
  fetchInspectionBatch,
  fetchInspectionBatches,
  fetchInspectionFacilityEquipment,
  fetchInspectionFacilities,
  fetchInspectionForms,
  fetchInspectionQuotations,
  fetchInspectionSummary,
  fetchInspections,
  generateUpcomingInspections,
  removeInspectionBatchAsset,
  scheduleInspections,
  saveInspectionReport,
  startInspection as startScheduledInspection,
  updateInspectionForm,
  updateInspectionInvoice,
  updateInspectionTechnician,
  type BatchAssetCreatePayload,
  type Inspection,
  type InspectionBatch,
  type InspectionEquipmentItem,
  type InspectionInvoice,
  type InspectionFrequency,
  type InspectionFormOption,
} from '@/api/inspections'
import { fetchModalities, type Modality } from '@/api/modalities'
import { fetchUsers, resolveUploadUrl, type UserData } from '@/api/users'
import { fetchActiveTestEquipment, type TestEquipment } from '@/api/testEquipment'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'

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

type ReportFormSource = 'default' | 'attached' | 'custom'
type FormBuilderMode = 'create' | 'edit' | 'report-custom'
type GridCellType = 'input' | 'radio'
type UpcomingDateRange = '1m' | '3m' | '6m' | '1y'

type GridCellSchema = {
  id: string
  label: string
  type: GridCellType
  options?: string[]
}

type CustomGridSchema = {
  title: string
  rows: number
  columns: number
  cells: GridCellSchema[][]
}

type InspectionFormSchema = {
  title: string
  version: number
  source?: string
  based_on?: string
  custom_grid: CustomGridSchema | null
}

const GRID_CELL_TYPES: { value: GridCellType; label: string }[] = [
  { value: 'input', label: 'Input Field' },
  { value: 'radio', label: 'Radio Button' },
]

const UPCOMING_DATE_RANGES: { value: UpcomingDateRange; label: string; months?: number; years?: number }[] = [
  { value: '1m', label: '1 Month', months: 1 },
  { value: '3m', label: '3 Months', months: 3 },
  { value: '6m', label: '6 Months', months: 6 },
  { value: '1y', label: '1 Year', years: 1 },
]

const CHECK_FIELD_LABELS = CHECK_FIELDS.reduce((acc, [key, label]) => ({ ...acc, [key]: label }), {} as Record<string, string>)

const labelFromKey = (key: string) => key
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

const slugifyKey = (value: string, fallback = 'field') => {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return key || `${fallback}_${Date.now()}`
}

const createGridCell = (row: number, column: number): GridCellSchema => ({
  id: `cell_${row + 1}_${column + 1}`,
  label: 'view',
  type: 'input',
})

const createEmptyGrid = (rows = 3, columns = 3, title = 'Set Title'): CustomGridSchema => ({
  title,
  rows,
  columns,
  cells: Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => createGridCell(row, column)),
  ),
})

const normalizeGridCell = (cell: any, row: number, column: number): GridCellSchema => {
  const type = cell?.type === 'radio' ? 'radio' : 'input'
  const options = Array.isArray(cell?.options) && cell.options.length
    ? cell.options.map((option: any) => String(option)).filter(Boolean)
    : ['Yes', 'No']
  return {
    id: String(cell?.id || `cell_${row + 1}_${column + 1}`),
    label: String(cell?.label ?? cell?.value ?? 'view'),
    type,
    options: type === 'radio' ? options : undefined,
  }
}

const normalizeGrid = (grid: any, fallbackTitle = 'Set Title'): CustomGridSchema | null => {
  if (!grid) return null
  if (Array.isArray(grid.cells) && grid.cells.length) {
    const cells = grid.cells
      .filter((row: any) => Array.isArray(row) && row.length)
      .slice(0, 30)
      .map((row: any[], rowIndex: number) => row.slice(0, 12).map((cell: any, columnIndex: number) => normalizeGridCell(cell, rowIndex, columnIndex)))
    if (cells.length) {
      return {
        title: String(grid.title || fallbackTitle),
        rows: cells.length,
        columns: Math.max(...cells.map((row: GridCellSchema[]) => row.length)),
        cells,
      }
    }
  }
  const rows = Math.max(1, Math.min(30, Number(grid.rows || 3)))
  const columns = Math.max(1, Math.min(12, Number(grid.columns || 3)))
  return {
    title: String(grid.title || fallbackTitle),
    rows,
    columns,
    cells: Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => normalizeGridCell(grid.cells?.[row]?.[column], row, column)),
    ),
  }
}

const gridFromLegacySections = (schema: any): CustomGridSchema | null => {
  const customSections = (schema?.sections || []).filter((section: any) =>
    !['identity', 'checks', 'diagnostics', 'measurements', 'photo_documentation', 'compliance', 'parts', 'test_equipment', 'billing', 'dates'].includes(section?.key),
  )
  if (!customSections.length) return null
  const fields = customSections.flatMap((section: any) => (section.fields || []).map((field: any) => ({
    label: typeof field === 'string' ? labelFromKey(field) : String(field?.label || field?.key || 'view'),
    type: typeof field === 'object' && field?.type === 'radio' ? 'radio' : 'input',
    options: typeof field === 'object' && field?.type === 'radio'
      ? (Array.isArray(field?.options) && field.options.length ? field.options.map((option: any) => String(option)) : ['Yes', 'No'])
      : undefined,
  })))
  const rows = Math.max(1, Math.ceil(fields.length / 3))
  const grid = createEmptyGrid(rows, 3, customSections[0]?.label || 'Set Title')
  fields.forEach((field: any, index: number) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    grid.cells[row][column] = { ...grid.cells[row][column], ...field }
  })
  return grid
}

const normalizeInspectionFormSchema = (schema: any, fallbackTitle = 'Inspection Form'): InspectionFormSchema => ({
  title: String(schema?.title || fallbackTitle),
  version: Number(schema?.version || 3),
  source: schema?.source,
  based_on: schema?.based_on,
  custom_grid: normalizeGrid(schema?.custom_grid, schema?.custom_grid?.title) || gridFromLegacySections(schema),
})

const schemaToPayload = (schema: InspectionFormSchema, title: string): InspectionFormSchema => ({
  title,
  version: 3,
  source: 'medrad_grid_form_builder',
  based_on: schema.based_on,
  custom_grid: schema.custom_grid ? normalizeGrid(schema.custom_grid, schema.custom_grid.title || 'Set Title') : null,
})

const mergeSchemaDefaultsIntoReport = (currentReport: any, schema: InspectionFormSchema | null) => {
  if (!schema?.custom_grid) return currentReport
  const existing = currentReport?.custom_grid_values || {}
  const defaults = schema.custom_grid.cells.flat().reduce((acc, cell) => {
    if (cell.type === 'input' || cell.type === 'radio') acc[cell.id] = existing[cell.id] ?? ''
    return acc
  }, {} as Record<string, any>)
  return {
    ...currentReport,
    custom_grid: schema.custom_grid,
    custom_grid_values: defaults,
  }
}

const statusChip = (value: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    in_progress: { bg: '#FEF3C7', color: '#B45309' },
    completed: { bg: '#D1FAE5', color: '#047857' },
    pass: { bg: '#D1FAE5', color: '#047857' },
    fail: { bg: '#FEE2E2', color: '#DC2626' },
    pending: { bg: '#E0E7FF', color: '#4338CA' },
    paid: { bg: '#E0E7FF', color: '#4338CA' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
  }
  return map[value] || { bg: '#EEF2FF', color: '#4F46E5' }
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const flattenModalities = (items: Modality[]): Modality[] =>
  items.flatMap((item) => [item, ...flattenModalities(item.children || [])])

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const toLocalDateParam = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getUpcomingDateWindow = (range: UpcomingDateRange) => {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const to = new Date(from)
  const config = UPCOMING_DATE_RANGES.find(item => item.value === range) || UPCOMING_DATE_RANGES[0]
  if (config.years) {
    to.setFullYear(to.getFullYear() + config.years)
  } else {
    to.setMonth(to.getMonth() + (config.months || 1))
  }
  return {
    date_from: toLocalDateParam(from),
    date_to: toLocalDateParam(to),
  }
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

// ─── Print CSS ───────────────────────────────────────────────────────────────

const REPORT_CSS = `
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
  .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
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
  tfoot td { font-weight: 900; }
  .right { text-align: right; }
  .amount { color: #047857; font-weight: 900; }
  .total-row td { background: #F0FDF4; color: #047857; font-size: 14px; }
  .bal-row td { background: #FEF2F2; color: #DC2626; }
  .status { display: inline-block; padding: 5px 9px; border-radius: 999px; background: #EEF2FF; color: #4F46E5; font-weight: 900; text-transform: capitalize; }
  .status.pass, .status.yes, .status.completed { background: #ECFDF5; color: #047857; }
  .status.fail, .status.no { background: #FEF2F2; color: #B91C1C; }
  .status.na, .status.n\\/a { background: #F1F5F9; color: #475569; }
  .status.paid { background: #ECFDF5; color: #047857; }
  .status.overdue, .status.cancelled { background: #FEF2F2; color: #B91C1C; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .pill { padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #E5E7EB; color: #64748B; font-size: 11px; display: flex; justify-content: space-between; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; width: 100%; min-height: 0; box-shadow: none; }
    .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .total-row td, .bal-row td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

const openPrintFrame = (title: string, body: string) => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>${REPORT_CSS}</style></head><body>${body}</body></html>`)
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

const buildReportSheetHtml = (inspection: Inspection, batchNumber?: string): string => {
  const rawInspection = inspection as any
  const data: any = inspection.form_data || makeReport(inspection)
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
              const value = customGridValues[cell.id]
              const display = value || cell.label || '-'
              return `<td>${escapeHtml(display)}</td>`
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
          ${batchNumber ? `<div class="sub" style="font-size:12px">Batch: ${escapeHtml(batchNumber)}</div>` : ''}
        </div>
      </section>
      <section class="content">
        <div class="grid">
          <div class="box"><small>Facility</small><strong>${escapeHtml(inspection.facility_name || '-')}</strong></div>
          ${inspection.invoice?.customer_name ? `<div class="box"><small>Customer</small><strong>${escapeHtml(inspection.invoice.customer_name)}</strong>${inspection.invoice.customer_phone ? `<div style="color:#64748B;font-size:11px">${escapeHtml(inspection.invoice.customer_phone)}</div>` : ''}${inspection.invoice.customer_address ? `<div style="color:#64748B;font-size:11px">${escapeHtml(inspection.invoice.customer_address)}</div>` : ''}</div>` : ''}
          <div class="box"><small>Asset</small><strong>${escapeHtml(inspection.asset_name || data.identity?.description || '-')}</strong></div>
          <div class="box"><small>Serial #</small><strong>${escapeHtml(inspection.serial_number || data.identity?.serial_number || '-')}</strong></div>
          <div class="box"><small>Result</small><strong>${escapeHtml(inspection.result || '-')}</strong></div>
        </div>
        <div class="grid">
          <div class="box"><small>Asset / Part</small><strong>${escapeHtml(inspection.inventory_part_name || inspection.asset_name || inspection.equipment_name || '-')}</strong></div>
          <div class="box"><small>Tier</small><strong>${escapeHtml(inspection.tier_name || '-')}</strong></div>
          <div class="box"><small>Technician</small><strong>${escapeHtml(inspection.inspector_name || data.dates?.inspected_by || '-')}</strong></div>
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
          <h2>Compliance &amp; Billing</h2>
          <h3>Certification</h3><p>${escapeHtml(data.compliance?.certified || '-')}</p>
          <h3>Standard</h3><p>${escapeHtml(data.compliance?.standard || '-')}</p>
          <h3>Recommendations</h3><p>${escapeHtml(data.compliance?.recommendations || '-')}</p>
          <div class="summary">
            <span class="pill">Parts: ${escapeHtml(money(data.billing?.parts || rawInspection.parts_amount || 0))}</span>
            <span class="pill">Inspection: ${escapeHtml(money(data.billing?.inspection_charges || rawInspection.inspection_charge || 0))}</span>
            <span class="pill">Other: ${escapeHtml(money(data.billing?.others || rawInspection.other_charges || 0))}</span>
            <span class="pill">Total: ${escapeHtml(money(billingTotal))}</span>
            <span class="pill">Invoice: ${escapeHtml(inspection.invoice?.invoice_number || 'Pending')}</span>
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

const printInspectionReport = (inspection: Inspection) => {
  openPrintFrame(
    `${inspection.inspection_number} Inspection Report`,
    buildReportSheetHtml(inspection),
  )
}

const printBatchReport = (batch: InspectionBatch) => {
  const assets = batch.assets || []
  if (!assets.length) { toast.info('No assets in this batch.'); return }
  const body = assets.map((asset, i) => {
    const html = buildReportSheetHtml(asset, batch.batch_number)
    return i < assets.length - 1 ? html.replace('<main class="sheet">', '<main class="sheet page-break">') : html
  }).join('')
  openPrintFrame(`${batch.batch_number} Batch Inspection Report`, body)
}

const buildInvoiceSheetHtml = (invoice: InspectionInvoice, pageBreak = false): string => {
  const travel = Number(invoice.travel_charges || 0)
  const service = Number(invoice.service_charges || 0)
  return `
    <main class="sheet${pageBreak ? ' page-break' : ''}">
      <section class="hero" style="background:linear-gradient(135deg,#2563EB 0%,#4F46E5 55%,#7C3AED 100%)">
        <div class="brand">
          <img src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" />
          <div>Mr. BioMed Tech Services<br><span style="font-size:12px;color:rgba(255,255,255,0.82)">Biomedical Equipment Repair &amp; Rental Services</span></div>
        </div>
        <div>
          <h1>Inspection Invoice</h1>
          <div class="sub">${escapeHtml(invoice.invoice_number)}</div>
          ${invoice.inspection_number ? `<div class="sub" style="font-size:12px">Inspection: ${escapeHtml(invoice.inspection_number)}</div>` : ''}
        </div>
      </section>
      <section class="content">
        <div class="grid2">
          <div class="box"><small>Bill To</small><strong>${escapeHtml(invoice.customer_name || '-')}</strong>${invoice.customer_email ? `<div style="color:#64748B;font-size:12px;margin-top:4px">${escapeHtml(invoice.customer_email)}</div>` : ''}${invoice.customer_phone ? `<div style="color:#64748B;font-size:12px">${escapeHtml(invoice.customer_phone)}</div>` : ''}${invoice.customer_address ? `<div style="color:#64748B;font-size:12px">${escapeHtml(invoice.customer_address)}</div>` : ''}</div>
          <div class="box"><small>Facility</small><strong>${escapeHtml(invoice.facility_name || '-')}</strong></div>
          <div class="box"><small>Issue Date</small><strong>${escapeHtml(formatDate(invoice.issue_date))}</strong></div>
          <div class="box"><small>Due Date</small><strong>${escapeHtml(formatDate(invoice.due_date))}</strong></div>
        </div>
        <table>
          <thead><tr><th>Description</th><th>Item</th><th class="right">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td>Inspection Service${invoice.inspection_number ? ` — ${escapeHtml(invoice.inspection_number)}` : ''}</td>
              <td>${escapeHtml(invoice.inventory_part_name || (invoice as any).asset_name || (invoice as any).equipment_name || '-')}</td>
              <td class="right amount">${escapeHtml(money(invoice.subtotal))}</td>
            </tr>
            ${travel > 0 ? `<tr><td>Travel Charges</td><td>—</td><td class="right amount">${escapeHtml(money(travel))}</td></tr>` : ''}
            ${service > 0 ? `<tr><td>Service Charges</td><td>—</td><td class="right amount">${escapeHtml(money(service))}</td></tr>` : ''}
            ${Number(invoice.tax_amount || 0) > 0 ? `<tr><td>Tax</td><td>—</td><td class="right">${escapeHtml(money(invoice.tax_amount))}</td></tr>` : ''}
            ${Number(invoice.discount_amount || 0) > 0 ? `<tr><td>Discount</td><td>—</td><td class="right">-${escapeHtml(money(invoice.discount_amount))}</td></tr>` : ''}
          </tbody>
          <tfoot>
            <tr class="total-row"><td colspan="2" class="right">Total</td><td class="right">${escapeHtml(money(invoice.total_amount))}</td></tr>
            <tr><td colspan="2" class="right" style="color:#64748B">Amount Paid</td><td class="right" style="color:#2563EB;font-weight:900">${escapeHtml(money(invoice.amount_paid))}</td></tr>
            <tr class="bal-row"><td colspan="2" class="right">Balance Due</td><td class="right">${escapeHtml(money(invoice.balance_due))}</td></tr>
          </tfoot>
        </table>
        <div style="margin-top:20px;display:flex;gap:12px;align-items:center">
          <span class="status ${escapeHtml(invoice.status)}">${escapeHtml(invoice.status)}</span>
          ${invoice.notes ? `<span style="color:#64748B;font-size:13px">${escapeHtml(invoice.notes)}</span>` : ''}
        </div>
        <div class="footer">
          <span>Mr. BioMed Tech Services</span>
          <span>Generated from Medrad Admin Panel</span>
        </div>
      </section>
    </main>
  `
}

const printInspectionInvoice = (invoice: InspectionInvoice) => {
  openPrintFrame(`${invoice.invoice_number} Inspection Invoice`, buildInvoiceSheetHtml(invoice))
}

const printBatchInvoices = (batch: InspectionBatch) => {
  const invoices = (batch.assets || []).filter(a => a.invoice).map(a => a.invoice!)
  if (!invoices.length) { toast.info('No invoices in this batch yet.'); return }
  const body = invoices.map((inv, i) => buildInvoiceSheetHtml(inv, i < invoices.length - 1)).join('')
  openPrintFrame(`${batch.batch_number} Batch Invoices`, body)
}

const printBatchSummaryInvoice = (batch: InspectionBatch) => {
  const invoices = (batch.assets || []).filter(a => a.invoice).map(a => a.invoice!)
  if (!invoices.length) { toast.info('No invoices in this batch yet.'); return }
  const first = invoices[0]
  const esc = escapeHtml
  const fmt = money

  const subtotal = invoices.reduce((s, inv) => s + Number(inv.subtotal || 0), 0)
  const travel   = invoices.reduce((s, inv) => s + Number((inv as any).travel_charges || 0), 0)
  const service  = invoices.reduce((s, inv) => s + Number((inv as any).service_charges || 0), 0)
  const tax      = invoices.reduce((s, inv) => s + Number(inv.tax_amount || 0), 0)
  const discount = invoices.reduce((s, inv) => s + Number(inv.discount_amount || 0), 0)
  const total    = subtotal + travel + service + tax - discount
  const paid     = invoices.reduce((s, inv) => s + Number(inv.amount_paid || 0), 0)
  const balance  = total - paid

  const lineRows = invoices.map(inv => {
    const asset = inv.inventory_part_name || (inv as any).asset_name || (inv as any).equipment_name || '-'
    return `<tr>
      <td>${esc(inv.inspection_number || '-')}</td>
      <td>${esc(asset)}</td>
      <td class="right amount">${esc(fmt(inv.subtotal))}</td>
    </tr>`
  }).join('')

  const body = `
    <main class="sheet">
      <section class="hero">
        <div class="brand">
          <img src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" />
          <div>Mr. BioMed Tech Services<br><span style="font-size:12px;color:rgba(255,255,255,0.82)">Biomedical Equipment Repair &amp; Rental Services</span></div>
        </div>
        <div>
          <h1 style="margin:0;font-size:28px;text-align:right;">Batch Summary Invoice</h1>
          <div style="text-align:right;color:rgba(255,255,255,0.84);font-weight:700;margin-top:6px;">${esc(batch.batch_number)}</div>
        </div>
      </section>
      <section class="content">
        <div class="grid2">
          <div class="box"><small>Bill To</small><strong>${esc(first.customer_name || '-')}</strong>${first.customer_email ? `<div style="color:#64748B;font-size:12px;margin-top:4px">${esc(first.customer_email)}</div>` : ''}</div>
          <div class="box"><small>Facility</small><strong>${esc(first.facility_name || '-')}</strong></div>
          <div class="box"><small>Inspections</small><strong>${invoices.length} items</strong></div>
          <div class="box"><small>Issue Date</small><strong>${esc(formatDate(first.issue_date))}</strong></div>
        </div>
        <table>
          <thead><tr><th>Inspection #</th><th>Asset / Part</th><th class="right">Amount</th></tr></thead>
          <tbody>
            ${lineRows}
            ${travel > 0 ? `<tr><td colspan="2">Travel Charges</td><td class="right amount">${esc(fmt(travel))}</td></tr>` : ''}
            ${service > 0 ? `<tr><td colspan="2">Service Charges</td><td class="right amount">${esc(fmt(service))}</td></tr>` : ''}
            ${tax > 0 ? `<tr><td colspan="2">Tax</td><td class="right">${esc(fmt(tax))}</td></tr>` : ''}
            ${discount > 0 ? `<tr><td colspan="2">Discount</td><td class="right">-${esc(fmt(discount))}</td></tr>` : ''}
          </tbody>
          <tfoot>
            <tr class="total-row"><td colspan="2" class="right">Total</td><td class="right">${esc(fmt(total))}</td></tr>
            <tr><td colspan="2" class="right" style="color:#64748B">Amount Paid</td><td class="right" style="color:#2563EB;font-weight:900">${esc(fmt(paid))}</td></tr>
            <tr class="bal-row"><td colspan="2" class="right">Balance Due</td><td class="right">${esc(fmt(balance))}</td></tr>
          </tfoot>
        </table>
        <div class="footer">
          <span>Mr. BioMed Tech Services</span>
          <span>Generated from Medrad Admin Panel</span>
        </div>
      </section>
    </main>`
  openPrintFrame(`${batch.batch_number} Batch Summary Invoice`, body)
}

const makeReport = (inspection: Inspection) => ({
  identity: {
    asset_number: inspection.asset_tag || inspection.part_number || '',
    description: inspection.equipment_name || inspection.inventory_part_name || '',
    make: inspection.make || '',
    model: inspection.model || '',
    serial_number: inspection.serial_number || '',
    location: '',
    risk_ranking: '',
    pm_schedule: 'Annual',
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
  photo_documentation: [{ label: 'Equipment condition', url: '', notes: '' }],
  compliance: {
    certified: 'yes',
    standard: inspection.compliance_requirement || 'Preventive maintenance and safety inspection',
    certificate_notes: '',
    recommendations: '',
  },
  parts: [{ description: '', part_number: '', price: 0, condition: '' }],
  test_equipment: [
    { description: 'Safety Analyzer', make: '', serial_number: '' },
    { description: 'MultiMeter', make: '', serial_number: '' },
  ],
  billing: { parts: 0, inspection_charges: 0, others: 0 },
  dates: {
    inspected_by: inspection.inspector_name || '',
    inspection_date: new Date().toISOString().slice(0, 10),
    inspection_due_date: new Date().toISOString().slice(0, 10),
    next_inspection_due_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
  },
})

const emptyBatchAssetForm = (): BatchAssetCreatePayload => ({
  asset_tag: '',
  make: '',
  model: '',
  serial_number: '',
  modality_id: 0,
  tier_id: null,
  inspection_form_id: null,
  description: '',
  risk_priority: '',
  risk_name: 'Non-Critical',
  location: '',
  pm_scheduling: 'annual',
  last_pm_date: null,
  installation_date: null,
  inventory_date: new Date().toISOString().slice(0, 10),
})

const Inspections = () => {
  const pageSize = 10
  const location = useLocation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
  const canAddInspections = hasPermission(currentUser, 'inspections', 'add')
  const canEditInspections = hasPermission(currentUser, 'inspections', 'edit')
  const canDeleteInspections = hasPermission(currentUser, 'inspections', 'delete')
  const canInitiateInspections = canAddInspections && canEditInspections
  const [tab, setTab] = useState(0)
  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [selectedInstantEquipmentIds, setSelectedInstantEquipmentIds] = useState<number[]>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([])
  const [frequency, setFrequency] = useState<InspectionFrequency>('instant')
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10))
  const [reportInspection, setReportInspection] = useState<Inspection | null>(null)
  const [viewReport, setViewReport] = useState<Inspection | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [report, setReport] = useState<any>(null)
  const [reportStatus, setReportStatus] = useState<'completed' | 'in_progress'>('completed')
  const [reportFormSource, setReportFormSource] = useState<ReportFormSource>('default')
  const [selectedReportFormId, setSelectedReportFormId] = useState<number | null>(null)
  const [saveCustomForm, setSaveCustomForm] = useState(true)
  const [customFormName, setCustomFormName] = useState('')
  const [customFormDescription, setCustomFormDescription] = useState('')
  const [reportCustomSchema, setReportCustomSchema] = useState<InspectionFormSchema | null>(null)
  const [formBuilderOpen, setFormBuilderOpen] = useState(false)
  const [formBuilderMode, setFormBuilderMode] = useState<FormBuilderMode>('edit')
  const [formBuilderId, setFormBuilderId] = useState<number | null>(null)
  const [formBuilderName, setFormBuilderName] = useState('')
  const [formBuilderDescription, setFormBuilderDescription] = useState('')
  const [formBuilderModalityId, setFormBuilderModalityId] = useState<number | null>(null)
  const [formBuilderSchema, setFormBuilderSchema] = useState<InspectionFormSchema>(() => normalizeInspectionFormSchema({ sections: [] }))
  const [formBuilderRows, setFormBuilderRows] = useState(3)
  const [formBuilderColumns, setFormBuilderColumns] = useState(3)
  const [invoiceEdit, setInvoiceEdit] = useState<InspectionInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState<any>({})
  const [techEdit, setTechEdit] = useState<Inspection | null>(null)
  const [selectedTechId, setSelectedTechId] = useState<number | ''>('')
  const [addAssetOpen, setAddAssetOpen] = useState(false)
  const [addExistingAssetOpen, setAddExistingAssetOpen] = useState(false)
  const [batchAssetForm, setBatchAssetForm] = useState<BatchAssetCreatePayload>(emptyBatchAssetForm())
  const [existingAssetSearch, setExistingAssetSearch] = useState('')
  const [selectedExistingEquipmentIds, setSelectedExistingEquipmentIds] = useState<number[]>([])
  const [assetActionAnchor, setAssetActionAnchor] = useState<HTMLElement | null>(null)
  const [assetActionItem, setAssetActionItem] = useState<Inspection | null>(null)
  const [upcomingSearch, setUpcomingSearch] = useState('')
  const [upcomingRange, setUpcomingRange] = useState<UpcomingDateRange>('1m')
  const [upcomingPage, setUpcomingPage] = useState(0)
  const [inProgressBatchPage, setInProgressBatchPage] = useState(0)
  const [completedBatchPage, setCompletedBatchPage] = useState(0)
  const [legacyInProgressPage, setLegacyInProgressPage] = useState(0)
  const [legacyCompletedPage, setLegacyCompletedPage] = useState(0)
  const [quotationPage, setQuotationPage] = useState(0)
  const highlightInvoiceId = Number(new URLSearchParams(location.search).get('highlightInvoice') || 0)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('tab') === 'quotations' || params.get('highlightInvoice')) {
      setTab(4)
      setQuotationPage(0)
    }
  }, [location.search])

  useEffect(() => {
    setUpcomingPage(0)
  }, [upcomingSearch, upcomingRange])

  useEffect(() => {
    if (addExistingAssetOpen) return
    setExistingAssetSearch('')
    setSelectedExistingEquipmentIds([])
  }, [addExistingAssetOpen])

  const summaryQ = useQuery({ queryKey: ['inspection-summary'], queryFn: fetchInspectionSummary })
  const facilitiesQ = useQuery({
    queryKey: ['inspection-facilities'],
    queryFn: fetchInspectionFacilities,
    enabled: tab === 0 || tab === 1,
  })
  const equipmentQ = useQuery({
    queryKey: ['inspection-equipment', facilityId],
    queryFn: () => fetchInspectionFacilityEquipment(Number(facilityId)),
    enabled: Boolean(facilityId),
  })
  const upcomingWindow = useMemo(() => getUpcomingDateWindow(upcomingRange), [upcomingRange])
  const upcomingQ = useQuery({
    queryKey: ['inspections', 'upcoming', upcomingPage, pageSize, upcomingSearch, upcomingRange],
    queryFn: () => fetchInspections({
      status: 'upcoming',
      search: upcomingSearch.trim() || undefined,
      date_from: upcomingWindow.date_from,
      date_to: upcomingWindow.date_to,
      skip: upcomingPage * pageSize,
      limit: pageSize,
    }),
    enabled: tab === 0,
  })
  const inProgressQ = useQuery({
    queryKey: ['inspections', 'in_progress', 'unbatched', legacyInProgressPage, pageSize],
    queryFn: () => fetchInspections({ status: 'in_progress', unbatched_only: true, skip: legacyInProgressPage * pageSize, limit: pageSize }),
    enabled: tab === 2,
  })
  const inProgressBatchesQ = useQuery({
    queryKey: ['inspection-batches', 'in_progress', inProgressBatchPage, pageSize],
    queryFn: () => fetchInspectionBatches({ status: 'in_progress', skip: inProgressBatchPage * pageSize, limit: pageSize }),
    enabled: tab === 2,
  })
  const completedBatchesQ = useQuery({
    queryKey: ['inspection-batches', 'completed', completedBatchPage, pageSize],
    queryFn: () => fetchInspectionBatches({ status: 'completed', skip: completedBatchPage * pageSize, limit: pageSize }),
    enabled: tab === 3,
  })
  const batchDetailQ = useQuery({
    queryKey: ['inspection-batches', selectedBatchId],
    queryFn: () => fetchInspectionBatch(Number(selectedBatchId)),
    enabled: Boolean(selectedBatchId),
  })
  const batchEquipmentQ = useQuery({
    queryKey: ['inspection-equipment', 'batch-existing-options', batchDetailQ.data?.facility_id],
    queryFn: () => fetchInspectionFacilityEquipment(Number(batchDetailQ.data?.facility_id)),
    enabled: addExistingAssetOpen && Boolean(batchDetailQ.data?.facility_id),
  })
  const completedQ = useQuery({
    queryKey: ['inspections', 'completed', 'unbatched', legacyCompletedPage, pageSize],
    queryFn: () => fetchInspections({ status: 'completed', unbatched_only: true, skip: legacyCompletedPage * pageSize, limit: pageSize }),
    enabled: tab === 3,
  })
  const quotationsQ = useQuery({
    queryKey: ['inspection-quotations', quotationPage, pageSize, highlightInvoiceId],
    queryFn: () => fetchInspectionQuotations({
      invoice_id: highlightInvoiceId || undefined,
      skip: highlightInvoiceId ? 0 : quotationPage * pageSize,
      limit: pageSize,
    }),
    enabled: tab === 4,
  })
  const formsQ = useQuery({ queryKey: ['inspection-forms'], queryFn: () => fetchInspectionForms(), enabled: tab === 5 || Boolean(reportInspection) })
  const modalitiesQ = useQuery({ queryKey: ['modalities'], queryFn: () => fetchModalities(), enabled: tab === 1 || tab === 5 || addAssetOpen })
  const usersQ = useQuery({ queryKey: ['users', 'inspection-technicians'], queryFn: () => fetchUsers({ is_active: true, limit: 500 }), enabled: tab === 2 || Boolean(selectedBatchId) })
  const testEquipmentQ = useQuery({
    queryKey: ['test-equipment', 'inspection-active-options'],
    queryFn: () => fetchActiveTestEquipment({ limit: 500 }),
    enabled: Boolean(reportInspection),
  })

  const selectedFacility = facilitiesQ.data?.find(f => f.id === facilityId)
  const equipment = equipmentQ.data || []
  const inspectionForms = formsQ.data?.items || []
  const defaultReportForm = useMemo(
    () => inspectionForms.find((form) => form.name === 'Advanced Facility Inventory Inspection Report') || inspectionForms[0] || null,
    [inspectionForms],
  )
  const selectedReportTemplate = useMemo(() => {
    if (!selectedReportFormId) return null
    return inspectionForms.find(form => form.id === selectedReportFormId) || null
  }, [inspectionForms, selectedReportFormId])
  const activeReportSchema = useMemo(() => {
    if (reportFormSource === 'custom') return reportCustomSchema
    const template = selectedReportTemplate || defaultReportForm
    return template ? normalizeInspectionFormSchema(template.schema, template.name) : null
  }, [defaultReportForm, reportCustomSchema, reportFormSource, selectedReportTemplate])
  const assignableModalities = useMemo(
    () => flattenModalities(modalitiesQ.data?.items || []),
    [modalitiesQ.data?.items],
  )

  const createMut = useMutation({
    mutationFn: createInstantInspection,
    onSuccess: (res) => {
      const assetCount = res.items?.[0]?.asset_count || 0
      toast.success(`${res.total} inspection batch started with ${assetCount} asset${assetCount === 1 ? '' : 's'}`)
      setSelectedInstantEquipmentIds([])
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
      setTab(2)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not start inspection'),
  })

  const scheduleMut = useMutation({
    mutationFn: scheduleInspections,
    onSuccess: (res) => {
      const assetCount = res.items?.[0]?.asset_count || 0
      toast.success(`${res.total} inspection batch scheduled with ${assetCount} asset${assetCount === 1 ? '' : 's'}`)
      setSelectedEquipmentIds([])
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
      setTab(0)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not schedule inspections'),
  })

  const generateMut = useMutation({
    mutationFn: generateUpcomingInspections,
    onSuccess: (res) => {
      toast.success(`${res.total} upcoming inspection(s) generated`)
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not generate schedule'),
  })

  const startMut = useMutation({
    mutationFn: startScheduledInspection,
    onSuccess: () => {
      toast.success('Inspection moved to in progress')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
      setTab(2)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not start inspection'),
  })

  const reportMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => saveInspectionReport(id, data),
    onSuccess: () => {
      toast.success(reportStatus === 'completed' ? 'Inspection report saved and invoice prepared' : 'Inspection moved back to in progress')
      setReportInspection(null)
      setReport(null)
      setReportStatus('completed')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not save inspection report'),
  })

  const addBatchAssetMut = useMutation({
    mutationFn: ({ batchId, data }: { batchId: number; data: BatchAssetCreatePayload }) => addInspectionBatchAsset(batchId, data),
    onSuccess: () => {
      toast.success('Asset added to inspection batch')
      setAddAssetOpen(false)
      setBatchAssetForm(emptyBatchAssetForm())
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-equipment'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not add asset to batch'),
  })

  const addBatchExistingAssetsMut = useMutation({
    mutationFn: ({ batchId, equipmentIds }: { batchId: number; equipmentIds: number[] }) => addInspectionBatchExistingAssets(batchId, { equipment_ids: equipmentIds }),
    onSuccess: (_batch, variables) => {
      toast.success(`${variables.equipmentIds.length} existing asset${variables.equipmentIds.length === 1 ? '' : 's'} added to inspection batch`)
      setAddExistingAssetOpen(false)
      setSelectedExistingEquipmentIds([])
      setExistingAssetSearch('')
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not add existing assets to batch'),
  })

  const removeBatchAssetMut = useMutation({
    mutationFn: ({ batchId, inspectionId }: { batchId: number; inspectionId: number }) => removeInspectionBatchAsset(batchId, inspectionId),
    onSuccess: () => {
      toast.success('Asset removed from batch')
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not remove asset from batch'),
  })

  const techMut = useMutation({
    mutationFn: ({ inspectionId, inspectorId }: { inspectionId: number; inspectorId: number | null }) => updateInspectionTechnician(inspectionId, inspectorId),
    onSuccess: () => {
      toast.success('Technician updated')
      setTechEdit(null)
      setSelectedTechId('')
      queryClient.invalidateQueries({ queryKey: ['inspection-batches'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not change technician'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateInspectionInvoice(id, data),
    onSuccess: () => {
      toast.success('Inspection invoice updated')
      setInvoiceEdit(null)
      queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-summary'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update invoice'),
  })

  const formMut = useMutation({
    mutationFn: ({ id, modality_id }: { id: number; modality_id: number | null }) => updateInspectionForm(id, { modality_id }),
    onSuccess: () => {
      toast.success('Inspection form asset tag updated')
      queryClient.invalidateQueries({ queryKey: ['inspection-forms'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update inspection form'),
  })

  const formBuilderMut = useMutation({
    mutationFn: async () => {
      const name = formBuilderName.trim()
      if (!name) throw new Error('Form name is required')
      const payload = {
        name,
        description: formBuilderDescription.trim() || null,
        modality_id: formBuilderModalityId,
        schema: schemaToPayload(formBuilderSchema, name),
      }
      if (formBuilderMode === 'create') return createInspectionForm(payload)
      if (!formBuilderId) throw new Error('Inspection form was not selected')
      return updateInspectionForm(formBuilderId, payload)
    },
    onSuccess: (saved) => {
      toast.success(formBuilderMode === 'create' ? 'Inspection form created' : 'Inspection form updated')
      setFormBuilderOpen(false)
      queryClient.invalidateQueries({ queryKey: ['inspection-forms'] })
      if (reportInspection && reportFormSource === 'custom') {
        setSelectedReportFormId(saved.id)
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || e.message || 'Could not save inspection form'),
  })

  const saveCustomTemplateMut = useMutation({
    mutationFn: async () => {
      const name = customFormName.trim()
      if (!name) throw new Error('Form name is required')
      const schema = schemaToPayload(
        reportCustomSchema || normalizeInspectionFormSchema(buildReusableFormSchema(name, report || {}), name),
        name,
      )
      if (!schema.custom_grid) throw new Error('Create the custom grid before saving the form')
      const payload = {
        name,
        description: customFormDescription.trim() || `Custom inspection form${reportInspection ? ` created from ${reportInspection.inspection_number}` : ''}`,
        modality_id: null,
        schema,
      }
      if (selectedReportFormId && reportFormSource === 'custom') {
        return updateInspectionForm(selectedReportFormId, payload)
      }
      return createInspectionForm(payload)
    },
    onSuccess: (saved) => {
      toast.success('Custom inspection form saved without completing the report')
      setSelectedReportFormId(saved.id)
      setCustomFormName(saved.name)
      setCustomFormDescription(saved.description || '')
      setReportCustomSchema(schemaForForm(saved))
      queryClient.invalidateQueries({ queryKey: ['inspection-forms'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || e.message || 'Could not save custom inspection form'),
  })

  useEffect(() => {
    if (reportInspection) {
      setReport(reportInspection.form_data || makeReport(reportInspection))
      setReportStatus(reportInspection.status === 'completed' ? 'completed' : 'completed')
      const usesAttached = Boolean(reportInspection.attached_form_id)
      const initialSource: ReportFormSource = usesAttached ? 'attached' : 'default'
      setReportFormSource(initialSource)
      setSelectedReportFormId(
        usesAttached
          ? reportInspection.attached_form_id
          : defaultReportForm?.id || reportInspection.form_template_id || null,
      )
      const assetName = reportInspection.asset_name || reportInspection.equipment_name || reportInspection.inspection_number
      setCustomFormName(`${assetName} Custom Inspection Form`)
      setCustomFormDescription(`Reusable custom inspection form created from ${reportInspection.inspection_number}.`)
      const baseSchema = usesAttached && reportInspection.attached_form_schema
        ? normalizeInspectionFormSchema(reportInspection.attached_form_schema, reportInspection.attached_form_name || 'Asset attached form')
        : reportInspection.form_template_schema
          ? normalizeInspectionFormSchema(reportInspection.form_template_schema, reportInspection.form_template_name || 'Inspection form')
          : defaultReportForm
            ? schemaForForm(defaultReportForm)
            : null
      setReportCustomSchema(baseSchema)
      setSaveCustomForm(true)
    }
  }, [reportInspection, defaultReportForm?.id])

  useEffect(() => {
    if (!invoiceEdit) return
    setInvoiceForm({
      subtotal: Number(invoiceEdit.subtotal || 0),
      tax_amount: Number(invoiceEdit.tax_amount || 0),
      discount_amount: Number(invoiceEdit.discount_amount || 0),
      total_amount: Number(invoiceEdit.total_amount || 0),
      amount_paid: Number(invoiceEdit.amount_paid || 0),
      due_date: invoiceEdit.due_date,
      payment_terms: invoiceEdit.payment_terms || 'Net 30',
      status: invoiceEdit.status,
      notes: invoiceEdit.notes || '',
      travel_charges: Number(invoiceEdit.travel_charges || 0),
      service_charges: Number(invoiceEdit.service_charges || 0),
    })
  }, [invoiceEdit])

  const legacyInProgress = inProgressQ.data?.items || []
  const legacyCompleted = completedQ.data?.items || []

  const stats = {
    upcoming: summaryQ.data?.upcoming || 0,
    instantItems: equipment.length,
    inProgress: summaryQ.data?.in_progress || 0,
    completed: summaryQ.data?.completed || 0,
    quotations: summaryQ.data?.quotations || 0,
  }

  useEffect(() => {
    if (!highlightInvoiceId || !quotationsQ.data?.items?.length) return
    window.setTimeout(() => {
      document.getElementById(`inspection-invoice-${highlightInvoiceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [highlightInvoiceId, quotationsQ.data?.items?.length])

  const selectedBatch = batchDetailQ.data
  const batchEquipmentIds = useMemo(
    () => new Set((selectedBatch?.assets || []).map(asset => asset.equipment_id).filter((id): id is number => Boolean(id))),
    [selectedBatch?.assets],
  )
  const availableExistingBatchAssets = useMemo(() => {
    const search = existingAssetSearch.trim().toLowerCase()
    return (batchEquipmentQ.data || [])
      .filter(item => !batchEquipmentIds.has(item.id))
      .filter(item => {
        if (!search) return true
        return [
          item.asset_tag,
          item.make,
          item.model,
          item.serial_number,
          item.modality_name,
          item.criticality,
        ].some(value => String(value || '').toLowerCase().includes(search))
      })
  }, [batchEquipmentIds, batchEquipmentQ.data, existingAssetSearch])
  const batchTechnicians = useMemo(() => {
    const users = usersQ.data?.items || []
    if (!selectedBatch?.facility_id) return users
    return users.filter((user: UserData) =>
      user.facility_id === selectedBatch.facility_id ||
      (user.facilities || []).some(facility => facility.id === selectedBatch.facility_id) ||
      ['superadmin', 'admin', 'technician'].includes(user.role),
    )
  }, [selectedBatch?.facility_id, usersQ.data?.items])

  const toggleInstantEquipment = (id: number) => {
    setSelectedInstantEquipmentIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const toggleEquipment = (id: number) => {
    setSelectedEquipmentIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const toggleExistingBatchEquipment = (id: number) => {
    setSelectedExistingEquipmentIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const startInspection = () => {
    if (!canInitiateInspections) return toast.error('You do not have permission to initiate inspections')
    if (!facilityId) return toast.error('Select a facility first')
    createMut.mutate({
      facility_id: Number(facilityId),
      equipment_ids: selectedInstantEquipmentIds.length ? selectedInstantEquipmentIds : undefined,
      frequency,
    })
  }

  const scheduleSelected = () => {
    if (!canAddInspections) return toast.error('You do not have permission to schedule inspections')
    if (!facilityId) return toast.error('Select a facility first')
    scheduleMut.mutate({
      facility_id: Number(facilityId),
      equipment_ids: selectedEquipmentIds.length ? selectedEquipmentIds : undefined,
      frequency: frequency === 'instant' ? 'annual' : frequency,
      scheduled_date: new Date(scheduleDate).toISOString(),
    })
  }

  const updateReport = (section: string, key: string, value: any) => {
    setReport((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
  }

  const updateArrayReport = (section: 'parts' | 'test_equipment' | 'measurements' | 'photo_documentation', index: number, key: string, value: any) => {
    setReport((prev: any) => {
      const next = [...prev[section]]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, [section]: next }
    })
  }

  const testEquipmentSnapshot = (item: TestEquipment) => ({
    id: item.id,
    description: item.tem,
    make: item.mrf || '',
    model: item.model || '',
    serial_number: item.serial_number || '',
    asset: item.asset || '',
    image_url: item.image_url || '',
  })

  const schemaForForm = (form: InspectionFormOption | null | undefined) =>
    form ? normalizeInspectionFormSchema(form.schema, form.name) : normalizeInspectionFormSchema({ title: 'Inspection Form' })

  const openCreateFormBuilder = () => {
    setFormBuilderMode('create')
    setFormBuilderId(null)
    setFormBuilderName('New Inspection Form')
    setFormBuilderDescription('')
    setFormBuilderModalityId(null)
    setFormBuilderSchema({
      title: 'New Inspection Form',
      version: 3,
      source: 'medrad_grid_form_builder',
      based_on: defaultReportForm?.name,
      custom_grid: null,
    })
    setFormBuilderRows(3)
    setFormBuilderColumns(3)
    setFormBuilderOpen(true)
  }

  const openEditFormBuilder = (form: InspectionFormOption) => {
    setFormBuilderMode('edit')
    setFormBuilderId(form.id)
    setFormBuilderName(form.name)
    setFormBuilderDescription(form.description || '')
    setFormBuilderModalityId(form.modality_id)
    const schema = schemaForForm(form)
    setFormBuilderSchema(schema)
    setFormBuilderRows(schema.custom_grid?.rows || 3)
    setFormBuilderColumns(schema.custom_grid?.columns || 3)
    setFormBuilderOpen(true)
  }

  const openReportCustomBuilder = () => {
    const base = reportCustomSchema || activeReportSchema || normalizeInspectionFormSchema({ title: customFormName || 'Custom Inspection Form' })
    setFormBuilderMode('report-custom')
    setFormBuilderId(null)
    setFormBuilderName(customFormName || `${reportInspection?.asset_name || reportInspection?.equipment_name || 'Asset'} Custom Inspection Form`)
    setFormBuilderDescription(customFormDescription)
    setFormBuilderModalityId(null)
    setFormBuilderSchema({ ...base, title: customFormName || base.title })
    setFormBuilderRows(base.custom_grid?.rows || 3)
    setFormBuilderColumns(base.custom_grid?.columns || 3)
    setFormBuilderOpen(true)
  }

  const setBuilderGrid = (rows: number, columns: number) => {
    const safeRows = Math.max(1, Math.min(30, Number(rows || 1)))
    const safeColumns = Math.max(1, Math.min(12, Number(columns || 1)))
    setFormBuilderSchema(prev => ({
      ...prev,
      custom_grid: createEmptyGrid(safeRows, safeColumns, prev.custom_grid?.title || 'Set Title'),
    }))
  }

  const updateBuilderGridTitle = (title: string) => {
    setFormBuilderSchema(prev => ({
      ...prev,
      custom_grid: prev.custom_grid
        ? { ...prev.custom_grid, title }
        : { ...createEmptyGrid(formBuilderRows, formBuilderColumns), title },
    }))
  }

  const updateGridCell = (rowIndex: number, columnIndex: number, patch: Partial<GridCellSchema>) => {
    setFormBuilderSchema(prev => {
      const grid = prev.custom_grid || createEmptyGrid()
      return {
        ...prev,
        custom_grid: {
          ...grid,
          cells: grid.cells.map((row, r) => r === rowIndex
            ? row.map((cell, c) => {
              if (c !== columnIndex) return cell
              const nextType = patch.type || cell.type
              return {
                ...cell,
                ...patch,
                options: nextType === 'radio' ? (patch.options || cell.options || ['Yes', 'No']) : undefined,
              }
            })
            : row),
        },
      }
    })
  }

  const addGridCell = (rowIndex: number, columnIndex: number) => {
    setFormBuilderSchema(prev => {
      const grid = prev.custom_grid || createEmptyGrid()
      const nextCells = grid.cells.map((row, index) => {
        if (index !== rowIndex) return row
        const nextCell = {
          ...createGridCell(rowIndex, row.length),
          id: `cell_${rowIndex + 1}_${Date.now()}`,
        }
        return [...row.slice(0, columnIndex + 1), nextCell, ...row.slice(columnIndex + 1)]
      })
      return {
        ...prev,
        custom_grid: {
          ...grid,
          columns: Math.max(...nextCells.map(row => row.length)),
          cells: nextCells,
        },
      }
    })
  }

  const removeGridCell = (rowIndex: number, columnIndex: number) => {
    setFormBuilderSchema(prev => {
      const grid = prev.custom_grid || createEmptyGrid()
      const totalCells = grid.cells.reduce((sum, row) => sum + row.length, 0)
      if (totalCells <= 1) {
        toast.error('At least one cell is required')
        return prev
      }
      const nextCells = grid.cells
        .map((row, index) => index === rowIndex ? row.filter((_, cellIndex) => cellIndex !== columnIndex) : row)
        .filter(row => row.length > 0)
      return {
        ...prev,
        custom_grid: {
          ...grid,
          rows: nextCells.length,
          columns: Math.max(...nextCells.map(row => row.length)),
          cells: nextCells,
        },
      }
    })
  }

  const updateGridCellOption = (rowIndex: number, columnIndex: number, optionIndex: number, value: string) => {
    const cell = formBuilderSchema.custom_grid?.cells?.[rowIndex]?.[columnIndex]
    const options = [...(cell?.options || ['Yes', 'No'])]
    options[optionIndex] = value
    updateGridCell(rowIndex, columnIndex, { options: options.map(option => option.trim()).filter(Boolean) })
  }

  const addGridCellOption = (rowIndex: number, columnIndex: number) => {
    const cell = formBuilderSchema.custom_grid?.cells?.[rowIndex]?.[columnIndex]
    updateGridCell(rowIndex, columnIndex, { options: [...(cell?.options || ['Yes', 'No']), 'Option'] })
  }

  const removeGridCellOption = (rowIndex: number, columnIndex: number, optionIndex: number) => {
    const cell = formBuilderSchema.custom_grid?.cells?.[rowIndex]?.[columnIndex]
    const options = (cell?.options || ['Yes', 'No']).filter((_, index) => index !== optionIndex)
    updateGridCell(rowIndex, columnIndex, { options: options.length ? options : ['Option'] })
  }

  const saveFormBuilder = () => {
    const name = formBuilderName.trim()
    if (!name) return toast.error('Form name is required')
    const schema = schemaToPayload(formBuilderSchema, name)
    if (formBuilderMode === 'report-custom') {
      setCustomFormName(name)
      setCustomFormDescription(formBuilderDescription)
      setReportCustomSchema(schema)
      setReport((prev: any) => mergeSchemaDefaultsIntoReport(prev, schema))
      setReportFormSource('custom')
      setFormBuilderOpen(false)
      toast.success('Custom report form updated')
      return
    }
    formBuilderMut.mutate()
  }

  const updateReportGridValue = (cellId: string, value: any) => {
    setReport((prev: any) => ({
      ...prev,
      custom_grid_values: {
        ...(prev?.custom_grid_values || {}),
        [cellId]: value,
      },
    }))
  }

  const applyReportFormSource = (source: ReportFormSource) => {
    setReportFormSource(source)
    if (source === 'default') {
      setSelectedReportFormId(defaultReportForm?.id || reportInspection?.form_template_id || null)
      const base = defaultReportForm ? schemaForForm(defaultReportForm) : null
      setReportCustomSchema(base)
      setReport((prev: any) => mergeSchemaDefaultsIntoReport(prev, base))
      return
    }
    if (source === 'attached') {
      setSelectedReportFormId(reportInspection?.attached_form_id || null)
      const base = reportInspection?.attached_form_schema
        ? normalizeInspectionFormSchema(reportInspection.attached_form_schema, reportInspection.attached_form_name || 'Asset attached form')
        : null
      setReportCustomSchema(base)
      setReport((prev: any) => mergeSchemaDefaultsIntoReport(prev, base))
      return
    }
    setSelectedReportFormId(null)
    const base = reportCustomSchema || (reportInspection?.form_template_schema ? normalizeInspectionFormSchema(reportInspection.form_template_schema, reportInspection.form_template_name || 'Custom form') : activeReportSchema)
    if (base) {
      setReportCustomSchema(base)
      setReport((prev: any) => mergeSchemaDefaultsIntoReport(prev, base))
    }
  }

  const selectedReportFormName = () => {
    if (reportFormSource === 'attached') return reportInspection?.attached_form_name || 'Asset attached form'
    if (reportFormSource === 'custom') return customFormName || 'Customized form'
    return defaultReportForm?.name || 'Default form'
  }

  const buildReusableFormSchema = (formName: string, currentReport: any) => ({
    title: formName,
    version: 3,
    source: 'medrad_grid_form_builder',
    based_on: reportInspection?.form_template_name || defaultReportForm?.name || 'Default inspection report',
    custom_grid: currentReport?.custom_grid || reportCustomSchema?.custom_grid || null,
  })

  const submitReport = async () => {
    if (!canEditInspections) return toast.error('You do not have permission to update inspection reports')
    if (!reportInspection || !report) return
    let formTemplateId = selectedReportFormId || reportInspection.form_template_id
    let formTemplateName = selectedReportFormName()
    if (reportFormSource === 'custom' && saveCustomForm) {
      const name = customFormName.trim()
      if (!name) {
        toast.error('Enter a custom form name before saving it for future use')
        return
      }
      try {
        const created = await createInspectionForm({
          name,
          description: customFormDescription.trim() || `Custom inspection form created from ${reportInspection.inspection_number}`,
          modality_id: null,
          schema: schemaToPayload(reportCustomSchema || normalizeInspectionFormSchema(buildReusableFormSchema(name, report), name), name),
        })
        formTemplateId = created.id
        formTemplateName = created.name
        queryClient.invalidateQueries({ queryKey: ['inspection-forms'] })
        toast.success('Custom inspection form saved for future use')
      } catch (e: any) {
        toast.error(e.response?.data?.detail || 'Could not save custom inspection form')
        return
      }
    }
    const normalizedReport = mergeSchemaDefaultsIntoReport(report, activeReportSchema)
    const hasFail = Object.values(normalizedReport.checks || {}).includes('fail')
    const partTotal = (normalizedReport.parts || []).reduce((sum: number, part: any) => sum + Number(part.price || 0), 0)
    const formData = {
      ...normalizedReport,
      form_template: {
        id: formTemplateId,
        name: formTemplateName,
        source: reportFormSource,
        saved_as_template: reportFormSource === 'custom' ? saveCustomForm : true,
        schema: reportFormSource === 'custom'
          ? schemaToPayload(reportCustomSchema || normalizeInspectionFormSchema(buildReusableFormSchema(formTemplateName, normalizedReport), formTemplateName), formTemplateName)
          : activeReportSchema,
      },
    }
    reportMut.mutate({
      id: reportInspection.id,
      data: {
        status: reportStatus,
        result: hasFail ? 'fail' : 'pass',
        form_data: formData,
        form_template_id: formTemplateId,
        corrective_actions: normalizedReport.diagnostics?.corrective_action_taken || '',
        parts_amount: Number(normalizedReport.billing?.parts || partTotal || 0),
        inspection_charge: Number(normalizedReport.billing?.inspection_charges || 0),
        other_charges: Number(normalizedReport.billing?.others || 0),
        notes: `Inspection completed for ${reportInspection.asset_name || reportInspection.inspection_number}`,
      },
    })
  }

  const saveInvoice = () => {
    if (!canEditInspections) return toast.error('You do not have permission to update inspection invoices')
    if (!invoiceEdit) return
    // Omit total_amount so the backend always recalculates it from subtotal + charges + tax - discount
    const { total_amount: _omit, ...invoicePayload } = invoiceForm
    invoiceMut.mutate({ id: invoiceEdit.id, data: invoicePayload })
  }

  const openAssetActions = (event: MouseEvent<HTMLElement>, asset: Inspection) => {
    setAssetActionAnchor(event.currentTarget)
    setAssetActionItem(asset)
  }

  const closeAssetActions = () => {
    setAssetActionAnchor(null)
    setAssetActionItem(null)
  }

  const openTechnicianDialog = (asset: Inspection) => {
    if (!canEditInspections) return toast.error('You do not have permission to change inspection technicians')
    closeAssetActions()
    setTechEdit(asset)
    setSelectedTechId(asset.inspector_id || '')
  }

  const saveTechnician = () => {
    if (!canEditInspections) return toast.error('You do not have permission to change inspection technicians')
    if (!techEdit) return
    techMut.mutate({ inspectionId: techEdit.id, inspectorId: selectedTechId ? Number(selectedTechId) : null })
  }

  const submitBatchAsset = () => {
    if (!canInitiateInspections) return toast.error('You do not have permission to add assets to inspection batches')
    if (!selectedBatch) return
    if (!batchAssetForm.asset_tag || !batchAssetForm.make || !batchAssetForm.model || !batchAssetForm.serial_number || !batchAssetForm.modality_id) {
      toast.error('Asset #, make, model, serial, and modality are required')
      return
    }
    addBatchAssetMut.mutate({ batchId: selectedBatch.id, data: batchAssetForm })
  }

  const submitExistingBatchAssets = () => {
    if (!canInitiateInspections) return toast.error('You do not have permission to add assets to inspection batches')
    if (!selectedBatch) return
    if (!selectedExistingEquipmentIds.length) {
      toast.error('Select at least one existing asset')
      return
    }
    addBatchExistingAssetsMut.mutate({ batchId: selectedBatch.id, equipmentIds: selectedExistingEquipmentIds })
  }

  const handlePrintReport = (asset: Inspection) => {
    closeAssetActions()
    printInspectionReport(asset)
  }

  const renderKpi = (label: string, value: number, icon: JSX.Element, color: string) => (
    <Card sx={{ p: 2.2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: '0 14px 34px rgba(49,46,129,0.07)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
        <Avatar sx={{ bgcolor: `${color}18`, color, borderRadius: '14px' }}>{icon}</Avatar>
        <Box>
          <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ color: '#1E1B4B', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</Typography>
        </Box>
      </Box>
    </Card>
  )

  const renderPagination = (
    total: number,
    page: number,
    setPage: (page: number) => void,
  ) => (
    <TablePagination
      component="div"
      count={total}
      page={page}
      onPageChange={(_, nextPage) => setPage(nextPage)}
      rowsPerPage={pageSize}
      rowsPerPageOptions={[pageSize]}
      labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
    />
  )

  const renderInspectionRows = (items: Inspection[], loading: boolean, mode: 'progress' | 'completed') => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Asset</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Tier</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Result</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={7}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspections found.</TableCell></TableRow>
          ) : items.map(item => {
            const resultStyle = statusChip(item.result)
            return (
              <TableRow key={item.id} hover>
                <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{item.inspection_number}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{item.facility_name || '-'}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.asset_name || item.equipment_name || '-'}</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>{item.serial_number || item.part_number || '-'}</Typography>
                </TableCell>
                <TableCell>{item.tier_name || '-'}</TableCell>
                <TableCell><Chip size="small" label={item.result} sx={{ bgcolor: resultStyle.bg, color: resultStyle.color, fontWeight: 900 }} /></TableCell>
                <TableCell>{formatDate(mode === 'progress' ? item.started_at : item.completed_at)}</TableCell>
                <TableCell align="right">
                  {mode === 'progress' && canEditInspections ? (
                    <Button startIcon={<AssignmentTurnedInIcon />} variant="contained" onClick={() => setReportInspection(item)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                      Fill Report
                    </Button>
                  ) : mode === 'progress' ? (
                    <Chip size="small" label="View only" sx={{ fontWeight: 900 }} />
                  ) : (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button size="small" startIcon={<AssessmentIcon />} variant="outlined" onClick={() => setViewReport(item)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                        Report
                      </Button>
                      <Chip label={item.invoice?.invoice_number || 'Invoice pending'} sx={{ fontWeight: 900 }} />
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderBatchRows = (items: InspectionBatch[], loading: boolean, mode: 'progress' | 'completed' = 'progress') => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Work Order</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Assets</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Progress</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>{mode === 'completed' ? 'Completed' : 'Started'}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={6}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No {mode === 'completed' ? 'completed' : 'in progress'} inspection batches.</TableCell></TableRow>
          ) : items.map(batch => {
            const done = batch.completed_count || 0
            const total = batch.asset_count || 0
            return (
              <TableRow key={batch.id} hover>
                <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{batch.batch_number}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{batch.facility_name || '-'}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{total} asset{total === 1 ? '' : 's'}</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>{batch.inspection_frequency || 'instant'} inspection batch</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={`${done} completed of ${total}`}
                    sx={{ bgcolor: '#EEF2FF', color: '#4F46E5', fontWeight: 900 }}
                  />
                </TableCell>
                <TableCell>{formatDate(mode === 'completed' ? batch.completed_at : (batch.started_at || batch.scheduled_date))}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {mode === 'completed' && (
                      <>
                        <Tooltip title="Print All Reports">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                const detail = await fetchInspectionBatch(batch.id)
                                printBatchReport(detail)
                              } catch { toast.error('Could not load batch') }
                            }}
                            sx={{ bgcolor: '#EEF2FF', color: '#4F46E5', '&:hover': { bgcolor: '#E0E7FF' } }}
                          >
                            <AssessmentIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Print All Invoices">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                const detail = await fetchInspectionBatch(batch.id)
                                printBatchInvoices(detail)
                              } catch { toast.error('Could not load batch') }
                            }}
                            sx={{ bgcolor: '#F0FDF4', color: '#059669', '&:hover': { bgcolor: '#DCFCE7' } }}
                          >
                            <PrintIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Print Batch Summary Invoice">
                          <IconButton
                            size="small"
                            onClick={async () => {
                              try {
                                const detail = await fetchInspectionBatch(batch.id)
                                printBatchSummaryInvoice(detail)
                              } catch { toast.error('Could not load batch') }
                            }}
                            sx={{ bgcolor: '#FFF7ED', color: '#D97706', '&:hover': { bgcolor: '#FEF3C7' } }}
                          >
                            <ReceiptLongIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    <Button
                      startIcon={<AssessmentIcon />}
                      variant="contained"
                      onClick={() => setSelectedBatchId(batch.id)}
                      sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}
                    >
                      {mode === 'completed' ? 'View' : 'View Batch'}
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderUpcomingRows = () => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Frequency</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Criticality</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Requirement</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Scheduled</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {upcomingQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
          )) : (upcomingQ.data?.items || []).length === 0 ? (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No upcoming inspections scheduled.</TableCell></TableRow>
          ) : upcomingQ.data!.items.map(item => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{item.inspection_number}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{item.facility_name || '-'}</TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.asset_name || '-'}</Typography>
                <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>{item.serial_number || '-'}</Typography>
              </TableCell>
              <TableCell>{(item.inspection_frequency || 'annual').replace('_', '-')}</TableCell>
              <TableCell><Chip size="small" label={item.criticality || 'standard'} sx={{ fontWeight: 900 }} /></TableCell>
              <TableCell sx={{ maxWidth: 260 }}>{item.compliance_requirement || '-'}</TableCell>
              <TableCell>{formatDate(item.scheduled_date)}</TableCell>
              <TableCell align="right">
                {canEditInspections ? (
                  <Button startIcon={<PlayArrowIcon />} variant="contained" onClick={() => startMut.mutate(item.id)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                    Start
                  </Button>
                ) : (
                  <Chip size="small" label="View only" sx={{ fontWeight: 900 }} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderFixedInspectionTable = () => {
    const leftChecks = ['physical_inspection', 'display', 'functional', 'electrical_safety', 'battery', 'pm_kit'].map(key => [key, CHECK_FIELD_LABELS[key]] as [string, string])
    const rightChecks = ['cleaning', 'lubrication', 'calibration'].map(key => [key, CHECK_FIELD_LABELS[key]] as [string, string])
    const maxRows = 6
    return (
      <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
        <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1.5 }}>Inspection Report</Typography>
        <TableContainer sx={{ border: '1px solid #D8DEE9', borderRadius: '10px' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Test', 'Pass', 'Fail', 'N/A', 'Test', 'Pass', 'Fail', 'N/A'].map(header => (
                  <TableCell key={header} align="center" sx={{ fontWeight: 900 }}>{header}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: maxRows }).map((_, index) => {
                const left = leftChecks[index]
                const right = rightChecks[index]
                return (
                  <TableRow key={index} sx={{ bgcolor: index % 2 ? '#fff' : '#F3F4F6' }}>
                    <TableCell align="center">{left?.[1] || ''}</TableCell>
                    {['pass', 'fail', 'na'].map(value => (
                      <TableCell key={`left-${value}`} align="center">
                        {left && <Radio checked={report.checks?.[left[0]] === value} onChange={() => updateReport('checks', left[0], value)} size="small" />}
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      {right?.[1] || (index === 3 ? 'Set:' : index === 4 || index === 5 ? 'Replaced on' : '')}
                    </TableCell>
                    {right ? ['pass', 'fail', 'na'].map(value => (
                      <TableCell key={`right-${value}`} align="center">
                        <Radio checked={report.checks?.[right[0]] === value} onChange={() => updateReport('checks', right[0], value)} size="small" />
                      </TableCell>
                    )) : (
                      <>
                        <TableCell align="center">
                          {index >= 3 && (
                            <TextField size="small" value={report.measurements?.[index - 3]?.set_value || ''} onChange={e => updateArrayReport('measurements', index - 3, 'set_value', e.target.value)} />
                          )}
                        </TableCell>
                        <TableCell align="center">{index === 3 ? 'Read:' : index === 4 || index === 5 ? 'Due' : ''}</TableCell>
                        <TableCell align="center">
                          {index >= 3 && (
                            <TextField size="small" value={report.measurements?.[index - 3]?.read_value || ''} onChange={e => updateArrayReport('measurements', index - 3, 'read_value', e.target.value)} />
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    )
  }

  const renderCustomGridReport = () => {
    const grid = activeReportSchema?.custom_grid || report?.custom_grid
    if (!grid) return null
    const values = report?.custom_grid_values || {}
    const title = activeReportSchema?.title || report?.form_template?.name || selectedReportFormName()
    return (
      <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EDE9FE', boxShadow: 'none' }}>
        <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{title || 'Custom Inspection Form'}</Typography>
        <Typography sx={{ fontWeight: 900, color: '#4F46E5', mb: 1.5, mt: 1 }}>{grid.title || 'Set Title'}</Typography>
        <TableContainer sx={{ border: '1px solid #D8DEE9', borderRadius: '10px' }}>
          <Table size="small">
            <TableBody>
              {grid.cells.map((row: GridCellSchema[], rowIndex: number) => (
                <TableRow key={rowIndex} sx={{ bgcolor: rowIndex % 2 ? '#fff' : '#F3F4F6' }}>
                  {row.map((cell: GridCellSchema) => (
                    <TableCell key={cell.id} align="center" sx={{ minWidth: 180 }}>
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{cell.label || 'Question'}</Typography>
                        {cell.type === 'input' ? (
                          <TextField size="small" fullWidth value={values[cell.id] || ''} onChange={e => updateReportGridValue(cell.id, e.target.value)} />
                        ) : (
                          <RadioGroup row value={values[cell.id] || ''} onChange={e => updateReportGridValue(cell.id, e.target.value)} sx={{ justifyContent: 'center' }}>
                            {(cell.options?.length ? cell.options : ['Yes', 'No']).map((option: string) => (
                              <FormControlLabel key={option} value={option} control={<Radio size="small" />} label={option} />
                            ))}
                          </RadioGroup>
                        )}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    )
  }

  const renderBiomedNotes = () => (
    <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
      <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1.5 }}>Biomed Notes</Typography>
      <TableContainer sx={{ border: '1px solid #D8DEE9', borderRadius: '10px' }}>
        <Table size="small">
          <TableBody>
            {[
              ['reported_problem', 'Reported Problem'],
              ['problem_found', 'Problem Found'],
              ['corrective_action_taken', 'Corrective action taken'],
              ['summary', 'Summary'],
            ].map(([key, label]) => (
              <TableRow key={key}>
                <TableCell sx={{ width: 280, fontWeight: 900 }}>{label}</TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={report.diagnostics?.[key] || ''}
                    onChange={e => updateReport('diagnostics', key, e.target.value)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  )

  const renderDefaultReportCore = () => (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        {Object.entries(report.identity || {}).map(([key, value]) => (
          <TextField key={key} label={labelFromKey(key)} value={value as string} onChange={e => updateReport('identity', key, e.target.value)} size="small" />
        ))}
      </Box>
      <Divider />
      <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Checks</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {CHECK_FIELDS.map(([key, label]) => (
          <Card key={key} sx={{ p: 1.5, borderRadius: '14px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 13, mb: 0.5 }}>{label}</Typography>
            <RadioGroup row value={report.checks?.[key] || 'pass'} onChange={e => updateReport('checks', key, e.target.value)}>
              <FormControlLabel value="pass" control={<Radio size="small" />} label="Pass" />
              <FormControlLabel value="fail" control={<Radio size="small" />} label="Fail" />
              <FormControlLabel value="na" control={<Radio size="small" />} label="N/A" />
            </RadioGroup>
          </Card>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
        {Object.entries(report.diagnostics || {}).map(([key, value]) => (
          <TextField key={key} label={labelFromKey(key)} value={value as string} onChange={e => updateReport('diagnostics', key, e.target.value)} multiline rows={key === 'summary' ? 3 : 2} />
        ))}
      </Box>
    </>
  )

  const isCustomGridReport = () => reportFormSource === 'custom' || (reportFormSource === 'attached' && Boolean(activeReportSchema?.custom_grid))

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '24px', border: '1px solid #E6E8F2', background: 'linear-gradient(135deg, #F8FAFF 0%, #F5F3FF 100%)', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#1E1B4B', fontWeight: 900 }}>Inspection Module</Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Schedule equipment compliance inspections, initiate on-demand checks, complete technician reports, and prepare billing.</Typography>
          </Box>
          <Avatar sx={{ bgcolor: '#EFE7FF', color: '#7C3AED', width: 58, height: 58, borderRadius: '18px' }}><AssignmentTurnedInIcon /></Avatar>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Upcoming', stats.upcoming, <EventAvailableIcon />, '#2563EB')}
        {renderKpi('Assets', stats.instantItems, <BoltIcon />, '#7C3AED')}
        {renderKpi('In Progress', stats.inProgress, <BuildIcon />, '#F59E0B')}
        {renderKpi('Completed', stats.completed, <CheckCircleIcon />, '#059669')}
        {renderKpi('Quotations', stats.quotations, <ReceiptLongIcon />, '#2563EB')}
      </Box>

      <Card sx={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<EventAvailableIcon />} iconPosition="start" label="Upcoming" />
          <Tab icon={<BoltIcon />} iconPosition="start" label="Instant Inspection" />
          <Tab icon={<BuildIcon />} iconPosition="start" label="In Progress" />
          <Tab icon={<CheckCircleIcon />} iconPosition="start" label="Completed" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Inspection Quotations" />
          <Tab icon={<AssignmentTurnedInIcon />} iconPosition="start" label="Inspection Forms" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px 180px auto auto' }, gap: 2, alignItems: 'center', mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Facility</InputLabel>
                <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value as number); setSelectedInstantEquipmentIds([]); setSelectedEquipmentIds([]) }}>
                  {(facilitiesQ.data || []).map(f => (
                    <MenuItem key={f.id} value={f.id}>{f.name} - {f.tier_name || 'No tier'}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField select label="Frequency" value={frequency} onChange={e => setFrequency(e.target.value as InspectionFrequency)}>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="semi_annual">Semi-Annual</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </TextField>
              <TextField label="Schedule Date" type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <Button startIcon={<EventAvailableIcon />} variant="outlined" onClick={scheduleSelected} disabled={!canAddInspections || !facilityId || scheduleMut.isPending} sx={{ height: 54, borderRadius: '14px', fontWeight: 900, textTransform: 'none' }}>
                Schedule {selectedEquipmentIds.length || 'All'}
              </Button>
              <Button startIcon={<AutoFixHighIcon />} variant="contained" disabled={!canAddInspections || generateMut.isPending} onClick={() => {
                if (!canAddInspections) return toast.error('You do not have permission to auto-generate inspections')
                generateMut.mutate({ facility_id: facilityId ? Number(facilityId) : undefined, days_ahead: 90 })
              }} sx={{ height: 54, borderRadius: '14px', fontWeight: 900, textTransform: 'none' }}>
                Auto Generate
              </Button>
            </Box>
            <TableContainer className="list-scroll-panel" sx={{ mb: 3, border: '1px solid #EEF0F6', borderRadius: '18px' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 900 }}>Asset Tag</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Modality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Criticality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Serial #</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {equipmentQ.isLoading ? <TableRow><TableCell colSpan={6}><Skeleton /></TableCell></TableRow> : equipment.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: '#6B7280', fontWeight: 700 }}>Select a facility to schedule equipment inspections.</TableCell></TableRow>
                  ) : equipment.map((item: InspectionEquipmentItem) => (
                    <TableRow key={item.id} hover onClick={() => toggleEquipment(item.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={selectedEquipmentIds.includes(item.id)} /></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.asset_tag}</TableCell>
                      <TableCell>{item.make} {item.model}</TableCell>
                      <TableCell>{item.modality_name || '-'}</TableCell>
                      <TableCell>{item.criticality}</TableCell>
                      <TableCell>{item.serial_number}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Card sx={{ p: 2, mb: 2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 220px' }, gap: 2, alignItems: 'center' }}>
                <TextField
                  label="Search upcoming inspections"
                  placeholder="Search inspection #, facility, asset, serial, requirement..."
                  value={upcomingSearch}
                  onChange={e => setUpcomingSearch(e.target.value)}
                  fullWidth
                />
                <TextField
                  select
                  label="Due within"
                  value={upcomingRange}
                  onChange={e => setUpcomingRange(e.target.value as UpcomingDateRange)}
                >
                  {UPCOMING_DATE_RANGES.map(option => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </TextField>
              </Box>
              <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 700, mt: 1 }}>
                Showing inspections scheduled from {formatDate(upcomingWindow.date_from)} to {formatDate(upcomingWindow.date_to)}.
              </Typography>
            </Card>
            {renderUpcomingRows()}
            {renderPagination(upcomingQ.data?.total || 0, upcomingPage, setUpcomingPage)}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center', mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Facility</InputLabel>
                <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value as number); setSelectedInstantEquipmentIds([]); setSelectedEquipmentIds([]) }}>
                  {(facilitiesQ.data || []).map(f => (
                    <MenuItem key={f.id} value={f.id}>{f.name} - {f.tier_name || 'No tier'} - {f.inventory_count} asset(s)</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField select label="Frequency" value={frequency} onChange={e => setFrequency(e.target.value as InspectionFrequency)} sx={{ minWidth: 180 }}>
                <MenuItem value="instant">Instant</MenuItem>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="semi_annual">Semi-Annual</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </TextField>
              <Button
                startIcon={createMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <PlayArrowIcon />}
                variant="contained"
                onClick={startInspection}
                disabled={!canInitiateInspections || !facilityId || createMut.isPending}
                sx={{ height: 54, borderRadius: '14px', px: 3, fontWeight: 900, textTransform: 'none', background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
              >
                Start {selectedInstantEquipmentIds.length || 'All'} Inspection{selectedInstantEquipmentIds.length === 1 ? '' : 's'}
              </Button>
            </Box>
            {selectedFacility && (
              <Typography sx={{ mb: 2, color: '#6B7280', fontWeight: 800 }}>
                {selectedFacility.name}: select assets or leave all unchecked to inspect all facility assets.
              </Typography>
            )}
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 900 }}>Asset Tag</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Modality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Serial #</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Tier</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {equipmentQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton /></TableCell></TableRow>
                  )) : equipment.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>Select a facility with assets.</TableCell></TableRow>
                  ) : equipment.map((item: InspectionEquipmentItem) => (
                    <TableRow key={item.id} hover onClick={() => toggleInstantEquipment(item.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={selectedInstantEquipmentIds.includes(item.id)} /></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.asset_tag}</TableCell>
                      <TableCell>{item.make} {item.model}</TableCell>
                      <TableCell>{item.modality_name || '-'}</TableCell>
                      <TableCell>{item.serial_number || '-'}</TableCell>
                      <TableCell>{item.tier_name || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tab === 2 && (
          <Box>
            {renderBatchRows(inProgressBatchesQ.data?.items || [], inProgressBatchesQ.isLoading)}
            {renderPagination(inProgressBatchesQ.data?.total || 0, inProgressBatchPage, setInProgressBatchPage)}
            {(inProgressQ.data?.total || 0) > 0 && (
              <Box sx={{ borderTop: '1px solid #EEF0F6' }}>
                <Typography sx={{ px: 3, pt: 2, pb: 1, color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                  Legacy Individual Inspections
                </Typography>
                {renderInspectionRows(legacyInProgress, inProgressQ.isLoading, 'progress')}
                {renderPagination(inProgressQ.data?.total || 0, legacyInProgressPage, setLegacyInProgressPage)}
              </Box>
            )}
          </Box>
        )}
        {tab === 3 && (
          <Box>
            {renderBatchRows(completedBatchesQ.data?.items || [], completedBatchesQ.isLoading, 'completed')}
            {renderPagination(completedBatchesQ.data?.total || 0, completedBatchPage, setCompletedBatchPage)}
            {(completedQ.data?.total || 0) > 0 && (
              <Box sx={{ borderTop: '1px solid #EEF0F6' }}>
                <Typography sx={{ px: 3, pt: 2, pb: 1, color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                  Legacy Individual Inspections
                </Typography>
                {renderInspectionRows(legacyCompleted, completedQ.isLoading, 'completed')}
                {renderPagination(completedQ.data?.total || 0, legacyCompletedPage, setLegacyCompletedPage)}
              </Box>
            )}
          </Box>
        )}

        {tab === 4 && (
          <Box>
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Asset / Part</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotationsQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
                )) : (quotationsQ.data?.items || []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspection quotations yet.</TableCell></TableRow>
                ) : quotationsQ.data!.items.map(invoice => {
                  const chip = statusChip(invoice.status)
                  const highlighted = highlightInvoiceId === invoice.id
                  return (
                    <TableRow
                      key={invoice.id}
                      id={`inspection-invoice-${invoice.id}`}
                      hover
                      sx={highlighted ? {
                        bgcolor: '#F5F3FF',
                        outline: '2px solid #7C3AED',
                        outlineOffset: '-2px',
                        '& td': { borderTop: '1px solid #DDD6FE', borderBottom: '1px solid #DDD6FE' },
                      } : undefined}
                    >
                      <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.inspection_number || '-'}</TableCell>
                      <TableCell>{invoice.facility_name || '-'}</TableCell>
                      <TableCell>{invoice.inventory_part_name || (invoice as any).asset_name || (invoice as any).equipment_name || '-'}</TableCell>
                      <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(invoice.total_amount)}</TableCell>
                      <TableCell><Chip size="small" label={invoice.status} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900 }} /></TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell align="right">
                        {highlighted && (
                          <Chip size="small" label="Selected from Billing" sx={{ mr: 1, bgcolor: '#EDE9FE', color: '#6D28D9', fontWeight: 900 }} />
                        )}
                        <Button startIcon={<PrintIcon />} variant="outlined" onClick={() => printInspectionInvoice(invoice)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900, mr: 1 }}>
                          Print
                        </Button>
                        {canEditInspections && (
                          <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setInvoiceEdit(invoice)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              </Table>
            </TableContainer>
            {renderPagination(quotationsQ.data?.total || 0, quotationPage, setQuotationPage)}
          </Box>
        )}

        {tab === 5 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button startIcon={<AddIcon />} variant="contained" onClick={openCreateFormBuilder} disabled={!canAddInspections} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                New Form
              </Button>
            </Box>
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell sx={{ fontWeight: 900 }}>Form</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Fields</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Tagged Asset Type</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {formsQ.isLoading ? Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton /></TableCell></TableRow>
                  )) : (formsQ.data?.items || []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspection forms found.</TableCell></TableRow>
                  ) : formsQ.data!.items.map((form: InspectionFormOption) => {
                    const schema = schemaForForm(form)
                    const grid = schema.custom_grid
                    const cellCount = grid ? grid.rows * grid.columns : 0
                    return (
                      <TableRow key={form.id} hover>
                        <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                          {form.name}
                          <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>
                            Fixed checklist + {grid ? `${grid.rows}x${grid.columns} custom grid` : 'no custom grid'} + Biomed Notes
                          </Typography>
                        </TableCell>
                        <TableCell>{form.description || '-'}</TableCell>
                        <TableCell><Chip size="small" label={`${cellCount} custom cell${cellCount === 1 ? '' : 's'}`} sx={{ fontWeight: 900 }} /></TableCell>
                        <TableCell sx={{ minWidth: 280 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={form.modality_id ?? ''}
                            onChange={(event) => formMut.mutate({
                              id: form.id,
                              modality_id: event.target.value ? Number(event.target.value) : null,
                            })}
                            disabled={!canEditInspections || formMut.isPending}
                          >
                            <MenuItem value="">General - available to all assets</MenuItem>
                            {assignableModalities.map((modality) => (
                              <MenuItem key={modality.id} value={modality.id}>{modality.name}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" startIcon={<EditIcon />} variant="outlined" onClick={() => openEditFormBuilder(form)} disabled={!canEditInspections} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Card>

      <Dialog open={Boolean(selectedBatchId)} onClose={() => setSelectedBatchId(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', fontWeight: 900, color: '#1E1B4B' }}>
          <Box>
            Inspection Batch
            <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
              {selectedBatch?.batch_number || 'Loading'} - {selectedBatch?.facility_name || ''}
            </Typography>
          </Box>
          {selectedBatch?.status !== 'completed' && canInitiateInspections && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setAddExistingAssetOpen(true)}
                sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}
              >
                Add Existing Inventory
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddAssetOpen(true)}
                sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900, bgcolor: '#10B981' }}
              >
                Add New Inventory
              </Button>
            </Box>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {batchDetailQ.isLoading ? (
            <Box sx={{ display: 'grid', gap: 1 }}>
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={44} />)}
            </Box>
          ) : selectedBatch ? (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Work Order</Typography>
                  <Typography sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{selectedBatch.batch_number}</Typography>
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Assets</Typography>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>{selectedBatch.asset_count}</Typography>
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Completed</Typography>
                  <Typography sx={{ color: '#059669', fontWeight: 900 }}>{selectedBatch.completed_count}</Typography>
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Technician</Typography>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>{selectedBatch.inspector_name || '-'}</Typography>
                </Card>
              </Box>

              <TableContainer className="list-scroll-panel">
                <Table stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                      <TableCell sx={{ fontWeight: 900 }}>Asset #</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Serial</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Tier</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Technician</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedBatch.assets || []).map(asset => {
                      const chip = statusChip(asset.status)
                      return (
                        <TableRow key={asset.id} hover>
                          <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{asset.asset_tag || asset.part_number || '-'}</TableCell>
                          <TableCell>{asset.serial_number || '-'}</TableCell>
                          <TableCell sx={{ fontWeight: 800 }}>{asset.asset_name || asset.equipment_name || '-'}</TableCell>
                          <TableCell>{asset.tier_name || '-'}</TableCell>
                          <TableCell>{asset.inspector_name || '-'}</TableCell>
                          <TableCell><Chip size="small" label={asset.status} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900 }} /></TableCell>
                          <TableCell align="right">
                            {selectedBatch.status === 'completed' ? (
                              <IconButton size="small" onClick={(event) => openAssetActions(event, asset)} sx={{ bgcolor: '#F4F1FF', color: '#7C3AED' }}>
                                <MoreVertIcon fontSize="small" />
                              </IconButton>
                            ) : (
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                                {canEditInspections && (
                                  <>
                                    <Button size="small" variant="contained" startIcon={<AssignmentTurnedInIcon />} onClick={() => setReportInspection(asset)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                                      Report Activity
                                    </Button>
                                    <Button size="small" variant="outlined" startIcon={<PersonIcon />} onClick={() => openTechnicianDialog(asset)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                                      Change Tech
                                    </Button>
                                  </>
                                )}
                                {canDeleteInspections && (
                                  <IconButton
                                    size="small"
                                    disabled={asset.status === 'completed' || removeBatchAssetMut.isPending}
                                    onClick={() => selectedBatch && removeBatchAssetMut.mutate({ batchId: selectedBatch.id, inspectionId: asset.id })}
                                    sx={{ bgcolor: '#FEE2E2', color: '#DC2626', '&:disabled': { bgcolor: '#F3F4F6' } }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Batch not found.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          {selectedBatch && (
            <>
              <Button
                startIcon={<AssessmentIcon />}
                variant="outlined"
                onClick={() => printBatchReport(selectedBatch)}
                disabled={!selectedBatch.assets?.length}
                sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
              >
                Print All Reports
              </Button>
              <Button
                startIcon={<PrintIcon />}
                variant="outlined"
                onClick={() => printBatchInvoices(selectedBatch)}
                disabled={!selectedBatch.assets?.some(a => a.invoice)}
                sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', color: '#059669', borderColor: '#059669', '&:hover': { borderColor: '#047857', bgcolor: '#F0FDF4' } }}
              >
                Print All Invoices
              </Button>
              <Button
                startIcon={<ReceiptLongIcon />}
                variant="outlined"
                onClick={() => printBatchSummaryInvoice(selectedBatch)}
                disabled={!selectedBatch.assets?.some(a => a.invoice)}
                sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', color: '#D97706', borderColor: '#D97706', '&:hover': { borderColor: '#B45309', bgcolor: '#FFF7ED' } }}
              >
                Print Batch Summary
              </Button>
            </>
          )}
          <Button onClick={() => setSelectedBatchId(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={assetActionAnchor} open={Boolean(assetActionAnchor)} onClose={closeAssetActions}>
        {canEditInspections && (
          <MenuItem
            onClick={() => {
              if (!assetActionItem) return
              setReportInspection(assetActionItem)
              closeAssetActions()
            }}
          >
            <AssignmentTurnedInIcon fontSize="small" sx={{ mr: 1 }} /> Report Activity
          </MenuItem>
        )}
        <MenuItem onClick={() => assetActionItem && handlePrintReport(assetActionItem)}>
          <AssessmentIcon fontSize="small" sx={{ mr: 1 }} /> Print Report
        </MenuItem>
        <MenuItem
          disabled={!assetActionItem?.invoice}
          onClick={() => {
            if (assetActionItem?.invoice) printInspectionInvoice(assetActionItem.invoice)
            closeAssetActions()
          }}
        >
          <ReceiptLongIcon fontSize="small" sx={{ mr: 1 }} /> Print Invoice
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(techEdit)} onClose={() => setTechEdit(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Change Technician</DialogTitle>
        <DialogContent dividers>
          <TextField
            select
            fullWidth
            label="Technician"
            value={selectedTechId}
            onChange={e => setSelectedTechId(e.target.value ? Number(e.target.value) : '')}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {batchTechnicians.map(user => (
              <MenuItem key={user.id} value={user.id}>{user.full_name || user.username} - {user.role}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTechEdit(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button onClick={saveTechnician} disabled={!canEditInspections || techMut.isPending} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addExistingAssetOpen} onClose={() => setAddExistingAssetOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Add Existing Inventory to Batch
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            Select assets from {selectedBatch?.facility_name || 'this facility'} that are not already part of this inspection batch.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Search facility assets"
            placeholder="Search asset #, make, model, serial, modality..."
            value={existingAssetSearch}
            onChange={e => setExistingAssetSearch(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TableContainer className="list-scroll-panel" sx={{ border: '1px solid #EEF0F6', borderRadius: '16px' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell padding="checkbox" />
                  <TableCell sx={{ fontWeight: 900 }}>Asset #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Modality</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Serial #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Criticality</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batchEquipmentQ.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}><TableCell colSpan={6}><Skeleton /></TableCell></TableRow>
                  ))
                ) : availableExistingBatchAssets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>
                      {batchEquipmentIds.size ? 'No remaining facility assets available for this batch.' : 'No facility assets found.'}
                    </TableCell>
                  </TableRow>
                ) : availableExistingBatchAssets.map((item: InspectionEquipmentItem) => (
                  <TableRow key={item.id} hover onClick={() => toggleExistingBatchEquipment(item.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell padding="checkbox"><Checkbox checked={selectedExistingEquipmentIds.includes(item.id)} /></TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.asset_tag}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{item.make} {item.model}</TableCell>
                    <TableCell>{item.modality_name || '-'}</TableCell>
                    <TableCell>{item.serial_number || '-'}</TableCell>
                    <TableCell><Chip size="small" label={item.criticality || 'standard'} sx={{ fontWeight: 900 }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddExistingAssetOpen(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            startIcon={addBatchExistingAssetsMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />}
            onClick={submitExistingBatchAssets}
            disabled={!canInitiateInspections || addBatchExistingAssetsMut.isPending || selectedExistingEquipmentIds.length === 0}
            variant="contained"
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            Add {selectedExistingEquipmentIds.length || ''} Asset{selectedExistingEquipmentIds.length === 1 ? '' : 's'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addAssetOpen} onClose={() => setAddAssetOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Add New Inventory to Batch</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, pt: 1 }}>
            <TextField label="Asset # *" value={batchAssetForm.asset_tag} onChange={e => setBatchAssetForm(prev => ({ ...prev, asset_tag: e.target.value }))} />
            <TextField label="Make *" value={batchAssetForm.make} onChange={e => setBatchAssetForm(prev => ({ ...prev, make: e.target.value }))} />
            <TextField label="Model *" value={batchAssetForm.model} onChange={e => setBatchAssetForm(prev => ({ ...prev, model: e.target.value }))} />
            <TextField label="Serial # *" value={batchAssetForm.serial_number} onChange={e => setBatchAssetForm(prev => ({ ...prev, serial_number: e.target.value }))} />
            <TextField
              select
              label="Modality *"
              value={batchAssetForm.modality_id || ''}
              onChange={e => setBatchAssetForm(prev => ({ ...prev, modality_id: Number(e.target.value) }))}
            >
              {assignableModalities.map(modality => (
                <MenuItem key={modality.id} value={modality.id}>{modality.name}</MenuItem>
              ))}
            </TextField>
            <TextField select label="PM Scheduling" value={batchAssetForm.pm_scheduling || 'annual'} onChange={e => setBatchAssetForm(prev => ({ ...prev, pm_scheduling: e.target.value }))}>
              <MenuItem value="quarterly">Quarterly</MenuItem>
              <MenuItem value="semi_annual">Semi-Annual</MenuItem>
              <MenuItem value="annual">Annual</MenuItem>
            </TextField>
            <TextField label="Location" value={batchAssetForm.location || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, location: e.target.value }))} />
            <TextField label="Risk Priority" value={batchAssetForm.risk_priority || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, risk_priority: e.target.value }))} />
            <TextField label="Risk Name" value={batchAssetForm.risk_name || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, risk_name: e.target.value }))} />
            <TextField label="Last PM Date" type="date" value={batchAssetForm.last_pm_date || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, last_pm_date: e.target.value || null }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Installation Date" type="date" value={batchAssetForm.installation_date || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, installation_date: e.target.value || null }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Inventory Date" type="date" value={batchAssetForm.inventory_date || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, inventory_date: e.target.value || null }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Description" value={batchAssetForm.description || ''} onChange={e => setBatchAssetForm(prev => ({ ...prev, description: e.target.value }))} multiline rows={3} sx={{ gridColumn: '1 / -1' }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddAssetOpen(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={addBatchAssetMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />} onClick={submitBatchAsset} disabled={!canInitiateInspections || addBatchAssetMut.isPending} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', bgcolor: '#10B981' }}>
            Add Asset
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={formBuilderOpen} onClose={() => setFormBuilderOpen(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          {formBuilderMode === 'create' ? 'Create Inspection Form' : formBuilderMode === 'report-custom' ? 'Customize Report Form' : 'Edit Inspection Form'}
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            The default Inspection Report and Biomed Notes stay fixed. Only the middle custom grid is generated and edited here.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: formBuilderMode === 'report-custom' ? '1fr 1.4fr' : '1fr 1.4fr 280px' }, gap: 2 }}>
              <TextField label="Form Title / Name" value={formBuilderName} onChange={e => setFormBuilderName(e.target.value)} />
              <TextField label="Description" value={formBuilderDescription} onChange={e => setFormBuilderDescription(e.target.value)} />
              {formBuilderMode !== 'report-custom' && (
                <TextField
                  select
                  label="Tagged Asset Type"
                  value={formBuilderModalityId ?? ''}
                  onChange={e => setFormBuilderModalityId(e.target.value ? Number(e.target.value) : null)}
                >
                  <MenuItem value="">General - available to all assets</MenuItem>
                  {assignableModalities.map((modality) => (
                    <MenuItem key={modality.id} value={modality.id}>{modality.name}</MenuItem>
                  ))}
                </TextField>
              )}
            </Box>

            <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Inspection Report</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
                Fixed default checklist: test rows, Pass / Fail / N/A radio buttons, Set / Read, Replaced On / Due.
              </Typography>
            </Card>

            <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EDE9FE', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1.5 }}>Middle Custom Grid</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700, mb: 1.5 }}>
                The form title/name identifies the saved template. The custom section title displays above this grid and can be different.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 160px 160px auto' }, gap: 1.5, alignItems: 'center', mb: 2 }}>
                <TextField
                  label="Custom Section Title"
                  value={formBuilderSchema.custom_grid?.title || 'Set Title'}
                  onChange={e => updateBuilderGridTitle(e.target.value)}
                />
                <NumericField label="Rows" value={formBuilderRows} onChange={val => setFormBuilderRows(Number(val || 1))} />
                <NumericField label="Columns" value={formBuilderColumns} onChange={val => setFormBuilderColumns(Number(val || 1))} />
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => setBuilderGrid(formBuilderRows, formBuilderColumns)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                  Add
                </Button>
              </Box>

              {!formBuilderSchema.custom_grid ? (
                <Card sx={{ p: 4, borderRadius: '14px', border: '1px dashed #C4B5FD', textAlign: 'center', boxShadow: 'none' }}>
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>Enter row and column count, then click Add to generate the editable grid.</Typography>
                </Card>
              ) : (
                <TableContainer sx={{ border: '1px solid #D8DEE9', borderRadius: '12px', maxHeight: 520 }}>
                  <Table size="small" stickyHeader>
                    <TableBody>
                      {formBuilderSchema.custom_grid.cells.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {row.map((cell, columnIndex) => (
                            <TableCell key={cell.id} sx={{ minWidth: 280, verticalAlign: 'top', bgcolor: rowIndex % 2 ? '#F8FAFC' : '#fff' }}>
                              <Box sx={{ display: 'grid', gap: 1 }}>
                                <TextField
                                  size="small"
                                  label={`Cell ${rowIndex + 1}.${columnIndex + 1} Title`}
                                  value={cell.label}
                                  onChange={e => updateGridCell(rowIndex, columnIndex, { label: e.target.value })}
                                />
                                <TextField
                                  select
                                  size="small"
                                  label="Cell Type"
                                  value={cell.type}
                                  onChange={e => updateGridCell(rowIndex, columnIndex, { type: e.target.value as GridCellType })}
                                >
                                  {GRID_CELL_TYPES.map(type => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                </TextField>
                                <Box sx={{ p: 1, borderRadius: '10px', bgcolor: '#F8FAFC', border: '1px dashed #CBD5E1' }}>
                                  <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 13, mb: 0.75 }}>{cell.label || 'Question'}</Typography>
                                  {cell.type === 'input' ? (
                                    <TextField size="small" disabled fullWidth />
                                  ) : (
                                    <Box sx={{ display: 'grid', gap: 1 }}>
                                      <RadioGroup row>
                                        {(cell.options?.length ? cell.options : ['Yes', 'No']).map(option => (
                                          <FormControlLabel key={option} value={option} control={<Radio size="small" disabled />} label={option} />
                                        ))}
                                      </RadioGroup>
                                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                                        {(cell.options?.length ? cell.options : ['Yes', 'No']).map((option, optionIndex) => (
                                          <Box key={`${cell.id}-option-${optionIndex}`} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                                            <TextField
                                              size="small"
                                              label={`Option ${optionIndex + 1}`}
                                              value={option}
                                              onChange={e => updateGridCellOption(rowIndex, columnIndex, optionIndex, e.target.value)}
                                            />
                                            <IconButton size="small" onClick={() => removeGridCellOption(rowIndex, columnIndex, optionIndex)} disabled={(cell.options || ['Yes', 'No']).length <= 1} sx={{ color: '#DC2626' }}>
                                              <RemoveIcon fontSize="small" />
                                            </IconButton>
                                          </Box>
                                        ))}
                                        <Button size="small" startIcon={<AddIcon />} onClick={() => addGridCellOption(rowIndex, columnIndex)} sx={{ justifySelf: 'start', borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}>
                                          Add Option
                                        </Button>
                                      </Box>
                                    </Box>
                                  )}
                                </Box>
                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                  <Tooltip title="Add cell after this one">
                                    <IconButton size="small" onClick={() => addGridCell(rowIndex, columnIndex)} sx={{ bgcolor: '#DCFCE7', color: '#16A34A', '&:hover': { bgcolor: '#BBF7D0' } }}>
                                      <AddIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove this cell">
                                    <IconButton size="small" onClick={() => removeGridCell(rowIndex, columnIndex)} sx={{ bgcolor: '#FEE2E2', color: '#DC2626', '&:hover': { bgcolor: '#FECACA' } }}>
                                      <RemoveIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>

            <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Biomed Notes</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
                Fixed default notes: Reported Problem, Problem Found, Corrective action taken, and Summary.
              </Typography>
            </Card>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setFormBuilderOpen(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            startIcon={formBuilderMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />}
            onClick={saveFormBuilder}
            disabled={!canEditInspections || formBuilderMut.isPending}
            variant="contained"
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            {formBuilderMode === 'report-custom' ? 'Apply Custom Form' : 'Save Form'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(reportInspection)} onClose={() => setReportInspection(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Technician Inspection Report
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            {reportInspection?.batch_number || reportInspection?.inspection_number} - {reportInspection?.asset_name || reportInspection?.equipment_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {report && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EDE9FE', bgcolor: '#FAF5FF' }}>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.5 }}>Report Activity Form</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700, mb: 1.5 }}>
                  Choose the form source for this inspection report. Custom forms can be saved for future assets.
                </Typography>
                <RadioGroup row value={reportFormSource} onChange={(event) => applyReportFormSource(event.target.value as ReportFormSource)}>
                  <FormControlLabel
                    value="default"
                    control={<Radio />}
                    label={`Default Form${defaultReportForm?.name ? ` - ${defaultReportForm.name}` : ''}`}
                  />
                  <FormControlLabel
                    value="attached"
                    disabled={!reportInspection?.attached_form_id}
                    control={<Radio />}
                    label={reportInspection?.attached_form_id ? `Asset Attached Form - ${reportInspection.attached_form_name}` : 'Asset Attached Form - none attached'}
                  />
                  <FormControlLabel value="custom" control={<Radio />} label="Customize Form" />
                </RadioGroup>
                {reportFormSource === 'custom' && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr auto' }, gap: 1.5, mt: 1.5, alignItems: 'center' }}>
                    <TextField size="small" label="Reusable Form Name" value={customFormName} onChange={e => setCustomFormName(e.target.value)} />
                    <TextField size="small" label="Description" value={customFormDescription} onChange={e => setCustomFormDescription(e.target.value)} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <FormControlLabel
                        control={<Checkbox checked={saveCustomForm} onChange={e => setSaveCustomForm(e.target.checked)} />}
                        label="Save to Inspection Forms"
                      />
                      <Button size="small" startIcon={<EditIcon />} variant="outlined" onClick={openReportCustomBuilder} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                        Edit Fields
                      </Button>
                      <Button
                        size="small"
                        startIcon={saveCustomTemplateMut.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
                        variant="contained"
                        onClick={() => saveCustomTemplateMut.mutate()}
                        disabled={saveCustomTemplateMut.isPending || !reportCustomSchema?.custom_grid}
                        sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}
                      >
                        Save Form Only
                      </Button>
                    </Box>
                  </Box>
                )}
              </Card>
              {isCustomGridReport() ? (
                <>
                  {renderFixedInspectionTable()}
                  {renderCustomGridReport()}
                  {renderBiomedNotes()}
                </>
              ) : renderDefaultReportCore()}
              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Operational Report Details</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Measurements</Typography>
                  {(report.measurements || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 0.8fr 0.6fr 0.8fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Measurement" value={item.name} onChange={e => updateArrayReport('measurements', index, 'name', e.target.value)} />
                      <TextField size="small" label="Set" value={item.set_value} onChange={e => updateArrayReport('measurements', index, 'set_value', e.target.value)} />
                      <TextField size="small" label="Read" value={item.read_value} onChange={e => updateArrayReport('measurements', index, 'read_value', e.target.value)} />
                      <TextField size="small" label="Unit" value={item.unit} onChange={e => updateArrayReport('measurements', index, 'unit', e.target.value)} />
                      <TextField size="small" select label="Status" value={item.status} onChange={e => updateArrayReport('measurements', index, 'status', e.target.value)}>
                        <MenuItem value="pass">Pass</MenuItem>
                        <MenuItem value="fail">Fail</MenuItem>
                      </TextField>
                    </Box>
                  ))}
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Photo Documentation</Typography>
                  {(report.photo_documentation || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Label" value={item.label} onChange={e => updateArrayReport('photo_documentation', index, 'label', e.target.value)} />
                      <TextField size="small" label="Photo URL / reference" value={item.url} onChange={e => updateArrayReport('photo_documentation', index, 'url', e.target.value)} />
                    </Box>
                  ))}
                </Card>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr' }, gap: 2 }}>
                <TextField select label="Certified" value={report.compliance?.certified || 'yes'} onChange={e => updateReport('compliance', 'certified', e.target.value)}>
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="conditional">Conditional</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </TextField>
                <TextField label="Compliance Standard" value={report.compliance?.standard || ''} onChange={e => updateReport('compliance', 'standard', e.target.value)} />
                <TextField label="Recommendations" value={report.compliance?.recommendations || ''} onChange={e => updateReport('compliance', 'recommendations', e.target.value)} />
              </Box>
              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Parts & Test Equipment</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  {(report.parts || []).map((part: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr 1fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Description" value={part.description} onChange={e => updateArrayReport('parts', index, 'description', e.target.value)} />
                      <TextField size="small" label="Part #" value={part.part_number} onChange={e => updateArrayReport('parts', index, 'part_number', e.target.value)} />
                      <NumericField size="small" label="Price" value={part.price} onChange={val => updateArrayReport('parts', index, 'price', val)} />
                      <TextField size="small" label="Condition" value={part.condition} onChange={e => updateArrayReport('parts', index, 'condition', e.target.value)} />
                    </Box>
                  ))}
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Autocomplete
                    multiple
                    options={testEquipmentQ.data?.items || []}
                    value={(testEquipmentQ.data?.items || []).filter((item) => (report.test_equipment || []).some((selected: any) => selected.id === item.id))}
                    onChange={(_, value) => setReport((prev: any) => ({ ...prev, test_equipment: value.map(testEquipmentSnapshot) }))}
                    getOptionLabel={(option) => `${option.tem}${option.serial_number ? ` - ${option.serial_number}` : ''}`}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    renderOption={(props, option) => (
                      <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar src={resolveUploadUrl(option.image_url)} variant="rounded" sx={{ width: 34, height: 34, bgcolor: '#F5F3FF', color: '#7C3AED' }}>
                          <AssessmentIcon fontSize="small" />
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 800 }}>{option.tem}</Typography>
                          <Typography variant="caption" sx={{ color: '#6B7280' }}>
                            {[option.mrf, option.model, option.serial_number].filter(Boolean).join(' / ') || 'No details'}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField {...params} size="small" label="Select Test Equipment" placeholder="Attach used equipment" />
                    )}
                    sx={{ mb: 1.5 }}
                  />
                  {(report.test_equipment || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Description" value={item.description} onChange={e => updateArrayReport('test_equipment', index, 'description', e.target.value)} />
                      <TextField size="small" label="Make" value={item.make} onChange={e => updateArrayReport('test_equipment', index, 'make', e.target.value)} />
                      <TextField size="small" label="SN #" value={item.serial_number} onChange={e => updateArrayReport('test_equipment', index, 'serial_number', e.target.value)} />
                    </Box>
                  ))}
                </Card>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <NumericField label="Parts" value={report.billing.parts} onChange={val => updateReport('billing', 'parts', val)} />
                <NumericField label="Inspection Charges" value={report.billing.inspection_charges} onChange={val => updateReport('billing', 'inspection_charges', val)} />
                <NumericField label="Others" value={report.billing.others} onChange={val => updateReport('billing', 'others', val)} />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                {Object.entries(report.dates || {}).map(([key, value]) => (
                  <TextField key={key} label={labelFromKey(key)} type={key.includes('date') ? 'date' : 'text'} value={value as string} onChange={e => updateReport('dates', key, e.target.value)} InputLabelProps={{ shrink: true }} />
                ))}
              </Box>
              <TextField
                select
                label="Report Status"
                value={reportStatus}
                onChange={e => setReportStatus(e.target.value as 'completed' | 'in_progress')}
                sx={{ maxWidth: 260 }}
              >
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
              </TextField>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReportInspection(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={reportMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />} onClick={submitReport} disabled={!canEditInspections || reportMut.isPending} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            {reportStatus === 'completed' ? 'Complete & Generate Invoice' : 'Save as In Progress'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewReport)} onClose={() => setViewReport(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Inspection Report
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            {viewReport?.inspection_number} - {viewReport?.asset_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {viewReport?.form_data ? (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Result</Typography>
                  <Chip label={viewReport.result} sx={{ mt: 1, fontWeight: 900, ...statusChip(viewReport.result) }} />
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Certification</Typography>
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>{viewReport.form_data.compliance?.certified || '-'}</Typography>
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Invoice</Typography>
                  <Typography sx={{ color: '#059669', fontWeight: 900 }}>{viewReport.invoice?.invoice_number || 'Pending'}</Typography>
                </Card>
              </Box>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Summary</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.form_data.diagnostics?.summary || '-'}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Corrective Action</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.corrective_actions || viewReport.form_data.diagnostics?.corrective_action_taken || '-'}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Recommendations</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.form_data.compliance?.recommendations || '-'}</Typography>
            </Box>
          ) : (
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>No report data available.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => viewReport && printInspectionReport(viewReport)} variant="outlined" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Print Report</Button>
          <Button onClick={() => setViewReport(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(invoiceEdit)} onClose={() => setInvoiceEdit(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Edit Inspection Invoice</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}>
            {['subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'amount_paid'].map(key => (
              <NumericField key={key} label={key.replace(/_/g, ' ')} value={Number(invoiceForm[key] ?? 0)} onChange={val => setInvoiceForm((prev: any) => ({ ...prev, [key]: val }))} />
            ))}
            <NumericField
              label="Travel Charges ($)"
              value={Number(invoiceForm.travel_charges ?? 0)}
              onChange={val => setInvoiceForm((prev: any) => ({ ...prev, travel_charges: val }))}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <NumericField
              label="Service Charges ($)"
              value={Number(invoiceForm.service_charges ?? 0)}
              onChange={val => setInvoiceForm((prev: any) => ({ ...prev, service_charges: val }))}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField label="Due date" type="date" value={invoiceForm.due_date || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField select label="Status" value={invoiceForm.status || 'pending'} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, status: e.target.value }))}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="partially_paid">Partially Paid</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
            <TextField label="Payment terms" value={invoiceForm.payment_terms || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, payment_terms: e.target.value }))} />
            <TextField label="Notes" value={invoiceForm.notes || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, notes: e.target.value }))} multiline rows={3} sx={{ gridColumn: '1 / -1' }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setInvoiceEdit(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={invoiceMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />} onClick={saveInvoice} disabled={!canEditInspections || invoiceMut.isPending} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Save Invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Inspections
