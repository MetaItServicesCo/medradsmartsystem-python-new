/**
 * Checks for the inspection section of a printed report.
 *
 * Two failures this pins down. A filled canvas form printed without any of
 * its answers, only the blank standard table. And the migrated legacy forms,
 * whose nine standard checks moved out of the form into the report's own
 * table, would have printed without those checks, because a custom form
 * printed instead of the standard table, never alongside it. Everything else
 * must print exactly as before.
 *
 *   cd frontend
 *   node tests/run-inspectionReportHtml.mjs
 */
import { buildInspectionSingleReportHtml } from './.build/inspectionReportHtml.mjs'

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const base = { id: 1, inspection_number: 'INSP-1', asset_name: 'Pump', status: 'completed', result: 'pass' }
const print = inspection => buildInspectionSingleReportHtml({ ...base, ...inspection }, null)
// The standard nine-check table is the only place "Replaced on" is printed.
const hasStandardTable = html => html.includes('Replaced on')

// ── A canvas form ───────────────────────────────────────────────────────────
const canvasSchema = {
  version: 5,
  canvas_form: {
    canvas_width: 1080,
    canvas_height: 600,
    elements: [
      { id: 'h', type: 'heading', label: 'Battery Section', x: 0, y: 0, width: 400, height: 30 },
      { id: 'r1', type: 'radio', label: 'Charger Test', options: ['Pass', 'Fail', 'N/A'], x: 0, y: 40, width: 300, height: 60 },
      { id: 'v1', type: 'input', label: 'Battery Voltage', x: 320, y: 40, width: 300, height: 60 },
      { id: 'c1', type: 'checkbox', label: 'Accessories', options: ['Cable', 'Probe'], x: 0, y: 120, width: 300, height: 60 },
      {
        id: 't1', type: 'table', x: 0, y: 200, width: 600, height: 120, headerRow: true,
        cells: [
          [{ id: 'th1', type: 'label', label: 'Test' }, { id: 'th2', type: 'label', label: 'Pass' }],
          [{ id: 'tc1', type: 'label', label: 'Leak Check' }, { id: 'tc2', type: 'radio' }],
          [{ id: 'tc3', type: 'label', label: 'Reading' }, { id: 'tc4', type: 'input' }],
        ],
      },
      { id: 's1', type: 'signature', label: 'Signature', x: 0, y: 340, width: 300, height: 60 },
    ],
  },
}
const filled = print({
  form_schema: canvasSchema,
  form_data: {
    checks: { physical_inspection: 'pass' },
    canvas_values: { r1: 'Fail', v1: '12.4 V', c1: ['Cable', 'Probe'], tc2: true, tc4: '0.3 mA' },
  },
})
ok('a filled canvas form prints its answers', filled.includes('Charger Test') && filled.includes('Fail') && filled.includes('12.4 V'))
ok('  checkbox answers print as the chosen options', filled.includes('Cable, Probe'))
ok('  table cells print with their answers', filled.includes('Leak Check') && filled.includes('0.3 mA') && filled.includes('dot on'))
ok('  headings keep the form\'s sections', filled.includes('Battery Section'))
ok('  in reading order, heading before its questions', filled.indexOf('Battery Section') < filled.indexOf('Charger Test'))
ok('  and the standard table still prints, as it always did', hasStandardTable(filled))
ok('  the signature box is not printed as an empty answer', !filled.includes('>Signature<'))

const unanswered = print({ form_schema: canvasSchema, form_data: { checks: {} } })
ok('a canvas form with nothing answered prints as before: just the standard table',
  hasStandardTable(unanswered) && !unanswered.includes('Charger Test'))

// ── A migrated legacy form ──────────────────────────────────────────────────
const legacyGrid = {
  source: 'legacy_pm_desc',
  custom_grid: {
    title: 'Patient Monitor1', columns: 2,
    cells: [[
      { id: 'item_101', type: 'text', blocks: [{ id: 'ans', type: 'radio', label: 'EKG Cable', options: ['Pass', 'Fail', 'N/A'] }] },
      { id: 'item_id_incolumn3611', type: 'text', blocks: [{ id: 'ans', type: 'input', label: 'EKG Set – Actual' }] },
    ]],
  },
}
const migrated = print({
  form_schema: legacyGrid,
  form_data: {
    checks: { physical_inspection: 'fail' },
    custom_grid_values: { item_101__ans: 'Pass', item_id_incolumn3611__ans: '72 bpm' },
  },
})
ok('a migrated form prints the standard checks it moved to the report\'s table', hasStandardTable(migrated))
ok('  and its device-specific answers', migrated.includes('EKG Cable') && migrated.includes('72 bpm'))

// ── Unchanged ───────────────────────────────────────────────────────────────
const appGrid = { ...legacyGrid, source: 'medrad_grid_form_builder' }
const appPrinted = print({
  form_schema: appGrid,
  form_data: { checks: {}, custom_grid_values: { item_101__ans: 'Pass' } },
})
ok('an app-built grid form prints exactly as before: its own answers only',
  appPrinted.includes('EKG Cable') && !hasStandardTable(appPrinted))
ok('a standard report prints the standard table as before', hasStandardTable(print({ form_data: { checks: { cleaning: 'pass' } } })))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All printed report checks passed')
