/**
 * Compile src/utils/canvasReadingOrder.ts and check the order a canvas form is
 * read in on a phone.
 *
 *   cd frontend && node tests/run-canvasReadingOrder.mjs
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
  join(here, '..', 'src', 'utils', 'canvasReadingOrder.ts'),
  '--bundle',
  '--format=esm',
  '--log-level=warning',
  `--outfile=${join(outDir, 'canvasReadingOrder.mjs')}`,
], { stdio: 'inherit' })
const { canvasReadingOrder } = await import(pathToFileURL(join(outDir, 'canvasReadingOrder.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}
const ids = list => canvasReadingOrder(list).map(el => el.id).join(' ')

const sheet = [
  { id: 'notes', type: 'textarea', x: 0, y: 400 },
  { id: 'serial', type: 'input', x: 540, y: 102, label: 'Serial' },
  { id: 'title', type: 'heading', x: 0, y: 0, label: 'Freezer & Refrigerator' },
  { id: 'asset', type: 'input', x: 0, y: 100, label: 'Asset #' },
  { id: 'checks', type: 'table', x: 0, y: 180 },
  { id: 'shade', type: 'label', x: 0, y: 90, label: '' },
  { id: 'make', type: 'input', x: 0, y: 140, label: 'Make' },
]
ok('read top to bottom, left to right within a row', ids(sheet) === 'title asset serial make checks notes', ids(sheet))
ok('a field a few pixels lower still reads on its row', ids([
  { id: 'right', type: 'input', x: 500, y: 100 },
  { id: 'left', type: 'label', x: 0, y: 108, label: 'Left' },
]) === 'left right')
ok('a field well below starts a new row', ids([
  { id: 'below', type: 'input', x: 0, y: 140 },
  { id: 'above', type: 'input', x: 500, y: 100 },
]) === 'above below')
ok('a shaded background with no text is left out', !ids(sheet).includes('shade'))
ok('a label with only a description is kept', ids([{ id: 'hint', type: 'label', x: 0, y: 0, label: ' ', description: 'Note' }]) === 'hint')
ok('every field to fill in is kept', canvasReadingOrder(sheet).length === sheet.length - 1)
const original = JSON.stringify(sheet)
canvasReadingOrder(sheet)
ok('the form itself is not changed', JSON.stringify(sheet) === original)
ok('an empty form is fine', canvasReadingOrder([]).length === 0)

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All canvas reading order checks passed')
