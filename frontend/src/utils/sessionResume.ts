/**
 * Where someone was when the system signed them out, so signing back in can
 * return them there.
 *
 * Remembered only when the session ends for inactivity (useIdleLogout) - not
 * when someone signs out on purpose, which also forgets anything remembered
 * (another open tab may have left a place behind) - and given back only to
 * the same user, within a day. The place is the page's
 * address: the page, its tab, filters and the record in focus, as far as the
 * page keeps them in its address. Anything typed and not yet saved is not.
 */

const KEY = 'medrad:resume-after-signout'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

type Place = { userId: number; path: string; at: number }

const inApp = (path: string) =>
  path.startsWith('/') && !path.startsWith('//') && !/^\/(login|landing)?(?:[?#]|$)/.test(path)

export const rememberSessionPlace = (userId: number | null | undefined) => {
  if (!userId || typeof window === 'undefined') return
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!inApp(path)) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ userId, path, at: Date.now() } satisfies Place))
  } catch {
    // Storage full or blocked: signing back in simply opens the dashboard.
  }
}

/** Signing out on purpose: the next sign-in opens the dashboard. */
export const forgetSessionPlace = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: nothing could have been remembered either.
  }
}

/** The remembered place for this user, once; anything else is discarded. */
export const takeSessionPlace = (userId: number | null | undefined): string | null => {
  if (typeof window === 'undefined') return null
  let place: Place | null = null
  try {
    place = JSON.parse(window.localStorage.getItem(KEY) || 'null')
    window.localStorage.removeItem(KEY)
  } catch {
    return null
  }
  if (!place || !userId || place.userId !== userId) return null
  if (typeof place.path !== 'string' || !inApp(place.path)) return null
  if (!(Date.now() - Number(place.at) < MAX_AGE_MS)) return null
  return place.path
}
