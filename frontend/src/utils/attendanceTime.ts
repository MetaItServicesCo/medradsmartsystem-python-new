/**
 * Reading attendance timestamps.
 *
 * Two separate problems live here, and conflating them is what went wrong
 * before:
 *
 * 1. The API serialises `datetime.utcnow()` with no zone designator, and
 *    JavaScript reads a bare ISO string as LOCAL time. Every read has to mark
 *    the string as UTC first, or a Karachi check-in at 18:46 displays as
 *    13:46.
 *
 * 2. Which calendar day an event belongs to is a different question, and the
 *    answer is the day where the employee was standing -- not UTC, and not
 *    wherever HR happens to be sitting. Slicing the first ten characters off
 *    the UTC string puts anything before 05:00 in Karachi on the previous
 *    day, which is squarely inside the 6PM-3AM shift.
 *
 * Each event carries the capturing device's IANA zone for exactly this. Older
 * rows all carry the previously hardcoded "Asia/Karachi", which is correct for
 * them, so this works on historical data too.
 */

export const DEFAULT_EVENT_TIMEZONE = 'Asia/Karachi'

/** Mark a naive timestamp as UTC, leaving an already-zoned one alone. */
export const asUtc = (value: string) =>
  /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const buildFormatter = (timeZone: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // h23 rather than hour12:false, which renders midnight as "24" on some engines.
  hourCycle: 'h23',
})

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const key = timeZone || DEFAULT_EVENT_TIMEZONE
  const cached = formatterCache.get(key)
  if (cached) return cached

  let formatter: Intl.DateTimeFormat
  try {
    formatter = buildFormatter(key)
  } catch {
    // An unrecognised zone -- a mistyped label, or one this browser has no
    // tzdata for -- must not blank out a whole attendance sheet.
    try {
      formatter = buildFormatter(DEFAULT_EVENT_TIMEZONE)
    } catch {
      formatter = buildFormatter('UTC')
    }
  }
  formatterCache.set(key, formatter)
  return formatter
}

export interface EventLocalParts {
  /** Calendar date at the event's own location, as YYYY-MM-DD. */
  date: string
  /** Wall-clock time at the event's own location, as HH:MM. */
  time: string
  /** Milliseconds since epoch, or NaN when the value could not be read. */
  epochMs: number
}

const EMPTY: EventLocalParts = { date: '', time: '', epochMs: Number.NaN }

/** Split a stored timestamp into the date and time a person there would read. */
export const eventLocalParts = (
  value: string | null | undefined,
  timeZone?: string | null,
): EventLocalParts => {
  if (!value) return EMPTY
  const instant = new Date(asUtc(value))
  const epochMs = instant.getTime()
  if (Number.isNaN(epochMs)) return EMPTY

  const parts = formatterFor(timeZone || DEFAULT_EVENT_TIMEZONE).formatToParts(instant)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''

  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
    epochMs,
  }
}

/** The calendar date, at the event's own location, that an event falls on. */
export const eventLocalDate = (value: string | null | undefined, timeZone?: string | null) =>
  eventLocalParts(value, timeZone).date

/** The wall-clock time, at the event's own location, that an event happened at. */
export const eventLocalTime = (value: string | null | undefined, timeZone?: string | null) =>
  eventLocalParts(value, timeZone).time

/**
 * Day of week for a YYYY-MM-DD string, 0 = Sunday.
 *
 * `new Date('2026-10-05').getDay()` reads the string as UTC midnight and then
 * reports the day in the *viewer's* zone, so west of Greenwich every date
 * slides back one and the weekend columns land on the wrong days. Reading it
 * back in UTC keeps a calendar date meaning the same thing everywhere.
 */
export const dayOfWeek = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()

/** Today's calendar date in a given zone, as YYYY-MM-DD. */
export const todayInZone = (timeZone?: string | null) =>
  eventLocalDate(new Date().toISOString(), timeZone)

/** Every YYYY-MM-DD from `from` to `to` inclusive. Empty if the range is inverted. */
export const datesBetween = (from: string, to: string): string[] => {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
  const days: string[] = []
  const DAY_MS = 86_400_000
  // A guard rather than a limit anyone should reach: two years of columns is
  // already past the point the table is readable.
  for (let t = start; t <= end && days.length < 750; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

/**
 * Widen a local-day range into the UTC range that is guaranteed to contain it.
 *
 * The API filters on the stored UTC instant, so asking it for exactly the days
 * we want drops events at both edges: 01:00 on the first of the month in
 * Karachi is 20:00 UTC on the last day of the previous one. A day of padding
 * either side covers every real-world offset; the caller then filters by local
 * date and discards the surplus.
 */
export const paddedUtcRange = (from: string, to: string) => {
  const DAY_MS = 86_400_000
  const shift = (dateStr: string, days: number) =>
    new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * DAY_MS)
      .toISOString()
      .slice(0, 10)
  return { date_from: shift(from, -1), date_to: shift(to, 1) }
}
