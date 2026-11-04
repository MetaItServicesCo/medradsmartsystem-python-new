import { useEffect } from 'react'
import apiClient from '@/api/client'
import { useAuthStore } from '@/stores/authStore'

// The same signals of someone working as useIdleLogout listens for.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll', 'click'] as const
const LISTENER_OPTS: AddEventListenerOptions = { capture: true, passive: true }
const CHECK_EVERY_MS = 30_000
const REFRESH_TIMEOUT_MS = 15_000

// How long a token lasts, from its own claims (exp - iat), in ms; null when
// it cannot be read.
const tokenLifetimeMs = (token: string): number | null => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')))
    const lifetime = (Number(claims.exp) - Number(claims.iat)) * 1000
    return lifetime > 0 ? lifetime : null
  } catch {
    return null
  }
}

/**
 * Keeps the session of someone who is working alive.
 *
 * A sign-in token lasts a fixed time, so on its own it signed people out in
 * the middle of their work. Once half of it has passed, and the user has been
 * active within `idleTimeoutMs`, the token is exchanged for a fresh one. An
 * idle user's token is left alone, so useIdleLogout still ends idle sessions
 * exactly as before. Mount once inside the authenticated shell.
 */
export const useSessionRenewal = (idleTimeoutMs: number) => {
  useEffect(() => {
    let lastActivity = Date.now()
    let inFlight = false

    const renewIfDue = () => {
      const { isAuthenticated, token, tokenReceivedAt } = useAuthStore.getState()
      if (!isAuthenticated || !token || inFlight) return
      if (Date.now() - lastActivity > idleTimeoutMs) return
      const lifetime = tokenLifetimeMs(token)
      // A session from before this was added has no arrival time: renew it.
      const due = !lifetime || !tokenReceivedAt || Date.now() - tokenReceivedAt >= lifetime / 2
      if (!due) return
      inFlight = true
      // Time-limited, so a request lost on the network cannot stop renewals.
      apiClient.post('/auth/refresh', undefined, { timeout: REFRESH_TIMEOUT_MS })
        .then(res => {
          const fresh = res.data?.access_token
          // Only if this is still the session the request was made for.
          if (fresh && useAuthStore.getState().token === token) useAuthStore.getState().renewToken(fresh)
        })
        // A refused refresh changes nothing here: a session the server no
        // longer accepts is ended by the API client like any other request.
        .catch(() => undefined)
        .finally(() => { inFlight = false })
    }

    let lastSeen = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastSeen < 1000) return
      lastSeen = now
      lastActivity = now
      renewIfDue()
    }

    ACTIVITY_EVENTS.forEach(evt => document.addEventListener(evt, onActivity, LISTENER_OPTS))
    const timer = window.setInterval(renewIfDue, CHECK_EVERY_MS)
    renewIfDue()

    return () => {
      window.clearInterval(timer)
      ACTIVITY_EVENTS.forEach(evt => document.removeEventListener(evt, onActivity, { capture: true }))
    }
  }, [idleTimeoutMs])
}
