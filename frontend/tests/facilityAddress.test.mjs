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

// Addresses as they are in production: without commas, with placeholders.
const tx = { state: 'TX', country: 'United States' }
r = lines({ ...tx, address: '500 West Main Street Ste A Lewisville, TX 75057', city: 'Lewisville', zip_code: '75057' })
ok('a city with no comma before it is still taken off the street', r.street === '500 West Main Street Ste A' && r.line2 === 'Lewisville, TX 75057, United States', show(r))
r = lines({ ...tx, address: '5606 North Navarro #304 Victoria TX 77904 United States', city: 'Victoria', zip_code: '77904' })
ok('  and with no commas at all', r.street === '5606 North Navarro #304', show(r))
r = lines({ ...tx, address: '6552 Lake Worth Blvd  Lake Worth Tx 76135', city: 'Lake Worth', zip_code: '76135' })
ok('  a street named like the city keeps its own name', r.street === '6552 Lake Worth Blvd', show(r))
r = lines({ ...tx, address: '2840 legacy drive, Frisco Texas, 75034', city: 'Frisco', zip_code: '75034' })
ok('  the state written out, in its own part, is taken off', r.street === '2840 legacy drive', show(r))
r = lines({ ...tx, address: '#9 Medical Pkwy Suite 207 Dallas,TX 75034', city: 'Dallas,', state: 'Texas', zip_code: '75034' })
ok('"Dallas,TX" with no space, and a city saved as "Dallas," print cleanly', r.street === '#9 Medical Pkwy Suite 207' && r.line2 === 'Dallas, Texas 75034, United States', show(r))
r = lines({ ...tx, address: '470 E State Hwy 114,', city: 'Southlake', zip_code: '76092' })
ok('a trailing comma is dropped', r.street === '470 E State Hwy 114', show(r))
r = lines({ address: 'Not provided', city: 'Not provided', state: 'Not provided', zip_code: 'Not provided', country: 'United States' })
ok('"Not provided" prints as nothing, not as an address', r.street === '' && r.line2 === 'United States', show(r))
r = lines({ address: 'Nill', city: 'Nill', state: 'Nill', zip_code: 'Nill', country: 'United States' })
ok('  "Nill" too', r.street === '' && r.line2 === 'United States', show(r))
r = lines({ address: '184 Cedar Street Holt MI 48842 United States', city: 'Not provided', state: 'MI', zip_code: '48842', country: 'United States' })
ok('with no city on record, the city in the address stays with the street', r.street === '184 Cedar Street Holt' && r.line2 === 'MI 48842, United States', show(r))
r = lines({ address: '421 E. State Highway 114 Southlake, TX, 76092', city: 'Southlake', state: 'Not provided', zip_code: 'Not provided', country: 'United States' })
ok('a state before a zip is recognised even when the record has none', r.street === '421 E. State Highway 114' && r.line2 === 'Southlake, United States', show(r))
r = lines({ ...tx, address: '120 Main St Suite IN', city: 'Plano', zip_code: '75024' })
ok('a state abbreviation that is not before a zip is left alone', r.street === '120 Main St Suite IN', show(r))
r = lines({ ...tx, address: '4500 Frisco', city: 'Frisco', zip_code: '75034' })
ok('a street that would be left as only a number is printed as typed', r.street === '4500 Frisco', show(r))

// The suite goes on the street line, never twice.
r = lines({ address: '1 Main St', suite: 'Suite 200', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('a suite goes after the street', r.street === '1 Main St, Suite 200' && r.line2 === 'Plano, TX 75024, United States', show(r))
r = lines({ address: '3140 Legacy Dr. Bldg 300 Ste 330, Frisco, TX 75034', suite: 'Ste 330', city: 'Frisco', state: 'TX', zip_code: '75034', country: 'United States' })
ok('  not when the street already has it', r.street === '3140 Legacy Dr. Bldg 300 Ste 330', show(r))
r = lines({ address: '2010 W Raines Rd #400', suite: '#400', city: 'Cleburne', state: 'TX', zip_code: '76033', country: 'United States' })
ok('  "#400" already on the street: once', r.street === '2010 W Raines Rd #400', show(r))
r = lines({ address: '330 Main St', suite: 'Suite 330', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('  a street number like the suite number is not mistaken for it', r.street === '330 Main St, Suite 330', show(r))
r = lines({ address: '1 Main St', suite: 'N/A', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('  a placeholder suite prints as nothing', r.street === '1 Main St', show(r))
r = lines({ address: '', suite: 'Suite 5', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' })
ok('  a suite with no street: just the suite', r.street === 'Suite 5', show(r))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All facility address checks passed')
