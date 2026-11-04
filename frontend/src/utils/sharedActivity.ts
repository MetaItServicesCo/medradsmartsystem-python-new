/**
 * When the user was last active in any open tab of the app.
 *
 * Each tab watches only its own page, so a tab left in the background used to
 * end the whole session for inactivity - and send the user back to its old
 * screen on signing in - while they were working in another tab. Every tab
 * records its activity here and reads the latest before treating the session
 * as idle.
 */

const KEY = 'medrad:last-activity'

export const recordActivity = (at = Date.now()) => {
  try {
    window.localStorage.setItem(KEY, String(at))
  } catch {
    // Storage blocked: each tab then judges inactivity on its own, as before.
  }
}

/** The latest activity in any tab, or `fallback` if none is recorded or it is older. */
export const lastActivityAnywhere = (fallback: number) => {
  try {
    return Math.max(fallback, Number(window.localStorage.getItem(KEY)) || 0)
  } catch {
    return fallback
  }
}
