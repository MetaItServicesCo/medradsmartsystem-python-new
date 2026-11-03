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
import { buildInspectionFormHtml, buildInspectionSingleReportHtml } from './.build/inspectionReportHtml.mjs'

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
ok('an app-built grid form prints the built-in table the screen shows above it, then its answers',
  hasStandardTable(appPrinted) && appPrinted.includes('EKG Cable')
  && appPrinted.indexOf('Replaced on') < appPrinted.indexOf('EKG Cable'))
ok('a standard report prints the standard table as before', hasStandardTable(print({ form_data: { checks: { cleaning: 'pass' } } })))

// ── Battery / PM Kit "Replaced on / Due" ───────────────────────────────────
const typed = print({
  form_schema: appGrid,
  form_data: {
    checks: {},
    measurements: [
      { name: 'Electrical leakage', set_value: '0.5', read_value: '0.2', unit: 'mA' },
      { name: 'Functional test', set_value: '2026-01-10', read_value: '2028-01-10' },
      { set_value: '2026-02-01', read_value: '2027-02-01' },
    ],
  },
})
ok('Battery dates typed in the built-in table print', typed.includes('2026-01-10') && typed.includes('2028-01-10'))
ok('PM Kit dates typed in the built-in table print', typed.includes('2026-02-01') && typed.includes('2027-02-01'))
ok('the Set / Read reading prints', typed.includes('<b>0.5</b>') && typed.includes('0.2 mA'))
const standardLayout = print({
  form_data: { checks: {}, measurements: [
    { name: 'Electrical leakage', set_value: '', read_value: '' },
    { name: 'Functional test', set_value: 'OK', read_value: 'OK' },
  ] },
})
ok('in the standard layout an ordinary measurement is not printed as Battery dates', !standardLayout.includes('<b>OK</b>'))
const migratedFields = print({ form_schema: legacyGrid, form_data: { checks: {}, battery: { replaced_on: '2025-05-05', due: '2026-05-05' } } })
ok('migrated Battery dates print from where the migration stored them', migratedFields.includes('2025-05-05') && migratedFields.includes('2026-05-05'))

// ── A blank form: the canvas section spans the page like the fixed sections ─
// The Inspection Report and Biomed Notes print the full page width (736px), so
// the canvas is scaled to exactly that width, up or down, with its box given
// the scaled height.
const blankForm = width => buildInspectionFormHtml({ name: 'Form', schema: { version: 5, canvas_form: {
  canvas_width: width, canvas_height: 200,
  elements: [{ id: 'h', type: 'heading', label: 'Section', x: 0, y: 0, width: 200, height: 30 }],
} } })
const narrow = blankForm(368)
ok('a canvas narrower than the page is scaled up to the page width', narrow.includes('width:368px') && narrow.includes('transform:scale(2.0000)'))
ok('its box is the scaled height, so nothing is cut off', narrow.includes('width:100%;height:400px;overflow:hidden'))
const wide = blankForm(1080)
ok('a canvas wider than the page is scaled down to the page width', wide.includes('transform:scale(0.6815)'))
ok('its box is the scaled height, so no white space is left under it', wide.includes('width:100%;height:137px;overflow:hidden'))
const page = blankForm(736)
ok('a canvas at page width prints at its real size', page.includes('transform:scale(1.0000)') && page.includes('width:100%;height:200px;overflow:hidden'))
ok('the fixed sections still print around it', page.includes('Inspection Report') && page.includes('Biomed Notes'))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All printed report checks passed')
