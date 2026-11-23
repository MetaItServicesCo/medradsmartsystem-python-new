/**
 * Checks for finding a customer's request for changes in a quotation's history.
 *
 *   cd frontend && node tests/run-customerResponse.mjs
 */
import { commentExcerpt, latestCustomerResponse, openCustomerResponse } from './.build/customerResponse.mjs'

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const sent = { action: 'sent', by: 'Sales Admin', at: '2026-11-20T10:00:00', details: {} }
const asked = { action: 'changes_requested', by: 'Clinic Buyer', at: '2026-11-21T09:30:00', details: { comments: '  Quantity 3, please.\nNo delivery fee. ', recipient_id: 4 } }
const revised = { action: 'revision_created', by: 'Sales Admin', at: '2026-11-21T11:00:00', details: { revision: 2 } }
const declined = { action: 'declined', by: 'Clinic Buyer', at: '2026-11-22T08:00:00', details: { comments: '' } }

const open = openCustomerResponse([sent, asked])
ok('a request after the quotation was sent is open', open?.action === 'changes_requested' && open.by === 'Clinic Buyer' && open.at === asked.at)
ok('  with the customer\'s words, trimmed, line breaks kept', open?.comments === 'Quantity 3, please.\nNo delivery fee.')
ok('it stays open while a revision is being prepared', openCustomerResponse([sent, asked, revised])?.action === 'changes_requested')
ok('it closes once a quotation is sent again', openCustomerResponse([sent, asked, revised, sent]) === null)
ok('  though the latest answer is still found for the record', latestCustomerResponse([sent, asked, revised, sent])?.comments === 'Quantity 3, please.\nNo delivery fee.')
ok('a later decline is the open answer, blank comments allowed', openCustomerResponse([sent, asked, revised, sent, declined])?.action === 'declined' && openCustomerResponse([sent, declined]).comments === '')
ok('no answer, nothing open', openCustomerResponse([sent]) === null && openCustomerResponse([]) === null)
ok('missing or odd history is handled', openCustomerResponse(undefined) === null && openCustomerResponse(null) === null && openCustomerResponse('x') === null && openCustomerResponse([null, asked])?.action === 'changes_requested')
ok('an answer with no name says "The customer"', openCustomerResponse([{ action: 'changes_requested', details: { comments: 'x' } }])?.by === 'The customer')
ok('comments missing entirely read as none', openCustomerResponse([{ action: 'changes_requested', by: 'A' }])?.comments === '')

ok('a short comment is shown whole on one line', commentExcerpt('Quantity 3,\n please.') === 'Quantity 3, please.')
const long = commentExcerpt('word '.repeat(40))
ok('a long comment is cut with an ellipsis', long.length === 90 && long.endsWith('…'), String(long.length))

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All customer response checks passed')
