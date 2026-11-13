/**
 * Checks for src/utils/serviceTax.ts: the screens' tax must be the server's
 * (backend/app/utils/service_tax.py) to the cent, or a preview would show one
 * total and the invoice charge another.
 *
 *   cd frontend
 *   node tests/run-serviceTax.mjs
 */
import { quotationBeforeTax, quotationTax, serviceInvoiceTaxable, serviceTaxOn } from './.build/serviceTax.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

ok('8.25% of $450.00 is $37.13 (half up, as the server rounds)', serviceTaxOn(450) === 37.13, serviceTaxOn(450))
ok('8.25% of $150.00 is $12.38', serviceTaxOn(150) === 12.38, serviceTaxOn(150))
ok('8.25% of $100.00 is $8.25', serviceTaxOn(100) === 8.25)
ok('8.25% of $1,037.39 is $85.58', serviceTaxOn(1037.39) === 85.58, serviceTaxOn(1037.39))
ok('8.25% of $0.10 + $0.20 is $0.02, without floating-point drift', serviceTaxOn(0.1 + 0.2) === 0.02, serviceTaxOn(0.1 + 0.2))
ok('no tax on nothing, or below zero', serviceTaxOn(0) === 0 && serviceTaxOn(-5) === 0 && serviceTaxOn(null) === 0)

const q = quotationTax([{ item_type: 'part', total: 150 }, { item_type: 'labor', total: 100 }])
ok('a quotation: Part $150 + Labor $100 is $250 + $12.38 = $262.38',
  q.subtotal === 250 && q.taxable === 150 && q.tax === 12.38 && q.total === 262.38, JSON.stringify(q))
const o = quotationTax([{ item_type: 'other', total: 40 }, { item_type: 'Labor', total: 60 }])
ok('  other lines are taxed, labor in any case is not', o.tax === 3.3 && o.total === 103.3, JSON.stringify(o))
ok('  labor alone: no tax', quotationTax([{ item_type: 'labor', total: 300 }]).tax === 0)
ok('  a line typed 0.1 × 3 counts as $0.30', quotationTax([{ item_type: 'part', total: 0.1 * 3 }]).subtotal === 0.3)

ok('a quotation goes on an invoice at its amount before tax', quotationBeforeTax({ amount: 162.38, tax_amount: 12.38 }) === 150)
ok('  and one from before service tax at its amount', quotationBeforeTax({ amount: 300 }) === 300)

ok('an invoice without a quotation is taxed on nothing', serviceInvoiceTaxable(150, 150, 0, false) === 0)
ok('an invoice with one: Service Fee + labor + quotations', serviceInvoiceTaxable(150, 150, 150, true) === 450)
ok('  $450 of it: $37.13 tax', serviceTaxOn(serviceInvoiceTaxable(150, 150, 150, true)) === 37.13)

if (fails.length) {
  console.log(`\n${fails.length} FAILED`)
  process.exit(1)
}
console.log('\nALL PASSED')
