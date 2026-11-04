import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { rememberSessionPlace } from '@/utils/sessionResume'
import { lastActivityAnywhere, recordActivity } from '@/utils/sharedActivity'

// Any of these anywhere in the app counts as the user being active.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll', 'click'] as const
// Capture so activity inside scrollable panels / inner elements still resets the timer.
const LISTENER_OPTS: AddEventListenerOptions = { capture: true, passive: true }

/**
 * Logs the signed-in user out (and returns them to the login page) after
 * `timeoutMs` of no interaction - in any open tab of the app, so a tab left in
 * the background does not end the session of someone working in another.
 * Mount once inside the authenticated shell.
 */
export const useIdleLogout = (timeoutMs: number) => {
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    let lastActivity = Date.now()

    const schedule = (delay = timeoutMs) => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(forceLogout, delay)
    }

    const forceLogout = () => {
      window.clearTimeout(timerRef.current)
      if (!useAuthStore.getState().isAuthenticated) return
      // Still in use in another tab: wait out the rest of the idle time.
      const idleFor = Date.now() - lastActivityAnywhere(lastActivity)
      if (idleFor < timeoutMs) {
        schedule(timeoutMs - idleFor)
        return
      }
      // Signing back in returns the user here.
      rememberSessionPlace(useAuthStore.getState().user?.id)
      useAuthStore.getState().logout()
      // Full navigation clears in-memory/cached state, matching the 401 handler.
      window.location.href = '/login'
    }

    // Throttle rescheduling so a burst of mousemove events isn't wasteful.
    let lastReset = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastReset < 1000) return
      lastReset = now
      lastActivity = now
      recordActivity(now)
      schedule()
    }

    ACTIVITY_EVENTS.forEach(evt => document.addEventListener(evt, onActivity, LISTENER_OPTS))
    recordActivity(lastActivity)
    schedule()

    return () => {
      window.clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(evt => document.removeEventListener(evt, onActivity, { capture: true }))
    }
  }, [timeoutMs])
}
