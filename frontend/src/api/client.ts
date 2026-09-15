import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const configuredApiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

/**
 * Production previously sent every REST request to api.<site>, even though the
 * main origin already proxies /api/v1. That added a second DNS/TLS connection,
 * CORS preflights, and bypassed the compressed Cloudflare route. Keep the
 * configured API origin for uploads and WebSockets, but use the same-origin
 * proxy for REST when the configured host is the API subdomain of this site.
 */
const resolveRestApiBase = (): string => {
  if (typeof window === 'undefined' || !/^https?:\/\//i.test(configuredApiBase)) {
    return configuredApiBase
  }

  try {
    const configuredUrl = new URL(configuredApiBase)
    const isApiSubdomainForCurrentSite =
      configuredUrl.protocol === window.location.protocol
      && configuredUrl.hostname === `api.${window.location.hostname}`

    if (isApiSubdomainForCurrentSite) {
      return configuredUrl.pathname.replace(/\/$/, '') || '/api/v1'
    }
  } catch {
    // Axios will surface an invalid configured URL using its normal error path.
  }

  return configuredApiBase
}

/**
 * The address for a realtime socket under the API, e.g. `/ws/<token>`.
 *
 * Uses the configured API origin, like uploads. A relative base ("/api/v1")
 * is resolved against this page, with wss on https pages: a relative path
 * handed to `new WebSocket` is not a valid socket address in every browser.
 */
export const realtimeUrl = (path: string): string => {
  const base = configuredApiBase.replace(/\/$/, '')
  if (/^https?:\/\//i.test(base)) return `${base.replace(/^http/i, 'ws')}${path}`
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${base.startsWith('/') ? base : `/${base}`}${path}`
}

const apiClient = axios.create({
  baseURL: resolveRestApiBase(),
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
