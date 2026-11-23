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
  facility: { name: value, address: value, address_fields: { address: value, suite: value, city: value, state: value, zip_code: value, country: value }, contact_name: value, phone: value, email: value },
  equipment: { service_required: value, description: value, serial_number: value, asset_tag: value, make: value, model: value },
  work_entries: [{ key: 'k', date: value, diagnosis: value, work_done: value, technician: value, check_in: value, check_out: value, hours: 2 }],
  total_hours: 2,
  parts: [{ part_number: value, description: value, quantity: value, condition: value }],
  test_equipment: [{ description: value, make: value, model: value, serial_number: value }],
  technician: value, client: value, preferred_date: value, actual_date: value,
  charges: [{ label: value, amount: '1500.00', breakdown: value }],
  subtotal: '1500.00', tax_amount: '0.00', discount_amount: '0.00', total_amount: '1500.00', amount_paid: '0.00', balance_due: '1500.00',
  paid_quotations: [{ quotation_number: value, description: value, paid_amount: '1.00', paid_at: value }],
  ...over,
})

// What the document's own template legitimately contains, to compare against.
const clean = await buildServiceInvoiceHtml(doc('SAFEVALUE'))
// The invoice's own <wbr> (a place a very long value may break) is not counted;
// it is checked below to be only ever a bare <wbr>.
const tagsIn = html => (html.match(/<\s*[a-zA-Z!/][^>]*>/g) || []).map(tag => tag.split(/[\s>]/)[0].toLowerCase()).filter(tag => tag !== '<wbr')
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
const longHostile = await buildServiceInvoiceHtml(doc('<img/src=x/onerror=top.__xss=1>&&&&&&&&&&&&&&&&&&&&&&&&&&&&'))
ok('a long hostile value broken for wrapping is still inert, no entity cut in two',
  !/<img\/|<img src=x/.test(longHostile) && longHostile.includes('&lt;img/src=x/') && (longHostile.match(/<wbr[^>]*>/g) || []).every(tag => tag === '<wbr>')
  && !/&[a-z]*<wbr>/.test(longHostile) && !/&amp<wbr>/.test(longHostile))
ok('a value cannot break out of an attribute', !quoted.includes('" onerror="'))

console.log('\nThe rules')
const sample = await buildServiceInvoiceHtml(doc('v'))
ok('uses the shared invoice design', sample.includes('class="sheet doc-a"') && sample.includes('class="accent-bar"') && sample.includes('class="box prepared"') && sample.includes('class="totals"') && sample.includes('class="grand"'))
const described = await buildServiceInvoiceHtml({ ...doc('v'), equipment: { service_required: 'No image', description: 'C ARM', serial_number: 'S1', asset_tag: 'A1', make: 'GE', model: 'OEC 9900' } })
ok('the asset Description prints beside the asset, under "Asset Description"',
  /<th>Service Required<\/th><th>Asset Description<\/th><th>Serial#<\/th>/.test(described)
  && /<td class="pre si-text"><div>No image<\/div><\/td><td class="si-desc"><div>C ARM<\/div><\/td><td class="si-keep">S1<\/td><td class="si-keep">A1<\/td><td class="si-name"><div>GE<\/div><\/td><td class="si-name"><div>OEC 9900<\/div><\/td>/.test(described))
const undescribed = await buildServiceInvoiceHtml({ ...doc('v'), equipment: { service_required: 'No image', serial_number: 'S1', asset_tag: 'A1', make: 'GE', model: 'OEC 9900' } })
ok('  an asset without one (or an older server): the cell is empty, nothing else moves',
  /<td class="pre si-text"><div>No image<\/div><\/td><td class="si-desc"><div><\/div><\/td><td class="si-keep">S1<\/td>/.test(undescribed) && !/>\s*(null|undefined)\s*</.test(undescribed))
const noEquipment = await buildServiceInvoiceHtml(doc('v', { test_equipment: [] }))
ok('test equipment shows if used', sample.includes('Test Equipment'))
ok('and not if it was not', !noEquipment.includes('Test Equipment'))
const partsTable = sample.slice(sample.indexOf('Parts Used'), sample.indexOf('Test Equipment'))
ok('parts carry no amounts', partsTable.length > 0 && !/Amount|Unit Price|\$\d/.test(partsTable))
const stale = await buildServiceInvoiceHtml(doc('v', { payment_link: 'https://app.test/invoice/service/abc' }))
ok('the invoice never shows a link or QR code', !stale.includes('data:image/png') && !stale.includes('invoice/service/abc') && !/Scan QR/.test(stale))
const noHours = await buildServiceInvoiceHtml(doc('v', { total_hours: 0, work_entries: [] }))
ok('Total Hours shows, as 0.00', /Total Hours:<\/td><td class="right si-keep">0\.00</.test(noHours))
const money = await buildServiceInvoiceHtml(doc('v', { tax_amount: '0.00', discount_amount: '0.00', amount_paid: '0.00' }))
ok('zero tax, discount and paid stay off the charges', !/<span>(Tax|Discount|Paid)<\/span>/.test(money))
const charged = await buildServiceInvoiceHtml(doc('v', { tax_amount: '10.00', discount_amount: '20.00', amount_paid: '5.00' }))
ok('non-zero ones show', /<span>Tax<\/span>/.test(charged) && /<span>Discount<\/span>/.test(charged) && /<span>Paid<\/span>/.test(charged))
const empty = await buildServiceInvoiceHtml({ ...doc(null), work_entries: [], parts: [], test_equipment: [], charges: [], paid_quotations: undefined, status: 'pending', installment_plan: 'No' })
ok('a request with nothing filled in still renders, with no "null" or "undefined"', empty.includes('No items to display') && !/>\s*(null|undefined|NaN)\s*</.test(empty) && !/Invalid Date/.test(empty))

console.log('\nHow each charge was worked out')
const billed = await buildServiceInvoiceHtml(doc('v', { charges: [
  { label: 'Service Fee', amount: '150.00', breakdown: null },
  { label: 'Labor', amount: '700.00', breakdown: '4.00 hrs × $175.00/hr' },
  { label: 'Filter', amount: '90.00', breakdown: '2 × $45.00' },
], subtotal: '940.00' }))
ok('labor shows its hours and rate beside $700.00', /<span>Labor <span class="si-breakdown">\(4\.00 hrs × \$175\.00\/hr\)<\/span><\/span><strong>\$700\.00<\/strong>/.test(billed))
ok('a line billed by quantity shows it', /Filter <span class="si-breakdown">\(2 × \$45\.00\)<\/span><\/span><strong>\$90\.00<\/strong>/.test(billed))
ok('a line with nothing to explain stays as it was', /<span>Service Fee<\/span><strong>\$150\.00<\/strong>/.test(billed))
ok('the amounts and total are unchanged', billed.includes('<span>Total</span><strong>$940.00</strong>'))
const adjusted = await buildServiceInvoiceHtml(doc('v', { charges: [{ label: 'Labor', amount: '600.00', breakdown: '4.00 hrs, adjusted' }] }))
ok('labor changed by hand reads as adjusted, never as a wrong sum', adjusted.includes('(4.00 hrs, adjusted)') && !adjusted.includes('×'))
const older = await buildServiceInvoiceHtml(doc('v', { charges: [{ label: 'Labor', amount: '700.00' }] }))
ok('a server that sends no breakdown: the line as before', /<span>Labor<\/span><strong>\$700\.00<\/strong>/.test(older))

// Bill To: the street, then city, state zip and country -- as on the reports.
const billTo = html => (/<div class="box prepared">([\s\S]*?)<\/div>/.exec(html) || [])[1] || ''
const facility = (over) => ({ name: 'Cleburne Imaging', contact_name: 'Jane Doe', phone: '555-0101', email: 'ap@clinic.test', ...over })
let box = billTo(await buildServiceInvoiceHtml({ ...doc('v'), facility: facility({
  address: '2010 W Katherine P Raines Rd #400, Cleburne, TX 76033, United States, cleburne, TX, 76033',
  address_fields: { address: '2010 W Katherine P Raines Rd #400, Cleburne, TX 76033, United States', suite: null, city: 'cleburne', state: 'TX', zip_code: '76033', country: 'United States' },
}) }))
ok('Bill To: street on one line, "Cleburne, TX 76033, United States" on the next, nothing twice',
  box.includes('<span class="muted">2010 W Katherine P Raines Rd #400</span><br><span class="muted">Cleburne, TX 76033, United States</span>')
  && (box.match(/76033/g) || []).length === 1, box)
ok('  name, contact, email and phone as before', box.includes('<strong class="customer">Cleburne Imaging</strong>') && box.includes('Jane Doe') && box.includes('ap@clinic.test') && box.includes('555-0101'))
box = billTo(await buildServiceInvoiceHtml({ ...doc('v'), facility: facility({ address: '1 Main St, Suite 200, Plano, TX, 75024', address_fields: { address: '1 Main St', suite: 'Suite 200', city: 'Plano', state: 'TX', zip_code: '75024', country: 'United States' } }) }))
ok('  a suite stays on the street line', box.includes('1 Main St, Suite 200</span><br><span class="muted">Plano, TX 75024, United States</span>'), box)
box = billTo(await buildServiceInvoiceHtml({ ...doc('v'), facility: facility({ address: '9 Old Rd, Dallas, TX', address_fields: undefined }) }))
ok('  no address parts (no facility, or an older server): the address as it was', box.includes('<span class="muted">9 Old Rd, Dallas, TX</span>') && !box.includes('<br><span class="muted"></span>'), box)
box = billTo(await buildServiceInvoiceHtml({ ...doc('v'), facility: facility({ address: null, address_fields: null }) }))
ok('  no address at all: nothing printed, no empty lines', !box.includes('<span class="muted"></span>') && !/null|undefined/.test(box), box)

// Tidy tables: nothing short is split across lines.
const tidy = await buildServiceInvoiceHtml({ ...doc('v'), work_entries: [{ key: 'k', date: '2026-11-23', diagnosis: 'd', work_done: 'w', technician: 'Omar Ahmad', check_in: '2026-11-23T09:00:00', check_out: '2026-11-23T13:00:00', hours: 4 }], total_hours: 6.666 })
ok('headings stay on one line', tidy.includes('.doc-a .si-section th { white-space: nowrap; }'))
ok('words are never split mid-word', tidy.includes('.doc-a .si-section td { word-break: normal; overflow-wrap: break-word; }'))
ok('the visit date reads "Nov 23, 2026", on one line', tidy.includes('<td class="si-keep">Nov 23, 2026</td>'))
ok('check-in and check-out in one Time column, on one line', /<th>Technician<\/th><th>Time<\/th><th class="right">Hours<\/th>/.test(tidy)
  && /<td class="si-keep">9:00\sAM – 1:00\sPM<\/td>/.test(tidy.replace(/\u202f/g, ' ')))
ok('  a technician name wraps only between words', tidy.includes('<td>Omar Ahmad</td>'))
ok('  Total Hours sits under Hours', tidy.includes('<td class="right" colspan="5">Total Hours:</td>'))
const oneTime = await buildServiceInvoiceHtml({ ...doc('v'), work_entries: [{ key: 'k', date: '2026-11-23', diagnosis: 'd', work_done: 'w', technician: 'T', check_in: '2026-11-23T09:00:00', check_out: null, hours: 1 }] })
ok('  only a check-in recorded: just that time, no dash', /<td class="si-keep">9:00\sAM<\/td>/.test(oneTime.replace(/\u202f/g, ' ')))
ok('hours read 4.00, Total Hours 6.67', tidy.includes('<td class="right si-keep">4.00</td>') && tidy.includes('Total Hours:</td><td class="right si-keep">6.67</td>'))

const longCodes = await buildServiceInvoiceHtml({ ...doc('v'), equipment: { service_required: 'x', description: 'C ARM', serial_number: 'ANCS01144-XR-2209-SPECIAL-CALIBRATION-07', asset_tag: 'emfps-001', make: 'GE', model: 'Aespire 7900' } })
ok('a short serial or asset # stays on one line', longCodes.includes('<td class="si-keep">emfps-001</td>'))
ok('  a very long one may wrap, at set places, never off the page', longCodes.includes('<td>ANCS01144-XR<wbr>-2209-SPECIA<wbr>L-CALIBRATIO<wbr>N-07</td>'))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All service invoice document checks passed')
