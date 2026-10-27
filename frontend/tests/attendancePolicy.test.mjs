/**
 * Checks for src/utils/attendancePolicy.ts.
 *
 * Which policy applies decides what a full day is, so getting it wrong turns
 * present into half_day for a whole department. The resolution order is
 * assignment, then role, then the default policy, then a built-in fallback --
 * and an unconfigured system still has to be able to say somebody turned up.
 *
 *   cd frontend
 *   node tests/run-attendancePolicy.mjs
 */
import {
  FALLBACK_POLICY, buildPolicyResolver, minutesOfDay, toPolicyRules,
} from './.build/attendancePolicy.mjs'

const fails = []
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`)
  if (!cond) fails.push(label)
}

const apiPolicy = (over = {}) => ({
  id: 1,
  name: 'Pakistan night',
  shift_start_time: '18:00',
  shift_end_time: '03:00',
  late_arrival_grace_minutes: 10,
  early_departure_grace_minutes: 20,
  work_hours_per_day: 9,
  consecutive_late_limit: 2,
  late_strike_action: 'half_day',
  is_active: true,
  is_default: false,
  applicable_roles: null,
  ...over,
})

console.log('Attendance policy')
console.log('='.repeat(72))

console.log('\nReading one policy record')
console.log('-'.repeat(72))
let rules = toPolicyRules(apiPolicy())
ok('hours come across', rules.workHoursPerDay === 9)
ok('shift start comes across', rules.shiftStart === '18:00')
ok('late grace comes across', rules.lateGraceMinutes === 10)
ok('early departure grace comes across', rules.earlyDepartureGraceMinutes === 20)
ok('strike action comes across', rules.lateStrikeAction === 'half_day')
ok('late limit comes across', rules.consecutiveLateLimit === 2)

console.log('\nNonsense never reaches the classifier')
console.log('-'.repeat(72))
ok('a zero-hour working day falls back rather than making every day half',
   toPolicyRules(apiPolicy({ work_hours_per_day: 0 })).workHoursPerDay === 8)
ok('a negative working day falls back',
   toPolicyRules(apiPolicy({ work_hours_per_day: -4 })).workHoursPerDay === 8)
ok('a non-numeric working day falls back',
   toPolicyRules(apiPolicy({ work_hours_per_day: 'eight' })).workHoursPerDay === 8)
ok('a malformed shift time becomes null, not a bad comparison',
   toPolicyRules(apiPolicy({ shift_start_time: '6pm' })).shiftStart === null)
ok('an empty shift time becomes null',
   toPolicyRules(apiPolicy({ shift_start_time: '' })).shiftStart === null)
ok('an unknown strike action is treated as none',
   toPolicyRules(apiPolicy({ late_strike_action: 'fire_them' })).lateStrikeAction === 'none')
ok('a zero late limit cannot strike on every single day',
   toPolicyRules(apiPolicy({ consecutive_late_limit: 0 })).consecutiveLateLimit === 1)
ok('an entirely absent record gives the fallback',
   toPolicyRules(undefined).workHoursPerDay === FALLBACK_POLICY.workHoursPerDay)

console.log('\nResolution order')
console.log('-'.repeat(72))
const night = apiPolicy({ id: 1, name: 'Night', work_hours_per_day: 9 })
const office = apiPolicy({ id: 2, name: 'Office', work_hours_per_day: 8, is_default: true })
const techs = apiPolicy({ id: 3, name: 'Techs', work_hours_per_day: 7, applicable_roles: ['technician'] })

let resolve = buildPolicyResolver([night, office, techs], [{ user_id: 7, policy_id: 1 }])
ok('an explicit assignment wins', resolve(7, 'technician').name === 'Night',
   resolve(7, 'technician').name)
ok('a role match is used when there is no assignment',
   resolve(8, 'technician').name === 'Techs', resolve(8, 'technician').name)
ok('the default policy catches everyone else',
   resolve(9, 'employee').name === 'Office', resolve(9, 'employee').name)
ok('  including someone with no role at all',
   resolve(10, null).name === 'Office')

resolve = buildPolicyResolver([], [])
ok('no policies configured still resolves', resolve(7, 'employee').workHoursPerDay === 8)
ok('  to the named fallback', resolve(7, 'employee').name === FALLBACK_POLICY.name)

resolve = buildPolicyResolver([apiPolicy({ id: 1, is_active: false, is_default: true })], [])
ok('an inactive policy is never used', resolve(7, 'employee').id === null)

resolve = buildPolicyResolver([night, office], [{ user_id: 7, policy_id: 99 }])
ok('an assignment pointing at a policy that no longer exists falls through',
   resolve(7, 'employee').name === 'Office', resolve(7, 'employee').name)

resolve = buildPolicyResolver([night, office], [{ user_id: 7, policy_id: null }])
ok('an assignment with no policy falls through too',
   resolve(7, 'employee').name === 'Office')

ok('a null assignment list does not throw',
   buildPolicyResolver([office], null)(7, 'employee').name === 'Office')
ok('a null policy list does not throw',
   buildPolicyResolver(null, [])(7, 'employee').name === FALLBACK_POLICY.name)

console.log('\nShift times')
console.log('-'.repeat(72))
ok('09:00 is 540 minutes', minutesOfDay('09:00') === 540)
ok('00:00 is 0, not null', minutesOfDay('00:00') === 0)
ok('18:30 is 1110', minutesOfDay('18:30') === 1110)
ok('a bad hour is rejected', minutesOfDay('99:00') === null)
ok('a bad minute is rejected', minutesOfDay('09:99') === null)
ok('junk is rejected', minutesOfDay('later') === null)
ok('null is rejected', minutesOfDay(null) === null)

console.log('\n' + '='.repeat(72))
if (fails.length) { console.log(`${fails.length} failing: ${fails.join(', ')}`); process.exit(1) }
console.log('All attendance policy checks passed.')
