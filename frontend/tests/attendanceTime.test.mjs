/**
 * Checks for src/utils/attendanceTime.ts.
 *
 * The project has no frontend test runner and this does not add one. The
 * helper is compiled with the esbuild that Vite already depends on, then
 * exercised as plain JavaScript, so what runs here is the code that ships.
 *
 *   cd frontend
 *   node tests/run-attendanceTime.mjs
 */
import { asUtc, eventLocalParts, eventLocalDate, eventLocalTime, dayOfWeek, datesBetween, paddedUtcRange, todayInZone } from './.build/attendanceTime.mjs'

let fails = []
const ok = (label, cond, detail='') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

console.log('Attendance time helpers'); console.log('='.repeat(72))

console.log('\nThe bug that started this: early-morning Karachi events')
console.log('-'.repeat(72))
// 03:00 PKT on the 5th is 22:00 UTC on the 4th -- slice(0,10) said the 4th.
const earlyAm = '2026-10-04T22:00:00'
ok('old slice(0,10) gave the WRONG day', earlyAm.slice(0,10) === '2026-10-04')
ok('helper gives the day it actually was', eventLocalDate(earlyAm, 'Asia/Karachi') === '2026-10-05', eventLocalDate(earlyAm,'Asia/Karachi'))
ok('  and the wall-clock time', eventLocalTime(earlyAm, 'Asia/Karachi') === '03:00', eventLocalTime(earlyAm,'Asia/Karachi'))

// The 6PM-3AM shift: start and end
const shiftStart = '2026-10-04T13:00:00'   // 18:00 PKT on the 4th
ok('shift start 18:00 PKT -> 4th', eventLocalDate(shiftStart,'Asia/Karachi') === '2026-10-04' && eventLocalTime(shiftStart,'Asia/Karachi') === '18:00',
   eventLocalDate(shiftStart,'Asia/Karachi')+' '+eventLocalTime(shiftStart,'Asia/Karachi'))
ok('shift end 03:00 PKT -> 5th (next calendar day)', eventLocalDate(earlyAm,'Asia/Karachi') === '2026-10-05')

console.log('\nMidnight does not render as 24')
console.log('-'.repeat(72))
const midnight = '2026-10-04T19:00:00'  // 00:00 PKT on the 5th
ok('00:00 not 24:00', eventLocalTime(midnight,'Asia/Karachi') === '00:00', eventLocalTime(midnight,'Asia/Karachi'))
ok('  and rolls the date forward', eventLocalDate(midnight,'Asia/Karachi') === '2026-10-05')

console.log('\nOther zones, and a US negative offset')
console.log('-'.repeat(72))
ok('Chicago 09:00 CDT', eventLocalTime('2026-10-05T14:00:00','America/Chicago') === '09:00', eventLocalTime('2026-10-05T14:00:00','America/Chicago'))
ok('Chicago late evening stays on its own day', eventLocalDate('2026-10-06T02:00:00','America/Chicago') === '2026-10-05', eventLocalDate('2026-10-06T02:00:00','America/Chicago'))
ok('UTC zone passes through', eventLocalDate('2026-10-05T23:30:00','UTC') === '2026-10-05')

console.log('\nIt never throws on bad input')
console.log('-'.repeat(72))
ok('unknown zone falls back instead of throwing', eventLocalDate('2026-10-04T22:00:00','Not/AZone') === '2026-10-05', eventLocalDate('2026-10-04T22:00:00','Not/AZone'))
ok('empty zone uses the default', eventLocalDate('2026-10-04T22:00:00','') === '2026-10-05')
ok('null zone uses the default', eventLocalDate('2026-10-04T22:00:00', null) === '2026-10-05')
ok('null value returns empty, not a crash', eventLocalDate(null,'UTC') === '')
ok('garbage value returns empty', eventLocalDate('not-a-date','UTC') === '')
ok('  and reports NaN epoch', Number.isNaN(eventLocalParts('not-a-date','UTC').epochMs))

console.log('\nAlready-zoned strings are left alone')
console.log('-'.repeat(72))
ok('Z suffix not doubled', asUtc('2026-10-04T22:00:00Z') === '2026-10-04T22:00:00Z')
ok('+05:00 offset respected', asUtc('2026-10-05T03:00:00+05:00') === '2026-10-05T03:00:00+05:00')
ok('  and reads as the same instant', eventLocalDate('2026-10-05T03:00:00+05:00','Asia/Karachi') === '2026-10-05')
ok('naive gets a Z', asUtc('2026-10-04T22:00:00') === '2026-10-04T22:00:00Z')

console.log('\ndayOfWeek is stable regardless of the viewer')
console.log('-'.repeat(72))
ok('2026-10-05 is a Monday', dayOfWeek('2026-10-05') === 1, String(dayOfWeek('2026-10-05')))
ok('2026-10-03 is a Saturday', dayOfWeek('2026-10-03') === 6)
ok('2026-10-04 is a Sunday', dayOfWeek('2026-10-04') === 0)

console.log('\nRange helpers')
console.log('-'.repeat(72))
ok('inclusive on both ends', datesBetween('2026-10-01','2026-10-31').length === 31)
ok('single day', JSON.stringify(datesBetween('2026-10-05','2026-10-05')) === '["2026-10-05"]')
ok('inverted range is empty, not infinite', datesBetween('2026-10-31','2026-10-01').length === 0)
ok('spans a month boundary', datesBetween('2026-10-30','2026-11-02').join(',') === '2026-10-30,2026-10-31,2026-11-01,2026-11-02')
ok('spans a DST change (Chicago Nov)', datesBetween('2026-11-01','2026-11-02').length === 2)
const pad = paddedUtcRange('2026-10-01','2026-10-31')
ok('padding reaches back a day', pad.date_from === '2026-09-30', pad.date_from)
ok('padding reaches forward a day', pad.date_to === '2026-11-01', pad.date_to)
ok('todayInZone looks like a date', /^\d{4}-\d{2}-\d{2}$/.test(todayInZone('Asia/Karachi')), todayInZone('Asia/Karachi'))

console.log('\n' + '='.repeat(72))
if (fails.length) { console.log(`${fails.length} failing: ${fails.join(', ')}`); process.exit(1) }
console.log('All attendance time checks passed.')
