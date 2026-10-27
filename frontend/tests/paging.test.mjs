/**
 * Checks for src/utils/paging.ts.
 *
 * This exists because of a specific failure: the HR month grid and the
 * employee attendance sheet both asked /attendance/events for 5000 rows
 * against a cap of 500. FastAPI answers that with a 422 before the handler
 * runs, so the request failed every single time and both pages drew the empty
 * result as a month of absences. The fix is to page; these are the checks that
 * the paging is right, including the ways a loop like this hangs.
 *
 *   cd frontend
 *   node tests/run-paging.mjs
 */
import { pageThrough } from './.build/paging.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

/** A server holding `count` rows that honours skip/limit. */
const server = (count) => {
  const calls = []
  const rows = Array.from({ length: count }, (_, i) => ({ id: i + 1 }))
  return {
    calls,
    fetchPage: async (skip, limit) => {
      calls.push({ skip, limit })
      return { items: rows.slice(skip, skip + limit), total: count }
    },
  }
}

console.log('Paging')
console.log('='.repeat(72))

console.log('\nIt collects everything, in order')
console.log('-'.repeat(72))

let s = server(1250)
let out = await pageThrough(s.fetchPage, 500, 20000)
ok('every row is returned', out.items.length === 1250, String(out.items.length))
ok('  in order', out.items[0].id === 1 && out.items[1249].id === 1250)
ok('  with the real total', out.total === 1250)
ok('  in three requests', s.calls.length === 3, JSON.stringify(s.calls.map(c => c.skip)))
ok('  each within the cap', s.calls.every(c => c.limit === 500))

console.log('\nEdge cases around the page boundary')
console.log('-'.repeat(72))

s = server(1000)
out = await pageThrough(s.fetchPage, 500, 20000)
ok('an exact multiple does not fetch a wasted empty page',
   out.items.length === 1000 && s.calls.length === 2, String(s.calls.length))

s = server(500)
out = await pageThrough(s.fetchPage, 500, 20000)
ok('exactly one full page stops after one request',
   out.items.length === 500 && s.calls.length === 1, String(s.calls.length))

s = server(1)
out = await pageThrough(s.fetchPage, 500, 20000)
ok('a single row works', out.items.length === 1 && s.calls.length === 1)

s = server(0)
out = await pageThrough(s.fetchPage, 500, 20000)
ok('no rows returns empty, not undefined', Array.isArray(out.items) && out.items.length === 0)
ok('  and a zero total', out.total === 0)

console.log('\nIt cannot run away')
console.log('-'.repeat(72))

s = server(100000)
out = await pageThrough(s.fetchPage, 500, 2000)
ok('maxItems stops the walk', out.items.length === 2000, String(out.items.length))
ok('  and still reports what the server says exists, so the caller can tell',
   out.total === 100000, String(out.total))

// A server that ignores skip would otherwise be an infinite loop.
let ignoredSkipCalls = 0
out = await pageThrough(async () => {
  ignoredSkipCalls += 1
  return { items: Array.from({ length: 500 }, (_, i) => ({ id: i })), total: 1e9 }
}, 500, 1000000)
ok('a server that ignores skip is detected rather than looped on',
   ignoredSkipCalls === 2, `${ignoredSkipCalls} calls`)

console.log('\nIt survives a server that answers oddly')
console.log('-'.repeat(72))

out = await pageThrough(async () => undefined, 500, 20000)
ok('an undefined page is treated as empty', out.items.length === 0)

out = await pageThrough(async () => ({ items: [{ id: 1 }] }), 500, 20000)
ok('a missing total falls back to what was collected', out.total === 1, String(out.total))

out = await pageThrough(async (skip) => (
  skip === 0 ? { items: [{ id: 1 }, { id: 2 }], total: 999 } : { items: [], total: 999 }
), 500, 20000)
ok('a total larger than reality does not cause a second request',
   out.items.length === 2, String(out.items.length))

let threw = null
try {
  await pageThrough(async () => ({ items: [], total: 0 }), 0, 100)
} catch (e) { threw = e }
ok('a zero page limit is rejected rather than looping for ever', threw !== null)

console.log('\nThe cap matches the server')
console.log('-'.repeat(72))

const { readFileSync } = await import('node:fs')
const apiSrc = readFileSync(new URL('../src/api/attendance.ts', import.meta.url), 'utf8')
const backend = readFileSync(
  new URL('../../backend/app/api/v1/endpoints/attendance.py', import.meta.url), 'utf8')

const declared = Number(/ATTENDANCE_EVENTS_PAGE_LIMIT = (\d+)/.exec(apiSrc)?.[1])
const caps = [...backend.matchAll(/limit: int = Query\(\d+, ge=1, le=(\d+)\)/g)].map(m => Number(m[1]))
ok('the frontend page size is declared once', Number.isFinite(declared), String(declared))
ok('the events endpoint caps at that same number', caps.includes(declared),
   `frontend ${declared}, backend caps ${caps.join(',')}`)
ok('nothing asks the attendance API for more than the cap in one go',
   !/limit:\s*(\d+)/.test(apiSrc.replace(/ATTENDANCE_EVENTS_PAGE_LIMIT = \d+/, '')) ,
   'no bare numeric limit left in the attendance client')

console.log('\n' + '='.repeat(72))
if (fails.length) { console.log(`${fails.length} failing: ${fails.join(', ')}`); process.exit(1) }
console.log('All paging checks passed.')
