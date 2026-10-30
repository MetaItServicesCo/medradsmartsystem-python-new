/**
 * Checks for security-headers.conf: the Content-Security-Policy must let
 * Square's card form load.
 *
 * This exists because of a specific failure: the policy allowed Square's
 * scripts and frames but not its stylesheet, so the browser blocked
 * card-wrapper.css and Square threw "An unexpected error occurred while using
 * Card." Every card payment in Sales, Rentals and Lease to Own failed, and
 * nothing in the app's own code was wrong.
 *
 *   cd frontend
 *   node tests/securityHeaders.test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const conf = readFileSync(join(here, '..', 'security-headers.conf'), 'utf8')

let failures = 0
const ok = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures += 1
}

const header = conf.match(/add_header Content-Security-Policy "([^"]+)"/)
ok('the config sets a Content-Security-Policy', Boolean(header))
const directives = Object.fromEntries((header?.[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
  .map(part => { const [name, ...sources] = part.split(/\s+/); return [name, sources] }))
const allows = (directive, source) => (directives[directive] ?? directives['default-src'] ?? []).includes(source)

// What Square's Web Payments SDK loads into our page, sandbox and production alike.
const SQUARE = [
  ['script-src', 'https://*.squarecdn.com', 'the SDK script'],
  ['style-src', 'https://*.squarecdn.com', 'card-wrapper.css (the one that was blocked)'],
  ['font-src', 'https://*.squarecdn.com', 'Square fonts'],
  ['frame-src', 'https://*.squarecdn.com', 'the secure card iframe'],
  ['frame-src', 'https://*.cardinalcommerce.com', '3-D Secure card verification'],
  ['connect-src', 'https://*.squareup.com', 'production card tokenization'],
  ['connect-src', 'https://*.squareupsandbox.com', 'sandbox card tokenization'],
]
for (const [directive, source, what] of SQUARE) {
  ok(`${directive} allows ${source} (${what})`, allows(directive, source), (directives[directive] ?? []).join(' '))
}

console.log()
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All security header checks passed')
