/**
 * Checks for src/utils/gridToCanvas.ts.
 *
 * Switching an existing form from Grid to Canvas in the form editor used to
 * open a blank canvas, and saving then deleted the form's grid. The editor now
 * converts the grid instead. These checks hold the conversion to what makes it
 * safe: every field keeps its grid answer key, so recorded answers stay with
 * their question; nothing is lost; and no two fields overlap, because canvas
 * fields sit at fixed positions and an overlap is exactly what technicians saw.
 *
 *   cd frontend
 *   node tests/run-gridToCanvas.mjs
 */
import { canvasValuesFromGrid, gridHasContent, gridToCanvas } from './.build/gridToCanvas.mjs'

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const radio = (name, label) => ({
  id: `item_${name}`, label: '', type: 'text', colSpan: 1, align: 'left',
  blocks: [{ id: 'ans', type: 'radio', label, options: ['Pass', 'Fail', 'N/A'], optionLayout: 'wrap' }],
})
const input = (name, label, colSpan = 1) => ({
  id: `item_${name}`, label: '', type: 'text', colSpan, align: 'left',
  blocks: [{ id: 'ans', type: 'input', label, layout: 'inline' }],
})
const heading = (index, label) => ({
  id: `section_${index}`, label: '', type: 'text', colSpan: 2,
  blocks: [{ id: 'hdr', type: 'label', label }],
})

// The shape the migration produces, e.g. the Patient Monitor form.
const grid = {
  title: 'Patient Monitor1',
  columns: 2,
  cells: [
    [radio('101', 'EKG Cable'), radio('102', 'EKG Leads')],
    [heading(1, 'Functional Test')],
    [radio('201', 'SpO2 Cable'), radio('202', 'SpO2 Sensor')],
    [input('fav_language', 'EKG Set'), radio('203', 'NIBP Hose')],
    [input('303', 'Image Storage Capacity (200, 5,000 Etc.):', 2)],
    [{ id: 'cell_1_1', label: 'Legacy cell', type: 'radio', options: ['Yes', 'No'] }, { id: 'cell_1_2', label: '', type: 'text', hidden: true }],
  ],
}

const canvas = gridToCanvas(grid)
const fields = canvas.elements.filter(el => el.type !== 'heading' && el.type !== 'label')
const ids = new Set(canvas.elements.map(el => el.id))

ok('every answer field keeps its grid answer key as its id',
  ['item_101__ans', 'item_102__ans', 'item_201__ans', 'item_202__ans', 'item_fav_language__ans', 'item_203__ans', 'item_303__ans', 'cell_1_1']
    .every(id => ids.has(id)), [...ids].join(', '))
ok('the section heading comes across as text', canvas.elements.some(el => el.label === 'Functional Test' && el.type === 'label'))
ok('the grid title becomes the canvas heading', canvas.elements.some(el => el.type === 'heading' && el.label === 'Patient Monitor1'))
ok('radio options are kept', fields.filter(el => el.type === 'radio').every(el => el.options?.length >= 2))
ok('a hidden (merged-away) cell is not drawn', !ids.has('cell_1_2'))
ok('element ids are unique', ids.size === canvas.elements.length)

const overlaps = []
for (let i = 0; i < canvas.elements.length; i++) {
  for (let j = i + 1; j < canvas.elements.length; j++) {
    const a = canvas.elements[i]
    const b = canvas.elements[j]
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps.push(`${a.id} / ${b.id}`)
  }
}
ok('no two fields overlap', overlaps.length === 0, overlaps.join('; '))
ok('everything fits inside the canvas', canvas.elements.every(el => el.x >= 0 && el.x + el.width <= canvas.canvas_width && el.y + el.height <= canvas.canvas_height))
const wide = canvas.elements.find(el => el.id === 'item_303__ans')
ok('a full-width grid cell stays full width', wide && wide.width > canvas.canvas_width / 2)

const values = canvasValuesFromGrid(canvas, { item_101__ans: 'Fail', item_fav_language__ans: '70/20', item_202__ans: '', unrelated: 'x' })
ok('recorded grid answers open on the converted canvas',
  values.item_101__ans === 'Fail' && values.item_fav_language__ans === '70/20', JSON.stringify(values))
ok('  blank answers stay blank, and nothing unrelated is added', !('item_202__ans' in values) && !('unrelated' in values))

const checkboxCanvas = gridToCanvas({ columns: 1, cells: [[{ id: 'c1', type: 'text', blocks: [{ id: 'ans', type: 'checkbox', label: 'Accessories', options: ['Cable', 'Probe', 'Case'] }] }]] })
const checkboxValues = canvasValuesFromGrid(checkboxCanvas, { c1__ans__0: true, c1__ans__1: false, c1__ans__2: true })
ok('checkbox answers come across as the chosen options', JSON.stringify(checkboxValues.c1__ans) === JSON.stringify(['Cable', 'Case']), JSON.stringify(checkboxValues))

ok('an empty grid has no content', !gridHasContent({ columns: 3, cells: [[{ id: 'a', label: '', type: 'text' }]] }))
ok('a grid with fields has content', gridHasContent(grid))
ok('no grid has no content', !gridHasContent(null))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All grid-to-canvas checks passed')
