/**
 * Checks for src/utils/rentalTax.ts: Billing's live tax must be the server's
 * (rental_tax_for_lines) to the cent, or the edit window would show one tax
 * and the saved invoice another.
 *
 *   cd frontend
 *   node tests/run-rentalTax.mjs
 */
import { rentalLineTaxable, rentalTaxForLines } from './.build/rentalTax.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

const line = (item_number, total_amount) => ({ item_number, total_amount })
ok('rent, shipping, setup and removal are taxed',
  ['MBTS0019', 'SHIP-PACK', 'DEL-SETUP', 'REMOVAL'].every(rentalLineTaxable))
ok('deposits, labor and service charges are not',
  !['DEPOSIT', 'DEP-MBTS0019', 'LABOR', 'WORKED-HOURS', 'SERVICE-FEE', 'APP-FEE', 'labor'].some(rentalLineTaxable))
ok('RNT-000107 after removal was taken off: 8.25% of $1,500 is $123.75',
  rentalTaxForLines([line('MBTS0019', 750), line('DEL-SETUP', 750)]) === 123.75)
ok('with removal: 8.25% of $2,250 is $185.63 (half up)',
  rentalTaxForLines([line('MBTS0019', 750), line('DEL-SETUP', 750), line('REMOVAL', 750)]) === 185.63)
ok('a deposit and labor on the same invoice add no tax',
  rentalTaxForLines([line('MBTS0019', 200), line('DEP-MBTS0019', 300), line('LABOR', 50)]) === 16.5)
ok('no lines, no tax', rentalTaxForLines([]) === 0)

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED')
process.exit(fails.length ? 1 : 0)
