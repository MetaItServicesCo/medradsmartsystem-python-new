/**
 * Bundle src/utils/serviceInvoiceHtml.ts and run the checks against it in Node.
 * This is the exact HTML shown, emailed links open to, and printed - and printing
 * writes it into a frame that is not sandboxed, so escaping is the only protection.
 *
 *   cd frontend && node tests/run-serviceInvoiceHtml.mjs
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
  join(here, '..', 'src', 'utils', 'serviceInvoiceHtml.ts'),
  '--bundle',
  '--format=esm',
  '--platform=node',
  `--alias:@=${join(here, '..', 'src')}`,
  '--log-level=warning',
  `--outfile=${join(outDir, 'serviceInvoiceHtml.mjs')}`,
], { stdio: 'inherit' })
const { buildServiceInvoiceHtml } = await import(pathToFileURL(join(outDir, 'serviceInvoiceHtml.mjs')).href)

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const doc = (value, over = {}) => ({
  invoice_number: value, request_number: value, status: value, issue_date: value, due_date: value, installment_plan: value, po: value,
  facility: { name: value, address: value, contact_name: value, phone: value, email: value },
  equipment: { service_required: value, serial_number: value, asset_tag: value, make: value, model: value },
  work_entries: [{ key: 'k', date: value, diagnosis: value, work_done: value, technician: value, check_in: value, check_out: value, hours: 2 }],
  total_hours: 2,
  parts: [{ part_number: value, description: value, quantity: value, condition: value }],
  test_equipment: [{ description: value, make: value, model: value, serial_number: value }],
  technician: value, client: value, preferred_date: value, actual_date: value,
  charges: [{ label: value, amount: '1500.00' }],
  subtotal: '1500.00', tax_amount: '0.00', discount_amount: '0.00', total_amount: '1500.00', amount_paid: '0.00', balance_due: '1500.00',
  paid_quotations: [{ quotation_number: value, description: value, paid_amount: '1.00', paid_at: value }],
  ...over,
})

// What the document's own template legitimately contains, to compare against.
const clean = await buildServiceInvoiceHtml(doc('SAFEVALUE'))
const tagsIn = html => (html.match(/<\s*[a-zA-Z!/][^>]*>/g) || []).map(tag => tag.split(/[\s>]/)[0].toLowerCase())
const count = (list) => list.reduce((all, tag) => ({ ...all, [tag]: (all[tag] || 0) + 1 }), {})
const cleanTags = count(tagsIn(clean))

console.log('Hostile text, in every field')
for (const payload of [
  `<script>top.__xss=1</script>`,
  `<img src=x onerror="top.__xss=1">`,
  `"><svg onload="top.__xss=1">`,
  `'"><iframe srcdoc="<script>top.__xss=1</script>"></iframe>`,
  `</style><script>top.__xss=1</script>`,
  `</title><script>top.__xss=1</script>`,
  `</td></tr></table></main><img src=x onerror=alert(1)>`,
  `<a href="javascript:alert(1)">x</a>`,
  `<!-- <style>body{display:none}</style> -->`,
  `' onmouseover='alert(1)`,
  `&lt;script&gt;alert(1)&lt;/script&gt;`,
]) {
  const html = await buildServiceInvoiceHtml(doc(payload))
  ok(`inert: ${payload.slice(0, 44)}`, !html.includes(payload.includes('<') ? payload : '\u0000') && JSON.stringify(count(tagsIn(html))) === JSON.stringify(cleanTags))
}
const quoted = await buildServiceInvoiceHtml(doc(`x" onerror="alert(1)`))
ok('a value cannot break out of an attribute', !quoted.includes('" onerror="'))

console.log('\nThe rules')
const sample = await buildServiceInvoiceHtml(doc('v'))
ok('uses the shared invoice design', sample.includes('class="sheet doc-a"') && sample.includes('class="accent-bar"') && sample.includes('class="box prepared"') && sample.includes('class="totals"') && sample.includes('class="grand"'))
const noEquipment = await buildServiceInvoiceHtml(doc('v', { test_equipment: [] }))
ok('test equipment shows if used', sample.includes('Test Equipment'))
ok('and not if it was not', !noEquipment.includes('Test Equipment'))
const partsTable = sample.slice(sample.indexOf('Parts Used'), sample.indexOf('Test Equipment'))
ok('parts carry no amounts', partsTable.length > 0 && !/Amount|Unit Price|\$\d/.test(partsTable))
const stale = await buildServiceInvoiceHtml(doc('v', { payment_link: 'https://app.test/invoice/service/abc' }))
ok('the invoice never shows a link or QR code', !stale.includes('data:image/png') && !stale.includes('invoice/service/abc') && !/Scan QR/.test(stale))
const noHours = await buildServiceInvoiceHtml(doc('v', { total_hours: 0, work_entries: [] }))
ok('Total Hours shows, as 0', /Total Hours:<\/td><td class="right">0</.test(noHours))
const money = await buildServiceInvoiceHtml(doc('v', { tax_amount: '0.00', discount_amount: '0.00', amount_paid: '0.00' }))
ok('zero tax, discount and paid stay off the charges', !/<span>(Tax|Discount|Paid)<\/span>/.test(money))
const charged = await buildServiceInvoiceHtml(doc('v', { tax_amount: '10.00', discount_amount: '20.00', amount_paid: '5.00' }))
ok('non-zero ones show', /<span>Tax<\/span>/.test(charged) && /<span>Discount<\/span>/.test(charged) && /<span>Paid<\/span>/.test(charged))
const empty = await buildServiceInvoiceHtml({ ...doc(null), work_entries: [], parts: [], test_equipment: [], charges: [], paid_quotations: undefined, status: 'pending', installment_plan: 'No' })
ok('a request with nothing filled in still renders, with no "null" or "undefined"', empty.includes('No items to display') && !/>\s*(null|undefined|NaN)\s*</.test(empty) && !/Invalid Date/.test(empty))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All service invoice document checks passed')
