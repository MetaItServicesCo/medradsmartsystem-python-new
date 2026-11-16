/**
 * Checks for the pure parts of src/utils/serviceReportPdf.ts: the file name, and
 * where a report page longer than a sheet is broken across PDF pages.
 *
 *   cd frontend && node tests/run-serviceReportPdf.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { progressReportFileName, sheetBreaks } = await import(pathToFileURL(join(here, '.build', 'serviceReportPdf.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

ok('file name: request number, progress report, local date',
  progressReportFileName('SR-000024', new Date(2026, 10, 14, 23, 50)) === 'SR-000024-progress-report-2026-11-14.pdf',
  progressReportFileName('SR-000024', new Date(2026, 10, 14, 23, 50)))
ok('  a number with odd characters is made safe for a file name',
  progressReportFileName('SR 24/A', new Date(2026, 0, 5)) === 'SR-24-A-progress-report-2026-01-05.pdf')
ok('  no number: still a sensible name', progressReportFileName(null, new Date(2026, 0, 5)) === 'service-request-progress-report-2026-01-05.pdf')

ok('a page that fits a sheet is one sheet', JSON.stringify(sheetBreaks(1056, [100, 500, 1000])) === '[1056]')
ok('  shorter too', JSON.stringify(sheetBreaks(800, [100, 700])) === '[800]')
ok('a longer page breaks at the last row that fits, not through text',
  JSON.stringify(sheetBreaks(1500, [300, 700, 1040, 1100, 1490])) === '[1040,1500]', JSON.stringify(sheetBreaks(1500, [300, 700, 1040, 1100, 1490])))
ok('  each sheet holds at most one sheet of height',
  sheetBreaks(5000, Array.from({ length: 100 }, (_, i) => i * 50 + 30)).every((end, i, all) => end - (i ? all[i - 1] : 0) <= 1056))
ok('  and they cover the whole page, in order',
  (() => { const ends = sheetBreaks(5000, Array.from({ length: 100 }, (_, i) => i * 50 + 30)); return ends[ends.length - 1] === 5000 && ends.every((e, i) => !i || e > ends[i - 1]) })())
ok('no row ends in a usable place: a straight cut, so nothing is lost', JSON.stringify(sheetBreaks(2000, [50, 1900])) === '[1056,2000]', JSON.stringify(sheetBreaks(2000, [50, 1900])))
ok('no near-empty sheets: a break in the first third of a sheet is not used', JSON.stringify(sheetBreaks(1500, [200, 1300])) === '[1056,1500]', JSON.stringify(sheetBreaks(1500, [200, 1300])))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All service report PDF checks passed')
