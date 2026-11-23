/**
 * Checks for the service request pickers' search and quantity rules.
 *
 *   cd frontend && node tests/run-pickerSearch.mjs
 */
import { longestSearchWord, matchesEveryWord, quantityProblem, searchWords, wholeQuantityInput } from './.build/pickerSearch.mjs'

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const probe = ['PRB-100', 'Ultrasound probe cover', 'Philips', 'L12-5', 'SN-77821', null]
ok('one word matches any field, ignoring case', matchesEveryWord(probe, 'philips') && matchesEveryWord(probe, 'COVER'))
ok('several words match across different fields, in any order', matchesEveryWord(probe, 'probe philips') && matchesEveryWord(probe, 'l12-5  Ultrasound'))
ok('every word must match somewhere', !matchesEveryWord(probe, 'philips monitor'))
ok('the whole phrase still matches, as before', matchesEveryWord(probe, 'probe cover'))
ok('a picker label pasted back in matches its own record', matchesEveryWord(probe, 'PRB-100 - Ultrasound probe cover'))
ok('an empty search matches everything', matchesEveryWord(probe, '   '))
ok('empty fields are never matched', !matchesEveryWord([null, undefined, ''], 'null') && !matchesEveryWord([undefined], 'undefined'))
ok('commas separate words too', searchWords('fluke, 1234').join('|') === 'fluke|1234')
ok('the longest word is sent to a one-phrase server search', longestSearchWord('fluke  ESA620 x') === 'esa620' && longestSearchWord('') === '')

ok('a quantity keeps digits only', wholeQuantityInput('1.5') === '15' && wholeQuantityInput('-3') === '3' && wholeQuantityInput('2e') === '2')
ok('  without leading zeros, and can be emptied', wholeQuantityInput('007') === '7' && wholeQuantityInput('0') === '0' && wholeQuantityInput('') === '')
ok('a usable quantity has no problem', quantityProblem('3', 5) === '' && quantityProblem('5', 5) === '')
ok('more than is available says how many there are', quantityProblem('6', 5) === 'Only 5 available')
ok('zero, blank and fractions are refused with a reason',
  quantityProblem('0', 5) === 'Enter a whole number of at least 1' && quantityProblem('', 5) === 'Enter a quantity' && quantityProblem('1.5', 5) === 'Enter a whole number of at least 1')

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All picker search checks passed')
