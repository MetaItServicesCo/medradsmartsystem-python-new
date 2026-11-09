/**
 * One answer per item in a canvas table row, not one answer per row.
 *
 * A row can hold two items, like Door Gasket beside Defrost. Treating the whole
 * row as one choice erased the first item's answer, and with it any Fail.
 *
 *   cd frontend
 *   node tests/run-canvasChoiceGroups.mjs
 */
import { canvasPassFail, itemChoicePeers } from './.build/canvasChoiceGroups.mjs'

let failures = 0
const ok = (label, condition, detail) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`)
  if (!condition) failures += 1
}
const label = (id, text) => ({ id, type: 'label', label: text })
const circle = id => ({ id, type: 'radio' })
const note = id => ({ id, type: 'input' })
const peers = (rows, r, c) => itemChoicePeers(rows, r, c).map(cell => cell.id).sort().join(',')

// The Freezer & Refrigerator table: two items in every row.
const header = ['Test', 'Pass', 'Fail', 'N/A', 'Note', 'Test', 'Pass', 'Fail', 'N/A', 'Note'].map((text, i) => label(`h${i}`, text))
const freezer = [
  header,
  [label('n1', 'Door Gasket'), circle('p1'), circle('f1'), circle('x1'), note('m1'), label('n2', 'Defrost'), circle('p2'), circle('f2'), circle('x2'), note('m2')],
  [label('n3', '30 °C'), circle('p3'), circle('f3'), circle('x3'), note('m3'), label('n4', '-80 °C'), circle('p4'), circle('f4'), circle('x4'), note('m4')],
]
ok('two items in a row: the first item\'s circles answer only the first item', peers(freezer, 1, 1) === 'f1,x1', peers(freezer, 1, 1))
ok('two items in a row: the second item\'s circles answer only the second item', peers(freezer, 1, 6) === 'f2,x2', peers(freezer, 1, 6))
ok('the N/A of the first item is not tied to the second item', !peers(freezer, 1, 3).includes('2'), peers(freezer, 1, 3))
ok('the next row is separate', peers(freezer, 2, 1) === 'f3,x3', peers(freezer, 2, 1))

// One item a row keeps working as it did.
const single = [
  [label('a', 'Test'), label('b', 'Pass'), label('c', 'Fail'), label('d', 'N/A'), label('e', 'Note')],
  [label('n', 'Fluoro'), circle('p'), circle('f'), circle('x'), note('m')],
]
ok('one item in a row: its three circles are one choice', peers(single, 1, 2) === 'p,x', peers(single, 1, 2))

// A note between the choices and the next item must not split or join anything.
const threeItems = [
  [label('n1', 'A'), circle('a1'), circle('a2'), label('n2', 'B'), circle('b1'), circle('b2'), label('n3', 'C'), circle('c1'), circle('c2')],
]
ok('three items in a row stay apart', peers(threeItems, 0, 4) === 'b2', peers(threeItems, 0, 4))

// Two sets of columns with no item names: the repeated heading starts the next item.
const unnamed = [
  [label('h1', 'Pass'), label('h2', 'Fail'), label('h3', 'Pass'), label('h4', 'Fail')],
  [circle('a1'), circle('a2'), circle('b1'), circle('b2')],
]
ok('no item names: a repeated column heading starts the next item', peers(unnamed, 1, 0) === 'a2' && peers(unnamed, 1, 2) === 'b2')

// The choice's own word in a cell beside each circle does not make it a new item.
const inlineWords = [
  [label('n', 'Door Gasket'), label('w1', 'Pass'), circle('p'), label('w2', 'Fail'), circle('f'), label('w3', 'N/A'), circle('x')],
]
ok('"Pass", "Fail" and "N/A" written beside the circles are still one item', peers(inlineWords, 0, 2) === 'f,x', peers(inlineWords, 0, 2))

// With no headings and no names at all, the row is one choice, as before.
const bare = [[circle('a'), circle('b'), circle('c')]]
ok('no headings and no names: the row is one choice', peers(bare, 0, 0) === 'b,c')

// Merged, hidden cells take no part.
const merged = [
  [label('n', 'Item'), circle('p'), { ...circle('gone'), hidden: true }, circle('f')],
]
ok('a merged-away circle is ignored', peers(merged, 0, 1) === 'f', peers(merged, 0, 1))

// Everything else is not a circle in a group.
const others = [
  [label('n', 'Item'), { id: 'box1', type: 'checkbox' }, { id: 'box2', type: 'checkbox' }, { id: 'o1', type: 'radio', options: ['Pass', 'Fail'] }, circle('c1')],
]
ok('tick boxes and circles with their own options are left out', peers(others, 0, 4) === '', peers(others, 0, 4))

// What it means for the report: each item keeps its answer, and a Fail fails.
const canvas = { elements: [{ id: 't', type: 'table', cells: freezer }] }
ok('Door Gasket Fail with Defrost Pass fails the report', canvasPassFail(canvas, { f1: true, p2: true }).hasFail)
ok('Defrost Fail with Door Gasket Pass fails the report', canvasPassFail(canvas, { p1: true, f2: true }).hasFail)
ok('Pass on both does not fail it', !canvasPassFail(canvas, { p1: true, p2: true }).hasFail)

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All per-item choice checks passed')
