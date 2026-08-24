import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export interface RecentActivityRecord {
  id: string
  key: string
  label: string
  message?: string
  updatedAt: number
  pathname: string
  search: string
  scope: string
}

export interface FocusRecordOptions {
  message?: string
  announce?: boolean
  query?: Record<string, string | number | null | undefined>
  pathname?: string
  syncUrl?: boolean
}

interface LocateFeedback {
  activityId: string
  state: 'opening' | 'found' | 'missing'
}

interface ListContextValue {
  scope: string
  recentActivities: RecentActivityRecord[]
  noticeActivity: RecentActivityRecord | null
  locateFeedback: LocateFeedback | null
  highlightedRecordKey: string | null
  // Kept as the publishing API so existing successful mutation handlers remain compatible.
  focusRecord: (key: string | number, label: string, options?: FocusRecordOptions) => void
  showActivity: (activityOrId: RecentActivityRecord | string) => void
  dismissActivity: (id: string) => void
  dismissNotice: () => void
  clearRecentActivities: () => void
  isFocused: (key: string | number) => boolean
}

const ListContext = createContext<ListContextValue | null>(null)
const LEGACY_STORAGE_PREFIX = 'medrad:list-context:'
const STORAGE_PREFIX = 'medrad:recent-activity:'
const MAX_ACTIVITY_AGE_MS = 24 * 60 * 60 * 1000
const MAX_ACTIVITIES = 5
const LOCATE_DELAYS_MS = [80, 220, 500, 1000, 1800, 3000]

const scopeFromPath = (pathname: string) => pathname.split('/').filter(Boolean)[0] || 'dashboard'

const storageKeyFor = (userId?: number | null, facilityId?: number | null) => (
  `${STORAGE_PREFIX}${userId ?? 'anonymous'}:${facilityId ?? 'global'}`
)

const readStoredActivities = (storageKey: string): RecentActivityRecord[] => {
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentActivityRecord[]
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - MAX_ACTIVITY_AGE_MS
    return parsed
      .filter(activity => activity?.id && activity?.key && Number(activity.updatedAt || 0) >= cutoff)
      .slice(0, MAX_ACTIVITIES)
  } catch {
    return []
  }
}

const findRecordRow = (key: string) => {
  const escapedKey = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(key)
    : key.replace(/"/g, '\\"')
  return document.querySelector<HTMLElement>(`[data-list-row-key="${escapedKey}"]`)
}

const revealRecord = (key: string) => {
  const row = findRecordRow(key)
  if (!row) return false

  const rect = row.getBoundingClientRect()
  const scrollPanel = row.closest<HTMLElement>('.list-scroll-panel')
    || document.querySelector<HTMLElement>('.app-main-scroll')
  const viewportTop = scrollPanel?.getBoundingClientRect().top ?? 0
  const viewportBottom = scrollPanel?.getBoundingClientRect().bottom ?? window.innerHeight
  const fullyVisible = rect.top >= viewportTop && rect.bottom <= viewportBottom

  // An explicit "Show in list" may scroll, but a visible row never moves.
  if (!fullyVisible) row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  row.focus({ preventScroll: true })
  return true
}

export const ListContextProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const scope = scopeFromPath(location.pathname)
  const storageKey = storageKeyFor(user?.id, user?.facility_id)
  const [recentActivities, setRecentActivities] = useState<RecentActivityRecord[]>(() => readStoredActivities(storageKey))
  const [noticeActivityId, setNoticeActivityId] = useState<string | null>(null)
  const [locateFeedback, setLocateFeedback] = useState<LocateFeedback | null>(null)
  const [highlightedRecordKey, setHighlightedRecordKey] = useState<string | null>(null)
  const locateRequestRef = useRef(0)
  const highlightTimerRef = useRef<number | null>(null)

  const persistActivities = useCallback((activities: RecentActivityRecord[]) => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(activities))
    } catch {
      // Activity continuity is progressive enhancement; operations never depend on storage.
    }
  }, [storageKey])

  useEffect(() => {
    setRecentActivities(readStoredActivities(storageKey))
    setNoticeActivityId(null)
    setLocateFeedback(null)
    setHighlightedRecordKey(null)
    locateRequestRef.current += 1

    // Legacy entries were not user-scoped, so they are deliberately discarded.
    try {
      Object.keys(window.sessionStorage).forEach(key => {
        if (key.startsWith(LEGACY_STORAGE_PREFIX)) window.sessionStorage.removeItem(key)
      })
    } catch {
      // No-op when session storage is unavailable.
    }
  }, [storageKey])

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
  }, [])

  const focusRecord = useCallback((
    rawKey: string | number,
    label: string,
    options: FocusRecordOptions = {},
  ) => {
    const key = String(rawKey)
    const pathname = options.pathname || location.pathname
    const params = new URLSearchParams(pathname === location.pathname ? location.search : '')
    params.set('focus', key)
    Object.entries(options.query || {}).forEach(([name, value]) => {
      if (value === null || value === undefined || value === '') params.delete(name)
      else params.set(name, String(value))
    })

    const activity: RecentActivityRecord = {
      id: `${Date.now()}-${key}`,
      key,
      label,
      message: options.message,
      updatedAt: Date.now(),
      pathname,
      search: params.toString() ? `?${params.toString()}` : '',
      scope: scopeFromPath(pathname),
    }

    setRecentActivities(current => {
      const next = [activity, ...current.filter(item => item.key !== key)].slice(0, MAX_ACTIVITIES)
      persistActivities(next)
      return next
    })
    setNoticeActivityId(activity.id)
    setLocateFeedback(null)

    // Explicit compatibility escape hatch. Normal activity publishing never navigates.
    if (options.syncUrl) {
      navigate({ pathname, search: activity.search }, { replace: true, state: location.state })
    }
  }, [location.pathname, location.search, location.state, navigate, persistActivities])

  const showActivity = useCallback((activityOrId: RecentActivityRecord | string) => {
    const activity = typeof activityOrId === 'string'
      ? recentActivities.find(item => item.id === activityOrId)
      : activityOrId
    if (!activity) return

    const requestId = locateRequestRef.current + 1
    locateRequestRef.current = requestId
    setNoticeActivityId(activity.id)
    setLocateFeedback({ activityId: activity.id, state: 'opening' })
    setHighlightedRecordKey(null)

    const target = `${activity.pathname}${activity.search}`
    const current = `${location.pathname}${location.search}`
    if (target !== current) navigate(target)

    let attempt = 0
    const locate = () => {
      if (locateRequestRef.current !== requestId) return
      if (revealRecord(activity.key)) {
        setHighlightedRecordKey(activity.key)
        setLocateFeedback({ activityId: activity.id, state: 'found' })
        if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = window.setTimeout(() => {
          setHighlightedRecordKey(currentKey => currentKey === activity.key ? null : currentKey)
          setLocateFeedback(currentFeedback => currentFeedback?.activityId === activity.id ? null : currentFeedback)
        }, 4000)
        return
      }
      if (attempt >= LOCATE_DELAYS_MS.length - 1) {
        setLocateFeedback({ activityId: activity.id, state: 'missing' })
        return
      }
      attempt += 1
      window.setTimeout(locate, LOCATE_DELAYS_MS[attempt] - LOCATE_DELAYS_MS[attempt - 1])
    }
    window.setTimeout(locate, LOCATE_DELAYS_MS[0])
  }, [location.pathname, location.search, navigate, recentActivities])

  const dismissActivity = useCallback((id: string) => {
    setRecentActivities(current => {
      const next = current.filter(activity => activity.id !== id)
      persistActivities(next)
      return next
    })
    setNoticeActivityId(current => current === id ? null : current)
    setLocateFeedback(current => current?.activityId === id ? null : current)
  }, [persistActivities])

  const clearRecentActivities = useCallback(() => {
    setRecentActivities([])
    setNoticeActivityId(null)
    setLocateFeedback(null)
    setHighlightedRecordKey(null)
    locateRequestRef.current += 1
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch {
      // No-op when storage is unavailable.
    }
  }, [storageKey])

  const value = useMemo<ListContextValue>(() => ({
    scope,
    recentActivities,
    noticeActivity: recentActivities.find(activity => activity.id === noticeActivityId) || null,
    locateFeedback,
    highlightedRecordKey,
    focusRecord,
    showActivity,
    dismissActivity,
    dismissNotice: () => {
      setNoticeActivityId(null)
      setLocateFeedback(null)
    },
    clearRecentActivities,
    isFocused: key => highlightedRecordKey === String(key),
  }), [
    clearRecentActivities,
    dismissActivity,
    focusRecord,
    highlightedRecordKey,
    locateFeedback,
    noticeActivityId,
    recentActivities,
    scope,
    showActivity,
  ])

  return <ListContext.Provider value={value}>{children}</ListContext.Provider>
}

export const useListContext = () => {
  const value = useContext(ListContext)
  if (!value) throw new Error('useListContext must be used within ListContextProvider')
  return value
}
