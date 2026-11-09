/**
 * The service report shows legacy work sessions as the legacy system recorded
 * them: their work date (not a clock time made up from when the record was
 * saved, nor shifted a day by the time zone), their hours or "Hours not
 * recorded", and never legacy list text such as [null] or ["Daniel"]. A
 * session recorded in the app keeps its start and end times.
 *
 *   cd frontend && node tests/run-serviceReportHtml.mjs
 */
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { buildServiceReportDocument, buildServiceReportSheet } = await import(pathToFileURL(join(here, '.build', 'serviceReportHtml.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const legacyNoHours = { user: 'Daniel', timestamp: '2026-10-23T13:57:00', session_id: 'legacy-report-2', work_date: '2026-10-23',
  duration_hours: null, diagnosis: null, work_done: null, notes: null, test_equipment: [], parts: [] }
const legacyWithHours = { user: 'Omar', timestamp: '2023-02-09T10:00:00', session_id: 'legacy-report-1', work_date: '2023-02-06',
  duration_hours: 6, diagnosis: 'Pre-amp error', work_done: 'Replaced supply', notes: null, test_equipment: [], parts: [] }
const appSession = { user: 'Sam', timestamp: '2026-11-01T15:00:00', session_id: 'abc', start_time: '2026-11-01T13:00:00',
  end_time: '2026-11-01T15:00:00', duration_hours: 2, diagnosis: 'Noise', work_done: 'Tightened', test_equipment: [], parts: [] }
const sr = {
  request_number: '2026-002064', facility_name: 'Clinic', status: 'completed', priority: 'medium',
  problem_description: 'Part: Harness', service_required: 'Part: Harness', resolution_description: null,
  time_spent_hours: 8, total_cost: 0, created_at: '2026-10-23T13:55:00', sessions: [legacyNoHours, legacyWithHours, appSession],
}

for (const [name, html] of [['report', buildServiceReportDocument(sr, null)], ['sheet', buildServiceReportSheet(sr)]]) {
  ok(`${name}: a legacy session shows its work date`, html.includes('Work Date') && html.includes('Oct 23, 2026'))
  ok(`${name}:   on its own day, not the day before`, !html.includes('Oct 22, 2026'))
  ok(`${name}: a session with no recorded hours says so, not 0.00 hrs`, html.includes('Hours not recorded'))
  ok(`${name}: a legacy session's recorded hours are shown`, html.includes('6.00 hrs'))
  ok(`${name}: no legacy list text appears`, !html.includes('[null]') && !html.includes('["'))
  ok(`${name}: an app session keeps its start and end times`, html.includes('Start Time') && html.includes('End Time'))
}

// Something added to the work order without time: printed after the sessions,
// with its part, and with no hours - from the report row or from the history.
const addition = { user: 'Sam', timestamp: '2026-11-02T09:00:00', diagnosis: '', work_done: '', notes: 'Forgot the fuse',
  test_equipment: [], parts: [{ part_number: 'P-100', description: 'Fuse', quantity_used: 2 }] }
const withAddition = { ...sr, sessions: [appSession], additions: [addition] }
const fromHistory = { ...sr, sessions: undefined, history: [
  { action: 'technician_work_session', user: 'Sam', timestamp: '2026-11-01T15:00:00', changes: appSession },
  { action: 'work_order_addition', user: 'Sam', timestamp: '2026-11-02T09:00:00', changes: addition },
] }
for (const [name, html] of [
  ['report (row)', buildServiceReportDocument(withAddition, null)],
  ['report (history)', buildServiceReportDocument(fromHistory, null)],
  ['invoice sheet (row)', buildServiceReportSheet(withAddition)],
  ['invoice sheet (history)', buildServiceReportSheet(fromHistory)],
]) {
  ok(`${name}: the addition is printed`, html.includes('Added to Work Order 1'))
  ok(`${name}: with its note and part`, html.includes('Forgot the fuse') && html.includes('P-100'))
  ok(`${name}: and no hours of its own`, html.includes('No time added'))
  ok(`${name}: the session is still printed as a session`, html.includes('2.00 hrs'))
}
const noAddition = buildServiceReportSheet({ ...sr, sessions: [appSession], additions: [] })
ok('a report with no additions prints no additions section', !noAddition.includes('Added to Work Order'))

// How the cost was worked out: 4 hours at $175 an hour is the $700.
console.log('\nHow the cost was worked out')
const billedSr = { ...sr, sessions: [appSession], time_spent_hours: 4, total_cost: 700, service_cost_breakdown: '4.00 hrs × $175.00/hr',
  invoice: { invoice_number: 'INV-1', status: 'pending', subtotal: 940, tax_amount: 0, discount_amount: 0, total_amount: 940, amount_paid: 0, balance_due: 940,
    charges: [
      { label: 'Service Fee', amount: '150.00', breakdown: null },
      { label: 'Labor', amount: '700.00', breakdown: '4.00 hrs × $175.00/hr' },
      { label: 'Filter', amount: '90.00', breakdown: '2 × $45.00' },
    ] } }
const report = buildServiceReportDocument(billedSr, null)
const workSummary = report.slice(report.indexOf('Work Summary'), report.indexOf('Billing Page'))
ok('report: Work Summary shows $700.00 with 4.00 hrs × $175.00/hr', workSummary.includes('$700.00') && workSummary.includes('4.00 hrs × $175.00/hr'))
const billing = report.slice(report.indexOf('Billing Page'))
ok('report: the Billing Page lists the invoice charges', billing.includes('Invoice Charges'))
ok('report:   labor with its hours and rate', /<td>Labor<\/td><td>4\.00 hrs × \$175\.00\/hr<\/td><td class="right amount">\$700\.00<\/td>/.test(billing))
ok('report:   a line billed by quantity', /<td>Filter<\/td><td>2 × \$45\.00<\/td><td class="right amount">\$90\.00<\/td>/.test(billing))
ok('report:   a line with nothing to explain', /<td>Service Fee<\/td><td>-<\/td><td class="right amount">\$150\.00<\/td>/.test(billing))
ok('report:   the same subtotal as the invoice', /Subtotal<\/td><td class="right amount">\$940\.00/.test(billing))
ok('report: the billed total is unchanged', billing.includes('$940.00'))
const sheet = buildServiceReportSheet(billedSr)
ok('invoice sheet: Total Cost shows $700.00 with 4.00 hrs × $175.00/hr', sheet.includes('Total Cost: $700.00 (4.00 hrs × $175.00/hr)'))

const adjustedSr = { ...billedSr, invoice: { ...billedSr.invoice, charges: [{ label: 'Labor', amount: '600.00', breakdown: '4.00 hrs, adjusted' }] } }
const adjustedReport = buildServiceReportDocument(adjustedSr, null)
ok('report: labor changed by hand reads as adjusted on the Billing Page', adjustedReport.slice(adjustedReport.indexOf('Billing Page')).includes('<td>4.00 hrs, adjusted</td>'))

const plain = { ...sr, sessions: [appSession], time_spent_hours: 4, total_cost: 700 }
const plainReport = buildServiceReportDocument(plain, null)
ok('no breakdown from the server: the cost shows as before', plainReport.includes('$700.00') && !plainReport.includes('×') && !plainReport.includes('Invoice Charges'))
ok('no breakdown from the server: the sheet as before', buildServiceReportSheet(plain).includes('Total Cost: $700.00</span>'))
const hostile = buildServiceReportDocument({ ...billedSr, service_cost_breakdown: '<img src=x onerror=alert(1)>',
  invoice: { ...billedSr.invoice, charges: [{ label: '<script>x</script>', amount: '1', breakdown: '<b>y</b>' }] } }, null)
ok('breakdowns and labels are escaped', !hostile.includes('<img src=x') && !hostile.includes('<script>x') && !hostile.includes('<b>y</b>'))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All service report checks passed')
