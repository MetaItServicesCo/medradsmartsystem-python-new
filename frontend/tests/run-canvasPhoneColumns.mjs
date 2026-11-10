/**
 * Compile src/utils/canvasPhoneColumns.ts and check how wide each column of a
 * custom form's table is at least, on a phone.
 *
 *   cd frontend && node tests/run-canvasPhoneColumns.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '.build')
mkdirSync(outDir, { recursive: true })
const esbuild = join(here, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')
execFileSync(process.execPath, [
  esbuild,
  join(here, '..', 'src', 'utils', 'canvasPhoneColumns.ts'),
  '--bundle',
  '--format=esm',
  '--log-level=warning',
  `--outfile=${join(outDir, 'canvasPhoneColumns.mjs')}`,
], { stdio: 'inherit' })
const { phoneColumnMinWidths, FIELD_MIN, NAMED_CHOICE_MIN, TEXT_MIN, CONTROL_MIN } = await import(pathToFileURL(join(outDir, 'canvasPhoneColumns.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}
const label = text => ({ type: 'label', label: text })
const circle = { type: 'radio' }
const note = { type: 'input' }

// A Freezer & Refrigerator table: two items to a row.
const freezer = [
  ['Test', 'Pass', 'Fail', 'N/A', 'Note', 'Test', 'Pass', 'Fail', 'N/A', 'Note'].map(label),
  [label('Door Gasket'), circle, circle, circle, note, label('Defrost'), circle, circle, circle, note],
]
const mins = phoneColumnMinWidths(freezer, 10)
ok('a note column has room to type in', mins[4] === FIELD_MIN && mins[9] === FIELD_MIN, JSON.stringify(mins))
ok('an item name column has room for its longest name', mins[0] === TEXT_MIN && mins[5] > CONTROL_MIN && mins[5] < TEXT_MIN, JSON.stringify(mins))
ok('a Pass / Fail / N/A column stays narrow, just the circle and its header word', [1, 2, 3, 6, 7, 8].every(c => mins[c] === CONTROL_MIN), JSON.stringify(mins))
ok('the whole Freezer table, two items to a row, is about two screens wide, not more', mins.reduce((a, b) => a + b, 0) <= 900, mins.reduce((a, b) => a + b, 0))
ok('a short name needs less room than a long one', phoneColumnMinWidths([[label('30 C')]], 1)[0] < phoneColumnMinWidths([[label('Door Gasket')]], 1)[0])
ok('a long name is capped and wraps', phoneColumnMinWidths([[label('Electrical safety leakage current test')]], 1)[0] === TEXT_MIN)
const bare = phoneColumnMinWidths([[label('Item'), circle, circle]], 3)
ok('with no header, a circle column is just wide enough to tap', bare[1] === CONTROL_MIN && bare[2] === CONTROL_MIN, JSON.stringify(bare))
ok('a choice with named options has room for them', phoneColumnMinWidths([[{ type: 'radio', options: ['Yes', 'No'] }]], 1)[0] === NAMED_CHOICE_MIN)
ok('number, date, text area and signature are fields too', ['number', 'date', 'textarea', 'signature'].every(type => phoneColumnMinWidths([[{ type }]], 1)[0] === FIELD_MIN))
ok('a cell spread over two columns decides neither', JSON.stringify(phoneColumnMinWidths([[{ type: 'input', colSpan: 2 }, { type: 'label', hidden: true }]], 2)) === JSON.stringify([CONTROL_MIN, CONTROL_MIN]))
ok('a hidden cell decides nothing', phoneColumnMinWidths([[{ type: 'input', hidden: true }]], 1)[0] === CONTROL_MIN)
ok('an empty label is not text', phoneColumnMinWidths([[label('  ')]], 1)[0] === CONTROL_MIN)
ok('one width per column, even for a short row', phoneColumnMinWidths([[note]], 3).length === 3)
ok('an empty table is fine', phoneColumnMinWidths([], 0).length === 0)

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All phone column checks passed')
