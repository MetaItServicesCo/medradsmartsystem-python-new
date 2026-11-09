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
// The Inspection Report and Biomed Notes print the full page width (736px). A
// wider canvas is scaled down to it; a narrower one is spread across it, its
// fields widened and moved in proportion and its text left at normal size.
const blankForm = width => buildInspectionFormHtml({ name: 'Form', schema: { version: 5, canvas_form: {
  canvas_width: width, canvas_height: 200,
  elements: [{ id: 'h', type: 'heading', label: 'Section', x: 100, y: 0, width: 200, height: 30 }],
} } })
const narrow = blankForm(368)
ok('a canvas narrower than the page is spread to the page width, not enlarged',
  narrow.includes('width:736px;height:200px;transform:scale(1.0000)'))
ok('its fields are widened and moved in proportion, at their own height',
  narrow.includes('left:200px;top:0px;width:400px;min-height:30px'))
const wide = blankForm(1080)
ok('a canvas wider than the page is scaled down to the page width', wide.includes('width:1080px;height:200px;transform:scale(0.6815)'))
ok('its box is the scaled height, so no white space is left under it', wide.includes('width:100%;height:137px;overflow:hidden'))
ok('its fields keep their built positions', wide.includes('left:100px;top:0px;width:200px'))
const page = blankForm(736)
ok('a canvas at page width prints at its real size', page.includes('width:736px;height:200px;transform:scale(1.0000)') && page.includes('left:100px;top:0px;width:200px'))
ok('the fixed sections still print around it', page.includes('Inspection Report') && page.includes('Biomed Notes'))

// ── A table with two items in a row ─────────────────────────────────────────
const twoItemCell = (id, type, label) => ({ id, type, ...(label ? { label } : {}) })
const twoItemSchema = {
  version: 5,
  canvas_form: {
    canvas_width: 736,
    canvas_height: 200,
    elements: [{
      id: 'fz', type: 'table', x: 0, y: 0, width: 736, height: 150, headerRow: true,
      cells: [
        ['Test', 'Pass', 'Fail', 'N/A', 'Test', 'Pass', 'Fail', 'N/A'].map((text, i) => twoItemCell(`fh${i}`, 'label', text)),
        [twoItemCell('n1', 'label', 'Door Gasket'), twoItemCell('p1', 'radio'), twoItemCell('f1', 'radio'), twoItemCell('x1', 'radio'),
          twoItemCell('n2', 'label', 'Defrost'), twoItemCell('p2', 'radio'), twoItemCell('f2', 'radio'), twoItemCell('x2', 'radio')],
      ],
    }],
  },
}
const marks = html => (html.match(/class="dot on"/g) || []).length
const twoItems = values => print({ form_schema: twoItemSchema, form_data: { canvas_values: values } })
const noAnswers = marks(twoItems({}))
const twoAnswers = twoItems({ f1: true, p2: true })
ok('a row with two items prints both names', twoAnswers.includes('Door Gasket') && twoAnswers.includes('Defrost'))
ok('  and both answers, each marked', marks(twoAnswers) === noAnswers + 2, `${noAnswers} then ${marks(twoAnswers)}`)

// ── The cost on the Billing Page ────────────────────────────────────────────
const billingPage = html => html.slice(html.indexOf('Billing Page'))
const amounts = html => billingPage(html).match(/\$\d+\.\d\d/g) || []
const charged = (billing, extra = {}) => amounts(print({ form_data: { billing }, ...extra }))
ok('the Billing Page lists the asset', billingPage(print({ form_data: {} })).includes('Pump'))

const fromInvoice = charged({ parts: 0, inspection_charges: 0, others: 0 }, { invoice: { id: 9, total_amount: 250 } })
ok('with an invoice, its amount is shown: here the PM fee it billed', fromInvoice.every(a => a === '$250.00') && fromInvoice.length === 2, fromInvoice.join(' '))
const fromField = charged({ parts: 0, inspection_charges: 175, others: 0 }, { invoice: { id: 9, total_amount: 175 } })
ok('with an invoice from the Inspection Charges field, that amount', fromField.every(a => a === '$175.00'), fromField.join(' '))
ok('the invoice is what counts, whatever the report says', charged({ inspection_charges: 175 }, { invoice: { id: 9, total_amount: 300 } }).every(a => a === '$300.00'))

const beforeInvoice = charged({ parts: 100, inspection_charges: 175, others: 30 })
ok('before an invoice, the field + parts + others', beforeInvoice.every(a => a === '$305.00'), beforeInvoice.join(' '))

const batchHtml = buildInspectionSingleReportHtml({ ...base, id: 7, form_data: {} }, null, {
  id: 10, total_amount: 700, batch_items: [{ inspection_id: 7, total_amount: 250 }, { inspection_id: 8, total_amount: 450 }],
})
ok('from a batch invoice: this asset\'s own line, and the invoice total', amounts(batchHtml).join(' ') === '$250.00 $700.00', amounts(batchHtml).join(' '))

// KNOWN GAP, for the product owner. The report does not know the tier's PM fee, so
// until an invoice exists it shows only what was typed. The invoice will still bill
// the PM fee. Change these two checks when that is decided and fixed.
const noFieldNoInvoice = charged({ parts: 0, inspection_charges: 0, others: 0 })
ok('KNOWN GAP: before an invoice, an empty field shows $0.00 though the PM fee will be billed', noFieldNoInvoice.every(a => a === '$0.00'), noFieldNoInvoice.join(' '))
const partsOnlyNoInvoice = charged({ parts: 100, inspection_charges: 0, others: 0 })
ok('KNOWN GAP: before an invoice, parts alone show $100.00 though parts + PM fee will be billed', partsOnlyNoInvoice.every(a => a === '$100.00'), partsOnlyNoInvoice.join(' '))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All printed report checks passed')
