/**
 * Compile src/utils/modalityList.ts and check how an asset's type is chosen
 * from the current modality list and the old one.
 *
 *   cd frontend && node tests/run-modalityList.mjs
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
  join(here, '..', 'src', 'utils', 'modalityList.ts'),
  '--bundle',
  '--format=esm',
  '--log-level=warning',
  `--outfile=${join(outDir, 'modalityList.mjs')}`,
], { stdio: 'inherit' })
const m = await import(pathToFileURL(join(outDir, 'modalityList.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail && !condition ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}
const names = list => list.map(item => item.name).join(', ')

// Before the current list is in place: nothing is old.
const before = [
  { id: 9, name: 'Surgery', children: [{ id: 91, name: 'Saw' }, { id: 90, name: 'Drill' }] },
  { id: 8, name: 'ANESTHESIA', children: [] },
]
ok('before: there is no old list', !m.hasOldList(before))
ok('before: every modality is offered, in the order it comes', names(m.modalityChoices(before)) === 'Surgery, ANESTHESIA')
ok('before: sub-modalities in the order they come', names(m.subModalityChoices(before, before[0])) === 'Saw, Drill')
ok('before: no form is given', m.defaultFormFor(before, before[0], before[0].children[0]) === null)
ok('before: labels as they are', m.choiceLabel(before, before[0]) === 'Surgery')

// After: the current list and the old list.
const beds = {
  id: 1, name: 'Bed & Stretchers', is_legacy: false, children: [
    { id: 11, name: 'Stretcher', is_legacy: false, inspection_form_id: 5, inspection_form_name: 'Hospital Bed Form' },
    { id: 12, name: 'Patient Beds', is_legacy: false, inspection_form_id: 5, inspection_form_name: 'Hospital Bed Form' },
    { id: 13, name: 'Birthing Beds', is_legacy: false, inspection_form_id: 7, inspection_form_name: 'Old Bed Form', inspection_form_hidden: true },
  ],
}
const cardiology = { id: 2, name: 'Cardiology', is_legacy: false, inspection_form_id: 20, inspection_form_name: 'General Form', children: [{ id: 21, name: 'AED', is_legacy: false, inspection_form_id: null }] }
const lab = { id: 3, name: 'Lab', is_legacy: false, children: [] }
const oldSurgery = { id: 9, name: 'Surgery', is_legacy: true, children: [{ id: 91, name: 'Saw', is_legacy: true }] }
const oldDefib = { id: 7, name: 'DEFIBILLATOR', is_legacy: true, children: [] }
const after = [oldSurgery, lab, cardiology, oldDefib, beds]

ok('after: there is an old list', m.hasOldList(after))
ok('after: only the current list is offered, alphabetically', names(m.modalityChoices(after)) === 'Bed & Stretchers, Cardiology, Lab')
ok('after: an asset being edited on an old modality keeps it on offer, last', names(m.modalityChoices(after, 9)) === 'Bed & Stretchers, Cardiology, Lab, Surgery')
ok('  marked as the old list', m.choiceLabel(after, oldSurgery) === 'Surgery (old list)' && m.choiceLabel(after, beds) === 'Bed & Stretchers')
ok('  a current modality is not repeated when it is the one being edited', names(m.modalityChoices(after, 1)) === 'Bed & Stretchers, Cardiology, Lab')
ok('after: sub-modalities alphabetically', names(m.subModalityChoices(after, beds)) === 'Birthing Beds, Patient Beds, Stretcher')
ok('after: an old modality\'s sub-modalities as they come', names(m.subModalityChoices(after, oldSurgery)) === 'Saw')
const pb = m.defaultFormFor(after, beds, beds.children[1])
ok('Patient Beds gives Hospital Bed Form, from Patient Beds', pb && pb.id === 5 && pb.name === 'Hospital Bed Form' && pb.from === 'Patient Beds', JSON.stringify(pb))
ok('a hidden form is never given', m.defaultFormFor(after, beds, beds.children[2]) === null)
const aed = m.defaultFormFor(after, cardiology, cardiology.children[0])
ok('a sub-modality with no form falls back to its modality\'s', aed && aed.id === 20 && aed.from === 'Cardiology', JSON.stringify(aed))
ok('an old modality gives no form', m.defaultFormFor(after, oldSurgery, oldSurgery.children[0]) === null)
ok('nothing chosen, nothing given', m.defaultFormFor(after, null, null) === null)
ok('the parent of a sub-modality is found', m.parentOf(after, 12)?.id === 1 && m.parentOf(after, 1)?.id === 1 && m.parentOf(after, 91)?.id === 9 && m.parentOf(after, 999) === undefined)
const original = JSON.stringify(after)
m.modalityChoices(after); m.subModalityChoices(after, beds)
ok('choosing never reorders the list it was given', JSON.stringify(after) === original)

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All modality list checks passed')
