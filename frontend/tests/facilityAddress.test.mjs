/**
 * Checks for a facility's address on printed reports: the street, then
 * city, state, zip and country on the second line, nothing printed twice.
 *
 *   cd frontend && node tests/run-facilityAddress.mjs
 */
import { facilityAddressLines } from './.build/facilityAddress.mjs'

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}
const lines = f => facilityAddressLines(f)
const show = r => JSON.stringify(r)

let r = lines({ address: '2010 W Katherine P Raines Rd #400, Cleburne, TX 76033, United States', city: 'cleburne', state: 'TX', zip_code: '76033', country: 'United States' })
ok('Chisholm Trail: street on line one, the rest on line two, nothing twice',
  r.street === '2010 W Katherine P Raines Rd #400' && r.line2 === 'Cleburne, TX 76033, United States', show(r))

r = lines({ address: '3140 Legacy Dr. Bldg 300 Ste 330, Frisco, Tx, 75034', city: 'Frisco', state: 'TX', zip_code: '75034', country: 'United States' })
ok('Vast Clinical: state written "Tx" and the zip in its own part are taken off too',
  r.street === '3140 Legacy Dr. Bldg 300 Ste 330' && r.line2 === 'Frisco, TX 75034, United States', show(r))

r = lines({ address: '1 Main St', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('a street-only address prints as before, with the full second line', r.street === '1 Main St' && r.line2 === 'Plano, TX 75024, United States', show(r))

r = lines({ address: '3140 Legacy Dr, Bldg 300, Ste 330, Frisco, Texas 75034, USA', city: 'Frisco', state: 'TX', zip_code: '75034', country: 'USA' })
ok('street parts with commas are kept; a written-out state and "USA" are taken off',
  r.street === '3140 Legacy Dr, Bldg 300, Ste 330' && r.line2 === 'Frisco, TX 75034, USA', show(r))

r = lines({ address: '500 Main St, Suite 12, Dallas, TX 75201-1234', city: 'Dallas', state: 'TX', zip_code: '75201-1234', country: '' })
ok('ZIP+4 is recognised; no country, no trailing comma', r.street === '500 Main St, Suite 12' && r.line2 === 'Dallas, TX 75201-1234', show(r))

r = lines({ address: '9 Elm St, Fort Worth, TX', city: 'fort worth', state: 'tx', zip_code: '76101', country: 'United States' })
ok('a lowercase city is capitalised, a lowercase state upper-cased', r.street === '9 Elm St' && r.line2 === 'Fort Worth, TX 76101, United States', show(r))

r = lines({ address: '12 Oak Ave, McKinney, TX 75070', city: 'McKinney', state: 'TX', zip_code: '75070', country: 'United States' })
ok('a city typed with capitals is printed as typed', r.line2 === 'McKinney, TX 75070, United States' && r.street === '12 Oak Ave', show(r))

r = lines({ address: '75034 Ranch Rd, Frisco', city: 'Frisco', state: 'TX', zip_code: '75034', country: 'United States' })
ok('a street starting with a number that looks like a zip stays', r.street === '75034 Ranch Rd', show(r))

r = lines({ address: 'Frisco, TX 75034', city: 'Frisco', state: 'TX', zip_code: '75034', country: 'United States' })
ok('an address that is only city, state and zip leaves line one empty, not repeated', r.street === '' && r.line2 === 'Frisco, TX 75034, United States', show(r))

r = lines({ address: '1 Main St, Building B, Plano, TX 75024', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('a part with anything of the street in it stays', r.street === '1 Main St, Building B', show(r))

r = lines({ address: '1 Main St, Allen, TX 75013', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('a different city in the address (a typo in the record) is not hidden', r.street === '1 Main St, Allen', show(r))

r = lines({ address: '', city: 'Plano', state: 'TX', zip_code: '', country: 'United States' })
ok('missing fields leave no stray commas or spaces', r.street === '' && r.line2 === 'Plano, TX, United States', show(r))
ok('no facility prints nothing', show(lines(null)) === show({ street: '', line2: '' }))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All facility address checks passed')
