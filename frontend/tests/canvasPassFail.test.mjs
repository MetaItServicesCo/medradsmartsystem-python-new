/**
 * Checks for the pass/fail answers of the middle custom (canvas) section.
 *
 * A Fail chosen in the middle section never failed the report: the saved
 * result looked only at the fixed checks, and the live status missed Fail
 * fields inside canvas tables.
 *
 *   cd frontend
 *   node tests/run-canvasPassFail.mjs
 */
import { canvasPassFail } from './.build/canvasPassFail.mjs'

let failures = 0
const ok = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
  if (!condition) failures += 1
}
const same = (a, b) => a.hasFail === b.hasFail && a.hasPending === b.hasPending

const PFN = ['Pass', 'Fail', 'N/A']
const canvas = {
  canvas_width: 736,
  canvas_height: 400,
  elements: [
    { id: 'h', type: 'heading', label: 'General Information', x: 0, y: 0, width: 300, height: 30 },
    { id: 'tag', type: 'input', label: 'Asset Tag#', x: 0, y: 40, width: 300, height: 50 },
    { id: 'r1', type: 'radio', label: 'Collimator', options: PFN, x: 0, y: 100, width: 300, height: 50 },
    { id: 'yn', type: 'radio', label: 'Cleaned', options: ['Yes', 'No'], x: 320, y: 100, width: 300, height: 50 },
    {
      id: 't1', type: 'table', x: 0, y: 160, width: 700, height: 200, headerRow: true,
      cells: [
        [{ id: 'th0', type: 'label', label: 'Test' }, { id: 'th1', type: 'label', label: 'Pass' }, { id: 'th2', type: 'label', label: 'Fail' }, { id: 'th3', type: 'label', label: 'N/A' }],
        [{ id: 'a0', type: 'label', label: 'Fluoro' }, { id: 'a1', type: 'radio' }, { id: 'a2', type: 'radio' }, { id: 'a3', type: 'radio' }],
        [{ id: 'b0', type: 'label', label: 'kVp' }, { id: 'b1', type: 'checkbox' }, { id: 'b2', type: 'checkbox' }, { id: 'b3', type: 'checkbox' }],
        [{ id: 'c0', type: 'label', label: 'Tube' }, { id: 'c1', type: 'radio', options: PFN }, { id: 'c2', type: 'input' }, { id: 'c3', type: 'label', label: '' }],
      ],
    },
  ],
}

ok('an untouched form has no Fail, and its Pass/Fail choices are pending',
  same(canvasPassFail(canvas, {}), { hasFail: false, hasPending: true }))
ok('everything answered Pass passes',
  same(canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', a1: true, b1: true }), { hasFail: false, hasPending: false }))
ok('Fail on a canvas choice field fails',
  canvasPassFail(canvas, { r1: 'Fail', c1: 'Pass' }).hasFail)
ok('Fail on a choice field inside a canvas table fails',
  canvasPassFail(canvas, { r1: 'Pass', c1: 'Fail' }).hasFail)
ok('a ticked radio in the Fail column fails',
  canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', a2: true }).hasFail)
ok('a ticked box in the Fail column fails',
  canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', b2: true }).hasFail)
ok('a tick in the Pass or N/A column does not fail',
  !canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', a1: true, b3: true }).hasFail)
ok('an unticked Fail column does not fail',
  !canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', a2: false, b2: false }).hasFail)
ok('a field without a Fail choice never fails or stays pending',
  same(canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', yn: 'No' }), { hasFail: false, hasPending: false }))
ok('a typed answer reading "fail" is not a Fail choice',
  !canvasPassFail(canvas, { r1: 'Pass', c1: 'Pass', tag: 'fail', c2: 'Fail' }).hasFail)
ok('a canvas with no pass/fail fields passes',
  same(canvasPassFail({ ...canvas, elements: canvas.elements.slice(0, 2) }, {}), { hasFail: false, hasPending: false }))
ok('no canvas at all passes', same(canvasPassFail(null, {}), { hasFail: false, hasPending: false }))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All custom section pass/fail checks passed')
