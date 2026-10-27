/**
 * Turning raw attendance events into something HR can read.
 *
 * Kept apart from the React page on purpose. This is the part that decides
 * whether somebody was at work and for how long, which is the part that has to
 * be right and the part worth testing; the page around it is just a table.
 *
 * Both the month grid and the single-employee sheet read through here, so the
 * two views cannot disagree about whether somebody turned up.
 */
import { dayOfWeek, eventLocalDate, eventLocalParts, eventLocalTime } from './attendanceTime'

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

/** A shift is assumed to fit inside this; past it, a check-out is somebody else's day. */
const MAX_SHIFT_MS = 16 * MS_PER_HOUR

export interface AttendanceDayContext {
  events: any[]
  leaves: any[]
  holidayDates: Set<string>
  /** Today as YYYY-MM-DD; days after this are "future" rather than absent. */
  today: string
}

/** Every event for one employee on one day, at that employee's own location. */
export const eventsForDay = (ctx: AttendanceDayContext, userId: number, dateStr: string) =>
  ctx.events
    .filter((e: any) => e.user_id === userId && eventLocalDate(e.event_time, e.timezone) === dateStr)
    .sort((a: any, b: any) => String(a.event_time).localeCompare(String(b.event_time)))

/** Status for a day whose event list has already been worked out. */
export const dayStatusFromEvents = (
  ctx: AttendanceDayContext,
  userId: number,
  dateStr: string,
  dayEvents: any[],
): string => {
  const dow = dayOfWeek(dateStr)
  if (dow === 0 || dow === 6) return 'day_off'
  if (ctx.holidayDates.has(dateStr)) return 'holiday'
  const onLeave = ctx.leaves.some((l: any) =>
    l.user_id === userId && dateStr >= l.start_date && dateStr <= l.end_date
  )
  if (onLeave) return 'on_leave'

  // Events win over "future": if somebody scanned, they were here, whatever
  // the viewer's clock says about which day it is.
  if (dayEvents.length === 0) return dateStr > ctx.today ? 'future' : 'not_added'
  // A check-out on its own still means they were here. Requiring a check-in
  // marked anyone whose arrival scan failed as absent for the whole day.
  const wasPresent = dayEvents.some((e: any) =>
    e.event_type === 'check_in' || e.event_type === 'check_out')
  return wasPresent ? 'present' : 'not_added'
}

export const attendanceDayStatus = (
  ctx: AttendanceDayContext,
  userId: number,
  dateStr: string,
): string => dayStatusFromEvents(ctx, userId, dateStr, eventsForDay(ctx, userId, dateStr))

/** A day the employee was expected to work, and which has already happened. */
export const isWorkingDay = (ctx: AttendanceDayContext, dateStr: string) => {
  const dow = dayOfWeek(dateStr)
  return dow !== 0 && dow !== 6 && !ctx.holidayDates.has(dateStr) && dateStr <= ctx.today
}

/**
 * Pair each break_start with the break_end that follows it.
 *
 * An unclosed break contributes nothing rather than running to the end of the
 * day: someone who forgot to scan back in should not show as having taken a
 * nine-hour lunch.
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
  status: string
  /** Wall-clock check-in at the employee's location, HH:MM, or '' if none. */
  checkIn: string
  checkOut: string
  /** True when the check-out fell on the following calendar day. */
  checkOutNextDay: boolean
  breakMs: number
  workedMs: number
  eventCount: number
  needsReview: boolean
}

/**
 * One row per day in the range.
 *
 * The overnight case is the one that matters: the 6PM-3AM shift starts on one
 * calendar day and ends on the next, so a day holding a check-in but no
 * check-out borrows the first check-out from the following morning, provided
 * that check-out is later and lands within MAX_SHIFT_MS.
 *
 * A borrowed check-out is then removed from the morning it physically happened
 * on. Otherwise every night of that shift would be counted twice: once as the
 * evening it belongs to, and again as a stray "present" the next morning with
 * no check-in and no hours.
 */
export const buildSheetRows = (
  ctx: AttendanceDayContext,
  userId: number,
  days: string[],
): SheetRow[] => {
  const byDay = new Map<string, any[]>(
    days.map(date => [date, eventsForDay(ctx, userId, date)])
  )

  // Pass one: decide which check-outs belong to the previous evening.
  const borrowed = new Map<string, any>()   // date that borrows -> the event
  const lent = new Set<unknown>()           // ids of events given away
  days.forEach((date, index) => {
    const dayEvents = byDay.get(date) ?? []
    const inEvent = dayEvents.find((e: any) => e.event_type === 'check_in')
    const ownOut = dayEvents.find((e: any) => e.event_type === 'check_out')
    if (!inEvent || ownOut || index + 1 >= days.length) return

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

  // Pass two: build each row from the events it actually owns.
  return days.map(date => {
    const dayEvents = (byDay.get(date) ?? []).filter((e: any) => !lent.has(e.id))
    const status = dayStatusFromEvents(ctx, userId, date, dayEvents)

    const inEvent = dayEvents.find((e: any) => e.event_type === 'check_in')
    const borrowedOut = borrowed.get(date)
    const outEvent = [...dayEvents].reverse().find((e: any) => e.event_type === 'check_out')
      ?? borrowedOut

    const breakMs = breakMillis(dayEvents)
    const startMs = inEvent ? eventLocalParts(inEvent.event_time, inEvent.timezone).epochMs : Number.NaN
    const endMs = outEvent ? eventLocalParts(outEvent.event_time, outEvent.timezone).epochMs : Number.NaN
    const span = !Number.isNaN(startMs) && !Number.isNaN(endMs) ? Math.max(0, endMs - startMs) : 0

    return {
      date,
      status,
      checkIn: inEvent ? eventLocalTime(inEvent.event_time, inEvent.timezone) : '',
      checkOut: outEvent ? eventLocalTime(outEvent.event_time, outEvent.timezone) : '',
      checkOutNextDay: Boolean(borrowedOut) && outEvent === borrowedOut,
      breakMs,
      workedMs: Math.max(0, span - breakMs),
      eventCount: dayEvents.length + (borrowedOut && outEvent === borrowedOut ? 1 : 0),
      needsReview: dayEvents.some((e: any) => e.verification_status === 'needs_review'),
    }
  })
}
