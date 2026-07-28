import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export interface ListFocusRecord {
  key: string
  label: string
  message?: string
  updatedAt: number
  announce?: boolean
}

interface FocusRecordOptions {
  message?: string
  announce?: boolean
  query?: Record<string, string | number | null | undefined>
  syncUrl?: boolean
}

interface ListContextValue {
  scope: string
  focusedRecord: ListFocusRecord | null
  focusRecord: (key: string | number, label: string, options?: FocusRecordOptions) => void
  clearFocusedRecord: () => void
  isFocused: (key: string | number) => boolean
  locateFocusedRecord: () => boolean
}

const ListContext = createContext<ListContextValue | null>(null)
const STORAGE_PREFIX = 'medrad:list-context:'
const MAX_CONTEXT_AGE_MS = 30 * 60 * 1000

const scopeFromPath = (pathname: string) => pathname.split('/').filter(Boolean)[0] || 'dashboard'

const readStoredContext = (scope: string): ListFocusRecord | null => {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${scope}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ListFocusRecord
    if (!parsed?.key || Date.now() - Number(parsed.updatedAt || 0) > MAX_CONTEXT_AGE_MS) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${scope}`)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const scrollToRecord = (key: string, behavior: ScrollBehavior = 'smooth') => {
  const escapedKey = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"')
  const row = document.querySelector<HTMLElement>(`[data-list-row-key="${escapedKey}"]`)
  if (!row) return false
  row.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
  row.focus({ preventScroll: true })
  return true
}

export const ListContextProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const scope = scopeFromPath(location.pathname)
  const [focusedRecord, setFocusedRecord] = useState<ListFocusRecord | null>(() => readStoredContext(scope))

  useEffect(() => {
    const stored = readStoredContext(scope)
    const params = new URLSearchParams(location.search)
    const urlFocus = params.get('focus')
    if (urlFocus) {
      setFocusedRecord(current => (
        current?.key === urlFocus
          ? current
          : stored?.key === urlFocus
            ? stored
            : { key: urlFocus, label: 'Focused record', updatedAt: Date.now() }
      ))
      return
    }
    setFocusedRecord(stored)
  }, [scope])

  useEffect(() => {
    if (!focusedRecord?.key) return undefined
    let cancelled = false
    let timer: number | undefined
    const retryDelays = [0, 120, 350, 800, 1600]

    const locateWhenRendered = (attempt: number) => {
      if (cancelled) return
      if (scrollToRecord(focusedRecord.key, attempt === 0 ? 'auto' : 'smooth')) return
      if (attempt < retryDelays.length - 1) {
        timer = window.setTimeout(
          () => locateWhenRendered(attempt + 1),
          retryDelays[attempt + 1] - retryDelays[attempt],
        )
      }
    }

    locateWhenRendered(0)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [focusedRecord?.key, location.pathname])

  const focusRecord = useCallback((
    rawKey: string | number,
    label: string,
    options: FocusRecordOptions = {},
  ) => {
    const key = String(rawKey)
    const nextRecord: ListFocusRecord = {
      key,
      label,
      message: options.message,
      announce: options.announce,
      updatedAt: Date.now(),
    }
    setFocusedRecord(nextRecord)
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(nextRecord))
    } catch {
      // Session storage is an enhancement; focus still works for this render.
    }

    if (!options.syncUrl && !options.query) return

    const params = new URLSearchParams(location.search)
    params.set('focus', key)
    Object.entries(options.query || {}).forEach(([name, value]) => {
      if (value === null || value === undefined || value === '') params.delete(name)
      else params.set(name, String(value))
    })
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true, state: location.state },
    )
  }, [location.pathname, location.search, location.state, navigate, scope])

  const clearFocusedRecord = useCallback(() => {
    setFocusedRecord(null)
    try {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${scope}`)
    } catch {
      // No-op when storage is unavailable.
    }
    const params = new URLSearchParams(location.search)
    params.delete('focus')
    navigate(
      { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true, state: location.state },
    )
  }, [location.pathname, location.search, location.state, navigate, scope])

  const value = useMemo<ListContextValue>(() => ({
    scope,
    focusedRecord,
    focusRecord,
    clearFocusedRecord,
    isFocused: key => focusedRecord?.key === String(key),
    locateFocusedRecord: () => focusedRecord ? scrollToRecord(focusedRecord.key) : false,
  }), [clearFocusedRecord, focusRecord, focusedRecord, scope])

  return <ListContext.Provider value={value}>{children}</ListContext.Provider>
}

export const useListContext = () => {
  const value = useContext(ListContext)
  if (!value) throw new Error('useListContext must be used within ListContextProvider')
  return value
}
