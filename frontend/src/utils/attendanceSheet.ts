/**
 * Turning raw attendance scans into a verdict for each day.
 *
 * Kept apart from the React page on purpose. This is the part that decides
 * whether somebody was at work and for how long, which is the part that has
 * to be right; the pages around it are tables.
 *
 * The month grid and the single-employee sheet both read through here, so the
 * two cannot disagree about whether somebody turned up.
 *
 * The verdicts, in the order they are decided:
 *
 *   holiday    a company holiday
 *   day_off    outside the working week
 *   on_leave   approved leave covers the day
 *   future     later than today, nothing to say yet
 *   not_added  no scans, and no grounds to call it an absence -- before the
 *              employee was enrolled there was no way for them to be recorded
 *   absent     a working day, they were enrolled, and nothing was recorded
 *   half_day   measured hours fell short of the policy's working day
 *   present    they were here
 *
 * Nobody who was recorded on site is ever called absent. Short hours are a
 * half day; absence means the system holds nothing at all for a day it could
 * have.
 */
import { dayOfWeek, eventLocalDate, eventLocalParts, eventLocalTime } from './attendanceTime'
import {
  FALLBACK_POLICY, minutesOfDay, type AttendancePolicyRules,
} from './attendancePolicy'

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

/** A shift is assumed to fit inside this; past it, a check-out is another day's. */
const MAX_SHIFT_MS = 16 * MS_PER_HOUR

export type DayStatus =
  | 'present' | 'half_day' | 'absent' | 'on_leave'
  | 'holiday' | 'day_off' | 'future' | 'not_added'

export interface AttendanceDayContext {
  events: any[]
  leaves: any[]
  holidayDates: Set<string>
  /** Today as YYYY-MM-DD; later days are "future" rather than absent. */
  today: string
  /** Rules for an employee. Defaults to the fallback policy. */
  policyFor?: (userId: number) => AttendancePolicyRules
  /**
   * The first day an employee could have been recorded, as YYYY-MM-DD.
   * Before it, a blank day is "not added", never an absence. Undefined means
   * no enrolment is known, so no day can be called an absence.
   */
  enrolledFrom?: (userId: number) => string | null
  /** Built on demand; see indexEvents. */
  _index?: Map<string, any[]>
}

// ── Looking events up ────────────────────────────────────────────────────────
// The grid asks about every employee on every day of a month. Scanning the
// whole event list per cell is 31,000 passes over thousands of rows, so the
// events are bucketed once by employee and local day.

const dayKey = (userId: number | string, dateStr: string) => `${userId}|${dateStr}`

export const indexEvents = (events: any[]): Map<string, any[]> => {
  const index = new Map<string, any[]>()
  for (const event of events || []) {
    const date = eventLocalDate(event?.event_time, event?.timezone)
    if (!date) continue
    const key = dayKey(event.user_id, date)
    const bucket = index.get(key)
    if (bucket) bucket.push(event)
    else index.set(key, [event])
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => String(a.event_time).localeCompare(String(b.event_time)))
  }
  return index
}

/** Every event for one employee on one day, at that employee's own location. */
export const eventsForDay = (ctx: AttendanceDayContext, userId: number, dateStr: string) => {
  if (!ctx._index) ctx._index = indexEvents(ctx.events)
  return ctx._index.get(dayKey(userId, dateStr)) ?? []
}

const policyOf = (ctx: AttendanceDayContext, userId: number) =>
  ctx.policyFor?.(userId) ?? FALLBACK_POLICY

// ── Day classification ───────────────────────────────────────────────────────

const isOnLeave = (ctx: AttendanceDayContext, userId: number, dateStr: string) =>
  ctx.leaves.some((l: any) =>
    l.user_id === userId && dateStr >= l.start_date && dateStr <= l.end_date)

/** A day the employee was expected to work, and which has already happened. */
export const isWorkingDay = (ctx: AttendanceDayContext, dateStr: string) => {
  const dow = dayOfWeek(dateStr)
  return dow !== 0 && dow !== 6 && !ctx.holidayDates.has(dateStr) && dateStr <= ctx.today
}

/**
 * Pair each break_start with the break_end that follows it.
 *
 * An unclosed break contributes nothing rather than running to the end of the
 * day: someone who forgot to scan back in should not show a nine-hour lunch.
 */
export const breakMillis = (dayEvents: any[]) => {
  let total = 0
  let openedAt: number | null = null
  for (const event of dayEvents) {
    const { epochMs } = eventLocalParts(event.event_time, event.timezone)
    if (Number.isNaN(epochMs)) continue
    if (event.event_type === 'break_start' && openedAt === null) {
      openedAt = epochMs
    } else if (event.event_type === 'break_end' && openedAt !== null) {
      total += Math.max(0, epochMs - openedAt)
      openedAt = null
    }
  }
  return total
}

export const hoursLabel = (ms: number) => {
  if (!ms || ms <= 0) return '—'
  const hours = Math.floor(ms / MS_PER_HOUR)
  const minutes = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE)
  if (minutes === 60) return `${hours + 1}h`
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

export interface SheetRow {
  date: string
  status: DayStatus
  /** Wall-clock check-in at the employee's location, HH:MM, or '' if none. */
  checkIn: string
  checkOut: string
  /** True when the check-out fell on the following calendar day. */
  checkOutNextDay: boolean
  /** A check-in exists but no check-out has been paired to it. */
  openShift: boolean
  /** Arrived later than the shift start plus its grace. */
  late: boolean
  /** This day is where a run of late arrivals hit the policy's limit. */
  lateStrike: boolean
  breakMs: number
  workedMs: number
  eventCount: number
  needsReview: boolean
}

/**
 * One row per day in the range.
 *
 * Two things here are decisions rather than arithmetic.
 *
 * The overnight shift: a 6PM-3AM night starts on one calendar day and ends on
 * the next, so a day holding a check-in but no check-out borrows the first
 * check-out from the following morning when it is later and within
 * MAX_SHIFT_MS. That event is then withheld from the morning it physically
 * happened on, or every night would count twice -- once properly, and again
 * as a stray present with no check-in and no hours.
 *
 * The open shift: somebody who scanned in and has not scanned out is present,
 * not half a day. Today that is simply the normal state of affairs mid-shift,
 * and on a past day a missed scan is a record-keeping failure, not evidence
 * they went home early. Hours are only judged when both ends are known.
 */
export const buildSheetRows = (
  ctx: AttendanceDayContext,
  userId: number,
  days: string[],
): SheetRow[] => {
  const policy = policyOf(ctx, userId)
  const fullDayMs = policy.workHoursPerDay * MS_PER_HOUR
  const earlyGraceMs = policy.earlyDepartureGraceMinutes * MS_PER_MINUTE
  const shiftStartMinutes = minutesOfDay(policy.shiftStart)
  const enrolledFrom = ctx.enrolledFrom?.(userId) ?? null

  const byDay = new Map<string, any[]>(days.map(date => [date, eventsForDay(ctx, userId, date)]))

  // Pass one: decide which check-outs belong to the previous evening.
  const borrowed = new Map<string, any>()
  const lent = new Set<unknown>()
  days.forEach((date, index) => {
    const dayEvents = byDay.get(date) ?? []
    const inEvent = dayEvents.find((e: any) => e.event_type === 'check_in')
    if (!inEvent || dayEvents.some((e: any) => e.event_type === 'check_out')) return
    if (index + 1 >= days.length) return

    const nextOut = (byDay.get(days[index + 1]) ?? [])
      .find((e: any) => e.event_type === 'check_out' && !lent.has(e.id))
    if (!nextOut) return

    const startMs = eventLocalParts(inEvent.event_time, inEvent.timezone).epochMs
    const endMs = eventLocalParts(nextOut.event_time, nextOut.timezone).epochMs
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return
    if (endMs <= startMs || endMs - startMs > MAX_SHIFT_MS) return

    borrowed.set(date, nextOut)
    lent.add(nextOut.id)
  })

  // Pass two: build each day from the events it owns, carrying the run of
  // consecutive late arrivals forward as we go.
  let lateRun = 0

  return days.map(date => {
    const dayEvents = (byDay.get(date) ?? []).filter((e: any) => !lent.has(e.id))
    const inEvent = dayEvents.find((e: any) => e.event_type === 'check_in')
    const borrowedOut = borrowed.get(date)
    const ownOut = [...dayEvents].reverse().find((e: any) => e.event_type === 'check_out')
    const outEvent = ownOut ?? borrowedOut

    const breakMs = breakMillis(dayEvents)
    const startMs = inEvent ? eventLocalParts(inEvent.event_time, inEvent.timezone).epochMs : Number.NaN
    const endMs = outEvent ? eventLocalParts(outEvent.event_time, outEvent.timezone).epochMs : Number.NaN
    const bothEnds = !Number.isNaN(startMs) && !Number.isNaN(endMs)
    const workedMs = bothEnds ? Math.max(0, Math.max(0, endMs - startMs) - breakMs) : 0

    const checkIn = inEvent ? eventLocalTime(inEvent.event_time, inEvent.timezone) : ''
    const attended = dayEvents.some((e: any) =>
      e.event_type === 'check_in' || e.event_type === 'check_out') || Boolean(borrowedOut)

    // Lateness is only knowable with a pinned shift start and a check-in.
    const arrivalMinutes = minutesOfDay(checkIn)
    const late = Boolean(
      attended && shiftStartMinutes !== null && arrivalMinutes !== null
      && arrivalMinutes > shiftStartMinutes + policy.lateGraceMinutes,
    )

    let status: DayStatus
    let lateStrike = false

    const dow = dayOfWeek(date)
    if (ctx.holidayDates.has(date)) {
      status = 'holiday'
    } else if (dow === 0 || dow === 6) {
      status = 'day_off'
    } else if (isOnLeave(ctx, userId, date)) {
      status = 'on_leave'
    } else if (attended) {
      if (late) {
        lateRun += 1
        if (lateRun >= policy.consecutiveLateLimit && policy.lateStrikeAction !== 'none') {
          lateStrike = true
          lateRun = 0
        }
      } else {
        lateRun = 0
      }

      if (lateStrike && policy.lateStrikeAction === 'full_day') {
        status = 'absent'
      } else if (lateStrike && policy.lateStrikeAction === 'half_day') {
        status = 'half_day'
      } else if (!bothEnds) {
        // Open shift: present, and flagged elsewhere as incomplete.
        status = 'present'
      } else {
        status = workedMs + earlyGraceMs >= fullDayMs ? 'present' : 'half_day'
      }
    } else if (date > ctx.today) {
      status = 'future'
    } else if (!enrolledFrom || date < enrolledFrom) {
      // No way for this person to have been recorded on this day, so there is
      // nothing to hold against them.
      status = 'not_added'
    } else {
      status = 'absent'
      lateRun = 0
    }

    return {
      date,
      status,
      checkIn,
      checkOut: outEvent ? eventLocalTime(outEvent.event_time, outEvent.timezone) : '',
      checkOutNextDay: Boolean(borrowedOut) && outEvent === borrowedOut,
      openShift: Boolean(inEvent) && !outEvent,
      late,
      lateStrike,
      breakMs,
      workedMs,
      eventCount: dayEvents.length + (borrowedOut && outEvent === borrowedOut ? 1 : 0),
      needsReview: dayEvents.some((e: any) => e.verification_status === 'needs_review'),
    }
  })
}

/**
 * Status for one employee on one day.
 *
 * Built from the same row machinery, so a cell in the grid and a row in the
 * sheet can never disagree. The run of late arrivals is counted from the
 * start of the surrounding range the caller passes.
 */
export const attendanceDayStatus = (
  ctx: AttendanceDayContext,
  userId: number,
  dateStr: string,
  range?: string[],
): DayStatus => {
  const days = range ?? [dateStr]
  const rows = buildSheetRows(ctx, userId, days)
  return rows.find(row => row.date === dateStr)?.status ?? 'not_added'
}
