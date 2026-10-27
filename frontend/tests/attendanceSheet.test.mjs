/**
 * Checks for src/utils/attendanceSheet.ts.
 *
 * Fixtures are built the way the real thing arrives: event_time as a naive UTC
 * string, with the capturing device's zone beside it. The headline case is the
 * Pakistan 6PM-3AM shift, because that is the one every naive implementation
 * gets wrong.
 *
 *   cd frontend
 *   node tests/run-attendanceSheet.mjs
 */
import {
  attendanceDayStatus, breakMillis, buildSheetRows, eventsForDay, hoursLabel, isWorkingDay,
} from './.build/attendanceSheet.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

const KHI = 'Asia/Karachi'   // UTC+5, no DST
let nextId = 1

/** An event given in UTC wall-clock, which is how the API stores it. */
const ev = (utc, type, { tz = KHI, user = 7, review = 'verified' } = {}) => ({
  id: nextId++,
  user_id: user,
  event_type: type,
  event_time: utc,
  timezone: tz,
  verification_status: review,
})

const policy = (over = {}) => ({
  id: 1,
  name: 'Test',
  workHoursPerDay: 8,
  shiftStart: null,
  shiftEnd: null,
  lateGraceMinutes: 15,
  earlyDepartureGraceMinutes: 15,
  lateStrikeAction: 'none',
  consecutiveLateLimit: 3,
  ...over,
})

const ctxOf = (events, extra = {}) => ({
  events,
  leaves: [],
  holidayDates: new Set(),
  today: '2026-10-31',
  // Enrolled well before the fixtures, so a blank working day is a real
  // absence unless a test says otherwise.
  enrolledFrom: () => '2026-01-01',
  policyFor: () => policy(),
  ...extra,
})

console.log('Attendance sheet')
console.log('='.repeat(72))

console.log('\nThe 6PM-3AM Karachi shift, start to finish')
console.log('-'.repeat(72))
// Mon 5 Oct: in 18:00, break 22:00-22:30, out 03:00 on Tue 6 Oct.
// In UTC that is 13:00, 17:00, 17:30 and 22:00 -- all on the 5th.
const night = [
  ev('2026-10-05T13:00:00', 'check_in'),
  ev('2026-10-05T17:00:00', 'break_start'),
  ev('2026-10-05T17:30:00', 'break_end'),
  ev('2026-10-05T22:00:00', 'check_out'),
]
const nightCtx = ctxOf(night)
const nightRows = buildSheetRows(nightCtx, 7, ['2026-10-05', '2026-10-06', '2026-10-07'])
const mon = nightRows[0]
const tue = nightRows[1]

ok('check-in reads as 18:00, not 13:00', mon.checkIn === '18:00', mon.checkIn)
ok('the check-out is pulled back to the night it belongs to', mon.checkOut === '03:00', mon.checkOut)
ok('  and is flagged as landing the next day', mon.checkOutNextDay === true)
ok('Monday counts as present', mon.status === 'present', mon.status)
ok('break is 30 minutes', mon.breakMs === 30 * 60_000, String(mon.breakMs / 60_000) + 'm')
ok('worked is 9h span less the break', mon.workedMs === 8.5 * 3_600_000, hoursLabel(mon.workedMs))

console.log('\n  ...and Tuesday morning is not double counted')
ok('Tuesday is NOT marked present off the borrowed check-out',
   tue.status === 'absent', tue.status)
ok('  Tuesday shows no check-out of its own', tue.checkOut === '', tue.checkOut)
ok('  and no phantom hours', tue.workedMs === 0, hoursLabel(tue.workedMs))

console.log('\nThe bug this started from: bucketing by UTC')
console.log('-'.repeat(72))
// 02:00 PKT on the 6th is 21:00 UTC on the 5th. Slicing the UTC string put
// this on the 5th; it belongs on the 6th.
const earlyOnly = ctxOf([ev('2026-10-05T21:00:00', 'check_in')])
ok('an 02:00 arrival lands on the day it happened',
   attendanceDayStatus(earlyOnly, 7, '2026-10-06') === 'present',
   attendanceDayStatus(earlyOnly, 7, '2026-10-06'))
ok('  and not on the UTC day', attendanceDayStatus(earlyOnly, 7, '2026-10-05') === 'absent',
   attendanceDayStatus(earlyOnly, 7, '2026-10-05'))

console.log('\nA failed check-in scan is not an absence')
console.log('-'.repeat(72))
const outOnly = ctxOf([ev('2026-10-05T22:00:00', 'check_out')])
ok('a lone check-out still counts as present',
   attendanceDayStatus(outOnly, 7, '2026-10-06') === 'present')
const breakOnly = ctxOf([ev('2026-10-05T17:00:00', 'break_start')])
ok('a break on its own does not', attendanceDayStatus(breakOnly, 7, '2026-10-05') === 'absent')

console.log('\nDay classification')
console.log('-'.repeat(72))
const empty = ctxOf([])
ok('Saturday is a day off', attendanceDayStatus(empty, 7, '2026-10-03') === 'day_off')
ok('Sunday is a day off', attendanceDayStatus(empty, 7, '2026-10-04') === 'day_off')
ok('a holiday beats a weekday',
   attendanceDayStatus(ctxOf([], { holidayDates: new Set(['2026-10-05']) }), 7, '2026-10-05') === 'holiday')
ok('approved leave beats an empty day',
   attendanceDayStatus(ctxOf([], {
     leaves: [{ user_id: 7, start_date: '2026-10-05', end_date: '2026-10-09' }],
   }), 7, '2026-10-07') === 'on_leave')
ok('  but only for that employee',
   attendanceDayStatus(ctxOf([], {
     leaves: [{ user_id: 99, start_date: '2026-10-05', end_date: '2026-10-09' }],
   }), 7, '2026-10-07') === 'absent')
ok('a day after today is future, not absent',
   attendanceDayStatus(ctxOf([], { today: '2026-10-05' }), 7, '2026-10-06') === 'future')
ok('but a future day with a scan is present, not future',
   attendanceDayStatus(ctxOf([ev('2026-10-06T09:00:00', 'check_in')], { today: '2026-10-05' }),
                       7, '2026-10-06') === 'present')

console.log('\nWorking days, for the present/expected denominator')
console.log('-'.repeat(72))
ok('a past weekday counts', isWorkingDay(ctxOf([], { today: '2026-10-31' }), '2026-10-05') === true)
ok('a weekend does not', isWorkingDay(ctxOf([], { today: '2026-10-31' }), '2026-10-04') === false)
ok('a holiday does not',
   isWorkingDay(ctxOf([], { today: '2026-10-31', holidayDates: new Set(['2026-10-05']) }), '2026-10-05') === false)
ok('a day that has not happened does not',
   isWorkingDay(ctxOf([], { today: '2026-10-05' }), '2026-10-20') === false)

console.log('\nBreaks')
console.log('-'.repeat(72))
ok('two breaks add up', breakMillis([
  ev('2026-10-05T15:00:00', 'break_start'), ev('2026-10-05T15:15:00', 'break_end'),
  ev('2026-10-05T18:00:00', 'break_start'), ev('2026-10-05T18:30:00', 'break_end'),
]) === 45 * 60_000)
ok('an unclosed break contributes nothing, not the rest of the day', breakMillis([
  ev('2026-10-05T15:00:00', 'break_start'),
]) === 0)
ok('a stray break_end is ignored', breakMillis([ev('2026-10-05T15:00:00', 'break_end')]) === 0)
ok('a second break_start before an end does not restart the clock', breakMillis([
  ev('2026-10-05T15:00:00', 'break_start'),
  ev('2026-10-05T15:10:00', 'break_start'),
  ev('2026-10-05T15:30:00', 'break_end'),
]) === 30 * 60_000)

console.log('\nThe borrowing rule has limits')
console.log('-'.repeat(72))
// A check-out more than 16h later is somebody's next shift, not this one.
const stale = ctxOf([
  ev('2026-10-05T13:00:00', 'check_in'),          // 18:00 Mon
  ev('2026-10-06T12:00:00', 'check_out'),         // 17:00 Tue -- 23h later
])
const staleRows = buildSheetRows(stale, 7, ['2026-10-05', '2026-10-06'])
ok('a check-out 23h later is not borrowed', staleRows[0].checkOut === '', staleRows[0].checkOut)
ok('  it stays on its own day', staleRows[1].checkOut === '17:00', staleRows[1].checkOut)
ok('  which is then present in its own right', staleRows[1].status === 'present')

// A day that already has its own check-out borrows nothing.
const sameDay = ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),          // 09:00
  ev('2026-10-05T12:00:00', 'check_out'),         // 17:00
  ev('2026-10-06T04:00:00', 'check_in'),
  ev('2026-10-06T12:00:00', 'check_out'),
])
const sameRows = buildSheetRows(sameDay, 7, ['2026-10-05', '2026-10-06'])
ok('a normal day keeps its own check-out', sameRows[0].checkOut === '17:00' && !sameRows[0].checkOutNextDay)
ok('  and the next day keeps its own too', sameRows[1].checkOut === '17:00' && !sameRows[1].checkOutNextDay)
ok('  8h worked, no break', sameRows[0].workedMs === 8 * 3_600_000, hoursLabel(sameRows[0].workedMs))
ok('the last day of the range cannot borrow past the edge',
   buildSheetRows(ctxOf([ev('2026-10-05T13:00:00', 'check_in')]), 7, ['2026-10-05'])[0].checkOut === '')

console.log('\nOnly this employee')
console.log('-'.repeat(72))
const mixed = ctxOf([
  ev('2026-10-05T04:00:00', 'check_in', { user: 7 }),
  ev('2026-10-05T05:00:00', 'check_in', { user: 8 }),
])
ok('events are filtered by user', eventsForDay(mixed, 7, '2026-10-05').length === 1)
ok('  the other employee is unaffected', eventsForDay(mixed, 8, '2026-10-05').length === 1)

console.log('\nFlags and formatting')
console.log('-'.repeat(72))
const flagged = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in', { review: 'needs_review' }),
]), 7, ['2026-10-05'])[0]
ok('a needs_review scan raises the flag', flagged.needsReview === true)
ok('a verified one does not',
   buildSheetRows(ctxOf([ev('2026-10-05T04:00:00', 'check_in')]), 7, ['2026-10-05'])[0].needsReview === false)
ok('hours render as 8h 30m', hoursLabel(8.5 * 3_600_000) === '8h 30m', hoursLabel(8.5 * 3_600_000))
ok('a whole hour drops the minutes', hoursLabel(2 * 3_600_000) === '2h')
ok('zero is a dash, not 0h', hoursLabel(0) === '—')
ok('negative is a dash too', hoursLabel(-5) === '—')
ok('59.7 minutes rounds to 1h, not 0h 60m', hoursLabel(59.7 * 60_000) === '1h', hoursLabel(59.7 * 60_000))

console.log('\nBad data does not take the sheet down')
console.log('-'.repeat(72))
const junk = ctxOf([
  ev('not-a-timestamp', 'check_in'),
  ev('2026-10-05T04:00:00', 'check_in', { tz: 'Nowhere/Fake' }),
])
let threw = null
try { buildSheetRows(junk, 7, ['2026-10-05', '2026-10-06']) } catch (e) { threw = e }
ok('an unparseable timestamp and a bogus zone do not throw', threw === null, String(threw ?? ''))
ok('an employee with no events at all yields a full set of rows',
   buildSheetRows(ctxOf([]), 7, ['2026-10-05', '2026-10-06']).length === 2)


console.log('\nHalf day, measured from the hours actually worked')
console.log('-'.repeat(72))
// 09:00 to 17:00 Karachi is 04:00 to 12:00 UTC.
let r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T12:00:00', 'check_out'),
]), 7, ['2026-10-05'])[0]
ok('eight hours on an eight hour policy is present', r.status === 'present', r.status)

r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T08:00:00', 'check_out'),
]), 7, ['2026-10-05'])[0]
ok('four hours is a half day', r.status === 'half_day', r.status)
ok('  and the hours are reported', hoursLabel(r.workedMs) === '4h', hoursLabel(r.workedMs))

r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T11:50:00', 'check_out'),
]), 7, ['2026-10-05'])[0]
ok('leaving inside the early-departure grace is still a full day', r.status === 'present', r.status)

r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T11:40:00', 'check_out'),
]), 7, ['2026-10-05'])[0]
ok('leaving outside it is not', r.status === 'half_day', r.status)

r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T10:00:00', 'check_out'),
], { policyFor: () => policy({ workHoursPerDay: 6 }) }), 7, ['2026-10-05'])[0]
ok('the policy decides what a full day is', r.status === 'present', r.status)

r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T07:00:00', 'break_start'),
  ev('2026-10-05T10:00:00', 'break_end'),
  ev('2026-10-05T12:00:00', 'check_out'),
]), 7, ['2026-10-05'])[0]
ok('a long break can turn a full span into a half day', r.status === 'half_day',
   hoursLabel(r.workedMs))

console.log('\nAn unfinished day is not half a day')
console.log('-'.repeat(72))
r = buildSheetRows(ctxOf([ev('2026-10-05T04:00:00', 'check_in')], { today: '2026-10-05' }),
                   7, ['2026-10-05'])[0]
ok('checked in and not yet out is present, not half', r.status === 'present', r.status)
ok('  and is flagged as an open shift', r.openShift === true)
ok('  with no hours claimed', r.workedMs === 0)

r = buildSheetRows(ctxOf([ev('2026-10-05T04:00:00', 'check_in')], { today: '2026-10-31' }),
                   7, ['2026-10-05'])[0]
ok('a forgotten check-out on a past day is still present, not a half day',
   r.status === 'present', r.status)

console.log('\nAbsent, and when we are not entitled to say it')
console.log('-'.repeat(72))
ok('a past working day with nothing recorded is absent',
   attendanceDayStatus(ctxOf([]), 7, '2026-10-05') === 'absent')
ok('the same day before the employee was enrolled is not',
   attendanceDayStatus(ctxOf([], { enrolledFrom: () => '2026-10-20' }), 7, '2026-10-05') === 'not_added')
ok('  and on the enrolment day itself it is',
   attendanceDayStatus(ctxOf([], { enrolledFrom: () => '2026-10-05' }), 7, '2026-10-05') === 'absent')
ok('an unknown enrolment date never produces an absence',
   attendanceDayStatus(ctxOf([], { enrolledFrom: () => null }), 7, '2026-10-05') === 'not_added')
ok('a weekend is a day off, not an absence',
   attendanceDayStatus(ctxOf([]), 7, '2026-10-03') === 'day_off')
ok('a holiday is not an absence',
   attendanceDayStatus(ctxOf([], { holidayDates: new Set(['2026-10-05']) }), 7, '2026-10-05') === 'holiday')
ok('leave is not an absence',
   attendanceDayStatus(ctxOf([], {
     leaves: [{ user_id: 7, start_date: '2026-10-05', end_date: '2026-10-05' }],
   }), 7, '2026-10-05') === 'on_leave')

console.log('\nLate arrival, and the consecutive-late strike')
console.log('-'.repeat(72))
const shift9 = { policyFor: () => policy({ shiftStart: '09:00' }) }
ok('09:10 is inside the grace',
   buildSheetRows(ctxOf([ev('2026-10-05T04:10:00', 'check_in'),
                         ev('2026-10-05T12:10:00', 'check_out')], shift9),
                  7, ['2026-10-05'])[0].late === false)
r = buildSheetRows(ctxOf([ev('2026-10-05T04:30:00', 'check_in'),
                          ev('2026-10-05T12:30:00', 'check_out')], shift9), 7, ['2026-10-05'])[0]
ok('09:30 is late', r.late === true)
ok('  but being late alone does not cost the day', r.status === 'present', r.status)
ok('lateness is unknowable without a pinned shift start',
   buildSheetRows(ctxOf([ev('2026-10-05T04:30:00', 'check_in')]), 7, ['2026-10-05'])[0].late === false)

let strikeRows = buildSheetRows(ctxOf([
  ev('2026-10-05T04:30:00', 'check_in'), ev('2026-10-05T12:30:00', 'check_out'),
  ev('2026-10-06T04:30:00', 'check_in'), ev('2026-10-06T12:30:00', 'check_out'),
  ev('2026-10-07T04:30:00', 'check_in'), ev('2026-10-07T12:30:00', 'check_out'),
], { policyFor: () => policy({ shiftStart: '09:00', lateStrikeAction: 'half_day', consecutiveLateLimit: 3 }) }),
  7, ['2026-10-05', '2026-10-06', '2026-10-07'])
ok('the first two late days stand',
   strikeRows[0].status === 'present' && strikeRows[1].status === 'present')
ok('the third trips the strike', strikeRows[2].lateStrike === true)
ok('  and costs half a day', strikeRows[2].status === 'half_day', strikeRows[2].status)

strikeRows = buildSheetRows(ctxOf([
  ev('2026-10-05T04:30:00', 'check_in'), ev('2026-10-05T12:30:00', 'check_out'),
  ev('2026-10-06T04:30:00', 'check_in'), ev('2026-10-06T12:30:00', 'check_out'),
], { policyFor: () => policy({ shiftStart: '09:00', lateStrikeAction: 'full_day', consecutiveLateLimit: 2 }) }),
  7, ['2026-10-05', '2026-10-06'])
ok('a full_day strike costs the whole day', strikeRows[1].status === 'absent', strikeRows[1].status)

strikeRows = buildSheetRows(ctxOf([
  ev('2026-10-05T04:30:00', 'check_in'), ev('2026-10-05T12:30:00', 'check_out'),
  ev('2026-10-06T04:30:00', 'check_in'), ev('2026-10-06T12:30:00', 'check_out'),
], { policyFor: () => policy({ shiftStart: '09:00', lateStrikeAction: 'none', consecutiveLateLimit: 2 }) }),
  7, ['2026-10-05', '2026-10-06'])
ok('an action of none never strikes', strikeRows.every(x => !x.lateStrike))

strikeRows = buildSheetRows(ctxOf([
  ev('2026-10-05T04:30:00', 'check_in'), ev('2026-10-05T12:30:00', 'check_out'),
  ev('2026-10-06T04:05:00', 'check_in'), ev('2026-10-06T12:05:00', 'check_out'),
  ev('2026-10-07T04:30:00', 'check_in'), ev('2026-10-07T12:30:00', 'check_out'),
], { policyFor: () => policy({ shiftStart: '09:00', lateStrikeAction: 'half_day', consecutiveLateLimit: 2 }) }),
  7, ['2026-10-05', '2026-10-06', '2026-10-07'])
ok('an on-time day resets the run', strikeRows.every(x => !x.lateStrike),
   strikeRows.map(x => x.status).join(','))

console.log('\nChecking out updates the record')
console.log('-'.repeat(72))
ok('before the check-out the day reads present with no hours',
   buildSheetRows(ctxOf([ev('2026-10-05T04:00:00', 'check_in')], { today: '2026-10-05' }),
                  7, ['2026-10-05'])[0].workedMs === 0)
r = buildSheetRows(ctxOf([
  ev('2026-10-05T04:00:00', 'check_in'),
  ev('2026-10-05T08:00:00', 'check_out'),
], { today: '2026-10-05' }), 7, ['2026-10-05'])[0]
ok('after a short check-out it becomes a half day', r.status === 'half_day', r.status)
ok('  with the hours filled in', r.workedMs === 4 * 3600000)

console.log('\nThe event index')
console.log('-'.repeat(72))
const many = ctxOf([
  ev('2026-10-05T04:00:00', 'check_in', { user: 7 }),
  ev('2026-10-05T04:00:00', 'check_in', { user: 8 }),
  ev('2026-10-06T04:00:00', 'check_in', { user: 7 }),
])
ok('events are bucketed by employee and day',
   eventsForDay(many, 7, '2026-10-05').length === 1
   && eventsForDay(many, 8, '2026-10-05').length === 1
   && eventsForDay(many, 7, '2026-10-06').length === 1)
ok('a day with nothing returns an empty list', eventsForDay(many, 7, '2026-10-09').length === 0)
ok('an unknown employee returns an empty list', eventsForDay(many, 999, '2026-10-05').length === 0)

console.log('\n' + '='.repeat(72))
if (fails.length) { console.log(`${fails.length} failing: ${fails.join(', ')}`); process.exit(1) }
console.log('All attendance sheet checks passed.')
