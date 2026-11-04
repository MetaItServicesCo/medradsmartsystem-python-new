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

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All service report checks passed')
