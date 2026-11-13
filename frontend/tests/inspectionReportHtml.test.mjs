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
import { buildInspectionBatchReportHtml, buildInspectionFormHtml, buildInspectionSingleReportHtml } from './.build/inspectionReportHtml.mjs'

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

// Before an invoice, the report shows what the invoice will bill.
const pm = { tier_pm_fee: 250 }
const onPm = charged({ parts: 0, inspection_charges: 0, others: 0 }, pm)
ok('before an invoice, an empty field shows the tier\'s PM cost', onPm.every(a => a === '$250.00') && onPm.length === 2, onPm.join(' '))
const pmAndParts = charged({ parts: 100, inspection_charges: 0, others: 30 }, pm)
ok('before an invoice, the PM cost + parts + others', pmAndParts.every(a => a === '$380.00'), pmAndParts.join(' '))
const changed = charged({ parts: 0, inspection_charges: 175, others: 0 }, pm)
ok('before an invoice, a changed cost replaces the PM cost', changed.every(a => a === '$175.00'), changed.join(' '))
const zeroTier = charged({ parts: 0, inspection_charges: 0, others: 0 }, { tier_pm_fee: 0 })
ok('a tier with no PM cost shows $0.00', zeroTier.every(a => a === '$0.00'), zeroTier.join(' '))
const noTier = charged({ parts: 0, inspection_charges: 0, others: 0 }, { tier_pm_fee: null })
ok('no tier shows $0.00', noTier.every(a => a === '$0.00'), noTier.join(' '))
const oldSaved = charged({ parts: 0, inspection_charges: 0, others: 0 }, { ...pm, invoice: { id: 9, total_amount: 250 } })
ok('an old report saved with 0 agrees with its invoice', oldSaved.every(a => a === '$250.00'), oldSaved.join(' '))

// ── A batch's Billing Page: travel cost, and what Billing added ─────────────
const billingRows = html => [...billingPage(html).matchAll(/<tr>\s*<td class="center">\d+<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<td class="right amount">([^<]*)<\/td>/g)].map(m => `${m[1] || '-'}|${m[2]}|${m[3]}`)
const totalOf = html => (billingPage(html).match(/Total<\/td><td class="right amount">([^<]*)</) || [])[1]
const assetA = { ...base, id: 7, inspection_number: 'INSP-9-001', asset_tag: 'A-1', asset_name: 'Pump', form_data: {} }
const assetB = { ...base, id: 8, inspection_number: 'INSP-9-002', asset_tag: 'A-2', asset_name: 'Scale', form_data: {} }
const batchInvoice = { id: 10, inspection_batch_id: 3, total_amount: 820, travel_cost: 120, batch_items: [{ inspection_id: 7, total_amount: 250 }, { inspection_id: 8, total_amount: 450 }] }
const batchReport = (invoice, extra = {}) => buildInspectionBatchReportHtml({ batch_number: 'INSP-9', assets: [assetA, assetB], batch_invoice: invoice, ...extra }, null)

const withTravel = batchReport(batchInvoice)
ok('a batch report bills each asset and the travel cost once', billingRows(withTravel).join(' ; ') === 'A-1|Pump|$250.00 ; A-2|Scale|$450.00 ; -|Travel Cost|$120.00', billingRows(withTravel).join(' ; '))
ok("  and its total is the invoice's", totalOf(withTravel) === '$820.00', totalOf(withTravel))
const noTravel = batchReport({ ...batchInvoice, total_amount: 700, travel_cost: null })
ok('no travel cost: no travel row, as before', billingRows(noTravel).length === 2 && !billingPage(noTravel).includes('Travel Cost') && totalOf(noTravel) === '$700.00')
const notInvoiced = batchReport(null, { travel_cost: 90 })
ok("not yet invoiced: the batch's travel cost is shown and added", billingRows(notInvoiced).at(-1) === '-|Travel Cost|$90.00' && totalOf(notInvoiced) === '$90.00', `${billingRows(notInvoiced).join(' ; ')} total ${totalOf(notInvoiced)}`)

const edited = batchReport({
  ...batchInvoice, total_amount: 900, tax_amount: 0, discount_amount: 20,
  line_items: [
    { item_number: 'INSP-9-001', description: 'Pump', total_amount: 300 },
    { item_number: 'INSP-9-002', description: 'Scale', total_amount: 450 },
    { item_number: 'TRAVEL', description: 'Travel Cost', total_amount: 120 },
    { item_number: 'ITEM-4', description: 'Parking', total_amount: 25 },
  ],
  summary_rows: [{ label: 'Fuel surcharge', value: 25 }],
})
ok('edited in Billing: every row as Billing saved it, added ones included',
  billingRows(edited).join(' ; ') === 'A-1|Pump|$300.00 ; A-2|Scale|$450.00 ; -|Travel Cost|$120.00 ; -|Parking|$25.00', billingRows(edited).join(' ; '))
ok("  with Billing's extra total line and the discount", billingPage(edited).includes('Fuel surcharge') && billingPage(edited).includes('Discount') && billingPage(edited).includes('-$20.00'))
ok('  adding up to the invoice total', totalOf(edited) === '$900.00', totalOf(edited))

const oneOfBatch = buildInspectionSingleReportHtml(assetA, null, { ...batchInvoice, line_items: [{ item_number: 'INSP-9-001', total_amount: 300 }, { item_number: 'ITEM-4', description: 'Parking', total_amount: 25 }] })
ok("one asset of an edited batch invoice: its own line at Billing's price, nothing else", billingRows(oneOfBatch).join(' ; ') === 'A-1|Pump|$300.00', billingRows(oneOfBatch).join(' ; '))

const ownEdited = buildInspectionSingleReportHtml({ ...base, id: 5, inspection_number: 'INSP-5', asset_tag: 'A-5', form_data: {} }, null,
  { id: 11, total_amount: 280, line_items: [{ item_number: 'INSP-5', description: 'Pump', total_amount: 250 }, { item_number: 'ITEM-2', description: 'Shipping', total_amount: 30 }] })
ok("an asset with its own edited invoice: the invoice's rows", billingRows(ownEdited).join(' ; ') === 'A-5|Pump|$250.00 ; -|Shipping|$30.00' && totalOf(ownEdited) === '$280.00', billingRows(ownEdited).join(' ; '))

// ── Everything entered on Report Activity is printed ───────────────────────
const cePage = html => html.slice(0, html.indexOf('Billing Page'))
const full = cePage(print({
  form_data: {
    identity: { asset_number: 'A-9', location: 'ICU', room_number: 'R-12' },
    checks: { physical_inspection: 'pass' },
    diagnostics: { reported_problem: 'Noise', summary: 'All good', technician_remark: 'Fan replaced' },
    measurements: [
      { name: 'Electrical leakage', set_value: '100', read_value: '12', unit: 'uA', status: 'pass' },
      { name: 'Functional test', set_value: '', read_value: '', unit: '', status: 'pass' },
      { name: 'Ground resistance', set_value: '0.5', read_value: '0.2', unit: 'Ohms', status: 'fail' },
    ],
    photo_documentation: [
      { label: 'Equipment condition', url: '', notes: '' },
      { label: 'Front panel', url: 'https://files.example.com/p/front.jpg', notes: 'Scratch on the door' },
      { label: 'Ticket', url: 'WO-55 photo in binder', notes: '' },
    ],
    compliance: { certified: 'conditional', standard: 'NFPA 99', recommendations: 'Replace door gasket', certificate_notes: '' },
    parts: [{ description: 'Gasket', part_number: 'G-1', price: 40, condition: 'new' }],
    test_equipment: [{ description: 'Safety Analyzer', make: 'Fluke', serial_number: 'F-1' }],
    billing: { parts: 40, inspection_charges: 175, others: 15 },
    dates: { inspected_by: 'Sam', inspection_date: '2026-11-10', inspection_due_date: '2026-11-15', next_inspection_due_date: '2027-11-10' },
  },
}))
ok('an extra identity field is printed', full.includes('Room Number') && full.includes('R-12'))
ok('an extra Biomed note is printed', full.includes('Technician Remark') && full.includes('Fan replaced'))
ok('Measurements: a reading beyond Set / Read is printed', full.includes('Ground resistance') && full.includes('0.2') && full.includes('Ohms'))
ok('  with its status', /Ground resistance[\s\S]*status fail/.test(full))
ok('  the Set / Read one is not printed twice', (full.match(/Electrical leakage/g) || []).length === 0)
ok('  an empty default row is left out', !full.includes('Functional test<'))
ok('Photo Documentation: each photo with its reference', full.includes('Front panel') && full.includes('https://files.example.com/p/front.jpg') && full.includes('WO-55 photo in binder'))
ok('  a picture link prints the picture', full.includes('<img src="https://files.example.com/p/front.jpg"'))
ok('  a plain reference prints as text only', !full.includes('<img src="WO-55'))
ok('  with its notes', full.includes('Scratch on the door'))
ok('  a photo row with nothing in it is left out', !full.includes('Equipment condition'))
ok('Compliance: certified, standard and recommendations', full.includes('Conditional') && full.includes('NFPA 99') && full.includes('Replace door gasket'))
ok('  an empty one is left out', !full.includes('Certificate Notes'))
ok('Charges: parts, inspection charges and others, with their total', full.includes('Charges') && full.includes('$40.00') && full.includes('$175.00') && full.includes('$15.00') && full.includes('$230.00'))
ok('Dates: both due dates when both are set', full.includes('Next Inspection Due Date') && /Nov 1[45], 2026/.test(full) && /Nov (9|10), 2027/.test(full), (full.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/g) || []).join(' | '))

const sameDue = cePage(print({ form_data: { dates: { inspected_by: 'Sam', inspection_date: '2026-11-10', next_inspection_due_date: '2027-11-10' } } }))
ok('  one due date: one column, as before', !sameDue.includes('Next Inspection Due Date') && /Nov (9|10), 2027/.test(sameDue))

const bare = cePage(print({ form_data: {} }))
ok('a report with none of it adds no empty sections', !['Measurements', 'Photo Documentation', 'Compliance', 'Charges'].some(name => bare.includes(`>${name}<`)))

const hostile = cePage(print({ form_data: { photo_documentation: [{ label: '<b>x</b>', url: 'javascript:alert(1)//.png' }, { label: 'q', url: 'https://x.test/a.png" onerror="alert(1)' }] } }))
ok('a hostile photo link is printed as text, never run', !hostile.includes('<img src="javascript') && !hostile.includes('onerror="alert') && !hostile.includes('<b>x</b>'))

// ── Test equipment ─────────────────────────────────────────────────────────
const picked = cePage(print({ form_data: { test_equipment: [
  { id: 4, description: 'Safety Analyzer', make: 'Fluke', model: 'ESA615', serial_number: 'F-1', asset: 'TE-0007' },
  { description: 'MultiMeter', make: 'Fluke', serial_number: 'M-2' },
] } }))
ok('test equipment from the list prints its model and asset #', picked.includes('ESA615') && picked.includes('TE-0007') && picked.includes('>Model<') && picked.includes('>Asset #<'))
ok('  and every item, with dashes where one has none', picked.includes('MultiMeter') && picked.includes('M-2'))
const typedEquipment = cePage(print({ form_data: { test_equipment: [{ description: 'Safety Analyzer', make: 'Fluke', serial_number: 'F-1' }] } }))
ok('typed-in test equipment prints as before: no empty Model or Asset # column', typedEquipment.includes('Safety Analyzer') && !typedEquipment.includes('>Model<') && !typedEquipment.includes('>Asset #<'))
const blankDefaults = cePage(print({ form_data: { test_equipment: [{ description: '', make: '', serial_number: '' }] } }))
ok('no test equipment entered: no section', !blankDefaults.includes('Test Equipment'))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All printed report checks passed')
